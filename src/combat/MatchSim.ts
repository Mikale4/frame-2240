import { ARENA_H, ARENA_W, DECK_Y, ROUND_TIME_TICKS, TICK_HZ } from '../core/GameConfig';
import { Rng } from '../core/Rng';
import type { MechDef } from '../mechs/MechDef';
import { Projectile, ProjectilePool, sweptHit } from '../projectiles/Projectile';
import { Combatant } from './Combatant';
import { SupState } from './Supporter';
import { Element } from './Status';
import { clampToArena } from './FlightModel';
import { clamp } from '../core/MathUtil';
import {
  BarrierResponse,
  MatchPhase,
  ProjKind,
  Team,
  emptyInput,
  type InputFrame,
  type ProjectileSpawn,
  type SimEvent,
} from './types';

export interface MatchConfig {
  playerDef: MechDef;
  enemyDef: MechDef;
  seed?: number;
  roundTicks?: number;
  arenaW?: number;
  arenaH?: number;
  /** Intro ticks before control unlocks (the "FIGHT" banner). */
  introTicks?: number;
  /** Deck surface (where feet rest). Defaults to DECK_Y. */
  groundY?: number;
  /**
   * Training: the rival is a dummy. It takes damage and reacts to hits, but
   * never acts, and it recovers instead of dying so practice is not interrupted.
   */
  dummy?: boolean;
}

export type MatchOutcome = 'none' | 'playerWin' | 'enemyWin' | 'draw';

/**
 * A projectile's "already hit this" set is keyed by combatant id, and a drone
 * needs its own key in the same set — otherwise a piercing beam that clipped a
 * mech would be treated as having already hit that mech's escort. Offsetting by
 * a constant keeps one set rather than adding a second one to every projectile.
 */
function droneHitKey(ownerId: number): number {
  return 1000 + ownerId;
}

/** How hard a repelled melee attacker is thrown off, and for how long. */
const MELEE_REPEL_KNOCK = 13;
/** One second. Long enough to punish, which is the whole point of the read. */
const MELEE_REPEL_STUN = 60;

/** `arcTether`: how often the wire can bite, and for how much. */
const ARC_TETHER_COOLDOWN = 18;
const ARC_TETHER_DAMAGE = 34;
/**
 * Half-thickness of the wire, in pixels.
 *
 * The arc was tested as a zero-width mathematical segment against a 30 px hurt
 * radius, which is not what a cable is and — more to the point — is not what the
 * renderer draws. `ARC_TETHER_WIDTH` is shared by the hit test and the line, so
 * what a player sees crossing a mech is exactly what connects with it.
 */
export const ARC_TETHER_WIDTH = 14;

/** How long a designator's paint outlives the drone's line of sight. */
const DESIGNATOR_PAINT_TICKS = 45;

