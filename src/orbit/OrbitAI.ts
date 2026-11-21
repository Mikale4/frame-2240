import { Btn, SatMode, type InputFrame } from '../combat/types';
import { Difficulty } from '../core/Session';
import { Rng } from '../core/Rng';
import {
  ARENA,
  OBSTACLES,
  OrbitAct,
  OrbitSim,
  PX,
  hurtRadius,
  type Box,
  type OrbitFighter,
  type OrbitProjectile,
  type V3,
} from './OrbitSim';

/**
 * The FREE ORBIT rival.
 *
 * Reads the same things a player can see — positions, the shots in the air,
 * the gauges the HUD draws, whether the other machine is mid-swing or
 * recovering — and answers with an ordinary `InputFrame`, so it plays by
 * exactly the rules the player does.
 *
 * Four tiers that play differently, the main game's principle: the lower tiers
 * react later and choose worse, and **EXTREME alone** punishes recoveries,
 * bursts the opening blow of a sword sequence to repel it, bursts out of a
 * combo, keeps line of sight around the gantry, and picks its saturation mode
 * from its own machine.
 */
export interface OrbitAiProfile {
  /** Ticks before a new threat is acted on. */
  reaction: number;
  /** Chance to dash away from a shot that will hit. */
  dodge: number;
  /** Chance to raise the guard against a shot or a swing. */
  guard: number;
  /** Chance per decision to keep the main gun going. */
  fire: number;
  /** Chance per tick, in reach, to open a sword sequence. */
  melee: number;
  /** Chance to fire the heavy when the reactor can afford it. */
  heavy: number;
  /** Chance per decision to fly mobile form across a long gap. */
  transform: number;
  /** Bursts out of a combo, after the first hit. */
  burstEscape: number;
  /** EXTREME: swing into a machine that is recovering. */
  punish: boolean;
  /** EXTREME: burst the first blow of a sequence to repel it. */
  repelRead: boolean;
  /** EXTREME: move for line of sight rather than shoot the gantry. */
  sightIq: boolean;
  /** EXTREME: choose a saturation mode for this machine. */
  satIq: boolean;
}

export const ORBIT_AI: Record<Difficulty, OrbitAiProfile> = {
  [Difficulty.Easy]: {
    reaction: 26, dodge: 0.12, guard: 0.15, fire: 0.35, melee: 0.012, heavy: 0.004,
    transform: 0.2, burstEscape: 0, punish: false, repelRead: false, sightIq: false, satIq: false,
  },
  [Difficulty.Normal]: {
    reaction: 17, dodge: 0.32, guard: 0.35, fire: 0.6, melee: 0.025, heavy: 0.008,
    transform: 0.45, burstEscape: 0.1, punish: false, repelRead: false, sightIq: false, satIq: false,
  },
  [Difficulty.Hard]: {
    reaction: 11, dodge: 0.55, guard: 0.55, fire: 0.8, melee: 0.04, heavy: 0.012,
    transform: 0.7, burstEscape: 0.3, punish: false, repelRead: false, sightIq: false, satIq: false,
  },
  [Difficulty.Extreme]: {
    // Not faster than HARD. A 6-tick read dashed at shots that were never going
    // to land and had no dash left for the ones that were: measured against
    // HARD it won 13 of 32 at 6 and 45 of 64 at 11. The main game learned the
    // same thing about its own EXTREME.
    reaction: 11, dodge: 0.78, guard: 0.7, fire: 0.92, melee: 0.06, heavy: 0.016,
    transform: 0.85, burstEscape: 0.6, punish: true, repelRead: true, sightIq: true, satIq: true,
  },
};

type Plan = 'approach' | 'hold' | 'retreat' | 'climb';

/** Does the segment ab pass through box b? (Slab test.) */
export function segmentHitsBox(a: V3, b: V3, box: Box): boolean {
  let t0 = 0;
  let t1 = 1;
  const d = [b.x - a.x, b.y - a.y, b.z - a.z];
  const o = [a.x, a.y, a.z];
  const mn = [box.min.x, box.min.y, box.min.z];
  const mx = [box.max.x, box.max.y, box.max.z];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < mn[i] || o[i] > mx[i]) return false;
      continue;
    }
    let ta = (mn[i] - o[i]) / d[i];
    let tb = (mx[i] - o[i]) / d[i];
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

