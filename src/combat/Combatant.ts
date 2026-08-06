import type { DronePassiveDef, MechDef, SwingArc } from '../mechs/MechDef';
import type { AttackDef } from './AttackData';
import { ATTACK_TOTAL, defaultFamily } from './AttackData';
import { PROJ_FAMILIES, PROJ_SPEED_MAX, PROJ_SPEED_MIN } from '../projectiles/families';
import { CommandBuffer, MOTIONS, Sym, dirFrom } from './CommandBuffer';
import { clampToArena, stepFlight, type FlightIntent, type FlightState } from './FlightModel';
import {
  ActState,
  BarrierResponse,
  Btn,
  Phase,
  ProjKind,
  SAT_MODE_COUNT,
  SatMode,
  Team,
  isHeld,
  isPressed,
  type InputFrame,
  type ProjectileSpawn,
  type SimEvent,
  WeaponSlot,
  WEAPON_SLOT_COUNT,
} from './types';
import { DEG, approachAngle, clamp, lerp } from '../core/MathUtil';
import { Supporter, type DecoyState } from './Supporter';
import { Rng } from '../core/Rng';
import { Element, StatusState } from './Status';

/** Radians per tick a melee lunge may correct toward its target. */
const MELEE_TRACK_RATE = 9 * DEG;

/** Extra swings Speed saturation adds to a melee chain and a lock-on sequence. */
const SAT_SPEED_BONUS_HITS = 3;

/**
 * Projectile lifetime while any saturation burst is up: effectively unlimited.
 *
 * Range in this game is `projSpeed * projLife` — a shot expires on a timer, not
 * at a wall — so "unlimited range" is a lifetime long enough that the timer
 * never runs out inside the arena. 900 ticks is fifteen seconds, further than
 * the slowest shot on the roster travels in a whole round.
 *
 * Nothing leaks: `MatchSim` culls anything past the arena bounds plus a 260 px
 * margin, so a shot that flies off the map is removed by geometry rather than by
 * its timer.
 *
 * This applies to **all three modes**, not just Shoot. It is the one thing every
 * burst has in common — the machine is over-driven, so its guns reach further —
 * and it changes the shape of a burst rather than only its numbers: PYRE's
 * CINDER JET normally dies at 300 px and can suddenly cross the yard.
 */
const SAT_UNLIMITED_LIFE = 900;

/**
 * Ticks between "the barrier button is locked out" refusals.
 *
 * The lock-out lasts a whole Shield burst, so without a debounce a pilot who
 * mashes the button gets a machine-gun of denial blips. One every 0.4s says the
 * same thing and stops saying it.
 */
const BARRIER_DENIED_COOLDOWN = 24;

/**
 * Fraction of a hit that lands while a Shield burst is up, by how it arrives.
 *
 * These are **totals against raw damage**, not modifiers stacked onto the guard:
 * while Shield is up this table *replaces* `guardScale` / `meleeGuardScale`
 * rather than multiplying with them. Stating the end result directly is the only
 * way these stay legible — the four categories reach the hull down three
 * different branches of `takeHit` plus the status tick, each already carrying
 * its own scaling, so one figure applied "somewhere in the middle" of all that
 * lands as four different numbers nobody chose.
 *
 * The shape of the table is the design: **melee is the way through a Shield.**
 * A sword gets 30 % of its damage in where a rifle gets 5 %, so the answer to a
 * pilot sitting inside a defensive burst is to close the distance, with a lance
 * in between. Shield is not a wall, it is a wall with a known door.
 *
 * Every one is still a large improvement on the same hit without the burst: a
 * plain guard stops 80 % of gunfire and only 50 % of melee, and stops nothing
 * whatsoever from a piercing lance or a burn.
 */
// ---- airborne leg dangle -----------------------------------------------
//
// See `Combatant.legSwing`. All angles in radians, all rates per tick at 60Hz.

/** Peak trail angle at full speed under full thrust. */
const LEG_DANGLE_MAX = 26 * DEG;
/** Trail from velocity alone, and the extra the thrusters add on top. */
const LEG_TRAIL_BASE = 0.7;
const LEG_TRAIL_THRUST = 0.55;
/** How much vertical motion contributes. Small on purpose. */
const LEG_RISE = 0.28;
/** Idle sway, so a mech holding station still has weight hanging off it. */
const LEG_IDLE = 2.6 * DEG;
const LEG_IDLE_RATE = 0.028;
/**
 * Phase offset between the two legs' idle sway.
 *
 * Not `PI`. Exact antiphase is a march — the legs mirror each other and the
 * pair reads as a single scissoring unit. Roughly two fifths of a cycle keeps
 * them visibly independent without ever looking like a walk.
 */
const LEG_SWAY_OFFSET = 2.4;
/**
 * Spring stiffness and damping per leg, `[near, far]`.
 *
 * **Deliberately different values.** Identical springs driven by an identical
 * target return identical angles forever, which is the welded-together look
 * this exists to fix. The far leg is a little slacker and a little slower to
 * settle, so the two cross and separate on every direction change.
 */
const LEG_SPRING = [0.058, 0.045];
const LEG_DAMP = [0.80, 0.845];

const SHIELD_TAKEN = {
  /** Ordinary shots — 95 % off. */
  gunfire: 0.05,
  /** Swords, claws, pile drivers — 70 % off. The intended way in. */
  melee: 0.3,
  /** Lances, which a guard cannot touch at all — 80 % off. */
  pierce: 0.2,
  /** Burn, acid and the rest of the status damage — 95 % off. */
  chip: 0.05,
} as const;

/**
 * Life fraction at or below which a saturation burst opens in its **desperation**
 * form, with the mode's effect dramatically escalated.
 *
 * The meter charges off damage taken, so the pilot most likely to be holding a
 * full bar is the one being beaten — and until this existed, that bar bought
 * them exactly the same burst it bought the pilot who was winning. A comeback
 * mechanic that only the loser can reach is the point, not an oversight.
 *
 * Chosen to line up with the thresholds already in the game: the HUD ring turns
 * amber under a third, and `hurt` banter fires there too, so the moment a pilot
 * becomes dangerous is a moment the game was already dramatising.
 */
export const DESPERATION_LIFE = 1 / 3;

/**
 * Desperation multipliers. Deliberately large — these are last stands, and a
 * subtle last stand is not worth the mechanic.
 */
/** Melee lock reach, ×. Puts it past the width of the viewport. */
const DESPERATE_MELEE_RANGE = 9;

/** Thruster load while simply holding station in the air. Presentation only. */
const HOVER_THRUST = 0.2;

/**
 * The three dials the ground game is bought with, alongside the recoil rule in
 * `fire` and the removed forced takeoff on the heavy.
 *
 * All three are deliberately modest. The deck already carried a large reward —
 * `defence.groundedMul`, worth 34 % off incoming for TERRAMOTH — that nothing
 * could ever claim, because the grounded branch of `FlightModel` had no jump,
 * no dash and no boost, and firing the heavy kicked you off the floor. The work
 * here is mostly *removing reasons not to stand*; these are the small reasons
 * to stay once you are there.
 */
/** Incoming knockback taken while planted. Slight, by design — see `knockbackScale`. */
const GROUNDED_KNOCKBACK = 0.85;
/** Weapon-energy regen multiplier while planted. */
const GROUNDED_ENERGY_REGEN = 1.5;
/** Share of the usual barrier drain a guarded hit costs while planted. */
const GROUNDED_GUARD_COST = 0.7;
/** Dash speed, ×, on top of the Speed burst's own thrust scaling. */
export const DESPERATE_DASH = 1.9;
/** Projectile speed, ×, on top of the Shoot burst's own scaling. */
export const DESPERATE_PROJ_SPEED = 1.85;
/** Chance that each shot fired inside a desperate Shoot burst is doubled. */
export const DESPERATE_EXTRA_SHOT = 1 / 3;

/**
 * Extra damage a painted target takes from the pilot whose drone painted it.
 *
 * **This started as homing and homing was the wrong mechanic.** Tracking on
 * every shot measured at +0.47 of a life bar for HALCYON — the strongest thing
 * in the game — and cutting it to a fifth did not fix the real problem: shots
 * that steer erode *dodging*, and dodging is where the whole defensive ladder
 * and most of EXTREME's advantage live. With it in, EXTREME measured as **losing
 * to HARD**, because its threat-solving and evasion were being made irrelevant.
 *
 * Damage is the honest version of the same idea. A painted mech is worth more to
 * shoot at; it is not harder to get away from. ARBITER remains a force
 * multiplier — it never fires and makes every shot Naia takes count for more —
 * without touching the mechanic the rest of the game is built on.
 */
export const DESIGNATOR_DAMAGE = 1.2;

/**
 * Extra turn rate, in radians per tick, that the painter's rounds steer at
 * while the paint is up.
 *
 * **Re-added by design after the note above rejected it.** Read that note first:
 * tracking on every shot measured at +0.47 of a life bar for HALCYON, cutting it
 * to a fifth did not fix it, and EXTREME measured as losing to HARD because
 * steering shots erode dodging — which is where most of EXTREME's advantage
 * lives. `Projectile.step` even says out loud that the AI's dodge prediction
 * reads a straight line from current velocity.
 *
 * Two things are different this time. It is far smaller than the versions that
 * failed — 0.012 against missile homing of 0.048–0.062, so roughly 20° of total
 * correction across a typical flight rather than a lock. And HALCYON is now the
 * **weakest** machine on the roster at −0.229, where it was the strongest when
 * this was last tried.
 *
 * Neither of those is an argument that it works. **Measure the difficulty ladder,
 * not just the roster spread** — the ladder is what it broke last time, and a
 * roster table alone would not have caught that.
 */
export const DESIGNATOR_HOMING = 0.012;

/**
 * How long a disarmed weapon stays offline. Five seconds.
 *
 * Long enough to change what the pilot does rather than merely what they press
 * — five seconds without a main gun is a decision about how to spend the next
 * five seconds — and short enough that it is a window rather than a sentence.
 */
export const DISARM_TICKS = 300;

/**
 * Ticks the pilot is helpless after a saturation burst burns out.
 *
 * Saturation used to end with no downside at all, so the only question was when
 * to spend it, never whether. The burnout makes the last second of a burst a
 * real liability: overdrive is a window you have to get value out of and then
 * survive the end of.
 *
 * A full second, and longer than a guard break (50). It was first tuned to 38
 * by analogy with the other stuns, which played as barely noticeable — the
 * burst simply ended and you carried on. At 60 the opponent has time to cross
 * the gap and open on you, which is what makes spending the meter a decision
 * about position rather than only about timing.
 */
const SAT_BURNOUT_TICKS = 60;

/**
 * Ticks of helplessness after an *early* burst collapses.
 *
 * Spending a part-charged meter is allowed, and it is meant to be a gamble
 * rather than a slightly worse option: the burst is proportionally weaker and
 * shorter, and it ends in a genuine disaster instead of a stumble. Two seconds
 * is long enough to lose a round from.
 */
const SAT_OVERHEAT_TICKS = 120;

/** Fraction of max life an overheat costs. Slight, and never lethal. */
const SAT_OVERHEAT_LIFE_FRAC = 0.05;

/**
 * Least charge the button will accept.
 *
 * Below this the burst would be too short to do anything with, so the press is
 * refused outright rather than throwing the meter away for nothing.
 */
const SAT_MIN_FRACTION = 0.25;

/**
 * Where successive `stab` hits land, as a fraction of the arc's sweep.
 *
 * An assassin picks separate targets on a body — throat, flank, under the arm —
 * rather than stabbing the same spot repeatedly. Cycling these is what turns a
 * chain of jabs into knifework. Deliberately not symmetrical: an even
 * high/low/high/low alternation reads as a machine oscillating.
 */
const STAB_SPOTS = [-0.34, 0.28, -0.12, 0.40, -0.26, 0.08];

/** Degrees the scythe cocks back in the grip during the wind-up. */
const WEAPON_COCK = 46;
/** Degrees it whips past neutral at the strike before trailing. */
const WEAPON_LEAD = 62;
/** Degrees the chassis rocks back while loading, and drives forward on the blow. */
const LEAN_LOAD = 5;
const LEAN_DRIVE = 9;
/** Vertical travel as a multiple of `reach`; the reference runs ~1.4x. */
const LIFT_RATIO = 1.4;

/**
 * How committed the off-hand is to the shaft at swing progress `t`, 0..1.
 *
 * Takes hold fast during the wind-up — you grab the weapon *before* you swing it
 * — holds through the strike, and releases only at the very end of the
 * follow-through. Releasing early would make the arm snap back mid-slash.
 */
/**
 * Weapon rotation *within the grip* at swing progress `t`, in radians.
 *
 * Sampled from the reference: the gripped hand rotates through more than 150
 * degrees across a single slash, and **not in step with the arm** — it cocks
 * back hard during the wind-up, whips through ahead of the arm at the strike,
 * then trails behind on the follow-through. That lead-and-trail is the whole
 * difference between a blade being swung and a plank being rotated.
 *
 * Zero for every motion but `reap`, so nothing else changes.
 */
export function swingWeaponSpin(arc: SwingArc, t: number, hitIndex: number): number {
  if ((arc.motion ?? 'swing') !== 'reap') return 0;
  const k = clamp(t, 0, 1);
  const wf = clamp(arc.windupFrac, 0.05, 0.95);
  const dir = arc.alternate && hitIndex % 2 === 1 ? -1 : 1;
  let deg: number;
  if (k <= wf) {
    // Cocking back, easing into the loaded position.
    const w = k / wf;
    deg = -WEAPON_COCK * (1 - (1 - w) * (1 - w));
  } else {
    const s = (k - wf) / (1 - wf);
    // Whips past neutral at the strike, then settles back trailing.
    const burst = Math.min(1.0, s * 2.3);
    const lead = 1 - Math.pow(1 - burst, 2.2);
    deg = -WEAPON_COCK + (WEAPON_COCK + WEAPON_LEAD) * lead - WEAPON_LEAD * s * s;
  }
  return deg * DEG * dir;
}

/**
 * Chassis lean at swing progress `t`, in radians.
 *
 * The reference's hips rotate hard through the strike. Side-on we cannot show a
 * twist about the vertical, so the body pitches into the blow and recoils out of
 * it instead — the same commitment, expressed in the plane we can see.
 */
export function swingLean(arc: SwingArc, t: number, hitIndex: number): number {
  if ((arc.motion ?? 'swing') !== 'reap') return 0;
  const k = clamp(t, 0, 1);
  const wf = clamp(arc.windupFrac, 0.05, 0.95);
  const dir = arc.alternate && hitIndex % 2 === 1 ? -1 : 1;
  let deg: number;
  if (k <= wf) {
    deg = -LEAN_LOAD * (k / wf);          // rock back as the weapon is raised
  } else {
    const s = (k - wf) / (1 - wf);
    const burst = Math.min(1.0, s * 2.1);
    deg = -LEAN_LOAD + (LEAN_LOAD + LEAN_DRIVE) * (1 - Math.pow(1 - burst, 2.0));
    deg -= LEAN_DRIVE * Math.pow(s, 3);   // settle upright on the follow-through
  }
  return deg * DEG * dir;
}

/**
 * Weapon travel *across* the aim at swing progress `t`, in logical pixels.
 *
 * Companion to `swingReach`, which only pushes along the aim. The reference's
 * hand rises through the wind-up and drops hard through the strike — roughly 25
 * px of vertical travel at our scale against 18 px of forward — so a swing built
 * on the forward axis alone is missing more of the motion than it has.
 */
export function swingLift(arc: SwingArc, t: number, hitIndex: number): number {
  if ((arc.motion ?? 'swing') !== 'reap') return 0;
  const R = arc.reach ?? 0;
  if (R === 0) return 0;
  const k = clamp(t, 0, 1);
  const wf = clamp(arc.windupFrac, 0.05, 0.95);
  const dir = arc.alternate && hitIndex % 2 === 1 ? -1 : 1;
  const amp = R * LIFT_RATIO;
  let v: number;
  if (k <= wf) {
    v = -amp * Math.sin((k / wf) * Math.PI * 0.5);   // rises (screen-negative)
  } else {
    const s = (k - wf) / (1 - wf);
    const burst = Math.min(1.0, s * 2.3);
    v = -amp + amp * 1.85 * (1 - Math.pow(1 - burst, 2.2));
    v -= amp * 0.85 * Math.pow(s, 2.5);             // recover toward rest
  }
  return v * dir;
}

export function swingGrip(arc: SwingArc, t: number): number {
  if (!arc.twoHanded) return 0;
  const k = clamp(t, 0, 1);
  const wf = clamp(arc.windupFrac, 0.05, 0.95);
  if (k <= wf) return 1 - Math.pow(1 - k / wf, 2);
  const s = (k - wf) / (1 - wf);
  return s < 0.82 ? 1 : 1 - (s - 0.82) / 0.18;
}

