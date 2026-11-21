import * as THREE from 'three';
import type { MechDef, RigPart } from '../mechs/MechDef';
import type { MechPoseSource } from '../render/MechRenderer';
import { ActState } from '../combat/types';
import { clamp, wrapAngle } from '../core/MathUtil';
import { buildTurretInheritance, partLocalRotation, partReachOffset, type RigPose } from '../render/RigRotation';
import { breathLevel, flickerLevel } from '../render/EnergyFlicker';
import { glowMat, litMat, meshGrid, type MeshedGrid } from './VoxelKit';
import { voxelMechGrids, voxelMechJson } from './VoxelMechData';
import { WORLD_PER_PX, simX, simY, worldX, worldY } from './World';

/**
 * How far a machine turns toward the camera, in radians.
 *
 * The fight is a side-on plane, so a machine seen dead side-on is a profile —
 * a sprite with thickness. Turned a little toward the lens it shows its chest,
 * its near shoulder and the face of its weapon, which is the whole point of
 * having modelled them. Small enough that an arm aimed in the rig plane still
 * lands its muzzle within a few pixels of where the shot actually spawns.
 */
export const FACE_YAW = 0.42;

/** Nose-up trim on the mobile form, radians; the nose gun is levelled against it. */
const CRAFT_TRIM = 0.16;

/** See MechRenderer: the head arrives before the arms. */
const AIM_RATE_HEAD = 26;
const AIM_RATE_ARM = 12;
/** See MechRenderer: hands 5 logical px apart on a two-handed grip. */
const GRIP_SPACING = 5;

/** Parts that are painted light rather than built metal. */
const ENERGY_PARTS = new Set(['meleeEnergy', 'meleeArc']);

interface Node {
  def: RigPart;
  /** Placed at the pivot; carries the pose rotation. */
  group: THREE.Group;
  /** The breathing wrapper for a projected blade; equals `group` otherwise. */
  inner: THREE.Group;
  inheritsTurret: boolean;
  /** Pivot depth relative to the parent's, logical px. */
  z: number;
}

/** The swing a sword sequence drives the arm through; see `Combatant`'s helpers. */
export interface SwingPose {
  spin: number;
  weaponSpin: number;
  lean: number;
  reach: number;
  lift: number;
  grip: number;
}

/** Everything `VoxelMech.pose3` needs: a machine anywhere in a 3D yard. */
export interface Mech3Pose {
  /** Core position, world units. */
  x: number;
  y: number;
  z: number;
  /** Heading: the rig's forward, about world up. */
  yaw: number;
  /** Elevation of the weapons toward the target, radians, up positive. */
  aim: number;
  /** Lean into travel, radians, nose-down positive. */
  tilt: number;
  /** Roll into a strafe or a turn, radians. */
  roll: number;
  /** Extra roll during a transformation: the barrel roll it folds through. */
  flourish: number;
  /** 0 = mech form, 1 = mobile form. */
  mobile: number;
  transforming: boolean;
  /** Mobile form's nose pitch, radians, up positive. */
  pitch: number;
  thrust: number;
  walkPhase: number;
  stride: number;
  /** Airborne leg dangle, radians. */
  legSwing: number;
  swing: SwingPose | null;
  hitstop: boolean;
  bob: number;
  alive: boolean;
  satActive: boolean;
}

const GEOM = new Map<string, MeshedGrid>();

function partGeometry(mechId: string, part: string, voxelPx: number): MeshedGrid | null {
  const k = `${mechId}:${part}`;
  const hit = GEOM.get(k);
  if (hit) return hit;
  const grids = voxelMechGrids(mechId);
  const g = grids?.get(part);
  if (!g) return null;
  const m = meshGrid(g, voxelPx);
  GEOM.set(k, m);
  return m;
}

const _m = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const _c = new THREE.Color();

/**
 * One machine, drawn in voxels.
 *
 * The same rig `MechRenderer` builds out of sprites, rebuilt as a tree of
 * Three.js groups: every node sits at the pivot `MechDef.rig` gives it and
 * carries the rotation `partLocalRotation` computes, so arms track the target,
 * the chassis banks, legs stride and dangle, thrusters gimbal and swings sweep
 * exactly as they did. Only the art under each node changed — a voxelized copy
 * of the Blender part instead of a render of it.
 *
 * Coordinates inside the rig are **logical pixels** (x forward, y up), the same
 * numbers the rig is authored in; one scale on the bank group turns them into
 * world units. Facing is a mirror on the root, so the near arm stays the near
 * arm whichever way a machine faces — the 2D renderer's rule, kept on purpose.
 */
