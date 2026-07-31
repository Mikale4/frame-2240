import type { AttackDef } from './AttackData';
import type { SupporterDef } from '../mechs/MechDef';
import type { ProjectileSpawn, SimEvent } from './types';
import { wrapAngle } from '../core/MathUtil';
import { playstyleFor, type DroneDoctrine } from '../ai/Playstyles';

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
 * * **Always deployed.** There is no launch/recall button any more. The toggle
 *   was a standing decision nobody was making: measured, drones were dying with
 *   a 10th-percentile life of *two seconds* and a median of eight, so the
 *   "should it be out?" question answered itself in the opening exchange and the
 *   button spent the rest of the match dead. The drone is now a permanent part
 *   of the machine, and keeping it alive is the skill instead.
 * * **It flies itself.** Because it can no longer be pulled to safety, it has to
 *   find safety on its own — see `station()`. It keeps formation, drifts toward
 *   a firing position when that is safe, and breaks away from incoming fire.
 * * **Damageable, and rebuilt exactly once.** The reference draws only a charge
 *   gauge on its supporter and never a life bar, so the first pass made the
 *   drone invulnerable — but with a passive and free auto-fire attached, an
 *   invulnerable drone is a strictly-better button with no counterplay. Shooting
 *   one down now retires it into the chassis, where it rebuilds slowly and
 *   relaunches itself. **That happens once per match.** The second kill is
 *   permanent. One rebuild keeps the subsystem present in a fight it used to
 *   vanish from in the first five seconds; the hard cap keeps hunting it worth
 *   the attention, because the second kill really does end it.
 * * **Inherits nothing it should not.** It follows the owner's position, but it
 *   is not bound to it: it lags, overshoots slightly and catches up, so it reads
 *   as a machine flying in formation rather than a welded-on sprite.
 * * **Silent during frozen phases.** `MatchSim` feeds empty input during intro
 *   and KO, so no order can arrive; the drone keeps station regardless.
 *
 * Everything here is deterministic — no RNG, no wall-clock — so a replay and a
 * test see identical behaviour. That extends to the evasion: it reads the live
 * projectile list and does arithmetic on it, and never rolls a die.
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
  /** Docked in the chassis. Invisible, untouchable, no passive. */
  Stowed = 0,
  /** Flying out to station. Already exposed, not yet contributing. */
  Deploying = 1,
  /** On station: passive live, firing on its own initiative. */
  Active = 2,
  /** Flying home. Still exposed, passive already gone. */
  Recalling = 3,
  /** Shot down for good. No passive, no gun, for the rest of the match. */
  Destroyed = 4,
  /**
   * Shot down the first time: limping home and reassembling itself.
   *
   * Visible, so the player can watch the repair they are waiting on, but **not**
   * hittable — it is already out of the fight and shooting a wreck should not
   * deny the rebuild. Relaunches itself at full hit points.
   */
  Rebuilding = 5,
}

/**
 * Ticks to reassemble a downed drone, and then how long the relaunch takes.
 *
 * Fifteen seconds of a match that now runs 180. Long enough that losing the
 * drone is a real and felt penalty — a quarter of a minute without your passive
 * — and short enough that the subsystem comes back while the fight it belongs to
 * is still going. A per-tick repair rate was the obvious alternative and is
 * worse: hit points were just scaled 3.5×, so any rate tuned against the old
 * pools would now take most of the match.
 */
export const REBUILD_TICKS = 900;

/** How many times a drone may come back. One, then the next kill is final. */
export const MAX_REBUILDS = 1;

// ---- movement AI tuning ----------------------------------------------------
// All in logical pixels, all displacements from the authored formation point.

/** How far a shot is noticed from. Roughly a third of the arena's height. */
const THREAT_RADIUS = 300;
/** How hard one closing shot at point-blank pushes the drone out of its lane. */
const EVADE_STRENGTH = 150;
/**
 * Forward lean toward a target the drone can actually reach.
 *
 * Deliberately well under the smallest `followBack` on the roster. The first cut
 * used 46 against a 64px follow-back and the drone ended up 18px behind its
 * owner — flying through the chassis sprite rather than escorting it.
 * `MIN_OWNER_GAP` is the hard floor; this is the number that keeps it from
 * having to do any work.
 */