/**
 * Arm angle at normalised swing progress `t`, in radians relative to the aim.
 *
 * Two phases, matching how the reference drove its arm helper: the arm winds
 * back to `windup`, then sweeps `sweep` degrees through the target and past it.
 * The slash decelerates — the reference's command curve was `k*time/(time+1)`,
 * which is fast off the mark and eases into the follow-through — so the blade
 * is quickest exactly where the hit lands.
 *
 * `hitIndex` mirrors alternate swings, so a chain reads as left, right, left
 * rather than the same stroke repeated.
 *
 * Sign convention: positive `windup`/`sweep` are authored as "raised" and
 * "sweeping downward", which is how you would describe the move out loud. Screen
 * space has y pointing down, so the result is negated on the way out — a raised
 * blade is a negative rotation.
 */
export function swingArcAngle(arc: SwingArc, t: number, hitIndex: number): number {
  const k = clamp(t, 0, 1);
  const dir = arc.alternate && hitIndex % 2 === 1 ? -1 : 1;
  const wf = clamp(arc.windupFrac, 0.05, 0.95);
  const motion = arc.motion ?? 'swing';
  /** Progress through the strike, 0 at the top of the windup, 1 at the end. */
  const s = k <= wf ? 0 : (k - wf) / (1 - wf);

  let deg: number;
  switch (motion) {
    case 'swipe':
      // A claw tears rather than cuts: almost no wind-up, then a violent,
      // front-loaded rake that is fastest at the start and drags to a halt.
      // The opposite curve to a sword, which is slow to load and fastest at
      // the moment of contact.
      deg =
        k <= wf
          ? arc.windup * Math.pow(k / wf, 0.55)
          : arc.windup - arc.sweep * Math.pow(s, 0.62);
      break;

    case 'stab': {
      // Knifework, not swordplay. The arm barely rotates — the extension does
      // the killing — but **each hit is angled at a different part of the
      // target**, so a chain reads as someone picking separate spots rather
      // than repeating one stroke. That variety is the whole character.
      const spot = STAB_SPOTS[hitIndex % STAB_SPOTS.length] * arc.sweep;
      const settle = k <= wf ? k / wf : 1;
      deg = spot * settle + (k <= wf ? arc.windup * (1 - k / wf) : 0);
      break;
    }

    case 'reap': {
      // A scythe accelerates through its arc and finishes closer to the wielder
      // than it started; the pull itself is in `swingReach`.
      //
      // **The strike is a burst, not a sweep.** Measured off the supplied
      // great-sword reference: the wind-up is 19 % of the action and the strike
      // itself lasts three frames of a hundred and seven, covering 89 degrees at
      // a peak of 50 deg/frame. Spreading the sweep evenly across the whole
      // post-windup — which squaring `s` did — reads as a heavy thing being
      // pushed rather than swung. `s * 2.3` front-loads it so the arc is spent
      // in the first ~43 % and the rest is follow-through.
      const burst = Math.min(1.0, s * 2.3);
      deg = k <= wf
        ? arc.windup * Math.pow(k / wf, 0.8)
        : arc.windup - arc.sweep * (1 - Math.pow(1 - burst, 2.4));
      break;
    }

    case 'sweep': {
      // Smoothstep both ends: a polearm is heavy at the grip and travels a wide
      // arc at near-constant speed once moving. Reads as momentum rather than
      // as a wrist flick.
      const e = s * s * (3 - 2 * s);
      deg = k <= wf ? arc.windup * (k / wf) : arc.windup - arc.sweep * e;
      break;
    }

    default:
      // swing / thrust / bash / piston keep the original curve exactly.
      if (k <= wf) {
        const w = k / wf;
        deg = arc.windup * (1 - (1 - w) * (1 - w));
      } else {
        deg = arc.windup - arc.sweep * (1 - Math.pow(1 - s, 2.4));
      }
      break;
  }
  return -deg * DEG * dir;
}

/**
 * Forward extension at normalised swing progress `t`, in logical pixels.
 *
 * Companion to `swingArcAngle`. The arc rotates the arm; this throws it along
 * the aim, which is what separates a stab from a slash. Each motion has a
 * distinctly different curve because each weapon is used differently:
 *
 * - `thrust` draws back, then stabs out and decelerates into the hit.
 * - `bash` shoves and returns within the swing — a shield does not stay extended.
 * - `piston` holds still while cocked, then fires almost instantaneously. The
 *   exponent is deliberately brutal: a pile driver has no follow-through.
 *
 * Returns 0 for `swing`, so existing blades are untouched.
 */
export function swingReach(arc: SwingArc, t: number, _hitIndex: number): number {
  const motion = arc.motion ?? 'swing';
  const R = arc.reach ?? 0;
  if (motion === 'swing' || R === 0) return 0;

  const k = clamp(t, 0, 1);
  const wf = clamp(arc.windupFrac, 0.05, 0.95);

  if (motion === 'piston') {
    // Cocked and motionless, then a single violent stroke.
    if (k <= wf) return 0;
    const s = (k - wf) / (1 - wf);
    return R * (1 - Math.pow(1 - s, 6));
  }

  if (motion === 'swipe') {
    // Claws reach at the start of the rake and stay out through it — the tear
    // happens across the target, not into it. Retracts only at the very end.
    if (k <= wf) return R * 0.30 * (k / wf);
    const s = (k - wf) / (1 - wf);
    return R * (0.30 + 0.70 * Math.sin(Math.PI * Math.min(1, s * 0.92)));
  }

  if (motion === 'stab') {
    // The whole attack. A hard, deep, near-instant extension that is already
    // withdrawing before the next hit begins, so six stabs read as six.
    if (k <= wf) return -R * 0.12 * (k / wf);
    const s = (k - wf) / (1 - wf);
    return R * Math.sin(Math.PI * Math.min(1, Math.pow(s, 0.7) * 1.05));
  }

  if (motion === 'reap') {
    // **Pulls in.** A scythe is thrown out wide and then drawn back through the
    // target; the blade finishes nearer the wielder than it began. Nothing else
    // on the roster ends a strike closer than it started.
    if (k <= wf) return R * (k / wf);
    const s = (k - wf) / (1 - wf);
    return R * (1 - 1.25 * s * s);
  }

  if (motion === 'sweep') {
    // A polearm is held at reach for the entire arc — it never extends, because
    // it was already out there. Nearly flat, which is the whole point.
    if (k <= wf) return R * 0.55 * (k / wf);
    return R * (0.55 + 0.45 * Math.sin(Math.PI * ((k - wf) / (1 - wf))));
  }

  // Both remaining motions pull back before committing.
  const drawBack = motion === 'bash' ? 0.15 : 0.22;
  if (k <= wf) return -R * drawBack * (k / wf);

  const s = (k - wf) / (1 - wf);
  if (motion === 'bash') {
    // **A ram, not a shove.** Drives forward fast, holds at full extension
    // while the slab is buried in the target, then recovers — a wall arriving,
    // rather than an arm poking. The plateau is what separates the two, and the
    // asymmetric return keeps it from reading as a bounce.
    if (s < 0.30) return R * (1 - Math.pow(1 - s / 0.30, 3));
    if (s < 0.62) return R;
    const back = (s - 0.62) / 0.38;
    return R * (1 - back * back);
  }
  // thrust: straight out, easing into the extension.
  return R * (1 - Math.pow(1 - s, 3));
}

/** Velocity retained per tick while an attack is committed — firing anchors you. */
function moveScaleFor(kind: ProjKind): number {
  switch (kind) {
    case ProjKind.Beam:
      return 0.24;
    case ProjKind.Heavy:
      return 0.55;
    case ProjKind.Missile:
      return 0.76;
    case ProjKind.Melee:
      return 1;
    default:
      return 0.9;
  }
}

export interface CombatantInit {
  id: number;
  team: Team;
  def: MechDef;
  x: number;
  y: number;
  facing: 1 | -1;
  /**
   * The match's generator.
   *
   * Shared with `MatchSim` on purpose: the desperate Shoot burst rolls for an
   * extra projectile, and that is *gameplay*, so it must come out of the same
   * seeded stream a replay reproduces. Music rolls are the opposite case and
   * take their own source — see `MusicBank.pickBattleCue`.
   */
  rng?: Rng;
}

export class Combatant implements FlightState {
  readonly id: number;
  readonly team: Team;
  readonly def: MechDef;
  /** Shared match RNG; see `CombatantInit.rng`. */
  private readonly rng: Rng;

  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  boost = 100;
  boostRegenTimer = 0;
  dashTicks = 0;
  dashCooldown = 0;
  dashDirX = 1;
  dashDirY = 0;

  facing: 1 | -1 = 1;
  /** Chassis bank angle (radians), purely visual but simulated for determinism. */
  bank = 0;
  /** Weapon-mount aim angle (radians, world space). */
  aim = 0;
  /**
   * Arm/blade angle relative to the aim, in radians.
   *
   * Named `spin` historically, when melee just rotated the blade continuously.
   * It now carries an authored swing arc (see `MeleeProfile.arc`).
   */
  spin = 0;
  /**
   * True while an arm swing is playing, so the renderer carries the arm through
   * the arc. This is a separate flag rather than `attack?.kind === Melee`
   * because the lock-on sequence never sets `attack` — which is exactly why the
   * blade used to be dragged into the target instead of swung.
   */
  swinging = false;
  /**
   * Forward extension of the weapon arm in logical pixels, from `swingReach`.
   * Presentation only — the hit itself is driven by the attack's own range.
   */
  reach = 0;
  /**
   * Off-hand commitment to the shaft, 0..1. Presentation only — like `spin` and
   * `reach` it is read by `MechRenderer` and never by the simulation.
   */
  grip = 0;
  /** Weapon rotation within the grip; presentation only. */
  weaponSpin = 0;
  /** Chassis commitment to a swing, radians; presentation only. */
  lean = 0;
  /** Weapon travel across the aim, logical px; presentation only. */
  lift = 0;
  /**
   * Set by whichever melee path drove the arc this tick; folded into `swinging`
   * at the end of the step and cleared. Two fields because `updateVisualAngles`
   * runs last, so clearing the public flag there would blank it before the
   * renderer ever sees it.
   */
  private swingDriven = false;
  /** Smoothed idle hover bob phase. */
  bobPhase = 0;
  /**
   * Walk cycle phase in radians, advanced by distance covered on the ground so
   * the feet keep pace with the machine instead of scrubbing.
   */
  walkPhase = 0;
  /** Stride weight 0..1, eased so stopping settles rather than snapping. */
  stride = 0;

  /**
   * Airborne leg dangle: current swing angle per leg, `[near, far]`, in radians.
   *
   * **This machine flies, and the legs did not know that.** The walk cycle is
   * the only thing that ever moved them, and it is gated on `grounded && !flying`
   * — which measured **0.0 % of every fight**. So `stride` sat at 0 and the legs
   * resolved to a fixed ±`STANCE` splay for the entire match: two sprites,
   * welded, never moving relative to one another or to the chassis. A player
   * described them as "stuck together and just stationary", which is exactly
   * what the code says they were.
   *
   * They hang from the hip and lag the machine, so they trail when it
   * accelerates, stream under thrust and settle when it holds station. Each leg
   * is its own spring with its own stiffness, which is what stops them reading
   * as one piece: identical springs would return identical angles forever.
   *
   * Simulated rather than done in the renderer, for the same reason the bank and
   * the walk cycle are — a replay has to reproduce the pose.
   */
  readonly legSwing: number[] = [0, 0];
  /** Angular velocity of each leg, for the spring in `updateLegs`. */
  private readonly legVel: number[] = [0, 0];
  /** Idle sway phase, so a hovering mech is never perfectly still. */
  private legPhase = 0;

  /**
   * Active status affliction, mirroring the reference's `var(54)`.
   *
   * Ticked in `tickTimers`, i.e. before the hitstun early-return, so a burn
   * keeps burning while its victim is being combo'd.
   */
  readonly status = new StatusState();

  life: number;
  energy: number;
  barrier: number;
  sat = 0;

  satActive = false;
  satMode: SatMode = SatMode.Shield;
  satTicks = 0;
  /**
   * Training only: the burst never drains and the meter is always charged.
   *
   * Off by default and set from `BattleScene` under `mode === 'training'`, so
   * the ordinary step is byte-for-byte what it was and `match.test.ts`'s
   * bit-identical replay is unaffected. Named for `energyFree` / `boostFree`,
   * which express the same "this resource is not being charged for" idea.
   */
  satFree = false;
  /** True when this burst opened at or below `DESPERATION_LIFE`. */
  satDesperate = false;
  /** Ticks of helplessness left after a burst ended. See SAT_BURNOUT_TICKS. */
  satBurnout = 0;

  /**
   * Sniper stance: ticks left, and ticks until it may be engaged again.
   *
   * Only ever non-zero on a chassis that declares `MechDef.sniper`. See
   * `SniperModeDef` for what the stance trades away, and D107 for why it is a
   * mode rather than another weapon.
   */
  sniperTicks = 0;
  sniperCooldown = 0;

  /**
   * LAST STAND: ticks of reprieve left, and whether it has been spent.
   *
   * `lastStandUsed` is deliberately never cleared inside a match — see
   * `MechDef.lastStand`. It is once, and the whole weight of the moment is that
   * it is once.
   */
  lastStandTicks = 0;
  lastStandUsed = false;

  /**
   * OVERDRIVE: ticks of the all-modes window left, whether it has been spent,
   * and whether the machine is living in the wreckage afterwards.
   *
   * `overdriveSpent` is the permanent half and never clears — thrusters and both
   * guns are *destroyed*, not disabled, and the distinction is the whole point
   * of the moment. See `MechDef.overdrive`.
   */
  overdriveTicks = 0;
  overdriveUsed = false;
  overdriveSpent = false;

  /**
   * Ticks each weapon is offline for, indexed by `WeaponSlot`.
   *
   * A fixed three-slot array rather than three fields so the HUD, the AI and the
   * enforcement can all loop over it and none of them can forget a weapon.
   */
  readonly weaponLock: number[] = [0, 0, 0];
  /**
   * How charged the meter was when this burst opened, 0..1.
   *
   * Every saturation multiplier is scaled toward 1 by this, so a half-charged
   * burst is genuinely half a burst rather than a full one that ends sooner.
   */
  satPower = 1;
  /** True when this burst was opened early, and will therefore overheat. */
  satPartial = false;

  act: ActState = ActState.Free;
  attack: AttackDef | null = null;
  attackTick = 0;
  /** Set once the current attack has spawned its hit. */
  attackFired = false;

  /**
   * Second attack slot, used only by Shoot saturation's twin fire.
   *
   * A separate slot rather than a general list of concurrent attacks: only one
   * mode ever produces two at once, only ranged attacks go in here, and it owns
   * none of the mech's movement or pose. Everything that reads `attack` — the
   * renderer, the flight anchor, the AI, the lunge — keeps seeing exactly one
   * attack and needs no changes.
   */
  coAttack: AttackDef | null = null;
  private coTick = 0;
  private coFired = false;

  meleeCount = 0;
  meleeHitConfirmed = false;
  meleeChainQueued = false;
  /** Ticks until melee is available again. Blocks endless sword pressure. */
  meleeLockout = 0;

  /**
   * Active lock-on melee sequence, or null.
   *
   * One press commits the whole sequence: close on the target, then run `hits`
   * swings while repositioning around it. Modelled on the working Iron Babel
   * build's `meleeLock` rather than our old manually re-pressed chain.
   */
  meleeLock: {
    phase: 'close' | 'swing' | 'gap';
    timer: number;
    hitIndex: number;
    hitTimer: number;
    hitDone: boolean;
    life: number;
  } | null = null;

  /** Ticks the beam blade stays lit, so it persists across the swing gaps. */
  bladeTimer = 0;
  /** Set for one tick when a sequence opens, for the move-name banner. */
  announced: string | null = null;
  /** Ticks left in which a new melee chain may be started from recovery. */
  meleeChainGrace = 0;

  hitstop = 0;
  hitstun = 0;
  /**
   * Ticks left in which a barrier burst will repel an incoming melee opener.
   *
   * Separate from `invuln` because they mean different things: `invuln` is also
   * granted by simply being hit, and a hit-invulnerability window must not turn
   * every trade into a parry. Only a deliberate burst opens this one.
   */
  repelTicks = 0;
  /** Debounce on the barrier lock-out refusal. See BARRIER_DENIED_COOLDOWN. */
  barrierDeniedCooldown = 0;
  /**
   * Melee hits taken since this machine last had control.
   *
   * Gates the repel to the *opening* strike of a sequence: once a sword is
   * already landing on you, bursting is an escape, not a parry. Reset the moment
   * hitstun ends, which is the same moment the combo counter resets.
   */
  meleeHitsTaken = 0;
  /**
   * Ticks this machine remains painted by an enemy designator drone.
   *
   * A painted mech is one whose opponent's shots track it. Held on the *victim*
   * rather than on the painter, so a shot only has to ask the thing it is aimed
   * at whether it is lit up.
   */
  paintedTicks = 0;
  invuln = 0;
  guarding = false;
  guardBreakStun = 0;
  barrierRegenTimer = 0;
  barrierActiveTicks = 0;

  subCharges: number;
  subRecharge = 0;

