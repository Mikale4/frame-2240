/**
 * Story scripts as coroutines.
 *
 * Taken from the owner's FF7 game (`js/core/coroutine.js`), where it was the
 * single most useful thing in the field engine: a cutscene or a chapter reads
 * top to bottom as the story it tells —
 *
 * ```ts
 * function* arrival(s: StoryApi) {
 *   yield s.fade(1, 0.6);
 *   yield [s.walk('vesk', 4, 12), s.cam.pan(...)];   // in parallel
 *   const won = yield s.battle({ foe: 'nocturne' });
 *   if (won) s.set('beat_rook');
 * }
 * ```
 *
 * A script yields one of four things:
 *
 * - **a number** — wait that many ticks;
 * - **a waitable** — `{ done, result }`, polled until `done`; its `result` is
 *   what the `yield` evaluates to (a dialogue choice, a battle's outcome);
 * - **a generator** — run it as a sub-script and resume with its return value;
 * - **an array** of any of these — run them together, resume when all are done.
 *
 * Pure TypeScript and tick-driven, so `campaign.test.ts` can run every chapter
 * against a mock API in Node without a renderer.
 */

export interface Waitable<T = unknown> {
  readonly done: boolean;
  readonly result?: T;
}

export type Yieldable = number | Waitable | Generator<Yieldable, unknown, unknown> | Yieldable[] | void | undefined;
// The return is `any` so a script may end without `return` (TS2355 otherwise).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Script = Generator<Yieldable, any, unknown>;

/** A waitable that is finished from outside: `w.finish(value)`. */
export class Latch<T = unknown> implements Waitable<T> {
  done = false;
  result?: T;
  finish(value?: T): void {
    if (this.done) return;
    this.done = true;
    this.result = value;
  }
}

/** A waitable that finishes itself after `n` ticks. */
export function ticks(n: number): Waitable {
  let left = Math.max(0, Math.round(n));
  return {
    get done() {
      return left-- <= 0;
    },
  };
}

const isGen = (v: unknown): v is Script =>
  !!v && typeof (v as Script).next === 'function' && typeof (v as Script)[Symbol.iterator] === 'function';
const isWaitable = (v: unknown): v is Waitable => !!v && typeof v === 'object' && 'done' in (v as object) && !isGen(v);

/** One running thing a script is waiting on. */
interface Pending {
  done(): boolean;
  value(): unknown;
}

/**
 * Runs one script. `tick()` advances it by one simulation tick and returns
 * whether it is still running.
 */
export class Coroutine {
  private wait: Pending | null = null;
  private resumeWith: unknown = undefined;
  finished = false;
  result: unknown = undefined;
  /** Set if the script threw; the runner stops it rather than the game. */
  error: unknown = null;

  constructor(private readonly gen: Script) {}

  private pend(y: Yieldable): Pending | null {
    if (y === undefined || y === null) return null;
    if (typeof y === 'number') {
      let left = Math.round(y);
      return { done: () => left-- <= 0, value: () => undefined };
    }
    if (Array.isArray(y)) {
      const parts = y.map((p) => this.pend(p)).filter((p): p is Pending => !!p);
      return {
        // Every part is polled each tick so parallel waits advance together.
        done: () => parts.map((p) => p.done()).every(Boolean),
        value: () => parts.map((p) => p.value()),
      };
    }
    if (isGen(y)) {
      const sub = new Coroutine(y);
      return {
        done: () => !sub.tick(),
        value: () => sub.result,
      };
    }
    if (isWaitable(y)) return { done: () => y.done, value: () => y.result };
    return null;
  }

  /** Advances the script; false once it has finished. */
  tick(): boolean {
    if (this.finished) return false;
    try {
      // Up to a few steps per tick, so `yield 0` and instant waitables do not
      // cost a frame each — but bounded, so a script cannot spin forever.
      for (let guard = 0; guard < 64; guard++) {
        if (this.wait) {
          if (!this.wait.done()) return true;
          this.resumeWith = this.wait.value();
          this.wait = null;
        }
        const r = this.gen.next(this.resumeWith);
        this.resumeWith = undefined;
        if (r.done) {
          this.finished = true;
          this.result = r.value;
          return false;
        }
        this.wait = this.pend(r.value as Yieldable);
        if (this.wait && !this.wait.done()) return true;
        if (this.wait) {
          this.resumeWith = this.wait.value();
          this.wait = null;
        }
      }
      return true;
    } catch (err) {
      this.error = err;
      this.finished = true;
      return false;
    }
  }
}

/**
 * The campaign's script runner: one **main** script at a time, which owns the
 * player's controls while it runs (a cutscene), plus any number of
 * **background** scripts that do not (an NPC pacing, a lamp flickering).
 */
export class ScriptRunner {
  private main: Coroutine | null = null;
  private background: Coroutine[] = [];
  /** Errors from finished scripts, surfaced to the debug overlay and tests. */
  readonly errors: unknown[] = [];

  /** True while a main script holds control. */
  get busy(): boolean {
    return this.main !== null;
  }

  /** Starts a main script. Refused (returns false) if one is already running. */
  run(gen: Script): boolean {
    if (this.main) return false;
    this.main = new Coroutine(gen);
    return true;
  }

  /** Starts a background script that does not block the player. */
  parallel(gen: Script): Coroutine {
    const c = new Coroutine(gen);
    this.background.push(c);
    return c;
  }

  tick(): void {
    if (this.main && !this.main.tick()) {
      if (this.main.error) this.errors.push(this.main.error);
      this.main = null;
    }
    this.background = this.background.filter((c) => {
      const alive = c.tick();
      if (!alive && c.error) this.errors.push(c.error);
      return alive;
    });
  }

  /** Drops everything, e.g. on leaving the campaign. */
  stop(): void {
    this.main = null;
    this.background = [];
  }
}
