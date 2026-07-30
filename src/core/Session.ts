import type { MatchOutcome } from '../combat/MatchSim';

export type MatchMode = 'vsCpu' | 'aiVsAi' | 'training';

export const MODE_LABELS: Record<MatchMode, string> = {
  vsCpu: 'VERSUS CPU',
  aiVsAi: 'CPU VS CPU',
  training: 'TRAINING',
};

export const DIFFICULTY_NAMES = [
  '',
  'ROOKIE',
  'CADET',
  'REGULAR',
  'VETERAN',
  'ELITE',
  'ACE',
  'COMMANDER',
  'LEGEND',
];

/**
 * Cross-scene state. Kept tiny and explicit rather than stuffed into the Phaser
 * registry, so scene transitions are easy to follow.
 */
export const session = {
  mode: 'vsCpu' as MatchMode,
  /** Rival AI level, 1..8, mirroring the reference's eight AI tiers. */
  difficulty: 5,
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
    return 0x5eed0000 + this.matchIndex * 7919 + this.difficulty * 131;
  },
};