  /**
   * Opposing mechs are always locked on to each other.
   *
   * This was a toggle on its own button. Free aim sounded like flexibility and
   * played as a way to accidentally disable your own tracking mid-fight; the
   * field stays so the aiming code reads the same, but nothing turns it off.
   */
  readonly lockEnabled = true;
  /**
   * Which of the two enemy targets the mounts hold.
   *
   * **This replaces "whichever is nearer".** The escort is permanently deployed,
   * so under the old rule it took the lock every time it drifted 90 px forward
   * of its pilot — which in play meant the drone repeatedly dragged the guns off
   * the pilot at the exact moment the pilot was worth shooting, and neither side
   * had any say in it. Distance is a bad proxy for what someone wants to kill.
   *
   * `mech` is the default and the fallback: a preference for a drone that is
   * gone, stowed or never existed resolves to the pilot rather than to nothing.
   */
  lockPref: 'mech' | 'drone' = 'mech';
  /**
   * FlyingMode. The reference kept this as `var(20)` with a player toggle and an
   * automatic switch-on during a Level 2 shot. Default on: this is an aerial
   * fighter first, and the floor is a place you choose to visit.
   */
  flying = true;
  /** True while resting on the arena floor. */
  grounded = false;
  /** Thruster intensity 0..1, for the renderer. */
  thrust = 0;
  /** Set for one tick when a shot is fired, for muzzle flashes. */
  firedThisTick: ProjKind | null = null;
  /** Set by stepMotion when a dash begins, consumed by step() to emit an event. */
  private dashStartedThisTick = false;
  private landedThisTick = false;
  /**
   * A takeoff owed to the event stream, set by the boost kick out of a jump.
   *
   * Deferred rather than pushed at the point of decision because `stepMotion`
   * has no `events` array — every other takeoff is raised in `tryStartAction`,
   * which does.
   */
  private pendingTakeoff = false;
  /** Arena floor for this combatant; set by MatchSim. */
  groundY = Infinity;

  readonly cmd = new CommandBuffer();

  /**
   * The drone that carries this machine's sub-weapon.
   *
   * Owned here so it is created and discarded with its machine, but stepped by
   * `MatchSim` after both chassis have moved — keeping it out of this class's
   * branching step() is deliberate, because an early return in a hitstun or
   * attack branch is exactly how the melee lock-on once stopped updating.
   */
  readonly supporter: Supporter;

  constructor(init: CombatantInit) {
    this.id = init.id;
    this.team = init.team;
    this.def = init.def;
    // Falls back to its own generator so a Combatant built in isolation (tests,
    // tools) still works; MatchSim always passes the match's.
    this.rng = init.rng ?? new Rng(0x5eed0001 + init.id);
    this.x = init.x;
    this.y = init.y;
    this.facing = init.facing;
    this.aim = init.facing > 0 ? 0 : Math.PI;
    this.life = init.def.gauges.maxLife;
    this.energy = init.def.gauges.maxEnergy;
    this.barrier = init.def.gauges.maxBarrier;
    this.boost = init.def.flight.maxBoost;
    this.subCharges = init.def.subCharges;
    this.supporter = new Supporter(init.def.supporter, this, init.def.id, this.rng);
  }

  /**
   * Orders the drone to fire `a`, spending a sub charge.
   *
   * Returns false — and emits `assistDenied` — when the charge is missing or the
   * drone is still busy, so the press is always answered with feedback instead
   * of being silently swallowed.
   */
  private orderAssist(a: AttackDef, events: SimEvent[]): boolean {
    const cost = a.subCost ?? 1;
    const s = this.supporter;
    if (this.subCharges < cost || !s.ready) {
      events.push({ t: 'assistDenied', x: s.x, y: s.y, ownerId: this.id });
      return false;
    }
    this.subCharges -= cost;
    s.order(a);
    events.push({ t: 'assist', x: s.x, y: s.y, angle: s.aim, ownerId: this.id });
    return true;
  }

  /**
   * The drone asking for a volley of its own accord.
   *
   * Hands over the sub attack, having spent its charge, or refuses. Deliberately
   * silent on refusal: an idle drone asks every tick, and a denial cue per tick
   * would be unbearable. "Out of charges" is already legible from the pip row.
   */
  requestVolley(): AttackDef | null {
    const a = this.def.sub;
    const cost = a.subCost ?? 1;
    if (this.subCharges < cost) return null;
    this.subCharges -= cost;
    return a;
  }

  /**
   * The drone's passive, or null when it is not earning it.
   *
   * One accessor rather than eight scattered checks: everything that reads a
   * passive goes through here, so "launching, recalling, stowed, destroyed or
   * dead means no benefit" is stated once and cannot drift apart.
   */
  get dronePassive(): DronePassiveDef | null {
    return this.supporter.onStation && this.alive ? this.def.supporter.passive : null;
  }

  /**
   * Fires one of this machine's attacks from the drone's muzzle.
   *
   * Routed through the same `fire()` the chassis uses, so the shot inherits
   * saturation scaling and emits the same events; only the origin differs.
   */
  fireFromSupporter(
    a: AttackDef,
    x: number,
    y: number,
    angle: number,
    spawns: ProjectileSpawn[],
    events: SimEvent[],
  ): void {
    this.fire(a, null, spawns, events, { x, y, angle });
  }

  get alive(): boolean {
    return this.life > 0;
  }

  get invulnerable(): boolean {
    return this.invuln > 0;
  }

  /** Dashing is a commitment: the reference made SpeedUp unguardable. */
  get canGuard(): boolean {
    return this.dashTicks <= 0 && this.act !== ActState.Hitstun && this.guardBreakStun <= 0;
  }

  get phase(): Phase {
    const a = this.attack;
    if (!a) return Phase.Recovery;
    if (this.attackTick < a.startup) return Phase.Startup;
    if (this.attackTick < a.startup + a.active) return Phase.Active;
    return Phase.Recovery;
  }

  /** Saturation multipliers, applied where the reference applied them. */
  get satShootScale(): number {
    return this.shootActive ? 1 + 0.5 * this.satPower : 1;
  }
  /**
   * Base movement under Speed saturation: free flight and walking.
   *
   * Deliberately modest. The mode's headline is the thrusters — `satThrustScale`
   * — and lifting ordinary flight by the same 1.75 made the mech feel weightless
   * and impossible to place, which is the opposite of what a speed burst should
   * buy you.
   */
  get satSpeedScale(): number {
    return this.speedActive ? 1 + 0.25 * this.satPower : 1;
  }
  /** Boost and dash under Speed saturation. This is the part that should read. */
  get satThrustScale(): number {
    return this.speedActive ? 1 + 0.85 * this.satPower : 1;
  }
  get satProjSpeedScale(): number {
    if (!this.shootActive) return 1;
    // A desperate Shoot burst stacks on top of the ordinary one, so the shots
    // are not merely faster than normal — they are faster than a Shoot burst,
    // which is the comparison a player actually has in their head.
    return (1 + 0.6 * this.satPower) * (this.satDesperate ? DESPERATE_PROJ_SPEED : 1);
  }
  /** Swings in a button-chain. Speed saturation adds three, as it does to a lock-on. */
  get maxMeleeHits(): number {
    return 3 + (this.speedActive ? this.bonusHits : 0);
  }
  /**
   * Swings in a lock-on sequence. Per-chassis, so CIRRUS's eight becomes eleven
   * and OBELISK's two becomes five — the bonus is flat, but what it is added to
   * is the mech's own identity.
   */
  get meleeLockHits(): number {
    return this.def.meleeLock.hits + (this.speedActive ? this.bonusHits : 0);
  }

  /** Extra melee swings this burst is worth, scaled by how charged it was. */
  private get bonusHits(): number {
    return Math.max(1, Math.round(SAT_SPEED_BONUS_HITS * this.satPower));
  }

  /**
   * Cannot act at all this tick.
   *
   * The three states a pilot genuinely cannot escape: hitstun, the burnout at
   * the end of a saturation burst, and a broken guard. Read by the supporter,
   * which is the only thing still able to act on their behalf.
   */
  get helpless(): boolean {
    return this.act === ActState.Hitstun || this.satBurnout > 0 || this.guardBreakStun > 0;
  }

  /**
   * Cruising top speed. Read by the supporter so a `decoy` projection can fly as
   * well as the chassis it is imitating — see `SupporterOwner.topSpeed`.
   */
  get topSpeed(): number {
    return this.def.flight.maxSpeed;
  }

  /** Is this weapon knocked offline right now? */
  weaponDisabled(slot: WeaponSlot): boolean {
    /**
     * OVERDRIVE's burnout destroys both guns for the rest of the match.
     *
     * Routed through the same predicate a temporary disarm uses, so every place
     * that already refuses to fire an offline weapon — the input path, the
     * rival's weapon choice, the HUD — handles this for free and none of them
     * needs to learn a second concept.
     */
    if (this.overdriveSpent && (slot === WeaponSlot.Main || slot === WeaponSlot.Heavy)) {
      return true;
    }
    return this.weaponLock[slot] > 0;
  }

  /** True if anything is offline — cheap enough for the HUD to ask every frame. */
  get anyWeaponDisabled(): boolean {
    return this.weaponLock[0] > 0 || this.weaponLock[1] > 0 || this.weaponLock[2] > 0;
  }

  /**
   * Knocks one weapon offline, chosen at random from the three.
   *
   * Refreshes rather than stacks: a second hit on an already-dead gun resets its
   * clock instead of queueing a second five seconds, so the effect has a ceiling
   * however many rounds land.
   *
   * Cancels the attack in progress if it *is* that weapon, because a gun that
   * goes offline mid-swing and still fires is not offline.
   */
  disarm(rng: Rng, events: SimEvent[]): WeaponSlot {
    const slot = Math.floor(rng.next() * WEAPON_SLOT_COUNT) as WeaponSlot;
    this.weaponLock[slot] = Math.max(this.weaponLock[slot], DISARM_TICKS);
    const live = this.attack;
    const isMelee = live?.kind === ProjKind.Melee;
    if (
      live &&
      ((slot === WeaponSlot.Melee && isMelee) ||
        (slot === WeaponSlot.Main && live.id === 'main') ||
        (slot === WeaponSlot.Heavy && live.id === 'heavy'))
    ) {
      this.attack = null;
    }
    if (slot === WeaponSlot.Melee) {
      this.meleeLock = null;
      this.meleeCount = 0;
      this.meleeChainQueued = false;
    }
    events.push({ t: 'disarm', x: this.x, y: this.y, victimId: this.id, slot });
    return slot;
  }

  /** True while the mech is refusing to die. */
  get lastStandActive(): boolean {
    return this.lastStandTicks > 0;
  }

  /**
   * Called by `MatchSim` after damage has been resolved and before the match is
   * asked whether anyone died.
   *
   * Placed there rather than inside `takeHit` on purpose: hull is taken off in a
   * dozen places — gunfire, melee, mines, burning ground, the arc tether, status
   * chip — and a check that lived in one of them would be a passive that worked
   * against some damage and not others. One gate, after everything, catches all
   * of it and cannot be forgotten by the next weapon.
   *
   * Returns `'triggered'` on the tick it opens and `'ended'` on the tick the
   * clock runs out, so the caller can announce both.
   */
  /**
   * OVERDRIVE's clock, driven from `MatchSim` beside LAST STAND's.
   *
   * Returns `'opened'` on the tick the reactor dumps and `'spent'` on the tick it
   * burns out, so the caller can stage both moments.
   */
  stepOverdrive(): 'opened' | 'spent' | null {
    const def = this.def.overdrive;
    if (!def) return null;

    if (this.overdriveTicks > 0) {
      this.overdriveTicks--;
      if (this.overdriveTicks > 0) return null;
      /**
       * Burnout. The thrusters and both guns are **destroyed**, not disabled:
       * nothing in the match brings them back, and `overdriveSpent` is never
       * cleared. What is left is a sword and whatever the pilot has left.
       */
      this.overdriveSpent = true;
      return 'spent';
    }

    if (this.overdriveUsed || !this.alive) return null;
    if (this.life > this.def.gauges.maxLife * def.threshold) return null;
    this.overdriveUsed = true;
    this.overdriveTicks = def.ticks;
    /**
     * The reactor dump interrupts whatever burst the pilot was running — there
     * is no meaningful "on top of all three modes".
     *
     * **`satDesperate` must be cleared with it, and this was a bug.** OVERDRIVE
     * is not a desperation burst and shares none of that mechanic, but
     * `desperateSpeed` is `speedActive && satDesperate` — and OVERDRIVE turns
     * `speedActive` on. Desperation opens below a third of a life bar and
     * OVERDRIVE at a quarter, so a pilot is *frequently* already inside a
     * desperate burst when it fires: leaving the flag set handed her
     * true-damage melee and arena-crossing reach for the whole window, from a
     * mechanic this passive is not supposed to touch.
     */
    this.satActive = false;
    this.satTicks = 0;
    this.satDesperate = false;
    return 'opened';
  }

  /**
   * Damage multiplier on this machine's melee, from OVERDRIVE's burnout.
   *
   * The whole kit is gone and the sword is what it is spent on, so the number
   * lives on the melee path only and applies for the rest of the match.
   */
  get meleeScale(): number {
    return this.overdriveSpent ? (this.def.overdrive?.meleeMul ?? 1) : 1;
  }

  stepLastStand(): 'triggered' | 'ended' | null {
    // The clock and the clamp, together, because they must both run at a moment
    // the machine is nominally dead.
    //
    // **This cannot live in `step`.** `Combatant.step` early-returns when
    // `life <= 0` and coasts the wreck, so a clamp placed in the ordinary gauge
    // update is unreachable at exactly the life total it exists to prevent — the
    // reprieve would trigger once and then fail to stop the very next hit. A
    // test caught it; nothing about reading the code would have.
    if (this.lastStandTicks > 0) {
      this.lastStandTicks--;
      this.life = Math.max(this.life, 1);
      return this.lastStandTicks === 0 ? 'ended' : null;
    }

    const def = this.def.lastStand;
    if (!def || this.lastStandUsed || this.life > 0) return null;
    this.lastStandUsed = true;
    this.lastStandTicks = def.ticks;
    /**
     * **It stops the death and nothing else.**
     *
     * The first cut also cleared `hitstun`, dropped the attack and the melee
     * lock, and forced `ActState.Free` — which meant the killing blow was not
     * merely survived but *erased*: the hit that should have staggered Naia Vesk
     * left her standing and immediately able to act, which is a free full-screen
     * reset attached to the strongest defensive passive in the game.
     *
     * Now the hit resolves exactly as it would on any other machine — hitstun,
     * knockback, the cancelled attack, the broken chain, every status it carried
     * — and the *only* thing that changes is that `life` stops at 1 instead of
     * reaching 0. Everything that hinders a mech still hinders this one; it just
     * does not die while the clock runs.
     */
    this.life = 1;
    return 'triggered';
  }

  /** True while the sniper stance is up. */
  get sniperActive(): boolean {
    return this.sniperTicks > 0;
  }

  /**
   * Movement multiplier from the stance. 1 when it is down, so this is inert for
   * every chassis that has no `sniper` block.
   */
  get sniperSpeedScale(): number {
    return this.sniperActive ? (this.def.sniper?.speedScale ?? 1) : 1;
  }
  /**
   * The stance's grip on the **dash**, which a chassis may loosen separately.
   *
   * See `SniperModeDef.dashSpeedScale`. Falls back to `speedScale`, so a stance
   * that says nothing behaves exactly as stances did before the field existed.
   */
  get sniperDashScale(): number {
    if (!this.sniperActive) return 1;
    const s = this.def.sniper;
    return s?.dashSpeedScale ?? s?.speedScale ?? 1;
  }

  /** True while the all-modes window is running. */
  get overdriveActive(): boolean {
    return this.overdriveTicks > 0;
  }

  /**
   * The three saturation modes, and the one place OVERDRIVE plugs into.
   *
   * Making these three the hub is what lets "all three modes at once" be four
   * words of code rather than a parallel implementation: `barrierFree`,
   * `energyFree`, `boostFree`, every scale, the AI's reads and the renderer all
   * derive from these, so turning them all on turns *everything* on exactly as
   * the real modes would.
   */
  get shieldActive(): boolean {
    return this.overdriveActive || (this.satActive && this.satMode === SatMode.Shield);
  }
  get shootActive(): boolean {
    return this.overdriveActive || (this.satActive && this.satMode === SatMode.Shoot);
  }
  get speedActive(): boolean {
    return this.overdriveActive || (this.satActive && this.satMode === SatMode.Speed);
  }

  // ---- desperation ---------------------------------------------------------

  /**
   * A burst opened from the brink runs in its desperation form.
   *
   * Latched at activation rather than read live, so the buff belongs to the
   * *decision* to spend the meter while losing. Healing back over the threshold
   * mid-burst is impossible today, but tying it to a live check would also mean a
   * pilot who dipped under 33 % for one tick got a comeback mechanic by accident.
   *
   * This is deliberately a losing-player's tool. The meter charges off damage
   * taken, so the pilot most likely to have a full bar is the one being beaten —
   * and until now that bar bought them the same burst it bought the winner.
   */
  get desperateShield(): boolean {
    return this.shieldActive && this.satDesperate;
  }
  get desperateShoot(): boolean {
    return this.shootActive && this.satDesperate;
  }
  get desperateSpeed(): boolean {
    return this.speedActive && this.satDesperate;
  }

