import { ARENA_H, ARENA_W } from '../core/GameConfig';
import { Difficulty } from '../core/Session';
import { Rng } from '../core/Rng';
import { RivalAI } from '../ai/RivalAI';
import type { MatchSim } from '../combat/MatchSim';
import type { Combatant } from '../combat/Combatant';
import type { AttackDef } from '../combat/AttackData';
import { DroneMode } from '../combat/Supporter';
import {
  ActState,
  Btn,
  ProjKind,
  emptyInput,
  isHeld,
  isPressed,
  type InputFrame,
  type SimEvent,
} from '../combat/types';
import { keyLabel, padLabel, type BindingMap, type ActionId } from '../input/Bindings';

/**
 * The tutorial: a hands-on course, played for real, one lesson at a time.
 *
 * KNOCK//BACK's arrangement, carried over: a fight against a practice dummy
 * where nothing happens until you do it. A card gives one lesson in your own
 * keys; the next opens once you have done the thing (or skipped it). The dummy
 * only acts when a lesson needs it to — holding still to be shot, shooting so
 * you can guard, rushing in so you can repel — and nobody can lose: both sides
 * are topped up, and the dummy cannot be put down until the last lesson, where
 * it finally fights back.
 *
 * **This module never touches Phaser.** The director reads the simulation's
 * own state and events and writes only the dummy's `InputFrame` and a few
 * gauge top-ups, so every lesson can be driven headlessly in
 * `src/tests/tutorial.test.ts`. The card and the beacons are `TutorialPanel`.
 */

// ------------------------------------------------------------------- keys

/** Every name a lesson's text needs, already formatted for the card. */
export interface KeyNames {
  move: string;
  up: string;
  down: string;
  left: string;
  right: string;
  main: string;
  heavy: string;
  sub: string;
  melee: string;
  boost: string;
  barrier: string;
  modeCycle: string;
  saturation: string;
  flight: string;
  target: string;
  pause: string;
}

/**
 * The player's real bindings, named. With a pad connected the pad button is
 * named alongside the key, so the card is right whichever one is in hand.
 */