export function lineOfSight(a: V3, b: V3): boolean {
  for (const box of OBSTACLES) if (segmentHitsBox(a, b, box)) return false;
  return true;
}

export class OrbitAI {
  private readonly rng: Rng;
  private readonly p: OrbitAiProfile;
  private prevHeld = 0;
  private plan: Plan = 'hold';
  private planTicks = 0;
  private strafe = 1;
  private strafeTicks = 0;
  /** Ticks a threat has been visible; acted on after `reaction`. */
  private threatSeen = 0;
  private meleeSeen = 0;
  private guardTicks = 0;
  private wantDash: { dx: number; dy: number } | null = null;
  private climbTicks = 0;
  /**
   * What the mobile form is for this time: an attack run at the rival, or an
   * escape to open distance before turning back for one.
   */
  private mobileGoal: 'run' | 'escape' = 'run';
  private mobileTicks = 0;
  private waypoint: V3 = { x: 0, y: 12, z: 0 };
  private lastAct = OrbitAct.Free;
  /** The range this machine wants to fight at, world units. */
  private readonly preferred: number;
  private readonly brawler: boolean;

  constructor(
    private readonly id: 0 | 1,
    difficulty: Difficulty,
    self: OrbitFighter,
    seed = 0x0a17,
  ) {
    this.rng = new Rng(seed ^ (id * 0x9e37) ^ (difficulty * 0x51));
    this.p = ORBIT_AI[difficulty];
    // A machine whose sword out-damages a few seconds of its gun is a brawler.
    const lock = self.def.meleeLock;
    const sword = lock.damage.reduce((a, b) => a + b, 0);
    const gun = self.def.main.damage * Math.max(1, self.def.main.projCount) * 6;
    this.brawler = sword > gun * 1.15;
    const reach = self.def.main.projSpeed * self.def.main.projLife * PX;
    this.preferred = this.brawler ? 7 : Math.max(9, Math.min(20, reach * 0.42));
  }

