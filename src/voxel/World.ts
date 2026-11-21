import { ARENA_H, ARENA_W, DECK_Y } from '../core/GameConfig';

/**
 * The one mapping between the simulation's plane and the voxel world.
 *
 * **The fight is still two-dimensional.** `MatchSim` moves every body, shot and
 * hit volume in its own x/y plane — x right, y *down*, the deck at `DECK_Y` —
 * and nothing about the voxel conversion changes that: the game plays exactly
 * as it did. What changed is how that plane is shown. It is now a vertical
 * slice standing in a three-dimensional yard, seen through a perspective
 * camera from above and in front, the way KNOCK//BACK frames its stage.
 *
 * World axes: +X right, +Y up, +Z toward the camera. The fight plane is z = 0,
 * the arena's horizontal centre is x = 0, and the deck surface — where a landed
 * machine's feet rest — is y = 0.
 */

/** World units per simulation pixel. A 104 px chassis stands 2.6 units tall. */
export const WORLD_PER_PX = 1 / 40;

/** Sim x → world X. */
export function worldX(x: number): number {
  return (x - ARENA_W / 2) * WORLD_PER_PX;
}

/** Sim y (down) → world Y (up), with the deck at 0. */
export function worldY(y: number): number {
  return (DECK_Y - y) * WORLD_PER_PX;
}

/** World X → sim x. */
export function simX(wx: number): number {
  return wx / WORLD_PER_PX + ARENA_W / 2;
}

/** World Y → sim y. */
export function simY(wy: number): number {
  return DECK_Y - wy / WORLD_PER_PX;
}

/**
 * Sim angle (radians, y-down, clockwise-positive on screen) → world rotation
 * about +Z (y-up, counter-clockwise-positive).
 */
export function worldAngle(a: number): number {
  return -a;
}

/** The playable rectangle in world units. */
export const PLAY_LEFT = worldX(0);
export const PLAY_RIGHT = worldX(ARENA_W);
/** The sim's ceiling (y = 0) in world units. */
export const PLAY_TOP = worldY(0);
export const PLAY_BOTTOM = worldY(ARENA_H);
