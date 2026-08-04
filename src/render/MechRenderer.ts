import Phaser from 'phaser';
import type { Combatant } from '../combat/Combatant';
import type { MechDef, RigPart } from '../mechs/MechDef';
import { ActState } from '../combat/types';
import { DEG, clamp, wrapAngle } from '../core/MathUtil';
import { depthScaleAt, depthSortAt } from '../core/Depth';
import {
  buildTurretInheritance,
  partLocalRotation,
  partReachOffset,
  type RigPose,
} from './RigRotation';
import { partTexture } from './PartTexture';

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
 * The exact surface `MechRenderer.sync` reads off a machine.
 *
 * A `Combatant` satisfies this, and so must any stand-in drawn through the same
 * renderer — today that is `BattleScene.decoyState`, which fabricates one for
 * each of NULLTIDE's projections. Declaring the contract structurally is what
 * makes that stand-in the compiler's problem instead of the player's; see the
 * note on `sync`.
 */
export interface MechPoseSource {
  alive: boolean;
  act: ActState;
  y: number;
  facing: number;
  aim: number;
  bank: number;
  bobPhase: number;
  spin: number;
  reach: number;
  thrust: number;
  swinging: boolean;
  /** Freeze frames on impact; the renderer jitters the rig while it runs. */
  hitstop: number;
  satActive: boolean;
  walkPhase: number;
  stride: number;
  /** `[near, far]` airborne dangle. See `Combatant.legSwing`. */
  legSwing: readonly number[];
  status: Combatant['status'];
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
  /** Larger, fainter copy of the projected blade, pulsed out of phase with it. */
  private energyHalo: Phaser.GameObjects.Image | null = null;
  /** Free-running clock for the blade's surge, in seconds. */
  private energyPhase = 0;
  /** Layer base; the y term in depthSortAt orders mechs within the layer. */
  private depthBase = 20;

