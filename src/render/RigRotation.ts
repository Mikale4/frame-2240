/**
 * Rig rotation rules, kept free of Phaser so they can be unit-tested.
 *
 * `MechRenderer` builds the rig as a tree of nested containers, and container
 * rotations compound down that tree. That is the whole point — a weapon held by
 * an arm should swing with the arm — but it means a part may only contribute the
 * rotation its ancestors have *not* already applied.
 *
 * Getting this wrong is not subtle at steep aim angles: when every turret part
 * applied the aim itself, a rifle or beam saber parented to an arm rotated twice,
 * so aiming 60deg up drew the weapon at 120deg — pointing back through the mech.
 */

import type { RigPart } from '../mechs/MechDef';
import { DEG } from '../core/MathUtil';

/** The per-frame values the rig rotates against. All angles in radians. */
export interface RigPose {
  /** Aim, expressed relative to the banking chassis. */
  turretRot: number;
  /** Melee sword spin, applied to every turret part. */
  spin: number;
  /**
   * Extra rotation for the melee weapon *relative to the arm holding it*.
   *
   * Without this a swing can only ever be a rigid lever: the weapon inherits the
   * arm's rotation and contributes nothing, so the blade pivots about the
   * shoulder and the arc has no shape. In the reference the gripped hand rotates
   * through more than 150 degrees independently of where the arm is, which is
   * what makes a blade lead into a cut and trail out of it.
   */
  weaponSpin: number;
  /**
   * Chassis commitment to the swing, in radians.
   *
   * The reference's hips rotate substantially through a strike. Side-on we
   * cannot show a twist about the vertical, but leaning the chassis into the
   * blow and recoiling out of it reads as the same commitment.
   */
  lean: number;
  /** Forward weapon extension in logical pixels, along the aim. See `partReachOffset`. */
  reach: number;
  /**
   * Weapon travel *across* the aim, in logical pixels.
   *
   * The reference's hand does not rotate about a fixed shoulder — it traces a
   * loop, travelling roughly 18 px forward and 25 px vertically at our scale.
   * `reach` alone can only push along the aim, which is why the swing read as
   * flat.
   */
  lift: number;
  /** Normalised thruster load, 0..1. */
  thrust: number;
  /** True while a melee attack is actually swinging. */
  meleeing: boolean;
  /** Walk cycle phase in radians; one full stride per 2*PI. */
  walkPhase: number;
  /**
   * How much stride to apply, 0..1. Scales with ground speed, so a mech that
   * stops mid-step settles rather than freezing mid-stride.
   */
  stride: number;
  /**
   * Airborne dangle per leg, in radians, already mirrored for facing.
   *
   * Separate from `walkPhase` because they answer different questions: the walk
   * cycle is a gait and this is a hanging limb. See `Combatant.legSwing` for why
   * it exists at all — the gait is gated on being grounded, which never happens.
   */
  legNear: number;
  legFar: number;
}

/** Peak leg swing at full stride, in radians. */
export const STRIDE_MAX = 26 * DEG;
/** How far the legs splay apart when planted and still. */
export const STANCE = 5 * DEG;

/** The head tracks the aim only partly, so the cockpit reads as leading it. */
export const HEAD_TRACKING = 0.55;

/**
 * Parts that rotate *within the grip* during a swing.
 *
 * They inherit the arm's rotation already; `weaponSpin` is what they add on top.
 */
const WEAPON_PARTS = new Set(['meleeWeapon', 'meleeEnergy']);

/**
 * For each part, whether an ancestor already follows the turret.
 *
 * Walks the whole parent chain rather than checking only the immediate parent,
 * so a deeper rig (weapon -> mount -> arm) stays correct.
 */
