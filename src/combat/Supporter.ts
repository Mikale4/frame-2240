import type { AttackDef } from './AttackData';
import type { SupporterDef } from '../mechs/MechDef';
import type { ProjectileSpawn, SimEvent } from './types';
import { wrapAngle } from '../core/MathUtil';

/**
 * The supporter drone.
 *
 * The 2005 reference gives the sub-weapon to a small companion machine rather
 * than to the chassis (`howto-en.html` element 2, "supporter - sub shoot"; the
 * state file `f-o.cns` is headed サポーター射撃, "supporter shooting"). The
 * chassis only gives the order — the shot leaves the drone.
 *
 * Design decisions, recorded here because the handoff asked for them explicitly:
 *
 * * **Not targetable, not damageable.** The reference draws a *charge* gauge on
 *   the supporter (element 4), never a life bar, and nothing in the supplied
 *   material describes destroying it. Making it invulnerable keeps it out of
 *   collision entirely and avoids a whole destruction/respawn subsystem for no
 *   evidenced gain.
 * * **Persistent.** The reference spawns its helper at `RoundState = 2` and
 *   keeps it for the round. This one is created with its owner and lives for the
 *   whole match.
 * * **Inherits nothing it should not.** It follows the owner's position, but it
 *   is not bound to it: it lags, overshoots slightly and catches up, so it reads
 *   as a machine flying in formation rather than a welded-on sprite.
 * * **Silent during frozen phases.** `MatchSim` feeds empty input during intro
 *   and KO, so no order can arrive; the drone keeps station regardless.
 *
 * Everything here is deterministic — no RNG, no wall-clock — so a replay and a
 * test see identical behaviour.
 */

export const enum SupState {
  /** Keeping station, ready for an order. */
  Idle = 0,
  /** Order accepted, drone is bracing and slewing onto the target. */
  Windup = 1,
  /** Holding the firing pose after the shot has left. */
  Recover = 2,
}

/** The subset of the owner the drone needs. Keeps this file free of Combatant. */
export interface SupporterOwner {
  x: number;
  y: number;
  facing: number;
  alive: boolean;
  id: number;
}

export class Supporter {
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  /** Direction the drone is pointing. */
  aim = 0;
  /** +1 / -1, derived from the aim, for sprite mirroring. */
  facing = 1;

  state: SupState = SupState.Idle;
  stateTicks = 0;
  cooldown = 0;

  /** The attack this drone was ordered to fire, held through the windup. */
  private pending: AttackDef | null = null;

  constructor(
    readonly def: SupporterDef,
    owner: SupporterOwner,
  ) {
    this.x = owner.x - owner.facing * def.followBack;
    this.y = owner.y + def.followDown;
    this.aim = owner.facing > 0 ? 0 : Math.PI;
    this.facing = owner.facing;
  }

  /** True when an order would be accepted right now. */
  get ready(): boolean {
    return this.state === SupState.Idle && this.cooldown <= 0;
  }

  /** 0..1, for the readiness ring drawn on the drone. */
  get readyFraction(): number {
    if (this.ready) return 1;
    const total = Math.max(1, this.def.cooldown);
    return this.state === SupState.Idle ? 1 - this.cooldown / total : 0;
  }

  /**
   * Accepts an order. Returns false when the drone is busy or cooling down, so
   * the caller can refuse to spend the charge and report it to the player.
   */
  order(a: AttackDef): boolean {
    if (!this.ready) return false;
    this.pending = a;
    this.state = SupState.Windup;
    this.stateTicks = 0;
    return true;
  }

  /** Drops any order in flight. Used on KO and on a dummy reset. */
  cancel(): void {
    this.pending = null;
    this.state = SupState.Idle;
    this.stateTicks = 0;
  }

  /**
   * Advances one tick.
   *
   * Called from `MatchSim` after both combatants have moved, so the drone chases
   * this tick's owner position rather than last tick's. `fire` is a callback so
   * the shot goes through the owner's own firing path and inherits its
   * saturation scaling — there is exactly one place that builds a projectile.
   */
  step(
    owner: SupporterOwner,
    target: SupporterOwner | null,
    spawns: ProjectileSpawn[],
    events: SimEvent[],
    fire: (a: AttackDef, x: number, y: number, angle: number, spawns: ProjectileSpawn[], events: SimEvent[]) => void,
  ): void {
    const d = this.def;

    if (this.cooldown > 0) this.cooldown--;

    // A downed owner cannot be assisted. Drop the order rather than firing it
    // from a wreck.
    if (!owner.alive && this.state !== SupState.Idle) this.cancel();

    this.follow(owner);
    this.slew(owner, target);

    switch (this.state) {
      case SupState.Windup:
        this.stateTicks++;
        if (this.stateTicks >= d.windup) {
          const a = this.pending;
          this.pending = null;
          if (a && owner.alive) {
            const mx = this.x + Math.cos(this.aim) * d.muzzleForward;
            const my = this.y + Math.sin(this.aim) * d.muzzleForward;
            fire(a, mx, my, this.aim, spawns, events);
          }
          this.state = SupState.Recover;
          this.stateTicks = 0;
        }
        break;

      case SupState.Recover:
        this.stateTicks++;
        if (this.stateTicks >= d.recover) {
          this.state = SupState.Idle;
          this.stateTicks = 0;
          this.cooldown = d.cooldown;
        }
        break;

      default:
        break;
    }
  }

  /**
   * Springs toward the rest offset behind and below the owner.
   *
   * The reference positioned its helper at a fixed offset scaled by the chassis
   * weight (`Parent,Pos X - 20 * Parent,fvar(11) * Parent,facing`); the spring
   * is this game's take on it, so the drone swings out through turns instead of
   * snapping to a fixed point.
   */
  private follow(owner: SupporterOwner): void {
    const d = this.def;
    const homeX = owner.x - owner.facing * d.followBack;
    const homeY = owner.y + d.followDown;

    this.vx += (homeX - this.x) * d.followAccel;
    this.vy += (homeY - this.y) * d.followAccel;
    this.vx *= d.followDamp;
    this.vy *= d.followDamp;

    const speed = Math.hypot(this.vx, this.vy);
    if (speed > d.maxSpeed) {
      const k = d.maxSpeed / speed;
      this.vx *= k;
      this.vy *= k;
    }

    this.x += this.vx;
    this.y += this.vy;
  }

  /** Turns toward the target at a fixed rate, so the drone visibly leads its shot. */
  private slew(owner: SupporterOwner, target: SupporterOwner | null): void {
    const want =
      target && target.alive
        ? Math.atan2(target.y - this.y, target.x - this.x)
        : owner.facing > 0
          ? 0
          : Math.PI;

    const delta = wrapAngle(want - this.aim);
    const rate = this.def.turretRate;
    this.aim = wrapAngle(this.aim + Math.max(-rate, Math.min(rate, delta)));
    this.facing = Math.cos(this.aim) >= 0 ? 1 : -1;
  }

  /** Puts the drone back on station, for a dummy respawn. */
  reset(owner: SupporterOwner): void {
    this.cancel();
    this.cooldown = 0;
    this.x = owner.x - owner.facing * this.def.followBack;
    this.y = owner.y + this.def.followDown;
    this.vx = 0;
    this.vy = 0;
    this.aim = owner.facing > 0 ? 0 : Math.PI;
    this.facing = owner.facing;
  }
}
