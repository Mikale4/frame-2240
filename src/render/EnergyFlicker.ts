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
 * Its cycle is **38 frames against the flicker's 31**, and the two are coprime,
 * so brightness and length never lock into a compound rhythm — they drift
 * against each other for 1178 frames, about twenty seconds, before repeating.
 *
 * The blade is scaled about its **root**, not its sprite centre; see
 * `MechRenderer.animateEnergy`. Breathing about the centre is what made PYRE's
 * scythe pull away from its own staff.
 */
const BREATH_STEPS: readonly (readonly [level: number, frames: number])[] = [
  // Each delta is budgeted against its hold: smoothstep's slope peaks at 1.5x
  // linear, so a key may move at most ~0.0067 per frame of hold or the blade
  // jumps again. Long moves therefore get long holds, which is also what makes
  // the rhythm feel like breathing rather than a wobble.
  [1.0, 4],
  [1.025, 3],
  [1.008, 2],
  [0.996, 5],
  [1.028, 3],
  [1.01, 2],
  [0.999, 4],
  [0.975, 3],
  [0.992, 2],
  [1.003, 5],
  [1.03, 2],
  [1.018, 3],
];

const BREATH_FRAMES = BREATH_STEPS.reduce((n, s) => n + s[1], 0);

/**
 * Length multiplier for a 60 Hz frame index.
 *
 * **These are keyframes, and the value rides between them.** Brightness is
 * quantised on purpose — a lamp either is or is not lit, and the jump is the
 * effect. Length is not: PYRE's blade is 219 px, so a step from 0.97 to 1.05
 * moves its tip 17 px in a single frame and it reads as the blade *changing
 * size* rather than breathing. Held as steps, the first cut ran 0.93-1.12 and
 * popped visibly at the tip.
 *
 * The timing stays uneven — which is the irregularity that was wanted — while
 * smoothstep eases each arrival, so the blade swells and settles instead of
 * snapping between two lengths. The range is also tightened to ~±4 %, because
 * amplitude on a long blade is measured at the tip, not as a percentage.
 */
export function breathLevel(frame: number): number {
  let f = ((frame % BREATH_FRAMES) + BREATH_FRAMES) % BREATH_FRAMES;
  for (let i = 0; i < BREATH_STEPS.length; i++) {
    const [level, frames] = BREATH_STEPS[i];
    if (f < frames) {
      const next = BREATH_STEPS[(i + 1) % BREATH_STEPS.length][0];
      const t = f / frames;
      return level + (next - level) * (t * t * (3 - 2 * t));
    }
    f -= frames;
  }
  return 1;
}