  constructor(scene: Phaser.Scene, def: MechDef, mechId: string) {
    this.def = def;
    this.root = scene.add.container(0, 0);
    this.bank = scene.add.container(0, 0);
    // Chassis size lives here rather than on each sprite, so part offsets scale
    // with the parts. Scaling only the sprites would grow the armour while
    // leaving the skeleton the same size, and the mech would come apart.
    this.bank.setScale(def.rig.scale);
    this.root.add(this.bank);

    // Build every node first so parents exist before children attach.
    const inherits = buildTurretInheritance(def.rig.parts);

    for (const part of def.rig.parts) {
      const tex = partTexture(scene, mechId, part.name);
      const container = scene.add.container(part.x, part.y);
      const sprite = scene.add.image(0, 0, tex.key, tex.frame);
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
    this.setPartVisible('meleeEnergy', false);

    // Projected energy is drawn additively so it reads as light rather than as
    // a painted solid, and it gets a second, larger, fainter copy behind it:
    // that halo is what makes the blade look radiated instead of cut out. The
    // two are pulsed out of phase in `apply`.
    const energy = this.nodes.get('meleeEnergy');
    if (energy) {
      // **The core blends normally; only the halo is additive.** The sprite is
      // already rendered emissive, so adding it on top of a dark stage drives
      // every channel to full and the blade comes out white — PYRE's amber and
      // NULLTIDE's cyan both vanish. The halo can be additive because it is
      // faint: that is where the bloom comes from.
      const halo = scene.add.image(0, 0, energy.sprite.texture.key, energy.sprite.frame.name);
      halo.setOrigin(0.5, 0.5);
      halo.setScale(PART_SCALE);
      halo.setBlendMode(Phaser.BlendModes.ADD);
      halo.setAlpha(0.35);
      energy.container.addAt(halo, 0);
      this.energyHalo = halo;
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

  /**
   * Flags a white damage flash.
   *
   * In *seconds*, because `sync` counts it down with `dt`. It used to be set to
   * `6` against a dt of ~0.017, i.e. a six-second white-out per hit — which also
   * buried any other tint the machine was supposed to be showing.
   */
  flashHit(): void {
    this.hitFlash = 0.18;
  }

  /**
   * Syncs the rig to the simulation state.
   *
   * `screenX/screenY` are already camera-transformed by the caller.
   */
  /**
   * Everything `sync` reads off a machine, and nothing else.
   *
   * **Not `Combatant`.** `BattleScene.decoyState` draws NULLTIDE's projections
   * through this same renderer using a hand-built stand-in object, and it used
   * to reach the parameter as `{...} as unknown as Combatant` — a cast that
   * tells the compiler to stop checking the very thing that needs checking.
   * Adding `legSwing` to the pose in D123 therefore compiled cleanly, passed 592
   * tests, and crashed the live game the moment a decoy was projected:
   *
   * ```
   * TypeError: Cannot read properties of undefined (reading '0')
   *   at MechRenderer.sync   <- c.legSwing[0]
   *   at BattleScene.drawDrone
   * ```
   *
   * Naming the contract structurally means the stand-in is type-checked against
   * it, so the next field added here fails the build instead of the match. Same
   * lesson as §8b of the handoff: a hand-built copy of a growing object is a
   * silent breakage waiting for its next field.
   */
  sync(c: MechPoseSource, screenX: number, screenY: number, dt: number): void {
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
      reach: c.reach,
      thrust: c.thrust,
      meleeing,
      walkPhase: facing > 0 ? c.walkPhase : -c.walkPhase,
      stride: c.stride,
      // Same mirroring as the stride, and for the same reason: the dangle is
      // computed in world space, so a mech that faces left must not have its
      // legs trail forward once the root mirror negates them.
      legNear: facing > 0 ? c.legSwing[0] : -c.legSwing[0],
      legFar: facing > 0 ? c.legSwing[1] : -c.legSwing[1],
    };
    for (const node of this.nodes.values()) {
      node.container.rotation = partLocalRotation(node.def, node.inheritsTurret, pose);
      // Thrusts, bashes and piston strikes throw the arm forward; blades do not,
      // and get a zero offset, so this costs a rest-pose rig nothing.
      const off = partReachOffset(node.def, node.inheritsTurret, pose);
      node.container.setPosition(node.def.x + off.x, node.def.y + off.y);
    }

    this.animateEnergy(dt);

    // Damage flash: tint every part white briefly. A status affliction otherwise
    // washes the machine in its element's colour, the way the reference
    // palette-shifted an afterimage per element (see REFERENCE_AUDIT 4d.3).
    const status = c.status.def;
    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
      // Toggles roughly every other frame, so it reads as an impact flicker.
      const on = Math.floor(this.hitFlash * 60) % 2 === 0;
      for (const n of this.nodes.values()) {
        if (on) n.sprite.setTintFill(0xffffff);
        else n.sprite.clearTint();
      }
    } else if (status) {
      // Pulsed rather than solid, so the machine's own colours still read
      // through it — but strongly enough that the affliction is unmistakable.
      const pulse = 0.5 + Math.sin(c.bobPhase * 3.1) * 0.5;
      const tint = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(0xffffff),
        Phaser.Display.Color.ValueToColor(status.tint),
        100,
        Math.round(55 + pulse * 40),
      );
      const packed = Phaser.Display.Color.GetColor(tint.r, tint.g, tint.b);
      for (const n of this.nodes.values()) n.sprite.setTint(packed);
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

    /**
     * LAST STAND: a hard, fast strobe, deliberately unlike the saturation
     * shimmer above.
     *
     * Saturation is a smooth 0.86–1.00 breath and reads as power held. This is
     * twice the rate and four times the depth, so a machine refusing to die does
     * not look like a machine with its meter up — the two states mean opposite
     * things and must never be confused at a glance.
     *
     * Read defensively because `MechRenderer` is also driven by the decoy's
     * synthetic state object, which is not a real `Combatant`.
     */
    if ((c as { lastStandActive?: boolean }).lastStandActive) {
      this.root.alpha = 0.5 + Math.abs(Math.sin(c.bobPhase * 9)) * 0.5;
    }

    /**
     * OVERDRIVE, and the wreck it leaves.
     *
     * Three whole-machine states now drive this alpha and each has to be
     * distinguishable from the other two at a glance, because they mean
     * completely different things:
     *
     * * **Saturation** — a smooth 0.86–1.00 breath. Power held.
     * * **LAST STAND** — a hard 0.50–1.00 strobe at nine. Refusal.
     * * **OVERDRIVE** — pinned bright, barely dipping, at fourteen. Not a pulse
     *   so much as a machine running past its limits: it never gets dark,
     *   because nothing is being held back.
     * * **Burnt out** — the opposite. Dim, and *unsteady* rather than periodic:
     *   two detuned sines beat against each other so the flicker never settles,
     *   which reads as damage rather than as an effect.
     *
     * Read defensively — this renderer is also driven by the decoy's synthetic
     * state, which is not a real `Combatant`.
     */
    const od = c as { overdriveActive?: boolean; overdriveSpent?: boolean };
    if (od.overdriveActive) {
      this.root.alpha = 0.88 + Math.abs(Math.sin(c.bobPhase * 14)) * 0.12;
    } else if (od.overdriveSpent) {
      const beat = Math.sin(c.bobPhase * 5.3) * Math.sin(c.bobPhase * 2.1);
      this.root.alpha = 0.62 + beat * 0.18;
    }

    // Dead mechs tumble.
    if (!c.alive) {
      this.root.rotation += 0.06 * dt * 60 * 0.016;
      this.root.alpha = clamp(this.root.alpha - 0.01, 0, 1);
    }
  }

  /** Hides/shows a single part, e.g. stowing the rifle during a sword swing. */
  /**
   * Makes a projected blade look alive.
   *
   * A baked sprite held still reads as a painted shape no matter how well it is
   * coloured — the reference's blades are never still, they surge and breathe.
   * Three cheap layers, deliberately at incommensurable rates so the result
   * never visibly repeats:
   *
   * * a slow swell, which is the blade *breathing*;
   * * a fast flicker, which is the discharge being unstable;
   * * a stretch along the blade only, so the energy looks like it is being
   *   *pushed* out of the emitter rather than uniformly scaled.
   *
   * The halo runs the same terms in **anti-phase** and larger, so the bloom
   * swells as the core dims. That counter-motion is most of what sells it as
   * radiated light rather than a glowing decal.
   */
  private animateEnergy(dt: number): void {
    const node = this.nodes.get('meleeEnergy');
    if (!node || !node.container.visible) return;
    this.energyPhase += dt;
    const t = this.energyPhase;

    // 6.1 and 23.7 rad/s share no simple ratio, so the beat is long and the
    // pulse never lands on an obvious loop.
    const swell = Math.sin(t * 6.1);
    const flicker = Math.sin(t * 23.7) * Math.sin(t * 9.3);

    node.sprite.setAlpha(0.86 + 0.10 * swell + 0.06 * flicker);
    // Length surges more than width: a beam grows out of its emitter.
    node.sprite.setScale(
      PART_SCALE * (1 + 0.045 * swell + 0.02 * flicker),
      PART_SCALE * (1 + 0.018 * swell),
    );

    const halo = this.energyHalo;
    if (!halo) return;
    halo.setAlpha(0.30 - 0.10 * swell - 0.05 * flicker);
    halo.setScale(
      PART_SCALE * (1.16 - 0.05 * swell),
      PART_SCALE * (1.22 - 0.06 * swell),
    );
  }

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

  /**
   * Shows or hides the whole rig.
   *
   * Needed by the decoy projection, which uses a second renderer that spends
   * most of a match switched off. `sync` sets visibility from the combatant's
   * own liveness, so this is only meaningful on the frames `sync` is not called.
   */
  setVisible(v: boolean): void {
    this.root.setVisible(v);
  }

  /** Whole-rig opacity. The decoy dissolves as its projection decays. */
  setAlpha(a: number): void {
    this.root.setAlpha(a);
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
