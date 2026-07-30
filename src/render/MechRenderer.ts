import Phaser from 'phaser';
import type { Combatant } from '../combat/Combatant';
import type { MechDef, RigPart } from '../mechs/MechDef';
import { ActState } from '../combat/types';
import { DEG, clamp, wrapAngle } from '../core/MathUtil';
import { depthScaleAt, depthSortAt } from '../core/Depth';
import { buildTurretInheritance, partLocalRotation, type RigPose } from './RigRotation';

/** Blender renders parts at 2x the logical size; display them at half scale. */
export const PART_SCALE = 0.5;

interface PartNode {
  def: RigPart;
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Image;
  /**
   * True when an ancestor already follows the turret.
   *
   * Container rotations compound down the tree, so a weapon parented to an arm
   * inherits the arm's aim for free. Re-applying it here would double-count:
   * aiming 60deg up used to swing the rifle and saber a full 120deg, pointing
   * them backwards through the mech at steep angles.
   */
  inheritsTurret: boolean;
}

/**
 * Draws one multipart mech.
 *
 * The rig is rebuilt as a tree of Phaser containers matching MechDef.rig, so a
 * weapon parented to an arm inherits that arm's aim rotation — the arms and head
 * track the target independently of the banking chassis, which is the look the
 * reference achieved with one helper object per part.
 *
 * Facing is handled by mirroring the root container. Local rotations are
 * therefore authored in "facing right" space and converted on the way in.
 */
export class MechRenderer {
  readonly root: Phaser.GameObjects.Container;
  private readonly bank: Phaser.GameObjects.Container;
  private readonly nodes = new Map<string, PartNode>();
  private readonly def: MechDef;
  private flashTimer = 0;
  private hitFlash = 0;
  /** Layer base; the y term in depthSortAt orders mechs within the layer. */
  private depthBase = 20;

  constructor(scene: Phaser.Scene, def: MechDef, mechId: string) {
    this.def = def;
    this.root = scene.add.container(0, 0);
    this.bank = scene.add.container(0, 0);
    this.root.add(this.bank);

    // Build every node first so parents exist before children attach.
    const inherits = buildTurretInheritance(def.rig.parts);

    for (const part of def.rig.parts) {
      const key = `mech_${mechId}_${part.name}`;
      const container = scene.add.container(part.x, part.y);
      const sprite = scene.add.image(0, 0, key);
      sprite.setOrigin(0.5, 0.5);
      sprite.setScale(PART_SCALE);
      container.add(sprite);
      container.rotation = part.rotation * DEG;
      this.nodes.set(part.name, {
        def: part,
        container,
        sprite,
        inheritsTurret: inherits.get(part.name) ?? false,
      });
    }

    // Attach children to parents, roots to the bank container.
    for (const part of def.rig.parts) {
      const node = this.nodes.get(part.name)!;
      const parent = part.parent ? this.nodes.get(part.parent) : null;
      (parent ? parent.container : this.bank).add(node.container);
    }

    // The saber is stowed until a melee sequence lights it.
    this.setPartVisible('meleeWeapon', false);

    // Apply the authored draw order by re-sorting siblings within each parent.
    const order = def.rig.drawOrder;
    for (const name of order) {
      const node = this.nodes.get(name);
      if (!node) continue;
      const parent = node.container.parentContainer;
      if (parent) parent.bringToTop(node.container);
    }
  }

  get displayHeight(): number {
    return this.def.rig.chassisHeight;
  }

  /** Flags a white damage flash for a few frames. */
  flashHit(): void {
    this.hitFlash = 6;
  }

