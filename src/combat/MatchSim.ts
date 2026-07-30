import { ARENA_H, ARENA_W, DECK_Y, ROUND_TIME_TICKS, TICK_HZ } from '../core/GameConfig';
import { Rng } from '../core/Rng';
import type { MechDef } from '../mechs/MechDef';
import { Projectile, ProjectilePool, sweptHit } from '../projectiles/Projectile';
import { Combatant } from './Combatant';
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
    });
    this.enemy = new Combatant({
      id: 1,
      team: Team.Enemy,
      def: cfg.enemyDef,
      x: this.arenaW * 0.68,
      y: this.arenaH * 0.5,
      facing: -1,
    });
    this.combatants = [this.player, this.enemy];

    // Each chassis rests at whatever body height puts its own soles on the deck,
    // so both machines stand on the same drawn line.
    const deck = cfg.groundY ?? DECK_Y;
    for (const c of this.combatants) {
      c.groundY = Math.min(deck - c.def.rig.footOffset, this.arenaH - c.def.rig.hurtRadius);
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
    this.applyShieldSweep();
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
      c.supporter.step(c, target, this.spawnQueue, this.events, (a, x, y, angle, spawns, events) =>
        c.fireFromSupporter(a, x, y, angle, spawns, events),
      );
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

        const result = c.takeHit(p.asHit());
        p.hitIds.add(c.id);

        const attacker = this.combatants.find((a) => a.id === p.ownerId);

        switch (result) {
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
