import { Btn, type InputFrame } from './types';

/**
 * Fighting-game style command recognition.
 *
 * The 2005 reference authored motions like `~D, F, y` (release-down, forward,
 * button) with `command.time = 15`. We keep that model: a ring buffer of
 * directional/button symbols per tick, matched back-to-front against motions
 * with a per-motion tick budget.
 */

/** Symbols recorded per tick. Directions use numpad notation. */
export const enum Sym {
  N = 5,
  Up = 8,
  Down = 2,
  Fwd = 6,
  Back = 4,
  UpFwd = 9,
  UpBack = 7,
  DownFwd = 3,
  DownBack = 1,
}

export interface MotionStep {
  /** Required direction, or null for "any". */
  dir: Sym | null;
  /** If true this step matches the *release* of `dir` (the `~` prefix). */
  release?: boolean;
  /** Button that must be pressed on this step. */
  btn?: Btn;
}

export interface Motion {
  name: string;
  steps: MotionStep[];
  /** Max ticks the whole motion may span. Mirrors MUGEN's command.time. */
  window: number;
}

interface Sample {
  dir: Sym;
  pressed: number;
}

const BUFFER = 40;

export class CommandBuffer {
  private samples: Sample[] = [];
  private head = 0;
  private filled = 0;
  /** Ticks since each direction was last held, used for double-tap dashes. */
  private lastTapTick: Map<Sym, number> = new Map();
  private tick = 0;
  private prevDir: Sym = Sym.N;

  constructor() {
    for (let i = 0; i < BUFFER; i++) this.samples.push({ dir: Sym.N, pressed: 0 });
  }

  /**
   * `facing` is +1 when the combatant looks right, so raw input maps onto
   * forward/back relative to the opponent.
   */
  push(f: InputFrame, facing: number): void {
    const fwdSign = facing >= 0 ? 1 : -1;
    const hx = Math.sign(f.dx) * fwdSign;
    const hy = Math.sign(f.dy);
    const dir = dirFrom(hx, hy);

    this.head = (this.head + 1) % BUFFER;
    const s = this.samples[this.head];
    s.dir = dir;
    s.pressed = f.pressed;

    if (this.filled < BUFFER) this.filled++;
    this.tick++;

    // Record fresh taps for double-tap detection (transition into a direction).
    if (dir !== this.prevDir && dir !== Sym.N) {
      this.lastTapTick.set(dir, this.tick);
    }
    this.prevDir = dir;
  }

  /** Ticks since `dir` was newly tapped, or Infinity. */
  sinceTap(dir: Sym): number {
    const t = this.lastTapTick.get(dir);
    return t === undefined ? Infinity : this.tick - t;
  }

  /**
   * True when `dir` was tapped twice inside `window` ticks — the quick-dash
   * shorthand. Consumes the record so it fires once.
   */
  private tapHistory: Map<Sym, number[]> = new Map();

  noteForDoubleTap(dir: Sym): void {
    if (dir === Sym.N) return;
    const arr = this.tapHistory.get(dir) ?? [];
    arr.push(this.tick);
    while (arr.length > 4) arr.shift();
    this.tapHistory.set(dir, arr);
  }

  consumeDoubleTap(dir: Sym, window: number): boolean {
    const arr = this.tapHistory.get(dir);
    if (!arr || arr.length < 2) return false;
    const a = arr[arr.length - 2];
    const b = arr[arr.length - 1];
    if (b - a <= window && this.tick - b <= 2) {
      arr.length = 0;
      return true;
    }
    return false;
  }

  /** Current directional symbol. */
  current(): Sym {
    return this.samples[this.head].dir;
  }

  /**
   * Matches `m` against the buffer, newest step last. Returns true if every
   * step is found in order within the motion window.
   */
  matches(m: Motion): boolean {
    const steps = m.steps;
    if (steps.length === 0) return false;
    const maxLook = Math.min(this.filled, Math.min(BUFFER, m.window));

    // Walk backwards through the buffer satisfying steps from last to first.
    let stepIdx = steps.length - 1;
    let searched = 0;
    let matchedNewest = -1;

    while (searched < maxLook && stepIdx >= 0) {
      const idx = (this.head - searched + BUFFER * 2) % BUFFER;
      const s = this.samples[idx];
      const step = steps[stepIdx];

      if (stepMatches(step, s)) {
        if (matchedNewest < 0) matchedNewest = searched;
        stepIdx--;
      }
      searched++;
    }

    if (stepIdx >= 0) return false;
    // The final step must be recent (the button press that triggers the move).
    return matchedNewest >= 0 && matchedNewest <= 2;
  }
}

function stepMatches(step: MotionStep, s: Sample): boolean {
  if (step.btn !== undefined && (s.pressed & (1 << step.btn)) === 0) return false;
  if (step.dir !== null) {
    if (step.release) {
      if (s.dir === step.dir) return false;
    } else if (!dirIncludes(s.dir, step.dir)) {
      return false;
    }
  }
  return true;
}

/** Diagonals satisfy their component cardinals, as MUGEN's `$`-less dirs do. */
function dirIncludes(actual: Sym, wanted: Sym): boolean {
  if (actual === wanted) return true;
  switch (wanted) {
    case Sym.Up:
      return actual === Sym.UpFwd || actual === Sym.UpBack;
    case Sym.Down:
      return actual === Sym.DownFwd || actual === Sym.DownBack;
    case Sym.Fwd:
      return actual === Sym.UpFwd || actual === Sym.DownFwd;
    case Sym.Back:
      return actual === Sym.UpBack || actual === Sym.DownBack;
    default:
      return false;
  }
}

export function dirFrom(hx: number, hy: number): Sym {
  const x = Math.sign(hx);
  const y = Math.sign(hy);
  if (x === 0 && y === 0) return Sym.N;
  if (x === 0) return y < 0 ? Sym.Up : Sym.Down;
  if (y === 0) return x > 0 ? Sym.Fwd : Sym.Back;
  if (y < 0) return x > 0 ? Sym.UpFwd : Sym.UpBack;
  return x > 0 ? Sym.DownFwd : Sym.DownBack;
}

/**
 * Motion table. Mirrors the reference's shot-level grammar:
 * plain button = Lv1/Lv2, quarter-circle variants = directed/heavy versions.
 */
export const MOTIONS: Record<string, Motion> = {
  // Down-Forward + Main -> forward spread burst.
  spread: {
    name: 'spread',
    window: 15,
    steps: [
      { dir: Sym.Down, release: false },
      { dir: Sym.Fwd, btn: Btn.Main },
    ],
  },
  // Down-Back + Heavy -> Lv3 lance beam (reference `~D, B, y`).
  lance: {
    name: 'lance',
    window: 15,
    steps: [
      { dir: Sym.Down, release: false },
      { dir: Sym.Back, btn: Btn.Heavy },
    ],
  },
  // Down-Forward + Sub -> forward missile salvo.
  salvo: {
    name: 'salvo',
    window: 15,
    steps: [
      { dir: Sym.Down, release: false },
      { dir: Sym.Fwd, btn: Btn.Sub },
    ],
  },
};
