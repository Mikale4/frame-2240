import { ARENA_H } from './GameConfig';
import { clamp01 } from './MathUtil';

/**
 * Pseudo-3D depth from vertical position.
 *
 * Ported from the 2005 reference, which kept a per-frame scale factor:
 *
 *     fvar(35) = (ScreenPos Y + 25) / 240.0 * 0.4 + 0.8
 *
 * Over its 240px play field that runs ~0.8 at the top to ~1.2 at the bottom:
 * machines higher up read as further away. It is a large part of why the
 * reference arenas feel like they have depth instead of being a flat plane.
 *
 * This is a **presentation** transform. The reference applied it to the drawing
 * scale of the part helpers, not to collision, and we do the same: hitboxes stay
 * depth-independent so a pilot's effective size never changes with altitude.
 * Keeping collision flat also keeps the simulation trivially deterministic and
 * leaves the existing arena-containment guarantees intact.
 */

export const DEPTH_SCALE_MIN = 0.82;
export const DEPTH_SCALE_MAX = 1.22;

/** Scale factor for something drawn at arena `y`. */
export function depthScaleAt(y: number, arenaH: number = ARENA_H): number {
  const t = clamp01(y / Math.max(1, arenaH));
  return DEPTH_SCALE_MIN + t * (DEPTH_SCALE_MAX - DEPTH_SCALE_MIN);
}

/**
 * Render depth so lower-on-screen objects draw in front.
 *
 * `base` separates broad layers (mechs vs projectiles vs effects); the y term
 * orders within a layer.
 */
export function depthSortAt(y: number, base: number, arenaH: number = ARENA_H): number {
  return base + clamp01(y / Math.max(1, arenaH)) * 9;
}
