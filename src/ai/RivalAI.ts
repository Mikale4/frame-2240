import type { Combatant } from '../combat/Combatant';
import { ActState, Btn, ProjKind, SatMode, type InputFrame } from '../combat/types';
import type { Projectile } from '../projectiles/Projectile';
import type { Rng } from '../core/Rng';
import { clamp } from '../core/MathUtil';

/**
 * Rival CPU behaviour.
 *
 * Deliberately *fair*: it emits the same `InputFrame` a human produces, respects
 * reaction delays, and reads only what a player could see on screen. Its shape
 * follows the reference AI — pick a numpad direction, keep preferred range,
 * dodge when the opponent commits to a shot, and stay off the arena edges.
 */

export const enum AiTactic {
  Approach = 0,
  Hold = 1,
  Retreat = 2,
  Strafe = 3,
  Evade = 4,
}

export interface AiConfig {
  /** 1 (rookie) .. 8 (ace), mirroring the reference's eight AI levels. */
  level: number;
}

const TACTIC_NAMES = ['APPROACH', 'HOLD', 'RETREAT', 'STRAFE', 'EVADE'];

export class RivalAI {
  tactic: AiTactic = AiTactic.Approach;
  private tacticTicks = 0;
  /** Buffered decision, released after the reaction delay. */
  private reactTimer = 0;
  private dirX = 0;
  private dirY = 0;
  private wantBoost = false;
  private queuedButton: Btn | null = null;
  private buttonHold = 0;
  private prevHeld = 0;
  private guardTicks = 0;
  private dashCharge = 0;

  constructor(
    private readonly cfg: AiConfig,
    private readonly rng: Rng,
  ) {}

  get tacticName(): string {
    return TACTIC_NAMES[this.tactic];
  }

  private get skill(): number {
    return clamp(this.cfg.level / 8, 0.15, 1);
  }

  /** Reaction delay in ticks: ~13 at level 1 down to ~4 at level 8. */
  private get reactionTicks(): number {
    return Math.round(14 - this.skill * 10);
  }

  /** Preferred fighting distance, in logical pixels. */
  private get preferredRange(): number {
    return 300 - this.skill * 90;
  }

