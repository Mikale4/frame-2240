/** Shared simulation vocabulary. Nothing here may import Phaser. */

import type { ProjFamilyId } from '../projectiles/families';

export const enum Btn {
  Main = 0,
  Heavy = 1,
  Sub = 2,
  Boost = 3,
  Barrier = 4,
  ModeCycle = 5,
  /**
   * Spends the saturation meter.
   *
   * This slot used to be `Lock`, a soft-lock toggle that stopped existing when
   * lock-on became permanent — the action was still bindable and did nothing.
   * Saturation needs a button of its own far more than a dead toggle needs a
   * slot, so it took this one rather than becoming a tenth button.
   */
  Saturation = 6,
  /** Toggles FlyingMode, as the reference's direction+A did. */
  Flight = 7,
  /**
   * Dedicated melee. The reference overloaded its main-gun button and switched
   * on proximity; a separate button is clearer to learn and to bind, and lets a
   * player commit to a swing deliberately rather than having one happen.
   */
  Melee = 8,
}
export const BTN_COUNT = 9;

/** One tick of player intent. `dx`/`dy` are in [-1, 1] (already 8-way snapped). */
export interface InputFrame {
  dx: number;
  dy: number;
  /** Bitmask of buttons currently held. */
  held: number;
  /** Bitmask of buttons that went down on this tick. */
  pressed: number;
  /** Optional free-aim vector (mouse / right stick). Null means use soft-lock. */
  aimX: number | null;
  aimY: number | null;
}

export function emptyInput(): InputFrame {
  return { dx: 0, dy: 0, held: 0, pressed: 0, aimX: null, aimY: null };
}

export function isHeld(f: InputFrame, b: Btn): boolean {
  return (f.held & (1 << b)) !== 0;
}

export function isPressed(f: InputFrame, b: Btn): boolean {
  return (f.pressed & (1 << b)) !== 0;
}

/**
 * The three weapons a hit can knock offline. See `ProjectileSpawn.disarms`.
 *
 * Deliberately only these three: they are the buttons a pilot presses to deal
 * damage. The lance, the spread and the salvo are command motions and the
 * sub-weapon belongs to the escort, so a disabled *gun* does not silence the
 * whole machine — it takes away the option the pilot reaches for most and leaves
 * them the ones that cost a motion to produce.
 */
export const enum WeaponSlot {
  Main = 0,
  Heavy = 1,
  Melee = 2,
}
export const WEAPON_SLOT_COUNT = 3;
export const WEAPON_SLOT_NAMES: readonly string[] = ['MAIN', 'HEAVY', 'MELEE'];

/** Saturation modes, mirroring the reference's three "concentration" types. */
export const enum SatMode {
  Shield = 0,
  Shoot = 1,
  Speed = 2,
}
export const SAT_MODE_COUNT = 3;
export const SAT_MODE_NAMES: readonly string[] = ['SHIELD', 'SHOOT', 'SPEED'];

/** High-level action the combatant is committed to. */
export const enum ActState {
  Free = 0,
  Attack = 1,
  Barrier = 2,
  Hitstun = 3,
  GuardHold = 4,
  Downed = 5,
  Dead = 6,
}

/** Phase inside an attack. Startup -> Active -> Recovery, as CLAUDE.md requires. */
export const enum Phase {
  Startup = 0,
  Active = 1,
  Recovery = 2,
}

export const enum Team {
  Player = 0,
  Enemy = 1,
}

/** How a projectile interacts with the defender's barrier. */
export const enum BarrierResponse {
  /** Absorbed and converted into saturation charge (standard shots). */
  Absorb = 0,
  /** Passes through a barrier entirely (the reference's melee "unblockable"). */
  Pierce = 1,
}