  /**
   * True while a desperate Speed lock is still crossing the gap.
   *
   * The window this describes is the whole reason the mode is usable at range:
   * the mech is committed, travelling in a straight line and unable to act, so
   * it gets a guard it does not pay for. Ends the moment the first swing starts.
   */
  get desperateClosing(): boolean {
    return this.desperateSpeed && this.meleeLock?.phase === 'close';
  }

  /**
   * Melee reach, including the Speed burst's desperation extension.
   *
   * "Across the screen" is meant literally: `DESPERATE_MELEE_RANGE` puts the
   * lock-on past the width of the viewport, so a cornered pilot can answer a
   * sniper who has been holding the far side of the arena.
   */
  get effectiveMeleeRange(): number {
    return this.desperateSpeed ? this.def.meleeRange * DESPERATE_MELEE_RANGE : this.def.meleeRange;
  }

  /**
   * "Does not overheat" — each mode makes its own resource free for the burst.
   *
   * Shield stops the barrier gauge falling at all, Shoot stops weapons costing
   * energy, Speed stops thrust costing boost. One rule per mode, expressed once
   * here so the three read as the same promise rather than three special cases
   * scattered through the step.
   *
   * Speed borrows the barrier rule for one window only — `desperateClosing`, the
   * dash onto a target from across the arena. The guard raised there is part of
   * the attack rather than a defensive choice, so charging the gauge for it would
   * mean the move costs barrier that the pilot never elected to spend.
   */
  get barrierFree(): boolean {
    return this.shieldActive || this.desperateClosing;
  }
  get energyFree(): boolean {
    return this.shootActive;
  }
  get boostFree(): boolean {
    return this.speedActive;
  }

  /**
   * Multiplier on damage this machine deals, from its drone's passive.
   *
   * Kept separate from `satShootScale` so the two stack rather than one
   * silently replacing the other, and so a reader can see at a glance which
   * effect a number came from.
   */
  get outgoingScale(): number {
    return this.dronePassive?.damageMul ?? 1;
  }

  /**
   * Multiplier on damage this machine takes: its chassis defence, plus its
   * drone's passive. The grounded bracing bonus is applied at the hit itself,
   * since chip damage does not get it.
   *
   * Shield saturation is deliberately *not* folded in here. It was, briefly, as
   * a single 0.1 — but the four categories it has to cover want four different
   * end results, and this multiplier cannot tell them apart. `SHIELD_TAKEN` does
   * it at the point each one resolves instead.
   */
  get incomingScale(): number {
    return this.def.defence.mul * (this.dronePassive?.defenceMul ?? 1);
  }

  /**
   * How much of an incoming hit's knockback actually moves this machine.
   *
   * **Deliberately slight.** A braced frame is harder to shove, not immovable —
   * knockback is how an exchange creates space, and a mech that could not be
   * moved at all while standing would make the deck a place opponents cannot
   * fight you, rather than one you have chosen to fight from. 15 % off is
   * enough to feel planted and nowhere near enough to be a wall.
   */
  get knockbackScale(): number {
    return this.grounded ? GROUNDED_KNOCKBACK : 1;
  }

  /**
   * Fraction of a hit that gets through a Shield burst, by category.
   *
   * Melee is tested before pierce because a melee attack is *also* marked
   * `Pierce` — it has to be, so a barrier bubble cannot erase a sword — and
   * without the ordering every swing would be scaled as a lance.
   */
  private shieldTaken(isMelee: boolean, piercing: boolean): number {
    if (isMelee) return SHIELD_TAKEN.melee;
    return piercing ? SHIELD_TAKEN.pierce : SHIELD_TAKEN.gunfire;
  }

  /** World-space muzzle position for an attack. */
  muzzle(a: AttackDef): { x: number; y: number } {
    const c = Math.cos(this.aim);
    const s = Math.sin(this.aim);
    const lat = a.muzzleLateral * this.facing;
    return {
      x: this.x + c * a.muzzleForward - s * lat,
      y: this.y + s * a.muzzleForward + c * lat,
    };
  }

  // ---------------------------------------------------------------- stepping

  /**
   * Advances one tick.
   *
   * `target` may be null (training with no opponent). `out` collects spawns and
   * events so the caller owns all allocation-heavy work.
   */
  step(
    input: InputFrame,
    target: Combatant | null,
    arenaW: number,
    arenaH: number,
    spawns: ProjectileSpawn[],
    events: SimEvent[],
  ): void {
    this.firedThisTick = null;

    /**
     * Target switch, handled before anything can swallow it.
     *
     * It belongs here rather than in `tryStartAction`, which only runs when the
     * machine is free to *act*: no attack in progress, not stunned, not
     * mid-saturation. Switching target commits nothing, costs nothing and starts
     * nothing — it is a decision about where to point, and being unable to make
     * it while an escort is beating on you is exactly backwards. It was in the
     * action block first, and a test caught it, because the drone under test was
     * shooting the machine trying to press the button.
     *
     * Above the hitstop return too: hitstop is a presentation freeze on impact,
     * and queuing a decision through one is fine.
     */
    if (isPressed(input, Btn.TargetCycle) && this.alive) {
      const was = this.lockPref;
      this.cycleLockTarget(target);
      if (this.lockPref !== was) {
        events.push({ t: 'targetCycle', id: this.id, onDrone: this.lockPref === 'drone' });
      }
    }

    // Hitstop freezes everything except the countdown itself.
    if (this.hitstop > 0) {
      this.hitstop--;
      return;
    }

    if (!this.alive) {
      this.act = ActState.Dead;
      this.vx *= 0.9;
      this.vy *= 0.9;
      this.x += this.vx;
      this.y += this.vy;
      // A wreck still coasts, and it still has to stay in the arena: this branch
      // used to return without clamping, so a mech killed while carrying speed
      // drifted through the wall and kept going for the whole KO freeze.
      clampToArena(this, this.def.rig.hurtRadius, arenaW, arenaH, undefined, this.groundY);
      return;
    }

    this.tickTimers(target);
    this.tickSaturation(events);
    this.cmd.push(input, this.facing);

    // The twin shot advances before any of the branches below, so a hit taken
    // mid-volley cannot leave it running and nothing can orphan it behind an
    // early return. `takeHit` cancels it outright, which is the intended answer.
    this.stepCoAttack(spawns, events);

    if (this.hitstun > 0 || this.guardBreakStun > 0 || this.satBurnout > 0) {
      // Taking a hit drops an in-progress lock-on sequence. This has to happen
      // here: the stun branch returns before the melee step ever runs.
      if (this.meleeLock) this.endMeleeLock(false);
      this.stepStunned(input, events);
      clampToArena(this, this.def.rig.hurtRadius, arenaW, arenaH, undefined, this.groundY);
      return;
    }

    // Saturation activation is checked here, ahead of everything that can own
    // the mech for a frame — a burst must be able to interrupt an attack that is
    // already running. Opening one consumes the tick's input.
    const activated = this.tryActivateSaturation(input, events);

    // A lock-on melee sequence owns the mech until it finishes or breaks.
    if (this.meleeLock) {
      if (this.stepMeleeLock(target, spawns, events)) {
        this.x += this.vx;
        this.y += this.vy;
        clampToArena(this, this.def.rig.hurtRadius, arenaW, arenaH, undefined, this.groundY);
        this.updateVisualAngles(input);
        return;
      }
    }

    this.updateFacingAndAim(input, target);

    if (this.attack) {
      this.stepAttack(input, target, spawns, events);
    } else if (!activated) {
      this.act = ActState.Free;
      this.tryStartAction(input, target, events);
      // The tick an attack starts on is frame 0 of its startup, so advance it
      // here too. Without this every attack would run one tick late.
      if (this.attack) this.stepAttack(input, target, spawns, events);
    }

    this.stepMotion(input);
    if (this.pendingTakeoff) {
      this.pendingTakeoff = false;
      events.push({ t: 'takeoff', x: this.x, y: this.y, id: this.id });
    }
    if (this.landedThisTick) {
      this.landedThisTick = false;
      events.push({ t: 'land', x: this.x, y: this.y, id: this.id });
    }
    if (this.dashStartedThisTick) {
      this.dashStartedThisTick = false;
      events.push({
        t: 'dash',
        x: this.x,
        y: this.y,
        angle: Math.atan2(this.dashDirY, this.dashDirX),
        id: this.id,
      });
    }
    clampToArena(this, this.def.rig.hurtRadius, arenaW, arenaH, undefined, this.groundY);
    this.updateVisualAngles(input);
  }

  /**
   * `target` is read only for the one outward-facing drone passive (NULLTIDE's
   * jamming field). Passing it beats letting a drone reach across and mutate
   * another combatant: every gauge is still written in exactly one place.
   */
  private tickTimers(target: Combatant | null): void {
    const g = this.def.gauges;
    const passive = this.dronePassive;

    if (this.invuln > 0) this.invuln--;
    if (this.barrierDeniedCooldown > 0) this.barrierDeniedCooldown--;
    if (this.paintedTicks > 0) this.paintedTicks--;
    if (this.repelTicks > 0) this.repelTicks--;
    if (this.hitstun <= 0 && this.guardBreakStun <= 0) this.meleeHitsTaken = 0;
    if (this.meleeLockout > 0) this.meleeLockout--;
    if (this.bladeTimer > 0) this.bladeTimer--;
    if (this.barrierActiveTicks > 0) this.barrierActiveTicks--;
    if (this.meleeChainGrace > 0) {
      this.meleeChainGrace--;
      if (this.meleeChainGrace === 0) {
        this.meleeCount = 0;
        this.meleeHitConfirmed = false;
      }
    }

    // ---- status affliction ------------------------------------------------
    // Ticked here, ahead of the hitstun early-return, so a burn keeps burning
    // while its victim is being combo'd.
    const st = this.status.def;
    const chip = this.status.step();
    if (chip > 0) {
      // Chip goes through the same defence multiplier as everything else. A
      // Shield burst smothers it, same as it smothers gunfire — a burn is the
      // one damage source a guard could never do anything about.
      //
      // **A burn can land the killing blow.** It could not, until D121: this was
      // `Math.max(1, ...)`, so chip damage stopped dead at one hull point.
      //
      // The reason given was that *"being finished by a lingering burn seconds
      // after the shooter disengaged reads as a bug, not a loss"* — but a burn
      // lasts **120 ticks**, and `Status.apply` restarts that clock on every hit
      // that inflicts it. The worst case the clamp was defending against is
      // therefore dying **two seconds** after the last round landed, which is a
      // legible death and not a bug. The duration already solved the problem the
      // clamp was solving, and the clamp's real effect was elsewhere.
      //
      // Its real effect was on PYRE, whose blurb says it *"wins fights it has
      // already left"* and who carries fire on seven of nine weapons. Measured,
      // she left an opponent alive at exactly one hull in **20 of 168 fights** —
      // four times the roster's next worst — and pinned opponents at that floor
      // for 32 ticks a fight. She dropped the whole field low and confirmed
      // nothing. Lifting the clamp took her **38 % → 46 %** and moved the roster
      // spread by 0.001, because fire is the only damaging status anyone
      // actually carries: acid exists and no weapon on the roster applies it.
      const shieldChip = this.shieldActive ? SHIELD_TAKEN.chip : 1;
      this.life = Math.max(0, this.life - chip * this.incomingScale * shieldChip);
    }
    if (st?.energyDrain) this.energy = Math.max(0, this.energy - st.energyDrain);

    // Energy regen, boosted by Shoot saturation, suppressed by Shock, lifted by
    // a friendly reactor-link drone and halved by a hostile jamming one.
    const jam = target?.dronePassive?.enemyEnergyRegenMul ?? 1;
    const regen = st?.blocksEnergyRegen
      ? 0
      : g.energyRegen *
        (this.shootActive ? 2.2 : 1) *
        (passive?.energyRegenMul ?? 1) *
        // Planted reload. The deck already refilled the boost tank faster
        // (`groundedBoostRegen`), which was a reward for standing still that
        // could only be spent by leaving. Weapon energy is the one a planted
        // frame can actually use where it stands, and TERRAMOTH — which runs
        // `dry` 13 % at HARD, worst on the roster by 2.6x — is the machine the
        // ground game is authored around.
        (this.grounded ? GROUNDED_ENERGY_REGEN : 1) *
        jam;
    this.energy = Math.min(g.maxEnergy, this.energy + regen);

    // Shield saturation holds the guard up for the whole burst, whatever the
    // mech is doing — attacking, stunned, mid-dash. Set here rather than in
    // `tryStartAction` because that is not reached during hitstun or an attack,
    // and "remains activated" has to mean exactly that.
    if (this.shieldActive) this.guarding = true;

    // Barrier gauge regen after a delay.
    if (this.barrierRegenTimer > 0) {
      this.barrierRegenTimer--;
    } else if (this.barrier < g.maxBarrier) {
      this.barrier = Math.min(
        g.maxBarrier,
        this.barrier + g.barrierRegen * (passive?.barrierRegenMul ?? 1),
      );
    }

    // Sub-weapon charge economy.
    //
    // The reference zeroed its charge counter outright whenever the machine was
    // in an action state, so pressure denies the assist and disengaging restores
    // it. Here the counter merely stalls rather than resetting: losing a whole
    // 150-tick charge to a single vulcan shot punishes ordinary play far harder
    // than the reference did, where the counter refilled far faster.
    if (this.subCharges < this.def.subCharges) {
      if (!this.attack) this.subRecharge++;
      if (this.subRecharge >= this.def.subRechargeTicks) {
        this.subRecharge = 0;
        this.subCharges++;
      }
    }
  }

  private tickSaturation(events: SimEvent[]): void {
    const g = this.def.gauges;
    for (let i = 0; i < WEAPON_SLOT_COUNT; i++) {
      if (this.weaponLock[i] > 0) this.weaponLock[i]--;
    }

    // Sniper stance clock. Runs down whatever else is happening — the stance is
    // a commitment, so being hit or stunned does not pause it — and hands
    // straight over to the recharge when it expires.
    if (this.sniperTicks > 0) {
      this.sniperTicks--;
      if (this.sniperTicks === 0) this.endSniper(events);
    } else if (this.sniperCooldown > 0) {
      this.sniperCooldown--;
    }

    if (this.satActive && this.satFree) {
      // Training: hold the burst open. `satTicks` is left where it is rather
      // than topped up, so the mode ends the moment the switch goes off instead
      // of running on for a stale duration.
      this.sat = g.maxSaturation;
    } else if (this.satActive) {
      // Shield mode burns the meter faster, as the reference did for its
      // barrier-type concentration. It also now buys the most: a free permanent
      // guard on top of the projectile-erasing bubble, so it pays in duration.
      //
      // The rate is a chassis dial (`satShieldDrain`, default 2) rather than a
      // constant, so a barrier specialist can hold the mode its whole identity
      // is named after without paying the standing penalty. See D119.
      this.satTicks -= this.satMode === SatMode.Shield ? (g.satShieldDrain ?? 2) : 1;
      this.sat = Math.max(0, (this.satTicks / g.satDuration) * g.maxSaturation);
      if (this.satTicks <= 0) {
        this.satActive = false;
        this.satDesperate = false;
        this.sat = 0;
        this.burnOut(events);
      }
    } else if (this.satFree) {
      // Training: always ready, and never burnt out, so a burst can be opened
      // again the instant the last one is closed.
      this.sat = g.maxSaturation;
      this.satTicks = g.satDuration;
      this.satBurnout = 0;
    } else if (this.sat < g.maxSaturation) {
      const gain = g.satPassive * (this.dronePassive?.satGainMul ?? 1);
      this.sat = Math.min(g.maxSaturation, this.sat + gain);
    }
  }

  /**
   * The burst has run dry. The pilot is helpless for a moment.
   *
   * Drops everything in flight rather than letting an attack finish through the
   * stun: the machine has just lost the reactor output that was driving it, and
   * a swing that carried on regardless would read as the stun not applying.
   */
  private burnOut(events: SimEvent[]): void {
    const overheat = this.satPartial;
    this.satBurnout = overheat ? SAT_OVERHEAT_TICKS : SAT_BURNOUT_TICKS;
    this.act = ActState.Hitstun;
    this.attack = null;
    this.coAttack = null;
    this.guarding = false;
    if (this.meleeLock) this.endMeleeLock(false);

    if (overheat) {
      // The reactor was pushed before it was ready. Slight damage, and never
      // the killing blow — losing to your own overdrive rather than to your
      // opponent reads as the game cheating you.
      const cost = this.def.gauges.maxLife * SAT_OVERHEAT_LIFE_FRAC;
      this.life = Math.max(1, this.life - cost);
    }
    this.satPower = 1;
    this.satPartial = false;
    events.push({ t: 'satBurnout', x: this.x, y: this.y, id: this.id, overheat });
  }

