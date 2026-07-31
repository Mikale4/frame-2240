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
  /** Melee sword spin. */
  spin: number;
  /** Forward weapon extension in logical pixels, along the aim. See `partReachOffset`. */
  reach: number;
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
}

/** Peak leg swing at full stride, in radians. */
export const STRIDE_MAX = 26 * DEG;
/** How far the legs splay apart when planted and still. */
export const STANCE = 5 * DEG;

/** The head tracks the aim only partly, so the cockpit reads as leading it. */
export const HEAD_TRACKING = 0.55;

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
  if (!pose.meleeing || pose.reach === 0) return { x: 0, y: 0 };
  if (part.follow !== 'turret' || inheritsTurret || part.name === 'head') return { x: 0, y: 0 };
  const a = pose.turretRot + pose.spin;
  return { x: Math.cos(a) * pose.reach, y: Math.sin(a) * pose.reach };
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
      // Already carried down from an ancestor: contribute only the authored offset.
      if (inheritsTurret) return own;
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
      const side = part.follow === 'legNear' ? 0 : Math.PI;
      const swing = Math.sin(pose.walkPhase + side) * STRIDE_MAX * pose.stride;
      const rest = (part.follow === 'legNear' ? 1 : -1) * STANCE * (1 - pose.stride);
      return own + swing + rest;
    }
    default:
      return own;
  }
}