export interface ProjectileSpawn {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  guardDamage: number;
  /** Ticks before self-removal. */
  life: number;
  radius: number;
  ownerId: number;
  team: Team;
  kind: ProjKind;
  barrier: BarrierResponse;
  /** Hitstop applied to both sides on connect. */
  hitstop: number;
  hitstun: number;
  knockback: number;
  /** Homing turn rate in radians/tick (0 = straight). */
  homing: number;
  /**
   * How many ticks the round steers for before it commits to its heading.
   *
   * Omitted means "for as long as it lives", which is what every homing weapon
   * in the game did before this existed — so leaving it off is exactly the old
   * behaviour and this field is inert for all of them.
   *
   * A *window* rather than a duration is the difference between a round that
   * tracks you and a round that chases you forever. It lets a shot correct onto
   * a target and then become dodgeable, which is what makes auto-aim a threat
   * the opponent can still answer by moving late.
   */
  homingTicks?: number;
  /** Extra hits allowed before removal (beams/melee arcs pass through). */
  pierceCount: number;
  /**
   * A decoy's shot: it lands, it makes the right noise, and it does nothing.
   *
   * Deals no damage and — importantly — grants **no hit invulnerability**. A
   * harmless projectile that opened the usual i-frame window would have NULLTIDE
   * *shielding* the pilot it is deceiving from her own real fire, which inverts
   * the entire ability. Its only bite is `hitstun`, rolled per shot.
   */
  decoyShot?: boolean;
  /**
   * Detonates against incoming enemy fire as well as against mechs.
   *
   * Set on mines. A charge sitting in the open is a physical object, so a shot
   * that runs into it should take it out — and lose itself doing so. That makes
   * a minefield a genuine screen rather than only a tripwire, and gives the
   * opponent a way through it that costs them ammunition instead of hull.
   */
  intercepts?: boolean;
  /**
   * Ignores every damage reduction on the way in — chassis defence, drone
   * armour passives, guards, and Shield saturation alike.
   *
   * Set only by melee inside a desperate Speed burst. It exists because that
   * burst's promise is "your sword answers anything", and a sword that still
   * gave up 70 % to a Shield bubble would not be answering it.
   */
  trueDamage?: boolean;
  /** Status element inflicted on a clean hit. Omitted or 0 = none. */
  element?: number;
  /**
   * Chance, on a clean hit, of knocking one of the target's three weapons
   * offline. See `WeaponSlot` and `DISARM_TICKS`.
   *
   * Rolled by `MatchSim` at the moment of impact rather than at spawn, out of the
   * match generator, so it is replay-safe and so a round that misses never
   * consumes a roll. Only a clean hit can disarm: a guard or a barrier burst
   * stops it, which keeps the answer to it the same as the answer to everything
   * else.
   */
  disarms?: number;

  // ---- art and motion -----------------------------------------------------
  //
  // All optional, and all defaulted in `Projectile.reset`. `Combatant.fire`
  // always fills them in from the attack's family; they are optional because
  // `Projectile.asHit` and the combat tests construct spawns by hand to poke a
  // single behaviour, and should not have to restate a shot's appearance.

  /** Which projectile family draws this shot. Defaults to a plain pellet. */
  family?: ProjFamilyId;
  /**
   * Drawn size multiplier, on top of the family's own dimensions.
   *
   * Deliberately independent of `radius`. The reference draws a shot many times
   * larger than the 6x6 box that actually hits, and tying the two together — as
   * we used to — is why a heavy shell and a vulcan round differed only in size.
   */
  visualScale?: number;
  /** Per-tick speed multiplier. 1 coasts. */
  velMul?: number;
  /** Per-tick speed change along the heading, in pixels per tick squared. */
  accel?: number;
  /** Peak weave off the aim line, in radians, and its period in ticks. */
  swerve?: number;
  swervePeriod?: number;
  /** Absolute speed bounds, so no family can stall a shot or run it away. */
  speedMin?: number;
  speedMax?: number;
}

