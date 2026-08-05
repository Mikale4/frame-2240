/**
 * Projected energy flickers in **steps**, not on a sine.
 *
 * Transcribed from the 2005 reference's own animation tables
 * (`chars/rs/sff/0.air`, actions 160-163), which author the weapon glow as an
 * additive layer whose alpha jumps around a discrete ladder — 20, 30, 40, 50,
 * 60, 80, 90, 100, 120, 140, 150, 180, 200, 210 out of 256 — held for uneven
 * spans. Across that file the additive holds are 2147 frames of 1 tick, 845 of
 * 2 and 142 of 3: mostly single frames, with occasional longer rests.
 *
 * That unevenness is the whole effect. A sine of any frequency reads as a
 * *pulse* — smooth, periodic, obviously mechanical — where the reference reads
 * as something struggling to stay lit. What was here before was two multiplied
 * sines over a 0.70-1.02 alpha range, which is neither deep enough nor irregular
 * enough to register as flicker at all.
 *
 * Three loops of different lengths (10, 12, 9) are concatenated rather than one
 * repeated, so the cycle is 31 frames — about half a second — and does not
 * settle into a rhythm the eye can predict.
 */
const FLICKER_STEPS: readonly (readonly [level: number, frames: number])[] = [
  // Action 160: a deep, fast dip.
  [1.0, 3],
  [0.78, 2],
  [0.59, 1],
  [0.39, 1],
  [0.59, 1],
  [0.78, 2],
  // Action 162: a shallower roll.
  [0.82, 2],
  [0.7, 2],
  [0.59, 2],
  [0.47, 2],
  [0.59, 2],
  [0.7, 2],
  // Action 163's tail: a short stutter back to full.
  [0.7, 1],
  [0.55, 1],
  [0.44, 1],
  [0.31, 1],
  [0.55, 2],
  [0.86, 2],
  [1.0, 1],
];

const FLICKER_FRAMES = FLICKER_STEPS.reduce((n, s) => n + s[1], 0);

/** Brightness 0..1 for a 60 Hz frame index. */
export function flickerLevel(frame: number): number {
  let f = ((frame % FLICKER_FRAMES) + FLICKER_FRAMES) % FLICKER_FRAMES;
  for (const [level, frames] of FLICKER_STEPS) {
    if (f < frames) return level;
    f -= frames;
  }
  return 1;
}

/**
 * How long the blade is right now, as a multiplier — **the breath.**
 *
 * A lighter's flame does not swell on a sine. It sits, jumps, sits again, and
 * the jumps do not come at even spacing. This was a sine and read as a mechanical
 * pump, so it is a table for the same reason the brightness is.
 *
 * Its cycle is **37 frames against the flicker's 31**, and the two are coprime,
 * so brightness and length never lock into a compound rhythm — they drift
 * against each other for 1147 frames, about nineteen seconds, before repeating.
 *
 * The blade is scaled about its **root**, not its sprite centre; see
 * `MechRenderer.animateEnergy`. Breathing about the centre is what made PYRE's
 * scythe pull away from its own staff.
 */
const BREATH_STEPS: readonly (readonly [level: number, frames: number])[] = [
  [1.0, 4],
  [1.06, 3],
  [0.97, 2],
  [1.1, 4],
  [1.02, 3],
  [0.93, 2],
  [1.08, 3],
  [1.0, 5],
  [1.12, 2],
  [0.96, 4],
  [1.04, 3],
  [0.99, 2],
];

const BREATH_FRAMES = BREATH_STEPS.reduce((n, s) => n + s[1], 0);

/** Length multiplier for a 60 Hz frame index. */
export function breathLevel(frame: number): number {
  let f = ((frame % BREATH_FRAMES) + BREATH_FRAMES) % BREATH_FRAMES;
  for (const [level, frames] of BREATH_STEPS) {
    if (f < frames) return level;
    f -= frames;
  }
  return 1;
}
