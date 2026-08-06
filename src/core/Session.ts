import type { MatchOutcome } from '../combat/MatchSim';
import { defaultAudioSettings } from '../audio/AudioSettings';
import { defaultTrainingSettings } from './TrainingSettings';

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
  /**
   * The pilot each side can call in. **A property of the machine, not of the
   * player** — a CPU-held slot picks one exactly as a human-held slot does, so
   * an assist is part of what a chassis brings to a fight rather than a
   * privilege of the near side.
   *
   * Must always be one of that chassis's two in `TAG_PAIRS`; these defaults
   * are `halcyon[0]` and `nocturne[0]`, matching the default mechs above.
   * `MechSelectScene` re-derives them whenever a machine is chosen, so an
   * illegal pair cannot survive a trip through the menus.
   */
  playerTag: 'vesper',
  enemyTag: 'nulltide',
  /**
   * Whether TAG/ASSIST is in play at all.
   *
   * A match rule rather than a preference, which is why it sits beside `mode`
   * on the main menu instead of under SETTINGS: turning it off does not adjust
   * the game, it removes a mechanic and two whole stages from mech select, and
   * a pure 1v1 is a legitimate thing to want. **Off means off everywhere** —
   * no partner defs reach `MatchSim`, so the clock never runs, no body is ever
   * built, and the HUD row stays blank.
   *
   * Training ignores it either way; the dummy calls nobody.
   */
  assists: true,
  /**
   * The arena being fought over.
   *
   * There is exactly one, hard-coded in `render/Backdrop.ts` — three fixed
   * parallax layers, no arena data and no selection screen. It lives here anyway
   * because the battle music takes its third candidate from the stage
   * (`stage_<arena>`), and routing that through a field rather than a literal is
   * what lets a second arena arrive as data instead of as a code change.
   */
  arena: 'cathedral_yard',
  /** Incremented per match so each rematch gets a fresh deterministic seed. */
  matchIndex: 0,
  lastOutcome: 'none' as MatchOutcome,
  lastTimeLeft: 0,
  lastPlayerLife: 0,
  lastEnemyLife: 0,
  /**
   * Music and effect levels, in steps. Loaded from storage during boot and
   * written back whenever the player moves one, so a mix survives a restart —
   * a balance you have to set again every launch is not a setting.
   */
  audio: defaultAudioSettings(),

  /**
   * Training-room switches. Read only while `mode === 'training'`.
   *
   * Not persisted to storage, unlike `audio`: a mix is a preference, but a rig
   * left on 25 % life with infinite saturation is a thing you set up for one
   * session and would not expect to find waiting for you next launch.
   */
  training: defaultTrainingSettings(),

  seed(): number {
    return (
      0x5eed0000 + this.matchIndex * 7919 + this.enemyDifficulty * 131 + this.playerDifficulty * 17
    );
  },
};