export function buildTurretInheritance(parts: readonly RigPart[]): Map<string, boolean> {
  const byName = new Map(parts.map((p) => [p.name, p]));
  const out = new Map<string, boolean>();

  for (const part of parts) {
    let inherits = false;
    const seen = new Set<string>([part.name]);
    let cur = part.parent ? byName.get(part.parent) : undefined;
    while (cur) {
      if (cur.follow === 'turret') {
        inherits = true;
        break;
      }
      // A malformed rig must not hang the renderer.
      if (seen.has(cur.name)) break;
      seen.add(cur.name);
      cur = cur.parent ? byName.get(cur.parent) : undefined;
    }
    out.set(part.name, inherits);
  }
  return out;
}

/**
 * Extra translation for one part, in logical pixels, in its PARENT's space.
 *
 * A container's rotation turns its children but not its own position, so a
 * forward lunge cannot be expressed as `x += reach` — that would push the arm
 * along the chassis axis regardless of where the mech is aiming. The offset is
 * therefore resolved along `turretRot + spin`: the direction the weapon is
 * actually pointing at this instant, so a thrust follows the blade.
 *
 * Applied only to top-level turret parts. Anything that inherits the turret is
 * already a child of one of those and is carried along by it; applying the
 * offset again would double it.
 */
export function partReachOffset(
  part: RigPart,
  inheritsTurret: boolean,
  pose: RigPose,
): { x: number; y: number } {
  if (!pose.meleeing || (pose.reach === 0 && pose.lift === 0)) return { x: 0, y: 0 };
  if (part.follow !== 'turret' || inheritsTurret || part.name === 'head') return { x: 0, y: 0 };
  const a = pose.turretRot + pose.spin;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  // `reach` runs along the aim, `lift` across it. Two axes, because the
  // reference's hand traces a loop rather than sliding along one line — a single
  // forward axis can only ever produce a lunge.
  return {
    x: ca * pose.reach - sa * pose.lift,
    y: sa * pose.reach + ca * pose.lift,
  };
}

/**
 * The rotation to write onto one part's container, in radians.
 *
 * `inheritsTurret` must come from `buildTurretInheritance`.
 */
export function partLocalRotation(part: RigPart, inheritsTurret: boolean, pose: RigPose): number {
  const own = part.rotation * DEG;

  switch (part.follow) {
    case 'turret': {
      // Already carried down from an ancestor: contribute only the authored
      // offset — plus, for the weapon itself, its rotation *within the grip*.
      // That term is what turns a rigid lever into a swing.
      if (inheritsTurret) {
        return pose.meleeing && WEAPON_PARTS.has(part.name) ? own + pose.weaponSpin : own;
      }
      let r = own + pose.turretRot * (part.name === 'head' ? HEAD_TRACKING : 1);
      if (pose.meleeing && part.name !== 'head') r += pose.spin;
      return r;
    }
    case 'thruster': {
      // Thrusters splay outward under load and gimbal against the aim.
      const splay = (part.name === 'leftThruster' ? -1 : 1) * pose.thrust * 9 * DEG;
      return own + splay - pose.turretRot * 0.12;
    }
    case 'legNear':
    case 'legFar': {
      // The two legs stride half a cycle apart. At rest they settle into a
      // slight splayed stance rather than snapping to a single overlapping pose,
      // which would make the two leg sprites collapse into one silhouette.
      const near = part.follow === 'legNear';
      const side = near ? 0 : Math.PI;
      const swing = Math.sin(pose.walkPhase + side) * STRIDE_MAX * pose.stride;
      const rest = (near ? 1 : -1) * STANCE * (1 - pose.stride);
      // Airborne dangle, faded out by the stride so a walking mech keeps its
      // gait and a flying one — which is all of them, nearly all the time —
      // gets the full hang. The two terms are never both fully on.
      const dangle = (near ? pose.legNear : pose.legFar) * (1 - pose.stride);
      return own + swing + rest + dangle;
    }
    case 'chassis':
      // The body commits to the strike and recoils out of it.
      return own + (pose.meleeing ? pose.lean : 0);
    default:
      return own;
  }
}