export const enum ProjKind {
  Bullet = 0,
  Heavy = 1,
  Beam = 2,
  Missile = 3,
  Melee = 4,
}

/** Events the simulation emits for the renderer/audio. Cleared each tick. */
export type SimEvent =
  // `family` rides on both of these so the muzzle flash and the impact burst can
  // be keyed to the weapon rather than to its broad kind — a flame thrower and a
  // railgun are both `Bullet`, and they must not light up the same way.
  | { t: 'fire'; x: number; y: number; angle: number; kind: ProjKind; ownerId: number; family?: ProjFamilyId }
  | { t: 'hit'; x: number; y: number; damage: number; ownerId: number; victimId: number; kind: ProjKind; family?: ProjFamilyId }
  | { t: 'guard'; x: number; y: number; victimId: number }
  | { t: 'absorb'; x: number; y: number; victimId: number; charge: number }
  /** AEGIS's shell failing: the bubble is gone until it rebuilds. */
  | { t: 'domeBreak'; x: number; y: number; id: number }
  /** SIGHTLINE's breaker pulse: a melee chain broken and both machines shoved apart. */
  | { t: 'breaker'; x: number; y: number; id: number }
  | { t: 'barrier'; x: number; y: number; id: number }
  | { t: 'guardBreak'; x: number; y: number; id: number }
  /**
   * A barrier burst threw a melee opener back at whoever swung it. `id` is the
   * defender, `attackerId` the pilot now stunned for it.
   */
  | { t: 'meleeRepel'; x: number; y: number; id: number; attackerId: number }
  | { t: 'dash'; x: number; y: number; angle: number; id: number }
  | { t: 'melee'; x: number; y: number; angle: number; id: number; stage: number }
  /**
   * The supporter drone is winding up a volley. `auto` distinguishes the drone
   * choosing its own moment — frequent, and deliberately understated — from the
   * pilot demanding one with the salvo motion, which is announced.
   */
  | { t: 'assist'; x: number; y: number; angle: number; ownerId: number; auto?: boolean }
  /** The assist was requested but unavailable — no charge, or drone busy. */
  | { t: 'assistDenied'; x: number; y: number; ownerId: number }
  /** The drone was launched out of the chassis. */
  | { t: 'droneDeploy'; x: number; y: number; ownerId: number }
  /** The drone was ordered back into the chassis. */
  | { t: 'droneRecall'; x: number; y: number; ownerId: number }
  /** A shot connected with a drone rather than with a machine. */
  | { t: 'droneHit'; x: number; y: number; damage: number; ownerId: number }
  /** A drone was shot down. It does not come back this match. */
  | { t: 'droneDown'; x: number; y: number; ownerId: number }
  /** A status element took hold on a machine. */
  | { t: 'status'; x: number; y: number; victimId: number; element: number }
  | { t: 'explode'; x: number; y: number; big: boolean }
  /** `partial` marks a burst opened on a part-charged meter. */
  | { t: 'saturation'; id: number; mode: SatMode; partial?: boolean }
  /**
   * A saturation burst ran dry, leaving its pilot helpless. `overheat` marks the
   * worse ending an early burst earns: twice the stun, plus damage.
   */
  | { t: 'satBurnout'; x: number; y: number; id: number; overheat?: boolean }
  | { t: 'modeCycle'; id: number; mode: SatMode }
  /** A weapon knocked offline. `slot` is a `WeaponSlot`. */
  | { t: 'disarm'; x: number; y: number; victimId: number; slot: number }
  /** A sniper stance opened or closed. See `SniperModeDef`. */
  | { t: 'sniper'; x: number; y: number; id: number; on: boolean }
  | { t: 'ko'; id: number }
  | { t: 'takeoff'; x: number; y: number; id: number }
  | { t: 'land'; x: number; y: number; id: number };

export const enum MatchPhase {
  Intro = 0,
  Fight = 1,
  KO = 2,
  Over = 3,
}
