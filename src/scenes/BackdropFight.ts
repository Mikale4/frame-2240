import { Difficulty } from '../core/Session';
import { ROSTER } from '../data/mechs';

/**
 * The fight run behind the title screen: who, and how well.
 *
 * Passed to `BattleScene` as scene data rather than written to `session`, so the
 * background never overwrites the machines and tiers the player last picked.
 */
export interface BackdropSpec {
  player: string;
  enemy: string;
  tier: Difficulty;
}

/** Two different machines at random, both at the top tier — the old demo's casting. */
export function randomBackdrop(rand: () => number = Math.random): BackdropSpec {
  const ids = ROSTER.map((m) => m.id);
  const a = Math.floor(rand() * ids.length);
  const b = (a + 1 + Math.floor(rand() * (ids.length - 1))) % ids.length;
  return { player: ids[a], enemy: ids[b], tier: Difficulty.Extreme };
}
