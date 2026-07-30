/**
 * User-remappable control bindings.
 *
 * Keys are stored as physical `KeyboardEvent.code` values ('KeyW', 'ArrowUp',
 * 'ShiftLeft'), not `key` values. That keeps bindings stable across keyboard
 * layouts — a binding made on QWERTY still sits on the same physical key on
 * AZERTY — and it is what a rebinding prompt can capture unambiguously.
 *
 * This module is pure data + validation with no Phaser dependency, so it is
 * unit-testable.
 */

export type ActionId =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'main'
  | 'heavy'
  | 'sub'
  | 'boost'
  | 'barrier'
  | 'modeCycle'
  | 'lock'
  | 'pause'
  | 'debugText'
  | 'debugHitboxes';

export interface Binding {
  /** Physical key codes. Two slots so a player can keep WASD *and* arrows. */
  keys: string[];
  /** Gamepad button indices (standard mapping). */
  pads: number[];
}

export type BindingMap = Record<ActionId, Binding>;

export const ACTION_ORDER: readonly ActionId[] = [
  'up',
  'down',
  'left',
  'right',
  'main',
  'heavy',
  'sub',
  'boost',
  'barrier',
  'modeCycle',
  'lock',
  'pause',
  'debugText',
  'debugHitboxes',
];

export const ACTION_LABELS: Record<ActionId, string> = {
  up: 'FLY UP',
  down: 'FLY DOWN',
  left: 'FLY LEFT',
  right: 'FLY RIGHT',
  main: 'MAIN GUN / SWORD',
  heavy: 'HEAVY SHOT',
  sub: 'SUB WEAPON',
  boost: 'BOOST / DASH / BRAKE',
  barrier: 'BARRIER / GUARD',
  modeCycle: 'CYCLE SAT MODE',
  lock: 'TOGGLE SOFT-LOCK',
  pause: 'PAUSE',
  debugText: 'DEBUG READOUT',
  debugHitboxes: 'HITBOX VIEW',
};

/** Actions that are gameplay-critical; a conflict here is worth warning about. */
const CONFLICT_SCOPE: readonly ActionId[] = ACTION_ORDER;

export const MAX_KEYS_PER_ACTION = 2;
export const MAX_PADS_PER_ACTION = 2;

export const DEFAULT_BINDINGS: BindingMap = {
  up: { keys: ['KeyW', 'ArrowUp'], pads: [12] },
  down: { keys: ['KeyS', 'ArrowDown'], pads: [13] },
  left: { keys: ['KeyA', 'ArrowLeft'], pads: [14] },
  right: { keys: ['KeyD', 'ArrowRight'], pads: [15] },
  main: { keys: ['KeyJ'], pads: [0] },
  heavy: { keys: ['KeyK'], pads: [2, 3] },
  sub: { keys: ['KeyL'], pads: [1] },
  boost: { keys: ['ShiftLeft', 'Space'], pads: [5, 7] },
  barrier: { keys: ['KeyF'], pads: [4, 6] },
  modeCycle: { keys: ['KeyQ', 'Tab'], pads: [8] },
  lock: { keys: ['KeyE'], pads: [10] },
  pause: { keys: ['Escape', 'KeyP'], pads: [9] },
  debugText: { keys: ['F1'], pads: [] },
  debugHitboxes: { keys: ['F2'], pads: [] },
};

const STORAGE_KEY = 'bsr.bindings.v1';

export function cloneBindings(src: BindingMap): BindingMap {
  const out = {} as BindingMap;
  for (const a of ACTION_ORDER) {
    out[a] = { keys: [...src[a].keys], pads: [...src[a].pads] };
  }
  return out;
}

export function defaultBindings(): BindingMap {
  return cloneBindings(DEFAULT_BINDINGS);
}

/**
 * Merges stored bindings over the defaults.
 *
 * Anything malformed, unknown, or over-length is discarded rather than trusted,
 * so a corrupted or hand-edited entry can never leave the game unplayable.
 */
export function normalizeBindings(raw: unknown): BindingMap {
  const out = defaultBindings();
  if (!raw || typeof raw !== 'object') return out;
  const obj = raw as Record<string, unknown>;

  for (const action of ACTION_ORDER) {
    const entry = obj[action];
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as { keys?: unknown; pads?: unknown };

    if (Array.isArray(e.keys)) {
      const keys = e.keys
        .filter((k): k is string => typeof k === 'string' && k.length > 0 && k.length < 32)
        .slice(0, MAX_KEYS_PER_ACTION);
      out[action].keys = dedupe(keys);
    }
    if (Array.isArray(e.pads)) {
      const pads = e.pads
        .filter((p): p is number => typeof p === 'number' && Number.isInteger(p) && p >= 0 && p < 32)
        .slice(0, MAX_PADS_PER_ACTION);
      out[action].pads = dedupe(pads);
    }
  }
  return out;
}

