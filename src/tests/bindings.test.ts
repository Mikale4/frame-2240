import { beforeEach, describe, expect, it } from 'vitest';
import { BTN_COUNT, type Btn } from '../combat/types';
import {
  ACTION_ORDER,
  BUTTON_ACTION,
  DEFAULT_BINDINGS,
  MAX_KEYS_PER_ACTION,
  assignKey,
  assignPad,
  clearAction,
  clearStoredBindings,
  cloneBindings,
  defaultBindings,
  describeBinding,
  keyLabel,
  loadBindings,
  normalizeBindings,
  padLabel,
  saveBindings,
  unboundActions,
} from '../input/Bindings';

/** Minimal in-memory localStorage so persistence is testable under Node. */
class MemoryStorage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(k: string): string | null {
    return this.map.has(k) ? (this.map.get(k) as string) : null;
  }
  key(i: number): string | null {
    return [...this.map.keys()][i] ?? null;
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
  setItem(k: string, v: string): void {
    this.map.set(k, String(v));
  }
}

beforeEach(() => {
  // defineProperty, not assignment: one test below installs a throwing getter
  // to simulate a sandboxed context, and a plain assignment cannot replace it.
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: new MemoryStorage() as unknown as Storage,
  });
});

/** A physical key no action currently uses, for use as a test sentinel. */
function unboundKey(b: ReturnType<typeof defaultBindings>): string | null {
  const used = new Set(ACTION_ORDER.flatMap((a) => b[a].keys));
  for (const k of ['KeyM', 'KeyN', 'KeyB', 'KeyG', 'KeyH', 'KeyY', 'KeyT']) {
    if (!used.has(k)) return k;
  }
  return null;
}

describe('default bindings', () => {
  it('covers every action', () => {
    const b = defaultBindings();
    for (const a of ACTION_ORDER) {
      expect(b[a]).toBeDefined();
      expect(Array.isArray(b[a].keys)).toBe(true);
      expect(Array.isArray(b[a].pads)).toBe(true);
    }
  });

  it('leaves no gameplay action unbound', () => {
    expect(unboundActions(defaultBindings())).toEqual([]);
  });

  it('never binds one physical key to two actions', () => {
    const seen = new Map<string, string>();
    const b = defaultBindings();
    for (const a of ACTION_ORDER) {
      for (const k of b[a].keys) {
        expect(seen.has(k), `${k} bound to both ${seen.get(k)} and ${a}`).toBe(false);
        seen.set(k, a);
      }
    }
  });

  it('returns an independent copy each time', () => {
    const a = defaultBindings();
    a.main.keys.push('KeyZ');
    expect(defaultBindings().main.keys).toEqual(DEFAULT_BINDINGS.main.keys);
  });

  it('clone does not alias nested arrays', () => {
    // Sentinels must be keys the layout does not use, or this passes for the
    // wrong reason the day the defaults move onto them — which is how it broke.
    const a = defaultBindings();
    const b = cloneBindings(a);
    expect(unboundKey(a)).toBeTruthy();
    const spare = unboundKey(a)!;
    b.main.keys.push(spare);
    b.main.pads.push(9);
    expect(a.main.keys).not.toContain(spare);
    expect(a.main.pads).not.toContain(9);
  });
});

describe('button coverage', () => {
  /**
   * Regression: Btn.Melee was added to the simulation and to the rebinding UI,
   * but the input reader's hand-written mapping never got a line for it — so the
   * control existed everywhere except where it mattered and melee did nothing.
   * The reader is now driven by BUTTON_ACTION; these tests keep it complete.
   */
  it('maps every simulation button to an action', () => {
    for (let b = 0; b < BTN_COUNT; b++) {
      const action = BUTTON_ACTION[b as Btn];
      expect(action, `Btn ${b} has no action mapping`).toBeDefined();
      expect(ACTION_ORDER).toContain(action);
    }
  });

  it('never maps two buttons to the same action', () => {
    const seen = new Set<string>();
    for (let b = 0; b < BTN_COUNT; b++) {
      const a = BUTTON_ACTION[b as Btn];
      expect(seen.has(a), `${a} mapped twice`).toBe(false);
      seen.add(a);
    }
  });

  it('gives every mapped action a working default', () => {
    const d = defaultBindings();
    for (let b = 0; b < BTN_COUNT; b++) {
      const a = BUTTON_ACTION[b as Btn];
      expect(d[a].keys.length + d[a].pads.length, `${a} has no default`).toBeGreaterThan(0);
    }
  });

  it('binds melee to its own key, separate from the main gun', () => {
    const d = defaultBindings();
    expect(d.melee.keys.length).toBeGreaterThan(0);
    for (const k of d.melee.keys) expect(d.main.keys).not.toContain(k);
    for (const p of d.melee.pads) expect(d.main.pads).not.toContain(p);
  });
});

