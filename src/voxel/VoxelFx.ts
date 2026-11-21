import * as THREE from 'three';
import { ProjKind } from '../combat/types';
import { PROJ_FAMILIES, type ProjFamilyId } from '../projectiles/families';
import { thrusterFxFor, type ThrusterFx } from '../render/ThrusterProfiles';
import { WORLD_PER_PX, worldX, worldY } from './World';

/**
 * Battle effects in voxels.
 *
 * **The same calls as `Effects`, in the same simulation coordinates**, so the
 * event plumbing in `BattleScene` did not have to change shape: a hit still
 * says `impactFor(x, y, family, tint, power)`, it just lands as a spray of
 * glowing cubes, a white-hot star and a shockwave ring in a lit 3D yard instead
 * of additive sprites on a flat stage.
 *
 * The vocabulary is KNOCK//BACK's `fx.js`: instanced voxel cubes (an unlit pool
 * for sparks and fire, a lit pool for debris and smoke), star sparks, rings.
 * Two additions this game needs and that one did not — continuous **flame
 * cones** for thrusters, and **shells** for a held barrier — are pooled and
 * reset every frame, because the scene asks for them every frame.
 */

const MAX_GLOW = 2200;
const MAX_LIT = 600;
const MAX_STARS = 64;
const MAX_RINGS = 40;
const MAX_CONES = 32;
const MAX_SHELLS = 8;
const MAX_SLASH = 10;

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  t: number;
  life: number;
  s0: number;
  s1: number;
  r0: number;
  g0: number;
  b0: number;
  r1: number;
  g1: number;
  b1: number;
  grav: number;
  drag: number;
  rx: number;
  ry: number;
  spin: number;
  floor: boolean;
}

interface Timed {
  obj: THREE.Mesh | THREE.Sprite;
  t: number;
  life: number;
  a: number;
  b: number;
  alpha: number;
  on: boolean;
}

export interface BurstOpts {
  n?: number;
  speed?: number;
  /** Direction bias in world space; the spray fans around it. */
  dir?: [number, number, number];
  spread?: number;
  life?: number;
  size?: number;
  sizeEnd?: number;
  color?: number | number[];
  colorEnd?: number;
  gravity?: number;
  drag?: number;
  /** Lit debris (solid, shaded) instead of glowing sparks. */
  lit?: boolean;
  floor?: boolean;
  jitter?: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();
const _c2 = new THREE.Color();
const _d3 = new THREE.Vector3();
const X_AXIS = new THREE.Vector3(1, 0, 0);

function starTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = i % 2 ? 18 : 64;
    g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  return new THREE.CanvasTexture(c);
}

let STAR: THREE.CanvasTexture | null = null;

const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

export class VoxelFx {
  readonly group = new THREE.Group();
  /** Particle budget multiplier (graphics quality). */
  amount = 1;
  private readonly glowIM: THREE.InstancedMesh;
  private readonly litIM: THREE.InstancedMesh;
  private readonly glowP: Particle[] = [];
  private readonly litP: Particle[] = [];
  private readonly stars: Timed[] = [];
  private readonly rings: Timed[] = [];
  private readonly slashes: Timed[] = [];
  private readonly cones: THREE.Mesh[] = [];
  private readonly coreCones: THREE.Mesh[] = [];
  private conesUsed = 0;
  private readonly shells: THREE.Mesh[] = [];
  private shellsUsed = 0;
  private readonly camera: THREE.Camera;

