/**
 * Training-room switches.
 *
 * Training is the only mode where changing the fight *is the point* — the rival
 * is a dummy that never acts, nothing is being measured, and no result is
 * recorded. So these deliberately do things the simulation would never let a
 * match do, and every one of them is gated on `session.mode === 'training'` at
 * the point of use rather than trusted to be off elsewhere.
 *
 * Kept as plain data with no Phaser dependency so it is unit-testable, and held
 * on `session` so it survives a restart of the match without surviving a reload
 * of the game — a training rig you have to set up again after every rematch is
 * not a training rig, and one that quietly persists into a real match is worse.
 */

export interface TrainingSettings {
  /** Escort drones active for both sides. */
  drones: boolean;
  /** Saturation never drains and is always charged. */
  infiniteSat: boolean;
  /** Player life as a fraction of max. Applied on selection, and on restart. */
  health: number;
}

/**
 * Selectable life fractions.
 *
 * Not a slider: the useful values are the thresholds the machine's own
 * behaviour changes at. Desperation opens below a third of a bar, so 25 % puts
 * you inside it and 50 % just outside — which is the comparison worth being
 * able to make on demand.
 */
export const HEALTH_STEPS: readonly number[] = [1, 0.75, 0.5, 0.25];

export function defaultTrainingSettings(): TrainingSettings {
  return { drones: true, infiniteSat: false, health: 1 };
}

/** Next value in `HEALTH_STEPS`, wrapping. `dir` is -1 or +1. */
export function cycleHealth(current: number, dir: number): number {
  const i = HEALTH_STEPS.indexOf(current);
  const at = i < 0 ? 0 : i;
  const n = HEALTH_STEPS.length;
  return HEALTH_STEPS[(at + (dir >= 0 ? 1 : n - 1)) % n];
}

export function healthLabel(v: number): string {
  return `${Math.round(v * 100)}%`;
}
