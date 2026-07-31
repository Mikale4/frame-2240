import type { Combatant } from '../combat/Combatant';
import { ActState, Btn, ProjKind, SatMode, type InputFrame } from '../combat/types';
import type { Projectile } from '../projectiles/Projectile';
import type { Rng } from '../core/Rng';
import { Difficulty } from '../core/Session';

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
  difficulty: Difficulty;
}

const TACTIC_NAMES = ['APPROACH', 'HOLD', 'RETREAT', 'STRAFE', 'EVADE'];

/**
 * What a difficulty tier actually changes.
 *
 * The numeric fields are the dial the old 1..8 level turned. The **boolean**
 * fields are the point of the rewrite: they switch on whole behaviours that the
 * lower tiers do not perform at all, so EXTREME is not NORMAL rolling better
 * dice — it reads the fight differently.
 *
 * Everything here stays inside the fairness rule this class is built on
 * (see the note above `RivalAI`): the rival emits the same `InputFrame` a human
 * produces, keeps a reaction delay even at the top tier, and reads only what is
 * on screen — positions, projectiles, whether the opponent is guarding or
 * committed to a recovery, and the gauges the HUD already draws. EXTREME is
 * perfect *execution* and better *decisions*, never extra information.
 */
export interface AiProfile {
  /** General competence, 0..1. Feeds the probability rolls that remain. */
  skill: number;
  /** Input lag in ticks. Never zero — a frame-perfect reaction is not fair. */
  reaction: number;
  /** Base chance of attempting a barrier burst against a tracked shot. */
  barrierChance: number;
  /**
   * Burst on the *optimal* tick instead of on a roll: wait until the shot is
   * about to land, so the invulnerability window covers the impact rather than
   * expiring before it.
   */
  perfectBarrier: boolean;
  /**
   * Evade by solving for the direction that clears *every* tracked shot, rather
   * than picking a random side of the nearest one.
   */
  threatSolver: boolean;
  /** Open up when the opponent is locked in recovery and cannot answer. */
  punishRecovery: boolean;
  /** Choose the weapon that suits the range and the opponent's guard state. */
  weaponIq: boolean;
  /** Hold fire to bank energy for a lance rather than trickling it away. */
  energyDiscipline: boolean;
  /** Approach off the opponent's firing axis instead of straight down it. */
  offAxisApproach: boolean;
  /**
   * Close the distance when the opponent turtles.
   *
   * Reads straight off the damage table rather than being a heuristic. A held
   * guard takes 20 % from gunfire and **50 % from melee**; a Shield burst takes
   * 5 % from gunfire and **30 % from melee**. Against anyone hiding, closing to
   * sword range is worth two and a half to six times as much damage as standing
   * off and shooting at them. Only EXTREME knows this.
   */
  closeOnGuard: boolean;
  /** Willingness to attack at all, before weapon choice. */
  aggression: number;
  /** Per-tick chance of spending a dash while repositioning. */
  dashChance: number;
}