const SUPPORT_FORWARD = 26;
/** Most it will climb or drop to get level with what it is shooting at. */
const SUPPORT_RISE = 40;
/**
 * Closest the drone will station itself to its owner's centre.
 *
 * Applies after every other pull, evasion included: dodging a shot by hiding
 * inside your own mech is not a dodge, it is a rendering bug.
 */
const MIN_OWNER_GAP = 46;
/**
 * Furthest the drone will stray from formation, however loud the arithmetic
 * above gets. This is the difference between an escort and a second fighter:
 * without it, a busy screen sends the drone across the arena and it stops
 * reading as part of its owner's machine.
 */
const LEASH = 190;

/** What the drone needs to know about one projectile in order to dodge it. */
export interface DroneThreat {
  x: number;
  y: number;
  vx: number;
  vy: number;
  team: number;
}

/**
 * How the drone's standing orders bend the numbers above.
 *
 * The doctrine comes from the pilot's playstyle (`ai/Playstyles.ts`), because a
 * permanently-deployed escort that flies itself is otherwise the one part of the
 * machine with no opinion. `forward` and `leash` scale the support lean;
 * `caution` scales the evasion; `offAxis` pushes the drone away from the line
 * between its owner and the target instead of along it.
 */
interface DoctrineTuning {
  forward: number;
  leash: number;
  caution: number;
  offAxis: number;
}

const DOCTRINES: Record<DroneDoctrine, DoctrineTuning> = {
  /** Balanced. The baseline every other row is a deviation from. */
  escort: { forward: 1, leash: 1, caution: 1, offAxis: 0 },
  /**
   * Get in front and stay there.
   *
   * Leans a long way forward on a long leash and dodges *less*, which looks like
   * a mistake and is the entire point: every shot spent on the drone is one not
   * spent on a pilot who needs to hold still. VESPER cannot line up a shot while
   * being rushed, so his escort goes and does the being-rushed for him.
   */
  screen: { forward: 2.6, leash: 1.9, caution: 0.45, offAxis: 0 },
  /** Work an angle. Off the owner-to-target line, and hard to pin. */
  flank: { forward: 1.5, leash: 1.5, caution: 1.35, offAxis: 78 },
  /** Stay tight, stay alive, keep the passive up. */
  shadow: { forward: 0.35, leash: 0.6, caution: 1.6, offAxis: 0 },
};

/** The subset of the owner the drone needs. Keeps this file free of Combatant. */
export interface SupporterOwner {
  x: number;
  y: number;
  facing: number;
  alive: boolean;
  id: number;
  team: number;
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
  /** Rebuilds remaining. Decremented when one is spent, never restored mid-match. */
  rebuildsLeft = MAX_REBUILDS;
  /** Copied from the owner at construction, so threat filtering needs no lookup. */
  readonly team: number;
  /**
   * Standing orders, taken from the pilot's playstyle.
   *
   * Resolved once at construction rather than looked up per tick: it cannot
   * change during a match, and a drone that re-derived its doctrine sixty times
   * a second would be paying for a question with one answer.
   */
  doctrine: DroneDoctrine = 'escort';

  /** The attack this drone was ordered to fire, held through the windup. */
  private pending: AttackDef | null = null;

  constructor(
    readonly def: SupporterDef,
    owner: SupporterOwner,
    /** Owning chassis id, used only to look up the pilot's drone doctrine. */
    mechId?: string,
  ) {
    this.life = def.maxLife;
    this.team = owner.team;
    this.doctrine = playstyleFor(mechId).droneDoctrine;
    this.x = owner.x - owner.facing * def.followBack;
    this.y = owner.y + def.followDown;
    this.aim = owner.facing > 0 ? 0 : Math.PI;
    this.facing = owner.facing;
  }

  // ------------------------------------------------------------------ queries

  /** Shot down, permanently. Rebuilding is *not* this. */
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

  /**
   * Drawn this tick.
   *
   * A superset of `hittable`: a rebuilding drone is on screen, limping alongside
   * its owner with its bar refilling, but cannot be shot again. Watching the
   * repair is most of what makes the wait readable rather than just a missing
   * passive.
   */
  get visible(): boolean {
    return this.hittable || this.mode === DroneMode.Rebuilding;
  }

  /** Reassembling itself after its first death. */
  get rebuilding(): boolean {
    return this.mode === DroneMode.Rebuilding;
  }

