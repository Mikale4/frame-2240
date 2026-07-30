/**
 * Global physical-key state, tracked by `KeyboardEvent.code`.
 *
 * Phaser's keyboard plugin wants keys registered up-front by name, which does
 * not fit user-remappable bindings (any key may become meaningful at runtime).
 * A single window-level listener sidesteps that, survives scene changes, and
 * gives the rebinding UI a clean "capture the next key" hook.
 */
class KeyStateTracker {
  private readonly down = new Set<string>();
  private captureCb: ((code: string) => void) | null = null;
  private started = false;
  /** Discrete key-down subscribers, for menus that need edges not held state. */
  private readonly listeners = new Set<(code: string) => void>();

  /** Keys the browser would otherwise act on while playing. */
  private readonly swallow = new Set([
    'Tab',
    'Space',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'F1',
    'F2',
    'Backspace',
  ]);

  start(): void {
    if (this.started || typeof window === 'undefined') return;
    this.started = true;

    window.addEventListener('keydown', (e) => {
      // A capture request consumes exactly one keypress and nothing else.
      if (this.captureCb) {
        e.preventDefault();
        const cb = this.captureCb;
        this.captureCb = null;
        cb(e.code);
        return;
      }
      if (this.swallow.has(e.code)) e.preventDefault();
      const repeat = this.down.has(e.code);
      this.down.add(e.code);
      if (!repeat && this.listeners.size > 0) {
        for (const cb of [...this.listeners]) cb(e.code);
      }
    });

    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
    });

    // Losing focus mid-hold would otherwise leave a key stuck down forever.
    window.addEventListener('blur', () => this.down.clear());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.down.clear();
    });
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  anyDown(codes: readonly string[]): boolean {
    for (const c of codes) if (this.down.has(c)) return true;
    return false;
  }

  /** Subscribes to discrete key-down edges. Returns an unsubscribe function. */
  onKeyDown(cb: (code: string) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Resolves with the next key pressed. Used by the rebinding prompt. */
  captureNext(cb: (code: string) => void): void {
    this.captureCb = cb;
  }

  cancelCapture(): void {
    this.captureCb = null;
  }

  get capturing(): boolean {
    return this.captureCb !== null;
  }

  /** Clears held state, e.g. when opening a menu. */
  clear(): void {
    this.down.clear();
  }
}

export const keyState = new KeyStateTracker();