export const AI_PROFILES: Record<Difficulty, AiProfile> = {
  [Difficulty.Easy]: {
    skill: 0.1,
    reaction: 16,
    barrierChance: 0.04,
    perfectBarrier: false,
    threatSolver: false,
    punishRecovery: false,
    weaponIq: false,
    energyDiscipline: false,
    offAxisApproach: false,
    closeOnGuard: false,
    aggression: 0.26,
    dashChance: 0.03,
  },
  [Difficulty.Normal]: {
    skill: 0.5,
    reaction: 9,
    barrierChance: 0.35,
    perfectBarrier: false,
    threatSolver: false,
    punishRecovery: false,
    weaponIq: false,
    energyDiscipline: false,
    offAxisApproach: false,
    closeOnGuard: false,
    aggression: 0.5,
    dashChance: 0.1,
  },
  [Difficulty.Hard]: {
    skill: 0.78,
    reaction: 6,
    barrierChance: 0.6,
    perfectBarrier: false,
    threatSolver: true,
    punishRecovery: true,
    weaponIq: true,
    energyDiscipline: false,
    offAxisApproach: false,
    closeOnGuard: false,
    aggression: 0.68,
    dashChance: 0.16,
  },
  [Difficulty.Extreme]: {
    skill: 1,
    // Three ticks — 50 ms. About the best a human competitive player manages,
    // and deliberately not zero: a frame-perfect rival is not beatable, it is
    // just unfair, and the whole class is built on emitting inputs a person
    // could have emitted.
    reaction: 3,
    barrierChance: 1,
    perfectBarrier: true,
    threatSolver: true,
    punishRecovery: true,
    weaponIq: true,
    energyDiscipline: true,
    offAxisApproach: true,
    closeOnGuard: true,
    // Not the highest aggression on the roster, deliberately. Firing anchors
    // movement, so "attack at every opportunity" measured worse than HARD.
    // EXTREME wins on *which* shots it takes and on never being where the last
    // one landed, not on volume of fire.
    aggression: 0.72,
    dashChance: 0.18,
  },
};

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
  /** Debounce on the drone toggle, so a threshold cannot be strobed. */
  private droneHold = 0;
  /**
   * This tick's projectile list, so the movement solver can see the whole field
   * without threading the array through four call signatures. Read within the
   * same `think` that set it and never retained across ticks.
   */
  private seenProjectiles: readonly Projectile[] = [];
  /**
   * Which way a circle-strafe is currently going.
   *
   * Held across decisions and flipped on its own slow timer, so the direction
   * survives long enough to cover ground. See the note in `chooseMovement`.
   */
  private strafeDir: 1 | -1 = 1;
  private strafeTicks = 0;

  constructor(
    private readonly cfg: AiConfig,
    private readonly rng: Rng,
  ) {}

  get tacticName(): string {
    return TACTIC_NAMES[this.tactic];
  }

  /** Everything the chosen tier changes. */
  private get p(): AiProfile {
    return AI_PROFILES[this.cfg.difficulty] ?? AI_PROFILES[Difficulty.Normal];
  }

  private get skill(): number {
    return this.p.skill;
  }

  private get reactionTicks(): number {
    return this.p.reaction;
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
    this.seenProjectiles = projectiles;
    const incoming = this.nearestThreat(self, projectiles);
    const foeCommitted =
      foe.act === ActState.Attack && foe.attack !== null && foe.attack.kind !== ProjKind.Melee;
    const foeMelee = foe.attack?.kind === ProjKind.Melee;

    // ---- Tactic selection (throttled, so it does not twitch every tick) ----
    this.tacticTicks--;
    if (this.tacticTicks <= 0) {
      this.tacticTicks = 22 + this.rng.int(30);
      this.tactic = this.pickTactic(self, foe, dist, incoming !== null, foeCommitted);
    }
    // Emergencies override immediately.
    //
    // The lookahead is a function of *skill*, not of reaction time. It used to
    // be `reactionTicks + 6`, which inverted the whole point: a faster rival got
    // a shorter warning and started dodging later than a slow one. Ablation had
    // EXTREME beating HARD only once its reaction was slowed back down, which is
    // exactly the wrong shape for a difficulty dial. Better pilots see it
    // coming sooner.
    const lookahead = 9 + this.skill * 11;
    // Whether the rival reacts *at all* is the core survival skill, and it has
    // to scale — this override used to fire unconditionally, so an EASY pilot
    // dodged as reliably as an EXTREME one and the two measured level. Rolled
    // per tick, so a weak rival still usually evades, just later and worse.
    if (incoming && incoming.ttc < lookahead && this.rng.chance(0.3 + this.skill * 0.7)) {
      this.tactic = AiTactic.Evade;
    }
    else if (foeMelee && dist < 130 && this.rng.chance(this.skill * 0.7)) this.tactic = AiTactic.Evade;

    // ---- Movement ----------------------------------------------------------
    // Reverse the strafe on its own slow clock, or at the arena's edges — never
    // on the movement decision itself, which runs far too often to randomise.
    this.strafeTicks--;
    if (this.strafeTicks <= 0) {
      this.strafeTicks = 34 + this.rng.int(40);
      this.strafeDir = this.rng.chance(0.5) ? 1 : -1;
    }
    if (self.y < 190) this.strafeDir = 1;
    else if (self.y > arenaH - 190) this.strafeDir = -1;

    this.reactTimer--;
    if (this.reactTimer <= 0) {
      // Floored, so a short reaction time does not become a short *commitment*.
      //
      // `reactionTicks` was doing three jobs: input latency, the evade lookahead,
      // and how often a heading is re-chosen. The third is the one that bites —
      // re-solving every three ticks makes the rival chase a moving optimum and
      // travel nowhere, which is why a faster reaction measured *worse* than a
      // slower one. Latency belongs to the barrier window; committing to a
      // heading for a beat belongs to everyone.
      this.reactTimer = Math.max(7, this.reactionTicks);
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
      this.rng.chance(this.p.dashChance);
    if (wantsDash) {
      pressed.v |= 1 << Btn.Boost;
      held.v |= 1 << Btn.Boost;
      this.dashCharge = 40 - Math.round(this.skill * 18);
    }

    // ---- Guard / barrier ---------------------------------------------------
    //
    // Both halves are off while Shield saturation is up, because both are
    // already being done for the rival: the mode holds the guard itself and
    // locks the burst out by design (see `Combatant.tryStartAction`). That
    // lock-out is balance, not a bug — a free burst under `barrierFree` is
    // uncapped invulnerability — so the rival must not spend its turn asking
    // for one.
    //
    // Leaving it live was not merely wasteful. `shouldBarrier` also gates the
    // attack further down, so every tick the rival reached for a barrier it
    // could not have, it skipped its own offence for a shot it never fired.
    this.guardTicks--;
    const canBarrier =
      !self.shieldActive && self.barrier >= self.def.barrier.cost && self.invuln <= 0;

    /**
     * Perfect timing, at EXTREME only — and *perfect* means selective, not
     * constant.
     *
     * Two halves:
     *
     * **When.** A burst grants `invulnTicks` of immunity starting now, so firing
     * the moment a shot is noticed wastes most of the window before the shot
     * arrives. The optimal press is as late as the reaction delay allows, so the
     * invulnerability is still open on the tick of impact.
     *
     * **Whether.** Measured, and the answer was not what it looks like: the
     * burst is strong enough — total immunity, and an absorbed shot *feeds* the
     * meter — that bursting whenever one is affordable beats husbanding it.
     * Gating on "will this shot definitely connect" and "keep a reserve" made
     * EXTREME lose to HARD by 0.18 of a health bar over twenty duels. So the
     * only filter is that the shot exists and is close; the discipline lives in
     * the timing, not in abstention.
     *
     * The window is floored at HARD's width rather than scaling down with the
     * shorter reaction, because a faster rival narrowing its own opportunity is
     * the same inverted-dial mistake as the lookahead above.
     */
    const barrierWindow =
      incoming !== null && incoming.ttc <= Math.max(9, this.reactionTicks + 3) && incoming.ttc >= 0;

    const shouldBarrier =
      canBarrier && barrierWindow && this.rng.chance(this.p.barrierChance);

    if (shouldBarrier) {
      // Barrier burst absorbs the shot and feeds saturation — the good answer.
      pressed.v |= 1 << Btn.Barrier;
      held.v |= 1 << Btn.Barrier;
      this.guardTicks = 26;
    } else if (
      !self.shieldActive &&
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
        // The same button a player presses. The rival gets no private path —
        // if it ever breaks it breaks for both sides, and the CPU visibly stops
        // using its overdrive, which is a much louder failure than a silent one.
        pressed.v |= 1 << Btn.Saturation;
        held.v |= 1 << Btn.Saturation;
      }
    }

    // ---- Drone ------------------------------------------------------------
    if (this.wantsDroneToggle(self)) {
      pressed.v |= 1 << Btn.Sub;
      held.v |= 1 << Btn.Sub;
      this.droneHold = 90;
    }

    // ---- Offence -----------------------------------------------------------
    if (this.buttonHold > 0) {
      this.buttonHold--;
      if (this.queuedButton !== null) held.v |= 1 << this.queuedButton;
    } else if (self.act === ActState.Free && self.hitstun <= 0 && !shouldBarrier) {
      const btn = this.chooseAttack(self, dist, foe);
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
    foe: Combatant,
    dist: number,
    threatened: boolean,
    foeCommitted: boolean,
  ): AiTactic {
    const pref = this.preferredRange;
    const lifeFrac = self.life / self.def.gauges.maxLife;

    // Someone hiding behind a guard or a Shield burst is taking a fraction of
    // anything shot at them and several times as much from a sword. Go and get
    // them rather than plinking at a wall.
    if (this.p.closeOnGuard && (foe.guarding || foe.shieldActive) && dist > self.def.meleeRange) {
      return AiTactic.Approach;
    }

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
        //
        // The vertical is *held* rather than re-rolled. It used to be a coin
        // flip taken fresh on every movement decision, which is fine at a long
        // reaction delay and catastrophic at a short one: a rival that
        // re-decides every three ticks flips up/down/up/down and vibrates on the
        // spot while a slower one commits and actually travels. That single line
        // made faster tiers move *worse*, and inverted the whole difficulty
        // ladder — EXTREME lost to HARD and NORMAL lost to EASY.
        my = this.strafeDir;
        mx = dist > this.preferredRange ? sx : -sx;
        break;
      case AiTactic.Hold:
        mx = 0;
        my = Math.abs(dyRaw) > 90 ? Math.sign(dyRaw) : 0;
        break;
      case AiTactic.Evade: {
        this.wantBoost = true;
        const solved = this.p.threatSolver ? this.solveEvade(self, arenaW, arenaH) : null;
        if (solved) {
          mx = solved.x;
          my = solved.y;
        } else if (incoming) {
          // Break perpendicular to the incoming shot's travel, guessing a side.
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

    // Prefer to keep some vertical separation so it does not sit in the laser
    // line. Deterministic in which way it breaks, for the reason above.
    if (my === 0 && Math.abs(dyRaw) < 24) {
      my = self.y > arenaH * 0.5 ? -1 : 1;
    }

    // Coming straight down the opponent's nose is the easiest thing in the game
    // to shoot. At EXTREME an approach carries a vertical component so it
    // arrives off the firing axis — the same closing distance, a worse angle to
    // be led from.
    if (this.p.offAxisApproach && this.tactic === AiTactic.Approach && my === 0) {
      my = self.y > foe.y ? -1 : 1;
    }

    this.dirX = mx;
    this.dirY = my;
  }

  /** The eight movement directions, plus holding position. */
  private static readonly DIRS: readonly (readonly [number, number])[] = [
    [0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];

  /**
   * The heading that clears *every* tracked shot, not just the nearest one.
   *
   * Projects the mech and each hostile projectile forward along their current
   * velocities and scores each of the nine headings by the closest any shot
   * would come. The roomiest wins.
   *
   * The lower tiers break perpendicular to the single nearest shot and guess a
   * side — the right instinct, and exactly the wrong answer when two shots
   * cross, which is precisely when being wrong costs the most.
   *
   * Still fair: projectile positions and velocities are on screen, and the
   * decision is gated behind the tier's reaction delay like every other one.
   */
  private solveEvade(self: Combatant, arenaW: number, arenaH: number): { x: number; y: number } | null {
    const threats: Projectile[] = [];
    for (const p of this.seenProjectiles) {
      if (!p.active || p.team === self.team) continue;
      if (Math.hypot(p.x - self.x, p.y - self.y) > 560) continue;
      threats.push(p);
    }
    if (threats.length === 0) return null;

    const HORIZON = 26;
    const step = self.def.flight.boostMaxSpeed * 0.72;
    const margin = 130;
    let best: { x: number; y: number } | null = null;
    let bestScore = -Infinity;

    for (const [dx, dy] of RivalAI.DIRS) {
      const len = Math.hypot(dx, dy) || 1;
      const vx = (dx / len) * step;
      const vy = (dy / len) * step;

      let closest = Infinity;
      for (let t = 3; t <= HORIZON; t += 3) {
        const px = self.x + vx * t;
        const py = self.y + vy * t;
        for (const p of threats) {
          const d = Math.hypot(p.x + p.vx * t - px, p.y + p.vy * t - py) - p.radius;
          if (d < closest) closest = d;
        }
      }

      let score = closest;
      // Flying into a wall to dodge one shot loses the next exchange. Weighted
      // heavily enough to override any clearance a corner could offer.
      const endX = self.x + vx * HORIZON;
      const endY = self.y + vy * HORIZON;
      if (endX < margin || endX > arenaW - margin) score -= 280;
      if (endY < margin || endY > arenaH - margin) score -= 280;
      // Standing still is never the confident answer while under fire.
      if (dx === 0 && dy === 0) score -= 45;

      if (score > bestScore) {
        bestScore = score;
        best = { x: dx, y: dy };
      }
    }
    return best;
  }

  private chooseAttack(self: Combatant, dist: number, foe: Combatant): Btn | null {
    const d = self.def;

    // Melee range: commit to the sword chain on its own button.
    if (dist < d.meleeRange) {
      // Melee is the one thing a guard barely stops and the only way through a
      // Shield burst, so a rival that reads the defence swings into it.
      const turtling = this.p.closeOnGuard && (foe.guarding || foe.shieldActive);
      return this.rng.chance(turtling ? 0.95 : 0.5 + this.skill * 0.45) ? Btn.Melee : null;
    }

    /**
     * Punish genuine helplessness.
     *
     * Only states the opponent cannot act out of: hitstun, a saturation burnout,
     * a broken guard. An opponent merely *attacking* is not exposed — they can
     * still barrier-cancel — and counting it as such was measurably harmful,
     * because firing anchors movement (`moveScaleFor`) and a rival that shoots
     * at every opportunity stops moving and gets hit for it.
     *
     * It biases the roll rather than bypassing it, for the same reason.
     */
    const exposed =
      this.p.punishRecovery &&
      (foe.act === ActState.Hitstun || foe.satBurnout > 0 || foe.guardBreakStun > 0);

    const roll = this.rng.next();
    if (roll > (exposed ? Math.min(1, this.p.aggression + 0.25) : this.p.aggression)) return null;

    // The sub-weapon is not on this menu: `Btn.Sub` deploys and recalls the
    // drone rather than firing it, and the drone picks its own firing moments.
    // Choosing it as an "attack" would have flicked the escort in and out of the
    // backpack every time the AI wanted to shoot at range.

    if (!this.p.weaponIq) {
      if (dist > 180 && self.energy >= d.heavy.energyCost && this.rng.chance(0.4)) {
        return Btn.Heavy;
      }
      return self.energy >= d.main.energyCost ? Btn.Main : null;
    }

    /**
     * Weapon chosen for the situation rather than rolled.
     *
     * Only `Main`, `Heavy` and `Melee` can be reached by pressing a button —
     * the lance and the spread are *command motions* (`MOTIONS.lance`,
     * `MOTIONS.spread` in `Combatant.tryStartAction`) which the rival does not
     * produce. An earlier pass gated this on `lance.energyCost` while returning
     * `Btn.Heavy`, so it demanded 265 energy to fire a 120-energy shot and spent
     * most of the fight declining to attack at all.
     */
    const canPay = (cost: number) => self.energyFree || self.energy >= cost;
    const heavy = canPay(d.heavy.energyCost);

    /**
     * The heavy is used sparingly, not preferentially.
     *
     * HALCYON's is 8 startup + 14 recovery — twenty-three ticks anchored, with
     * the recoil to match. Reaching for it whenever it was affordable measured
     * as a *net loss*: the rival stopped moving often enough that the extra
     * damage did not pay for the hits it took standing still. It is worth that
     * commitment against a target that cannot answer, and against a guard, where
     * the main gun is reduced to a fifth.
     */
    if (exposed && heavy) return Btn.Heavy;
    if (foe.guarding && heavy && this.rng.chance(0.5)) return Btn.Heavy;
    // At range the travel time is affordable and the recovery is survivable.
    if (dist > 300 && heavy && this.rng.chance(0.3)) return Btn.Heavy;

    /**
     * Energy discipline, at EXTREME only.
     *
     * The main gun is cheap and always available, which makes it easy to trickle
     * a reactor away on chip damage and then be unable to afford a heavy the
     * moment one is actually worth firing. So: bank rather than spend the last
     * of it — unless the opponent is exposed, when damage now beats damage
     * later. Scaled off the heavy's own cost rather than a fraction of the tank,
     * which on a 1000-point reactor was a third of the fight spent not shooting.
     */
    if (
      this.p.energyDiscipline &&
      !exposed &&
      !self.energyFree &&
      self.energy < d.main.energyCost * 2.5
    ) {
      return null;
    }

    return canPay(d.main.energyCost) ? Btn.Main : null;
  }

  /**
   * Whether to press the deploy/recall button this tick.
   *
   * The rival wants its drone out — that is where the passive and the free
   * volleys are — and pulls it in when it is nearly dead, letting it repair
   * before sending it back. Weak rivals never bother: the recall thresholds
   * scale with skill, so a rookie flies its drone until someone kills it, and an
   * ace protects it. That is a legible difficulty difference rather than a
   * hidden stat change.
   */
  private wantsDroneToggle(self: Combatant): boolean {
    if (this.droneHold > 0) {
      this.droneHold--;
      return false;
    }
    const s = self.supporter;
    if (s.destroyed) return false;

    // Below ~level 4 the rival simply leaves it deployed.
    const recallAt = this.skill < 0.5 ? 0 : 0.2 + (this.skill - 0.5) * 0.4;
    const redeployAt = recallAt + 0.45;

    const wantOut = s.outbound ? s.lifeFraction > recallAt : s.lifeFraction >= redeployAt;
    return wantOut !== s.outbound;
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
  ): { p: Projectile; ttc: number; perp: number } | null {
    let best: { p: Projectile; ttc: number; perp: number } | null = null;
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
      // `perp` is kept so a caller can tell a shot that will actually connect
      // from one that will pass nearby. The tracking cone above is deliberately
      // generous — good enough to dodge early, far too loose to spend a barrier
      // burst on.
      if (!best || ttc < best.ttc) best = { p, ttc, perp };
    }
    return best;
  }
}
