import type { MenuItem } from './Menu';
import { session } from '../core/Session';
import { cycleHealth, healthLabel } from '../core/TrainingSettings';
import { MOTIONS, Sym, type Motion } from '../combat/CommandBuffer';
import { BUTTON_ACTION, getBindings, keyLabel } from '../input/Bindings';
import type { Btn } from '../combat/types';
import { MECHS } from '../data/mechs';

/**
 * The training-room rows on the pause menu.
 *
 * These replace the volume sliders rather than joining them. The pause overlay
 * in training is a rig console — the thing a player opens it for is to change
 * the conditions of the drill, and burying four switches under two audio rows
 * they can already reach from the title screen gets that backwards.
 *
 * Every row applies immediately through the hooks rather than on resume, so the
 * effect is visible the moment the menu closes and nothing has to remember to
 * flush pending state.
 */
export interface TrainingHooks {
  /** Set the player's life to a fraction of max, now. */
  applyHealth: (frac: number) => void;
  /** Escorts on or off for both sides, now. */
  applyDrones: (on: boolean) => void;
  /** Saturation free or charged normally, now. */
  applySat: (on: boolean) => void;
  /** Swap the menu for the command reference. */
  openCommands: () => void;
}

export function trainingMenuItems(hooks: TrainingHooks): MenuItem[] {
  const t = session.training;
  const toggleDrones = (): void => {
    t.drones = !t.drones;
    hooks.applyDrones(t.drones);
  };
  const toggleSat = (): void => {
    t.infiniteSat = !t.infiniteSat;
    hooks.applySat(t.infiniteSat);
  };
  const bumpHealth = (dir: number): void => {
    t.health = cycleHealth(t.health, dir);
    hooks.applyHealth(t.health);
  };
  return [
    {
      label: 'DRONES',
      value: () => (t.drones ? 'ACTIVE' : 'OFF'),
      onSelect: toggleDrones,
      onAdjust: toggleDrones,
    },
    {
      label: 'SAT MODE',
      value: () => (t.infiniteSat ? 'INFINITE' : 'NORMAL'),
      onSelect: toggleSat,
      onAdjust: toggleSat,
    },
    {
      label: 'HEALTH',
      value: () => healthLabel(t.health),
      onSelect: () => bumpHealth(1),
      onAdjust: bumpHealth,
    },
    { label: 'COMMAND LIST', onSelect: () => hooks.openCommands() },
  ];
}

// ------------------------------------------------------------- command list

const ARROWS: Partial<Record<Sym, string>> = {
  [Sym.Up]: '↑',
  [Sym.Down]: '↓',
  [Sym.Fwd]: '→',
  [Sym.Back]: '←',
  [Sym.UpFwd]: '↗',
  [Sym.UpBack]: '↖',
  [Sym.DownFwd]: '↘',
  [Sym.DownBack]: '↙',
};

/** First bound key for a simulation button, in the player's own bindings. */
function buttonKey(btn: Btn): string {
  const action = BUTTON_ACTION[btn];
  const keys = getBindings()[action]?.keys ?? [];
  return keys.length ? keyLabel(keys[0]) : 'UNBOUND';
}

/**
 * Renders a motion the way the player has to input it.
 *
 * Derived from `MOTIONS` rather than written out, so the reference cannot drift
 * from the recogniser — the whole failure mode of a hand-written command list is
 * that it goes on describing an input nobody implemented any more. Directions
 * are forward-relative, which is why they are drawn as arrows against facing
 * rather than as literal keys.
 */
export function motionNotation(m: Motion): string {
  const parts: string[] = [];
  for (const s of m.steps) {
    const arrow = s.dir === null ? '○' : (ARROWS[s.dir] ?? '?');
    const tag = s.release ? `~${arrow}` : arrow;
    parts.push(s.btn === undefined ? tag : `${tag} + ${buttonKey(s.btn)}`);
  }
  return parts.join('  ');
}

interface CommandRow {
  motion: string;
  attack: string;
}

/**
 * The command list for one machine.
 *
 * The motions are shared by the whole roster; the *attacks* they fire are not,
 * so this is per-mech and worth showing for both training slots — the dummy's
 * entry is what tells you what you are practising against.
 */
export function commandRows(mechId: string): CommandRow[] {
  const def = MECHS[mechId];
  if (!def) return [];
  const slots: [string, keyof typeof def][] = [
    ['spread', 'spread'],
    ['lance', 'lance'],
    ['salvo', 'salvo'],
  ];
  const rows: CommandRow[] = [];
  for (const [motionKey, defKey] of slots) {
    const motion = MOTIONS[motionKey];
    const attack = def[defKey] as { label?: string } | undefined;
    if (!motion || !attack?.label) continue;
    rows.push({ motion: motionNotation(motion), attack: attack.label });
  }
  return rows;
}

/** Title line for a machine's block in the command list. */
export function commandHeading(mechId: string): string {
  const def = MECHS[mechId];
  if (!def) return mechId.toUpperCase();
  return `${def.codeName}  ${def.name}`;
}
