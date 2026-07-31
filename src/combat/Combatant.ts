import type { DronePassiveDef, MechDef, SwingArc } from '../mechs/MechDef';
import type { AttackDef } from './AttackData';
import { ATTACK_TOTAL } from './AttackData';
import { CommandBuffer, MOTIONS, Sym, dirFrom } from './CommandBuffer';
import { clampToArena, stepFlight, type FlightIntent, type FlightState } from './FlightModel';
import {
  ActState,
  BarrierResponse,
  Btn,
  Phase,
  ProjKind,
  SAT_MODE_COUNT,
  SatMode,
  Team,
  isHeld,
  isPressed,
  type InputFrame,
  type ProjectileSpawn,
  type SimEvent,
} from './types';
import { DEG, approachAngle, clamp, angleDelta, lerp } from '../core/MathUtil';
import { Supporter } from './Supporter';
import { Element, StatusState } from './Status';

/** Radians per tick a melee lunge may correct toward its target. */
const MELEE_TRACK_RATE = 9 * DEG;

/**
 * Arm angle at normalised swing progress `t`, in radians relative to the aim.
 *
 * Two phases, matching how the reference drove its arm helper: the arm winds
 * back to `windup`, then sweeps `sweep` degrees through the target and past it.
 * The slash decelerates — the reference's command curve was `k*time/(time+1)`,
 * which is fast off the mark and eases into the follow-through — so the blade
 * is quickest exactly where the hit lands.
 *
 * `hitIndex` mirrors alternate swings, so a chain reads as left, right, left
 * rather than the same stroke repeated.
 *
 * Sign convention: positive `windup`/`sweep` are authored as "raised" and
 * "sweeping downward", which is how you would describe the move out loud. Screen
 * space has y pointing down, so the result is negated on the way out — a raised
 * blade is a negative rotation.
 */
export function swingArcAngle(arc: SwingArc, t: number, hitIndex: number): number {
  const k = clamp(t, 0, 1);
  const dir = arc.alternate && hitIndex % 2 === 1 ? -1 : 1;
  const wf = clamp(arc.windupFrac, 0.05, 0.95);

  let deg: number;
  if (k <= wf) {
    // Wind back, easing out so the arm settles at the top of the swing.
    const w = k / wf;
    deg = arc.windup * (1 - (1 - w) * (1 - w));
  } else {
    // Slash through, decelerating into the follow-through.
    const s = (k - wf) / (1 - wf);
    deg = arc.windup - arc.sweep * (1 - Math.pow(1 - s, 2.4));
  }
  return -deg * DEG * dir;
}

/**
 * Forward extension at normalised swing progress `t`, in logical pixels.
 *
 * Companion to `swingArcAngle`. The arc rotates the arm; this throws it along
 * the aim, which is what separates a stab from a slash. Each motion has a
 * distinctly different curve because each weapon is used differently:
 *
 * - `thrust` draws back, then stabs out and decelerates into the hit.
 * - `bash` shoves and returns within the swing — a shield does not stay extended.
 * - `piston` holds still while cocked, then fires almost instantaneously. The
 *   exponent is deliberately brutal: a pile driver has no follow-through.
 *
 * Returns 0 for `swing`, so existing blades are untouched.
 */
export function swingReach(arc: SwingArc, t: number, _hitIndex: number): number {
  const motion = arc.motion ?? 'swing';
  const R = arc.reach ?? 0;
  if (motion === 'swing' || R === 0) return 0;

  const k = clamp(t, 0, 1);
  const wf = clamp(arc.windupFrac, 0.05, 0.95);

  if (motion === 'piston') {
    // Cocked and motionless, then a single violent stroke.
    if (k <= wf) return 0;
    const s = (k - wf) / (1 - wf);
    return R * (1 - Math.pow(1 - s, 6));
  }

  // Both remaining motions pull back before committing.
  const drawBack = motion === 'bash' ? 0.15 : 0.22;
  if (k <= wf) return -R * drawBack * (k / wf);

  const s = (k - wf) / (1 - wf);
  if (motion === 'bash') {
    // Out and back inside the active window, so the shove reads as an impact
    // rather than a lunge that leaves the mech hanging forward.
    return R * Math.sin(Math.PI * Math.min(1, s * 1.35));
  }
  // thrust: straight out, easing into the extension.
  return R * (1 - Math.pow(1 - s, 3));
}

/** Velocity retained per tick while an attack is committed — firing anchors you. */
function moveScaleFor(kind: ProjKind): number {
  switch (kind) {
    case ProjKind.Beam:
      return 0.24;
    case ProjKind.Heavy:
      return 0.55;
    case ProjKind.Missile:
      return 0.76;
    case ProjKind.Melee:
      return 1;
    default:
      return 0.9;
  }
}

export interface CombatantInit {
  id: number;
  team: Team;
  def: MechDef;
  x: number;
  y: number;
  facing: 1 | -1;
}

export class Combatant implements FlightState {
  readonly id: number;
  readonly team: Team;
  readonly def: MechDef;

  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  boost = 100;
  boostRegenTimer = 0;
  dashTicks = 0;
  dashCooldown = 0;
  dashDirX = 1;
  dashDirY = 0;

  facing: 1 | -1 = 1;
  /** Chassis bank angle (radians), purely visual but simulated for determinism. */
  bank = 0;
  /** Weapon-mount aim angle (radians, world space). */
  aim = 0;
  /**
   * Arm/blade angle relative to the aim, in radians.
   *
   * Named `spin` historically, when melee just rotated the blade continuously.
   * It now carries an authored swing arc (see `MeleeProfile.arc`).
   */
  spin = 0;
  /**
   * True while an arm swing is playing, so the renderer carries the arm through
   * the arc. This is a separate flag rather than `attack?.kind === Melee`
   * because the lock-on sequence never sets `attack` — which is exactly why the
   * blade used to be dragged into the target instead of swung.
   */
  swinging = false;
  /**
   * Forward extension of the weapon arm in logical pixels, from `swingReach`.
   * Presentation only — the hit itself is driven by the attack's own range.
   */
  reach = 0;
  /**
   * Set by whichever melee path drove the arc this tick; folded into `swinging`
   * at the end of the step and cleared. Two fields because `updateVisualAngles`
   * runs last, so clearing the public flag there would blank it before the
   * renderer ever sees it.
   */
  private swingDriven = false;
  /** Smoothed idle hover bob phase. */
  bobPhase = 0;
  /**
   * Walk cycle phase in radians, advanced by distance covered on the ground so
   * the feet keep pace with the machine instead of scrubbing.
   */
  walkPhase = 0;
  /** Stride weight 0..1, eased so stopping settles rather than snapping. */
  stride = 0;

