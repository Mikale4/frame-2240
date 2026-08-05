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

/** What is holding the second slot. */
export type P2Kind = 'dummy' | 'cpu';

/** A command motion the dummy can be made to throw, or none. */
export type ForceCommand = 'none' | 'spread' | 'lance' | 'salvo';

/**
 * A direction the dummy can be made to hold, **relative to its facing**.
 *
 * Relative rather than absolute because the two machines swap sides constantly
 * in free flight; "hold left" would mean advancing half the time and retreating
 * the other half, which is not a drill you can set up.
 */
export type ForceMove =
  | 'none'
  | 'fwd'
  | 'back'
  | 'up'
  | 'down'
  | 'upFwd'
  | 'upBack'
  | 'downFwd'
  | 'downBack';

export interface TrainingSettings {
  /** Escort drones active for both sides. */
  drones: boolean;
  /** Saturation never drains and is always charged. */
  infiniteSat: boolean;
  /** Player life as a fraction of max. Applied on selection, and on restart. */
  health: number;
  /** Dummy, or a real rival at a chosen tier. */
  p2: P2Kind;
  /**
   * Rival tier while `p2` is `cpu`. A `Difficulty`, held as a number.
   *
   * Typed loosely on purpose: `Difficulty` lives in `Session`, and `Session`
   * imports this module for its defaults. Naming the enum here would close that
   * into an import cycle for a value that is four integers.
   */
  p2Difficulty: number;
  /** Button the dummy holds, as a `Btn`, or null. Ignored while `p2` is cpu. */
  forceButton: number | null;
  /** Command motion the dummy repeats. Ignored while `p2` is cpu. */
  forceCommand: ForceCommand;
  /** Direction the dummy holds. Ignored while `p2` is cpu. */
  forceMove: ForceMove;
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
  return {
    drones: true,
    infiniteSat: false,
    health: 1,
    p2: 'dummy',
    p2Difficulty: 1, // NORMAL
    forceButton: null,
    forceCommand: 'none',
    forceMove: 'none',
  };
}

/** Steps a value through a fixed list, wrapping. `dir` is -1 or +1. */
export function cycle<T>(list: readonly T[], current: T, dir: number): T {
  const i = list.indexOf(current);
  const at = i < 0 ? 0 : i;
  const n = list.length;
  return list[(at + (dir >= 0 ? 1 : n - 1)) % n];
}

export const FORCE_COMMANDS: readonly ForceCommand[] = ['none', 'spread', 'lance', 'salvo'];

export const FORCE_MOVES: readonly ForceMove[] = [
  'none',
  'fwd',
  'back',
  'up',
  'down',
  'upFwd',
  'upBack',
  'downFwd',
  'downBack',
];

const MOVE_LABELS: Record<ForceMove, string> = {
  none: 'NONE',
  fwd: 'TOWARD',
  back: 'AWAY',
  up: 'UP',
  down: 'DOWN',
  upFwd: 'UP + TOWARD',
  upBack: 'UP + AWAY',
  downFwd: 'DOWN + TOWARD',
  downBack: 'DOWN + AWAY',
};

export function moveLabel(v: ForceMove): string {
  return MOVE_LABELS[v];
}

export function commandLabel(v: ForceCommand): string {
  return v === 'none' ? 'NONE' : v.toUpperCase();
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