/** Does the segment a-b pass within `r` of the point c? Used by the arc tether. */
export function segmentHitsCircle(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  r: number,
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return Math.hypot(cx - ax, cy - ay) <= r;
  let t = ((cx - ax) * dx + (cy - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(cx - (ax + dx * t), cy - (ay + dy * t)) <= r;
}

/**
 * The authoritative, engine-agnostic match simulation.
 *
 * It contains no Phaser types and performs no rendering, which is what makes the
 * combat logic unit-testable at a fixed tick rate.
 */
export class MatchSim {
  readonly player: Combatant;
  readonly enemy: Combatant;
  readonly combatants: Combatant[];
  readonly projectiles = new ProjectilePool(320);
  readonly rng: Rng;

  tick = 0;
  phase: MatchPhase = MatchPhase.Intro;
  outcome: MatchOutcome = 'none';
  timeLeft: number;
  /** Ticks spent in the KO freeze before results. */
  koTimer = 0;

  /** Events produced during the most recent step. */
  events: SimEvent[] = [];
  /** Combo counters, reset when the victim regains control. */
  readonly combo = new Map<number, number>();

  private readonly spawnQueue: ProjectileSpawn[] = [];
  private readonly arenaW: number;
  private readonly arenaH: number;
  private readonly introTicks: number;
  private readonly roundTicks: number;
  /** True when the rival is a training dummy. */
  readonly dummy: boolean;
  /** Counts dummy recoveries, so training can show how many you have downed. */
  dummyDowns = 0;

  constructor(cfg: MatchConfig) {
    this.arenaW = cfg.arenaW ?? ARENA_W;
    this.arenaH = cfg.arenaH ?? ARENA_H;
    this.introTicks = cfg.introTicks ?? 90;
    this.roundTicks = cfg.roundTicks ?? ROUND_TIME_TICKS;
    this.dummy = cfg.dummy ?? false;
    this.timeLeft = this.roundTicks;
    this.rng = new Rng(cfg.seed ?? 0x5eed1234);

    this.player = new Combatant({
      id: 0,
      team: Team.Player,
      def: cfg.playerDef,
      x: this.arenaW * 0.32,
      y: this.arenaH * 0.5,
      facing: 1,
      rng: this.rng,
    });
    this.enemy = new Combatant({
      id: 1,
      team: Team.Enemy,
      def: cfg.enemyDef,
      x: this.arenaW * 0.68,
      y: this.arenaH * 0.5,
      facing: -1,
      rng: this.rng,
    });
    this.combatants = [this.player, this.enemy];

    // Each chassis rests at whatever body height puts its own soles on the deck,
    // so both machines stand on the same drawn line.
    const deck = cfg.groundY ?? DECK_Y;
    for (const c of this.combatants) {
      // `footOffset` is measured on the unscaled sprite, so a chassis drawn at
      // 1.29 stands 1.29x further from its own pivot; without this a big mech
      // sinks through the deck and a small one hovers above it.
      const foot = c.def.rig.footOffset * c.def.rig.scale;
      c.groundY = Math.min(deck - foot, this.arenaH - c.def.rig.hurtRadius);
    }
  }

  opponentOf(c: Combatant): Combatant {
    return c === this.player ? this.enemy : this.player;
  }

  /** Seconds remaining, for the HUD. */
  get secondsLeft(): number {
    return Math.max(0, Math.ceil(this.timeLeft / TICK_HZ));
  }

  /**
   * Advances the simulation one fixed tick.
   *
   * `playerInput` and `enemyInput` are consumed as-is, so an AI, a replay or a
   * second human all drive the same code path.
   */
  step(playerInput: InputFrame, enemyInput: InputFrame): void {
    this.events.length = 0;
    this.spawnQueue.length = 0;
    this.tick++;

    // The intro hovers the mechs with no input, but still runs the full
    // pipeline so collision and cleanup never skip a tick.
    const inIntro = this.phase === MatchPhase.Intro;
    if (inIntro && this.tick >= this.introTicks) this.phase = MatchPhase.Fight;

    if (!inIntro && this.phase === MatchPhase.Fight) {
      this.timeLeft = Math.max(0, this.timeLeft - 1);
    }

    const frozen = inIntro || this.phase !== MatchPhase.Fight;
    const pIn = frozen ? emptyInput() : playerInput;
    const eIn = frozen ? emptyInput() : enemyInput;

    this.player.step(pIn, this.enemy, this.arenaW, this.arenaH, this.spawnQueue, this.events);
    this.enemy.step(eIn, this.player, this.arenaW, this.arenaH, this.spawnQueue, this.events);

    this.stepSupporters();

    for (const s of this.spawnQueue) this.projectiles.spawn(s);
    this.stepProjectiles();
    this.resolveCollisions();
    this.resolveDroneCollisions();
    this.applyShieldSweep();
    this.stepDroneRoles();
    this.resolveMineIntercepts();
    this.pushApart();
    this.checkEnd();
  }

  /**
   * Advances both supporter drones.
   *
   * Deliberately driven from here rather than from inside `Combatant.step`: that
   * method returns early through several branches (hitstop, hitstun, committed
   * attacks), and a state machine hidden behind one of those early returns is
   * precisely how the melee lock-on once stopped cancelling on hit. Stepping the
   * drones at the top level means no combatant branch can skip them.
   *
   * Runs after both chassis have moved, so each drone chases this tick's owner
   * position, and before the spawn queue is drained, so an assist shot fired
   * this tick becomes a live projectile on the same tick as any other.
   */
  private stepSupporters(): void {
    for (const c of this.combatants) {
      const target = this.opponentOf(c);
      const before = c.supporter.state;
      c.supporter.step(
        c,
        target,
        this.spawnQueue,
        this.events,
        (a, x, y, angle, spawns, events) => c.fireFromSupporter(a, x, y, angle, spawns, events),
        // Frozen phases feed no input, and they must not let a drone start
        // shooting on its own either — otherwise the intro would open with a
        // volley nobody asked for.
        this.phase === MatchPhase.Fight ? () => c.requestVolley() : undefined,
        // The drone dodges for itself now that nothing can recall it. Live
        // projectiles only — a spawn queued this tick is not yet in the air.
        this.activeProjectiles(),
      );
      // Only an order placed *inside* the drone's own step can be a self-started
      // one: a salvo motion has already moved it out of Idle earlier this tick.
      if (before === SupState.Idle && c.supporter.state === SupState.Windup) {
        const s = c.supporter;
        this.events.push({ t: 'assist', x: s.x, y: s.y, angle: s.aim, ownerId: c.id, auto: true });
      }
    }
  }


  /**
   * Mines against incoming fire: both are consumed.
   *
   * A charge sitting in the open is a physical object, so a shot that runs into
   * one takes it out and is spent doing so. That turns a minefield from a
   * tripwire into a genuine screen — and hands the opponent a way through it
   * that costs ammunition rather than hull.
   *
   * Only enemy fire, and only shots that are actually moving: a mine must not
   * eat its own side's rounds, and two mines from the same drop sitting next to
   * each other must not annihilate each other on the tick they are laid.
   */
  private resolveMineIntercepts(): void {
    const items = this.projectiles.items;
    for (const mine of items) {
      if (!mine.active || !mine.intercepts) continue;
      for (const shot of items) {
        if (!shot.active || shot === mine) continue;
        if (shot.team === mine.team || shot.intercepts) continue;
        // A lance is not stopped by a mine any more than it is by a guard.
        if (shot.barrier === BarrierResponse.Pierce) continue;
        if (Math.hypot(shot.x - mine.x, shot.y - mine.y) > mine.radius + shot.radius) continue;
        mine.active = false;
        shot.active = false;
        this.events.push({ t: 'explode', x: mine.x, y: mine.y, big: false });
        break;
      }
    }
  }

  /**
   * The drone roles that need to see the whole field.
   *
   * `dome` erases shots around itself, `interceptor` picks one out of the air,
   * `arcTether` electrifies the span back to its owner, and `tether` feeds the
   * owner's barrier. All four are here rather than in `Supporter` for the same
   * reason the drone step is: they read the projectile pool and both combatants,
   * and threading either through the supporter's signature would be worse than
   * doing it where both are already in hand.
   */
  private stepDroneRoles(): void {
    for (const c of this.combatants) {
      const s = c.supporter;
      if (!s.onStation || !c.alive) continue;
      const foe = this.opponentOf(c);

      switch (c.def.supporter.role) {
        case 'dome': {
          // A bubble that eats shots. Deliberately erases rather than damages:
          // the drone is the cost, and standing in the wrong place is the answer.
          if (!s.domeActive) break;
          const r = c.def.supporter.roleValue ?? 140;
          for (const p of this.projectiles.items) {
            if (!p.active || p.team === c.team) continue;
            // A piercing lance is not stopped by a bubble, exactly as it is not
            // stopped by a guard. The dome is a wall with the same known door.
            if (p.barrier === BarrierResponse.Pierce) continue;
            if (Math.hypot(p.x - s.x, p.y - s.y) > r) continue;
            p.active = false;
            this.events.push({ t: 'absorb', x: p.x, y: p.y, victimId: c.id, charge: 0 });
          }
          break;
        }

        case 'interceptor': {
          // One shot at a time, on the ordinary weapon cooldown, at whichever
          // incoming round is closest to landing. Precise rather than broad —
          // the opposite trade to the dome.
          if (!s.ready) break;
          const range = c.def.supporter.roleValue ?? 300;
          let best: Projectile | null = null;
          let bestD = Infinity;
          for (const p of this.projectiles.items) {
            if (!p.active || p.team === c.team) continue;
            if (p.barrier === BarrierResponse.Pierce) continue;
            const d = Math.hypot(p.x - c.x, p.y - c.y);
            if (d > range || d >= bestD) continue;
            bestD = d;
            best = p;
          }
          if (best) {
            best.active = false;
            s.cooldown = c.def.supporter.cooldown;
            this.events.push({ t: 'absorb', x: best.x, y: best.y, victimId: c.id, charge: 0 });
          }
          break;
        }

        case 'arcTether': {
          // A live wire between drone and owner. With the Pincer play the span
          // crosses the target, which is the whole idea.
          if (!s.tetherLive || s.arcCooldown > 0) break;
          if (!foe.alive) break;
          if (
            !segmentHitsCircle(
              s.x,
              s.y,
              c.x,
              c.y,
              foe.x,
              foe.y,
              foe.def.rig.hurtRadius + ARC_TETHER_WIDTH,
            )
          )
            break;
          s.arcCooldown = ARC_TETHER_COOLDOWN;
          foe.takeHit({
            x: foe.x,
            y: foe.y,
            vx: Math.sign(foe.x - c.x) || 1,
            vy: 0,
            damage: ARC_TETHER_DAMAGE,
            guardDamage: ARC_TETHER_DAMAGE * 0.5,
            life: 1,
            radius: 8,
            ownerId: c.id,
            team: c.team,
            kind: ProjKind.Beam,
            barrier: BarrierResponse.Absorb,
            hitstop: 4,
            hitstun: 6,
            knockback: 2,
            homing: 0,
            pierceCount: 0,
            element: Element.Shock,
          });
          this.events.push({ t: 'hit', x: foe.x, y: foe.y, damage: ARC_TETHER_DAMAGE, ownerId: c.id, victimId: foe.id, kind: ProjKind.Beam });
          break;
        }

        case 'designator': {
          // Paint refreshed while the target is in reach; it lapses on its own
          // once the drone loses sight, so killing the escort turns the tracking
          // off within a second rather than instantly.
          if (!foe.alive) break;
          if (Math.hypot(foe.x - s.x, foe.y - s.y) > c.def.supporter.fireRange) break;
          foe.paintedTicks = Math.max(foe.paintedTicks, DESIGNATOR_PAINT_TICKS);
          break;
        }

        case 'tether': {
          // Barrier only, and only while the drone is holding station. See the
          // note in `Supporter.stepRole` for why it may never touch life.
          if (!s.tetherLive) break;
          const rate = c.def.supporter.roleValue ?? 1.6;
          c.barrier = Math.min(c.def.gauges.maxBarrier, c.barrier + rate);
          break;
        }

        default:
          break;
      }

      if (s.arcCooldown > 0) s.arcCooldown--;
    }
  }

  /**
   * Projectile-vs-drone.
   *
   * Kept separate from `resolveCollisions` rather than folded into its inner
   * loop, because a drone is not a `Combatant`: it has no barrier, no guard, no
   * status, no combo counter and no hitstun. Sharing that loop would mean
   * threading a second entity type through five branches that do not apply to it.
   *
   * Mechs are resolved first, so a shot that has already killed itself on a
   * chassis cannot also clip the escort behind it.
   */
  private resolveDroneCollisions(): void {
    for (const p of this.projectiles.items) {
      if (!p.active) continue;
      for (const c of this.combatants) {
        const s = c.supporter;
        if (!s.hittable) continue;
        if (c.team === p.team || c.id === p.ownerId) continue;
        const key = droneHitKey(c.id);
        if (p.hitIds.has(key)) continue;
        if (!sweptHit(p, s.x, s.y, s.def.hurtRadius)) continue;

        const result = s.takeHit(p.damage);
        if (result === 'ignored') continue;
        p.hitIds.add(key);

        if (result === 'down') {
          this.events.push({ t: 'droneDown', x: s.x, y: s.y, ownerId: c.id });
          this.events.push({ t: 'explode', x: s.x, y: s.y, big: false });
        } else {
          this.events.push({ t: 'droneHit', x: s.x, y: s.y, damage: p.damage, ownerId: c.id });
        }

        const attacker = this.combatants.find((a) => a.id === p.ownerId);
        if (attacker) attacker.hitstop = Math.max(attacker.hitstop, Math.floor(p.hitstop * 0.5));

        if (p.pierceLeft > 0) p.pierceLeft--;
        else p.active = false;
        break;
      }
    }
  }

  private stepProjectiles(): void {
    for (const p of this.projectiles.items) {
      if (!p.active) continue;
      let tx: number | null = null;
      let ty: number | null = null;
      if (p.homing > 0) {
        const target = p.team === Team.Player ? this.enemy : this.player;
        if (target.alive) {
          tx = target.x;
          ty = target.y;
        }
      }
      p.step(tx, ty);
      // Off-arena cleanup with a generous margin so homing shots can loop back.
      if (
        p.x < -260 ||
        p.y < -260 ||
        p.x > this.arenaW + 260 ||
        p.y > this.arenaH + 260
      ) {
        p.active = false;
      }
    }
  }

  private resolveCollisions(): void {
    for (const p of this.projectiles.items) {
      if (!p.active) continue;
      for (const c of this.combatants) {
        if (!c.alive) continue;
        if (c.team === p.team || c.id === p.ownerId) continue;
        if (p.hitIds.has(c.id)) continue;
        if (!sweptHit(p, c.x, c.y, c.def.rig.hurtRadius)) continue;

        const attacker = this.combatants.find((a) => a.id === p.ownerId);
        const result = c.takeHit(p.asHit());
        p.hitIds.add(c.id);

        switch (result) {
          case 'repelled': {
            // The swing is thrown back: the attacker is knocked away from the
            // defender and left helpless for a second. This is the counterplay
            // to a sword opener, and it is why melee can no longer simply walk
            // through a barrier.
            this.events.push({
              t: 'meleeRepel',
              x: p.x,
              y: p.y,
              id: c.id,
              attackerId: p.ownerId,
            });
            if (attacker) {
              const dx = attacker.x - c.x;
              const dy = attacker.y - c.y;
              const l = Math.hypot(dx, dy) || 1;
              attacker.vx = (dx / l) * MELEE_REPEL_KNOCK;
              attacker.vy = (dy / l) * MELEE_REPEL_KNOCK - 2;
              attacker.interrupt(MELEE_REPEL_STUN);
            }
            p.active = false;
            continue;
          }
          case 'absorbed':
            this.events.push({
              t: 'absorb',
              x: p.x,
              y: p.y,
              victimId: c.id,
              charge: c.def.gauges.satOnAbsorb,
            });
            p.active = false;
            continue;
          case 'guarded':
            this.events.push({ t: 'guard', x: p.x, y: p.y, victimId: c.id });
            if (attacker) attacker.hitstop = Math.max(attacker.hitstop, Math.floor(p.hitstop * 0.6));
            break;
          case 'hit': {
            this.events.push({
              t: 'hit',
              x: p.x,
              y: p.y,
              damage: p.damage,
              ownerId: p.ownerId,
              victimId: c.id,
              kind: p.kind,
              family: p.family,
            });
            if (attacker) {
              attacker.hitstop = Math.max(attacker.hitstop, p.hitstop);
              attacker.confirmHit();
              // Melee finishers shove the attacker back off the target.
              const fin = attacker.attack?.selfKnockback;
              if (fin && p.kind === ProjKind.Melee) {
                const l = Math.hypot(p.vx, p.vy);
                const ax = l > 0 ? p.vx / l : Math.cos(attacker.aim);
                const ay = l > 0 ? p.vy / l : Math.sin(attacker.aim);
                attacker.vx -= ax * fin;
                attacker.vy -= ay * fin;
              }
            }
            // Status elements only take hold on a clean hit — guarding or
            // absorbing a shot also turns aside whatever it was carrying.
            if (p.element !== Element.None && c.status.apply(p.element as Element)) {
              this.events.push({
                t: 'status',
                x: c.x,
                y: c.y,
                victimId: c.id,
                element: p.element,
              });
            }
            this.combo.set(c.id, (this.combo.get(c.id) ?? 0) + 1);
            break;
          }
          case 'ignored':
            continue;
        }

        if (p.pierceLeft > 0) p.pierceLeft--;
        else p.active = false;
      }
    }

    // Reset combo counters once the victim is free again.
    for (const c of this.combatants) {
      if (c.hitstun <= 0 && c.hitstop <= 0 && (this.combo.get(c.id) ?? 0) > 0) {
        this.combo.set(c.id, 0);
      }
    }
  }

  /** Shield saturation erases incoming shots in a bubble, per the reference. */
  private applyShieldSweep(): void {
    for (const c of this.combatants) {
      if (!c.shieldActive || !c.alive) continue;
      const r = c.def.barrier.radius * 1.35;
      for (const p of this.projectiles.items) {
        if (!p.active || p.team === c.team) continue;
        if (p.barrier === BarrierResponse.Pierce) continue;
        if (Math.hypot(p.x - c.x, p.y - c.y) > r + p.radius) continue;
        p.active = false;
        c.sat = Math.min(c.def.gauges.maxSaturation, c.sat + 4);
        this.events.push({ t: 'absorb', x: p.x, y: p.y, victimId: c.id, charge: 4 });
      }
    }
  }

  /** Keeps the two chassis from occupying the same space. */
  private pushApart(): void {
    const a = this.player;
    const b = this.enemy;
    if (!a.alive || !b.alive) return;
    const minDist = a.def.rig.hurtRadius + b.def.rig.hurtRadius - 8;
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    let d = Math.hypot(dx, dy);
    if (d >= minDist) return;
    if (d < 1e-4) {
      dx = 1;
      dy = 0;
      d = 1;
    }
    const push = (minDist - d) * 0.5;
    const nx = dx / d;
    const ny = dy / d;
    a.x -= nx * push;
    a.y -= ny * push;
    b.x += nx * push;
    b.y += ny * push;

    // Separation can shove a mech through the arena wall, so re-clamp after.
    clampToArena(a, a.def.rig.hurtRadius, this.arenaW, this.arenaH, 0);
    clampToArena(b, b.def.rig.hurtRadius, this.arenaW, this.arenaH, 0);
    this.enforceFloor();
  }

  /**
   * Re-applies the arena floor to grounded mechs.
   *
   * Separation (and any other post-motion nudge) can push a landed mech below
   * the deck. The flight step would normally correct it on the next tick, but
   * not while the mech is frozen in hitstop — so it has to be enforced here.
   */
  private enforceFloor(): void {
    for (const c of this.combatants) {
      if (!c.flying && c.y > c.groundY) {
        c.y = c.groundY;
        if (c.vy > 0) c.vy = 0;
      }
    }
  }

  private checkEnd(): void {
    if (this.phase === MatchPhase.KO) {
      this.koTimer++;
      if (this.koTimer > 110) this.phase = MatchPhase.Over;
      return;
    }
    if (this.phase !== MatchPhase.Fight) return;

    // A downed training dummy gets back up rather than ending the session.
    if (this.dummy && !this.enemy.alive) {
      this.dummyDowns++;
      this.events.push({ t: 'explode', x: this.enemy.x, y: this.enemy.y, big: true });
      this.reviveDummy();
      return;
    }

    const pDead = !this.player.alive;
    const eDead = !this.enemy.alive;

    if (pDead || eDead) {
      if (pDead && eDead) this.outcome = 'draw';
      else if (eDead) this.outcome = 'playerWin';
      else this.outcome = 'enemyWin';

      if (pDead) this.events.push({ t: 'ko', id: this.player.id });
      if (eDead) this.events.push({ t: 'ko', id: this.enemy.id });
      this.events.push({
        t: 'explode',
        x: eDead ? this.enemy.x : this.player.x,
        y: eDead ? this.enemy.y : this.player.y,
        big: true,
      });
      this.phase = MatchPhase.KO;
      this.koTimer = 0;
      return;
    }

    // Timeout: the reference awarded the win to whoever had more life left.
    if (this.timeLeft <= 0) {
      const pf = this.player.life / this.player.def.gauges.maxLife;
      const ef = this.enemy.life / this.enemy.def.gauges.maxLife;
      this.outcome = pf > ef ? 'playerWin' : ef > pf ? 'enemyWin' : 'draw';
      this.phase = MatchPhase.KO;
      this.koTimer = 0;
    }
  }

  /** Puts a downed training dummy back on its feet, ready for another pass. */
  private reviveDummy(): void {
    const e = this.enemy;
    const g = e.def.gauges;
    e.life = g.maxLife;
    e.energy = g.maxEnergy;
    e.barrier = g.maxBarrier;
    e.boost = e.def.flight.maxBoost;
    e.sat = 0;
    e.satActive = false;
    e.satTicks = 0;
    e.hitstun = 0;
    e.hitstop = 0;
    e.guardBreakStun = 0;
    e.invuln = 0;
    e.attack = null;
    e.vx = 0;
    e.vy = 0;
    e.spin = 0;
    e.flying = true;
    e.grounded = false;
    // Reappear at a readable distance rather than on top of the player.
    e.x = clamp(
      this.player.x + (this.player.x < this.arenaW / 2 ? 380 : -380),
      e.def.rig.hurtRadius,
      this.arenaW - e.def.rig.hurtRadius,
    );
    e.y = this.arenaH * 0.5;
    // The drone teleports with its machine rather than flying the whole arena
    // back, and drops any order it was holding when the dummy went down.
    e.supporter.reset(e);
    this.combo.set(e.id, 0);
  }

  /** Live projectiles, for the renderer. */
  activeProjectiles(): Projectile[] {
    return this.projectiles.items.filter((p) => p.active);
  }
}
