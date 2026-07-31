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
 * * **A deployed asset, not a fire button.** The assist button used to mean
 *   "shoot now". It now means "launch" or "bring it home". Once it is on station
 *   the drone picks its own moments to fire, which frees the button from being a
 *   third weapon and turns it into a standing decision: is the drone worth more
 *   in the air than it is safe in the backpack?
 * * **Damageable, and destroyed for good.** This reverses an earlier decision.
 *   The reference draws only a charge gauge on its supporter and never a life
 *   bar, so the first pass made the drone invulnerable — but with a passive and
 *   free auto-fire attached to it, an invulnerable drone is a strictly-better
 *   button with no counterplay. Its hit points are a fraction of a chassis's and
 *   destruction is permanent for the match, so hunting one is a real, and
 *   rewarding, thing to spend attention on.
 * * **Stowing repairs it.** Recall is otherwise a pure loss of tempo. Repairing
 *   only while docked makes the toggle a rhythm — fly it while you are winning
 *   the exchange, pull it in while you are eating one.
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

/**
 * Where the drone is, as opposed to `SupState`, which is what it is doing with
 * its gun. Two small machines rather than one combined one: the firing cycle and
 * the deployment cycle run at completely different timescales and neither should
 * have to enumerate the other's states.
 */
export const enum DroneMode {
  /** Docked in the chassis. Invisible, untouchable, repairing, no passive. */
  Stowed = 0,
  /** Flying out to station. Already exposed, not yet contributing. */
  Deploying = 1,
  /** On station: passive live, firing on its own initiative. */
  Active = 2,
  /** Flying home. Still exposed, passive already gone. */
  Recalling = 3,
  /** Shot down. Gone for the rest of the match. */
  Destroyed = 4,
}

/** The subset of the owner the drone needs. Keeps this file free of Combatant. */
export interface SupporterOwner {
  x: number;
  y: number;
  facing: number;
  alive: boolean;
  id: number;
}

/**
 * Asks the owner for a volley.
 *
 * Returns the attack to fire — having already spent its charge — or null when
 * the machine cannot pay. The charge economy stays on the chassis, where the
 * HUD and the command inputs already read it; the drone only asks.
 */
