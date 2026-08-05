import { Btn, emptyInput, type InputFrame } from './types';
import { MOTIONS, Sym } from './CommandBuffer';
import type { ForceCommand, ForceMove } from '../core/TrainingSettings';

/**
 * Builds the training dummy's input frame.
 *
 * Pure: takes the script, the tick and the dummy's facing, returns a frame. No
 * Phaser, no scene, no simulation state — so the whole thing is unit-testable,
 * which matters because "the dummy is doing the move I asked for" is exactly the
 * sort of claim that is easy to believe and hard to see.
 */

export interface DummyScript {
  forceButton: number | null;
  forceCommand: ForceCommand;
  forceMove: ForceMove;
}

/**
 * Ticks in one repeat cycle.
 *
 * Long enough that a forced attack finishes and the dummy visibly returns to
 * neutral between repetitions — a dummy that re-presses every few frames jams
 * its own start-up and never shows you the move you asked to see.
 */
export const DUMMY_CYCLE = 48;

/** Tick within the cycle at which a forced command throws its final input. */
const COMMAND_STRIKE = 6;

/** Directions as forward-relative (x, y). +y is down, matching `InputFrame`. */
const DIRS: Record<ForceMove, [number, number]> = {
  none: [0, 0],
  fwd: [1, 0],
  back: [-1, 0],
  up: [0, -1],
  down: [0, 1],
  upFwd: [1, -1],
  upBack: [-1, -1],
  downFwd: [1, 1],
  downBack: [-1, 1],
};

/** The same mapping, for the numpad symbols a `Motion` step is written in. */
const SYM_DIRS: Partial<Record<Sym, [number, number]>> = {
  [Sym.Up]: [0, -1],
  [Sym.Down]: [0, 1],
  [Sym.Fwd]: [1, 0],
  [Sym.Back]: [-1, 0],
  [Sym.UpFwd]: [1, -1],
  [Sym.UpBack]: [-1, -1],
  [Sym.DownFwd]: [1, 1],
  [Sym.DownBack]: [-1, 1],
};

/**
 * One tick of scripted input.
 *
 * `facing` is +1 when the dummy looks right. Directions are authored
 * forward-relative and mirrored here, which is the same convention
 * `CommandBuffer.push` uses to read them back — so a motion written as
 * "down, forward + main" is thrown correctly from either side of the arena.
 */
export function dummyInput(script: DummyScript, tick: number, facing: number): InputFrame {
  const f = emptyInput();
  const sign = facing >= 0 ? 1 : -1;
  const t = ((tick % DUMMY_CYCLE) + DUMMY_CYCLE) % DUMMY_CYCLE;

  // ---- held direction ---------------------------------------------------
  const [mx, my] = DIRS[script.forceMove] ?? [0, 0];
  f.dx = mx * sign;
  f.dy = my;

  // ---- held button ------------------------------------------------------
  // Held every tick so a guard stays up, but `pressed` fires once per cycle so
  // anything edge-triggered repeats at a readable rate instead of jamming.
  if (script.forceButton !== null) {
    const bit = 1 << script.forceButton;
    f.held |= bit;
    if (t === 0) f.pressed |= bit;
  }

  // ---- command motion ---------------------------------------------------
  // Runs over the front of the cycle and takes the stick while it does: a
  // motion is a direction sequence, so it cannot share the stick with a held
  // direction. `forceMove` resumes for the rest of the cycle.
  const motion = script.forceCommand === 'none' ? null : MOTIONS[script.forceCommand];
  if (motion && motion.steps.length >= 2) {
    const first = motion.steps[0];
    const last = motion.steps[motion.steps.length - 1];
    if (t < COMMAND_STRIKE) {
      const d = first.dir === null ? null : SYM_DIRS[first.dir];
      if (d) {
        f.dx = d[0] * sign;
        f.dy = d[1];
      }
    } else if (t === COMMAND_STRIKE) {
      const d = last.dir === null ? null : SYM_DIRS[last.dir];
      if (d) {
        f.dx = d[0] * sign;
        f.dy = d[1];
      }
      // The recogniser requires the final step to be among the newest three
      // samples, so this press has to land on the same tick as its direction.
      if (last.btn !== undefined) {
        const bit = 1 << last.btn;
        f.held |= bit;
        f.pressed |= bit;
      }
    }
  }

  return f;
}

/** Buttons offered by FORCE BUTTON, in menu order. */
export const FORCE_BUTTONS: readonly (number | null)[] = [
  null,
  Btn.Main,
  Btn.Heavy,
  Btn.Sub,
  Btn.Melee,
  Btn.Boost,
  Btn.Barrier,
  Btn.Saturation,
];

const BUTTON_LABELS: Record<number, string> = {
  [Btn.Main]: 'MAIN GUN',
  [Btn.Heavy]: 'HEAVY SHOT',
  [Btn.Sub]: 'SUB WEAPON',
  [Btn.Melee]: 'MELEE',
  [Btn.Boost]: 'BOOST',
  [Btn.Barrier]: 'GUARD',
  [Btn.Saturation]: 'SATURATION',
};

export function forceButtonLabel(v: number | null): string {
  return v === null ? 'NONE' : (BUTTON_LABELS[v] ?? 'NONE');
}