export class VoxelMech {
  readonly root = new THREE.Group();
  private readonly mirror = new THREE.Group();
  private readonly bank = new THREE.Group();
  private readonly nodes = new Map<string, Node>();
  private readonly def: MechDef;
  private readonly mat: THREE.MeshLambertMaterial;
  private readonly glow: THREE.MeshBasicMaterial;
  /** The projected blade's own light, so it can flicker without the eyes doing so. */
  private readonly energy: THREE.MeshBasicMaterial;
  private readonly meshes: THREE.Mesh[] = [];
  private hitFlash = 0;
  private energyPhase = 0;
  private aimHead = 0;
  private aimArm = 0;
  private aimInit = false;
  private lastFacing = 1;
  private shudder = 0;
  private alpha = 1;
  private deadSpin = 0;
  /** Facing the last sync drew, for effects that need to know. */
  facing = 1;

  constructor(def: MechDef, mechId: string = def.id) {
    this.def = def;
    this.mat = litMat().clone();
    this.mat.emissive = new THREE.Color(0, 0, 0);
    this.glow = glowMat().clone();
    this.energy = glowMat().clone();
    this.energy.transparent = true;
    this.energy.depthWrite = false;
    this.energy.blending = THREE.AdditiveBlending;

    this.root.add(this.mirror);
    this.mirror.add(this.bank);
    this.bank.scale.setScalar(def.rig.scale * WORLD_PER_PX);

    const json = voxelMechJson(mechId);
    const voxelPx = json?.voxelPx ?? 3;
    const inherits = buildTurretInheritance(def.rig.parts);
    const depthOf = (name: string): number => {
      const p = json?.parts[name];
      if (p?.origin) return p.origin[2];
      // Painted energy shares its hilt's pivot.
      if (ENERGY_PARTS.has(name)) return json?.parts.meleeWeapon?.origin?.[2] ?? 0;
      return 0;
    };

    for (const part of def.rig.parts) {
      const group = new THREE.Group();
      group.name = part.name;
      let inner = group;
      const geo = partGeometry(mechId, part.name, voxelPx);
      const isEnergy = ENERGY_PARTS.has(part.name);
      // A projected blade breathes from its root, so its art hangs off an inner
      // group pivoted on that root: scaling the inner group then leaves the root
      // where the emitter is. `anchor` is that root in logical px from the
      // sprite centre, y down.
      if (isEnergy && part.anchor) {
        inner = new THREE.Group();
        inner.position.set(part.anchor[0], -part.anchor[1], 0);
        group.add(inner);
      }
      if (geo) {
        const off = isEnergy && part.anchor ? new THREE.Vector3(-part.anchor[0], part.anchor[1], 0) : null;
        if (geo.lit) {
          const m = new THREE.Mesh(geo.lit, this.mat);
          m.castShadow = true;
          m.receiveShadow = true;
          if (off) m.position.copy(off);
          inner.add(m);
          this.meshes.push(m);
        }
        if (geo.glow) {
          const m = new THREE.Mesh(geo.glow, isEnergy ? this.energy : this.glow);
          if (off) m.position.copy(off);
          if (isEnergy) m.renderOrder = 5;
          inner.add(m);
          this.meshes.push(m);
        }
      }
      const parentDepth = part.parent ? depthOf(part.parent) : 0;
      this.nodes.set(part.name, {
        def: part,
        group,
        inner,
        inheritsTurret: inherits.get(part.name) ?? false,
        z: depthOf(part.name) - parentDepth,
      });
    }
    for (const part of def.rig.parts) {
      const node = this.nodes.get(part.name)!;
      const parent = part.parent ? this.nodes.get(part.parent) : null;
      (parent ? parent.group : this.bank).add(node.group);
      node.group.position.set(part.x, -part.y, node.z);
      node.group.rotation.z = -part.rotation * (Math.PI / 180);
    }

    this.setPartVisible('meleeWeapon', false);
    this.setPartVisible('meleeEnergy', false);
    this.setPartVisible('meleeArc', false);
  }

