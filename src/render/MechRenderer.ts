import Phaser from 'phaser';
import type { Combatant } from '../combat/Combatant';
import type { MechDef, RigPart } from '../mechs/MechDef';
import { ActState, ProjKind } from '../combat/types';
import { DEG, clamp, wrapAngle } from '../core/MathUtil';
import { depthScaleAt, depthSortAt } from '../core/Depth';

/** Blender renders parts at 2x the logical size; display them at half scale. */
export const PART_SCALE = 0.5;

interface PartNode {
  def: RigPart;
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Image;
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
    for (const part of def.rig.parts) {
      const key = `mech_${mechId}_${part.name}`;
      const container = scene.add.container(part.x, part.y);
      const sprite = scene.add.image(0, 0, key);
      sprite.setOrigin(0.5, 0.5);
      sprite.setScale(PART_SCALE);
      container.add(sprite);
      container.rotation = part.rotation * DEG;
      this.nodes.set(part.name, { def: part, container, sprite });
    }

    // Attach children to parents, roots to the bank container.
    for (const part of def.rig.parts) {
      const node = this.nodes.get(part.name)!;
      const parent = part.parent ? this.nodes.get(part.parent) : null;
      (parent ? parent.container : this.bank).add(node.container);
    }

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
    const meleeing = c.attack?.kind === ProjKind.Melee;

    for (const node of this.nodes.values()) {
      const p = node.def;
      switch (p.follow) {
        case 'chassis':
          node.container.rotation = p.rotation * DEG;
          break;
        case 'turret': {
          // Arms and head track the aim; during a sword swing the whole upper
          // body spins with the blade instead.
          let r = turretRot * (p.name === 'head' ? 0.55 : 1) + p.rotation * DEG;
          if (meleeing && p.name !== 'head') r += spinLocal;
          node.container.rotation = r;
          break;
        }
        case 'thruster': {
          // Thrusters splay outward under load and gimbal against the aim.
          const splay = (p.name === 'leftThruster' ? -1 : 1) * c.thrust * 9 * DEG;
          node.container.rotation = p.rotation * DEG + splay - turretRot * 0.12;
          break;
        }
        default:
          node.container.rotation = p.rotation * DEG;
      }
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

  /** World-space position of a part, for spawning muzzle/thruster effects. */
  partWorld(name: string): { x: number; y: number } | null {
    const node = this.nodes.get(name);
    if (!node) return null;
    const m = node.container.getWorldTransformMatrix();
    return { x: m.tx, y: m.ty };
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