  /**
   * Advances the Shoot-saturation twin shot.
   *
   * It carries the full authored startup so the second weapon does not simply
   * appear on the same frame as the first — a heavy fired alongside a vulcan
   * should still take a heavy's wind-up. It applies no recoil and drives no
   * movement; the primary attack owns all of that.
   */
  private stepCoAttack(spawns: ProjectileSpawn[], events: SimEvent[]): void {
    const a = this.coAttack;
    if (!a) return;
    this.coTick++;
    if (!this.coFired && this.coTick >= a.startup) {
      this.coFired = true;
      this.fire(a, null, spawns, events);
    }
    if (this.coTick >= ATTACK_TOTAL(a)) {
      this.coAttack = null;
      this.coTick = 0;
      this.coFired = false;
    }
  }

  /** Loads the twin slot. Refuses while it is still busy, which rate-limits it. */
  private beginCo(a: AttackDef): void {
    if (this.coAttack) return;
    this.coAttack = a;
    this.coTick = 0;
    this.coFired = false;
  }

  /**
   * Opens the sniper stance.
   *
   * Cancels whatever the chassis was doing, because the stance replaces the
   * whole weapon set and finishing a swing out of it would let a sniper carry a
   * melee commitment into a state that has no melee.
   */
  private beginSniper(events: SimEvent[]): void {
    const def = this.def.sniper;
    if (!def) return;
    this.sniperTicks = def.duration;
    this.sniperCooldown = 0;
    this.attack = null;
    this.coAttack = null;
    this.meleeCount = 0;
    this.meleeChainQueued = false;
    this.meleeLock = null;
    events.push({ t: 'sniper', x: this.x, y: this.y, id: this.id, on: true });
  }

  /**
   * Closes it, and starts the recharge.
   *
   * Reached three ways — the clock running out, the pilot switching it off, and
   * a `MatchSim` reset — and all three pay the same cooldown. Dropping the
   * stance early to escape must not be free, or the slow costs nothing.
   */
  private endSniper(events: SimEvent[]): void {
    if (!this.sniperActive && this.sniperTicks === 0 && this.sniperCooldown > 0) return;
    this.sniperTicks = 0;
    this.sniperCooldown = this.def.sniper?.cooldown ?? 0;
    events.push({ t: 'sniper', x: this.x, y: this.y, id: this.id, on: false });
  }

  private stepStunned(input: InputFrame, events: SimEvent[]): void {
    if (this.guardBreakStun > 0) this.guardBreakStun--;
    if (this.satBurnout > 0) this.satBurnout--;
    if (this.hitstun > 0) this.hitstun--;
    this.act = this.hitstun > 0 || this.satBurnout > 0 ? ActState.Hitstun : ActState.Free;

    // Barrier-cancel out of hitstun for double cost (reference penalty).
    //
    // Deliberately does NOT clear a saturation burnout. Every other stun in the
    // game has an escape, because every other stun is something an opponent did
    // to you. The burnout is the price of the burst you chose to spend, and an
    // escape hatch would refund it.
    if (
      this.satBurnout <= 0 &&
      !this.shieldActive &&
      isPressed(input, Btn.Barrier) &&
      this.barrier >= this.def.barrier.cost + this.def.barrier.cancelPenalty
    ) {
      this.startBarrier(true, events);
      this.hitstun = 0;
      this.guardBreakStun = 0;
    }

    this.vx *= 0.94;
    this.vy *= 0.94;
    this.x += this.vx;
    this.y += this.vy;
    this.spin += 9 * DEG;
  }

  private updateFacingAndAim(input: InputFrame, target: Combatant | null): void {
    // Auto-turn toward the opponent with a deadzone, like the reference's Turn.
    if (target && target.alive) {
      if (target.x > this.x + 6 && this.facing < 0) this.facing = 1;
      else if (target.x < this.x - 6 && this.facing > 0) this.facing = -1;
    }

    let desired: number;
    const lockAt = this.lockTarget(target);
    if (input.aimX !== null && input.aimY !== null && (input.aimX !== 0 || input.aimY !== 0)) {
      // Manual aim always wins.
      desired = Math.atan2(input.aimY, input.aimX);
    } else if (lockAt) {
      desired = Math.atan2(lockAt.y - this.y, lockAt.x - this.x);
    } else if (input.dx !== 0 || input.dy !== 0) {
      desired = Math.atan2(input.dy, input.dx);
    } else {
      desired = this.facing > 0 ? 0 : Math.PI;
    }

    // Slew the mounts rather than snapping, so recoil and lead read on screen.
    this.aim = approachAngle(this.aim, desired, this.def.flight.turretRate);
  }

  /**
   * What the weapon mounts are pointed at, or null to fall back to the heading.
   *
   * **Lock is unconditional.** It used to be gated on `inLockCone` — inside
   * `lockRange` *and* within a facing cone — and when that failed the aim fell
   * through to the movement direction. The result was the bug this replaced: a
   * mech strafing while firing pointed its guns along its own travel and shot at
   * empty air, which is not a thing any pilot would do and read as the weapons
   * being broken. There is no range at which "aim at nothing" is the better
   * answer, so there is no longer a range check.
   *
   * **The enemy drone is a valid target, and which one is held is a choice.**
   * See `lockPref`. It used to be decided by distance, which meant the escort
   * stole the lock whenever it drifted forward and there was no way to say
   * otherwise.
   *
   * This changes nothing about where projectiles fly: they still leave the
   * muzzle along the aim. It changes what the mounts point at.
   */
  private lockTarget(target: Combatant | null): { x: number; y: number } | null {
    if (!this.lockEnabled) return null;
    const mech = target && target.alive ? target : null;
    const drone = target && target.supporter.hittable ? target.supporter : null;

    /**
     * A decoy steals the lock outright while it is up.
     *
     * The only ability in the game that attacks the opponent's *information*
     * rather than their hull, and it works on a human exactly as it works on the
     * rival — the mounts swing onto a silhouette that is not there. Short-lived
     * and re-thrown on a cadence, so it is a recurring problem to read rather
     * than a permanent one to suffer.
     */
    const sup = target?.supporter;
    if (sup && sup.decoyLive && target!.def.supporter.role === 'decoy') {
      // With two silhouettes up, the mounts swing onto the nearer one — the same
      // mistake a pilot makes, and deterministic so a replay reproduces it.
      let best: DecoyState | null = null;
      let bestD = Infinity;
      for (const dec of sup.decoys) {
        if (dec.ticks <= 0) continue;
        const dd = Math.hypot(dec.x - this.x, dec.y - this.y);
        if (dd < bestD) {
          bestD = dd;
          best = dec;
        }
      }
      if (best) return { x: best.x, y: best.y };
    }

    if (!mech) return drone ? { x: drone.x, y: drone.y } : null;
    if (drone && this.lockPref === 'drone') return { x: drone.x, y: drone.y };
    return { x: mech.x, y: mech.y };
  }

  /**
   * The thing this machine is currently trying to hit, as a point.
   *
   * One resolver for every consumer — turret aim, melee acquisition, the escort
   * swing and projectile homing — because a lock that the guns and the sword
   * disagree about is not a lock. Returns null only when there is nothing alive
   * to shoot at.
   */
  lockPoint(target: Combatant | null): { x: number; y: number } | null {
    return this.lockTarget(target);
  }

  /**
   * Where a guided round should steer, which is **not** always where the mounts
   * point.
   *
   * The difference is decoys. A projection stealing the turret is the whole
   * point of the ability — it attacks your information — but letting it steal
   * *homing* as well would mean every missile in the air bends onto a hologram
   * and pops it. Measured: decoy uptime fell by 253 ticks in a 900-tick run,
   * because the projections were being deleted by the very rounds they were
   * supposed to be misdirecting. That is a real design question about how strong
   * the decoy should be, and it is not this change's to answer.
   */
  homingPoint(target: Combatant | null): { x: number; y: number } | null {
    const mech = target && target.alive ? target : null;
    const drone = target && target.supporter.hittable ? target.supporter : null;
    if (!mech) return drone ? { x: drone.x, y: drone.y } : null;
    if (drone && this.lockPref === 'drone') return { x: drone.x, y: drone.y };
    return { x: mech.x, y: mech.y };
  }

  /** True when `lockPref` currently resolves to a live escort. */
  lockedOnDrone(target: Combatant | null): boolean {
    return this.lockPref === 'drone' && !!target?.supporter.hittable;
  }

  /**
   * Switches the mounts between the pilot and its escort.
   *
   * A no-op when there is no escort to switch to, so the button cannot leave the
   * mech pointing at something that is not there.
   */
  cycleLockTarget(target: Combatant | null): void {
    if (this.lockPref === 'drone') {
      this.lockPref = 'mech';
      return;
    }
    if (target?.supporter.hittable) this.lockPref = 'drone';
  }


  // ------------------------------------------------------------- action start

  private tryStartAction(input: InputFrame, target: Combatant | null, events: SimEvent[]): void {
    const d = this.def;

    // Saturation mode cycling is always available (reference: Start button).
    if (isPressed(input, Btn.ModeCycle) && !this.satActive && !this.overdriveActive) {
      this.satMode = ((this.satMode + 1) % SAT_MODE_COUNT) as SatMode;
      events.push({ t: 'modeCycle', id: this.id, mode: this.satMode });
    }

    // FlyingMode toggle. Taking off gives an upward kick so lift-off reads.
    if (isPressed(input, Btn.Flight)) {
      this.flying = !this.flying;
      if (this.flying) {
        this.vy -= this.def.flight.takeoffImpulse;
        this.grounded = false;
        events.push({ t: 'takeoff', x: this.x, y: this.y, id: this.id });
      }
    }

    // Barrier burst.
    //
    // `!this.shieldActive` is BALANCE, NOT A BUG. The barrier button is meant to
    // be inert for the whole of a Shield burst; if you are here because pressing
    // it "does nothing", that is the mechanic working. See the note on the guard
    // stance below for the arithmetic, and D58. Do not remove it without
    // re-reading both — `saturation.test.ts` fails loudly if you do.
    if (!this.shieldActive && isPressed(input, Btn.Barrier) && this.barrier >= d.barrier.cost) {
      this.startBarrier(this.guarding, events);
      return;
    }

    // ...and say so when it is locked out, rather than letting a deliberate rule
    // read as a dropped input. A refused press that makes no sound is the single
    // most common way a balance decision gets reported as a bug.
    //
    // Reuses `assistDenied`, which already covers a refusal that has nothing to
    // do with the assist (see `tryActivateSaturation`). The name has drifted into
    // meaning "the thing you asked for is unavailable"; renaming it would mean
    // renaming the audio cue key and the file behind it, which is a bigger job
    // than it looks.
    if (this.shieldActive && isPressed(input, Btn.Barrier) && this.barrierDeniedCooldown <= 0) {
      this.barrierDeniedCooldown = BARRIER_DENIED_COOLDOWN;
      events.push({ t: 'assistDenied', x: this.x, y: this.y, ownerId: this.id });
    }

    // Holding barrier without a burst is a guard stance. Shield saturation keeps
    // it up for free and, crucially, does not claim the action state — that is
    // what lets you keep shooting and swinging from behind it.
    //
    // While the burst is up the button is inert: saturation is already holding
    // the guard, so there is nothing left for it to do, and leaving it live was
    // an exploit rather than an option. `barrierFree` makes a burst cost zero
    // and Shield tops the gauge to full and never lets it fall, so
    // `barrier >= cost` always passed — a pilot could mash the button for
    // back-to-back 60-tick invulnerability windows across the whole burst, which
    // is strictly better than the 5–30 % scaling the mode is balanced around.
    if (this.shieldActive) {
      this.guarding = true;
    } else {
      this.guarding = isHeld(input, Btn.Barrier) && this.canGuard && this.barrier > 0;
      if (this.guarding) {
        const drain = d.gauges.guardDrain * (this.dronePassive?.guardDrainMul ?? 1);
        this.barrier = Math.max(0, this.barrier - drain);
        this.barrierRegenTimer = d.gauges.barrierRegenDelay;
        if (this.barrier <= 0) this.breakGuard(events);
        this.act = ActState.GuardHold;
      }
    }

    /**
     * The sniper stance owns `Btn.Heavy`, and it owns it before anything else
     * reads a button.
     *
     * Placed above the command motions on purpose: a motion is a direction plus
     * a button and `MOTIONS.lance` ends in Heavy, so leaving this below would
     * have a drifting sniper toggle his own stance by accident several times a
     * minute — which is exactly how the rival was found to be firing lances it
     * never chose (see §8c).
     */
    if (d.sniper) {
      if (isPressed(input, Btn.Heavy)) {
        if (this.sniperActive) this.endSniper(events);
        else if (this.sniperCooldown <= 0) this.beginSniper(events);
        return;
      }
      // While the stance is up the chassis has one weapon and no answer to
      // anything that reaches it. That is the price of the reach.
      if (this.sniperActive) {
        const fire =
          isPressed(input, Btn.Main) || (isHeld(input, Btn.Main) && this.autoFireReady());
        // The stance's lance rides the main slot, so disarming the main gun
        // silences it too. A sniper with his gun shot out has nothing at all,
        // which is the risk the stance is supposed to carry.
        if (
          fire &&
          !this.weaponDisabled(WeaponSlot.Main) &&
          (this.energyFree || this.energy >= d.sniper.shot.energyCost)
        ) {
          this.begin(d.sniper.shot);
        }
        return;
      }
    }

    // Command motions take priority over plain button presses.
    if (this.cmd.matches(MOTIONS.lance) && (this.energyFree || this.energy >= d.lance.energyCost)) {
      this.begin(d.lance);
      return;
    }
    // Sub-weapon motion variant. The reference listed the sub shoot twice — as a
    // plain button and as a quarter-circle — and both belong to the supporter.
    if (this.cmd.matches(MOTIONS.salvo)) {
      if (this.orderAssist(d.salvo, events)) return;
    }
    if (this.cmd.matches(MOTIONS.spread) && (this.energyFree || this.energy >= d.spread.energyCost)) {
      this.begin(d.spread);
      return;
    }

    // Sub weapon: the drone carries it and is now permanently deployed, so the
    // button no longer launches or recalls anything — it orders a volley.
    //
    // That is what this button meant two designs ago, before the drone became a
    // toggle. The toggle is gone because the drone is always out; leaving the
    // button dead would have taken the sub-weapon away from every player who has
    // not discovered the quarter-circle motion that also fires it.
    if (isPressed(input, Btn.Sub)) {
      this.orderAssist(d.sub, events);
      return;
    }

    // Shoot saturation: one press, both guns.
    //
    // Either weapon button produces the pair, so the player does not have to
    // learn a new input to use the mode — the buttons they already hold simply
    // do more. Main takes the primary slot because it is the short one and the
    // one that auto-fires; the heavy rides the twin slot, which refuses a reload
    // while it is busy and so rate-limits itself to a heavy's own cadence.
    if (this.shootActive && !this.weaponDisabled(WeaponSlot.Main)) {
      const twinDown =
        isPressed(input, Btn.Heavy) ||
        isPressed(input, Btn.Main) ||
        (isHeld(input, Btn.Main) && this.autoFireReady());
      if (twinDown) {
        // **No forced takeoff.** See the note on the heavy shot below.
        // The twin slot is skipped when the heavy is the offline one, so a
        // Shoot burst still fires the gun the pilot still has.
        if (!this.weaponDisabled(WeaponSlot.Heavy)) this.beginCo(d.heavy);
        this.begin(d.main);
        return;
      }
    }

    // Heavy shot.
    //
    // **This used to force FlyingMode on**, copying the reference, whose Level 2
    // shot switched it automatically. Inherited, and on this roster it was
    // destructive: a siege platform could not fire its mortar without being
    // kicked off the deck, which took the bracing bonus away at exactly the
    // moment it was earned. TERRAMOTH is authored around standing and shooting —
    // `groundedMul` 0.66, the best on the roster, and the slowest airframe in
    // the game — and the heavy was the one button that made standing impossible.
    //
    // A pilot who wants to be airborne for the shot can take off; that is what
    // the flight toggle and the new jump are for. Nothing here should decide it
    // for them.
    if (
      isPressed(input, Btn.Heavy) &&
      !this.weaponDisabled(WeaponSlot.Heavy) &&
      (this.energyFree || this.energy >= d.heavy.energyCost)
    ) {
      this.begin(d.heavy);
      return;
    }

    // Melee has its own button: a swing is always a deliberate commitment, never
    // something that happens because you drifted into range. It lunges toward
    // the aim, so it stays useful from outside contact distance.
    if (
      isPressed(input, Btn.Melee) &&
      this.meleeLockout <= 0 &&
      !this.weaponDisabled(WeaponSlot.Melee)
    ) {
      // **A chosen escort takes the swing outright.** Holding the escort in the
      // reticle and getting a chain on the pilot instead is the same complaint
      // the lock rework exists to answer, one layer down.
      const chosen = target?.supporter;
      if (this.lockedOnDrone(target) && chosen) {
        const dSel = Math.hypot(chosen.x - this.x, chosen.y - this.y);
        if (dSel <= this.def.meleeRange + 54) {
          this.beginMelee(events, target, { x: chosen.x, y: chosen.y });
          return;
        }
      }

      // Otherwise lock on to the pilot, exactly as before. Only when no lock is
      // available at all does anything else get a look in.
      if (this.startMeleeLock(target, events)) return;

      // **Then the escort.** Drones could be shot but never cut, which is not a
      // rule anyone would guess from watching it. Reaching the escort with an
      // already-committed swing was not enough on its own, because the swing is
      // *aimed*: with the pilot out of reach the blade went at the pilot anyway
      // and sailed past the drone in your face.
      //
      // Strictly after the lock attempt, and that ordering is the whole design.
      // The escort usually flies *between* the two machines, so "swing at
      // whichever is nearer" — which is what this did first — quietly converted
      // ordinary melee into a single swing at a drone at any range where the
      // chain was available. It now only ever claims a press that would
      // otherwise have been the dead-button fallback.
      //
      // A single swing rather than a chain: `meleeLock` circles and repositions
      // around a `Combatant`, and a drone is not one — no barrier, no guard, no
      // hitstun. One swing per press is the honest version of "you can cut it".
      const esc = target?.supporter;
      if (esc?.hittable) {
        const dEsc = Math.hypot(esc.x - this.x, esc.y - this.y);
        if (dEsc <= this.def.meleeRange + 54) {
          this.beginMelee(events, target, { x: esc.x, y: esc.y });
          return;
        }
      }

      // No lock, no escort in reach: still throw a single swing so the button is
      // never dead.
      this.beginMelee(events, target);
      return;
    }

    // Main gun, with hold-to-autofire as the reference offered.
    const mainDown = isPressed(input, Btn.Main) || (isHeld(input, Btn.Main) && this.autoFireReady());
    if (
      mainDown &&
      !this.weaponDisabled(WeaponSlot.Main) &&
      (this.energyFree || this.energy >= d.main.energyCost)
    ) {
      this.begin(d.main);
    }
    void target;
  }

