import type { Combatant } from '../combat/Combatant';
import type { MechDef } from '../mechs/MechDef';
import { ActState, Btn, ProjKind, SatMode, type InputFrame } from '../combat/types';
import { playstyleFor, type Playstyle } from './Playstyles';
import type { Projectile } from '../projectiles/Projectile';
import type { Rng } from '../core/Rng';
import { Difficulty } from '../core/Session';
import { clamp } from '../core/MathUtil';
import { Element } from '../combat/Status';
import { DESPERATION_LIFE } from '../combat/Combatant';

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
 * Below this speed a projectile is a placed hazard rather than a shot.
 *
 * Mines and embers are spawned with a nominal 0.001 drift so nothing downstream
 * has to special-case a zero heading; anything genuinely fired travels an order
 * of magnitude faster than this.
 */
const PLACED_SPEED = 0.35;

/**
 * How much more willing a rival is to dash while its boost is free.
 *
 * A Speed burst removes the cost, so the rationing that governs the rest of a
 * match stops applying. Large on purpose: the burst lasts a few seconds and the
 * whole point is to spend it.
 */
const SPEED_BURST_DASH = 2.4;

/**
 * What a chassis can threaten, and from how far.
 *
 * Range in this game is not a stat — it is `projSpeed * projLife`, because a
 * shot dies on a timer rather than at a wall. So a rival that wants to know
 * whether it out-ranges its opponent has to work it out, exactly as a player
 * works it out by watching where shots stop.
 *
 * Derived from public weapon data both pilots can read on the select screen, so
 * it stays inside the fairness rule. Cached per chassis: eight machines, and the
 * numbers never change during a match.
 */
export interface MechReach {
  main: number;
  heavy: number;
  lance: number;
  /** Longest distance at which this chassis can put damage on something. */
  max: number;
  /** Distance the sword can be brought to bear from. */
  melee: number;
  /** Top speed under boost — whether it can dictate the range at all. */
  topSpeed: number;
}

const REACH_CACHE = new Map<string, MechReach>();

export function reachOf(def: MechDef): MechReach {
  const hit = REACH_CACHE.get(def.id);
  if (hit) return hit;
  const travel = (a: { projSpeed: number; projLife: number }) => a.projSpeed * a.projLife;
  const r: MechReach = {
    main: travel(def.main),
    heavy: travel(def.heavy),
    lance: travel(def.lance),
    max: Math.max(travel(def.main), travel(def.heavy), travel(def.lance)),
    melee: def.meleeRange,
    topSpeed: def.flight.boostMaxSpeed,
  };
  REACH_CACHE.set(def.id, r);
  return r;
}

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
  /**
   * Fight at a range derived from both machines' actual reach, rather than at a
   * fixed preferred distance.
   *
   * Whether standing off is winning or losing depends entirely on who out-ranges
   * whom, and by how much — and on whether the slower machine can even hold the
   * gap it wants. A flat `preferredRange` answers none of that.
   */
  rangeIq: boolean;
  /**
   * Play the score. Protect a health lead by giving ground; chase a deficit by
   * forcing the distance closed.
   */
  tempoIq: boolean;
  /**
   * Reads status effects — its opponent's and its own.
   *
   * A slowed target cannot disengage, which turns Cryo into a punish window
   * rather than a bit of chip; a *self* that is slowed cannot kite, so trying to
   * hold a range it can no longer hold is worse than closing. It also stops
   * re-applying an element that is already running, which was pure waste.
   */
  statusIq: boolean;
  /**
   * Reads the frame situation: invulnerability, the barrier repel window, dash
   * cooldown and how much recovery an attack genuinely has left.
   *
   * The purest skill trait in the table. Without it the rival fires into
   * i-frames, swings into a repel that throws it off and stuns it for a full
   * second, and "punishes" recoveries that already ended.
   */
  frameIq: boolean;
  /**
   * Reads the opponent's gauges — barrier, boost, energy, and how much of a
   * burst is left to run.
   *
   * Everything here is drawn on the HUD, so it is information the player has had
   * all along. A guard about to break wants pressure; an opponent with an empty
   * boost gauge cannot dodge the slow heavy shot; a Shield burst with a quarter
   * second left is worth waiting out rather than trading into.
   */
  resourceIq: boolean;
  /**
   * Values the drones — its own and the opponent's.
   *
   * A wounded enemy drone is one kill from being gone for the match, which is
   * worth going out of the way for. Its own drone rebuilding means its passive
   * is off, which is worth playing around.
   */
  droneIq: boolean;
  /**
   * Aims where the target is going rather than where it is.
   *
   * Nothing but a drone's own shots home, so a projectile aimed at a moving
   * target's current position is aimed at where it *was* by the time it arrives.
   * Solves the intercept and steers with the same manual-aim input a human
   * produces, so it stays inside the fairness rule.
   */
  leadShots: boolean;
  /** Willingness to attack at all, before weapon choice. */
  aggression: number;
  /** Per-tick chance of spending a dash while repositioning. */
  dashChance: number;
  /**
   * Dashes worth of boost to keep in hand rather than burn on sustained thrust.
   *
   * The gauge pays for two different things and they are not interchangeable.
   * Over the seven ticks an evasion actually takes, a dash moves **105 px for 12
   * boost** where holding the thruster moves **66 px**; sustained boost is the
   * more efficient way to *travel* and much the worse way to *dodge*. A rival
   * that holds boost whenever it wants to move arrives at every emergency with
   * an empty gauge and nothing left to dodge with.
   */
  boostReserveDashes: number;
  /**
   * Per-tick chance of dashing specifically to break away from incoming fire.
   *
   * Separate from `dashChance`, and much higher, because this is what the dash
   * is *for*. It is also the cheaper half of the defensive budget: a dash out of
   * the line costs 12 boost where a barrier burst costs 30 barrier and six ticks
   * of movement lock, so a rival that dodges well spends fewer bursts.
   */
  evadeDashChance: number;
}