export function keyNames(b: BindingMap, pad: boolean): KeyNames {
  const one = (a: ActionId): string => {
    const k = b[a].keys[0];
    const p = b[a].pads[0];
    const parts: string[] = [];
    if (k) parts.push(keyLabel(k));
    if (pad && p !== undefined) parts.push(`PAD ${padLabel(p)}`);
    return parts.length ? `[${parts.join(' / ')}]` : '[UNBOUND]';
  };
  const dirs: ActionId[] = ['up', 'left', 'down', 'right'];
  const arrows = dirs.every((d, i) => b[d].keys[0] === ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'][i]);
  let move = arrows ? '[ARROW KEYS]' : `[${dirs.map((d) => (b[d].keys[0] ? keyLabel(b[d].keys[0]) : '?')).join(' ')}]`;
  if (pad) move = `${move} or [LEFT STICK]`;
  return {
    move,
    up: one('up'),
    down: one('down'),
    left: one('left'),
    right: one('right'),
    main: one('main'),
    heavy: one('heavy'),
    sub: one('sub'),
    melee: one('melee'),
    boost: one('boost'),
    barrier: one('barrier'),
    modeCycle: one('modeCycle'),
    saturation: one('saturation'),
    flight: one('flightToggle'),
    target: one('cycleTarget'),
    pause: one('pause'),
  };
}

// ---------------------------------------------------------------- lessons

/** What the dummy does while a lesson is open. */
export type FoeScript = 'still' | 'shoot' | 'rush' | 'cpu';

/** Everything a lesson's logic can see on one tick. */
export interface LessonCtx {
  sim: MatchSim;
  me: Combatant;
  foe: Combatant;
  input: InputFrame;
  events: readonly SimEvent[];
  /** An attack that began this tick, or null. */
  started: AttackDef | null;
  /** Lesson-local memory, cleared when the lesson opens. */
  mem: Record<string, number>;
  /** Ticks since the lesson opened. */
  t: number;
}

export interface Marker {
  x: number;
  y: number;
  r: number;
}

export interface Lesson {
  id: string;
  /** Section heading on the card: MOVEMENT, WEAPONS, DEFENCE, SATURATION… */
  section: string;
  title: string;
  /** What the card says. Two or three short sentences. */
  text(k: KeyNames): string;
  /** The objective, as it reads under the text. */
  goal(k: KeyNames): string;
  /** How much progress completes it. */
  need: number;
  /** A card to read: completes on the main-gun button. */
  info?: boolean;
  foe: FoeScript;
  /** Escort drones switched on for this lesson. */
  drones?: boolean;
  /** Where both machines are put when the lesson opens, sim px. */
  place: { me: [number, number]; foe: [number, number] };
  /** Called once as the lesson opens, after placement. */
  setup?(ctx: LessonCtx): void;
  /** Called every tick before progress is read: gauge top-ups and the like. */
  keep?(ctx: LessonCtx): void;
  /** New progress, from the tick's state and events. */
  progress(ctx: LessonCtx, current: number): number;
  /** Things to draw in the yard: the flight beacons. */
  markers?(ctx: LessonCtx): Marker[];
}

const MID_Y = 640;
const LEFT: [number, number] = [860, MID_Y];
const RIGHT: [number, number] = [1480, MID_Y];
const NEAR_RIGHT: [number, number] = [1180, MID_Y];

const mine = (ctx: LessonCtx, e: SimEvent, key: 'id' | 'ownerId' | 'victimId'): boolean =>
  (e as unknown as Record<string, number>)[key] === ctx.me.id;

const countEvents = (ctx: LessonCtx, f: (e: SimEvent) => boolean): number => {
  let n = 0;
  for (const e of ctx.events) if (f(e)) n++;
  return n;
};

const speed = (c: Combatant): number => Math.hypot(c.vx, c.vy);

/** Flight beacons, in the order they are flown to. */
export const BEACONS: readonly [number, number][] = [
  [1420, 420],
  [760, 300],
  [1180, 900],
];

export const LESSONS: readonly Lesson[] = [
  // ---------------------------------------------------------------- intro
  {
    id: 'welcome',
    section: 'WELCOME',
    title: 'THE TUTORIAL',
    text: () =>
      'This is a live fight against a practice dummy in CATHEDRAL YARD. Each lesson asks you to do ' +
      'one thing; the next opens when you have done it. Nobody can lose here.',
    goal: (k) => `Press ${k.main} to begin.  ${k.pause} opens the lesson menu: skip, go back, or quit.`,
    need: 1,
    info: true,
    foe: 'still',
    place: { me: LEFT, foe: RIGHT },
    progress: (ctx, cur) => (isPressed(ctx.input, Btn.Main) ? 1 : cur),
  },
  {
    id: 'hud',
    section: 'WELCOME',
    title: 'READING THE GAUGES',
    text: () =>
      'Top left is you, top right the rival. LIFE is the long bar. BST is boost, BAR is your barrier, ' +
      'NRG is weapon energy, SAT is the Saturation meter. The pips under them are missile charges.',
    goal: (k) => `Press ${k.main} to continue.`,
    need: 1,
    info: true,
    foe: 'still',
    place: { me: LEFT, foe: RIGHT },
    progress: (ctx, cur) => (isPressed(ctx.input, Btn.Main) ? 1 : cur),
  },

  // ------------------------------------------------------------- movement
  {
    id: 'fly',
    section: 'MOVEMENT',
    title: 'FREE FLIGHT',
    text: (k) =>
      `Steer with ${k.move}, in any of eight directions. You carry momentum: let go and you coast ` +
      'a little before you stop.',
    goal: () => 'Fly into each of the three beacons.',
    need: BEACONS.length,
    foe: 'still',
    place: { me: LEFT, foe: [1700, 1000] },
    progress(ctx, cur) {
      const b = BEACONS[cur];
      if (!b) return cur;
      return Math.hypot(ctx.me.x - b[0], ctx.me.y - b[1]) < 70 ? cur + 1 : cur;
    },
    markers: (ctx) => {
      const i = Math.min(BEACONS.length - 1, ctx.mem.shown ?? 0);
      const b = BEACONS[i];
      return [{ x: b[0], y: b[1], r: 70 }];
    },
  },
  {
    id: 'brake',
    section: 'MOVEMENT',
    title: 'AIR BRAKE',
    text: (k) =>
      `${k.boost} does three jobs. Held with no direction, it is an air brake: get moving, let go ` +
      `of ${k.move}, and hold ${k.boost} to stop dead.`,
    goal: () => 'Build up speed, then brake to a stop. Three times.',
    need: 3,
    foe: 'still',
    place: { me: LEFT, foe: [1700, 1000] },
    keep: (ctx) => {
      ctx.me.boost = ctx.me.def.flight.maxBoost;
    },
    progress(ctx, cur) {
      const s = speed(ctx.me);
      if (s > 3.6) ctx.mem.armed = 1;
      const noDir = ctx.input.dx === 0 && ctx.input.dy === 0;
      if (ctx.mem.armed && noDir && isHeld(ctx.input, Btn.Boost) && s < 0.6) {
        ctx.mem.armed = 0;
        return cur + 1;
      }
      return cur;
    },
  },
  {
    id: 'boost',
    section: 'MOVEMENT',
    title: 'BOOST',
    text: (k) =>
      `Hold ${k.boost} while steering to boost: much faster, and it burns BST. Let go and the ` +
      'gauge refills after a moment.',
    goal: () => 'Boost for two seconds in total.',
    need: 120,
    foe: 'still',
    place: { me: LEFT, foe: [1700, 1000] },
    progress(ctx, cur) {
      const steering = ctx.input.dx !== 0 || ctx.input.dy !== 0;
      const prev = ctx.mem.prevBoost ?? ctx.me.boost;
      ctx.mem.prevBoost = ctx.me.boost;
      const burning = ctx.me.boost < prev || ctx.me.boostFree;
      return steering && isHeld(ctx.input, Btn.Boost) && ctx.me.dashTicks === 0 && burning ? cur + 1 : cur;
    },
  },
  {
    id: 'dash',
    section: 'MOVEMENT',
    title: 'DASH',
    text: (k) =>
      `Tap ${k.boost} with a direction to dash: a fast, fixed burst that costs a chunk of BST. ` +
      'You cannot guard during a dash — it is a commitment.',
    goal: () => 'Dash four times.',
    need: 4,
    foe: 'still',
    place: { me: LEFT, foe: [1700, 1000] },
    keep: (ctx) => {
      if (ctx.me.dashTicks === 0) ctx.me.boost = ctx.me.def.flight.maxBoost;
    },
    progress: (ctx, cur) => cur + countEvents(ctx, (e) => e.t === 'dash' && mine(ctx, e, 'id')),
  },
  {
    id: 'ground',
    section: 'MOVEMENT',
    title: 'FLIGHT MODE',
    text: (k) =>
      `${k.flight} switches flight off: you drop to the deck and walk, brace better against hits ` +
      `and refill boost faster. On the deck ${k.boost} jumps. ${k.flight} again takes off.`,
    goal: () => 'Land on the deck, then take off again.',
    need: 2,
    foe: 'still',
    place: { me: LEFT, foe: RIGHT },
    progress(ctx, cur) {
      if (cur === 0 && (ctx.me.grounded || countEvents(ctx, (e) => e.t === 'land' && mine(ctx, e, 'id')))) return 1;
      if (cur === 1 && ctx.me.flying && !ctx.me.grounded) return 2;
      return cur;
    },
  },

  // -------------------------------------------------------------- weapons
  {
    id: 'gun',
    section: 'WEAPONS',
    title: 'LOCK-ON AND THE MAIN GUN',
    text: (k) =>
      `Your weapons lock on to the rival by themselves — just face the fight. Press or hold ` +
      `${k.main} for the main gun. Firing anchors you: you slow down while you shoot.`,
    goal: () => 'Land six main-gun hits on the dummy.',
    need: 6,
    foe: 'still',
    place: { me: LEFT, foe: RIGHT },
    keep: (ctx) => {
      ctx.me.energy = ctx.me.def.gauges.maxEnergy;
    },
    progress: (ctx, cur) =>
      cur + countEvents(ctx, (e) => e.t === 'hit' && mine(ctx, e, 'ownerId') && e.kind === ProjKind.Bullet),
  },
  {
    id: 'heavy',
    section: 'WEAPONS',
    title: 'HEAVY SHOT',
    text: (k) =>
      `${k.heavy} fires the heavy shot: slower, harder, and it costs more NRG — the yellow gauge. ` +
      'Run NRG dry and your guns wait for it to refill.',
    goal: () => 'Land two heavy shots.',
    need: 2,
    foe: 'still',
    place: { me: LEFT, foe: RIGHT },
    keep: (ctx) => {
      ctx.me.energy = ctx.me.def.gauges.maxEnergy;
    },
    progress: (ctx, cur) =>
      cur + countEvents(ctx, (e) => e.t === 'hit' && mine(ctx, e, 'ownerId') && e.kind === ProjKind.Heavy),
  },
  {
    id: 'sword',
    section: 'WEAPONS',
    title: 'THE SWORD',
    text: (k) =>
      `${k.melee} draws and swings your sword. Every swing lunges forward, so it reaches from ` +
      'outside contact range — close in and strike.',
    goal: () => 'Land a sword hit.',
    need: 1,
    foe: 'still',
    place: { me: LEFT, foe: NEAR_RIGHT },
    keep: (ctx) => {
      ctx.me.energy = ctx.me.def.gauges.maxEnergy;
    },
    progress: (ctx, cur) =>
      Math.min(1, cur + countEvents(ctx, (e) => e.t === 'hit' && mine(ctx, e, 'ownerId') && e.kind === ProjKind.Melee)),
  },
  {
    id: 'chain',
    section: 'WEAPONS',
    title: 'SWORD CHAIN',
    text: (k) =>
      `Press ${k.melee} again as each swing lands to chain the next stage — three stages, the ` +
      'last one a launcher. The chain only continues if the swing before it connected.',
    goal: () => 'Land a three-hit sword chain.',
    need: 3,
    foe: 'still',
    place: { me: LEFT, foe: NEAR_RIGHT },
    keep: (ctx) => {
      ctx.me.energy = ctx.me.def.gauges.maxEnergy;
    },
    progress(ctx, cur) {
      let best = cur;
      for (const e of ctx.events) {
        if (e.t !== 'hit' || !mine(ctx, e, 'ownerId') || e.kind !== ProjKind.Melee) continue;
        const gap = ctx.t - (ctx.mem.lastHit ?? -999);
        ctx.mem.chain = gap <= 75 ? (ctx.mem.chain ?? 0) + 1 : 1;
        ctx.mem.lastHit = ctx.t;
        best = Math.max(best, ctx.mem.chain);
      }
      // A chain that broke off shows as broken, so the bar says why.
      if (ctx.t - (ctx.mem.lastHit ?? -999) > 75 && best < 3) return 0;
      return best;
    },
  },
  {
    id: 'scatter',
    section: 'COMMAND MOTIONS',
    title: 'SCATTER SHOT',
    text: (k) =>
      'Some weapons are fighting-game motions, read relative to the way you face — forward is ' +
      `toward the rival. Down, down-forward, forward, then ${k.main}: a scatter shot.`,
    goal: (k) => `Fire the scatter shot:  DOWN  DOWN-FORWARD  FORWARD + ${k.main}`,
    need: 1,
    foe: 'still',
    place: { me: LEFT, foe: RIGHT },
    keep: (ctx) => {
      ctx.me.energy = ctx.me.def.gauges.maxEnergy;
    },
    progress: (ctx, cur) => (ctx.started && ctx.started === ctx.me.def.spread ? cur + 1 : cur),
  },
  {
    id: 'lance',
    section: 'COMMAND MOTIONS',
    title: 'LANCE BEAM',
    text: (k) =>
      `Down, down-back, back, then ${k.heavy}: the lance — a long piercing beam. A guard does not ` +
      'stop it, and firing it roots you in place, so pick the moment.',
    goal: (k) => `Fire the lance:  DOWN  DOWN-BACK  BACK + ${k.heavy}`,
    need: 1,
    foe: 'still',
    place: { me: LEFT, foe: RIGHT },
    keep: (ctx) => {
      ctx.me.energy = ctx.me.def.gauges.maxEnergy;
    },
    progress: (ctx, cur) => (ctx.started && ctx.started === ctx.me.def.lance ? cur + 1 : cur),
  },

  // ---------------------------------------------------------------- drone
  {
    id: 'drone',
    section: 'YOUR DRONE',
    title: 'THE ESCORT',
    text: () =>
      'Your drone flies with you and fights on its own, and gives you a passive bonus while it is ' +
      'out. The bars under it are its hit points and its volley charge: when the lower bar fills, ' +
      'it fires at whatever you are fighting. Shot down, it rebuilds itself — but its bonus is gone till then.',
    goal: () => 'Stay in the fight and let your drone fire a volley on its own.',
    need: 1,
    foe: 'still',
    drones: true,
    place: { me: LEFT, foe: RIGHT },
    setup: (ctx) => {
      ctx.me.supporter.reset(ctx.me);
      ctx.foe.supporter.stow();
    },
    keep: (ctx) => {
      if (ctx.foe.supporter.mode !== DroneMode.Stowed) ctx.foe.supporter.stow();
      ctx.me.subCharges = Math.max(ctx.me.subCharges, 1);
    },
    progress: (ctx, cur) =>
      Math.min(1, cur + countEvents(ctx, (e) => e.t === 'assist' && mine(ctx, e, 'ownerId') && !!e.auto)),
  },
  {
    id: 'salvo',
    section: 'YOUR DRONE',
    title: 'DRONE SALVO',
    text: (k) =>
      'The rival is out of your drone’s range, so it is holding fire. Order it anyway: down, ' +
      `down-forward, forward, then ${k.sub}. A salvo costs two missile charges — the pips under your gauges.`,
    goal: (k) => `Order a salvo:  DOWN  DOWN-FORWARD  FORWARD + ${k.sub}`,
    need: 1,
    foe: 'still',
    drones: true,
    // Further apart than any escort's own firing range, so the drone never
    // spends the charges on a volley of its own before the order arrives.
    place: { me: [380, MID_Y], foe: [2020, MID_Y] },
    setup: (ctx) => {
      ctx.me.supporter.reset(ctx.me);
      ctx.foe.supporter.stow();
    },
    keep: (ctx) => {
      if (ctx.foe.supporter.mode !== DroneMode.Stowed) ctx.foe.supporter.stow();
      ctx.me.subCharges = Math.max(ctx.me.subCharges, ctx.me.def.salvo.subCost ?? 1);
      if (ctx.me.supporter.mode === DroneMode.Stowed && ctx.t % 90 === 89) ctx.me.supporter.reset(ctx.me);
    },
    progress: (ctx, cur) =>
      Math.min(1, cur + countEvents(ctx, (e) => e.t === 'assist' && mine(ctx, e, 'ownerId') && !e.auto)),
  },
  {
    id: 'target',
    section: 'YOUR DRONE',
    title: 'SWITCHING TARGET',
    text: (k) =>
      `The rival has a drone too. ${k.target} moves your lock between the pilot and its escort. ` +
      'Shoot an escort down and its passive is gone for the rest of the match.',
    goal: (k) => `Lock on to the rival's drone with ${k.target}, then back to the pilot.`,
    need: 2,
    foe: 'still',
    drones: true,
    place: { me: LEFT, foe: RIGHT },
    setup: (ctx) => {
      ctx.foe.supporter.reset(ctx.foe);
      ctx.me.lockPref = 'mech';
    },
    keep: (ctx) => {
      // The dummy's escort stays up and harmless for this one.
      if (ctx.foe.supporter.mode !== DroneMode.Active) ctx.foe.supporter.reset(ctx.foe);
      ctx.foe.supporter.cancel();
      ctx.me.life = ctx.me.def.gauges.maxLife;
    },
    progress(ctx, cur) {
      if (cur === 0 && ctx.me.lockPref === 'drone') return 1;
      if (cur === 1 && ctx.me.lockPref === 'mech') return 2;
      return cur;
    },
  },

  // -------------------------------------------------------------- defence
  {
    id: 'guard',
    section: 'DEFENCE',
    title: 'GUARD',
    text: (k) =>
      `The dummy is shooting now. Hold ${k.barrier} to guard: it cuts gunfire damage by 80% but ` +
      'drains BAR. Empty BAR and you are guard broken — helpless for nearly a second.',
    goal: () => 'Guard five shots.',
    need: 5,
    foe: 'shoot',
    place: { me: LEFT, foe: RIGHT },
    keep: (ctx) => {
      ctx.me.barrier = Math.max(ctx.me.barrier, ctx.me.def.gauges.maxBarrier * 0.5);
    },
    progress: (ctx, cur) => cur + countEvents(ctx, (e) => e.t === 'guard' && mine(ctx, e, 'victimId')),
  },
  {
    id: 'barrier',
    section: 'DEFENCE',
    title: 'BARRIER BURST',
    text: (k) =>
      `Tap ${k.barrier} instead of holding it: a burst. For a moment you cannot be hurt, and every ` +
      'shot the burst swallows turns into SAT charge. Barrier is offence.',
    goal: () => 'Absorb three shots with barrier bursts.',
    need: 3,
    foe: 'shoot',
    place: { me: LEFT, foe: RIGHT },
    keep: (ctx) => {
      if (ctx.me.act !== ActState.Barrier) ctx.me.barrier = ctx.me.def.gauges.maxBarrier;
    },
    progress: (ctx, cur) => cur + countEvents(ctx, (e) => e.t === 'absorb' && mine(ctx, e, 'victimId')),
  },
  {
    id: 'repel',
    section: 'DEFENCE',
    title: 'REPEL',
    text: (k) =>
      `The dummy will rush in with its sword. Burst with ${k.barrier} as it reaches you and swings: ` +
      'a burst covers you for about half a second, and a first blow that lands inside it is thrown ' +
      'back — the attacker is stunned and you take nothing. It only works on the opening blow.',
    goal: () => 'Repel a sword rush.',
    need: 1,
    foe: 'rush',
    place: { me: LEFT, foe: RIGHT },
    keep: (ctx) => {
      if (ctx.me.act !== ActState.Barrier) ctx.me.barrier = ctx.me.def.gauges.maxBarrier;
      ctx.me.life = Math.max(ctx.me.life, ctx.me.def.gauges.maxLife * 0.6);
    },
    progress: (ctx, cur) =>
      Math.min(1, cur + countEvents(ctx, (e) => e.t === 'meleeRepel' && mine(ctx, e, 'id'))),
  },

  // ------------------------------------------------------------ saturation
  {
    id: 'modes',
    section: 'SATURATION',
    title: 'SATURATION MODES',
    text: (k) =>
      `SAT fills as you fight. Before you spend it, choose what it does: ${k.modeCycle} cycles ` +
      'SHIELD (guard stays up for free), SHOOT (both guns, no energy cost) and SPEED (free thrust).',
    goal: (k) => `Cycle through the modes with ${k.modeCycle}: three presses.`,
    need: 3,
    foe: 'still',
    place: { me: LEFT, foe: RIGHT },
    progress: (ctx, cur) => cur + countEvents(ctx, (e) => e.t === 'modeCycle' && mine(ctx, e, 'id')),
  },
  {
    id: 'saturate',
    section: 'SATURATION',
    title: 'SPEND IT',
    text: (k) =>
      `Your SAT is full. ${k.saturation} spends it in the chosen mode — try SHOOT. When the meter ` +
      'runs dry you burn out, stunned for a second, so spend it where you can afford to.',
    goal: (k) => `Activate Saturation with ${k.saturation}, then land four hits while it lasts.`,
    need: 5,
    foe: 'still',
    place: { me: LEFT, foe: RIGHT },
    keep: (ctx) => {
      const me = ctx.me;
      // Full and waiting until spent; topped up again if a run ends unfinished.
      if (!me.satActive && me.satBurnout === 0) me.sat = me.def.gauges.maxSaturation;
      me.energy = me.def.gauges.maxEnergy;
    },
    progress(ctx, cur) {
      if (cur === 0) return countEvents(ctx, (e) => e.t === 'saturation' && mine(ctx, e, 'id')) ? 1 : 0;
      if (!ctx.me.satActive) {
        // Burnt out short of the goal: back to the start of the drill.
        return ctx.me.satBurnout > 0 ? cur : 0;
      }
      return Math.min(5, cur + countEvents(ctx, (e) => e.t === 'hit' && mine(ctx, e, 'ownerId')));
    },
  },

  // ------------------------------------------------------------------ spar
  {
    id: 'spar',
    section: 'FINAL LESSON',
    title: 'SPAR',
    text: () =>
      'Put it together. The rival fights back now, on EASY, with its drone. Move, shoot, guard, ' +
      'burst, swing — whatever works. You cannot be knocked out for good.',
    goal: () => 'Knock the rival down once.',
    need: 1,
    foe: 'cpu',
    drones: true,
    place: { me: LEFT, foe: RIGHT },
    setup: (ctx) => {
      ctx.me.supporter.reset(ctx.me);
      ctx.foe.supporter.reset(ctx.foe);
      ctx.mem.downs = ctx.sim.dummyDowns;
    },
    progress: (ctx, cur) => (ctx.sim.dummyDowns > (ctx.mem.downs ?? 0) ? 1 : cur),
  },
];

// --------------------------------------------------------------- director

/** How long the CLEAR stamp holds before the next lesson opens, in ticks. */
export const CLEAR_TICKS = 84;

/**
 * Runs the course against a live `MatchSim` built with `dummy: true`.
 *
 * Per tick: `foeInput()` before `sim.step`, `afterStep(playerInput)` after it.
 * Everything else — skipping, going back, restarting — is a call from the
 * lesson menu.
 */
export class TutorialDirector {
  index = 0;
  progress = 0;
  /** Ticks left on the CLEAR stamp, or 0. */
  clearing = 0;
  /** Every lesson done (or skipped through). */
  done = false;
  /** Lessons actually cleared, by id — skipping one does not count it. */
  readonly cleared = new Set<string>();
  private mem: Record<string, number> = {};
  private t = 0;
  private prevAttack: AttackDef | null = null;
  private prevAttackTick = 0;
  private readonly ai: RivalAI;
  private rushCooldown = 0;

  constructor(
    private readonly sim: MatchSim,
    seed = 0x7a7a,
  ) {
    this.ai = new RivalAI({ difficulty: Difficulty.Easy }, new Rng(seed));
    this.open(0);
  }

  get lesson(): Lesson {
    return LESSONS[this.index];
  }

  get count(): number {
    return LESSONS.length;
  }

  private get me(): Combatant {
    return this.sim.player;
  }

  private get foe(): Combatant {
    return this.sim.enemy;
  }

  private ctx(input: InputFrame, started: AttackDef | null): LessonCtx {
    return {
      sim: this.sim,
      me: this.me,
      foe: this.foe,
      input,
      events: this.sim.events,
      started,
      mem: this.mem,
      t: this.t,
    };
  }

  /** Puts a machine back where a lesson wants it, flying and unhurt. */
  private place(c: Combatant, at: [number, number]): void {
    const g = c.def.gauges;
    c.x = at[0];
    c.y = at[1];
    c.vx = 0;
    c.vy = 0;
    c.life = g.maxLife;
    c.energy = g.maxEnergy;
    c.barrier = g.maxBarrier;
    c.boost = c.def.flight.maxBoost;
    c.hitstun = 0;
    c.hitstop = 0;
    c.guardBreakStun = 0;
    c.invuln = 0;
    c.satBurnout = 0;
    c.satActive = false;
    c.satTicks = 0;
    c.attack = null;
    c.act = ActState.Free;
    c.dashTicks = 0;
    c.spin = 0;
    c.flying = true;
    c.grounded = false;
  }

  /** Opens lesson `i` from the start. */
  open(i: number): void {
    this.index = Math.max(0, Math.min(LESSONS.length - 1, i));
    this.progress = 0;
    this.clearing = 0;
    this.done = false;
    this.mem = {};
    this.t = 0;
    this.rushCooldown = 60;
    const L = this.lesson;
    this.sim.projectiles.clear();
    this.sim.dronesEnabled = !!L.drones;
    this.place(this.me, L.place.me);
    this.place(this.foe, L.place.foe);
    this.me.sat = L.id === 'saturate' ? this.me.def.gauges.maxSaturation : 0;
    this.foe.sat = 0;
    this.prevAttack = null;
    L.setup?.(this.ctx(emptyInput(), null));
  }

  next(): void {
    if (this.index >= LESSONS.length - 1) {
      this.done = true;
      return;
    }
    this.open(this.index + 1);
  }

  back(): void {
    this.open(this.index - 1);
  }

  restart(): void {
    this.open(this.index);
  }

  /** The dummy's input for this tick. */
  foeInput(): InputFrame {
    const f = emptyInput();
    const me = this.me;
    const foe = this.foe;
    if (this.done) return f;
    switch (this.lesson.foe) {
      case 'still':
        return f;
      case 'shoot': {
        // Short bursts of the main gun with a breath between, so a guard or a
        // burst can be timed rather than held forever.
        const t = this.t % 84;
        if (t < 30 && t % 9 === 0) {
          f.held |= 1 << Btn.Main;
          f.pressed |= 1 << Btn.Main;
        }
        return f;
      }
      case 'rush': {
        // Close in, swing once, back off, and come again.
        const dx = me.x - foe.x;
        const dy = me.y - foe.y;
        const d = Math.hypot(dx, dy);
        if (this.rushCooldown > 0) {
          this.rushCooldown--;
          if (d < 420) {
            f.dx = -Math.sign(dx);
            f.dy = 0;
          }
          return f;
        }
        if (d > foe.def.meleeRange * 0.7) {
          f.dx = Math.abs(dx) > 20 ? Math.sign(dx) : 0;
          f.dy = Math.abs(dy) > 30 ? Math.sign(dy) : 0;
          if (d > 360) f.held |= 1 << Btn.Boost;
          return f;
        }
        f.held |= 1 << Btn.Melee;
        f.pressed |= 1 << Btn.Melee;
        this.rushCooldown = 150;
        return f;
      }
      case 'cpu':
        return this.ai.think(foe, me, this.sim.activeProjectiles(), ARENA_W, ARENA_H);
    }
  }

  /** Reads the tick that just ran. `input` is what the player pressed on it. */
  afterStep(input: InputFrame): void {
    if (this.done) return;
    this.t++;
    const me = this.me;
    const a = me.attack;
    const started = a && (a !== this.prevAttack || me.attackTick < this.prevAttackTick) ? a : null;
    this.prevAttack = a;
    this.prevAttackTick = me.attackTick;
    const L = this.lesson;
    const ctx = this.ctx(input, started);

    // Nobody goes down before the spar: both sides are kept on their feet.
    if (L.foe !== 'cpu') {
      this.foe.life = this.foe.def.gauges.maxLife;
      me.life = Math.max(me.life, me.def.gauges.maxLife * 0.5);
    }
    L.keep?.(ctx);

    if (this.clearing > 0) {
      this.clearing--;
      if (this.clearing === 0) this.next();
      return;
    }
    const before = this.progress;
    this.progress = Math.max(0, Math.min(L.need, L.progress(ctx, this.progress)));
    if (L.id === 'fly') this.mem.shown = this.progress;
    if (this.progress >= L.need && before < L.need) {
      this.cleared.add(L.id);
      this.clearing = CLEAR_TICKS;
    }
  }

  /** Beacons and the like, for the panel to draw. */
  markers(): Marker[] {
    if (this.done || this.clearing > 0) return [];
    return this.lesson.markers?.(this.ctx(emptyInput(), null)) ?? [];
  }

  /** 0..1 for the card's bar. */
  get fraction(): number {
    return this.lesson.need > 0 ? this.progress / this.lesson.need : 1;
  }
}