describe('assignment', () => {
  it('binds a key to an action', () => {
    const b = assignKey(defaultBindings(), 'main', 'KeyZ');
    expect(b.main.keys).toContain('KeyZ');
  });

  it('steals a key from whichever action held it', () => {
    const d = defaultBindings();
    const stolen = d.barrier.keys[0];
    const b = assignKey(d, 'main', stolen);
    expect(b.main.keys).toContain(stolen);
    expect(b.barrier.keys).not.toContain(stolen);
  });

  it('evicts the oldest key past the slot limit', () => {
    // Driven off whichever action is actually full, rather than assuming one is.
    let b = defaultBindings();
    const full = ACTION_ORDER.find((a) => b[a].keys.length >= MAX_KEYS_PER_ACTION);
    expect(full, 'no action has a full key list to evict from').toBeTruthy();
    const action = full!;
    const first = b[action].keys[0];
    const spare = unboundKey(b)!;
    b = assignKey(b, action, spare);
    expect(b[action].keys.length).toBe(MAX_KEYS_PER_ACTION);
    expect(b[action].keys).not.toContain(first);
    expect(b[action].keys).toContain(spare);
  });

  it('does not duplicate a key already on the same action', () => {
    const b = assignKey(defaultBindings(), 'main', 'KeyJ');
    expect(b.main.keys.filter((k) => k === 'KeyJ').length).toBe(1);
  });

  it('steals pad buttons the same way', () => {
    const b = assignPad(defaultBindings(), 'sub', 0); // 0 is main by default
    expect(b.sub.pads).toContain(0);
    expect(b.main.pads).not.toContain(0);
  });

  it('clears an action and reports it as unbound', () => {
    const b = clearAction(defaultBindings(), 'heavy');
    expect(b.heavy.keys).toEqual([]);
    expect(b.heavy.pads).toEqual([]);
    expect(unboundActions(b)).toContain('heavy');
  });

  it('never mutates the input map', () => {
    const b = defaultBindings();
    const snapshot = JSON.stringify(b);
    assignKey(b, 'main', 'KeyZ');
    assignPad(b, 'main', 11);
    clearAction(b, 'main');
    expect(JSON.stringify(b)).toBe(snapshot);
  });
});

describe('persistence', () => {
  it('round-trips through storage', () => {
    const b = assignKey(defaultBindings(), 'main', 'KeyZ');
    expect(saveBindings(b)).toBe(true);
    expect(loadBindings().main.keys).toContain('KeyZ');
  });

  it('falls back to defaults when nothing is stored', () => {
    clearStoredBindings();
    expect(loadBindings().main.keys).toEqual(DEFAULT_BINDINGS.main.keys);
  });

  it('survives corrupted JSON', () => {
    globalThis.localStorage.setItem('bsr.bindings.v1', '{not json');
    expect(loadBindings().main.keys).toEqual(DEFAULT_BINDINGS.main.keys);
  });

  it('survives a missing localStorage entirely', () => {
    // Simulate a sandboxed context where access throws.
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });
    expect(() => loadBindings()).not.toThrow();
    expect(loadBindings().main.keys).toEqual(DEFAULT_BINDINGS.main.keys);
    expect(saveBindings(defaultBindings())).toBe(false);
  });
});

describe('normalisation rejects bad data', () => {
  it('handles non-objects', () => {
    for (const bad of [null, undefined, 42, 'x', []]) {
      expect(normalizeBindings(bad).main.keys).toEqual(DEFAULT_BINDINGS.main.keys);
    }
  });

  it('drops unknown actions and keeps known ones', () => {
    const b = normalizeBindings({ main: { keys: ['KeyZ'], pads: [] }, bogus: { keys: ['KeyQ'] } });
    expect(b.main.keys).toEqual(['KeyZ']);
    expect((b as Record<string, unknown>).bogus).toBeUndefined();
  });

  it('filters non-string keys and non-integer pads', () => {
    const b = normalizeBindings({
      main: { keys: ['KeyZ', 5, null, ''], pads: [1, 2.5, -3, 'x', 999] },
    });
    expect(b.main.keys).toEqual(['KeyZ']);
    expect(b.main.pads).toEqual([1]);
  });

  it('truncates over-long lists', () => {
    const b = normalizeBindings({
      main: { keys: ['KeyA', 'KeyB', 'KeyC', 'KeyD'], pads: [1, 2, 3, 4] },
    });
    expect(b.main.keys.length).toBeLessThanOrEqual(MAX_KEYS_PER_ACTION);
    expect(b.main.pads.length).toBeLessThanOrEqual(2);
  });

  it('dedupes repeated entries', () => {
    const b = normalizeBindings({ main: { keys: ['KeyZ', 'KeyZ'], pads: [3, 3] } });
    expect(b.main.keys).toEqual(['KeyZ']);
    expect(b.main.pads).toEqual([3]);
  });

  it('allows a deliberately empty binding', () => {
    const b = normalizeBindings({ heavy: { keys: [], pads: [] } });
    expect(b.heavy.keys).toEqual([]);
    expect(unboundActions(b)).toContain('heavy');
  });
});

describe('labels', () => {
  it('renders friendly key names', () => {
    expect(keyLabel('KeyW')).toBe('W');
    expect(keyLabel('ArrowUp')).toBe('UP');
    expect(keyLabel('ShiftLeft')).toBe('L-SHIFT');
    expect(keyLabel('Space')).toBe('SPACE');
    expect(keyLabel('Digit4')).toBe('4');
    expect(keyLabel('Numpad7')).toBe('NUM7');
    expect(keyLabel('F1')).toBe('F1');
  });

  it('renders pad button names', () => {
    expect(padLabel(0)).toBe('A');
    expect(padLabel(9)).toBe('START');
    expect(padLabel(30)).toBe('BTN30');
  });

  it('describes a binding, including the unbound case', () => {
    expect(describeBinding({ keys: ['KeyJ'], pads: [0] })).toBe('J  /  PAD A');
    expect(describeBinding({ keys: [], pads: [] })).toContain('UNBOUND');
  });
});