  get displayHeight(): number {
    return this.def.rig.chassisHeight;
  }

  flashHit(): void {
    this.hitFlash = 0.18;
  }

  /** Mirrors `MechRenderer.sync`: the same pose, the same smoothing, in 3D. */
  sync(c: MechPoseSource, x: number, y: number, dt: number): void {
    this.root.visible = c.alive || c.act === ActState.Dead;
    const facing = c.facing >= 0 ? 1 : -1;
    this.facing = facing;

    this.root.position.set(worldX(x), worldY(y), 0);
    this.mirror.scale.x = facing;
    this.root.rotation.set(0, facing > 0 ? -FACE_YAW : FACE_YAW, 0);

    const bankLocal = facing > 0 ? c.bank : -c.bank;
    const aimLocal = facing > 0 ? c.aim : wrapAngle(Math.PI - c.aim);
    const bob = Math.sin(c.bobPhase) * 1.6;
    this.bank.position.set(0, -bob * WORLD_PER_PX * this.def.rig.scale, 0);
    this.bank.rotation.z = -bankLocal;

    const aimTarget = wrapAngle(aimLocal - bankLocal);
    if (!this.aimInit || facing !== this.lastFacing) {
      this.aimHead = aimTarget;
      this.aimArm = aimTarget;
      this.aimInit = true;
      this.lastFacing = facing;
    } else {
      const k = (rate: number): number => 1 - Math.exp(-rate * dt);
      this.aimHead += wrapAngle(aimTarget - this.aimHead) * k(AIM_RATE_HEAD);
      this.aimArm += wrapAngle(aimTarget - this.aimArm) * k(AIM_RATE_ARM);
    }
    const turretRot = this.aimArm;
    const spinLocal = facing > 0 ? c.spin : -c.spin;
    const pose: RigPose = {
      turretRot,
      turretRotHead: this.aimHead,
      spin: spinLocal,
      weaponSpin: facing > 0 ? c.weaponSpin : -c.weaponSpin,
      lean: facing > 0 ? c.lean : -c.lean,
      reach: c.reach,
      lift: c.lift,
      thrust: c.thrust,
      meleeing: c.swinging,
      walkPhase: facing > 0 ? c.walkPhase : -c.walkPhase,
      stride: c.stride,
      legNear: facing > 0 ? c.legSwing[0] : -c.legSwing[0],
      legFar: facing > 0 ? c.legSwing[1] : -c.legSwing[1],
    };
    for (const node of this.nodes.values()) {
      node.group.rotation.z = -partLocalRotation(node.def, node.inheritsTurret, pose);
      const off = partReachOffset(node.def, node.inheritsTurret, pose);
      node.group.position.set(node.def.x + off.x, -(node.def.y + off.y), node.z);
    }
    this.applyTwoHandedGrip(c.grip, turretRot + spinLocal);
    this.animateEnergy(dt);

    // ---- surface state: flash, affliction, meter, refusal ----------------
    // The sprite renderer did these with alpha and tint. Voxels are solid, so
    // they are done with light instead: emissive on the hull, which reads the
    // same — a machine lit from inside by whatever is happening to it.
    const em = this.mat.emissive;
    em.setRGB(0, 0, 0);
    let bright = 1;
    const status = c.status.def;
    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
      if (Math.floor(this.hitFlash * 60) % 2 === 0) em.setRGB(0.85, 0.85, 0.85);
    } else if (status) {
      const pulse = 0.5 + Math.sin(c.bobPhase * 3.1) * 0.5;
      _c.setHex(status.tint);
      em.setRGB(_c.r, _c.g, _c.b).multiplyScalar(0.18 + pulse * 0.22);
    }
    if (c.satActive && this.hitFlash <= 0) {
      _c.setHex(this.def.tint.thruster);
      const k = 0.06 + (0.5 + Math.sin(c.bobPhase * 4) * 0.5) * 0.1;
      em.r += _c.r * k;
      em.g += _c.g * k;
      em.b += _c.b * k;
    }
    if ((c as { lastStandActive?: boolean }).lastStandActive) {
      const k = Math.abs(Math.sin(c.bobPhase * 9));
      em.r += 0.45 * k;
      em.g += 0.08 * k;
      em.b += 0.05 * k;
    }
    const od = c as { overdriveActive?: boolean; overdriveSpent?: boolean };
    if (od.overdriveActive) {
      const k = 0.18 + Math.abs(Math.sin(c.bobPhase * 14)) * 0.12;
      em.r += k;
      em.g += k * 0.9;
      em.b += k * 0.7;
    } else if (od.overdriveSpent) {
      const beat = Math.sin(c.bobPhase * 5.3) * Math.sin(c.bobPhase * 2.1);
      bright = 0.62 + beat * 0.18;
    }