  /** 0..1 through the rebuild, for the progress ring drawn while it waits. */
  get rebuildFraction(): number {
    if (this.mode !== DroneMode.Rebuilding) return 0;
    return Math.max(0, Math.min(1, this.modeTicks / REBUILD_TICKS));
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
   * Applies a hit.
   *
   * Returns 'down' on the blow that retires it into a rebuild, and 'destroyed'
   * on the one that ends it for the match. Callers that only care that it fell
   * out of the sky can test for either; the two are distinguished because they
   * deserve different cues — one is a setback, the other is final.
   *
   * Damage is scaled by the drone's own `defenceMul` rather than its owner's:
   * an armoured escort on a paper chassis is a deliberate design axis, and
   * borrowing the mech's defence would have collapsed it.
   */
  takeHit(damage: number): 'ignored' | 'hit' | 'down' | 'destroyed' {
    if (!this.hittable) return 'ignored';
    this.life -= damage * this.def.defenceMul;
    if (this.life > 0) return 'hit';

    this.life = 0;
    this.modeTicks = 0;
    this.cancel();
    this.vx = 0;
    this.vy = 0;
    if (this.rebuildsLeft > 0) {
      this.rebuildsLeft--;
      this.mode = DroneMode.Rebuilding;
      return 'down';
    }
    this.mode = DroneMode.Destroyed;
    return 'destroyed';
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
    threats: DroneThreat[] = [],
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
    this.follow(owner, target, threats);
    this.slew(owner, target);

    // A rebuilding drone is a passenger: no gun, no passive, no orders.
    if (this.mode === DroneMode.Rebuilding) return;

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

      case DroneMode.Rebuilding:
        // Life climbs linearly across the whole rebuild rather than by a
        // per-tick rate, so the bar is a progress meter for the wait and the
        // wait is the same length whatever the chassis's drone happens to have.
        this.life = d.maxLife * this.rebuildFraction;
        if (this.modeTicks >= REBUILD_TICKS) {
          this.life = d.maxLife;
          // Relaunches itself. There is no button to press any more, and a drone
          // that finished rebuilding and then sat in the backpack would be a
          // worse outcome than the permanent death this replaced.
          this.mode = DroneMode.Deploying;
          this.modeTicks = 0;
        }
        break;

      case DroneMode.Stowed:
        // Only reachable now with a downed owner; the drone powers down with the
        // wreck rather than flying formation on it.
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
   * Where the drone wants to be this tick — the whole of its movement AI.
   *
   * Three pulls, summed, then leashed to the owner:
   *
   * 1. **Formation.** The authored rest offset, behind and below the chassis.
   *    This is the anchor; everything else is a displacement from it.
   * 2. **Support.** While it is healthy and the enemy is inside `fireRange`, it
   *    edges toward its own firing line — a little further forward, and level
   *    with the target rather than tucked under its owner's belly. It has a gun
   *    and a range limit, so hovering behind a wall of its owner's chassis makes
   *    it decorative.
   * 3. **Evasion.** Every hostile projectile inside `THREAT_RADIUS` pushes it
   *    away, weighted by how close it is and by whether the shot is actually
   *    coming at the drone rather than merely passing nearby. This is the whole
   *    reason it can survive without a recall button.
   *
   * The result is clamped to `LEASH` of the formation point, which is what makes
   * it read as an escort keeping up with its mech rather than a second fighter
   * wandering off to have its own war. Deterministic throughout.
   */
  private station(owner: SupporterOwner, target: SupporterOwner | null, threats: DroneThreat[]): { x: number; y: number } {
    const d = this.def;
    const doc = DOCTRINES[this.doctrine];
    const base = { x: owner.x - owner.facing * d.followBack, y: owner.y + d.followDown };

    let ox = 0;
    let oy = 0;

    // ---- support --------------------------------------------------------
    if (this.onStation && target && target.alive) {
      const dist = Math.hypot(target.x - this.x, target.y - this.y);
      // Only when it can actually shoot, and only while it is healthy enough to
      // afford the exposure. A drone on its last few hit points falls back into
      // formation and stops volunteering — a screening doctrine included, since
      // a dead screen screens nothing.
      if (dist <= d.fireRange && this.lifeFraction > 0.4) {
        const dir = Math.sign(target.x - owner.x) || owner.facing;
        ox += dir * SUPPORT_FORWARD * doc.forward;
        // Rise or fall toward the target's line, but only part of the way: fully
        // matching its height puts the drone directly in the firing lane.
        oy += Math.max(-SUPPORT_RISE, Math.min(SUPPORT_RISE, (target.y - base.y) * 0.35));
        // A flanking drone deliberately leaves that lane, so it is not shooting
        // from the same angle its owner is — and is not in the way of it.
        if (doc.offAxis !== 0) {
          oy += target.y >= owner.y ? -doc.offAxis : doc.offAxis;
        }
      }
    }

    // ---- evasion --------------------------------------------------------
    if (this.hittable) {
      for (const t of threats) {
        if (t.team === this.team) continue;
        const dx = this.x - t.x;
        const dy = this.y - t.y;
        const dist = Math.hypot(dx, dy);
        if (dist > THREAT_RADIUS || dist < 0.001) continue;

        // Is it heading at us? A shot already past the drone is not a threat, and
        // treating it as one makes the drone flee its own safe space.
        //
        // `(dx, dy)` points from the shot to the drone, so a shot closing on the
        // drone has its velocity pointing the same way and the dot product is
        // positive. Getting this sign backwards makes the drone dodge everything
        // that has already missed and stand still for everything that has not.
        const speed = Math.hypot(t.vx, t.vy) || 1;
        const closing = (t.vx * dx + t.vy * dy) / (dist * speed);
        if (closing <= 0.1) continue;

        // Push perpendicular to the shot rather than directly away from it:
        // running from a projectile that is faster than you is how you get hit,
        // and stepping out of its lane is how you do not.
        const nx = -t.vy / speed;
        const ny = t.vx / speed;
        const side = nx * dx + ny * dy >= 0 ? 1 : -1;
        const weight = (1 - dist / THREAT_RADIUS) * closing;
        ox += nx * side * EVADE_STRENGTH * doc.caution * weight;
        oy += ny * side * EVADE_STRENGTH * doc.caution * weight;
      }
    }

    // ---- leash ----------------------------------------------------------
    const leash = LEASH * doc.leash;
    const mag = Math.hypot(ox, oy);
    if (mag > leash) {
      ox = (ox / mag) * leash;
      oy = (oy / mag) * leash;
    }

    // ---- keep out of the chassis ----------------------------------------
    let px = base.x + ox;
    let py = base.y + oy;
    const gx = px - owner.x;
    const gy = py - owner.y;
    const gap = Math.hypot(gx, gy);
    if (gap < MIN_OWNER_GAP) {
      // Straight back along the owner's facing when the two coincide exactly,
      // which is otherwise a divide by zero.
      const ux = gap > 0.001 ? gx / gap : -owner.facing;
      const uy = gap > 0.001 ? gy / gap : 0;
      px = owner.x + ux * MIN_OWNER_GAP;
      py = owner.y + uy * MIN_OWNER_GAP;
    }
    return { x: px, y: py };
  }

  /**
   * Springs toward wherever the drone currently belongs.
   *
   * The reference positioned its helper at a fixed offset scaled by the chassis
   * weight (`Parent,Pos X - 20 * Parent,fvar(11) * Parent,facing`); the spring
   * is this game's take on it, so the drone swings out through turns instead of
   * snapping to a fixed point. The same spring flies it out on a deploy, home on
   * a rebuild, and around incoming fire — only the target point moves.
   */
  private follow(owner: SupporterOwner, target: SupporterOwner | null, threats: DroneThreat[]): void {
    const d = this.def;
    const home =
      this.mode === DroneMode.Recalling ||
      this.mode === DroneMode.Stowed ||
      this.mode === DroneMode.Rebuilding
        ? this.dock(owner)
        : this.station(owner, target, threats);

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
   * Restores its hit points, undoes destruction and hands back the rebuild: a
   * training dummy that could permanently lose its drone would stop being a
   * dummy after one good run.
   */
  reset(owner: SupporterOwner): void {
    this.cancel();
    this.cooldown = 0;
    this.mode = DroneMode.Active;
    this.modeTicks = 0;
    this.life = this.def.maxLife;
    this.rebuildsLeft = MAX_REBUILDS;
    this.x = owner.x - owner.facing * this.def.followBack;
    this.y = owner.y + this.def.followDown;
    this.vx = 0;
    this.vy = 0;
    this.aim = owner.facing > 0 ? 0 : Math.PI;
    this.facing = owner.facing;
  }
}