  /**
   * Syncs the rig to the simulation state.
   *
   * `screenX/screenY` are already camera-transformed by the caller.
   */
  sync(c: Combatant, screenX: number, screenY: number, dt: number): void {
    this.root.setPosition(screenX, screenY);
    this.root.setVisible(c.alive || c.act === ActState.Dead);

    // Pseudo-3D: machines higher in the arena read as further away. Presentation
    // only - collision is deliberately depth-independent (see core/Depth.ts).
    const depth = depthScaleAt(c.y);
    const facing = c.facing;
    this.root.scaleX = facing * depth;
    this.root.scaleY = depth;
    this.root.setDepth(depthSortAt(c.y, this.depthBase));

    // Mirroring the root negates rotations, so convert world angles into the
    // container's local space.
    const bankLocal = facing > 0 ? c.bank : -c.bank;
    const aimLocal = facing > 0 ? c.aim : wrapAngle(Math.PI - c.aim);

    // Idle hover bob, plus a downward sink while braking hard.
    const bob = Math.sin(c.bobPhase) * 1.6;
    this.bank.y = bob;
    this.bank.rotation = bankLocal;

    const turretRot = wrapAngle(aimLocal - bankLocal);
    const spinLocal = facing > 0 ? c.spin : -c.spin;
    // The simulation says when an arm is carrying a swing. Testing the attack
    // kind here missed the lock-on sequence entirely — it never sets `attack` —
    // so the blade was held rigidly at the aim and dragged into the target.
    const meleeing = c.swinging;

    // Mirroring the root negates rotations, so the stride flips with facing too,
    // keeping the leading leg the leading leg whichever way the mech walks.
    const pose: RigPose = {
      turretRot,
      spin: spinLocal,
      thrust: c.thrust,
      meleeing,
      walkPhase: facing > 0 ? c.walkPhase : -c.walkPhase,
      stride: c.stride,
    };
    for (const node of this.nodes.values()) {
      node.container.rotation = partLocalRotation(node.def, node.inheritsTurret, pose);
    }

    // Damage flash: tint every part white briefly.
    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
      const on = Math.floor(this.hitFlash * 2) % 2 === 0;
      for (const n of this.nodes.values()) {
        if (on) n.sprite.setTintFill(0xffffff);
        else n.sprite.clearTint();
      }
    } else {
      for (const n of this.nodes.values()) n.sprite.clearTint();
    }

    // Hitstop shudder, so heavy connects read as impact.
    if (c.hitstop > 0) {
      this.flashTimer += dt;
      const j = c.hitstop > 0 ? 1.6 : 0;
      this.root.x += Math.sin(this.flashTimer * 40) * j;
    }

    // Saturation aura: gently pulse the whole rig's alpha while a mode is up.
    this.root.alpha = c.satActive ? 0.86 + Math.sin(c.bobPhase * 4) * 0.14 : 1;

    // Dead mechs tumble.
    if (!c.alive) {
      this.root.rotation += 0.06 * dt * 60 * 0.016;
      this.root.alpha = clamp(this.root.alpha - 0.01, 0, 1);
    }
  }

  /** Hides/shows a single part, e.g. stowing the rifle during a sword swing. */
  setPartVisible(name: string, visible: boolean): void {
    const node = this.nodes.get(name);
    if (node) node.container.setVisible(visible);
  }

  /**
   * World-space transform of a part, for spawning muzzle/thruster effects and
   * for laying glow over a modelled weapon.
   *
   * `angle` is taken from the matrix basis vectors rather than Phaser's
   * `matrix.rotation`, whose decomposition drops the sign once the rig is
   * mirrored (it reports +120deg for a part actually drawn at -120deg).
   * `scale` folds in the facing mirror and the pseudo-3D depth scale, so
   * callers can size effects to match what is on screen.
   */
  partWorld(name: string): { x: number; y: number; angle: number; scale: number } | null {
    const node = this.nodes.get(name);
    if (!node) return null;
    const m = node.container.getWorldTransformMatrix();
    return {
      x: m.tx,
      y: m.ty,
      angle: Math.atan2(m.b, m.a),
      scale: Math.hypot(m.a, m.b),
    };
  }

  /** Sets the layer base; sync() adds the per-frame y ordering on top. */
  setDepth(d: number): void {
    this.depthBase = d;
    this.root.setDepth(d);
  }

  destroy(): void {
    this.root.destroy(true);
    this.nodes.clear();
  }
}
