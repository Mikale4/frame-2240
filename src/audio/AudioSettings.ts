/**
 * Independent music and effect levels, persisted across sessions.
 *
 * This replaced a single ON/MUTED toggle. One switch could not answer the
 * question people actually have about a soundtrack — not "is there music" but
 * "is there too much of it" — and the mix that is right while learning the
 * controls is not the mix that is right on the twentieth match.
 *
 * **Both buses share one scale.** A step is worth the same gain on either, so
 * `MUSIC 70 / SFX 80` says plainly that music sits under the effects, and
 * levelling the two numbers levels the two buses. Per-bus maxima would have made
 * the defaults look rounder and the comparison meaningless.
 *
 * Stored as integer steps rather than floats: it is what the menu adjusts, it
 * survives a JSON round trip exactly, and there is no such thing as a corrupt
 * half-step.
 */

/** Steps from silent to full. Eleven positions, 0..10. */
export const VOLUME_STEPS = 10;

/**
 * Gain at full.
 *
 * Chosen so the shipped defaults land on the levels the game already mixed at —
 * effects 0.32, music 0.26 — while leaving room above them. A player who finds
 * the music quiet has somewhere to go, which a scale topping out at the default
 * would not have given them.
 */
export const BUS_MAX_GAIN = 0.4;

/** 70 % → 0.28. The music bus, a little under the effects, as before. */
export const DEFAULT_MUSIC_STEP = 7;
/** 80 % → 0.32, exactly the level effects have always played at. */
export const DEFAULT_SFX_STEP = 8;

export interface AudioSettings {
  /** Music bus, 0..VOLUME_STEPS. */
  music: number;
  /** Effects bus, 0..VOLUME_STEPS. */
  sfx: number;
}

const STORAGE_KEY = 'bsr.audio.v1';

export function defaultAudioSettings(): AudioSettings {
  return { music: DEFAULT_MUSIC_STEP, sfx: DEFAULT_SFX_STEP };
}

/** Audio gain for a step. Step 0 is true silence, not merely quiet. */
export function stepToGain(step: number): number {
  return (clampStep(step) / VOLUME_STEPS) * BUS_MAX_GAIN;
}

/** Menu text for a step. Zero reads as OFF, because 0 % reads as a bug. */
export function stepLabel(step: number): string {
  const s = clampStep(step);
  const bar = '■'.repeat(s) + '□'.repeat(VOLUME_STEPS - s);
  return s === 0 ? `${bar}  OFF` : `${bar}  ${s * 10}%`;
}

export function clampStep(step: number): number {
  if (!Number.isFinite(step)) return 0;
  return Math.max(0, Math.min(VOLUME_STEPS, Math.round(step)));
}

/**
 * Merges a stored blob over the defaults, discarding anything malformed.
 *
 * Same posture as `normalizeBindings`: a hand-edited or truncated entry must
 * never leave the game silent with no obvious way back, so a bad field falls
 * back to its default rather than to zero.
 */
export function normalizeAudioSettings(raw: unknown): AudioSettings {
  const out = defaultAudioSettings();
  if (!raw || typeof raw !== 'object') return out;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.music === 'number' && Number.isFinite(obj.music)) out.music = clampStep(obj.music);
  if (typeof obj.sfx === 'number' && Number.isFinite(obj.sfx)) out.sfx = clampStep(obj.sfx);
  return out;
}

function storage(): Storage | null {
  try {
    // Access can throw in sandboxed/private contexts.
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadAudioSettings(): AudioSettings {
  const s = storage();
  if (!s) return defaultAudioSettings();
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (!raw) return defaultAudioSettings();
    return normalizeAudioSettings(JSON.parse(raw));
  } catch {
    return defaultAudioSettings();
  }
}

export function saveAudioSettings(v: AudioSettings): boolean {
  const s = storage();
  if (!s) return false;
  try {
    s.setItem(STORAGE_KEY, JSON.stringify({ music: clampStep(v.music), sfx: clampStep(v.sfx) }));
    return true;
  } catch {
    return false;
  }
}