  /** The next input for this fighter. */
  think(sim: OrbitSim): InputFrame {
    const me = sim.fighters[this.id];
    const foe = sim.fighters[1 - this.id];
    let held = 0;
    let dx = 0;
    let dy = 0;
    const r = (): number => this.rng.next();
    const hold = (b: Btn): void => {
      held |= 1 << b;
    };

    if (sim.phase !== 'fight' || me.act === OrbitAct.Down) return this.emit(0, 0, 0);
    const wokeUp = this.lastAct === OrbitAct.Knockdown && me.act !== OrbitAct.Knockdown;
    this.lastAct = me.act;

    const toFoe = { x: foe.pos.x - me.pos.x, y: foe.pos.y - me.pos.y, z: foe.pos.z - me.pos.z };
    const dist = Math.hypot(toFoe.x, toFoe.y, toFoe.z);
    const flat = Math.hypot(toFoe.x, toFoe.z);
    const sight = lineOfSight(me.pos, foe.pos);
    const g = me.def.gauges;

    // ---- stunned: the only answer is a burst ---------------------------
    if (me.act === OrbitAct.Hitstun || me.act === OrbitAct.GuardBreak) {
      if (me.act === OrbitAct.Hitstun && foe.ml && foe.ml.hitIndex >= 1 && r() < this.p.burstEscape * 0.08) {
        hold(Btn.Barrier);
      }
      return this.emit(0, 0, held);
    }

    // ---- threats ---------------------------------------------------------
    const shot = this.incoming(sim, me);
    this.threatSeen = shot ? this.threatSeen + 1 : 0;
    const swinging = foe.ml !== null && dist < foe.def.meleeLock.acquireRange * PX * 1.1;
    this.meleeSeen = swinging ? this.meleeSeen + 1 : 0;

    // A sword sequence coming in.
    if (me.form === 'mech' && swinging && this.meleeSeen >= Math.max(2, this.p.reaction * 0.6)) {
      if (this.p.repelRead && foe.ml!.hitIndex === 0 && foe.ml!.phase !== 'gap' && dist < 4.2 && me.barrier > me.def.barrier.cost && r() < 0.35) {
        return this.emit(0, 0, 1 << Btn.Barrier);
      }
      if (this.guardTicks > 0 || r() < this.p.guard * 0.25) {
        this.guardTicks = Math.max(this.guardTicks, 18);
      }
    }
    // A shot that will hit.
    if (shot && this.threatSeen >= this.p.reaction && this.wantDash === null && this.guardTicks === 0) {
      const roll = r();
      if (roll < this.p.dodge) {
        // Dash across its path: pick the side it is not already drifting to.
        const side = this.strafe;
        this.wantDash = { dx: side, dy: 0 };
        this.threatSeen = -40;
      } else if (me.form === 'mech' && roll < this.p.dodge + this.p.guard * 0.4 && me.barrier > g.maxBarrier * 0.3) {
        this.guardTicks = 14;
        this.threatSeen = -30;
      } else {
        this.threatSeen = -20;
      }
    }

    if (this.guardTicks > 0 && me.form === 'mech') {
      this.guardTicks--;
      hold(Btn.Barrier);
      // Keep circling under the guard.
      return this.emit(this.strafe * 0.6, 0, held);
    }

    // ---- saturation ------------------------------------------------------
    if (!me.satActive && me.sat >= g.maxSaturation * 0.98) {
      const want = this.p.satIq ? (this.brawler ? SatMode.Speed : SatMode.Shoot) : SatMode.Shoot;
      if (me.satMode !== want && this.p.satIq) {
        // A press each other tick: the button has to come up between presses.
        if ((this.prevHeld & (1 << Btn.ModeCycle)) === 0) hold(Btn.ModeCycle);
        return this.emit(0, 0, held);
      }
      if (r() < 0.2) hold(Btn.Saturation);
    }

    // ---- mobile form: fly at them, shoot down the nose, change back -------
    if (me.form === 'mobile' && me.transformTicks === 0) {
      return this.flyMobile(me, foe, dist, flat, sight, held);
    }

    // ---- a dash queued by the threat read --------------------------------
    if (this.wantDash) {
      if ((this.prevHeld & (1 << Btn.Boost)) !== 0) {
        // Boost has to come up before it can be pressed again.
        return this.emit(this.wantDash.dx, this.wantDash.dy, 0);
      }
      const d = this.wantDash;
      this.wantDash = null;
      this.strafe = -this.strafe;
      return this.emit(d.dx, d.dy, 1 << Btn.Boost);
    }

    // ---- choose a plan ---------------------------------------------------
    if (--this.planTicks <= 0) this.choosePlan(me, foe, dist, sight);
    if (--this.strafeTicks <= 0) {
      this.strafeTicks = 50 + Math.floor(r() * 90);
      if (r() < 0.6) this.strafe = -this.strafe;
    }

    // Transform: across a long gap for an attack run, or — off a knockdown, or
    // now and then when the fight is close — to break away and come back.
    if (me.transformTicks === 0 && me.act === OrbitAct.Free && !shot) {
      const gap = flat > 17 && (!sight || flat > this.preferred + 6) && r() < this.p.transform * 0.06;
      const away =
        (wokeUp && r() < this.p.transform * 0.8) ||
        (dist < this.preferred + 2 && r() < this.p.transform * (this.brawler ? 0.003 : 0.008)) ||
        (this.p.punish && me.life < g.maxLife * 0.3 && dist < 8 && r() < 0.02);
      if (gap || away) {
        this.mobileGoal = gap ? 'run' : 'escape';
        this.mobileTicks = 0;
        if (!gap) this.waypoint = this.escapePoint(me, foe);
        return this.emit(0, 0, 1 << Btn.Flight);
      }
    }

    switch (this.plan) {
      case 'approach':
        dy = -1;
        dx = this.strafe * 0.45;
        break;
      case 'retreat':
        dy = 1;
        dx = this.strafe * 0.7;
        break;
      case 'climb':
        dx = 0;
        dy = 0;
        break;
      default:
        dx = this.strafe;
        dy = dist > this.preferred + 3 ? -0.5 : dist < this.preferred - 3 ? 0.5 : 0;
    }

    // Altitude: stay near the rival's height, a little above.
    const wantY = Math.max(2, foe.pos.y + 1.5);
    if (this.plan === 'climb' || (me.pos.y < wantY - 3 && this.climbTicks <= 0 && r() < 0.06)) {
      this.climbTicks = Math.max(this.climbTicks, 16);
    }
    if (this.climbTicks > 0 && me.pos.y < Math.min(30, wantY + 2)) {
      this.climbTicks--;
      dx = 0;
      dy = 0;
      hold(Btn.Boost);
    } else {
      this.climbTicks = 0;
      // Sustained boost on approach across a gap.
      if (this.plan === 'approach' && dist > this.preferred + 6 && me.boost > me.def.flight.maxBoost * 0.35) hold(Btn.Boost);
    }

    // ---- attack ----------------------------------------------------------
    const lockReach = me.def.meleeLock.acquireRange * PX;
    // A real punish window: burnout, a broken guard, or the back end of a shot
    // with enough recovery left to close into. Every gun is "recovering" for a
    // few frames after it fires, and swinging into those was measured to cost
    // EXTREME its margin.
    const left = foe.attack ? foe.attack.startup + foe.attack.active + foe.attack.recovery - foe.attackTick : 0;
    const recovering =
      foe.act === OrbitAct.Burnout || foe.act === OrbitAct.GuardBreak ||
      (foe.act === OrbitAct.Attack && foe.attack !== null &&
        foe.attackTick > foe.attack.startup + foe.attack.active && left >= 12);
    if (me.act === OrbitAct.Free && me.meleeLockout === 0 && me.ml === null) {
      const swing = this.p.melee * (this.brawler ? 1.6 : 1) * (dist < lockReach * 0.6 ? 2 : 1);
      if (dist < lockReach * 0.9 && sight && (r() < swing || (this.p.punish && recovering && dist < lockReach))) {
        return this.emit(dx, dy, held | (1 << Btn.Melee));
      }
    }
    const canShoot = sight || !this.p.sightIq;
    if (canShoot && me.act === OrbitAct.Free) {
      const e = me.energy;
      if (me.subCharges >= (me.def.salvo.subCost ?? 1) && dist < 26 && r() < 0.01) {
        return this.emit(dx, dy, held | (1 << Btn.Sub));
      }
      if (e > me.def.heavy.energyCost + g.maxEnergy * 0.25 && r() < this.p.heavy) {
        // The lance from range, the heavy up close.
        if (dist > 16 && me.def.lance.energyCost < e) dy = 1;
        return this.emit(dx, dy, held | (1 << Btn.Heavy));
      }
      if (e > me.def.main.energyCost * 2 && r() < this.p.fire) hold(Btn.Main);
    }
    return this.emit(dx, dy, held);
  }