function dedupe<T>(items: T[]): T[] {
  return items.filter((v, i) => items.indexOf(v) === i);
}

function storage(): Storage | null {
  try {
    // Access can throw in sandboxed/private contexts.
    const s = globalThis.localStorage;
    return s ?? null;
  } catch {
    return null;
  }
}

export function loadBindings(): BindingMap {
  const s = storage();
  if (!s) return defaultBindings();
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (!raw) return defaultBindings();
    return normalizeBindings(JSON.parse(raw));
  } catch {
    return defaultBindings();
  }
}

export function saveBindings(b: BindingMap): boolean {
  const s = storage();
  if (!s) return false;
  try {
    s.setItem(STORAGE_KEY, JSON.stringify(b));
    return true;
  } catch {
    return false;
  }
}

export function clearStoredBindings(): void {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Assigns `code` to `action`, removing it from any other action first so a
 * physical key never drives two things at once. Oldest binding is evicted when
 * the slot limit is reached.
 */
export function assignKey(b: BindingMap, action: ActionId, code: string): BindingMap {
  const next = cloneBindings(b);
  for (const a of ACTION_ORDER) {
    next[a].keys = next[a].keys.filter((k) => k !== code);
  }
  next[action].keys.push(code);
  if (next[action].keys.length > MAX_KEYS_PER_ACTION) next[action].keys.shift();
  return next;
}

export function assignPad(b: BindingMap, action: ActionId, index: number): BindingMap {
  const next = cloneBindings(b);
  for (const a of ACTION_ORDER) {
    next[a].pads = next[a].pads.filter((p) => p !== index);
  }
  next[action].pads.push(index);
  if (next[action].pads.length > MAX_PADS_PER_ACTION) next[action].pads.shift();
  return next;
}

export function clearAction(b: BindingMap, action: ActionId): BindingMap {
  const next = cloneBindings(b);
  next[action] = { keys: [], pads: [] };
  return next;
}

/** Actions left with no input at all. Surfaced as a warning in the UI. */
export function unboundActions(b: BindingMap): ActionId[] {
  return CONFLICT_SCOPE.filter((a) => b[a].keys.length === 0 && b[a].pads.length === 0);
}

const KEY_LABELS: Record<string, string> = {
  ArrowUp: 'UP',
  ArrowDown: 'DOWN',
  ArrowLeft: 'LEFT',
  ArrowRight: 'RIGHT',
  Space: 'SPACE',
  Escape: 'ESC',
  Enter: 'ENTER',
  Tab: 'TAB',
  Backspace: 'BKSP',
  Delete: 'DEL',
  ShiftLeft: 'L-SHIFT',
  ShiftRight: 'R-SHIFT',
  ControlLeft: 'L-CTRL',
  ControlRight: 'R-CTRL',
  AltLeft: 'L-ALT',
  AltRight: 'R-ALT',
  CapsLock: 'CAPS',
  NumpadEnter: 'NUM-ENT',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Backslash: '\\',
  Comma: ',',
  Period: '.',
  Slash: '/',
};

/** Human-readable name for a physical key code. */
export function keyLabel(code: string): string {
  if (KEY_LABELS[code]) return KEY_LABELS[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `NUM${code.slice(6)}`;
  return code.toUpperCase();
}

const PAD_LABELS: Record<number, string> = {
  0: 'A',
  1: 'B',
  2: 'X',
  3: 'Y',
  4: 'LB',
  5: 'RB',
  6: 'LT',
  7: 'RT',
  8: 'SELECT',
  9: 'START',
  10: 'L-STICK',
  11: 'R-STICK',
  12: 'D-UP',
  13: 'D-DOWN',
  14: 'D-LEFT',
  15: 'D-RIGHT',
};

export function padLabel(index: number): string {
  return PAD_LABELS[index] ?? `BTN${index}`;
}

/** One-line summary of an action's bindings, for the UI. */
export function describeBinding(b: Binding): string {
  const parts = [...b.keys.map(keyLabel), ...b.pads.map((p) => `PAD ${padLabel(p)}`)];
  return parts.length > 0 ? parts.join('  /  ') : '— UNBOUND —';
}