  constructor(scene: THREE.Scene, camera: THREE.Camera) {
    this.camera = camera;
    scene.add(this.group);
    const box = new THREE.BoxGeometry(1, 1, 1);
    this.glowIM = new THREE.InstancedMesh(
      box,
      new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
      MAX_GLOW,
    );
    this.litIM = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ color: 0xffffff }), MAX_LIT);
    for (const im of [this.glowIM, this.litIM]) {
      im.setColorAt(0, _c.setRGB(1, 1, 1));
      im.instanceColor!.setUsage(THREE.DynamicDrawUsage);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.count = 0;
      im.frustumCulled = false;
      this.group.add(im);
    }
    this.litIM.castShadow = true;
    if (!STAR) STAR = starTexture();

    for (let i = 0; i < MAX_STARS; i++) {
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: STAR,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          depthTest: false,
          toneMapped: false,
          transparent: true,
        }),
      );
      sp.renderOrder = 30;
      sp.visible = false;
      this.group.add(sp);
      this.stars.push({ obj: sp, t: 0, life: 0, a: 1, b: 1, alpha: 1, on: false });
    }
    const ringGeo = new THREE.RingGeometry(0.86, 1, 48);
    for (let i = 0; i < MAX_RINGS; i++) {
      const m = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({
          transparent: true,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        }),
      );
      m.renderOrder = 25;
      m.visible = false;
      this.group.add(m);
      this.rings.push({ obj: m, t: 0, life: 0, a: 0, b: 1, alpha: 1, on: false });
    }
    // A crescent for melee arcs: a ring segment, drawn in the fight plane.
    const slashGeo = new THREE.RingGeometry(0.7, 1, 32, 1, -1.1, 2.2);
    for (let i = 0; i < MAX_SLASH; i++) {
      const m = new THREE.Mesh(
        slashGeo,
        new THREE.MeshBasicMaterial({
          transparent: true,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        }),
      );
      m.renderOrder = 26;
      m.visible = false;
      this.group.add(m);
      this.slashes.push({ obj: m, t: 0, life: 0, a: 1, b: 1, alpha: 1, on: false });
    }
    // Flame cones: tip at +y, so a cone is rotated to point down its axis.
    const coneGeo = new THREE.ConeGeometry(0.5, 1, 10, 1, true);
    coneGeo.translate(0, -0.5, 0);
    coneGeo.rotateZ(Math.PI / 2); // wide end at the origin, tapering along +x
    for (let i = 0; i < MAX_CONES; i++) {
      const mk = (): THREE.Mesh => {
        const m = new THREE.Mesh(
          coneGeo,
          new THREE.MeshBasicMaterial({
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            toneMapped: false,
            side: THREE.DoubleSide,
          }),
        );
        m.visible = false;
        m.renderOrder = 12;
        m.frustumCulled = false;
        this.group.add(m);
        return m;
      };
      this.cones.push(mk());
      this.coreCones.push(mk());
    }
    const shellGeo = new THREE.IcosahedronGeometry(1, 2);
    for (let i = 0; i < MAX_SHELLS; i++) {
      const m = new THREE.Mesh(
        shellGeo,
        new THREE.MeshBasicMaterial({
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
          wireframe: true,
        }),
      );
      m.visible = false;
      m.renderOrder = 22;
      this.group.add(m);
      this.shells.push(m);
    }
  }

  get container(): THREE.Group {
    return this.group;
  }

  // ------------------------------------------------------------- primitives

  /** A spray of voxel cubes at a world position. */
  burst(x: number, y: number, z: number, o: BurstOpts = {}): void {
    const n = Math.max(1, Math.round((o.n ?? 10) * this.amount));
    const pool = o.lit ? this.litP : this.glowP;
    const cap = o.lit ? MAX_LIT : MAX_GLOW;
    const spread = o.spread ?? 1;
    const jit = o.jitter ?? 0.08;
    for (let i = 0; i < n; i++) {
      if (pool.length >= cap) pool.shift();
      const sp = (o.speed ?? 5) * rnd(0.4, 1.1);
      let dx = rnd(-1, 1);
      let dy = rnd(-1, 1);
      let dz = rnd(-1, 1) * 0.8;
      if (o.dir) {
        dx = dx * spread + o.dir[0];
        dy = dy * spread + o.dir[1];
        dz = dz * spread + o.dir[2];
      }
      const l = Math.hypot(dx, dy, dz) || 1;
      const cols = o.color;
      const col = Array.isArray(cols) ? cols[Math.floor(Math.random() * cols.length)] : (cols ?? 0xffffff);
      _c.setHex(col);
      _c2.setHex(o.colorEnd ?? col);
      const s0 = (o.size ?? 0.1) * rnd(0.6, 1.3);
      pool.push({
        x: x + rnd(-jit, jit),
        y: y + rnd(-jit, jit),
        z: z + rnd(-jit, jit),
        vx: (dx / l) * sp,
        vy: (dy / l) * sp,
        vz: (dz / l) * sp,
        t: 0,
        life: (o.life ?? 0.5) * rnd(0.6, 1.2),
        s0,
        s1: o.sizeEnd != null ? o.sizeEnd * (s0 / (o.size ?? 0.1)) : 0,
        r0: _c.r,
        g0: _c.g,
        b0: _c.b,
        r1: _c2.r,
        g1: _c2.g,
        b1: _c2.b,
        grav: o.gravity ?? 14,
        drag: o.drag ?? 0.8,
        rx: Math.random() * 6,
        ry: Math.random() * 6,
        spin: rnd(-12, 12),
        floor: o.floor ?? true,
      });
    }
  }

  /** A white-hot star. */
  star(x: number, y: number, z: number, size: number, color = 0xffffff, life = 0.16): void {
    const s = this.stars.find((q) => !q.on) ?? this.stars[0];
    const sp = s.obj as THREE.Sprite;
    sp.position.set(x, y, z);
    (sp.material as THREE.SpriteMaterial).color.setHex(color);
    (sp.material as THREE.SpriteMaterial).rotation = Math.random() * 6;
    sp.visible = true;
    Object.assign(s, { t: 0, life, a: size, b: size * 0.4, alpha: 1, on: true });
  }

  /** An expanding ring, facing the camera unless `inPlane`. */
  ring(x: number, y: number, z: number, r0: number, r1: number, color: number, life = 0.35, alpha = 0.9, inPlane = false): void {
    const s = this.rings.find((q) => !q.on) ?? this.rings[0];
    const m = s.obj as THREE.Mesh;
    m.position.set(x, y, z);
    if (inPlane) m.quaternion.identity();
    else m.quaternion.copy(this.camera.quaternion);
    (m.material as THREE.MeshBasicMaterial).color.setHex(color);
    m.visible = true;
    Object.assign(s, { t: 0, life, a: r0, b: r1, alpha, on: true });
  }

  private slash(x: number, y: number, angle: number, radius: number, color: number, life = 0.18): void {
    const s = this.slashes.find((q) => !q.on) ?? this.slashes[0];
    const m = s.obj as THREE.Mesh;
    m.position.set(x, y, 0.05);
    m.rotation.set(0, 0, angle);
    (m.material as THREE.MeshBasicMaterial).color.setHex(color);
    m.visible = true;
    Object.assign(s, { t: 0, life, a: radius, b: radius * 1.18, alpha: 0.95, on: true });
  }

  // ------------------------------------------------- the Effects interface

  muzzle(x: number, y: number, angle: number, kind: ProjKind, tint: number): void {
    const big = kind === ProjKind.Heavy || kind === ProjKind.Beam;
    this.muzzleAt(worldX(x), worldY(y), -angle, tint, big ? 1.6 : 1);
  }

  muzzleFor(x: number, y: number, angle: number, famId: ProjFamilyId, tint: number): void {
    const f = PROJ_FAMILIES[famId];
    const k = f ? Math.min(2, Math.max(0.8, Math.max(f.length, f.width) / 50)) : 1;
    this.muzzleAt(worldX(x), worldY(y), -angle, tint, k);
  }

  private muzzleAt(wx: number, wy: number, a: number, tint: number, k: number): void {
    const dir: [number, number, number] = [Math.cos(a), Math.sin(a), 0];
    this.star(wx, wy, 0.3, 0.9 * k, tint, 0.09);
    this.star(wx, wy, 0.3, 0.45 * k, 0xffffff, 0.06);
    this.burst(wx, wy, 0, {
      n: 6 * k,
      speed: 9 * k,
      dir,
      spread: 0.35,
      life: 0.16,
      size: 0.07 * k,
      color: [0xffffff, tint],
      colorEnd: tint,
      gravity: 0,
      drag: 0.9,
    });
  }

  hit(x: number, y: number, kind: ProjKind, tint: number): void {
    const p = kind === ProjKind.Melee || kind === ProjKind.Beam || kind === ProjKind.Heavy ? 1.6 : 1;
    this.impactAt(worldX(x), worldY(y), tint, p);
  }

  impactFor(x: number, y: number, _famId: ProjFamilyId, tint: number, power = 1): void {
    this.impactAt(worldX(x), worldY(y), tint, power);
  }

  private impactAt(wx: number, wy: number, tint: number, power: number): void {
    this.star(wx, wy, 0.4, 1.3 * power, 0xffffff, 0.14);
    this.star(wx, wy, 0.35, 2.1 * power, tint, 0.2);
    this.ring(wx, wy, 0.2, 0.15, 1.3 * power, tint, 0.26, 0.85);
    this.burst(wx, wy, 0, {
      n: 14 * power,
      speed: 9 * power,
      life: 0.45,
      size: 0.09,
      color: [0xffffff, 0xfff1c0, tint],
      colorEnd: tint,
      gravity: 16,
    });
    this.burst(wx, wy, 0, {
      n: 4 * power,
      speed: 6,
      life: 0.9,
      size: 0.1,
      color: [0x59626e, 0x3a414b, 0x8b939d],
      lit: true,
      gravity: 22,
    });
  }

  projTrail(x: number, y: number, angle: number, famId: ProjFamilyId, tint: number): void {
    const f = PROJ_FAMILIES[famId];
    const a = -angle;
    const sc = f ? Math.max(0.04, f.width * (f.trailScale ?? 0.2) * WORLD_PER_PX * 0.5) : 0.06;
    this.burst(worldX(x), worldY(y), 0, {
      n: 1,
      speed: 1.2,
      dir: [-Math.cos(a), -Math.sin(a), 0],
      spread: 0.5,
      life: 0.3,
      size: sc,
      color: f?.trailTint ?? tint,
      colorEnd: 0x101010,
      gravity: 0,
      drag: 0.5,
      jitter: 0.03,
      floor: false,
    });
  }

  guard(x: number, y: number, tint: number): void {
    const wx = worldX(x);
    const wy = worldY(y);
    this.ring(wx, wy, 0.3, 0.6, 1.5, tint, 0.22);
    this.star(wx, wy, 0.4, 1.1, tint, 0.12);
    this.burst(wx, wy, 0, { n: 8, speed: 6, life: 0.3, size: 0.07, color: [tint, 0xffffff], gravity: 4 });
  }

  absorb(x: number, y: number, tint: number): void {
    const wx = worldX(x);
    const wy = worldY(y);
    this.ring(wx, wy, 0.2, 0.2, 0.8, tint, 0.2);
    this.burst(wx, wy, 0, { n: 5, speed: 3, life: 0.3, size: 0.06, color: [tint, 0xffffff], gravity: 0 });
  }

  barrier(x: number, y: number, radius: number, tint: number): void {
    const wx = worldX(x);
    const wy = worldY(y);
    const r = radius * WORLD_PER_PX;
    this.ring(wx, wy, 0.1, r * 0.55, r * 1.25, tint, 0.32, 0.95);
    this.ring(wx, wy, 0.1, r * 0.3, r * 0.95, 0xffffff, 0.2, 0.6);
    this.star(wx, wy, 0.4, r * 1.4, tint, 0.18);
    this.burst(wx, wy, 0, { n: 14, speed: 7, life: 0.35, size: 0.07, color: [tint, 0xffffff], gravity: 0, drag: 0.6 });
  }

  /** A held barrier: one shell, redrawn each frame it is asked for. */
  barrierHold(x: number, y: number, radius: number, tint: number): void {
    if (this.shellsUsed >= this.shells.length) return;
    const m = this.shells[this.shellsUsed++];
    m.visible = true;
    m.position.set(worldX(x), worldY(y), 0);
    m.scale.setScalar(radius * WORLD_PER_PX);
    m.rotation.set(performance.now() * 0.0004, performance.now() * 0.0007, 0);
    const mat = m.material as THREE.MeshBasicMaterial;
    mat.color.setHex(tint).multiplyScalar(0.55 + Math.sin(performance.now() * 0.02) * 0.1);
  }

  melee(x: number, y: number, angle: number, stage: number, tint: number): void {
    const wx = worldX(x);
    const wy = worldY(y);
    const a = -angle;
    const r = 1.1 + stage * 0.18;
    this.slash(wx, wy, a, r, tint, 0.17);
    this.slash(wx, wy, a, r * 0.86, 0xffffff, 0.11);
    this.burst(wx + Math.cos(a) * r, wy + Math.sin(a) * r, 0, {
      n: 6 + stage * 2,
      speed: 6,
      dir: [Math.cos(a), Math.sin(a), 0],
      spread: 0.8,
      life: 0.25,
      size: 0.07,
      color: [tint, 0xffffff],
      gravity: 6,
    });
  }

  /** The sprite API: a nozzle at sim coordinates, on the fight plane. */
  thruster(
    x: number,
    y: number,
    angle: number,
    power: number,
    tint: number,
    size = 1,
    fx: ThrusterFx = thrusterFxFor(''),
  ): void {
    _p.set(worldX(x), worldY(y), 0);
    this.thruster3(_p, -angle, power, tint, size, fx);
  }

  /**
   * A plume from a real nozzle position, pointing down a world-space angle in
   * the fight plane. One flame cone and a hot core per call, redrawn every
   * frame — a stable silhouette whose length and brightness pulse — plus a few
   * cubes shed off the tail at high burn.
   */
  thruster3(pos: THREE.Vector3, a: number, power: number, tint: number, size = 1, fx: ThrusterFx = thrusterFxFor('')): void {
    if (power <= 0.05) return;
    const hot = power * power;
    const burn = hot * power;
    const flick = 1 - fx.flicker * 0.5 + Math.random() * fx.flicker;
    // 160 px is the sprite plume's native length; the profile scales it.
    const len = (fx.flameLen + fx.flameLenHot * hot) * size * flick * 160 * WORLD_PER_PX * 0.55;
    const wide = len * fx.flameWide * 0.55;
    if (this.conesUsed < this.cones.length) {
      const i = this.conesUsed++;
      const outer = this.cones[i];
      const core = this.coreCones[i];
      for (const [m, l, w, col, al] of [
        [outer, len, wide, tint, fx.alpha + fx.alphaHot * hot],
        [core, len * fx.coreLen, wide * fx.coreWide, 0xffffff, 0.7 + 0.3 * hot],
      ] as [THREE.Mesh, number, number, number, number][]) {
        m.visible = true;
        m.position.copy(pos);
        m.rotation.set(0, 0, a);
        m.scale.set(l, w, w);
        const mat = m.material as THREE.MeshBasicMaterial;
        mat.color.setHex(col);
        mat.opacity = Math.min(1, al);
      }
    }
    if (Math.random() < 0.3 + burn * 0.7) {
      this.burst(pos.x + Math.cos(a) * len * 0.7, pos.y + Math.sin(a) * len * 0.7, pos.z, {
        n: 1 + Math.round(burn * 2),
        speed: 4 + 6 * power,
        dir: [Math.cos(a), Math.sin(a), 0],
        spread: 0.25,
        life: 0.22,
        size: 0.06 * size,
        color: [0xffffff, tint],
        colorEnd: 0x1a1410,
        gravity: -1,
        drag: 0.4,
        jitter: 0.02,
        floor: false,
      });
    }
  }

  // ------------------------------------------------- free-flight (3D) API
  //
  // The methods above take side-on simulation coordinates and draw in the fight
  // plane. FREE ORBIT has no plane, so these take world positions and real 3D
  // directions; they share the pools and the look.

  /** A plume from a nozzle, pointing down any world-space direction. */
  plume3(pos: THREE.Vector3, dir: THREE.Vector3, power: number, tint: number, size = 1, fx: ThrusterFx = thrusterFxFor('')): void {
    if (power <= 0.05) return;
    const hot = power * power;
    const burn = hot * power;
    const flick = 1 - fx.flicker * 0.5 + Math.random() * fx.flicker;
    const len = (fx.flameLen + fx.flameLenHot * hot) * size * flick * 160 * WORLD_PER_PX * 0.55;
    const wide = len * fx.flameWide * 0.55;
    _d3.copy(dir).normalize();
    _q.setFromUnitVectors(X_AXIS, _d3);
    if (this.conesUsed < this.cones.length) {
      const i = this.conesUsed++;
      for (const [m, l, w, col, al] of [
        [this.cones[i], len, wide, tint, fx.alpha + fx.alphaHot * hot],
        [this.coreCones[i], len * fx.coreLen, wide * fx.coreWide, 0xffffff, 0.7 + 0.3 * hot],
      ] as [THREE.Mesh, number, number, number, number][]) {
        m.visible = true;
        m.position.copy(pos);
        m.quaternion.copy(_q);
        m.scale.set(l, w, w);
        const mat = m.material as THREE.MeshBasicMaterial;
        mat.color.setHex(col);
        mat.opacity = Math.min(1, al);
      }
    }
    if (Math.random() < 0.3 + burn * 0.7) {
      this.burst(pos.x + _d3.x * len * 0.7, pos.y + _d3.y * len * 0.7, pos.z + _d3.z * len * 0.7, {
        n: 1 + Math.round(burn * 2),
        speed: 4 + 6 * power,
        dir: [_d3.x, _d3.y, _d3.z],
        spread: 0.25,
        life: 0.22,
        size: 0.06 * size,
        color: [0xffffff, tint],
        colorEnd: 0x1a1410,
        gravity: -1,
        drag: 0.4,
        jitter: 0.02,
        floor: false,
      });
    }
  }

  /** Muzzle flash at a world position, spraying down `dir`. */
  muzzle3(x: number, y: number, z: number, dir: [number, number, number], tint: number, k = 1): void {
    this.star(x, y, z, 0.9 * k, tint, 0.09);
    this.star(x, y, z, 0.45 * k, 0xffffff, 0.06);
    this.burst(x, y, z, {
      n: 6 * k,
      speed: 9 * k,
      dir,
      spread: 0.35,
      life: 0.16,
      size: 0.07 * k,
      color: [0xffffff, tint],
      colorEnd: tint,
      gravity: 0,
      drag: 0.9,
    });
  }

  /** A hit landing at a world position. */
  impact3(x: number, y: number, z: number, tint: number, power = 1): void {
    this.star(x, y, z, 1.3 * power, 0xffffff, 0.14);
    this.star(x, y, z, 2.1 * power, tint, 0.2);
    this.ring(x, y, z, 0.15, 1.3 * power, tint, 0.26, 0.85);
    this.burst(x, y, z, {
      n: 14 * power,
      speed: 9 * power,
      life: 0.45,
      size: 0.09,
      color: [0xffffff, 0xfff1c0, tint],
      colorEnd: tint,
      gravity: 16,
    });
    this.burst(x, y, z, { n: 4 * power, speed: 6, life: 0.9, size: 0.1, color: [0x59626e, 0x3a414b, 0x8b939d], lit: true, gravity: 22 });
  }

  /** A sword stroke: a crescent laid in the plane the blade travels through. */
  slash3(x: number, y: number, z: number, yaw: number, angle: number, radius: number, color: number, life = 0.18): void {
    const s = this.slashes.find((q) => !q.on) ?? this.slashes[0];
    const m = s.obj as THREE.Mesh;
    m.position.set(x, y, z);
    m.rotation.set(0, yaw, angle, 'YXZ');
    (m.material as THREE.MeshBasicMaterial).color.setHex(color);
    m.visible = true;
    Object.assign(s, { t: 0, life, a: radius, b: radius * 1.18, alpha: 0.95, on: true });
  }

  /** A held guard shell around a world position, redrawn each frame it is asked for. */
  shell3(x: number, y: number, z: number, radius: number, tint: number): void {
    if (this.shellsUsed >= this.shells.length) return;
    const m = this.shells[this.shellsUsed++];
    m.visible = true;
    m.position.set(x, y, z);
    m.scale.setScalar(radius);
    m.rotation.set(performance.now() * 0.0004, performance.now() * 0.0007, 0);
    const mat = m.material as THREE.MeshBasicMaterial;
    mat.color.setHex(tint).multiplyScalar(0.55 + Math.sin(performance.now() * 0.02) * 0.1);
  }

  dash(x: number, y: number, angle: number, tint: number, size = 1): void {
    const wx = worldX(x);
    const wy = worldY(y);
    const a = -angle;
    this.ring(wx, wy, 0, 0.3 * size, 1.6 * size, tint, 0.25, 0.7);
    this.burst(wx, wy, 0, {
      n: 14 * size,
      speed: 10,
      dir: [-Math.cos(a), -Math.sin(a), 0],
      spread: 0.35,
      life: 0.3,
      size: 0.08,
      color: [0xffffff, tint],
      colorEnd: tint,
      gravity: 0,
      drag: 0.5,
    });
  }

  guardBreak(x: number, y: number): void {
    const wx = worldX(x);
    const wy = worldY(y);
    this.star(wx, wy, 0.5, 3.4, 0xffffff, 0.22);
    this.ring(wx, wy, 0.3, 0.4, 3.2, 0xffe08a, 0.4);
    this.burst(wx, wy, 0, { n: 26, speed: 12, life: 0.6, size: 0.12, color: [0xffe08a, 0xffffff, 0xc08cff], gravity: 18 });
    this.burst(wx, wy, 0, { n: 10, speed: 8, life: 1.1, size: 0.16, color: [0x8f7ce0, 0xc08cff], lit: true, gravity: 20 });
  }

  saturation(x: number, y: number, tint: number): void {
    const wx = worldX(x);
    const wy = worldY(y);
    this.star(wx, wy, 0.5, 4, tint, 0.3);
    this.ring(wx, wy, 0.2, 0.5, 4.5, tint, 0.5);
    this.ring(wx, wy, 0.2, 0.3, 3, 0xffffff, 0.35, 0.6);
    this.burst(wx, wy, 0, { n: 30, speed: 7, dir: [0, 1, 0], spread: 1.2, life: 0.8, size: 0.09, color: [tint, 0xffffff], gravity: -3 });
  }

  saturationBurst(x: number, y: number, mode: number, tint: number, facing: number): void {
    const wx = worldX(x);
    const wy = worldY(y);
    const modeTint = [0x9fe0ff, 0xffd166, 0xff9ae0][mode] ?? tint;
    this.star(wx, wy, 0.6, 5.5, 0xffffff, 0.3);
    this.ring(wx, wy, 0.2, 0.6, 7, modeTint, 0.6);
    this.ring(wx, wy, 0.2, 0.4, 5, tint, 0.45, 0.8);
    this.ring(wx, wy, 0, 0.6, 6, modeTint, 0.55, 0.6, true);
    this.burst(wx, wy, 0, {
      n: 46,
      speed: 14,
      dir: [facing * 0.6, 0.2, 0],
      spread: 1.1,
      life: 0.7,
      size: 0.11,
      color: [modeTint, 0xffffff, tint],
      colorEnd: modeTint,
      gravity: 2,
    });
  }

  stunSparks(x: number, y: number, radius: number, tint: number, intensity = 1): void {
    if (Math.random() > 0.55 * intensity) return;
    const r = radius * WORLD_PER_PX;
    const a = Math.random() * Math.PI * 2;
    const wx = worldX(x) + Math.cos(a) * r * rnd(0.3, 1);
    const wy = worldY(y) + Math.sin(a) * r * rnd(0.3, 1);
    this.star(wx, wy, 0.4, 0.5 * intensity, 0xbfe6ff, 0.07);
    this.burst(wx, wy, rnd(-0.4, 0.4), { n: 3 * intensity, speed: 5, life: 0.25, size: 0.05, color: [tint, 0xffffff, 0xbfe6ff], gravity: 12 });
  }

  satBurnout(x: number, y: number): void {
    const wx = worldX(x);
    const wy = worldY(y);
    this.burst(wx, wy, 0, { n: 18, speed: 3, dir: [0, 1, 0], spread: 0.8, life: 1.4, size: 0.22, sizeEnd: 0.4, color: [0x2a2c30, 0x3b3d42], lit: true, gravity: -3, drag: 0.6, floor: false });
    this.burst(wx, wy, 0, { n: 16, speed: 9, life: 0.5, size: 0.07, color: [0xff7a2a, 0xffd166, 0xffffff], gravity: 14 });
  }

  satAura(x: number, y: number, tint: number): void {
    const a = Math.random() * Math.PI * 2;
    const r = rnd(0.5, 1.2);
    this.burst(worldX(x) + Math.cos(a) * r, worldY(y) + Math.sin(a) * r * 0.8 - 0.4, rnd(-0.6, 0.6), {
      n: 1,
      speed: 1.6,
      dir: [0, 1, 0],
      spread: 0.2,
      life: 0.6,
      size: 0.07,
      color: [tint, 0xffffff],
      colorEnd: tint,
      gravity: -1.5,
      drag: 0.3,
      floor: false,
    });
  }

  repairMote(x: number, y: number, radius: number): void {
    const a = Math.random() * Math.PI * 2;
    const r = radius * WORLD_PER_PX * rnd(0.4, 0.9);
    this.burst(worldX(x) + Math.cos(a) * r, worldY(y) + Math.sin(a) * r, rnd(-0.5, 0.5), {
      n: 1,
      speed: 1,
      dir: [0, 1, 0],
      spread: 0.2,
      life: 0.7,
      size: 0.06,
      color: [0x8fffb0, 0xd8ffe4],
      gravity: -1,
      drag: 0.3,
      floor: false,
    });
  }

  explode(x: number, y: number, big: boolean, tint: number): void {
    const wx = worldX(x);
    const wy = worldY(y);
    const k = big ? 1.8 : 1;
    this.star(wx, wy, 0.5, 3 * k, 0xfff1c0, 0.2);
    this.ring(wx, wy, 0.1, 0.4, 3 * k, 0xffb066, 0.4, 0.8);
    this.burst(wx, wy, 0, { n: 26 * k, speed: 8 * k, life: 0.7, size: 0.16, sizeEnd: 0.05, color: [0xffffff, 0xffd166, 0xff8a3a, tint], colorEnd: 0x5a1a08, gravity: 3, drag: 0.7 });
    this.burst(wx, wy, 0, { n: 12 * k, speed: 3, dir: [0, 1, 0], spread: 0.9, life: 1.6, size: 0.25 * k, sizeEnd: 0.45 * k, color: [0x2a2c30, 0x3d3f45, 0x1c1d20], lit: true, gravity: -2.5, drag: 0.5, floor: false });
    this.burst(wx, wy, 0, { n: 8 * k, speed: 9, life: 1.2, size: 0.13, color: [0x59626e, 0x3a414b, 0x8b939d], lit: true, gravity: 22 });
  }

  clear(): void {
    this.glowP.length = 0;
    this.litP.length = 0;
    for (const s of [...this.stars, ...this.rings, ...this.slashes]) {
      s.on = false;
      s.obj.visible = false;
    }
  }

  /** Drops the per-frame pools (cones, shells). Call before the scene draws its overlays. */
  beginFrame(): void {
    for (let i = 0; i < this.conesUsed; i++) {
      this.cones[i].visible = false;
      this.coreCones[i].visible = false;
    }
    this.conesUsed = 0;
    for (let i = 0; i < this.shellsUsed; i++) this.shells[i].visible = false;
    this.shellsUsed = 0;
  }

  update(dt: number): void {
    this.step(this.glowP, this.glowIM, dt);
    this.step(this.litP, this.litIM, dt);
    for (const s of this.stars) {
      if (!s.on) continue;
      s.t += dt;
      const f = s.t / s.life;
      if (f >= 1) {
        s.on = false;
        s.obj.visible = false;
        continue;
      }
      const sz = s.a + (s.b - s.a) * f;
      s.obj.scale.set(sz, sz, 1);
      ((s.obj as THREE.Sprite).material as THREE.SpriteMaterial).opacity = 1 - f * f;
    }
    for (const list of [this.rings, this.slashes]) {
      for (const s of list) {
        if (!s.on) continue;
        s.t += dt;
        const f = s.t / s.life;
        if (f >= 1) {
          s.on = false;
          s.obj.visible = false;
          continue;
        }
        const e = 1 - (1 - f) * (1 - f);
        const r = s.a + (s.b - s.a) * e;
        s.obj.scale.set(r, r, r);
        ((s.obj as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = s.alpha * (1 - f);
      }
    }
  }

  private step(P: Particle[], im: THREE.InstancedMesh, dt: number): void {
    let n = 0;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.t += dt;
      if (p.t >= p.life) {
        P[i] = P[P.length - 1];
        P.pop();
        continue;
      }
      const dk = Math.pow(p.drag, dt * 6);
      p.vx *= dk;
      p.vz *= dk;
      p.vy = p.vy * dk - p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.floor && p.y < p.s0 * 0.5) {
        p.y = p.s0 * 0.5;
        p.vy = Math.abs(p.vy) * 0.3;
        p.vx *= 0.6;
        p.vz *= 0.6;
        p.spin *= 0.5;
      }
      const f = p.t / p.life;
      // Grow toward an end size (smoke) or, by default, shrink away to nothing.
      const sz = Math.max(0.0001, p.s1 > 0 ? p.s0 + (p.s1 - p.s0) * f : p.s0 * (1 - f * f));
      _e.set(p.rx + p.spin * p.t, p.ry + p.spin * 0.7 * p.t, 0);
      _q.setFromEuler(_e);
      _s.set(sz, sz, sz);
      _p.set(p.x, p.y, p.z);
      _m.compose(_p, _q, _s);
      if (n < im.instanceMatrix.count) {
        im.setMatrixAt(n, _m);
        _c.setRGB(p.r0 + (p.r1 - p.r0) * f, p.g0 + (p.g1 - p.g0) * f, p.b0 + (p.b1 - p.b0) * f);
        im.setColorAt(n, _c);
        n++;
      }
    }
    im.count = n;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }
}