  private choosePlan(me: OrbitFighter, foe: OrbitFighter, dist: number, sight: boolean): void {
    const r = this.rng.next();
    this.planTicks = 30 + Math.floor(this.rng.next() * 50);
    if (this.p.sightIq && !sight) {
      // Behind the gantry: get round it, over it if need be.
      this.plan = r < 0.5 ? 'approach' : 'climb';
      return;
    }
    const lowLife = me.life < me.def.gauges.maxLife * 0.25 && foe.life > me.life;
    if (dist > this.preferred + 6) this.plan = r < 0.8 ? 'approach' : 'hold';
    else if (dist < this.preferred - 4 && !this.brawler) this.plan = r < 0.6 ? 'retreat' : 'hold';
    else if (lowLife && this.p.punish) this.plan = 'retreat';
    else this.plan = r < 0.25 ? 'approach' : 'hold';
    if (me.pos.y < foe.pos.y - 5 && r < 0.4) this.plan = 'climb';
  }

  /** A point well away from the rival, inside the yard and up in the air. */
  private escapePoint(me: OrbitFighter, foe: OrbitFighter): V3 {
    let ax = me.pos.x - foe.pos.x;
    let az = me.pos.z - foe.pos.z;
    const l = Math.hypot(ax, az) || 1;
    ax /= l;
    az /= l;
    // Swing a little to one side, so the run back comes in at an angle.
    const sw = (this.rng.next() - 0.5) * 1.2;
    const c = Math.cos(sw);
    const s = Math.sin(sw);
    const dx = ax * c - az * s;
    const dz = ax * s + az * c;
    return {
      x: Math.max(ARENA.minX + 8, Math.min(ARENA.maxX - 8, me.pos.x + dx * 32)),
      y: 9 + this.rng.next() * 12,
      z: Math.max(ARENA.minZ + 6, Math.min(ARENA.maxZ - 5, me.pos.z + dz * 32)),
    };
  }

