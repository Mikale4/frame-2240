import type { MatchOutcome } from '../combat/MatchSim';

export type MatchMode = 'vsCpu' | 'aiVsAi' | 'training';

export const MODE_LABELS: Record<MatchMode, string> = {
  vsCpu: 'VERSUS CPU',
  aiVsAi: 'CPU VS CPU',
  training: 'TRAINING',
};

/**
 * Rival competence, four tiers.
 *
 * Was an eight-step 1..8 dial mirroring the reference's AI levels. Eight tiers
 * sounds like more choice and delivers less: adjacent steps were a few percent
 * apart on the same handful of probability rolls, so nobody could tell 4 from 5,
 * and the top of the scale was still the same behaviour rolled more often.
 *
 * Four tiers that each play *differently* is a real choice. `EXTREME` in
 * particular is not "the same rival with better dice" — it unlocks behaviour the
 * lower tiers do not have at all. See `AI_PROFILES` in `ai/RivalAI.ts`.
 */
export const enum Difficulty {
  Easy = 0,
  Normal = 1,
  Hard = 2,
  Extreme = 3,
}

export const DIFFICULTY_NAMES: readonly string[] = ['EASY', 'NORMAL', 'HARD', 'EXTREME'];
export const DIFFICULTY_COUNT = 4;

/** Colour per tier, so the panel reads at a glance before the word does. */
export const DIFFICULTY_COLOURS: readonly string[] = ['#7fe0a0', '#8fd0ff', '#ffd166', '#ff6a7a'];

/**
 * Cross-scene state. Kept tiny and explicit rather than stuffed into the Phaser
 * registry, so scene transitions are easy to follow.
 */
export const session = {
  mode: 'vsCpu' as MatchMode,
  /**
   * Difficulty per *side*, not per match.
   *
   * A single global tier could not express the thing CPU-vs-CPU exists for:
   * watching an EXTREME rival dismantle an EASY one, or two HARD pilots grind
   * each other down. Each CPU is chosen on its own, right after its machine.
   *
   * `playerDifficulty` is only consulted when the player slot is itself a CPU —
   * that is, in `aiVsAi`. In `vsCpu` a human holds that slot and the field is
   * ignored; in `training` the rival does not act at all and neither is used.
   */
  playerDifficulty: Difficulty.Normal,
  enemyDifficulty: Difficulty.Normal,
  playerMech: 'halcyon',
  enemyMech: 'nocturne',
  /** Incremented per match so each rematch gets a fresh deterministic seed. */
  matchIndex: 0,
  lastOutcome: 'none' as MatchOutcome,
  lastTimeLeft: 0,
  lastPlayerLife: 0,
  lastEnemyLife: 0,
  muted: false,

  seed(): number {
    return (
      0x5eed0000 + this.matchIndex * 7919 + this.enemyDifficulty * 131 + this.playerDifficulty * 17
    );
  },
};