export type VolleyRequest = () => AttackDef | null;

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

  /** Where the drone is in its deployment cycle. */
  mode: DroneMode = DroneMode.Active;
  /** Ticks spent in the current `mode`, for the deploy/recall transitions. */
  modeTicks = 0;
  life: number;

  /** The attack this drone was ordered to fire, held through the windup. */
  private pending: AttackDef | null = null;

  constructor(
    readonly def: SupporterDef,
    owner: SupporterOwner,
  ) {
    this.life = def.maxLife;
    this.x = owner.x - owner.facing * def.followBack;
    this.y = owner.y + def.followDown;
    this.aim = owner.facing > 0 ? 0 : Math.PI;
    this.facing = owner.facing;
  }

  // ------------------------------------------------------------------ queries

  /** Shot down, permanently. */
  get destroyed(): boolean {
    return this.mode === DroneMode.Destroyed;
  }

  /** Out of the chassis, and therefore something the opponent can shoot. */
  get hittable(): boolean {
    return (
      this.mode === DroneMode.Deploying ||
      this.mode === DroneMode.Active ||
      this.mode === DroneMode.Recalling
    );
  }

  /** Drawn this tick. Same set as `hittable` — if it can be shot, it is visible. */
  get visible(): boolean {
    return this.hittable;
  }

  /**
   * On station: the passive is live and the drone will fire on its own.
   *
   * Note this is false through the whole launch, which is what makes deploying
   * mid-fight a commitment rather than a free instant.
   */
  get onStation(): boolean {
    return this.mode === DroneMode.Active;
  }

  /** True when the assist button would recall rather than deploy. */
  get outbound(): boolean {
    return this.mode === DroneMode.Deploying || this.mode === DroneMode.Active;
  }

  /** 0..1 hit points, for the bar drawn on the drone. */
  get lifeFraction(): number {
    return Math.max(0, Math.min(1, this.life / Math.max(1, this.def.maxLife)));
  }

  /** True when a firing order would be accepted right now. */
  get ready(): boolean {
    return this.onStation && this.state === SupState.Idle && this.cooldown <= 0;
  }

  /** 0..1, for the readiness bar drawn on the drone. */
  get readyFraction(): number {
    if (this.ready) return 1;
    if (!this.onStation) return 0;
    const total = Math.max(1, this.def.cooldown);
    return this.state === SupState.Idle ? 1 - this.cooldown / total : 0;
  }

  // -------------------------------------------------------------- deployment

  /**
   * Toggles the drone between the backpack and its station.
   *
   * Returns what it did, so the caller can pick the right event and sound. A
   * destroyed drone answers 'none' — the button is dead for the rest of the
   * match, and that has to be audible rather than silent.
   */
  toggle(): 'deploy' | 'recall' | 'none' {
    if (this.destroyed) return 'none';
    if (this.outbound) {
      this.mode = DroneMode.Recalling;
      this.modeTicks = 0;
      this.cancel();
      return 'recall';
    }
    this.mode = DroneMode.Deploying;
    this.modeTicks = 0;
    return 'deploy';
  }

  /**
   * Applies a hit. Returns 'down' on the blow that destroys it.
   *
   * Damage is scaled by the drone's own `defenceMul` rather than its owner's:
   * an armoured escort on a paper chassis is a deliberate design axis, and
   * borrowing the mech's defence would have collapsed it.
   */
  takeHit(damage: number): 'ignored' | 'hit' | 'down' {
    if (!this.hittable) return 'ignored';
    this.life -= damage * this.def.defenceMul;
    if (this.life > 0) return 'hit';

    this.life = 0;
    this.mode = DroneMode.Destroyed;
    this.modeTicks = 0;
    this.cancel();
    this.vx = 0;
    this.vy = 0;
    return 'down';
  }

  /** Accepts a firing order. False when the drone is busy, stowed or gone. */
  order(a: AttackDef): boolean {
    if (!this.ready) return false;
    this.pending = a;
    this.state = SupState.Windup;
    this.stateTicks = 0;
    return true;
  }

  /** Drops any order in flight. Used on KO, recall and a dummy reset. */
  cancel(): void {
    this.pending = null;
    this.state = SupState.Idle;
    this.stateTicks = 0;
  }

  // ---------------------------------------------------------------- stepping

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
    requestVolley?: VolleyRequest,
  ): void {
    const d = this.def;

    if (this.destroyed) return;

    if (this.cooldown > 0) this.cooldown--;

    // A downed owner cannot be assisted, and its drone powers down with it
    // rather than continuing to fly formation on a wreck.
    if (!owner.alive) {
      if (this.mode !== DroneMode.Stowed) {
        this.mode = DroneMode.Stowed;
        this.modeTicks = 0;
      }
      this.cancel();
    }

    this.stepMode(owner);
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
        // Idle and on station: the drone picks its own moment. Gated on the
        // owner's charges — `requestVolley` spends one or refuses — so
        // auto-fire is a use of the same economy the player already watches,
        // not a second free weapon bolted alongside it.
        if (this.ready && requestVolley && this.wantsToFire(owner, target)) {
          const a = requestVolley();
          if (a) this.order(a);
        }
        break;
    }
  }

  /** True when there is something worth spending a charge on. */
  private wantsToFire(owner: SupporterOwner, target: SupporterOwner | null): boolean {
    if (!owner.alive || !target || !target.alive) return false;
    return Math.hypot(target.x - this.x, target.y - this.y) <= this.def.fireRange;
  }

  /** Advances the deploy/recall/stow cycle. */
  private stepMode(owner: SupporterOwner): void {
    const d = this.def;
    this.modeTicks++;

    switch (this.mode) {
      case DroneMode.Deploying:
        if (this.modeTicks >= d.deployTicks) {
          this.mode = DroneMode.Active;
          this.modeTicks = 0;
        }
        break;

      case DroneMode.Recalling:
        if (this.modeTicks >= d.recallTicks) {
          this.mode = DroneMode.Stowed;
          this.modeTicks = 0;
          // Snap onto the dock: it is invisible from here, and leaving stale
          // velocity would fling it across the arena on the next deploy.
          const dock = this.dock(owner);
          this.x = dock.x;
          this.y = dock.y;
          this.vx = 0;
          this.vy = 0;
        }
        break;

      case DroneMode.Stowed:
        // Repairs only in the backpack, and never back from destroyed.
        if (this.life < d.maxLife) this.life = Math.min(d.maxLife, this.life + d.repair);
        break;

      default:
        break;
    }
  }

  /** The docking point inside the chassis, where a stowed drone rests. */
  private dock(owner: SupporterOwner): { x: number; y: number } {
    return { x: owner.x - owner.facing * 12, y: owner.y - 4 };
  }

  /**
   * Springs toward wherever the drone currently belongs.
   *
   * The reference positioned its helper at a fixed offset scaled by the chassis
   * weight (`Parent,Pos X - 20 * Parent,fvar(11) * Parent,facing`); the spring
   * is this game's take on it, so the drone swings out through turns instead of
   * snapping to a fixed point. The same spring flies it out on a deploy and home
   * on a recall — only the target moves.
   */
  private follow(owner: SupporterOwner): void {
    const d = this.def;
    const home =
      this.mode === DroneMode.Recalling || this.mode === DroneMode.Stowed
        ? this.dock(owner)
        : { x: owner.x - owner.facing * d.followBack, y: owner.y + d.followDown };

    // Launch and recall are urgent: pull harder than station-keeping so the trip
    // actually finishes inside the authored window rather than easing forever.
    const transit = this.mode === DroneMode.Deploying || this.mode === DroneMode.Recalling;
    const accel = transit ? d.followAccel * 2.4 : d.followAccel;
    const cap = transit ? d.maxSpeed * 1.5 : d.maxSpeed;

    this.vx += (home.x - this.x) * accel;
    this.vy += (home.y - this.y) * accel;
    this.vx *= d.followDamp;
    this.vy *= d.followDamp;

    const speed = Math.hypot(this.vx, this.vy);
    if (speed > cap) {
      const k = cap / speed;
      this.vx *= k;
      this.vy *= k;
    }

    this.x += this.vx;
    this.y += this.vy;
  }

  /** Turns toward the target at a fixed rate, so the drone visibly leads its shot. */
  private slew(owner: SupporterOwner, target: SupporterOwner | null): void {
    const want =
      target && target.alive && this.onStation
        ? Math.atan2(target.y - this.y, target.x - this.x)
        : owner.facing > 0
          ? 0
          : Math.PI;

    const delta = wrapAngle(want - this.aim);
    const rate = this.def.turretRate;
    this.aim = wrapAngle(this.aim + Math.max(-rate, Math.min(rate, delta)));
    this.facing = Math.cos(this.aim) >= 0 ? 1 : -1;
  }

  /**
   * Puts the drone back on station, for a dummy respawn.
   *
   * Restores its hit points and undoes destruction: a training dummy that could
   * permanently lose its drone would stop being a dummy after one good run.
   */
  reset(owner: SupporterOwner): void {
    this.cancel();
    this.cooldown = 0;
    this.mode = DroneMode.Active;
    this.modeTicks = 0;
    this.life = this.def.maxLife;
    this.x = owner.x - owner.facing * this.def.followBack;
    this.y = owner.y + this.def.followDown;
    this.vx = 0;
    this.vy = 0;
    this.aim = owner.facing > 0 ? 0 : Math.PI;
    this.facing = owner.facing;
  }
}