  /**
   * Active status affliction, mirroring the reference's `var(54)`.
   *
   * Ticked in `tickTimers`, i.e. before the hitstun early-return, so a burn
   * keeps burning while its victim is being combo'd.
   */
  readonly status = new StatusState();

  life: number;
  energy: number;
  barrier: number;
  sat = 0;

  satActive = false;
  satMode: SatMode = SatMode.Shield;
  satTicks = 0;

  act: ActState = ActState.Free;
  attack: AttackDef | null = null;
  attackTick = 0;
  /** Set once the current attack has spawned its hit. */
  attackFired = false;

  meleeCount = 0;
  meleeHitConfirmed = false;
  meleeChainQueued = false;
  /** Ticks until melee is available again. Blocks endless sword pressure. */
  meleeLockout = 0;

  /**
   * Active lock-on melee sequence, or null.
   *
   * One press commits the whole sequence: close on the target, then run `hits`
   * swings while repositioning around it. Modelled on the working Iron Babel
   * build's `meleeLock` rather than our old manually re-pressed chain.
   */
  meleeLock: {
    phase: 'close' | 'swing' | 'gap';
    timer: number;
    hitIndex: number;
    hitTimer: number;
    hitDone: boolean;
    life: number;
  } | null = null;

  /** Ticks the beam blade stays lit, so it persists across the swing gaps. */
  bladeTimer = 0;
  /** Set for one tick when a sequence opens, for the move-name banner. */
  announced: string | null = null;
  /** Ticks left in which a new melee chain may be started from recovery. */
  meleeChainGrace = 0;

  hitstop = 0;
  hitstun = 0;
  invuln = 0;
  guarding = false;
  guardBreakStun = 0;
  barrierRegenTimer = 0;
  barrierActiveTicks = 0;

  subCharges: number;
  subRecharge = 0;

  /**
   * Opposing mechs are always locked on to each other.
   *
   * This was a toggle on its own button. Free aim sounded like flexibility and
   * played as a way to accidentally disable your own tracking mid-fight; the
   * field stays so the aiming code reads the same, but nothing turns it off.
   */
  readonly lockEnabled = true;
  /**
   * FlyingMode. The reference kept this as `var(20)` with a player toggle and an
   * automatic switch-on during a Level 2 shot. Default on: this is an aerial
   * fighter first, and the floor is a place you choose to visit.
   */
  flying = true;
  /** True while resting on the arena floor. */
  grounded = false;
  /** Thruster intensity 0..1, for the renderer. */
  thrust = 0;
  /** Set for one tick when a shot is fired, for muzzle flashes. */
  firedThisTick: ProjKind | null = null;
  /** Set by stepMotion when a dash begins, consumed by step() to emit an event. */
  private dashStartedThisTick = false;
  private landedThisTick = false;
  /** Arena floor for this combatant; set by MatchSim. */
  groundY = Infinity;

  readonly cmd = new CommandBuffer();

  /**
   * The drone that carries this machine's sub-weapon.
   *
   * Owned here so it is created and discarded with its machine, but stepped by
   * `MatchSim` after both chassis have moved — keeping it out of this class's
   * branching step() is deliberate, because an early return in a hitstun or
   * attack branch is exactly how the melee lock-on once stopped updating.
   */
  readonly supporter: Supporter;

  constructor(init: CombatantInit) {
    this.id = init.id;
    this.team = init.team;
    this.def = init.def;
    this.x = init.x;
    this.y = init.y;
    this.facing = init.facing;
    this.aim = init.facing > 0 ? 0 : Math.PI;
    this.life = init.def.gauges.maxLife;
    this.energy = init.def.gauges.maxEnergy;
    this.barrier = init.def.gauges.maxBarrier;
    this.boost = init.def.flight.maxBoost;
    this.subCharges = init.def.subCharges;
    this.supporter = new Supporter(init.def.supporter, this);
  }

  /**
   * Orders the drone to fire `a`, spending a sub charge.
   *
   * Returns false — and emits `assistDenied` — when the charge is missing or the
   * drone is still busy, so the press is always answered with feedback instead
   * of being silently swallowed.
   */
  private orderAssist(a: AttackDef, events: SimEvent[]): boolean {
    const cost = a.subCost ?? 1;
    const s = this.supporter;
    if (this.subCharges < cost || !s.ready) {
      events.push({ t: 'assistDenied', x: s.x, y: s.y, ownerId: this.id });
      return false;
    }
    this.subCharges -= cost;
    s.order(a);
    events.push({ t: 'assist', x: s.x, y: s.y, angle: s.aim, ownerId: this.id });
    return true;
  }

  /**
   * Launches or recalls the drone.
   *
   * This is what the assist button does now — the press is a standing decision
   * about where the drone should be, not a request for one volley. A destroyed
   * drone answers with the refusal cue rather than with nothing, because a dead
   * button that makes no sound is indistinguishable from a dropped input.
   */
  private toggleDrone(events: SimEvent[]): void {
    const s = this.supporter;
    switch (s.toggle()) {
      case 'deploy':
        events.push({ t: 'droneDeploy', x: s.x, y: s.y, ownerId: this.id });
        break;
      case 'recall':
        events.push({ t: 'droneRecall', x: s.x, y: s.y, ownerId: this.id });
        break;
      default:
        events.push({ t: 'assistDenied', x: s.x, y: s.y, ownerId: this.id });
        break;
    }
  }

  /**
   * The drone asking for a volley of its own accord.
   *
   * Hands over the sub attack, having spent its charge, or refuses. Deliberately
   * silent on refusal: an idle drone asks every tick, and a denial cue per tick
   * would be unbearable. "Out of charges" is already legible from the pip row.
   */
  requestVolley(): AttackDef | null {
    const a = this.def.sub;
    const cost = a.subCost ?? 1;
    if (this.subCharges < cost) return null;
    this.subCharges -= cost;
    return a;
  }

  /**
   * The drone's passive, or null when it is not earning it.
   *
   * One accessor rather than eight scattered checks: everything that reads a
   * passive goes through here, so "launching, recalling, stowed, destroyed or
   * dead means no benefit" is stated once and cannot drift apart.
   */
  get dronePassive(): DronePassiveDef | null {
    return this.supporter.onStation && this.alive ? this.def.supporter.passive : null;
  }

  /**
   * Fires one of this machine's attacks from the drone's muzzle.
   *
   * Routed through the same `fire()` the chassis uses, so the shot inherits
   * saturation scaling and emits the same events; only the origin differs.
   */
  fireFromSupporter(
    a: AttackDef,
    x: number,
    y: number,
    angle: number,
    spawns: ProjectileSpawn[],
    events: SimEvent[],
  ): void {
    this.fire(a, null, spawns, events, { x, y, angle });
  }