    // Hitstop shudder.
    if (c.hitstop > 0) {
      this.shudder += dt;
      this.root.position.x += Math.sin(this.shudder * 40) * 1.6 * WORLD_PER_PX;
    }

    // Dead machines tumble, sink and go dark.
    if (!c.alive) {
      this.deadSpin += dt;
      this.root.rotation.z = -this.deadSpin * 0.9 * facing;
      this.root.rotation.x = this.deadSpin * 0.35;
      bright *= clamp(1 - this.deadSpin * 0.35, 0.25, 1);
    } else {
      this.deadSpin = 0;
    }
    this.mat.color.setScalar(bright);
  }

  /**
   * FREE ORBIT's pose: the same rig, placed and turned in a full 3D yard, and
   * able to fold into its **mobile form**.
   *
   * The mobile form is not a second model. It is the machine's own parts
   * re-posed, the way a transforming frame is one set of hardware: the chassis
   * lies prone so the head leads, the legs trail straight back as the tail, both
   * arms swing forward so **the main weapon becomes the nose**, the head drops
   * into the shoulders and the thrusters end up firing aft. `p.mobile` blends
   * every part between the two poses, so a transformation is visibly a machine
   * folding up rather than a cut. The rig's own authoring (pivots, depths) is
   * untouched, which is why all eight machines transform without per-chassis
   * data.
   */
  pose3(p: Mech3Pose, dt: number): void {
    this.root.visible = true;
    this.facing = 1;
    this.mirror.scale.x = 1;
    this.root.position.set(p.x, p.y, p.z);
    this.root.rotation.set(0, p.yaw, 0);
    const m = clamp(p.mobile, 0, 1);
    const ease = m * m * (3 - 2 * m);
    const sc = WORLD_PER_PX * this.def.rig.scale;

    // In-plane attitude: lean into travel as a mech, lie prone as a craft.
    const mechZ = -p.tilt;
    // A touch of nose-up trim: a prone frame carries its legs low behind it, and
    // level by the numbers read as nose-down by eye.
    const craftZ = -Math.PI / 2 + CRAFT_TRIM + p.pitch;
    this.bank.rotation.set(p.roll + p.flourish, 0, mechZ + (craftZ - mechZ) * ease, 'XYZ');
    this.bank.position.set(0, -Math.sin(p.bob) * 1.6 * sc * (1 - ease), 0);

    // Aim smoothing, as the side-on rig does it: the head arrives first.
    // The rig's angles are the side-on game's: y down, so "up" is negative, and
    // the arms aim relative to the leaning chassis.
    const aimTarget = wrapAngle(-p.aim - p.tilt);
    if (!this.aimInit) {
      this.aimHead = aimTarget;
      this.aimArm = aimTarget;
      this.aimInit = true;
    } else {
      const k = (rate: number): number => 1 - Math.exp(-rate * dt);
      this.aimHead += wrapAngle(aimTarget - this.aimHead) * k(AIM_RATE_HEAD);
      this.aimArm += wrapAngle(aimTarget - this.aimArm) * k(AIM_RATE_ARM);
    }
    const sw = p.swing;
    const mechPose: RigPose = {
      turretRot: this.aimArm,
      turretRotHead: this.aimHead,
      spin: sw ? sw.spin : 0,
      weaponSpin: sw ? sw.weaponSpin : 0,
      lean: sw ? sw.lean : 0,
      reach: sw ? sw.reach : 0,
      lift: sw ? sw.lift : 0,
      thrust: p.thrust,
      meleeing: !!sw,
      walkPhase: p.walkPhase,
      stride: p.stride,
      legNear: p.legSwing,
      legFar: p.legSwing * 0.7,
    };
    // Arms straight "up" in the rig are straight ahead once the chassis is prone.
    const craftPose: RigPose = {
      ...mechPose,
      turretRot: -Math.PI / 2 + CRAFT_TRIM,
      turretRotHead: 0,
      spin: 0,
      weaponSpin: 0,
      lean: 0,
      reach: 0,
      lift: 0,
      meleeing: false,
      stride: 0,
      walkPhase: 0,
      legNear: 0,
      legFar: 0,
      thrust: 1,
    };
    for (const node of this.nodes.values()) {
      const a = partLocalRotation(node.def, node.inheritsTurret, mechPose);
      let b = partLocalRotation(node.def, node.inheritsTurret, craftPose);
      const f = node.def.follow;
      if (node.def.name === 'head') b = -Math.PI / 2 + 0.25;
      else if (f === 'legNear' || f === 'legFar') b = (f === 'legNear' ? 1 : -1) * 0.04;
      const r = a + wrapAngle(b - a) * ease;
      node.group.rotation.z = -r;
      const off = sw ? partReachOffset(node.def, node.inheritsTurret, mechPose) : { x: 0, y: 0 };
      let px = node.def.x + off.x * (1 - ease);
      let py = node.def.y + off.y * (1 - ease);
      if (node.def.name === 'head') {
        // The head drops into the shoulders.
        px *= 1 - 0.35 * ease;
        py *= 1 - 0.35 * ease;
      } else if (f === 'legNear' || f === 'legFar') {
        // The legs close up under the hull and tuck in toward the spine.
        px += (0 - node.def.x) * 0.4 * ease;
      } else if (node.def.name === 'backpack') {
        // Prone, the back is the top: fold the pack down onto the spine.
        px += (node.def.x * 0.72 - node.def.x) * ease;
        py += (node.def.y * 0.15 + 6 - node.def.y) * ease;
      } else if (f === 'thruster') {
        // The engines slide down the back toward the tail, so the craft fires
        // from its stern instead of from a fin standing up off its spine.
        px += (node.def.x * 0.55 - node.def.x) * ease;
        py += 22 * ease;
      }
      // Width. Every rig is authored side-on, so it is deep front-to-back and
      // thin across; prone, that is a tall narrow craft that reads from the
      // chase lens as a mech seen from behind. The legs splay into a V tail and
      // the engines spread to the flanks, so the craft has a planform.
      let pz = node.z;
      let splay = 0;
      if (f === 'legNear' || f === 'legFar') {
        const side = f === 'legNear' ? 1 : -1;
        pz += side * 13 * ease;
        splay = -side * 0.32 * ease;
      } else if (f === 'thruster') {
        pz *= 1 + 1.1 * ease;
      }
      node.group.position.set(px, -py, pz);
      if (splay !== 0) node.group.rotation.set(splay, 0, -r, 'XYZ');
      else node.group.rotation.x = 0;
    }
    if (sw && ease < 0.5) this.applyTwoHandedGrip(sw.grip, this.aimArm + sw.spin);
    this.animateEnergy(dt);

    const em = this.mat.emissive;
    em.setRGB(0, 0, 0);
    let bright = 1;
    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
      if (Math.floor(this.hitFlash * 60) % 2 === 0) em.setRGB(0.85, 0.85, 0.85);
    }
    if (p.satActive && this.hitFlash <= 0) {
      _c.setHex(this.def.tint.thruster);
      const k = 0.06 + (0.5 + Math.sin(p.bob * 4) * 0.5) * 0.1;
      em.r += _c.r * k;
      em.g += _c.g * k;
      em.b += _c.b * k;
    }
    // A transformation lights the frame from inside for its duration.
    if (p.transforming) {
      _c.setHex(this.def.tint.glow);
      const k = 0.25 * Math.sin(m * Math.PI);
      em.r += _c.r * k;
      em.g += _c.g * k;
      em.b += _c.b * k;
    }
    if (p.hitstop) {
      this.shudder += dt;
      this.root.position.x += Math.sin(this.shudder * 40) * 1.6 * WORLD_PER_PX;
    }
    if (!p.alive) {
      this.deadSpin += dt;
      this.root.rotation.z = -this.deadSpin * 0.9;
      this.root.rotation.x = this.deadSpin * 0.35;
      bright *= clamp(1 - this.deadSpin * 0.35, 0.25, 1);
    } else {
      this.deadSpin = 0;
    }
    this.mat.color.setScalar(bright);
  }

  private applyTwoHandedGrip(grip: number, aim: number): void {
    if (grip <= 0) return;
    const left = this.nodes.get('leftArm');
    const right = this.nodes.get('rightArm');
    if (!left || !right) return;
    const dx = right.def.x - left.def.x;
    const dy = right.def.y - left.def.y;
    const bx = -Math.cos(aim) * GRIP_SPACING;
    const by = -Math.sin(aim) * GRIP_SPACING;
    // Logical px, y down in the rig's authoring space; y is negated on the way in.
    left.group.position.x += (dx + bx) * grip;
    left.group.position.y -= (dy + by) * grip;
  }

  /** The projected blade breathes from its root and flickers on stepped tables. */
  private animateEnergy(dt: number): void {
    const node = this.nodes.get('meleeEnergy') ?? this.nodes.get('meleeArc');
    if (!node || !node.group.visible) return;
    this.energyPhase += dt;
    const frame = Math.floor(this.energyPhase * 60);
    const lvl = flickerLevel(frame);
    this.energy.color.setScalar(0.55 + 0.6 * lvl);
    this.energy.opacity = this.alpha;
    if (node.def.name === 'meleeEnergy') {
      const breath = breathLevel(frame);
      node.inner.scale.set(breath, 1 + (breath - 1) * 0.35, 1 + (breath - 1) * 0.35);
    }
  }

  setPartVisible(name: string, visible: boolean): void {
    const node = this.nodes.get(name);
    if (node) node.group.visible = visible;
  }

  hasPart(name: string): boolean {
    return this.nodes.has(name);
  }

  /**
   * A part's transform in **simulation** space — the same contract as
   * `MechRenderer.partWorld`, so effect and bloom code is unchanged.
   *
   * Measured in the rig plane (the root's frame before its turn toward the
   * camera), so the angle is the angle the part makes in the fight, not the
   * foreshortened one the lens sees.
   */
  partWorld(name: string): { x: number; y: number; angle: number; scale: number } | null {
    const node = this.nodes.get(name);
    if (!node) return null;
    this.root.updateMatrixWorld(true);
    _inv.copy(this.root.matrixWorld).invert();
    _m.multiplyMatrices(_inv, node.group.matrixWorld);
    _v.setFromMatrixPosition(_m);
    _d.set(1, 0, 0).transformDirection(_m);
    return {
      x: simX(this.root.position.x + _v.x),
      y: simY(this.root.position.y + _v.y),
      angle: Math.atan2(-_d.y, _d.x),
      scale: this.def.rig.scale,
    };
  }

  /** A part's true world position, for effects that should sit on the model. */
  partWorld3(name: string, out: THREE.Vector3, local?: [number, number]): THREE.Vector3 | null {
    const node = this.nodes.get(name);
    if (!node) return null;
    this.root.updateMatrixWorld(true);
    out.set(local ? local[0] : 0, local ? -local[1] : 0, 0);
    return node.group.localToWorld(out);
  }

  setVisible(v: boolean): void {
    this.root.visible = v;
  }

  /** Whole-rig opacity. Only the decoy uses it, as its projection decays. */
  setAlpha(a: number): void {
    if (a === this.alpha) return;
    this.alpha = a;
    const fading = a < 0.999;
    for (const m of [this.mat, this.glow]) {
      m.transparent = fading;
      m.opacity = a;
      m.needsUpdate = true;
    }
    for (const mesh of this.meshes) mesh.castShadow = !fading && mesh.material === this.mat;
  }

  /** Kept for interface parity with the sprite renderer; depth is real now. */
  setDepth(_d: number): void {}

  destroy(): void {
    this.root.removeFromParent();
    this.mat.dispose();
    this.glow.dispose();
    this.energy.dispose();
    this.nodes.clear();
  }
}