  private autoFireTimer = 0;
  /** Hold-to-autofire, as the reference offered for its Lv1/Lv2 shots. */
  private autoFireReady(): boolean {
    return this.autoFireTimer <= 0;
  }

  /** True when the main-gun button should swing instead of shoot. */
  meleeInRange(target: Combatant): boolean {
    const dist = Math.hypot(target.x - this.x, target.y - this.y);
    return dist <= this.effectiveMeleeRange;
  }

  /**
   * Opens a lock-on melee sequence. Requires a live target inside acquire range
   * and enough energy for the opening plus a couple of swings — a sequence that
   * fizzles immediately would just be a punish.
   */
  private startMeleeLock(target: Combatant | null, events: SimEvent[]): boolean {
    const p = this.def.meleeLock;
    if (this.meleeLock || this.attack || this.hitstun > 0 || this.meleeLockout > 0) return false;
    if (!target || !target.alive) return false;

    const dist = Math.hypot(target.x - this.x, target.y - this.y);
    // Desperate Speed reaches across the arena; see `effectiveMeleeRange`.
    if (dist > p.acquireRange * (this.desperateSpeed ? DESPERATE_MELEE_RANGE : 1)) return false;
    if (!this.energyFree && this.energy < p.energy + Math.min(p.hitEnergy * 2, 40)) return false;

    if (!this.energyFree) this.energy -= p.energy;
    this.sat = Math.min(this.def.gauges.maxSaturation, this.sat + 4 + p.hits * 0.35);
    this.aim = Math.atan2(target.y - this.y, target.x - this.x);
    this.facing = target.x >= this.x ? 1 : -1;
    this.invuln = Math.max(this.invuln, 2);
    this.meleeLock = {
      phase: 'close',
      timer: 0,
      hitIndex: 0,
      hitTimer: 0,
      hitDone: false,
      life: p.maxLife,
    };
    this.bladeTimer = Math.max(this.bladeTimer, p.swing + p.gap + 6);
    this.announced = p.name;
    events.push({ t: 'melee', x: this.x, y: this.y, angle: this.aim, id: this.id, stage: 0 });
    return true;
  }

  /** Ends the sequence and applies the cooldown. */
  private endMeleeLock(full: boolean): void {
    const p = this.def.meleeLock;
    // A desperate close raises a guard the pilot never asked for and never paid
    // for. Dropping the lock has to drop it too, or a broken charge would leave
    // a free guard standing for as long as nothing else cleared it.
    if (this.desperateClosing && !this.shieldActive) this.guarding = false;
    this.meleeLock = null;
    this.meleeLockout = Math.max(this.meleeLockout, full ? p.lockout : Math.round(p.lockout * 0.45));
  }

  /**
   * Advances an active sequence. Returns true while it owns the mech, so the
   * normal action/flight path stands down.
   */
  private stepMeleeLock(
    target: Combatant | null,
    spawns: ProjectileSpawn[],
    events: SimEvent[],
  ): boolean {
    const ml = this.meleeLock;
    if (!ml) return false;
    const p = this.def.meleeLock;

    ml.life--;
    // Losing the target, being hit, or running out of time all drop the lock.
    if (!target || !target.alive || this.hitstun > 0 || ml.life <= 0) {
      this.endMeleeLock(false);
      return false;
    }

    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const nx = dx / dist;
    const ny = dy / dist;
    this.facing = dx >= 0 ? 1 : -1;
    this.aim = Math.atan2(dy, dx);
    this.act = ActState.Attack;
    this.bladeTimer = Math.max(this.bladeTimer, 4);

    if (ml.phase === 'close') {
      ml.timer++;
      // Carry the blade back into the wind-up while closing, so the swing is
      // already loaded by the time the mech arrives. This is a held pose at the
      // start of the arc, not a stroke — the swinging belongs to `swing`.
      this.swingDriven = true;
      const ramp = Math.min(1, ml.timer / 8);
      this.spin = swingArcAngle(p.arc, 0, ml.hitIndex) * ramp;
      this.reach = swingReach(p.arc, 0, ml.hitIndex) * ramp;
      this.grip = swingGrip(p.arc, 0) * ramp;
      this.weaponSpin = swingWeaponSpin(p.arc, 0, ml.hitIndex) * ramp;
      this.lean = swingLean(p.arc, 0, ml.hitIndex) * ramp;
      this.lift = swingLift(p.arc, 0, ml.hitIndex) * ramp;

      /**
       * Desperation Speed closes from anywhere on the map, and the ordinary
       * approach cannot do it.
       *
       * `acquireRange` runs 380–500, so the desperation multiplier puts it at
       * 3,420–4,500 against an arena diagonal of about 2,680 — the lock genuinely
       * reaches everywhere, which is the point of the mode. But `thrust` is a
       * lunge, 12–19 a tick behind a `tracking` lerp, and the plain close gave up
       * after 22 ticks and swung anyway. That covers roughly 250 px. Every
       * long-range desperation melee therefore spent its entire chain slashing
       * empty air on the way in, arriving with the sequence already over and
       * having been a stationary target for the whole approach.
       *
       * So the desperate close is a **dash**: straight line, no lerp, at the same
       * multiplier desperation gives every other dash, and it does not hand over
       * to `swing` until the target is actually in reach.
       *
       * The guard is what makes committing to that survivable. It is free (see
       * `barrierFree`) and it is load-bearing rather than cosmetic: a guarded hit
       * returns without setting hitstun, and hitstun is what breaks a lock, so the
       * shield is the only reason a two-second approach is not cancelled by the
       * first stray round. A piercing non-melee hit still goes through it and
       * still stops the charge, which is the counter.
       */
      if (this.desperateSpeed) {
        this.guarding = true;
        const speed = p.thrust * DESPERATE_DASH;
        this.vx = nx * speed;
        this.vy = ny * speed;
        if (dist <= p.range) {
          if (!this.shieldActive) this.guarding = false;
          ml.phase = 'swing';
          ml.timer = 0;
          ml.hitTimer = 0;
          ml.hitDone = false;
        }
        // No timeout: `ml.life` bounds the sequence, and a lock that expires mid
        // approach ends without swinging rather than swinging at nothing.
        return true;
      }

      // Thrust onto the target, lerping so it reads as a controlled approach.
      this.vx = lerp(this.vx, nx * p.thrust, p.tracking);
      this.vy = lerp(this.vy, ny * p.thrust, p.tracking);
      if (dist <= p.range || ml.timer > 22) {
        ml.phase = 'swing';
        ml.timer = 0;
        ml.hitTimer = 0;
        ml.hitDone = false;
      }
      return true;
    }

    if (ml.phase === 'gap') {
      ml.timer++;
      // Recover the arm from the follow-through back toward the next wind-up,
      // so consecutive swings are joined by a real recovery rather than a snap.
      this.swingDriven = true;
      const gapT = clamp(ml.timer / Math.max(1, p.gap), 0, 1);
      const from = swingArcAngle(p.arc, 1, ml.hitIndex);
      const to = swingArcAngle(p.arc, 0, ml.hitIndex + 1);
      this.spin = lerp(from, to, gapT);
      // The weapon recovers to its next start position rather than snapping, so
      // a piston visibly retracts between strokes.
      this.reach = lerp(swingReach(p.arc, 1, ml.hitIndex), swingReach(p.arc, 0, ml.hitIndex + 1), gapT);
      // Held across the gap between hits: a chain is one continuous grip.
      this.grip = Math.max(swingGrip(p.arc, 1), swingGrip(p.arc, 0));
      this.weaponSpin = lerp(swingWeaponSpin(p.arc, 1, ml.hitIndex),
                             swingWeaponSpin(p.arc, 0, ml.hitIndex + 1), gapT);
      this.lean = lerp(swingLean(p.arc, 1, ml.hitIndex),
                       swingLean(p.arc, 0, ml.hitIndex + 1), gapT);
      this.lift = lerp(swingLift(p.arc, 1, ml.hitIndex),
                       swingLift(p.arc, 0, ml.hitIndex + 1), gapT);
      this.vx *= 0.86;
      this.vy *= 0.86;
      if (ml.timer >= p.gap) {
        ml.phase = 'swing';
        ml.timer = 0;
        ml.hitTimer = 0;
        ml.hitDone = false;
      }
      return true;
    }

    // ---- swing --------------------------------------------------------
    ml.hitTimer++;

    // Drive the arm through the authored arc. This is what makes the attack a
    // slash: the hit window sits in the fast part of the sweep, so the blade is
    // travelling through the target rather than being held against it.
    this.swingDriven = true;
    const swingT = ml.hitTimer / Math.max(1, p.swing);
    this.spin = swingArcAngle(p.arc, swingT, ml.hitIndex);
    this.reach = swingReach(p.arc, swingT, ml.hitIndex);
    this.grip = swingGrip(p.arc, swingT);
    this.weaponSpin = swingWeaponSpin(p.arc, swingT, ml.hitIndex);
    this.lean = swingLean(p.arc, swingT, ml.hitIndex);
    this.lift = swingLift(p.arc, swingT, ml.hitIndex);

    // Reposition to a point beside the target that shifts each hit, so the
    // sequence circles rather than bulldozing straight through.
    const side = this.facing * (42 + Math.min(24, ml.hitIndex * 3));
    const wantX = target.x - side;
    const wantY = target.y - 12 + Math.sin((ml.hitIndex + 1) * 1.7) * 10;
    this.vx = lerp(
      this.vx,
      clamp(wantX - this.x, -p.thrust * 0.74, p.thrust * 0.74),
      p.tracking * 0.74,
    );
    this.vy = lerp(
      this.vy,
      clamp(wantY - this.y, -p.thrust * 0.62, p.thrust * 0.62),
      p.tracking * 0.72,
    );

    if (ml.hitTimer === 1) {
      // Each swing is paid for. Running dry fizzles the sequence.
      if (!this.energyFree && this.energy < p.hitEnergy) {
        this.endMeleeLock(true);
        return false;
      }
      if (!this.energyFree) this.energy -= p.hitEnergy;
      this.bladeTimer = Math.max(this.bladeTimer, p.swing + p.gap + 5);
      events.push({
        t: 'melee',
        x: this.x,
        y: this.y,
        angle: this.aim,
        id: this.id,
        stage: ml.hitIndex,
      });
    }

    const activeStart = Math.max(2, Math.floor(p.swing * 0.34));
    const activeEnd = Math.max(activeStart + 1, Math.floor(p.swing * 0.72));
    if (!ml.hitDone && ml.hitTimer >= activeStart && ml.hitTimer <= activeEnd) {
      // Generous connect check: the sequence has already committed, so a swing
      // that visually reaches should land.
      //
      // **The escort counts as something a swing can reach.** This was measured
      // to the locked pilot alone, so a blade passing straight through a drone
      // produced no hitbox at all — the escort could be shot out of the air but
      // never cut, which is not a rule anyone would guess from watching it. The
      // drone only decides whether the swing *exists*; what it connects with is
      // still `resolveCollisions` and `resolveDroneCollisions`, in that order,
      // so a swing that lands on the pilot cannot also clip the escort behind.
      const esc = target.supporter;
      const escDist = esc.hittable
        ? Math.hypot(esc.x - this.x, esc.y - this.y)
        : Infinity;
      if (dist < p.range + 54 || escDist < p.range + 54) {
        ml.hitDone = true;
        const last = ml.hitIndex >= this.meleeLockHits - 1;
        const base = this.def.melee[Math.min(ml.hitIndex, this.def.melee.length - 1)];
        const dmg = p.damage[Math.min(ml.hitIndex, p.damage.length - 1)];
        const knock = p.knock[Math.min(ml.hitIndex, p.knock.length - 1)];
        const m = this.muzzle(base);
        spawns.push({
          x: m.x,
          y: m.y,
          vx: nx * 0.001,
          vy: ny * 0.001,
          damage: dmg * this.satShootScale * this.outgoingScale * this.meleeScale,
          guardDamage: dmg * 0.5,
          life: 2,
          radius: p.range,
          ownerId: this.id,
          team: this.team,
          kind: ProjKind.Melee,
          barrier: BarrierResponse.Pierce,
          hitstop: last ? 14 : 7,
          /**
           * A chain has to hold itself together.
           *
           * This was a flat 14 for every weapon, while the interval between hits
           * is `swing + gap` and is authored per weapon from 10 to 26. So whether
           * a combo could be escaped was never a design choice — it was whichever
           * side of one hardcoded number a weapon's animation happened to fall on,
           * and it landed backwards. CIRRUS at 10 and HALCYON at 13 were airtight;
           * OBELISK at 26, TERRAMOTH at 24 and VESPER at 21 handed the victim ten
           * to twelve free frames after the *first* hit, which was long enough to
           * open a melee lock of their own and swing back. Those three chains are
           * only two hits, so in practice their finisher — the hit carrying the
           * knockback and the 30-tick stun — essentially never landed against
           * anyone pressing the button.
           *
           * Covering the cadence makes a combo a combo. It does not make it
           * inescapable: the barrier-cancel in `stepStunned` still buys a way out
           * for double barrier cost, which is the intended answer and the only one
           * that should exist. Guarding the opener still prevents the stun
           * outright, because a guarded hit never sets it.
           */
          hitstun: last ? 30 : Math.max(14, p.swing + p.gap + 2),
          knockback: last ? knock + p.finisherKnock : knock,
          homing: 0,
          pierceCount: 0,
          element: base.element ?? Element.None,
          trueDamage: this.desperateSpeed,
        });
        if (last) {
          // The finisher forcibly creates neutral again.
          this.vx = -nx * p.finisherKnock * 0.28;
          this.vy = -ny * p.finisherKnock * 0.28 - p.finalLift * 0.4;
        }
      }
    }

    if (ml.hitTimer >= p.swing) {
      ml.hitIndex++;
      if (ml.hitIndex >= this.meleeLockHits) {
        this.endMeleeLock(true);
        return false;
      }
      ml.phase = 'gap';
      ml.timer = 0;
    }
    return true;
  }

  private beginMelee(
    events: SimEvent[],
    target?: Combatant | null,
    aimAt?: { x: number; y: number },
  ): void {
    // Lock on: snap the aim to the target as the swing commits. The turret only
    // slews ~13deg/tick, so a swing started while the mounts are still coming
    // around would otherwise lunge along a stale angle - away from the enemy -
    // and the in-flight tracking cannot correct that inside the startup window.
    //
    // `aimAt` overrides the pilot, which is how a swing is pointed at an escort.
    const at = aimAt ?? (target && target.alive ? { x: target.x, y: target.y } : null);
    if (at) {
      this.aim = Math.atan2(at.y - this.y, at.x - this.x);
      this.facing = at.x >= this.x ? 1 : -1;
    }
    const stages = this.def.melee;
    const maxHits = this.maxMeleeHits;
    let next: AttackDef;
    if (this.meleeCount === 0) next = stages[0];
    else if (this.meleeCount >= maxHits - 1) next = stages[2];
    else next = stages[1];

    this.meleeCount++;
    this.meleeChainGrace = 0;
    this.meleeHitConfirmed = false;
    this.begin(next);
    events.push({
      t: 'melee',
      x: this.x,
      y: this.y,
      angle: this.aim,
      id: this.id,
      stage: next.meleeStage ?? 0,
    });
  }