  get alive(): boolean {
    return this.life > 0;
  }

  get invulnerable(): boolean {
    return this.invuln > 0;
  }

  /** Dashing is a commitment: the reference made SpeedUp unguardable. */
  get canGuard(): boolean {
    return this.dashTicks <= 0 && this.act !== ActState.Hitstun && this.guardBreakStun <= 0;
  }

  get phase(): Phase {
    const a = this.attack;
    if (!a) return Phase.Recovery;
    if (this.attackTick < a.startup) return Phase.Startup;
    if (this.attackTick < a.startup + a.active) return Phase.Active;
    return Phase.Recovery;
  }

  /** Saturation multipliers, applied where the reference applied them. */
  get satShootScale(): number {
    return this.satActive && this.satMode === SatMode.Shoot ? 1.5 : 1;
  }
  get satSpeedScale(): number {
    return this.satActive && this.satMode === SatMode.Speed ? 1.75 : 1;
  }
  get satProjSpeedScale(): number {
    return this.satActive && this.satMode === SatMode.Shoot ? 1.6 : 1;
  }
  get maxMeleeHits(): number {
    return this.satActive && this.satMode === SatMode.Speed ? 6 : 3;
  }
  get shieldActive(): boolean {
    return this.satActive && this.satMode === SatMode.Shield;
  }

  /**
   * Multiplier on damage this machine deals, from its drone's passive.
   *
   * Kept separate from `satShootScale` so the two stack rather than one
   * silently replacing the other, and so a reader can see at a glance which
   * effect a number came from.
   */
  get outgoingScale(): number {
    return this.dronePassive?.damageMul ?? 1;
  }

  /**
   * Multiplier on damage this machine takes: its chassis defence, plus its
   * drone's passive. The grounded bracing bonus is applied at the hit itself,
   * since chip damage does not get it.
   */
  get incomingScale(): number {
    return this.def.defence.mul * (this.dronePassive?.defenceMul ?? 1);
  }

  /** World-space muzzle position for an attack. */
  muzzle(a: AttackDef): { x: number; y: number } {
    const c = Math.cos(this.aim);
    const s = Math.sin(this.aim);
    const lat = a.muzzleLateral * this.facing;
    return {
      x: this.x + c * a.muzzleForward - s * lat,
      y: this.y + s * a.muzzleForward + c * lat,
    };
  }

  // ---------------------------------------------------------------- stepping

  /**
   * Advances one tick.
   *
   * `target` may be null (training with no opponent). `out` collects spawns and
   * events so the caller owns all allocation-heavy work.
   */
  step(
    input: InputFrame,
    target: Combatant | null,
    arenaW: number,
    arenaH: number,
    spawns: ProjectileSpawn[],
    events: SimEvent[],
  ): void {
    this.firedThisTick = null;

    // Hitstop freezes everything except the countdown itself.
    if (this.hitstop > 0) {
      this.hitstop--;
      return;
    }

    if (!this.alive) {
      this.act = ActState.Dead;
      this.vx *= 0.9;
      this.vy *= 0.9;
      this.x += this.vx;
      this.y += this.vy;
      // A wreck still coasts, and it still has to stay in the arena: this branch
      // used to return without clamping, so a mech killed while carrying speed
      // drifted through the wall and kept going for the whole KO freeze.
      clampToArena(this, this.def.rig.hurtRadius, arenaW, arenaH);
      return;
    }

    this.tickTimers(target);
    this.tickSaturation(events);
    this.cmd.push(input, this.facing);

    if (this.hitstun > 0 || this.guardBreakStun > 0) {
      // Taking a hit drops an in-progress lock-on sequence. This has to happen
      // here: the stun branch returns before the melee step ever runs.
      if (this.meleeLock) this.endMeleeLock(false);
      this.stepStunned(input, events);
      clampToArena(this, this.def.rig.hurtRadius, arenaW, arenaH);
      return;
    }

    // A lock-on melee sequence owns the mech until it finishes or breaks.
    if (this.meleeLock) {
      if (this.stepMeleeLock(target, spawns, events)) {
        this.x += this.vx;
        this.y += this.vy;
        clampToArena(this, this.def.rig.hurtRadius, arenaW, arenaH);
        this.updateVisualAngles(input);
        return;
      }
    }

    this.updateFacingAndAim(input, target);

    if (this.attack) {
      this.stepAttack(input, target, spawns, events);
    } else {
      this.act = ActState.Free;
      this.tryStartAction(input, target, events);
      // The tick an attack starts on is frame 0 of its startup, so advance it
      // here too. Without this every attack would run one tick late.
      if (this.attack) this.stepAttack(input, target, spawns, events);
    }

    this.stepMotion(input);
    if (this.landedThisTick) {
      this.landedThisTick = false;
      events.push({ t: 'land', x: this.x, y: this.y, id: this.id });
    }
    if (this.dashStartedThisTick) {
      this.dashStartedThisTick = false;
      events.push({
        t: 'dash',
        x: this.x,
        y: this.y,
        angle: Math.atan2(this.dashDirY, this.dashDirX),
        id: this.id,
      });
    }
    clampToArena(this, this.def.rig.hurtRadius, arenaW, arenaH);
    this.updateVisualAngles(input);
  }