export const AI_PROFILES: Record<Difficulty, AiProfile> = {
  [Difficulty.Easy]: {
    skill: 0.1,
    reaction: 16,
    barrierChance: 0.04,
    threatSolver: false,
    punishRecovery: false,
    weaponIq: false,
    energyDiscipline: false,
    closeOnGuard: false,
    rangeIq: false,
    tempoIq: false,
    statusIq: false,
    frameIq: false,
    resourceIq: false,
    droneIq: false,
    leadShots: false,
    aggression: 0.26,
    dashChance: 0.03,
    boostReserveDashes: 0,
    evadeDashChance: 0.05,
  },
  [Difficulty.Normal]: {
    skill: 0.5,
    reaction: 9,
    barrierChance: 0.35,
    threatSolver: false,
    punishRecovery: false,
    weaponIq: false,
    energyDiscipline: false,
    closeOnGuard: false,
    rangeIq: false,
    tempoIq: false,
    statusIq: false,
    frameIq: false,
    resourceIq: false,
    droneIq: false,
    leadShots: false,
    aggression: 0.5,
    dashChance: 0.1,
    boostReserveDashes: 1,
    evadeDashChance: 0.18,
  },
  [Difficulty.Hard]: {
    skill: 0.78,
    reaction: 6,
    barrierChance: 0.6,
    threatSolver: true,
    punishRecovery: true,
    weaponIq: true,
    energyDiscipline: false,
    closeOnGuard: false,
    // HARD has the fundamentals — reads threats, punishes recovery, picks its
    // weapon — but fights at a fixed preferred distance. Working out who
    // out-ranges whom, and standing exactly there, is EXTREME's alone: measured,
    // it is worth about two tenths of a health bar, which is most of what
    // separates the top two tiers.
    rangeIq: false,
    tempoIq: false,
    // HARD gets the two reads that stop it doing visibly stupid things — firing
    // into invulnerability, swinging into a repel, ignoring a slowed target —
    // plus the ability to lead a shot. What it still lacks is the gauge reading
    // and the drone valuation, which is where EXTREME pulls away.
    statusIq: true,
    frameIq: true,
    resourceIq: false,
    droneIq: false,
    leadShots: true,
    aggression: 0.68,
    dashChance: 0.16,
    boostReserveDashes: 2,
    evadeDashChance: 0.4,
  },
  [Difficulty.Extreme]: {
    skill: 1,
    // Three ticks — 50 ms. About the best a human competitive player manages,
    // and deliberately not zero: a frame-perfect rival is not beatable, it is
    // just unfair, and the whole class is built on emitting inputs a person
    // could have emitted.
    reaction: 3,
    barrierChance: 1,
    threatSolver: true,
    punishRecovery: true,
    weaponIq: true,
    energyDiscipline: true,
    closeOnGuard: true,
    rangeIq: true,
    tempoIq: true,
    statusIq: true,
    frameIq: true,
    resourceIq: true,
    droneIq: true,
    leadShots: true,
    // Not the highest aggression on the roster, deliberately. Firing anchors
    // movement, so "attack at every opportunity" measured worse than HARD.
    // EXTREME wins on *which* shots it takes and on never being where the last
    // one landed, not on volume of fire.
    aggression: 0.72,
    dashChance: 0.18,
    // Two dashes in hand. Three left EXTREME unable to use sustained thrust at
    // all — it repositioned at walking pace to protect boost it never spent, and
    // measured a third of a health bar *behind* HARD. One let the defensive
    // ladder drain it to empty and spend barrier instead. Managing a resource
    // means spending it well, not hoarding it and not running it dry.
    boostReserveDashes: 2,
    evadeDashChance: 0.7,
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
  /**
   * Clearance the movement solver achieved on its best heading, in pixels.
   *
   * Negative means even the best available dodge still ends inside a shot. That
   * is the signal the defensive ladder needs: it is the difference between "I am
   * dodging this" and "I cannot dodge this and must spend a barrier".
   */
  private lastClearance = Infinity;

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

  /**
   * Who this pilot is, as opposed to how good they are.
   *
   * Read from the machine being flown rather than passed in, so a rival picked
   * on the select screen arrives with its pilot's habits already attached and
   * nothing has to remember to wire them up. See `ai/Playstyles.ts`.
   */
  private style(self: Combatant): Playstyle {
    return playstyleFor(self.def.id);
  }

  private get skill(): number {
    return this.p.skill;
  }

  private get reactionTicks(): number {
    return this.p.reaction;
  }

  /**
   * Preferred fighting distance, in logical pixels.
   *
   * Below `rangeIq` this is the old flat number. Above it, the rival works out
   * where it actually wants to stand from four facts a player reads the same
   * way: how far its own guns reach, how far the opponent's do, how fast each
   * machine is, and — with `tempoIq` — who is ahead.
   *
   * The reasoning, in order:
   *
   * **Reach.** Out-ranging someone is only worth anything if you sit *outside*
   * their reach and inside your own. Being out-ranged means standing off is a
   * losing trade by definition, so the answer is to close, not to back away.
   *
   * **Speed.** Holding a gap you cannot maintain is worse than not trying: a
   * slower machine that tries to kite simply gets caught at a bad range with no
   * boost left. A rival that cannot out-run its opponent commits instead.
   *
   * **A shielded opponent has unlimited reach**, since a burst removes the
   * lifetime that bounds every shot. There is no standing off that.
   */
  private preferredRangeFor(self: Combatant, foe: Combatant): number {
    // **A Speed burst is a closing tool, and holding a firing line wastes it.**
    //
    // The rival used to ignore its own saturation entirely — it read `foe.satActive`
    // for the opponent's reach and never once looked at its own — so a pilot with
    // free, unlimited dashing kept standing at exactly the range it had been
    // standing at. That is the whole mode thrown away: what a Speed burst buys is
    // the ability to be somewhere else immediately, and the only thing worth
    // spending that on is the distance to a sword.
    //
    // Deliberately at every tier, not gated behind `rangeIq`. "I have a movement
    // burst, so I should move" is not a subtle read.
    if (self.speedActive) {
      const want = self.def.meleeRange * (self.satDesperate ? 0.75 : 0.95);
      return Math.max(self.def.rig.hurtRadius * 3, want);
    }

    // **A slowed machine cannot hold a range.** Cryo cuts movement and
    // acceleration, so a pilot who keeps trying to kite through it simply gets
    // caught at the distance the *opponent* chose, which is the worst of both.
    // Closing is the answer: it is the one direction the opponent is helping.
    const chilled = this.p.statusIq && self.status.speedScale < 0.95;

    // The pilot's own preference scales whatever the tier works out, so a
    // marksman stands off and a brawler crowds in at every difficulty rather
    // than only once `rangeIq` unlocks.
    const styleMul = this.style(self).rangeMul * (chilled ? 0.72 : 1);
    if (!this.p.rangeIq) return (300 - this.skill * 90) * styleMul;

    const mine = reachOf(self.def);
    const theirs = reachOf(foe.def);
    // A burst lifts the lifetime cap off every shot they fire, so their reach is
    // the whole arena for as long as it lasts. Kiting is not an option.
    const theirMax = foe.satActive ? Number.POSITIVE_INFINITY : theirs.max;
    const faster = mine.topSpeed >= theirs.topSpeed * 0.98;

    let want: number;
    if (mine.max > theirMax * 1.05 && faster) {
      // Out-range them and able to hold the gap: sit just past their reach.
      want = Math.min(theirMax * 1.1, mine.max * 0.9);
    } else if (theirMax > mine.max * 1.05 || !faster) {
      // Out-ranged, or too slow to keep away from them. Standing off loses;
      // close to where this machine's own numbers are good.
      want = Math.max(mine.melee * 1.25, mine.max * 0.32);
    } else {
      // Comparable machines: fight inside my own effective envelope.
      want = mine.max * 0.55;
    }

    // Without its drone a pilot has lost its passive and its sub-weapon, so the
    // exchange it was winning a moment ago is not the exchange it is in now.
    // Give ground while the escort rebuilds rather than trading at a deficit.
    if (this.p.droneIq && self.supporter.rebuilding) want *= 1.2;

    if (this.p.tempoIq) {
      // Play the score. A lead is worth protecting with distance; a deficit will
      // not close itself from across the yard.
      const edge =
        self.life / self.def.gauges.maxLife - foe.life / foe.def.gauges.maxLife;
      if (edge > 0.15) want *= 1.22;
      else if (edge < -0.15) want *= 0.72;
    }

    // Never so close it is standing inside them, nor further than the arena.
    return Math.max(self.def.rig.hurtRadius * 3, Math.min(want, 900));
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
    /**
     * A dash is the evasion, and it is spent **on the threat, not on the
     * tactic**.
     *
     * The Evade tactic persists for tens of ticks; dashing on a timer for all of
     * them costs 12 boost every eight ticks against a 0.9/tick regen that the
     * spending itself keeps resetting — permanently net-negative, and measured
     * at EXTREME sitting below one dash of boost for 59 % of a match. Requiring
     * a shot that is actually about to arrive turns it into one dash per danger,
     * which is what the move is for and what the gauge can pay for.
     *
     * It may spend the reserve — that is what the reserve is *for*. Sustained
     * thrust may not; see `chooseMovement`.
     */
    this.dashCharge--;
    const imminent = incoming !== null && incoming.ttc <= 10;
    const evadeDash = this.tactic === AiTactic.Evade && imminent;
    const floor = evadeDash ? 0 : this.boostReserve(self);
    // Free dashing changes what a dash is *for*.
    //
    // Outside a Speed burst the gauge is a budget, so the rival approaches on
    // sustained thrust (cheaper per pixel) and saves dashes for emergencies.
    // Inside one there is no budget, so the cheap option is the good option:
    // dash to close, and dash out of every incoming line. This is the other half
    // of what the mode is for — the mech that can be somewhere else for free
    // should be somewhere else a great deal more often.
    const free = self.boostFree;
    const approachDash = this.tactic === AiTactic.Approach && (free || dist > 340);
    const wantsDash =
      (evadeDash || approachDash) &&
      this.dashCharge <= 0 &&
      self.boost >= self.def.flight.dashCost + floor &&
      (mx !== 0 || my !== 0) &&
      // Twitchiness is the pilot's: CIRRUS is never still, TERRAMOTH walks.
      this.rng.chance(
        clamp(
          (evadeDash ? this.p.evadeDashChance : this.p.dashChance) *
            this.style(self).dashMul *
            (free ? 1 + (SPEED_BURST_DASH - 1) * this.skill : 1),
          0,
          1,
        ),
      );
    if (wantsDash) {
      pressed.v |= 1 << Btn.Boost;
      held.v |= 1 << Btn.Boost;
      // Self-regulating: dash freely on a full tank, back off as it empties, so
      // the rate finds its own sustainable level instead of being a fixed number
      // that is either wasteful or timid. A flat 22 kept the gauge healthy and
      // cost EXTREME its whole margin over HARD; scaling it restores the margin
      // *and* the economy, because the tier that husbands boost best is then the
      // tier that gets to dash most.
      const frac = self.boost / self.def.flight.maxBoost;
      this.dashCharge = evadeDash
        ? Math.round(18 - this.skill * 8 + (1 - frac) * 18)
        : 40 - Math.round(this.skill * 18);
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
     *
     * There was a `perfectBarrier` flag here — press as late as possible so the
     * invulnerability covers the impact — and it was removed because ablation
     * showed it changing **nothing**, for a reason worth writing down: a burst
     * grants 36 ticks of invulnerability against a 9-tick tracking window. The
     * cover is four times longer than the whole window, so *when* inside it the
     * button goes down cannot matter. Perfect timing is not a skill this game's
     * numbers reward. What separates the tiers is `barrierChance` — whether the
     * rival reaches for the gauge at all — and the ladder below it.
     */
    const barrierWindow =
      incoming !== null && incoming.ttc <= Math.max(9, this.reactionTicks + 3) && incoming.ttc >= 0;

    /**
     * The defensive ladder: **dodge, then burst, then guard.**
     *
     * A barrier burst costs 30 and locks movement for six ticks; a dash costs 12
     * and leaves you free. So moving out of the way is always the first answer,
     * and the gauge is for the shots that movement cannot solve. `cornered` is
     * the rung-change: no boost for a dash, or the solver reporting that even its
     * best heading still ends inside the shot.
     *
     * Note that being out of boost never stops the rival *trying* to evade — the
     * Evade tactic still sets a heading and the mech still moves, just at
     * ordinary thrust. What changes is that it stops relying on the dodge and
     * starts spending barrier to survive.
     */
    const canDash = self.boost >= self.def.flight.dashCost && this.dashCharge <= 0;
    const dodgeFails = this.p.threatSolver && this.lastClearance < 0;
    const cornered = barrierWindow && (!canDash || dodgeFails);

    const shouldBarrier =
      canBarrier &&
      barrierWindow &&
      // Turtles guard; skirmishers would rather not be there at all. The
      // cornered floor is untouched — that branch is 'nothing else will work',
      // and no characterisation should talk a pilot out of it.
      this.rng.chance(
        cornered
          ? Math.max(this.p.barrierChance, 0.85)
          : clamp(this.p.barrierChance * this.style(self).guardMul, 0, 1),
      );

    if (shouldBarrier) {
      // Barrier burst absorbs the shot and feeds saturation — the good answer.
      pressed.v |= 1 << Btn.Barrier;
      held.v |= 1 << Btn.Barrier;
      this.guardTicks = 26;
    } else if (
      !self.shieldActive &&
      incoming !== null &&
      self.barrier > 0 &&
      // The bottom rung. Either riding out the moments after a burst, or —
      // and this is the new part — cornered with too little gauge to burst at
      // all. Holding costs nothing up front and still takes 80 % off gunfire,
      // which beats eating the shot clean because the burst was unaffordable.
      (this.guardTicks > 0 ||
        (cornered && self.barrier < self.def.barrier.cost)) &&
      self.barrier > self.def.gauges.maxBarrier * 0.08
    ) {
      // Held, never pressed: `isPressed` is what triggers a burst, `isHeld` is
      // what raises a guard. Setting only `held` keeps these two apart.
      held.v |= 1 << Btn.Barrier;
    }

    // ---- Saturation --------------------------------------------------------
    if (!self.satActive && self.sat >= self.def.gauges.maxSaturation) {
      const wantMode = this.chooseSatMode(self, foe, dist);
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

    const lead = this.p.leadShots ? this.leadAim(self, foe) : null;

    return {
      dx: mx,
      dy: my,
      held: finalHeld,
      pressed: realPressed,
      aimX: lead ? lead.x : null,
      aimY: lead ? lead.y : null,
    };
  }

  /**
   * Where to point the mounts so a shot and a moving target arrive together.
   *
   * Nothing but a drone's own volley homes, so aiming at where the opponent *is*
   * aims at where they *were* by the time the shot crosses the gap — at 700 px
   * against a boosting mech that is most of a chassis width of miss, every time.
   * The rival was geometrically incapable of landing long-range fire.
   *
   * Solves the standard intercept: with `d` the offset to the target, `v` its
   * velocity and `s` the shot's speed, the flight time `t` satisfies
   * `|d + v t| = s t`, which expands to `(v·v - s²)t² + 2(v·d)t + d·d = 0`.
   * The smallest positive root is the first moment they can meet.
   *
   * Returns null — falling back to the plain lock — when there is no solution
   * (the target is outrunning the shot), when the intercept lies beyond what the
   * weapon can actually reach, or when the target is barely moving and the lead
   * would be noise. Emitted as manual aim, which is the same input a human
   * produces, so this stays inside the fairness rule.
   */
  private leadAim(self: Combatant, foe: Combatant): { x: number; y: number } | null {
    const a = self.def.main;
    const speed = a.projSpeed * self.satProjSpeedScale;
    if (speed <= 0.001) return null;

    const dx = foe.x - self.x;
    const dy = foe.y - self.y;
    // Not worth leading a target that is holding still; the plain lock is
    // already exact and a spurious lead only introduces error.
    const vlen = Math.hypot(foe.vx, foe.vy);
    if (vlen < 0.6) return null;

    const qa = foe.vx * foe.vx + foe.vy * foe.vy - speed * speed;
    const qb = 2 * (foe.vx * dx + foe.vy * dy);
    const qc = dx * dx + dy * dy;

    let tHit: number;
    if (Math.abs(qa) < 1e-6) {
      // Target moving at exactly the shot's speed: the quadratic degenerates.
      if (Math.abs(qb) < 1e-6) return null;
      tHit = -qc / qb;
    } else {
      const disc = qb * qb - 4 * qa * qc;
      // No real root means the shot cannot catch them at all.
      if (disc < 0) return null;
      const root = Math.sqrt(disc);
      const t1 = (-qb - root) / (2 * qa);
      const t2 = (-qb + root) / (2 * qa);
      const pos = [t1, t2].filter((v) => v > 0);
      if (pos.length === 0) return null;
      tHit = Math.min(...pos);
    }

    // A shot dies on a timer rather than at a wall, so an intercept the weapon
    // cannot stay alive long enough to reach is not an intercept.
    if (!Number.isFinite(tHit) || tHit > a.projLife) return null;

    const ax = dx + foe.vx * tHit;
    const ay = dy + foe.vy * tHit;
    const len = Math.hypot(ax, ay);
    if (len < 0.001) return null;
    return { x: ax / len, y: ay / len };
  }

  private pickTactic(
    self: Combatant,
    foe: Combatant,
    dist: number,
    threatened: boolean,
    foeCommitted: boolean,
  ): AiTactic {
    const pref = this.preferredRangeFor(self, foe);
    const lifeFrac = self.life / self.def.gauges.maxLife;

    /**
     * **Standing in fire outranks every other consideration.**
     *
     * The Evade tactic is normally reached through `nearestThreat`, which scores
     * an incoming shot by time-to-contact — and a placed hazard never arrives,
     * so it produced no threat, no Evade, and no call to the movement solver.
     * The rival would settle into `Hold` inside a burning patch and take the
     * damage until it went out. A hazard you are already inside is the most
     * certain damage on the field; nothing else is worth deciding first.
     */
    if (this.standingInHazard(self)) return AiTactic.Evade;

    // Someone hiding behind a guard or a Shield burst is taking a fraction of
    // anything shot at them and several times as much from a sword. Go and get
    // them rather than plinking at a wall.
    if (this.p.closeOnGuard && (foe.guarding || foe.shieldActive) && dist > self.effectiveMeleeRange) {
      return AiTactic.Approach;
    }

    // Wait out the last of a Shield burst rather than trading into it: every
    // shot spent on it is absorbed for nothing *and* feeds their next meter.
    if (
      this.p.resourceIq &&
      foe.satActive &&
      foe.satMode === SatMode.Shield &&
      foe.satTicks > 30 &&
      dist < pref
    ) {
      return AiTactic.Retreat;
    }

    // An opponent with no boost cannot dodge and no barrier cannot guard. That
    // is the moment the fight is decided, and it does not last.
    if (
      this.p.resourceIq &&
      !foe.satActive &&
      foe.boost < foe.def.flight.dashCost &&
      foe.barrier < foe.def.gauges.maxBarrier * 0.3
    ) {
      return AiTactic.Approach;
    }

    // A wounded enemy drone is one kill from being gone for the match — but only
    // worth taking when it is *already* the nearer target.
    //
    // Measured: the first cut said "worth crossing the yard for", which in
    // practice reduced to returning Approach on almost every re-roll, because a
    // wounded drone is nearly always further than melee range. EXTREME abandoned
    // its spacing to chase an escort and **lost 0.09 of a life bar to HARD** for
    // it. The kill is a bonus to collect, not a plan to follow.
    if (
      this.p.droneIq &&
      foe.supporter.hittable &&
      foe.supporter.lifeFraction < 0.3 &&
      foe.supporter.rebuildsLeft === 0
    ) {
      const dd = Math.hypot(foe.supporter.x - self.x, foe.supporter.y - self.y);
      if (dd < dist * 0.75 && dd < reachOf(self.def).max * 0.6) return AiTactic.Approach;
    }

    if (threatened && foeCommitted && this.rng.chance(0.35 + this.skill * 0.35)) {
      return AiTactic.Evade;
    }
    // Wounded rivals give ground more readily — **unless they are mid-Speed
    // burst**, which is the one state where being hurt is the reason to commit
    // rather than to back off.
    //
    // This was the single biggest thing stopping a desperate Speed burst from
    // doing anything. A desperate burst is by definition opened at or under a
    // third of a life bar, so this line fired on almost every tactic re-roll
    // inside one and sent the pilot backwards 40 % of the time — while holding
    // free unlimited dashes and a sword that reaches across the screen.
    const holdGround = self.speedActive && this.rng.chance(this.skill);
    if (lifeFrac < 0.3 && !holdGround && this.rng.chance(0.4)) return AiTactic.Retreat;

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
        // Sustained thrust is rationed by distance normally, because it costs.
        // While the gauge is free there is nothing to ration, so close under
        // full power whatever the range.
        this.wantBoost = self.boostFree || dist > 380;
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
        mx = dist > this.preferredRangeFor(self, foe) ? sx : -sx;
        break;
      case AiTactic.Hold:
        mx = 0;
        my = Math.abs(dyRaw) > 90 ? Math.sign(dyRaw) : 0;
        break;
      case AiTactic.Evade: {
        // Sustained thrust is the *slow* way out of a shot's path. The dash is
        // the evasion, and it is handled in `think`; holding boost here as well
        // just empties the gauge before the next emergency.
        this.wantBoost = false;
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

    // There was an off-axis approach here — carry a vertical component so the
    // closing run does not come straight down the opponent's nose. It measured
    // as a net loss twice, unconditionally and gated on the opponent actually
    // firing, and it is easy to see why: every approach becomes diagonal, which
    // closes more slowly, and the arena is wide enough that the angle saved less
    // than the delay cost. `rangeIq` and `closeOnGuard` turned out to be the
    // approach improvements that pay.

    // The boost reserve, applied to every tactic at once rather than restated in
    // each. Sustained thrust is for covering ground; whatever is set aside here
    // stays available for the dashes that actually dodge.
    if (this.wantBoost && self.boost <= this.boostReserve(self)) this.wantBoost = false;

    this.dirX = mx;
    this.dirY = my;
  }

  /** Boost held back for dashes rather than spent on sustained thrust. */
  private boostReserve(self: Combatant): number {
    // Nothing to reserve when dashing is free. Holding a floor through a Speed
    // burst is pure waste: the gauge is not being spent, so the rival was
    // rationing a resource it could not run out of.
    if (self.boostFree) return 0;
    return this.p.boostReserveDashes * self.def.flight.dashCost;
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
  /** Is the mech currently inside a placed hazard — a mine, or burning ground? */
  private standingInHazard(self: Combatant): boolean {
    for (const p of this.seenProjectiles) {
      if (!p.active || p.team === self.team) continue;
      if (Math.hypot(p.vx, p.vy) >= PLACED_SPEED) continue;
      if (Math.hypot(p.x - self.x, p.y - self.y) < p.radius + self.def.rig.hurtRadius) return true;
    }
    return false;
  }

  private solveEvade(self: Combatant, arenaW: number, arenaH: number): { x: number; y: number } | null {
    /**
     * **Placed hazards are not shots, and must not be scored like them.**
     *
     * A mine or a burning ember does not travel, so the question it poses is
     * "where do I end up", not "what is the closest I come on the way". Scoring
     * them like incoming fire froze the rival solid inside a hazard field:
     * standing still holds a constant distance, while *every* escape route
     * brushes past some ember en route, so holding position won the comparison
     * and the mech sat in the flames until they went out.
     */
    const moving: Projectile[] = [];
    const placed: Projectile[] = [];
    for (const p of this.seenProjectiles) {
      if (!p.active || p.team === self.team) continue;
      if (Math.hypot(p.x - self.x, p.y - self.y) > 560) continue;
      (Math.hypot(p.vx, p.vy) < PLACED_SPEED ? placed : moving).push(p);
    }
    if (moving.length === 0 && placed.length === 0) return null;

    /** Already standing in something that burns. Holding position is not an option. */
    const standingIn = placed.some(
      (p) => Math.hypot(p.x - self.x, p.y - self.y) < p.radius + self.def.rig.hurtRadius,
    );

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
      // Moving shots: the whole path matters, because being hit anywhere along
      // it is being hit.
      for (let t = 3; t <= HORIZON; t += 3) {
        const px = self.x + vx * t;
        const py = self.y + vy * t;
        for (const p of moving) {
          const d = Math.hypot(p.x + p.vx * t - px, p.y + p.vy * t - py) - p.radius;
          if (d < closest) closest = d;
        }
      }

      const endX = self.x + vx * HORIZON;
      const endY = self.y + vy * HORIZON;

      // Placed hazards: only the destination matters. Clipping the edge of one
      // ember to reach open ground is a trade worth making, and treating it as
      // a failure is what caused the freeze.
      let placedClear = Infinity;
      for (const p of placed) {
        const d = Math.hypot(p.x - endX, p.y - endY) - p.radius;
        if (d < placedClear) placedClear = d;
      }

      let score = Math.min(closest, placedClear);
      // Flying into a wall to dodge one shot loses the next exchange. Weighted
      // heavily enough to override any clearance a corner could offer.
      if (endX < margin || endX > arenaW - margin) score -= 280;
      if (endY < margin || endY > arenaH - margin) score -= 280;
      // Standing still is never the confident answer while under fire — and
      // while *inside* a hazard it is not an answer at all, since the damage is
      // arriving whether or not anything is aimed at you.
      if (dx === 0 && dy === 0) score -= standingIn ? 4000 : 45;

      if (score > bestScore) {
        bestScore = score;
        best = { x: dx, y: dy };
        // The raw clearance, not the wall-penalised score — the ladder wants to
        // know whether the shot is escapable, not whether the escape is tidy.
        this.lastClearance = closest;
      }
    }
    return best;
  }

  private chooseAttack(self: Combatant, dist: number, foe: Combatant): Btn | null {
    const d = self.def;

    // Melee range: commit to the sword chain on its own button.
    //
    // `effectiveMeleeRange`, not `def.meleeRange` — a desperate Speed burst
    // extends the lock ninefold, and gating on the base figure meant the buff
    // existed and the rival could not reach for it.
    if (dist < self.effectiveMeleeRange) {
      // **Never swing into a live repel.** A barrier burst throws the opening
      // strike back at whoever made it, for `MELEE_REPEL_STUN` — a full second
      // of helplessness, the worst single outcome available to an attacker.
      // Without `frameIq` the rival walks into it blind.
      if (this.p.frameIq && foe.repelTicks > 0 && foe.meleeHitsTaken === 0) return null;

      // Melee is the one thing a guard barely stops and the only way through a
      // Shield burst, so a rival that reads the defence swings into it.
      const turtling = this.p.closeOnGuard && (foe.guarding || foe.shieldActive);
      // Appetite is the pilot's, and it is where a long combo chain pays: CIRRUS
      // swings at nearly everything, VESPER would much rather be elsewhere.
      let want = clamp(0.5 + this.skill * 0.45 + this.style(self).meleeAppetite, 0.05, 0.98);
      // A target that cannot move is a target that cannot leave the swing. This
      // is the read that makes NULLTIDE's Cryo a plan rather than an accident.
      if (this.p.statusIq && foe.status.speedScale < 0.95) want = Math.min(0.98, want + 0.3);
      // Nor can one with no dash available and nothing left to spend on one.
      if (this.p.frameIq && foe.dashCooldown > 0 && foe.boost < foe.def.flight.dashCost) {
        want = Math.min(0.98, want + 0.2);
      }
      return this.rng.chance(turtling ? 0.95 : want) ? Btn.Melee : null;
    }

    // **Do not fire into invulnerability.** Every shot thrown at a mech inside
    // its i-frames is discarded, and firing anchors movement — so it is not a
    // wasted shot, it is a wasted shot *and* a free positional loss.
    if (this.p.frameIq && foe.invuln > 2 && !foe.shieldActive) return null;

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
    let exposed =
      this.p.punishRecovery &&
      (foe.act === ActState.Hitstun || foe.satBurnout > 0 || foe.guardBreakStun > 0);

    // Slowed counts as exposed: they cannot clear the shot's path in time. The
    // element chose the opening; this is what notices it.
    if (this.p.statusIq && foe.status.speedScale < 0.9) exposed = true;

    // So does having no way to dodge — an empty boost gauge with the dash still
    // cooling is a mech that has to eat whatever arrives.
    if (this.p.frameIq && foe.dashCooldown > 0 && foe.boost < foe.def.flight.dashCost) {
      exposed = true;
    }

    // A guard about to break is worth leaning on, and a burst about to end is
    // worth *not* leaning on — the shots spent on its last few ticks are
    // absorbed for nothing and hand them meter for the next one.
    if (this.p.resourceIq) {
      if (foe.guarding && foe.barrier < foe.def.gauges.maxBarrier * 0.25) exposed = true;
      if (foe.satActive && foe.satMode === SatMode.Shield && foe.satTicks > 20) return null;
    }

    // Personality scales the tier's willingness to attack at all. Above 1 is a
    // real trade, not a free upgrade: firing anchors movement, which is why
    // EXTREME's base aggression is deliberately lower than HARD's.
    const aggro = clamp(this.p.aggression * this.style(self).aggressionMul, 0, 1);
    const roll = this.rng.next();
    if (roll > (exposed ? Math.min(1, aggro + 0.25) : aggro)) return null;

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
     * Do not re-apply an element that is already running.
     *
     * A status refresh replaces the countdown rather than stacking, so a shot
     * landed on a target already deep in the same effect buys the difference
     * between what is left and a full duration — and nothing else. When both
     * weapons are affordable and they carry *different* elements, the one the
     * target is not already carrying is strictly the better shot.
     */
    if (this.p.statusIq && heavy && foe.status.active) {
      const running = foe.status.element;
      const mainEl = d.main.element ?? Element.None;
      const heavyEl = d.heavy.element ?? Element.None;
      const fresh = foe.status.fraction > 0.5;
      if (fresh && mainEl === running && heavyEl !== running && heavyEl !== Element.None) {
        return Btn.Heavy;
      }
      if (fresh && heavyEl === running && mainEl !== running) {
        return canPay(d.main.energyCost) ? Btn.Main : null;
      }
    }

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

  /**
   * Which burst to spend.
   *
   * The survival override outranks characterisation — nobody's personality is
   * worth losing a match over — but everything below it is the pilot's own
   * preference, which is one of the most legible personality tells in the game.
   * A pilot who prefers SPEED still takes SHIELD when they are about to die.
   */
  /**
   * Which burst to spend on the brink.
   *
   * Above the desperation line a preference may only widen a window (D64); here
   * it drives an actual decision, because down here every mode is worth having
   * and the wrong one is no longer simply a loss. Two inputs, weighted together:
   *
   * **Who the pilot is.** A pilot whose kit is a sword wants the two modes that
   * deliver one — SPEED for true damage and reach, SHIELD because total
   * invulnerability is how you *get* to sword range against someone shooting at
   * you. A pilot who fights at range wants SHOOT.
   *
   * **What is actually happening.** Personality picks the favourite; the fight
   * decides whether the favourite is right this second. Someone hiding behind a
   * guard is immune to most of SHOOT and helpless against SPEED's true damage.
   * A screen full of incoming fire makes invulnerability worth more than either
   * of the offensive modes. Standing off with a clear line makes SHOOT worth
   * more than a sword you cannot reach with.
   *
   * Scores rather than a branch ladder: the two inputs have to be able to
   * outvote each other, and a ladder of `if`s cannot express "usually the sword,
   * but not while four missiles are inbound".
   */
  private desperationMode(self: Combatant, foe: Combatant | null, dist: number): SatMode {
    const style = this.style(self);

    // Personality. `meleeAppetite` runs about -0.2 to +0.25 across the roster,
    // so these coefficients put it on the same scale as the situational terms.
    let shield = style.meleeAppetite * 1.2;
    let speed = style.meleeAppetite * 1.8;
    let shoot = style.meleeAppetite * -1.5;

    // The declared favourite still counts, and counts for more than any single
    // situational term — this is the pilot's signature move.
    if (style.satPreference === SatMode.Shield) shield += 1.4;
    else if (style.satPreference === SatMode.Speed) speed += 1.4;
    else shoot += 1.4;

    // ---- the situation ---------------------------------------------------
    //
    // Gated on `weaponIq`, exactly as every other read in this class is. Without
    // it the ladder compressed: a burst is a large share of a match's outcome,
    // so handing EASY the same situational judgement as EXTREME measured as
    // NORMAL *losing* to EASY. The lower tiers get their pilot's favourite and
    // have to live with it, which is what being a lower tier means.
    if (!this.p.weaponIq) {
      if (shield >= speed && shield >= shoot) return SatMode.Shield;
      return speed >= shoot ? SatMode.Speed : SatMode.Shoot;
    }

    if (foe) {
      // Turtling: SHOOT is the one thing a guard and a Shield burst both stop
      // well, and SPEED's melee ignores every reduction there is.
      if (foe.guarding || foe.shieldActive) {
        speed += 1.1;
        shoot -= 0.7;
      }
      // Their drone is out and shooting: one more source of chip to be immune to.
      if (foe.supporter.onStation) shield += 0.15;
    }

    // Incoming fire. Invulnerability is worth most when there is something to be
    // invulnerable to, and closing under it is the only free approach in the game.
    const inbound = this.seenProjectiles.reduce(
      (n, p) => (p.active && p.team !== self.team ? n + 1 : n),
      0,
    );
    shield += Math.min(1.2, inbound * 0.28);

    // Range. A sword you cannot reach with is worth nothing, and the desperate
    // SPEED reach is enormous — so this asks whether closing is plausible at all
    // rather than whether the sword reaches from here.
    const reach = reachOf(self.def);
    if (dist > reach.max * 0.75) {
      shoot += 0.7;
      speed -= 0.3;
    } else if (dist < 340) {
      speed += 0.5;
      shield += 0.25;
    }

    // Being out-run means the range is not yours to choose; standing and firing
    // beats chasing someone you cannot catch.
    if (foe && reachOf(foe.def).topSpeed > reach.topSpeed * 1.05) shoot += 0.35;

    if (shield >= speed && shield >= shoot) return SatMode.Shield;
    return speed >= shoot ? SatMode.Speed : SatMode.Shoot;
  }

  private chooseSatMode(self: Combatant, foe: Combatant | null, dist: number): SatMode {
    const lifeFrac = self.life / self.def.gauges.maxLife;
    const pref = this.style(self).satPreference;

    // A pilot's preference **widens the window their favourite mode already
    // wins in**; it never overrides the situation.
    //
    // The first cut let `satPreference` decide outright and it was measured as
    // the single most destructive thing in this whole file: roster spread went
    // from 0.555 to 0.944, and CIRRUS — the pilot the feature was designed
    // around — fell from -0.11 to -0.43. The cause is not the personalities, it
    // is that SHOOT is simply the strongest burst right now (see the forced-
    // SHIELD trade table in the handoff's open questions), so *any* pilot told
    // to prefer something else was being told to lose. Nudging the thresholds
    // keeps the characterisation legible and costs almost nothing: measured at
    // 0.585 spread against 0.555 for no playstyles at all.
    // At or below the desperation threshold, every mode's form is enormous, so
    // the choice becomes a real read rather than a defaulted one.
    if (lifeFrac <= DESPERATION_LIFE) return this.desperationMode(self, foe, dist);

    // Above it, a preference only widens the window its mode already wins in;
    // see the ablation in D64 for why it may not do more than that.
    if (pref === SatMode.Shield && lifeFrac < 0.5) return SatMode.Shield;
    const speedAt = pref === SatMode.Speed ? 340 : 220;
    if (dist < speedAt) return SatMode.Speed;
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