  private begin(a: AttackDef): void {
    this.attack = a;
    this.attackTick = 0;
    this.attackFired = false;
    this.act = ActState.Attack;
    // Shield saturation is the one case where attacking does not drop the guard —
    // "you can still attack while the shield is active" is the whole mode.
    if (!this.shieldActive) this.guarding = false;
    this.meleeChainQueued = false;

    if (!this.energyFree) this.energy = Math.max(0, this.energy - a.energyCost);
    if (a.subCost) {
      this.subCharges = Math.max(0, this.subCharges - a.subCost);
      this.subRecharge = 0;
    }
    this.autoFireTimer = ATTACK_TOTAL(a);
  }

  /**
   * Saturation activation: Boost + Barrier on a full meter.
   *
   * Two changes from what this used to be, both because the burst was very
   * nearly impossible to trigger by hand.
   *
   * **The buttons.** It was Main + Heavy — the two weapon buttons — and either
   * one landing first immediately started its own attack. `tryStartAction` is
   * never reached while an attack is running, so the second button was simply
   * never seen, and only pressing both inside the same 16.7ms tick worked.
   * Boost and Barrier start no attack, so the combination has nothing to race
   * against, and it keeps the weapon buttons free during a fight.
   *
   * **The timing.** The condition is now "both held, either one pressed this
   * tick", which is what pressing two keys together actually looks like to a
   * simulation running at 60Hz.
   *
   * Checked from `step` ahead of the attack dispatch, and the caller suppresses
   * this tick's dash and skips `tryStartAction`, so opening a burst does not
   * also spend a dash or fire off a barrier burst.
   */
  private tryActivateSaturation(input: InputFrame, events: SimEvent[]): boolean {
    // OVERDRIVE owns all three modes; a burst on top of it would be meaningless
    // and the pilot is explicitly denied one while it runs.
    if (this.satActive || this.overdriveActive || this.satBurnout > 0) return false;
    if (!isPressed(input, Btn.Saturation)) return false;

    const frac = this.sat / this.def.gauges.maxSaturation;
    if (frac < SAT_MIN_FRACTION) {
      // Not enough to do anything with. Refuse rather than waste it, and say so.
      events.push({ t: 'assistDenied', x: this.x, y: this.y, ownerId: this.id });
      return false;
    }

    // Opening a burst overrides anything already running.
    this.attack = null;
    this.coAttack = null;
    if (this.meleeLock) this.endMeleeLock(false);
    this.activateSaturation(Math.min(1, frac), events);
    return true;
  }

  /**
   * Opens a burst at `power` (0..1), the fraction of the meter that was charged.
   *
   * A full meter gives the authored numbers. Anything less gives proportionally
   * weaker multipliers for a proportionally shorter time, and is flagged to
   * overheat instead of merely burning out. The top-up is reserved for a full
   * charge — an early burst has to run on what the fight left you, which is most
   * of why waiting is worth it.
   */
  private activateSaturation(power: number, events: SimEvent[]): void {
    this.satActive = true;
    this.satPower = power;
    // Latched now, so the buff belongs to the decision to spend while losing.
    this.satDesperate = this.life / this.def.gauges.maxLife <= DESPERATION_LIFE;
    this.satPartial = power < 1;
    this.satTicks = Math.max(30, Math.round(this.def.gauges.satDuration * power));
    this.invuln = Math.max(this.invuln, 20);
    this.sat = 0;

    if (!this.satPartial) {
      // Each mode opens by topping up the resource it is about to spend freely,
      // so a full burst starts from full rather than from whatever it inherited.
      if (this.satMode === SatMode.Speed) this.boost = this.def.flight.maxBoost;
      if (this.satMode === SatMode.Shoot) this.energy = this.def.gauges.maxEnergy;
      if (this.satMode === SatMode.Shield) this.barrier = this.def.gauges.maxBarrier;
    }
    if (this.satMode === SatMode.Shield) this.guarding = true;
    events.push({ t: 'saturation', id: this.id, mode: this.satMode, partial: this.satPartial });
  }

  private startBarrier(cancelling: boolean, events: SimEvent[]): void {
    const b = this.def.barrier;
    let cost = b.cost;
    if (cancelling) cost += b.cancelPenalty;
    if (!this.barrierFree) this.barrier = Math.max(0, this.barrier - cost);
    this.barrierRegenTimer = this.def.gauges.barrierRegenDelay;

    const guardTicks = b.invulnTicks + (this.shieldActive ? b.shieldBonusTicks : 0);
    this.invuln = Math.max(this.invuln, guardTicks);
    // A burst answers a sword as well as a gun, but only if the sword has not
    // already started landing — see `meleeHitsTaken`.
    this.repelTicks = this.meleeHitsTaken === 0 ? guardTicks : 0;
    this.barrierActiveTicks = b.actionTicks;
    this.act = ActState.Barrier;
    this.attack = null;
    this.coAttack = null;
    // Shield saturation puts it straight back up on the next tick, which is the
    // point: bursting out of a guard should not cost you the guard.
    this.guarding = false;
    events.push({ t: 'barrier', x: this.x, y: this.y, id: this.id });
  }

  private breakGuard(events: SimEvent[]): void {
    this.guarding = false;
    this.guardBreakStun = this.def.barrier.breakStun;
    this.act = ActState.Hitstun;
    events.push({ t: 'guardBreak', x: this.x, y: this.y, id: this.id });
  }

  // ------------------------------------------------------------ attack stepping

  private stepAttack(
    input: InputFrame,
    target: Combatant | null,
    spawns: ProjectileSpawn[],
    events: SimEvent[],
  ): void {
    const a = this.attack;
    if (!a) return;

    // Melee homes onto the target for the duration of the swing rather than
    // committing to a straight line at the moment of the press. The 2005
    // reference did the same with `posadd` toward the enemy during startup, and
    // it is most of why a sword feels like it connects instead of sliding past.
    if (a.lunge && this.attackTick < a.startup + a.active) {
      let ang = this.aim;
      if (target && target.alive) {
        const want = Math.atan2(target.y - this.y, target.x - this.x);
        // Track hard enough to correct, softly enough that it can still whiff.
        ang = approachAngle(ang, want, MELEE_TRACK_RATE);
      }
      this.vx = Math.cos(ang) * a.lunge;
      this.vy = Math.sin(ang) * a.lunge;
    }

    // Advance first, so `attackTick` is the 1-based frame number we are now on
    // and `phase` agrees with whether the hit has actually been spawned.
    this.attackTick++;

    // Buffer a chain input during the authored window.
    if (
      a.chainFrom !== undefined &&
      a.chainTo !== undefined &&
      this.attackTick >= a.chainFrom &&
      this.attackTick <= a.chainTo &&
      isPressed(input, Btn.Melee)
    ) {
      this.meleeChainQueued = true;
    }

    if (this.phase === Phase.Active && !this.attackFired) {
      this.attackFired = true;
      this.fire(a, target, spawns, events);
    }

    // A lone swing (no lock acquired) uses the same authored arc, so the button
    // never produces a different-looking attack from the committed sequence.
    if (a.kind === ProjKind.Melee) {
      this.swingDriven = true;
      const total = Math.max(1, a.startup + a.active);
      const lockT = this.attackTick / total;
      this.spin = swingArcAngle(this.def.meleeLock.arc, lockT, this.meleeCount - 1);
      this.reach = swingReach(this.def.meleeLock.arc, lockT, this.meleeCount - 1);
      this.grip = swingGrip(this.def.meleeLock.arc, lockT);
      this.weaponSpin = swingWeaponSpin(this.def.meleeLock.arc, lockT, this.meleeCount - 1);
      this.lean = swingLean(this.def.meleeLock.arc, lockT, this.meleeCount - 1);
      this.lift = swingLift(this.def.meleeLock.arc, lockT, this.meleeCount - 1);
    }

    if (this.autoFireTimer > 0) this.autoFireTimer--;

    if (this.attackTick >= ATTACK_TOTAL(a)) {
      const wasMelee = a.kind === ProjKind.Melee;
      const isFinisher = a.meleeStage === 2;
      this.attack = null;
      this.act = ActState.Free;

      if (wasMelee) {
        if (this.meleeChainQueued && this.meleeHitConfirmed && !isFinisher) {
          // Hit-confirmed chain, exactly as the reference gated its follow-up.
          this.beginMelee(events, target);
        } else {
          // Ending a chain — by finisher or by dropping it — locks melee out
          // briefly, so sword pressure cannot be maintained indefinitely.
          this.meleeLockout = Math.max(
            this.meleeLockout,
            isFinisher ? this.def.gauges.meleeLockout : Math.round(this.def.gauges.meleeLockout * 0.6),
          );
          this.meleeCount = 0;
          this.meleeHitConfirmed = false;
          this.meleeChainQueued = false;
        }
      }
    }
  }

  /**
   * Spawns an attack's projectiles.
   *
   * `from` overrides the muzzle when the supporter drone is firing on this
   * machine's behalf: the shot then leaves the drone's own coordinates and along
   * the drone's own angle, and the chassis takes no recoil for it.
   */
  private fire(
    a: AttackDef,
    target: Combatant | null,
    spawns: ProjectileSpawn[],
    events: SimEvent[],
    from?: { x: number; y: number; angle: number },
  ): void {
    const m = from ?? this.muzzle(a);
    const aim = from ? from.angle : this.aim;
    const speed = a.projSpeed * this.satProjSpeedScale;
    const dmgScale =
      this.satShootScale *
      this.outgoingScale *
      (a.kind === ProjKind.Melee ? this.meleeScale : 1);
    const homing = a.homing * (this.shootActive ? 1.8 : 1);

    const famId = a.family ?? defaultFamily(a.kind);
    const fam = PROJ_FAMILIES[famId];
    // Beams stacked along the axis long before patterns existed; that stays
    // their default so no beam has to restate it.
    const pattern = a.pattern ?? (a.kind === ProjKind.Beam ? 'stack' : 'line');
    const gap = a.projGap ?? a.projRadius * 1.9;
    const cos = Math.cos(aim);
    const sin = Math.sin(aim);

    const n = a.projCount;
    const half = (n - 1) / 2;

    for (let i = 0; i < n; i++) {
      // Signed slot about the centre of the volley: -1, 0, +1 for three shots.
      const k = n === 1 ? 0 : i - half;
      const fan = n === 1 ? 0 : k * (a.spreadRad / Math.max(1, n - 1)) * 2;

      let ang = aim + fan;
      /** Offset along the aim axis, and across it. */
      let along = 0;
      let lateral = 0;
      let speedMul = 1;

      switch (pattern) {
        case 'stack':
          ang = aim;
          along = i * a.projRadius * 1.6;
          break;
        case 'bundle':
          // Parallel streaks that fray as they travel. The reference draws a
          // volley as several thin lines of slightly different length side by
          // side — the long streaks in its screenshots are that, not one shot
          // with a long trail.
          lateral = k * gap;
          along = -Math.abs(k) * gap * 0.35;
          speedMul = 1 + k * 0.05;
          break;
        case 'ripple':
          // One heading, descending speeds, so the volley strings out into a
          // moving wall instead of arriving as a single point of damage.
          speedMul = 1 - (n === 1 ? 0 : (i / (n - 1)) * 0.34);
          break;
        case 'arc':
          // A bowed launch front: the outer shots start further back, so the
          // spread reads as a curved wave rather than a cone from a muzzle.
          lateral = k * gap;
          along = -Math.abs(k) * gap * 0.8;
          break;
        case 'line':
          break;
      }

      const sp = speed * speedMul;
      const velMul = a.velMul ?? fam.velMul;
      const accel = (a.projAccel ?? fam.accel) * sp;
      spawns.push({
        x: m.x + cos * along - sin * lateral,
        y: m.y + sin * along + cos * lateral,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        damage: a.damage * dmgScale,
        guardDamage: a.guardDamage * dmgScale,
        life: this.shootActive ? Math.max(a.projLife, SAT_UNLIMITED_LIFE) : a.projLife,
        radius: a.projRadius,
        ownerId: this.id,
        team: this.team,
        kind: a.kind,
        barrier: a.barrier,
        hitstop: a.hitstop,
        hitstun: a.hitstun,
        knockback: a.knockback,
        homing,
        homingTicks: a.homingTicks,
        /**
         * **Third time a flag has been dropped here this session.**
         *
         * This object is built field by field rather than spread from the
         * attack, so every new gameplay property on `AttackDef` has to be added
         * in this exact spot or it silently never reaches the projectile. It has
         * now happened to `decoyShot` (D102, dropped in `Projectile.reset`),
         * `homingTicks`, and this. The symptom is always the same and always
         * invisible: the feature is fully written, the data says it is on, and
         * nothing whatsoever happens.
         *
         * `sniper.test.ts` asserts this one survives into the pool. Any future
         * flag wants the same treatment.
         */
        disarms: a.disarms,
        pierceCount: a.pierceCount,
        element: a.element ?? Element.None,
        family: famId,
        visualScale: a.visualScale ?? 1,
        velMul,
        accel,
        swerve: a.swerve ?? fam.swerve,
        swervePeriod: fam.swervePeriod,
        // Bounds only bite once a family actually changes speed — a coasting
        // family skips the whole branch, which is what keeps homing missiles
        // (whose acceleration is modelled in `Projectile.step`) exactly as fast
        // as they were before families existed.
        speedMin: sp * PROJ_SPEED_MIN,
        speedMax: sp * PROJ_SPEED_MAX,
        // A lone swing has to bypass defences exactly as the lock sequence does,
        // or the burst's promise would hold only for the committed chain.
        trueDamage: this.desperateSpeed && a.kind === ProjKind.Melee,
      });

      // Desperate Shoot: every individual projectile gets its own roll to be
      // doubled, so a five-round spread averages six or seven rather than
      // sometimes ten and sometimes five. Rolled per shot rather than per
      // volley on purpose — the volleys already differ in size across the
      // roster, and a per-volley roll would pay the widest kit the most.
      //
      // Drawn from the match's seeded generator, because this is gameplay and a
      // replay has to reproduce it exactly.
      if (this.desperateShoot && this.rng.chance(DESPERATE_EXTRA_SHOT)) {
        const twin = { ...spawns[spawns.length - 1] };
        // Nudged off its twin so the pair reads as two shots rather than one
        // brighter one, and fanned very slightly so they separate downrange.
        const jitter = 0.045;
        const s2 = Math.hypot(twin.vx, twin.vy) || 1;
        const a2 = Math.atan2(twin.vy, twin.vx) + jitter;
        twin.vx = Math.cos(a2) * s2;
        twin.vy = Math.sin(a2) * s2;
        twin.x -= sin * a.projRadius * 1.1;
        twin.y += cos * a.projRadius * 1.1;
        spawns.push(twin);
      }
    }

    // Recoil pushes the chassis back along the aim axis — but only when the
    // chassis itself fired. A drone's shot must not shove its owner around.
    //
    // **A planted frame eats its own recoil.** Firing airborne shoves you off
    // the line you were aiming along, which is a real cost — TERRAMOTH's mortar
    // is 4.2 — and the deck is what a gun platform braces against. This is the
    // reason to stand still that the ground game never had: not more damage,
    // but output that arrives where it was pointed.
    if (a.recoil && !from && !this.grounded) {
      this.vx -= Math.cos(aim) * a.recoil;
      this.vy -= Math.sin(aim) * a.recoil;
    }

    this.sat = Math.min(
      this.def.gauges.maxSaturation,
      this.sat + (this.satActive || this.overdriveActive ? 0 : a.satGain),
    );
    this.firedThisTick = a.kind;
    events.push({ t: 'fire', x: m.x, y: m.y, angle: aim, kind: a.kind, ownerId: this.id, family: famId });
    void target;
  }

  private stepMotion(input: InputFrame): void {
    const a = this.attack;
    const locked = this.barrierActiveTicks > 0;

    const intent: FlightIntent = {
      dx: locked ? 0 : input.dx,
      dy: locked ? 0 : input.dy,
      // Thrusters are gone after OVERDRIVE burns out. No boost, and no dash.
      boost: !locked && !this.overdriveSpent && isHeld(input, Btn.Boost),
      // Dash is deliberately NOT gated on `!a`. A mech may dash while firing or
      // mid-swing — that overlap is what makes the movement read as aggressive
      // rather than as a series of committed stops. Firing and melee remain
      // mutually exclusive with each other; only movement overlaps them.
      dash: !locked && !this.overdriveSpent && isPressed(input, Btn.Boost),
      // Cryo bites here, so it slows flight, walking and boost alike.
      speedScale: this.satSpeedScale * this.status.speedScale * this.sniperSpeedScale,
      boostSpeedScale: this.satThrustScale * this.status.speedScale * this.sniperSpeedScale,
      // A desperate Speed burst extends the dash specifically, so closing the
      // yard in one move is the thing that changed — not the top speed you
      // cruise at, which would just make the mech hard to place.
      dashSpeedScale:
        this.satThrustScale * this.status.speedScale * this.sniperDashScale * (this.desperateSpeed ? DESPERATE_DASH : 1),
      boostFree: this.boostFree,
      // Firing anchors you, but never so much that a simultaneous dash fizzles:
      // the dash impulse is the whole point of allowing the overlap.
      moveScale: a && a.kind !== ProjKind.Melee && !isPressed(input, Btn.Boost)
        ? moveScaleFor(a.kind)
        : 1,
      boostRegenScale: this.dronePassive?.boostRegenMul ?? 1,
      flying: this.flying,
      groundY: this.groundY,
      lunging: !!(a && a.lunge && this.attackTick <= a.startup + a.active),
    };

    const r = stepFlight(this, this.def.flight, intent);
    if (r.dashStarted) this.dashStartedThisTick = true;
    this.grounded = r.grounded;
    if (r.landed) this.landedThisTick = true;
    // The second boost press mid-hop asks for FlyingMode, which the model
    // cannot set itself. Costs nothing extra: the jump already paid.
    if (r.boostKick && !this.flying) {
      this.flying = true;
      this.pendingTakeoff = true;
    }
    // **A machine hanging in the air is working hardest of all.**
    //
    // This floored at zero, so a mech holding station with no input showed no
    // exhaust whatever — hovering motionless above a cloud deck with nothing
    // visibly holding it up. Thrust is presentation only (the leg trail, the
    // thruster splay and the plume read it; nothing in the simulation does), so
    // the floor is free and it is what makes the machines look airborne rather
    // than pasted onto the sky.
    //
    // The ramp it creates is the point: station-keeping at HOVER, movement at
    // roughly 0.7, a brake at 0.25, and boost or dash at full.
    this.thrust = clamp(
      r.boosting ? 1 : r.braking ? 0.25 : Math.hypot(intent.dx, intent.dy) * 0.7,
      this.flying && !this.grounded ? HOVER_THRUST : 0,
      1,
    );
    if (this.dashTicks > 0) this.thrust = 1;
  }