  private flyMobile(me: OrbitFighter, foe: OrbitFighter, dist: number, _flat: number, sight: boolean, held: number): InputFrame {
    this.mobileTicks++;
    if (this.mobileGoal === 'escape') {
      const far = Math.hypot(this.waypoint.x - me.pos.x, this.waypoint.z - me.pos.z);
      // Out of room or out of time: turn round and make the run back.
      if (far < 7 || this.mobileTicks > 150) this.mobileGoal = 'run';
    }
    // Back to a mech once there is something to fight.
    if (this.mobileGoal === 'run' && (dist < 12 || this.mobileTicks > 420)) return this.emit(0, 0, 1 << Btn.Flight);
    const goal = this.mobileGoal === 'escape' ? this.waypoint : { x: foe.pos.x, y: foe.pos.y + 1, z: foe.pos.z };
    const gx = goal.x - me.pos.x;
    const gz = goal.z - me.pos.z;
    const wantYaw = Math.atan2(-gz, gx);
    let dYaw = wantYaw - me.yaw;
    while (dYaw > Math.PI) dYaw -= Math.PI * 2;
    while (dYaw < -Math.PI) dYaw += Math.PI * 2;
    let wantPitch = Math.atan2(goal.y - me.pos.y, Math.max(0.1, Math.hypot(gx, gz)));
    // Keep off the deck.
    if (me.pos.y < 3.5) wantPitch = Math.max(wantPitch, 0.35);
    const dPitch = wantPitch - me.pitch;
    const dx = Math.abs(dYaw) < 0.04 ? 0 : -Math.sign(dYaw);
    const dy = Math.abs(dPitch) < 0.04 ? 0 : -Math.sign(dPitch);
    const burn = this.mobileGoal === 'escape' ? Math.abs(dYaw) < 0.6 : Math.abs(dYaw) < 0.25 && dist > 18;
    if (burn && me.boost > me.def.flight.maxBoost * 0.15) held |= 1 << Btn.Boost;
    if (
      this.mobileGoal === 'run' && Math.abs(dYaw) < 0.12 && sight &&
      me.energy > me.def.main.energyCost * 2 && this.rng.next() < this.p.fire
    ) {
      held |= 1 << Btn.Main;
    }
    return this.emit(dx, dy, held);
  }

  /** The nearest enemy shot that will pass within reach in the next half second. */
  private incoming(sim: OrbitSim, me: OrbitFighter): OrbitProjectile | null {
    const reach = hurtRadius(me) + 0.6;
    for (const p of sim.projectiles) {
      if (!p.active || p.owner === this.id) continue;
      const rx = me.pos.x - p.pos.x;
      const ry = me.pos.y - p.pos.y;
      const rz = me.pos.z - p.pos.z;
      const vv = p.vel.x * p.vel.x + p.vel.y * p.vel.y + p.vel.z * p.vel.z;
      if (vv < 1e-6) continue;
      const t = (rx * p.vel.x + ry * p.vel.y + rz * p.vel.z) / vv;
      if (t < 0 || t > 30) continue;
      const cx = p.pos.x + p.vel.x * t - me.pos.x;
      const cy = p.pos.y + p.vel.y * t - me.pos.y;
      const cz = p.pos.z + p.vel.z * t - me.pos.z;
      // Homing shots are treated as hits; they will turn in.
      if (Math.hypot(cx, cy, cz) < reach + p.radius || (p.homing > 0 && t < 22)) return p;
    }
    return null;
  }

  private emit(dx: number, dy: number, held: number): InputFrame {
    const pressed = held & ~this.prevHeld;
    this.prevHeld = held;
    return { dx, dy, held, pressed, aimX: null, aimY: null };
  }
}