  /**
   * `target` is read only for the one outward-facing drone passive (NULLTIDE's
   * jamming field). Passing it beats letting a drone reach across and mutate
   * another combatant: every gauge is still written in exactly one place.
   */
  private tickTimers(target: Combatant | null): void {
    const g = this.def.gauges;
    const passive = this.dronePassive;

    if (this.invuln > 0) this.invuln--;
    if (this.meleeLockout > 0) this.meleeLockout--;
    if (this.bladeTimer > 0) this.bladeTimer--;
    if (this.barrierActiveTicks > 0) this.barrierActiveTicks--;
    if (this.meleeChainGrace > 0) {
      this.meleeChainGrace--;
      if (this.meleeChainGrace === 0) {
        this.meleeCount = 0;
        this.meleeHitConfirmed = false;
      }
    }

    // ---- status affliction ------------------------------------------------
    // Ticked here, ahead of the hitstun early-return, so a burn keeps burning
    // while its victim is being combo'd.
    const st = this.status.def;
    const chip = this.status.step();
    if (chip > 0) {
      // Chip goes through the same defence multiplier as everything else, but
      // deliberately cannot land the killing blow: being finished by a lingering
      // burn seconds after the shooter disengaged reads as a bug, not a loss.
      this.life = Math.max(1, this.life - chip * this.incomingScale);
    }
    if (st?.energyDrain) this.energy = Math.max(0, this.energy - st.energyDrain);

    // Energy regen, boosted by Shoot saturation, suppressed by Shock, lifted by
    // a friendly reactor-link drone and halved by a hostile jamming one.
    const jam = target?.dronePassive?.enemyEnergyRegenMul ?? 1;
    const regen = st?.blocksEnergyRegen
      ? 0
      : g.energyRegen *
        (this.satActive && this.satMode === SatMode.Shoot ? 2.2 : 1) *
        (passive?.energyRegenMul ?? 1) *
        jam;
    this.energy = Math.min(g.maxEnergy, this.energy + regen);

    // Barrier gauge regen after a delay.
    if (this.barrierRegenTimer > 0) {
      this.barrierRegenTimer--;
    } else if (this.barrier < g.maxBarrier) {
      this.barrier = Math.min(
        g.maxBarrier,
        this.barrier + g.barrierRegen * (passive?.barrierRegenMul ?? 1),
      );
    }

    // Sub-weapon charge economy.
    //
    // The reference zeroed its charge counter outright whenever the machine was
    // in an action state, so pressure denies the assist and disengaging restores
    // it. Here the counter merely stalls rather than resetting: losing a whole
    // 150-tick charge to a single vulcan shot punishes ordinary play far harder
    // than the reference did, where the counter refilled far faster.
    if (this.subCharges < this.def.subCharges) {
      if (!this.attack) this.subRecharge++;
      if (this.subRecharge >= this.def.subRechargeTicks) {
        this.subRecharge = 0;
        this.subCharges++;
      }
    }
  }

  private tickSaturation(events: SimEvent[]): void {
    const g = this.def.gauges;
    if (this.satActive) {
      // Shield mode burns the meter faster, as the reference did for its
      // barrier-type concentration.
      this.satTicks -= this.satMode === SatMode.Shield ? 2 : 1;
      this.sat = Math.max(0, (this.satTicks / g.satDuration) * g.maxSaturation);
      if (this.satTicks <= 0) {
        this.satActive = false;
        this.sat = 0;
      }
    } else if (this.sat < g.maxSaturation) {
      const gain = g.satPassive * (this.dronePassive?.satGainMul ?? 1);
      this.sat = Math.min(g.maxSaturation, this.sat + gain);
    }
    void events;
  }

  private stepStunned(input: InputFrame, events: SimEvent[]): void {
    if (this.guardBreakStun > 0) this.guardBreakStun--;
    if (this.hitstun > 0) this.hitstun--;
    this.act = this.hitstun > 0 ? ActState.Hitstun : ActState.Free;

    // Barrier-cancel out of hitstun for double cost (reference penalty).
    if (
      isPressed(input, Btn.Barrier) &&
      this.barrier >= this.def.barrier.cost + this.def.barrier.cancelPenalty
    ) {
      this.startBarrier(true, events);
      this.hitstun = 0;
      this.guardBreakStun = 0;
    }

    this.vx *= 0.94;
    this.vy *= 0.94;
    this.x += this.vx;
    this.y += this.vy;
    this.spin += 9 * DEG;
  }

  private updateFacingAndAim(input: InputFrame, target: Combatant | null): void {
    // Auto-turn toward the opponent with a deadzone, like the reference's Turn.
    if (target && target.alive) {
      if (target.x > this.x + 6 && this.facing < 0) this.facing = 1;
      else if (target.x < this.x - 6 && this.facing > 0) this.facing = -1;
    }

    let desired: number;
    if (input.aimX !== null && input.aimY !== null && (input.aimX !== 0 || input.aimY !== 0)) {
      // Manual aim always wins.
      desired = Math.atan2(input.aimY, input.aimX);
    } else if (this.lockEnabled && target && target.alive && this.inLockCone(target)) {
      desired = Math.atan2(target.y - this.y, target.x - this.x);
    } else if (input.dx !== 0 || input.dy !== 0) {
      desired = Math.atan2(input.dy, input.dx);
    } else {
      desired = this.facing > 0 ? 0 : Math.PI;
    }

    // Slew the mounts rather than snapping, so recoil and lead read on screen.
    this.aim = approachAngle(this.aim, desired, this.def.flight.turretRate);
  }