  think(
    self: Combatant,
    foe: Combatant,
    projectiles: readonly Projectile[],
    arenaW: number,
    arenaH: number,
  ): InputFrame {
    const held = { v: 0 };
    const pressed = { v: 0 };

    if (!self.alive || !foe.alive) {
      this.prevHeld = 0;
      return { dx: 0, dy: 0, held: 0, pressed: 0, aimX: null, aimY: null };
    }

    const dx = foe.x - self.x;
    const dy = foe.y - self.y;
    const dist = Math.hypot(dx, dy);
    const sx = Math.sign(dx) || 1;

    // ---- Threat assessment ------------------------------------------------
    const incoming = this.nearestThreat(self, projectiles);
    const foeCommitted =
      foe.act === ActState.Attack && foe.attack !== null && foe.attack.kind !== ProjKind.Melee;
    const foeMelee = foe.attack?.kind === ProjKind.Melee;

    // ---- Tactic selection (throttled, so it does not twitch every tick) ----
    this.tacticTicks--;
    if (this.tacticTicks <= 0) {
      this.tacticTicks = 22 + this.rng.int(30);
      this.tactic = this.pickTactic(self, dist, incoming !== null, foeCommitted);
    }
    // Emergencies override immediately.
    if (incoming && incoming.ttc < this.reactionTicks + 6) this.tactic = AiTactic.Evade;
    else if (foeMelee && dist < 130 && this.rng.chance(this.skill * 0.7)) this.tactic = AiTactic.Evade;

    // ---- Movement ----------------------------------------------------------
    this.reactTimer--;
    if (this.reactTimer <= 0) {
      this.reactTimer = this.reactionTicks;
      this.chooseMovement(self, foe, dist, sx, incoming, arenaW, arenaH);
    }

    let mx = this.dirX;
    let my = this.dirY;

    // Stay inside the arena regardless of tactic.
    const margin = 130;
    if (self.x < margin) mx = 1;
    else if (self.x > arenaW - margin) mx = -1;
    if (self.y < margin) my = 1;
    else if (self.y > arenaH - margin) my = -1;

    if (this.wantBoost) held.v |= 1 << Btn.Boost;

    // ---- Dash bursts -------------------------------------------------------
    this.dashCharge--;
    const wantsDash =
      (this.tactic === AiTactic.Evade || (this.tactic === AiTactic.Approach && dist > 340)) &&
      this.dashCharge <= 0 &&
      self.boost > self.def.flight.dashCost + 12 &&
      (mx !== 0 || my !== 0) &&
      this.rng.chance(0.06 + this.skill * 0.14);
    if (wantsDash) {
      pressed.v |= 1 << Btn.Boost;
      held.v |= 1 << Btn.Boost;
      this.dashCharge = 40 - Math.round(this.skill * 18);
    }

    // ---- Guard / barrier ---------------------------------------------------
    this.guardTicks--;
    const shouldBarrier =
      incoming !== null &&
      incoming.ttc <= this.reactionTicks + 3 &&
      self.barrier >= self.def.barrier.cost &&
      self.invuln <= 0 &&
      this.rng.chance(0.25 + this.skill * 0.6);

    if (shouldBarrier) {
      // Barrier burst absorbs the shot and feeds saturation — the good answer.
      pressed.v |= 1 << Btn.Barrier;
      held.v |= 1 << Btn.Barrier;
      this.guardTicks = 26;
    } else if (
      this.guardTicks > 0 &&
      self.barrier > self.def.gauges.maxBarrier * 0.25 &&
      incoming !== null
    ) {
      held.v |= 1 << Btn.Barrier;
    }

    // ---- Saturation --------------------------------------------------------
    if (!self.satActive && self.sat >= self.def.gauges.maxSaturation) {
      const wantMode = this.chooseSatMode(self, dist);
      if (self.satMode !== wantMode) {
        pressed.v |= 1 << Btn.ModeCycle;
      } else if (this.rng.chance(0.35)) {
        pressed.v |= 1 << Btn.Main;
        held.v |= (1 << Btn.Main) | (1 << Btn.Heavy);
      }
    }

    // ---- Offence -----------------------------------------------------------
    if (this.buttonHold > 0) {
      this.buttonHold--;
      if (this.queuedButton !== null) held.v |= 1 << this.queuedButton;
    } else if (self.act === ActState.Free && self.hitstun <= 0 && !shouldBarrier) {
      const btn = this.chooseAttack(self, dist);
      if (btn !== null) {
        this.queuedButton = btn;
        this.buttonHold = 2;
        pressed.v |= 1 << btn;
        held.v |= 1 << btn;
      }
    }

    // A press is only a press on the tick the button goes down, and anything
    // pressed is by definition also held this tick.
    const realPressed = pressed.v & ~this.prevHeld;
    const finalHeld = held.v | realPressed;
    this.prevHeld = finalHeld;

    return {
      dx: mx,
      dy: my,
      held: finalHeld,
      pressed: realPressed,
      aimX: null,
      aimY: null,
    };
  }

  private pickTactic(
    self: Combatant,
    dist: number,
    threatened: boolean,
    foeCommitted: boolean,
  ): AiTactic {
    const pref = this.preferredRange;
    const lifeFrac = self.life / self.def.gauges.maxLife;

    if (threatened && foeCommitted && this.rng.chance(0.35 + this.skill * 0.35)) {
      return AiTactic.Evade;
    }
    // Wounded rivals give ground more readily.
    if (lifeFrac < 0.3 && this.rng.chance(0.4)) return AiTactic.Retreat;

    if (dist > pref * 1.5) return AiTactic.Approach;
    if (dist < pref * 0.45) {
      return this.rng.chance(0.55) ? AiTactic.Retreat : AiTactic.Strafe;
    }
    const roll = this.rng.next();
    if (roll < 0.45) return AiTactic.Strafe;
    if (roll < 0.72) return AiTactic.Hold;
    if (roll < 0.9) return AiTactic.Approach;
    return AiTactic.Retreat;
  }

