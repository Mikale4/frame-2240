/**
 * The soundtrack manifest: what `docs/MUSIC_CUE_SHEET.md` declares, what is
 * actually on disk, and how a battle picks its track.
 *
 * Nothing here touches Web Audio — this is the part that has to be testable, and
 * `MusicPlayer` is the part that has to be heard. The split matters because the
 * battle roll has a hard correctness requirement (§ `pickBattleCue`) that would
 * otherwise only be checkable by ear.
 *
 * Names are load-bearing: the player loads `music/<name>.mp3` and a cue that is
 * not listed here is never requested.
 */

import type { MatchMode } from '../core/Session';

export interface MusicCueDef {
  /** Cue name, matching the cue sheet's Cue name column. */
  name: string;
  /**
   * Whether `assets/music/<name>.mp3` exists.
   *
   * Hand-maintained, exactly like `BootScene`'s `MODELLED` / `PORTRAITS` sets,
   * and for the same reason: Vite answers an unknown path with `index.html` and
   * a 200, so requesting a track that is not there hands the audio decoder HTML
   * rather than failing cleanly. The only safe guard is to not ask.
   *
   * `music.test.ts` asserts this column against the directory in both
   * directions, so a track that lands without its flag being flipped — or a flag
   * flipped without the track — fails the suite rather than going quiet.
   */
  present: boolean;
  /**
   * Playback gain, relative to the music bus.
   *
   * The tracks are separately generated and are not loudness-matched, so this is
   * where one that lands hot gets pulled down. Left at 1 until an ear says
   * otherwise — guessing at it from file size would be worse than not guessing.
   */
  gain?: number;
}

/**
 * Every track the game knows about. Seven screen tracks, eight pilot themes, one
 * stage theme, plus the optional `battle` fallback.
 *
 * Order is the cue sheet's order, not alphabetical, so the two documents can be
 * read side by side.
 */
export const MUSIC_CUES: MusicCueDef[] = [
  // Screens
  { name: 'title', present: true },
  { name: 'menu', present: true },
  { name: 'select', present: true },
  { name: 'battle_danger', present: true },
  { name: 'results_win', present: true },
  { name: 'results_lose', present: true },
  { name: 'training', present: true },

  // Pilot themes
  { name: 'theme_halcyon', present: true },
  { name: 'theme_nocturne', present: true },
  { name: 'theme_vesper', present: true },
  { name: 'theme_terramoth', present: true },
  { name: 'theme_cirrus', present: true },
  { name: 'theme_obelisk', present: false },
  { name: 'theme_pyre', present: false },
  { name: 'theme_nulltide', present: false },

  // Stage themes — one arena exists (see `render/Backdrop.ts`).
  { name: 'stage_cathedral_yard', present: false },

  // Optional fallback, only reachable when every rolled candidate is missing.
  { name: 'battle', present: false },
];

const BY_NAME = new Map(MUSIC_CUES.map((c) => [c.name, c]));

/** The cue definition, or undefined for a name the manifest does not declare. */
export function musicCue(name: string): MusicCueDef | undefined {
  return BY_NAME.get(name);
}

/**
 * Is this cue safe to request?
 *
 * Both halves matter: declared *and* on disk. An undeclared name is a typo, and
 * a declared-but-absent one is a track still in generation.
 */
export function musicAvailable(name: string): boolean {
  return BY_NAME.get(name)?.present === true;
}

/** Path the player fetches, relative like every other asset load. */
export function musicFile(name: string): string {
  return `music/${name}.mp3`;
}

export interface BattleTrackQuery {
  mode: MatchMode;
  playerMech: string;
  enemyMech: string;
  /** Arena id, e.g. `cathedral_yard`. */
  arena: string;
}

/**
 * The three tracks a fight draws from, in cue-sheet order: the left pilot's
 * theme, the right pilot's, and the ground they are fighting over.
 *
 * A mirror match collapses to two — the duplicate is removed rather than getting
 * double weight, so fighting yourself does not make your own theme twice as
 * likely as the stage's.
 *
 * Availability is not considered here; this is the roster of candidates, and
 * `pickBattleCue` is what knows which of them exist.
 */
export function battleCandidates(q: BattleTrackQuery): string[] {
  const raw = [`theme_${q.playerMech}`, `theme_${q.enemyMech}`, `stage_${q.arena}`];
  return [...new Set(raw)];
}

/**
 * Picks the track for one match. Returns null for silence.
 *
 * **`rand` must not be the simulation's RNG.** `MatchSim` is seeded and
 * `match.test.ts` asserts a bit-identical replay for the same seed and inputs;
 * drawing a number from that stream would shift every subsequent roll and change
 * the fight. Music is presentation, so the scene layer passes `Math.random`.
 * That is also why this takes `rand` as a parameter rather than reaching for a
 * generator itself — the dependency is the whole point, so it is explicit.
 *
 * Training never rolls: it has no opponent and people sit in it for a long time,
 * so it gets the one track written for exactly that.
 *
 * **On missing candidates.** The cue sheet describes rolling across all three
 * and falling through when the winner is absent. This rolls uniformly across the
 * candidates that *exist*, then falls back to `battle`, then to silence. The two
 * readings are identical once all sixteen tracks are generated — every candidate
 * is present, so nothing ever falls through — and they differ only while the set
 * is partial, where falling through would pile most matches onto whichever track
 * happens to sit last in the list. Rolling over what exists keeps the variety
 * the roll is for during exactly the period the roll is least able to deliver it.
 */
export function pickBattleCue(
  q: BattleTrackQuery,
  rand: () => number,
  available: (cue: string) => boolean = musicAvailable,
): string | null {
  if (q.mode === 'training') return available('training') ? 'training' : null;

  const live = battleCandidates(q).filter(available);
  if (live.length > 0) return live[Math.min(live.length - 1, Math.floor(rand() * live.length))];
  if (available('battle')) return 'battle';
  return null;
}

/**
 * Life fraction at or below which `battle_danger` takes over from whichever
 * track won the roll. From the cue sheet: either pilot, not just the player.
 */
export const DANGER_LIFE_FRACTION = 0.25;