  private inLockCone(target: Combatant): boolean {
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > this.def.lockRange) return false;
    const facingAngle = this.facing > 0 ? 0 : Math.PI;
    return Math.abs(angleDelta(facingAngle, Math.atan2(dy, dx))) <= this.def.lockCone;
  }

  // ------------------------------------------------------------- action start

  private tryStartAction(input: InputFrame, target: Combatant | null, events: SimEvent[]): void {
    const d = this.def;

    // Saturation mode cycling is always available (reference: Start button).
    if (isPressed(input, Btn.ModeCycle) && !this.satActive) {
      this.satMode = ((this.satMode + 1) % SAT_MODE_COUNT) as SatMode;
      events.push({ t: 'modeCycle', id: this.id, mode: this.satMode });
    }

    // FlyingMode toggle. Taking off gives an upward kick so lift-off reads.
    if (isPressed(input, Btn.Flight)) {
      this.flying = !this.flying;
      if (this.flying) {
        this.vy -= this.def.flight.takeoffImpulse;
        this.grounded = false;
        events.push({ t: 'takeoff', x: this.x, y: this.y, id: this.id });
      }
    }

    // Saturation activation: Main + Heavy together on a full meter.
    if (
      !this.satActive &&
      this.sat >= d.gauges.maxSaturation &&
      isPressed(input, Btn.Main) &&
      isHeld(input, Btn.Heavy)
    ) {
      this.activateSaturation(events);
      return;
    }

    // Barrier burst.
    if (isPressed(input, Btn.Barrier) && this.barrier >= d.barrier.cost) {
      this.startBarrier(this.guarding, events);
      return;
    }

    // Holding barrier without a burst is a guard stance.
    this.guarding = isHeld(input, Btn.Barrier) && this.canGuard && this.barrier > 0;
    if (this.guarding) {
      const drain = d.gauges.guardDrain * (this.dronePassive?.guardDrainMul ?? 1);
      this.barrier = Math.max(0, this.barrier - drain);
      this.barrierRegenTimer = d.gauges.barrierRegenDelay;
      if (this.barrier <= 0) this.breakGuard(events);
      this.act = ActState.GuardHold;
    }

    // Command motions take priority over plain button presses.
    if (this.cmd.matches(MOTIONS.lance) && this.energy >= d.lance.energyCost) {
      this.begin(d.lance);
      return;
    }
    // Sub-weapon motion variant. The reference listed the sub shoot twice — as a
    // plain button and as a quarter-circle — and both belong to the supporter.
    if (this.cmd.matches(MOTIONS.salvo)) {
      if (this.orderAssist(d.salvo, events)) return;
    }
    if (this.cmd.matches(MOTIONS.spread) && this.energy >= d.spread.energyCost) {
      this.begin(d.spread);
      return;
    }

    // Sub weapon: the drone carries it, so the chassis only decides *whether the
    // drone is out*. It picks its own firing moments from there.
    if (isPressed(input, Btn.Sub)) {
      this.toggleDrone(events);
      return;
    }

    // Heavy shot. The reference switched FlyingMode on automatically for its
    // Level 2 shot, so a heavy commitment always happens airborne.
    if (isPressed(input, Btn.Heavy) && this.energy >= d.heavy.energyCost) {
      if (!this.flying) {
        this.flying = true;
        this.vy -= this.def.flight.takeoffImpulse * 0.6;
        this.grounded = false;
        events.push({ t: 'takeoff', x: this.x, y: this.y, id: this.id });
      }
      this.begin(d.heavy);
      return;
    }

    // Melee has its own button: a swing is always a deliberate commitment, never
    // something that happens because you drifted into range. It lunges toward
    // the aim, so it stays useful from outside contact distance.
    if (isPressed(input, Btn.Melee) && this.meleeLockout <= 0) {
      if (this.startMeleeLock(target, events)) return;
      // No lock available (no target, out of range, or not enough energy):
      // still throw a single swing so the button is never dead.
      this.beginMelee(events, target);
      return;
    }

    // Main gun, with hold-to-autofire as the reference offered.
    const mainDown = isPressed(input, Btn.Main) || (isHeld(input, Btn.Main) && this.autoFireReady());
    if (mainDown && this.energy >= d.main.energyCost) {
      this.begin(d.main);
    }
    void target;
  }

  private autoFireTimer = 0;
  /** Hold-to-autofire, as the reference offered for its Lv1/Lv2 shots. */
  private autoFireReady(): boolean {
    return this.autoFireTimer <= 0;
  }

  /** True when the main-gun button should swing instead of shoot. */
  meleeInRange(target: Combatant): boolean {
    const dist = Math.hypot(target.x - this.x, target.y - this.y);
    return dist <= this.def.meleeRange;
  }

  /**
   * Opens a lock-on melee sequence. Requires a live target inside acquire range
   * and enough energy for the opening plus a couple of swings — a sequence that
   * fizzles immediately would just be a punish.
   */
  private startMeleeLock(target: Combatant | null, events: SimEvent[]): boolean {
    const p = this.def.meleeLock;
    if (this.meleeLock || this.attack || this.hitstun > 0 || this.meleeLockout > 0) return false;
    if (!target || !target.alive) return false;

    const dist = Math.hypot(target.x - this.x, target.y - this.y);
    if (dist > p.acquireRange) return false;
    if (this.energy < p.energy + Math.min(p.hitEnergy * 2, 40)) return false;

    this.energy -= p.energy;
    this.sat = Math.min(this.def.gauges.maxSaturation, this.sat + 4 + p.hits * 0.35);
    this.aim = Math.atan2(target.y - this.y, target.x - this.x);
    this.facing = target.x >= this.x ? 1 : -1;
    this.invuln = Math.max(this.invuln, 2);
    this.meleeLock = {
      phase: 'close',
      timer: 0,
      hitIndex: 0,
      hitTimer: 0,
      hitDone: false,
      life: p.maxLife,
    };
    this.bladeTimer = Math.max(this.bladeTimer, p.swing + p.gap + 6);
    this.announced = p.name;
    events.push({ t: 'melee', x: this.x, y: this.y, angle: this.aim, id: this.id, stage: 0 });
    return true;
  }

  /** Ends the sequence and applies the cooldown. */
  private endMeleeLock(full: boolean): void {
    const p = this.def.meleeLock;
    this.meleeLock = null;
    this.meleeLockout = Math.max(this.meleeLockout, full ? p.lockout : Math.round(p.lockout * 0.45));
  }

  /**
   * Advances an active sequence. Returns true while it owns the mech, so the
   * normal action/flight path stands down.
   */
  private stepMeleeLock(
    target: Combatant | null,
    spawns: ProjectileSpawn[],
    events: SimEvent[],
  ): boolean {
    const ml = this.meleeLock;
    if (!ml) return false;
    const p = this.def.meleeLock;

    ml.life--;
    // Losing the target, being hit, or running out of time all drop the lock.
    if (!target || !target.alive || this.hitstun > 0 || ml.life <= 0) {
      this.endMeleeLock(false);
      return false;
    }

    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const nx = dx / dist;
    const ny = dy / dist;
    this.facing = dx >= 0 ? 1 : -1;
    this.aim = Math.atan2(dy, dx);
    this.act = ActState.Attack;
    this.bladeTimer = Math.max(this.bladeTimer, 4);

    if (ml.phase === 'close') {
      ml.timer++;
      // Carry the blade back into the wind-up while closing, so the swing is
      // already loaded by the time the mech arrives.
      this.swingDriven = true;
      const ramp = Math.min(1, ml.timer / 8);
      this.spin = swingArcAngle(p.arc, 0, ml.hitIndex) * ramp;
      this.reach = swingReach(p.arc, 0, ml.hitIndex) * ramp;
      // Thrust onto the target, lerping so it reads as a controlled approach.
      this.vx = lerp(this.vx, nx * p.thrust, p.tracking);
      this.vy = lerp(this.vy, ny * p.thrust, p.tracking);
      if (dist <= p.range || ml.timer > 22) {
        ml.phase = 'swing';
        ml.timer = 0;
        ml.hitTimer = 0;
        ml.hitDone = false;
      }
      return true;
    }

    if (ml.phase === 'gap') {
      ml.timer++;
      // Recover the arm from the follow-through back toward the next wind-up,
      // so consecutive swings are joined by a real recovery rather than a snap.
      this.swingDriven = true;
      const gapT = clamp(ml.timer / Math.max(1, p.gap), 0, 1);
      const from = swingArcAngle(p.arc, 1, ml.hitIndex);
      const to = swingArcAngle(p.arc, 0, ml.hitIndex + 1);
      this.spin = lerp(from, to, gapT);
      // The weapon recovers to its next start position rather than snapping, so
      // a piston visibly retracts between strokes.
      this.reach = lerp(swingReach(p.arc, 1, ml.hitIndex), swingReach(p.arc, 0, ml.hitIndex + 1), gapT);
      this.vx *= 0.86;
      this.vy *= 0.86;
      if (ml.timer >= p.gap) {
        ml.phase = 'swing';
        ml.timer = 0;
        ml.hitTimer = 0;
        ml.hitDone = false;
      }
      return true;
    }

    // ---- swing --------------------------------------------------------
    ml.hitTimer++;

    // Drive the arm through the authored arc. This is what makes the attack a
    // slash: the hit window sits in the fast part of the sweep, so the blade is
    // travelling through the target rather than being held against it.
    this.swingDriven = true;
    const swingT = ml.hitTimer / Math.max(1, p.swing);
    this.spin = swingArcAngle(p.arc, swingT, ml.hitIndex);
    this.reach = swingReach(p.arc, swingT, ml.hitIndex);

    // Reposition to a point beside the target that shifts each hit, so the
    // sequence circles rather than bulldozing straight through.
    const side = this.facing * (42 + Math.min(24, ml.hitIndex * 3));
    const wantX = target.x - side;
    const wantY = target.y - 12 + Math.sin((ml.hitIndex + 1) * 1.7) * 10;
    this.vx = lerp(
      this.vx,
      clamp(wantX - this.x, -p.thrust * 0.74, p.thrust * 0.74),
      p.tracking * 0.74,
    );
    this.vy = lerp(
      this.vy,
      clamp(wantY - this.y, -p.thrust * 0.62, p.thrust * 0.62),
      p.tracking * 0.72,
    );

    if (ml.hitTimer === 1) {
      // Each swing is paid for. Running dry fizzles the sequence.
      if (this.energy < p.hitEnergy) {
        this.endMeleeLock(true);
        return false;
      }
      this.energy -= p.hitEnergy;
      this.bladeTimer = Math.max(this.bladeTimer, p.swing + p.gap + 5);
      events.push({
        t: 'melee',
        x: this.x,
        y: this.y,
        angle: this.aim,
        id: this.id,
        stage: ml.hitIndex,
      });
    }

    const activeStart = Math.max(2, Math.floor(p.swing * 0.34));
    const activeEnd = Math.max(activeStart + 1, Math.floor(p.swing * 0.72));
    if (!ml.hitDone && ml.hitTimer >= activeStart && ml.hitTimer <= activeEnd) {
      // Generous connect check: the sequence has already committed, so a swing
      // that visually reaches should land.
      if (dist < p.range + 54) {
        ml.hitDone = true;
        const last = ml.hitIndex >= p.hits - 1;
        const base = this.def.melee[Math.min(ml.hitIndex, this.def.melee.length - 1)];
        const dmg = p.damage[Math.min(ml.hitIndex, p.damage.length - 1)];
        const knock = p.knock[Math.min(ml.hitIndex, p.knock.length - 1)];
        const m = this.muzzle(base);
        spawns.push({
          x: m.x,
          y: m.y,
          vx: nx * 0.001,
          vy: ny * 0.001,
          damage: dmg * this.satShootScale * this.outgoingScale,
          guardDamage: dmg * 0.5,
          life: 2,
          radius: p.range,
          ownerId: this.id,
          team: this.team,
          kind: ProjKind.Melee,
          barrier: BarrierResponse.Pierce,
          hitstop: last ? 14 : 7,
          hitstun: last ? 30 : 14,
          knockback: last ? knock + p.finisherKnock : knock,
          homing: 0,
          pierceCount: 0,
          element: base.element ?? Element.None,
        });
        if (last) {
          // The finisher forcibly creates neutral again.
          this.vx = -nx * p.finisherKnock * 0.28;
          this.vy = -ny * p.finisherKnock * 0.28 - p.finalLift * 0.4;
        }
      }
    }

    if (ml.hitTimer >= p.swing) {
      ml.hitIndex++;
      if (ml.hitIndex >= p.hits) {
        this.endMeleeLock(true);
        return false;
      }
      ml.phase = 'gap';
      ml.timer = 0;
    }
    return true;
  }

  private beginMelee(events: SimEvent[], target?: Combatant | null): void {
    // Lock on: snap the aim to the target as the swing commits. The turret only
    // slews ~13deg/tick, so a swing started while the mounts are still coming
    // around would otherwise lunge along a stale angle - away from the enemy -
    // and the in-flight tracking cannot correct that inside the startup window.
    if (target && target.alive) {
      this.aim = Math.atan2(target.y - this.y, target.x - this.x);
      this.facing = target.x >= this.x ? 1 : -1;
    }
    const stages = this.def.melee;
    const maxHits = this.maxMeleeHits;
    let next: AttackDef;
    if (this.meleeCount === 0) next = stages[0];
    else if (this.meleeCount >= maxHits - 1) next = stages[2];
    else next = stages[1];

    this.meleeCount++;
    this.meleeChainGrace = 0;
    this.meleeHitConfirmed = false;
    this.begin(next);
    events.push({
      t: 'melee',
      x: this.x,
      y: this.y,
      angle: this.aim,
      id: this.id,
      stage: next.meleeStage ?? 0,
    });
  }

  private begin(a: AttackDef): void {
    this.attack = a;
    this.attackTick = 0;
    this.attackFired = false;
    this.act = ActState.Attack;
    this.guarding = false;
    this.meleeChainQueued = false;

    this.energy = Math.max(0, this.energy - a.energyCost);
    if (a.subCost) {
      this.subCharges = Math.max(0, this.subCharges - a.subCost);
      this.subRecharge = 0;
    }
    this.autoFireTimer = ATTACK_TOTAL(a);
  }

  private activateSaturation(events: SimEvent[]): void {
    this.satActive = true;
    this.satTicks = this.def.gauges.satDuration;
    this.invuln = Math.max(this.invuln, 20);
    // Speed mode refunds the boost tank outright (reference: boost 100% recover).
    if (this.satMode === SatMode.Speed) this.boost = this.def.flight.maxBoost;
    if (this.satMode === SatMode.Shoot) {
      this.energy = Math.min(this.def.gauges.maxEnergy, this.energy + this.def.gauges.maxEnergy * 0.5);
    }
    events.push({ t: 'saturation', id: this.id, mode: this.satMode });
  }

  private startBarrier(cancelling: boolean, events: SimEvent[]): void {
    const b = this.def.barrier;
    let cost = b.cost;
    if (cancelling) cost += b.cancelPenalty;
    this.barrier = Math.max(0, this.barrier - cost);
    this.barrierRegenTimer = this.def.gauges.barrierRegenDelay;

    this.invuln = Math.max(
      this.invuln,
      b.invulnTicks + (this.shieldActive ? b.shieldBonusTicks : 0),
    );
    this.barrierActiveTicks = b.actionTicks;
    this.act = ActState.Barrier;
    this.attack = null;
    this.guarding = false;
    events.push({ t: 'barrier', x: this.x, y: this.y, id: this.id });
  }

  private breakGuard(events: SimEvent[]): void {
    this.guarding = false;
    this.guardBreakStun = this.def.barrier.breakStun;
    this.act = ActState.Hitstun;
    events.push({ t: 'guardBreak', x: this.x, y: this.y, id: this.id });
  }

  // ------------------------------------------------------------ attack stepping

  private stepAttack(
    input: InputFrame,
    target: Combatant | null,
    spawns: ProjectileSpawn[],
    events: SimEvent[],
  ): void {
    const a = this.attack;
    if (!a) return;

    // Melee homes onto the target for the duration of the swing rather than
    // committing to a straight line at the moment of the press. The 2005
    // reference did the same with `posadd` toward the enemy during startup, and
    // it is most of why a sword feels like it connects instead of sliding past.
    if (a.lunge && this.attackTick < a.startup + a.active) {
      let ang = this.aim;
      if (target && target.alive) {
        const want = Math.atan2(target.y - this.y, target.x - this.x);
        // Track hard enough to correct, softly enough that it can still whiff.
        ang = approachAngle(ang, want, MELEE_TRACK_RATE);
      }
      this.vx = Math.cos(ang) * a.lunge;
      this.vy = Math.sin(ang) * a.lunge;
    }

    // Advance first, so `attackTick` is the 1-based frame number we are now on
    // and `phase` agrees with whether the hit has actually been spawned.
    this.attackTick++;

    // Buffer a chain input during the authored window.
    if (
      a.chainFrom !== undefined &&
      a.chainTo !== undefined &&
      this.attackTick >= a.chainFrom &&
      this.attackTick <= a.chainTo &&
      isPressed(input, Btn.Melee)
    ) {
      this.meleeChainQueued = true;
    }

    if (this.phase === Phase.Active && !this.attackFired) {
      this.attackFired = true;
      this.fire(a, target, spawns, events);
    }

    // A lone swing (no lock acquired) uses the same authored arc, so the button
    // never produces a different-looking attack from the committed sequence.
    if (a.kind === ProjKind.Melee) {
      this.swingDriven = true;
      const total = Math.max(1, a.startup + a.active);
      const lockT = this.attackTick / total;
      this.spin = swingArcAngle(this.def.meleeLock.arc, lockT, this.meleeCount - 1);
      this.reach = swingReach(this.def.meleeLock.arc, lockT, this.meleeCount - 1);
    }

    if (this.autoFireTimer > 0) this.autoFireTimer--;

    if (this.attackTick >= ATTACK_TOTAL(a)) {
      const wasMelee = a.kind === ProjKind.Melee;
      const isFinisher = a.meleeStage === 2;
      this.attack = null;
      this.act = ActState.Free;

      if (wasMelee) {
        if (this.meleeChainQueued && this.meleeHitConfirmed && !isFinisher) {
          // Hit-confirmed chain, exactly as the reference gated its follow-up.
          this.beginMelee(events, target);
        } else {
          // Ending a chain — by finisher or by dropping it — locks melee out
          // briefly, so sword pressure cannot be maintained indefinitely.
          this.meleeLockout = Math.max(
            this.meleeLockout,
            isFinisher ? this.def.gauges.meleeLockout : Math.round(this.def.gauges.meleeLockout * 0.6),
          );
          this.meleeCount = 0;
          this.meleeHitConfirmed = false;
          this.meleeChainQueued = false;
        }
      }
    }
  }

  /**
   * Spawns an attack's projectiles.
   *
   * `from` overrides the muzzle when the supporter drone is firing on this
   * machine's behalf: the shot then leaves the drone's own coordinates and along
   * the drone's own angle, and the chassis takes no recoil for it.
   */
  private fire(
    a: AttackDef,
    target: Combatant | null,
    spawns: ProjectileSpawn[],
    events: SimEvent[],
    from?: { x: number; y: number; angle: number },
  ): void {
    const m = from ?? this.muzzle(a);
    const aim = from ? from.angle : this.aim;
    const speed = a.projSpeed * this.satProjSpeedScale;
    const dmgScale = this.satShootScale * this.outgoingScale;
    const homing = a.homing * (this.satActive && this.satMode === SatMode.Shoot ? 1.8 : 1);

    const n = a.projCount;
    const half = (n - 1) / 2;

    for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : (i - half) * (a.spreadRad / Math.max(1, n - 1)) * 2;
      const ang = aim + off;
      // Beams stack along the axis instead of fanning out.
      const along = a.kind === ProjKind.Beam ? i * a.projRadius * 1.6 : 0;
      spawns.push({
        x: m.x + Math.cos(aim) * along,
        y: m.y + Math.sin(aim) * along,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        damage: a.damage * dmgScale,
        guardDamage: a.guardDamage * dmgScale,
        life: a.projLife,
        radius: a.projRadius,
        ownerId: this.id,
        team: this.team,
        kind: a.kind,
        barrier: a.barrier,
        hitstop: a.hitstop,
        hitstun: a.hitstun,
        knockback: a.knockback,
        homing,
        pierceCount: a.pierceCount,
        element: a.element ?? Element.None,
      });
    }

    // Recoil pushes the chassis back along the aim axis — but only when the
    // chassis itself fired. A drone's shot must not shove its owner around.
    if (a.recoil && !from) {
      this.vx -= Math.cos(aim) * a.recoil;
      this.vy -= Math.sin(aim) * a.recoil;
    }

    this.sat = Math.min(this.def.gauges.maxSaturation, this.sat + (this.satActive ? 0 : a.satGain));
    this.firedThisTick = a.kind;
    events.push({ t: 'fire', x: m.x, y: m.y, angle: aim, kind: a.kind, ownerId: this.id });
    void target;
  }

  private stepMotion(input: InputFrame): void {
    const a = this.attack;
    const locked = this.barrierActiveTicks > 0;

    const intent: FlightIntent = {
      dx: locked ? 0 : input.dx,
      dy: locked ? 0 : input.dy,
      boost: !locked && isHeld(input, Btn.Boost),
      // Dash is deliberately NOT gated on `!a`. A mech may dash while firing or
      // mid-swing — that overlap is what makes the movement read as aggressive
      // rather than as a series of committed stops. Firing and melee remain
      // mutually exclusive with each other; only movement overlaps them.
      dash: !locked && isPressed(input, Btn.Boost),
      // Cryo bites here, so it slows flight, walking and boost alike.
      speedScale: this.satSpeedScale * this.status.speedScale,
      // Firing anchors you, but never so much that a simultaneous dash fizzles:
      // the dash impulse is the whole point of allowing the overlap.
      moveScale: a && a.kind !== ProjKind.Melee && !isPressed(input, Btn.Boost)
        ? moveScaleFor(a.kind)
        : 1,
      boostRegenScale: this.dronePassive?.boostRegenMul ?? 1,
      flying: this.flying,
      groundY: this.groundY,
      lunging: !!(a && a.lunge && this.attackTick <= a.startup + a.active),
    };

    const r = stepFlight(this, this.def.flight, intent);
    if (r.dashStarted) this.dashStartedThisTick = true;
    this.grounded = r.grounded;
    if (r.landed) this.landedThisTick = true;
    this.thrust = clamp(
      r.boosting ? 1 : r.braking ? 0.25 : Math.hypot(intent.dx, intent.dy) * 0.7,
      0,
      1,
    );
    if (this.dashTicks > 0) this.thrust = 1;
  }

  /**
   * Advances the walk cycle.
   *
   * Phase is driven by *distance travelled*, not by time, so the stride matches
   * the speed the mech is actually moving and the feet do not skate. Airborne
   * mechs unwind the stride and hold a neutral pose, since they are flying.
   *
   * Simulated rather than done in the renderer so it stays deterministic and a
   * replay reproduces the same pose.
   */
  private updateWalk(): void {
    const grounded = this.grounded && !this.flying;
    const speed = grounded ? Math.abs(this.vx) : 0;
    const want = grounded ? clamp(speed / Math.max(0.6, this.def.flight.walkSpeed), 0, 1) : 0;
    // Ease toward the target so starting and stopping are not instantaneous.
    this.stride += (want - this.stride) * 0.16;
    if (this.stride < 0.002) this.stride = 0;

    if (grounded) {
      // One full stride per STRIDE_LENGTH px of ground covered.
      const STRIDE_LENGTH = 46;
      this.walkPhase += (speed / STRIDE_LENGTH) * Math.PI * 2 * Math.sign(this.vx || 1);
      if (this.walkPhase > Math.PI * 4) this.walkPhase -= Math.PI * 4;
      if (this.walkPhase < -Math.PI * 4) this.walkPhase += Math.PI * 4;
    }
  }

  /** Bank, hover-bob and spin. Simulated so replays stay bit-identical. */
  private updateVisualAngles(input: InputFrame): void {
    const f = this.def.flight;
    // Bank into horizontal motion; dashing leans harder (reference used
    // distinct dash bank angles per chassis family).
    const lean = clamp(this.vx / Math.max(0.001, f.boostMaxSpeed), -1, 1);
    let targetBank = lean * f.bankMax * (this.dashTicks > 0 ? 1.4 : 1);
    if (input.dy !== 0) targetBank += input.dy * 6 * DEG * this.facing;
    targetBank = clamp(targetBank, -f.bankMax * 1.4, f.bankMax * 1.4);
    this.bank = approachAngle(this.bank, targetBank, f.bankRate);

    this.bobPhase += 0.055;
    this.updateWalk();
    // Once nothing is driving the arc, the arm relaxes back to its rest angle.
    // The latch is consumed here, so a sequence dropped mid-swing cannot leave
    // the arm stuck out at the follow-through angle.
    this.swinging = this.swingDriven;
    this.swingDriven = false;
    if (!this.swinging && this.act !== ActState.Hitstun) {
      this.spin *= 0.86;
      if (Math.abs(this.spin) < 0.01) this.spin = 0;
      // Extension settles alongside the rotation, so a mech never freezes with
      // its shield or ram left hanging out after a sequence ends.
      this.reach *= 0.82;
      if (Math.abs(this.reach) < 0.05) this.reach = 0;
    }
  }

  // --------------------------------------------------------------- taking hits

  /**
   * Applies an incoming hit. Returns what happened so the caller can emit the
   * right event and credit the attacker.
   */
  takeHit(p: ProjectileSpawn): 'ignored' | 'absorbed' | 'guarded' | 'hit' {
    if (!this.alive) return 'ignored';

    const piercing = p.barrier === BarrierResponse.Pierce;

    // Barrier-burst invulnerability. Absorbing a shot feeds the meter, which is
    // the reference's core defensive loop.
    if (this.invuln > 0) {
      if (!piercing) {
        this.sat = Math.min(this.def.gauges.maxSaturation, this.sat + this.def.gauges.satOnAbsorb);
        return 'absorbed';
      }
      return 'ignored';
    }

    // Layered defence, mirroring the reference's DefenceMulSet tiers, with the
    // drone's armour passive folded into `incomingScale`.
    const def = this.def.defence;
    const dmg = p.damage * this.incomingScale * (this.grounded ? def.groundedMul : 1);

    if (this.guarding && !piercing) {
      const b = this.def.barrier;
      this.life -= dmg * b.guardScale;
      this.barrier = Math.max(0, this.barrier - p.guardDamage * 0.5);
      this.barrierRegenTimer = this.def.gauges.barrierRegenDelay;
      this.hitstop = Math.max(this.hitstop, Math.floor(p.hitstop * 0.6));
      const kb = p.knockback * 0.4;
      const l = Math.hypot(p.vx, p.vy) || 1;
      this.vx += (p.vx / l) * kb;
      this.vy += (p.vy / l) * kb;
      if (this.barrier <= 0) {
        this.guarding = false;
        this.guardBreakStun = b.breakStun;
      }
      if (this.life <= 0) this.life = 0;
      return 'guarded';
    }

    this.life = Math.max(0, this.life - dmg);
    this.hitstop = Math.max(this.hitstop, p.hitstop);
    this.hitstun = Math.max(this.hitstun, p.hitstun);
    // A brief window after every hit, so overlapping multi-hit sources cannot
    // chain-lock a mech with no chance to respond.
    this.invuln = Math.max(this.invuln, this.def.gauges.hitInvuln);
    // Being hit builds the overdrive meter: a losing pilot fights back toward it.
    this.sat = Math.min(
      this.def.gauges.maxSaturation,
      this.sat + dmg * this.def.gauges.satOnDamage,
    );
    this.attack = null;
    this.guarding = false;
    this.meleeCount = 0;
    this.meleeChainQueued = false;
    this.act = ActState.Hitstun;

    const l = Math.hypot(p.vx, p.vy) || 1;
    this.vx += (p.vx / l) * p.knockback;
    this.vy += (p.vy / l) * p.knockback;
    return 'hit';
  }

  /** Called on the attacker when one of its hits connects. */
  confirmHit(): void {
    this.meleeHitConfirmed = true;
    this.meleeChainGrace = 26;
  }

  /** Current directional symbol, exposed for the debug overlay. */
  currentDir(input: InputFrame): Sym {
    return dirFrom(Math.sign(input.dx) * this.facing, Math.sign(input.dy));
  }
}