  private chooseMovement(
    self: Combatant,
    foe: Combatant,
    dist: number,
    sx: number,
    incoming: { p: Projectile; ttc: number } | null,
    arenaW: number,
    arenaH: number,
  ): void {
    const dyRaw = foe.y - self.y;
    let mx = 0;
    let my = 0;
    this.wantBoost = false;

    switch (this.tactic) {
      case AiTactic.Approach:
        mx = sx;
        my = Math.abs(dyRaw) > 40 ? Math.sign(dyRaw) : 0;
        this.wantBoost = dist > 380;
        break;
      case AiTactic.Retreat:
        mx = -sx;
        my = dyRaw > 0 ? -1 : 1;
        this.wantBoost = dist < 160;
        break;
      case AiTactic.Strafe:
        // Circle-strafe: mostly vertical, drifting to keep range.
        my = this.rng.chance(0.5) ? -1 : 1;
        mx = dist > this.preferredRange ? sx : -sx;
        break;
      case AiTactic.Hold:
        mx = 0;
        my = Math.abs(dyRaw) > 90 ? Math.sign(dyRaw) : 0;
        break;
      case AiTactic.Evade: {
        this.wantBoost = true;
        if (incoming) {
          // Break perpendicular to the incoming shot's travel.
          const ang = incoming.p.angle;
          const px = -Math.sin(ang);
          const py = Math.cos(ang);
          const side = this.rng.chance(0.5) ? 1 : -1;
          mx = Math.sign(px * side);
          my = Math.sign(py * side);
          if (mx === 0 && my === 0) my = side;
        } else {
          mx = -sx;
          my = this.rng.chance(0.5) ? -1 : 1;
        }
        break;
      }
    }

    // Prefer to keep some vertical separation so it does not sit in the laser line.
    if (my === 0 && Math.abs(dyRaw) < 24 && this.rng.chance(0.4)) {
      my = self.y > arenaH * 0.5 ? -1 : 1;
    }
    void arenaW;

    this.dirX = mx;
    this.dirY = my;
  }

  private chooseAttack(self: Combatant, dist: number): Btn | null {
    const d = self.def;

    // Melee range: commit to the sword chain.
    if (dist < d.melee[0].projRadius + d.rig.hurtRadius + 18) {
      return this.rng.chance(0.5 + this.skill * 0.45) ? Btn.Main : null;
    }

    const roll = this.rng.next();
    const aggression = 0.24 + this.skill * 0.5;
    if (roll > aggression) return null;

    // Missiles at long range, heavy at mid, vulcan up close.
    if (dist > 420 && self.subCharges >= (d.sub.subCost ?? 1) && this.rng.chance(0.55)) {
      return Btn.Sub;
    }
    if (dist > 180 && self.energy >= d.heavy.energyCost && this.rng.chance(0.4)) {
      return Btn.Heavy;
    }
    if (self.energy >= d.main.energyCost) return Btn.Main;
    if (self.subCharges >= (d.sub.subCost ?? 1)) return Btn.Sub;
    return null;
  }

  private chooseSatMode(self: Combatant, dist: number): SatMode {
    const lifeFrac = self.life / self.def.gauges.maxLife;
    if (lifeFrac < 0.35) return SatMode.Shield;
    if (dist < 220) return SatMode.Speed;
    return SatMode.Shoot;
  }

  /** Nearest hostile projectile on a collision course, with ticks-to-contact. */
  private nearestThreat(
    self: Combatant,
    projectiles: readonly Projectile[],
  ): { p: Projectile; ttc: number } | null {
    let best: { p: Projectile; ttc: number } | null = null;
    const r = self.def.rig.hurtRadius + 34;

    for (const p of projectiles) {
      if (!p.active || p.team === self.team) continue;
      const rx = self.x - p.x;
      const ry = self.y - p.y;
      const speed = Math.hypot(p.vx, p.vy);
      if (speed < 0.01) continue;

      // Only consider shots roughly heading our way.
      const along = (rx * p.vx + ry * p.vy) / speed;
      if (along <= 0) continue;
      const perp = Math.abs(rx * p.vy - ry * p.vx) / speed;
      if (perp > r + p.radius + 26) continue;

      const ttc = along / speed;
      if (ttc > 46) continue;
      if (!best || ttc < best.ttc) best = { p, ttc };
    }
    return best;
  }
}
