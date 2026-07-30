import type { MechDef } from '../mechs/MechDef';
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
import { DEG, approachAngle, clamp, angleDelta } from '../core/MathUtil';

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
  /** Melee sword spin, advanced 18deg/tick like the reference. */
  spin = 0;
  /** Smoothed idle hover bob phase. */
  bobPhase = 0;

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

  lockEnabled = true;
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
      return;
    }

    this.tickTimers();
    this.tickSaturation(events);
    this.cmd.push(input, this.facing);

    if (this.hitstun > 0 || this.guardBreakStun > 0) {
      this.stepStunned(input, events);
      clampToArena(this, this.def.rig.hurtRadius, arenaW, arenaH);
      return;
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

  private tickTimers(): void {
    const g = this.def.gauges;

    if (this.invuln > 0) this.invuln--;
    if (this.barrierActiveTicks > 0) this.barrierActiveTicks--;
    if (this.meleeChainGrace > 0) {
      this.meleeChainGrace--;
      if (this.meleeChainGrace === 0) {
        this.meleeCount = 0;
        this.meleeHitConfirmed = false;
      }
    }

    // Energy regen, boosted by Shoot saturation.
    const regen = g.energyRegen * (this.satActive && this.satMode === SatMode.Shoot ? 2.2 : 1);
    this.energy = Math.min(g.maxEnergy, this.energy + regen);

    // Barrier gauge regen after a delay.
    if (this.barrierRegenTimer > 0) {
      this.barrierRegenTimer--;
    } else if (this.barrier < g.maxBarrier) {
      this.barrier = Math.min(g.maxBarrier, this.barrier + g.barrierRegen);
    }

    // Sub-weapon charge economy.
    if (this.subCharges < this.def.subCharges) {
      this.subRecharge++;
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
      this.sat = Math.min(g.maxSaturation, this.sat + g.satPassive);
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

    if (isPressed(input, Btn.Lock)) this.lockEnabled = !this.lockEnabled;

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
      this.barrier = Math.max(0, this.barrier - d.gauges.guardDrain);
      this.barrierRegenTimer = d.gauges.barrierRegenDelay;
      if (this.barrier <= 0) this.breakGuard(events);
      this.act = ActState.GuardHold;
    }

    // Command motions take priority over plain button presses.
    if (this.cmd.matches(MOTIONS.lance) && this.energy >= d.lance.energyCost) {
      this.begin(d.lance);
      return;
    }
    if (this.cmd.matches(MOTIONS.salvo) && this.subCharges >= (d.salvo.subCost ?? 1)) {
      this.begin(d.salvo);
      return;
    }
    if (this.cmd.matches(MOTIONS.spread) && this.energy >= d.spread.energyCost) {
      this.begin(d.spread);
      return;
    }

    // Sub weapon.
    if (isPressed(input, Btn.Sub) && this.subCharges >= (d.sub.subCost ?? 1)) {
      this.begin(d.sub);
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
    if (isPressed(input, Btn.Melee)) {
      this.beginMelee(events);
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

  private beginMelee(events: SimEvent[]): void {
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

    // Melee lunges toward the target during startup.
    if (a.lunge && this.attackTick < a.startup + a.active) {
      const ang = this.aim;
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

    if (a.kind === ProjKind.Melee) this.spin += 18 * DEG;

    if (this.autoFireTimer > 0) this.autoFireTimer--;

    if (this.attackTick >= ATTACK_TOTAL(a)) {
      const wasMelee = a.kind === ProjKind.Melee;
      const isFinisher = a.meleeStage === 2;
      this.attack = null;
      this.act = ActState.Free;

      if (wasMelee) {
        if (this.meleeChainQueued && this.meleeHitConfirmed && !isFinisher) {
          // Hit-confirmed chain, exactly as the reference gated its follow-up.
          this.beginMelee(events);
        } else {
          this.meleeCount = 0;
          this.meleeHitConfirmed = false;
          this.meleeChainQueued = false;
        }
      }
    }
  }

  private fire(
    a: AttackDef,
    target: Combatant | null,
    spawns: ProjectileSpawn[],
    events: SimEvent[],
  ): void {
    const m = this.muzzle(a);
    const speed = a.projSpeed * this.satProjSpeedScale;
    const dmgScale = this.satShootScale;
    const homing = a.homing * (this.satActive && this.satMode === SatMode.Shoot ? 1.8 : 1);

    const n = a.projCount;
    const half = (n - 1) / 2;

    for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : (i - half) * (a.spreadRad / Math.max(1, n - 1)) * 2;
      const ang = this.aim + off;
      // Beams stack along the axis instead of fanning out.
      const along = a.kind === ProjKind.Beam ? i * a.projRadius * 1.6 : 0;
      spawns.push({
        x: m.x + Math.cos(this.aim) * along,
        y: m.y + Math.sin(this.aim) * along,
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
      });
    }

    // Recoil pushes the chassis back along the aim axis.
    if (a.recoil) {
      this.vx -= Math.cos(this.aim) * a.recoil;
      this.vy -= Math.sin(this.aim) * a.recoil;
    }

    this.sat = Math.min(this.def.gauges.maxSaturation, this.sat + (this.satActive ? 0 : a.satGain));
    this.firedThisTick = a.kind;
    events.push({ t: 'fire', x: m.x, y: m.y, angle: this.aim, kind: a.kind, ownerId: this.id });
    void target;
  }

  private stepMotion(input: InputFrame): void {
    const a = this.attack;
    const locked = this.barrierActiveTicks > 0;

    const intent: FlightIntent = {
      dx: locked ? 0 : input.dx,
      dy: locked ? 0 : input.dy,
      boost: !locked && isHeld(input, Btn.Boost),
      dash: !locked && !a && isPressed(input, Btn.Boost),
      speedScale: this.satSpeedScale,
      moveScale: a && a.kind !== ProjKind.Melee ? moveScaleFor(a.kind) : 1,
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
    if (this.attack?.kind !== ProjKind.Melee && this.act !== ActState.Hitstun) {
      this.spin *= 0.86;
      if (Math.abs(this.spin) < 0.01) this.spin = 0;
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

    // Layered defence, mirroring the reference's DefenceMulSet tiers.
    const def = this.def.defence;
    const dmg = p.damage * def.mul * (this.grounded ? def.groundedMul : 1);

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