  /**
   * Advances the walk cycle.
   *
   * Phase is driven by *distance travelled*, not by time, so the stride matches
   * the speed the mech is actually moving and the feet do not skate. Airborne
   * mechs unwind the stride and hold a neutral pose, since they are flying.
   *
   * Simulated rather than done in the renderer so it stays deterministic and a
   * replay reproduces the same pose.
   */
  private updateWalk(): void {
    const grounded = this.grounded && !this.flying;
    const speed = grounded ? Math.abs(this.vx) : 0;
    const want = grounded ? clamp(speed / Math.max(0.6, this.def.flight.walkSpeed), 0, 1) : 0;
    // Ease toward the target so starting and stopping are not instantaneous.
    this.stride += (want - this.stride) * 0.16;
    if (this.stride < 0.002) this.stride = 0;

    if (grounded) {
      // One full stride per STRIDE_LENGTH px of ground covered.
      const STRIDE_LENGTH = 46;
      this.walkPhase += (speed / STRIDE_LENGTH) * Math.PI * 2 * Math.sign(this.vx || 1);
      if (this.walkPhase > Math.PI * 4) this.walkPhase -= Math.PI * 4;
      if (this.walkPhase < -Math.PI * 4) this.walkPhase += Math.PI * 4;
    }

    this.updateLegs();
  }

  /**
   * Advances the airborne leg dangle. See `legSwing`.
   *
   * A spring-damper per leg rather than a sine: a driven oscillator overshoots
   * and settles on its own, so the legs keep swinging for a moment after the
   * machine stops and catch up late when it starts. That lag is the whole read —
   * a sine locked to velocity arrives exactly when the chassis does and looks
   * bolted on, which is the problem being fixed rather than a different shape of
   * it.
   *
   * World-space, like `bank` and `walkPhase`; `MechRenderer` negates for facing.
   */
  private updateLegs(): void {
    const f = this.def.flight;
    const vmax = Math.max(1, f.boostMaxSpeed);
    this.legPhase += LEG_IDLE_RATE;
    if (this.legPhase > Math.PI * 2) this.legPhase -= Math.PI * 2;

    // Trail the motion, and stream further back the harder the thrusters work.
    const drag = clamp(this.vx / vmax, -1, 1) * (LEG_TRAIL_BASE + this.thrust * LEG_TRAIL_THRUST);
    // Sinking pulls the feet forward under the hips, climbing lets them hang
    // back — small, but it stops a vertical boost looking like a hover.
    const rise = clamp(this.vy / vmax, -1, 1) * LEG_RISE;
    const base = clamp(drag + rise, -1.4, 1.4) * LEG_DANGLE_MAX;

    for (let i = 0; i < 2; i++) {
      // The two sways are deliberately not half a cycle apart. Antiphase reads
      // as a march; an irrational-ish offset reads as two limbs that happen to
      // be hanging from the same machine.
      const sway = Math.sin(this.legPhase + i * LEG_SWAY_OFFSET) * LEG_IDLE;
      const target = base + sway;
      this.legVel[i] += (target - this.legSwing[i]) * LEG_SPRING[i];
      this.legVel[i] *= LEG_DAMP[i];
      this.legSwing[i] += this.legVel[i];
    }
  }

  /** Bank, hover-bob and spin. Simulated so replays stay bit-identical. */
  private updateVisualAngles(input: InputFrame): void {
    const f = this.def.flight;
    // Bank into horizontal motion; dashing leans harder (reference used
    // distinct dash bank angles per chassis family).
    const lean = clamp(this.vx / Math.max(0.001, f.boostMaxSpeed), -1, 1);
    let targetBank = lean * f.bankMax * (this.dashTicks > 0 ? 1.4 : 1);
    if (input.dy !== 0) targetBank += input.dy * 6 * DEG * this.facing;
    targetBank = clamp(targetBank, -f.bankMax * 1.4, f.bankMax * 1.4);
    this.bank = approachAngle(this.bank, targetBank, f.bankRate);

    this.bobPhase += 0.055;
    this.updateWalk();
    // Once nothing is driving the arc, the arm relaxes back to its rest angle.
    // The latch is consumed here, so a sequence dropped mid-swing cannot leave
    // the arm stuck out at the follow-through angle.
    this.swinging = this.swingDriven;
    this.swingDriven = false;
    if (!this.swinging && this.act !== ActState.Hitstun) {
      this.spin *= 0.86;
      if (Math.abs(this.spin) < 0.01) this.spin = 0;
      // Extension settles alongside the rotation, so a mech never freezes with
      // its shield or ram left hanging out after a sequence ends.
      this.reach *= 0.82;
      if (Math.abs(this.reach) < 0.05) this.reach = 0;
      this.grip *= 0.82;
      if (this.grip < 0.02) this.grip = 0;
      this.weaponSpin *= 0.82;
      this.lean *= 0.82;
      this.lift *= 0.82;
      if (Math.abs(this.lift) < 0.05) this.lift = 0;
    }
  }

  // --------------------------------------------------------------- taking hits

  /**
   * Applies an incoming hit. Returns what happened so the caller can emit the
   * right event and credit the attacker.
   */
  takeHit(p: ProjectileSpawn): 'ignored' | 'absorbed' | 'guarded' | 'hit' | 'repelled' {
    if (!this.alive) return 'ignored';

    const piercing = p.barrier === BarrierResponse.Pierce;
    const isMelee = p.kind === ProjKind.Melee;

    // Barrier burst vs a sword: the opening strike is thrown back at whoever
    // swung it. Checked ahead of the invulnerability branch, which would
    // otherwise swallow the hit as a plain 'ignored' and lose the counter.
    if (this.repelTicks > 0 && isMelee && this.meleeHitsTaken === 0) {
      this.sat = Math.min(this.def.gauges.maxSaturation, this.sat + this.def.gauges.satOnAbsorb);
      this.repelTicks = 0;
      return 'repelled';
    }

    // A desperate Shield burst is total. Not 95 % off, not "except lances" —
    // nothing lands until the meter runs out.
    //
    // Checked ahead of every scaling branch precisely so it needs no exceptions:
    // gunfire, melee, lances and status chip all stop here. It is the strongest
    // defensive state in the game and it is meant to be, because a pilot only
    // reaches it by having already been beaten down to a third of their hull.
    // The burnout waiting at the far end is what it costs.
    if (this.desperateShield) return 'absorbed';

    // Barrier-burst invulnerability. Absorbing a shot feeds the meter, which is
    // the reference's core defensive loop.
    if (this.invuln > 0) {
      if (!piercing) {
        this.sat = Math.min(this.def.gauges.maxSaturation, this.sat + this.def.gauges.satOnAbsorb);
        return 'absorbed';
      }
      return 'ignored';
    }

    /**
     * A decoy's shot. Lands, sounds right, does nothing.
     *
     * Handled before every other branch so it can skip the whole ladder: no
     * damage, no guard interaction, no meter, and no `hitInvuln` — see
     * `ProjectileSpawn.decoyShot` for why that last one matters.
     */
    /**
     * A decoy's shot. Lands, sounds right, and takes a sliver.
     *
     * Handled before every other branch so it can skip most of the ladder, and
     * the exclusions are each load-bearing:
     *
     * * **No `hitInvuln`.** The reason `decoyShot` exists at all. A round that
     *   opened the usual i-frame window would have NULLTIDE *shielding* the
     *   pilot she is deceiving from her own real fire, which inverts the ability.
     * * **Stun, but no hitstop and no knockback.** The three-in-twenty
     *   one-second stun is back at its original figures (D105), so the round can
     *   interrupt — but it never shoves, and it never freezes the attacker's own
     *   frame the way a real connect does. A hologram lands like a hologram.
     * * **No meter, either way.** It does not feed the victim's saturation. At
     *   this cadence a chip source that charged the bar would hand the target a
     *   burst for being shot at by a hologram.
     *
     * It does respect chassis defence and a held guard, because a shot that
     * ignored armour would be the hardest-hitting thing in NULLTIDE's kit
     * against the frames built to resist exactly this. **A guard stops the stun
     * outright** — blocking is the counterplay, and without that the projection
     * would answer its own answer.
     */
    if (p.decoyShot) {
      const guarded = this.guarding || this.shieldActive;
      const chip =
        p.damage * this.incomingScale * (guarded ? this.def.barrier.guardScale : 1);
      this.life = Math.max(0, this.life - chip);
      if (p.hitstun > 0 && !guarded && this.invuln <= 0) {
        this.hitstun = Math.max(this.hitstun, p.hitstun);
        this.act = ActState.Hitstun;
      }
      return 'hit';
    }

    // True damage bypasses the entire ladder below — chassis defence, the drone
    // armour passive, the grounded bracing bonus, guards and Shield saturation.
    // Only a desperate Speed burst's melee sets it, and the point is that it
    // cannot be answered by hiding: everything else in `takeHit` is a way of
    // taking less, and this is the one thing that ignores all of them.
    if (p.trueDamage) {
      if (isMelee) this.meleeHitsTaken++;
      this.life = Math.max(0, this.life - p.damage);
      this.hitstop = Math.max(this.hitstop, p.hitstop);
      this.hitstun = Math.max(this.hitstun, p.hitstun);
      this.invuln = Math.max(this.invuln, this.def.gauges.hitInvuln);
      this.guarding = false;
      const l0 = Math.hypot(p.vx, p.vy) || 1;
      const k0 = p.knockback * this.knockbackScale;
      this.vx += (p.vx / l0) * k0;
      this.vy += (p.vy / l0) * k0;
      return 'hit';
    }

    // Layered defence, mirroring the reference's DefenceMulSet tiers, with the
    // drone's armour passive folded into `incomingScale`.
    const def = this.def.defence;
    // Painted by the shooter's designator drone: worth more to shoot at, and no
    // harder to escape. See `DESIGNATOR_DAMAGE`.
    const paint = this.paintedTicks > 0 ? DESIGNATOR_DAMAGE : 1;
    const dmg = p.damage * paint * this.incomingScale * (this.grounded ? def.groundedMul : 1);

    // A guard now stops melee too, just far less well than it stops gunfire.
    // Melee keeps its `Pierce` marking, which still means the Shield-saturation
    // bubble cannot erase it and an absorb cannot bank it as meter.
    if (this.guarding && (!piercing || isMelee)) {
      const b = this.def.barrier;
      if (isMelee) this.meleeHitsTaken++;
      // A Shield burst supersedes the guard's own scaling rather than stacking
      // with it, so the figures in `SHIELD_TAKEN` are the whole story.
      /**
       * **A guard banks no meter, and that was tried as a fix and reverted.**
       *
       * The asymmetry is real and looks like a defect: the unguarded route
       * below pays `landed * satOnDamage` and this branch pays nothing, so
       * holding a guard *costs* saturation relative to standing there and
       * eating the shot. It reads worst on OBELISK, whose blurb is "turns
       * incoming fire into overdrive" and which — measured at EXTREME — guards
       * 20.3 % of every fight, the most on the roster, and comes out with the
       * *lowest* overdrive uptime of all eight (41.0 % against NULLTIDE's
       * 55.5 %).
       *
       * Charging the meter off `dmg` here, before mitigation, was measured. It
       * did what it was meant to — OBELISK -0.187 to -0.152 — and it also
       * **flattened the top rung of the difficulty ladder, EXTREME vs HARD from
       * +0.147 to -0.004**, which is the single most expensive property on this
       * project to hold. It handed PYRE (saturation gain x1.8) a free +0.058 on
       * the way past. `difficulty.test.ts` caught it; nothing else would have.
       *
       * So the asymmetry stays until someone can pay for it. The lesson is the
       * one in `docs/TESTING_PROTOCOL.md`: a rule's value is a property of the
       * AI it sits in, and a general rule aimed at one machine is charged to
       * all eight. See D97.
       */
      this.life -=
        dmg *
        (this.shieldActive
          ? this.shieldTaken(isMelee, piercing)
          : isMelee
            ? b.meleeGuardScale
            : b.guardScale);
      // Braced guard: blocking costs less gauge with your feet on something.
      // The barrier is the resource that decides how long you can hold a
      // position at all, so this is the dial that turns the deck from a place
      // you survive into a place you can be *held*.
      if (!this.barrierFree) {
        const drain = p.guardDamage * 0.5 * (this.grounded ? GROUNDED_GUARD_COST : 1);
        this.barrier = Math.max(0, this.barrier - drain);
      }
      this.barrierRegenTimer = this.def.gauges.barrierRegenDelay;
      this.hitstop = Math.max(this.hitstop, Math.floor(p.hitstop * 0.6));
      const kb = p.knockback * 0.4 * this.knockbackScale;
      const l = Math.hypot(p.vx, p.vy) || 1;
      this.vx += (p.vx / l) * kb;
      this.vy += (p.vy / l) * kb;
      if (this.barrier <= 0 && !this.barrierFree) {
        this.guarding = false;
        this.guardBreakStun = b.breakStun;
      }
      if (this.life <= 0) this.life = 0;
      return 'guarded';
    }

    if (isMelee) this.meleeHitsTaken++;

    // The unguarded route — and the only one a piercing lance can take, since
    // the branch above excludes `Pierce`. Reaching here with `guarding` true is
    // therefore exactly one case: a lance met by a held guard.
    let scale = 1;
    if (this.shieldActive) scale = this.shieldTaken(isMelee, piercing);
    else if (this.guarding) scale = this.def.barrier.pierceGuardScale;
    const landed = dmg * scale;
    this.life = Math.max(0, this.life - landed);
    this.hitstop = Math.max(this.hitstop, p.hitstop);
    this.hitstun = Math.max(this.hitstun, p.hitstun);
    // A brief window after every hit, so overlapping multi-hit sources cannot
    // chain-lock a mech with no chance to respond.
    this.invuln = Math.max(this.invuln, this.def.gauges.hitInvuln);
    // Being hit builds the overdrive meter: a losing pilot fights back toward it.
    // Off what actually landed, not what was thrown — otherwise a pilot inside a
    // Shield burst would charge their next one at full rate off damage they did
    // not take, which is a loop that feeds itself. Identical outside a burst.
    this.sat = Math.min(
      this.def.gauges.maxSaturation,
      this.sat + landed * this.def.gauges.satOnDamage,
    );
    this.attack = null;
    this.coAttack = null;
    this.guarding = false;
    this.meleeCount = 0;
    this.meleeChainQueued = false;
    this.act = ActState.Hitstun;

    const l = Math.hypot(p.vx, p.vy) || 1;
    const k = p.knockback * this.knockbackScale;
    this.vx += (p.vx / l) * k;
    this.vy += (p.vy / l) * k;
    return 'hit';
  }

  /**
   * Forces this machine out of whatever it is doing, from outside.
   *
   * Used by the melee repel, which has to stop the swing on the frame it is
   * thrown back. Setting `hitstun` alone would not: collisions resolve after
   * both combatants have stepped, so a lock-on sequence would run one more
   * frame and only notice the stun on the next tick.
   */
  interrupt(stun: number): void {
    this.hitstun = Math.max(this.hitstun, stun);
    this.attack = null;
    this.coAttack = null;
    this.act = ActState.Hitstun;
    if (this.meleeLock) this.endMeleeLock(false);
  }

  /** Called on the attacker when one of its hits connects. */
  confirmHit(): void {
    this.meleeHitConfirmed = true;
    this.meleeChainGrace = 26;
  }

  /** Current directional symbol, exposed for the debug overlay. */
  currentDir(input: InputFrame): Sym {
    return dirFrom(Math.sign(input.dx) * this.facing, Math.sign(input.dy));
  }
}
