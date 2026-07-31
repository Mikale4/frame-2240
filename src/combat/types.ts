/** Shared simulation vocabulary. Nothing here may import Phaser. */

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
  /** Extra hits allowed before removal (beams/melee arcs pass through). */
  pierceCount: number;
  /** Status element inflicted on a clean hit. Omitted or 0 = none. */
  element?: number;
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
  | { t: 'fire'; x: number; y: number; angle: number; kind: ProjKind; ownerId: number }
  | { t: 'hit'; x: number; y: number; damage: number; ownerId: number; victimId: number; kind: ProjKind }
  | { t: 'guard'; x: number; y: number; victimId: number }
  | { t: 'absorb'; x: number; y: number; victimId: number; charge: number }
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
  | { t: 'ko'; id: number }
  | { t: 'takeoff'; x: number; y: number; id: number }
  | { t: 'land'; x: number; y: number; id: number };

export const enum MatchPhase {
  Intro = 0,
  Fight = 1,
  KO = 2,
  Over = 3,
}
