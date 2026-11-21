import type { MechDef } from '../mechs/MechDef';
import type { AttackDef } from '../combat/AttackData';
import { Btn, BarrierResponse, ProjKind, SatMode, isHeld, isPressed, type InputFrame } from '../combat/types';
import type { ProjFamilyId } from '../projectiles/families';
import { Rng } from '../core/Rng';

/**
 * FREE ORBIT: the fight in three dimensions.
 *
 * The side-on game is a plane; this is a full arena — the CATHEDRAL YARD deck
 * and the air above it — fought the way 3D mecha fighters are: you are locked
 * on to the rival at all times, **forward closes on them, left and right circle
 * them**, boost with no direction climbs, and a machine that stops thrusting
 * sinks slowly back toward the deck. Every machine can also **transform into a
 * mobile form**, a fast flight shape that steers like an aircraft and fires only
 * its nose gun.
 *
 * **The machines are the same machines.** Speeds, boost, dash, gauges, every
 * weapon's damage, speed, homing and cost, the melee chain, the barrier and
 * Saturation all come straight from `MechDef`, converted from the side-on
 * game's pixels-per-tick into world units (`PX`). Nothing here is tuned per
 * chassis, so each machine keeps the identity it has in the main game.
 *
 * **Pure and deterministic**: no Phaser, no Three, no `Math.random` — the scene
 * renders it, `orbit.test.ts` drives it headlessly, and a seed replays a fight.
 */

/** World units per side-on simulation pixel (the voxel layer's own scale). */
export const PX = 1 / 40;
export const TICK_HZ = 60;
/** Round length, ticks. */
export const ORBIT_ROUND_TICKS = 180 * TICK_HZ;
const INTRO_TICKS = 96;

// --------------------------------------------------------------- geometry

export interface V3 {
  x: number;
  y: number;
  z: number;
}
export const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });
const len = (a: V3): number => Math.hypot(a.x, a.y, a.z);
const sub = (a: V3, b: V3): V3 => v3(a.x - b.x, a.y - b.y, a.z - b.z);
const norm = (a: V3): V3 => {
  const l = len(a) || 1;
  return v3(a.x / l, a.y / l, a.z / l);
};
const dot = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z;

/** The playable volume: the yard's deck and the air over it, world units. */
export const ARENA = { minX: -56, maxX: 56, minZ: -30, maxZ: 14, floor: 0, ceiling: 34 };

/** An obstacle box: structure in the yard that blocks machines and shots. */
export interface Box {
  min: V3;
  max: V3;
}

/**
 * The yard's solid structure inside the arena, matched to `VoxelArena`: the two
 * gantry pylons, the crossbeam over them, and the two empty drydock cradles.
 * Cover, in a mode where there is somewhere to hide.
 */
export const OBSTACLES: readonly Box[] = [
  { min: v3(-34.6, 0, -8.6), max: v3(-30.9, 36, -4.4) },
  { min: v3(30.9, 0, -8.6), max: v3(34.6, 36, -4.4) },
  { min: v3(-34.6, 31.2, -8.8), max: v3(34.6, 35.4, -4.2) },
  { min: v3(-48, 0, -24.6), max: v3(-26, 1.8, -21.4) },
  { min: v3(-48, 0, -24.2), max: v3(-46, 15, -21.8) },
  { min: v3(-28, 0, -24.2), max: v3(-26, 15, -21.8) },
  { min: v3(22, 0, -28.6), max: v3(48, 1.8, -25.4) },
  { min: v3(22, 0, -28.2), max: v3(24, 15, -25.8) },
  { min: v3(46, 0, -28.2), max: v3(48, 15, -25.8) },
];

const inBox = (p: V3, b: Box, pad = 0): boolean =>
  p.x > b.min.x - pad && p.x < b.max.x + pad &&
  p.y > b.min.y - pad && p.y < b.max.y + pad &&
  p.z > b.min.z - pad && p.z < b.max.z + pad;

/** Pushes a sphere out of a box along the shallowest axis; returns the axis or -1. */
function pushOut(p: V3, r: number, b: Box): number {
  if (!inBox(p, b, r)) return -1;
  const pens = [
    p.x - (b.min.x - r), b.max.x + r - p.x,
    p.y - (b.min.y - r), b.max.y + r - p.y,
    p.z - (b.min.z - r), b.max.z + r - p.z,
  ];
  let k = 0;
  for (let i = 1; i < 6; i++) if (pens[i] < pens[k]) k = i;
  if (k === 0) p.x = b.min.x - r;
  else if (k === 1) p.x = b.max.x + r;
  else if (k === 2) p.y = b.min.y - r;
  else if (k === 3) p.y = b.max.y + r;
  else if (k === 4) p.z = b.min.z - r;
  else p.z = b.max.z + r;
  return k >> 1;
}

/** Distance from point c to segment ab. */
function segDist(a: V3, b: V3, c: V3): number {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 > 0 ? Math.max(0, Math.min(1, dot(sub(c, a), ab) / l2)) : 0;
  return len(sub(c, v3(a.x + ab.x * t, a.y + ab.y * t, a.z + ab.z * t)));
}

// ---------------------------------------------------------------- fighters

export type OrbitForm = 'mech' | 'mobile';

export const enum OrbitAct {
  Free = 0,
  Attack = 1,
  Melee = 2,
  Burst = 3,
  Hitstun = 4,
  GuardBreak = 5,
  Burnout = 6,
  Transform = 7,
  Down = 8,
  /** Knocked down by a long combo: tumbling, untouchable, then back up. */
  Knockdown = 9,
}

/**
 * The down value — how 3D arena fighters end a combo.
 *
 * In the side-on game a stream of gunfire cannot hold a machine for long: the
 * plane is narrow and knockback carries the victim off the line. In a volume it
 * can. Measured before this rule, one EXTREME rival held another in hitstun for
 * up to 62 consecutive rounds and fights ended in six seconds. So every ranged
 * hit adds to a down value, and past `DOWN_LIMIT` the victim is knocked down:
 * thrown clear, untouchable while it tumbles and for a moment after it rights
 * itself. A sword sequence adds nothing — it is an authored chain with its own
 * finisher, and its length is the machine's identity.
 */
export const DOWN_LIMIT = 5;
export const KNOCKDOWN_TICKS = 48;
/** Untouchable through the tumble and this long after. */
const WAKE_INVULN = 24;


/** How long a transformation takes, either way, in ticks. */
export const TRANSFORM_TICKS = 20;
/** The mobile form's handling, against the mech form's own numbers. */
export const MOBILE = {
  /**
   * Cruise speed as a multiple of the machine's boost speed — and cruising
   * costs no boost. That is the trade: the mech form can only go this fast by
   * burning its gauge, the mobile form goes faster for free, and pays with
   * having one gun, a turning circle and no guard.
   */
  cruise: 1.3,
  /** Afterburner as a multiple of its dash speed. */
  burner: 0.95,
  turnRate: 0.05,
  pitchRate: 0.04,
  maxPitch: 0.9,
  /** Boost drained per tick on the afterburner, as a share of boost drain. */
  burnerDrain: 1.2,
};

export interface OrbitFighter {
  id: number;
  def: MechDef;
  pos: V3;
  vel: V3;
  /** Heading in the horizontal plane, radians (0 = +X, toward -Z is +pi/2). */
  yaw: number;
  /** Mobile form only: nose up (+) or down (-), radians. */
  pitch: number;
  life: number;
  energy: number;
  boost: number;
  barrier: number;
  sat: number;
  satMode: SatMode;
  satActive: boolean;
  satTicks: number;
  form: OrbitForm;
  /** Ticks left on a transformation in progress, or 0. */
  transformTicks: number;
  act: OrbitAct;
  actTicks: number;
  attack: AttackDef | null;
  attackTick: number;
  fired: boolean;
  /** The lock-on sword sequence in progress, or null. */
  ml: OrbitMeleeLock | null;
  /** Ticks before another sequence may open. */
  meleeLockout: number;
  guarding: boolean;
  invuln: number;
  /** A few ticks after every hit in which nothing else lands (`hitInvuln`). */
  hitInvuln: number;
  /** Hits taken in the current combo, for damage scaling. */
  combo: number;
  /** Accumulated down value; see `DOWN_LIMIT`. */
  down: number;
  repel: number;
  hitstop: number;
  dashTicks: number;
  dashCooldown: number;
  dashDir: V3;
  boostRegenTimer: number;
  energyRegenTimer: number;
  barrierRegenTimer: number;
  grounded: boolean;
  /** 0..1 how hard the thrusters are burning, for the plumes. */
  thrust: number;
  /** Side-slip, for banking the chassis into a strafe. */
  bank: number;
  subCharges: number;
  subRecharge: number;
  /** Seconds-agnostic clock for idle animation. */
  bob: number;
  walk: number;
}

/**
 * A lock-on sword sequence, the main game's `meleeLock` in three dimensions:
 * one press closes on the rival and runs the machine's whole authored chain —
 * its own hit count, swing cadence and finisher.
 */
export interface OrbitMeleeLock {
  phase: 'close' | 'swing' | 'gap';
  timer: number;
  hitIndex: number;
  hitTimer: number;
  hitDone: boolean;
  life: number;
}

export interface OrbitProjectile {
  active: boolean;
  owner: number;
  pos: V3;
  prev: V3;
  vel: V3;
  speed: number;
  life: number;
  age: number;
  radius: number;
  homing: number;
  homingTicks: number;
  attack: AttackDef;
  damage: number;
  kind: ProjKind;
  family: ProjFamilyId;
  visualScale: number;
  pierce: number;
}

export type OrbitEvent =
  | { t: 'fire'; owner: number; pos: V3; dir: V3; kind: ProjKind; family: ProjFamilyId }
  | { t: 'hit'; owner: number; victim: number; pos: V3; damage: number; kind: ProjKind }
  | { t: 'guard'; victim: number; pos: V3 }
  | { t: 'absorb'; victim: number; pos: V3 }
  | { t: 'burst'; id: number; pos: V3 }
  | { t: 'guardBreak'; id: number; pos: V3 }
  | { t: 'repel'; id: number; attacker: number; pos: V3 }
  | { t: 'dash'; id: number; pos: V3; dir: V3 }
  | { t: 'melee'; id: number; stage: number; pos: V3; dir: V3 }
  | { t: 'salvo'; id: number; pos: V3 }
  | { t: 'saturation'; id: number; mode: SatMode }
  | { t: 'burnout'; id: number; pos: V3 }
  | { t: 'modeCycle'; id: number; mode: SatMode }
  | { t: 'transform'; id: number; to: OrbitForm; pos: V3 }
  | { t: 'transformed'; id: number; form: OrbitForm; pos: V3 }
  | { t: 'wall'; pos: V3 }
  | { t: 'land'; id: number; pos: V3 }
  | { t: 'knockdown'; id: number; pos: V3 }
  | { t: 'ko'; id: number; pos: V3 };

export type OrbitPhase = 'intro' | 'fight' | 'over';
export type OrbitOutcome = 'none' | 'playerWin' | 'enemyWin' | 'draw';

export interface OrbitConfig {
  playerDef: MechDef;
  enemyDef: MechDef;
  seed?: number;
  introTicks?: number;
  roundTicks?: number;
}

/** How much of a target's motion the lock-on leads, and how far ahead at most. */
export const LEAD_SHARE = 0.8;
const LEAD_MAX_TICKS = 50;
/** Half-angle of the mobile form's aim assist off the nose, radians. */
export const NOSE_ASSIST = 0.22;

const FALL_ACCEL = 0.0045;
const FALL_MAX = 0.16;
const BODY_R = 1.05;

function makeFighter(id: number, def: MechDef, at: V3, yaw: number): OrbitFighter {
  const g = def.gauges;
  return {
    id,
    def,
    pos: { ...at },
    vel: v3(),
    yaw,
    pitch: 0,
    life: g.maxLife,
    energy: g.maxEnergy,
    boost: def.flight.maxBoost,
    barrier: g.maxBarrier,
    sat: 0,
    satMode: SatMode.Shoot,
    satActive: false,
    satTicks: 0,
    form: 'mech',
    transformTicks: 0,
    act: OrbitAct.Free,
    actTicks: 0,
    attack: null,
    attackTick: 0,
    fired: false,
    ml: null,
    meleeLockout: 0,
    guarding: false,
    invuln: 0,
    hitInvuln: 0,
    combo: 0,
    down: 0,
    repel: 0,
    hitstop: 0,
    dashTicks: 0,
    dashCooldown: 0,
    dashDir: v3(1, 0, 0),
    boostRegenTimer: 0,
    energyRegenTimer: 0,
    barrierRegenTimer: 0,
    grounded: false,
    thrust: 0,
    bank: 0,
    subCharges: def.subCharges,
    subRecharge: 0,
    bob: id * 1.7,
    walk: 0,
  };
}

/** The radius a shot has to come within to hit this machine, world units. */
export const hurtRadius = (f: OrbitFighter): number =>
  f.def.rig.hurtRadius * PX * 1.35 * (f.form === 'mobile' ? 0.85 : 1);

// ------------------------------------------------------------------- sim

export class OrbitSim {
  readonly fighters: [OrbitFighter, OrbitFighter];
  readonly projectiles: OrbitProjectile[] = [];
  events: OrbitEvent[] = [];
  tick = 0;
  phase: OrbitPhase = 'intro';
  outcome: OrbitOutcome = 'none';
  timeLeft: number;
  private readonly introTicks: number;
  private readonly rng: Rng;

  constructor(cfg: OrbitConfig) {
    this.rng = new Rng(cfg.seed ?? 0x0b17);
    this.introTicks = cfg.introTicks ?? INTRO_TICKS;
    this.timeLeft = cfg.roundTicks ?? ORBIT_ROUND_TICKS;
    this.fighters = [
      makeFighter(0, cfg.playerDef, v3(-16, 7, -2), 0),
      makeFighter(1, cfg.enemyDef, v3(16, 7, -2), Math.PI),
    ];
    for (let i = 0; i < 40; i++) this.projectiles.push(this.blankProjectile());
  }

  get player(): OrbitFighter {
    return this.fighters[0];
  }

  get enemy(): OrbitFighter {
    return this.fighters[1];
  }

  get secondsLeft(): number {
    return Math.ceil(this.timeLeft / TICK_HZ);
  }

  activeProjectiles(): OrbitProjectile[] {
    return this.projectiles.filter((p) => p.active);
  }

  private blankProjectile(): OrbitProjectile {
    return {
      active: false,
      owner: 0,
      pos: v3(),
      prev: v3(),
      vel: v3(),
      speed: 0,
      life: 0,
      age: 0,
      radius: 0,
      homing: 0,
      homingTicks: 0,
      attack: null as unknown as AttackDef,
      damage: 0,
      kind: ProjKind.Bullet,
      family: 'pellet',
      visualScale: 1,
      pierce: 0,
    };
  }

  /** One fixed tick. */
  step(p0: InputFrame, p1: InputFrame): void {
    this.events = [];
    this.tick++;
    const inputs = [p0, p1];
    const frozen = this.phase !== 'fight';
    if (this.phase === 'intro' && this.tick >= this.introTicks) this.phase = 'fight';

    for (let i = 0; i < 2; i++) {
      const f = this.fighters[i];
      const foe = this.fighters[1 - i];
      this.stepFighter(f, foe, frozen ? NO_INPUT : inputs[i]);
    }
    this.separate();
    this.stepProjectiles();

    if (this.phase === 'fight') {
      this.timeLeft--;
      const [a, b] = this.fighters;
      if (a.life <= 0 || b.life <= 0 || this.timeLeft <= 0) this.finish();
    }
  }

  private finish(): void {
    const [a, b] = this.fighters;
    this.phase = 'over';
    for (const f of this.fighters) {
      if (f.life <= 0) {
        f.act = OrbitAct.Down;
        this.events.push({ t: 'ko', id: f.id, pos: { ...f.pos } });
      }
    }
    if (a.life <= 0 && b.life <= 0) this.outcome = 'draw';
    else if (b.life <= 0) this.outcome = 'playerWin';
    else if (a.life <= 0) this.outcome = 'enemyWin';
    else {
      const fa = a.life / a.def.gauges.maxLife;
      const fb = b.life / b.def.gauges.maxLife;
      this.outcome = Math.abs(fa - fb) < 1e-6 ? 'draw' : fa > fb ? 'playerWin' : 'enemyWin';
    }
  }

  // ------------------------------------------------------------- fighter

  /** Unit vector from `f` toward `foe`, flattened onto the deck. */
  static toward(f: OrbitFighter, foe: OrbitFighter): V3 {
    const d = v3(foe.pos.x - f.pos.x, 0, foe.pos.z - f.pos.z);
    return len(d) < 1e-6 ? v3(Math.cos(f.yaw), 0, -Math.sin(f.yaw)) : norm(d);
  }

  /**
   * Where to aim so a shot of `speed` meets `foe`: the lock-on's lead.
   *
   * The side-on game never needed it — a rival dodging in a plane is still on
   * the line the shot travels — but in a volume an unled shot lands only on a
   * machine that has stopped, and measured against EXTREME three seconds of
   * fire took off nothing. Most of the lead, not all of it: a machine that
   * keeps changing direction still slips the shot, which is what dodging is.
   */
  static lead(from: V3, foe: OrbitFighter, speed: number): V3 {
    const at = v3(foe.pos.x, foe.pos.y + 0.2, foe.pos.z);
    if (speed <= 1e-6) return at;
    let t = len(sub(at, from)) / speed;
    for (let i = 0; i < 2; i++) {
      t = Math.min(LEAD_MAX_TICKS, t);
      const p = v3(at.x + foe.vel.x * t * LEAD_SHARE, at.y + foe.vel.y * t * LEAD_SHARE, at.z + foe.vel.z * t * LEAD_SHARE);
      t = len(sub(p, from)) / speed;
    }
    t = Math.min(LEAD_MAX_TICKS, t);
    return v3(at.x + foe.vel.x * t * LEAD_SHARE, at.y + foe.vel.y * t * LEAD_SHARE, at.z + foe.vel.z * t * LEAD_SHARE);
  }

  /** The mobile form's nose, in world space. */
  static nose(f: OrbitFighter): V3 {
    const c = Math.cos(f.pitch);
    return v3(Math.cos(f.yaw) * c, Math.sin(f.pitch), -Math.sin(f.yaw) * c);
  }

  private stepFighter(f: OrbitFighter, foe: OrbitFighter, input: InputFrame): void {
    f.bob += 1 / TICK_HZ;
    if (f.act === OrbitAct.Down) {
      // Wreckage falls.
      f.vel.y = Math.max(-0.3, f.vel.y - 0.01);
      this.integrate(f, 0.98);
      return;
    }
    if (f.hitstop > 0) {
      f.hitstop--;
      return;
    }
    this.gauges(f);
    if (f.act === OrbitAct.Knockdown) {
      if (f.hitInvuln > 0) f.hitInvuln--;
      if (--f.actTicks <= 0) {
        f.act = OrbitAct.Free;
        f.down = 0;
        f.combo = 0;
      }
      f.vel.y = Math.max(-FALL_MAX, f.vel.y - FALL_ACCEL * 2);
      this.integrate(f, 0.96);
      return;
    }
    // A combo ends the moment its victim is free again.
    if (f.act !== OrbitAct.Hitstun && f.act !== OrbitAct.GuardBreak) {
      f.combo = 0;
      f.down = Math.max(0, f.down - 0.02);
    }

    const busy = f.act !== OrbitAct.Free;
    if (f.actTicks > 0) {
      f.actTicks--;
      if (f.actTicks === 0) this.endAct(f);
    }
    if (f.invuln > 0) f.invuln--;
    if (f.hitInvuln > 0) f.hitInvuln--;
    if (f.repel > 0) f.repel--;
    if (f.dashCooldown > 0) f.dashCooldown--;
    if (f.meleeLockout > 0) f.meleeLockout--;

    // ---- saturation -----------------------------------------------------
    if (isPressed(input, Btn.ModeCycle) && !f.satActive) {
      f.satMode = ((f.satMode + 1) % 3) as SatMode;
      this.events.push({ t: 'modeCycle', id: f.id, mode: f.satMode });
    }
    if (isPressed(input, Btn.Saturation) && !f.satActive && f.sat >= f.def.gauges.maxSaturation * 0.25 && f.act !== OrbitAct.Burnout) {
      f.satActive = true;
      f.satTicks = Math.round(f.def.gauges.satDuration * (f.sat / f.def.gauges.maxSaturation));
      this.events.push({ t: 'saturation', id: f.id, mode: f.satMode });
    }

    // ---- transformation ---------------------------------------------------
    if (f.transformTicks > 0) {
      f.transformTicks--;
      if (f.transformTicks === 0) {
        f.form = f.form === 'mech' ? 'mobile' : 'mech';
        f.act = OrbitAct.Free;
        if (f.form === 'mobile') f.pitch = 0;
        this.events.push({ t: 'transformed', id: f.id, form: f.form, pos: { ...f.pos } });
      }
    } else if (isPressed(input, Btn.Flight) && (f.act === OrbitAct.Free || f.act === OrbitAct.Attack)) {
      this.startTransform(f);
    }

    // ---- defence ----------------------------------------------------------
    const canAct = f.act === OrbitAct.Free && f.transformTicks === 0;
    f.guarding = false;
    if (isPressed(input, Btn.Barrier) && (canAct || f.act === OrbitAct.Attack || f.act === OrbitAct.Hitstun)) {
      this.burst(f, f.act === OrbitAct.Hitstun);
    } else if (
      isHeld(input, Btn.Barrier) && canAct && f.form === 'mech' && f.dashTicks === 0 &&
      (f.barrier > 0 || this.barrierFree(f))
    ) {
      f.guarding = true;
      if (!this.barrierFree(f)) f.barrier = Math.max(0, f.barrier - f.def.gauges.guardDrain);
      f.barrierRegenTimer = f.def.gauges.barrierRegenDelay;
    }

    // ---- weapons ----------------------------------------------------------
    if (canAct && !f.guarding) this.tryAttack(f, foe, input);
    if (f.act === OrbitAct.Attack) this.runAttack(f, foe);
    if (f.act === OrbitAct.Melee) this.stepMeleeLock(f, foe);

    // ---- movement ---------------------------------------------------------
    if (f.act === OrbitAct.Melee) this.integrate(f, 1);
    else if (f.form === 'mobile' && f.transformTicks === 0) this.flyMobile(f, input);
    else this.flyMech(f, foe, input, busy);

    // Facing: the mech form always faces its target; the mobile form faces
    // where it is flying.
    if (f.form === 'mech' || f.transformTicks > 0) {
      const t = OrbitSim.toward(f, foe);
      const want = Math.atan2(-t.z, t.x);
      let d = want - f.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      f.yaw += d * 0.25;
    }
  }

  private barrierFree(f: OrbitFighter): boolean {
    return f.satActive && f.satMode === SatMode.Shield;
  }

  private energyFree(f: OrbitFighter): boolean {
    return f.satActive && f.satMode === SatMode.Shoot;
  }

  private boostFree(f: OrbitFighter): boolean {
    return f.satActive && f.satMode === SatMode.Speed;
  }

  private gauges(f: OrbitFighter): void {
    const g = f.def.gauges;
    if (f.energyRegenTimer > 0) f.energyRegenTimer--;
    else f.energy = Math.min(g.maxEnergy, f.energy + g.energyRegen);
    if (f.barrierRegenTimer > 0) f.barrierRegenTimer--;
    else f.barrier = Math.min(g.maxBarrier, f.barrier + g.barrierRegen);
    if (f.boostRegenTimer > 0) f.boostRegenTimer--;
    else f.boost = Math.min(f.def.flight.maxBoost, f.boost + f.def.flight.boostRegen * (f.grounded ? 2 : 1));
    if (f.subCharges < f.def.subCharges) {
      f.subRecharge++;
      if (f.subRecharge >= f.def.subRechargeTicks) {
        f.subRecharge = 0;
        f.subCharges++;
      }
    }
    if (f.satActive) {
      f.satTicks--;
      f.sat = Math.max(0, f.sat - g.maxSaturation / Math.max(1, g.satDuration) * (f.satMode === SatMode.Shield ? 2 : 1));
      if (f.satTicks <= 0 || f.sat <= 0) {
        f.satActive = false;
        f.sat = 0;
        if (f.ml) this.endMeleeLock(f, false);
        f.act = OrbitAct.Burnout;
        f.actTicks = 60;
        f.attack = null;
        this.events.push({ t: 'burnout', id: f.id, pos: { ...f.pos } });
      }
    } else if (this.phase === 'fight') {
      f.sat = Math.min(g.maxSaturation, f.sat + g.satPassive);
    }
  }

  private endAct(f: OrbitFighter): void {
    f.act = OrbitAct.Free;
    f.attack = null;
  }

  startTransform(f: OrbitFighter): void {
    if (f.transformTicks > 0) return;
    f.transformTicks = TRANSFORM_TICKS;
    f.act = OrbitAct.Transform;
    f.attack = null;
    if (f.ml) this.endMeleeLock(f, false);
    f.act = OrbitAct.Transform;
    f.dashTicks = 0;
    this.events.push({ t: 'transform', id: f.id, to: f.form === 'mech' ? 'mobile' : 'mech', pos: { ...f.pos } });
  }

  private burst(f: OrbitFighter, cancelling: boolean): void {
    const b = f.def.barrier;
    const cost = b.cost + (cancelling ? b.cancelPenalty : 0);
    if (!this.barrierFree(f) && f.barrier < cost * 0.5) return;
    if (!this.barrierFree(f)) f.barrier = Math.max(0, f.barrier - cost);
    f.barrierRegenTimer = f.def.gauges.barrierRegenDelay;
    f.invuln = b.invulnTicks;
    f.repel = b.invulnTicks;
    if (f.ml) this.endMeleeLock(f, false);
    f.act = OrbitAct.Burst;
    f.actTicks = b.actionTicks;
    f.attack = null;
    this.events.push({ t: 'burst', id: f.id, pos: { ...f.pos } });
  }

  private tryAttack(f: OrbitFighter, foe: OrbitFighter, input: InputFrame): void {
    const d = f.def;
    const p = (b: Btn): boolean => isPressed(input, b) || (b === Btn.Main && isHeld(input, Btn.Main));
    if (f.form === 'mobile') {
      // The mobile form has its nose gun and nothing else; reaching for the
      // sword or the heavy turns it back into a mech.
      if (isPressed(input, Btn.Melee) || isPressed(input, Btn.Heavy)) {
        this.startTransform(f);
        return;
      }
      if (p(Btn.Main)) this.begin(f, d.main);
      return;
    }
    if (isPressed(input, Btn.Melee)) {
      this.startMeleeLock(f, foe);
      return;
    }
    if (isPressed(input, Btn.Sub) && f.subCharges >= (d.salvo.subCost ?? 1)) {
      f.subCharges -= d.salvo.subCost ?? 1;
      this.events.push({ t: 'salvo', id: f.id, pos: { ...f.pos } });
      this.fire(f, foe, d.salvo, true);
      return;
    }
    if (isPressed(input, Btn.Heavy)) {
      // Heavy while backing off is the lance: a long piercing beam that roots you.
      const back = input.dy > 0;
      this.begin(f, back ? d.lance : d.heavy);
      return;
    }
    if (p(Btn.Main)) this.begin(f, d.main);
  }

  private begin(f: OrbitFighter, a: AttackDef): void {
    if (!this.energyFree(f) && f.energy < a.energyCost) return;
    if (!this.energyFree(f)) f.energy -= a.energyCost;
    f.energyRegenTimer = 30;
    f.act = OrbitAct.Attack;
    f.attack = a;
    f.attackTick = 0;
    f.fired = false;
    f.actTicks = 0;
  }

  private runAttack(f: OrbitFighter, foe: OrbitFighter): void {
    const a = f.attack;
    if (!a) {
      f.act = OrbitAct.Free;
      return;
    }
    f.attackTick++;
    if (!f.fired && f.attackTick >= a.startup) {
      f.fired = true;
      this.fire(f, foe, a, false);
    }
    if (f.attackTick >= a.startup + a.active + a.recovery) {
      f.act = OrbitAct.Free;
      f.attack = null;
    }
  }

  /** Spawns an attack's shots from the muzzle, aimed at the rival. */
  private fire(f: OrbitFighter, foe: OrbitFighter, a: AttackDef, fromDrone: boolean): void {
    const shoot = f.satActive && f.satMode === SatMode.Shoot;
    const speed0 = a.projSpeed * PX * (shoot ? 1.6 : 1);
    const aimAt = OrbitSim.lead(f.pos, foe, speed0);
    // The mech form fires at the rival. The mobile form fires down its nose —
    // and takes the lead too, but only inside a narrow cone off the nose, so a
    // strafing run has to be lined up.
    let dir = norm(sub(aimAt, f.pos));
    if (f.form === 'mobile') {
      const nose = OrbitSim.nose(f);
      if (dot(nose, dir) < Math.cos(NOSE_ASSIST)) dir = nose;
    }
    const side = norm(v3(-dir.z, 0, dir.x));
    const origin = fromDrone
      ? v3(f.pos.x - dir.x * 1.2 + side.x * 1.4, f.pos.y + 1.1, f.pos.z - dir.z * 1.2 + side.z * 1.4)
      : v3(f.pos.x + dir.x * 1.3, f.pos.y + 0.25, f.pos.z + dir.z * 1.3);
    const n = Math.max(1, a.projCount);
    const speed = speed0;
    for (let i = 0; i < n; i++) {
      const fan = n === 1 ? 0 : (i / (n - 1) - 0.5) * 2 * a.spreadRad;
      const lift = n === 1 ? 0 : (this.rng.next() - 0.5) * a.spreadRad * 0.4;
      // Fan across the horizontal, a little lift for depth.
      const c = Math.cos(fan);
      const s = Math.sin(fan);
      const d = norm(v3(dir.x * c - dir.z * s, dir.y + lift, dir.x * s + dir.z * c));
      const p = this.projectiles.find((q) => !q.active) ?? this.grow();
      p.active = true;
      p.owner = f.id;
      p.pos = { ...origin };
      p.prev = { ...origin };
      p.speed = speed;
      p.vel = v3(d.x * speed, d.y * speed, d.z * speed);
      p.life = a.projLife;
      p.age = 0;
      p.radius = Math.max(0.15, a.projRadius * PX);
      p.homing = a.homing * (shoot ? 1.5 : 1);
      p.homingTicks = a.homingTicks ?? a.projLife;
      p.attack = a;
      p.damage = a.damage * (shoot ? 1.5 : 1);
      p.kind = a.kind;
      p.family = a.family ?? 'pellet';
      p.visualScale = a.visualScale ?? 1;
      p.pierce = a.pierceCount;
    }
    // Recoil, and a big shot roots you for a moment.
    f.vel.x -= dir.x * a.recoil * PX;
    f.vel.z -= dir.z * a.recoil * PX;
    this.events.push({ t: 'fire', owner: f.id, pos: origin, dir, kind: a.kind, family: a.family ?? 'pellet' });
  }

  private grow(): OrbitProjectile {
    const p = this.blankProjectile();
    this.projectiles.push(p);
    return p;
  }

  /** Hits in this machine's sequence; SPEED saturation adds two. */
  static meleeHits(f: OrbitFighter): number {
    return f.def.meleeLock.hits + (f.satActive && f.satMode === SatMode.Speed ? 2 : 0);
  }

  /**
   * Opens a sword sequence if the rival is in reach and the reactor can pay for
   * the opening plus a couple of swings — the main game's rule, so a sequence
   * that would fizzle at once is never started.
   */
  private startMeleeLock(f: OrbitFighter, foe: OrbitFighter): boolean {
    const p = f.def.meleeLock;
    if (f.ml || f.meleeLockout > 0 || foe.act === OrbitAct.Down) return false;
    if (len(sub(foe.pos, f.pos)) > p.acquireRange * PX) return false;
    if (!this.energyFree(f) && f.energy < p.energy + Math.min(p.hitEnergy * 2, 40)) return false;
    if (!this.energyFree(f)) f.energy -= p.energy;
    f.energyRegenTimer = 30;
    f.sat = Math.min(f.def.gauges.maxSaturation, f.sat + 4 + p.hits * 0.35);
    f.invuln = Math.max(f.invuln, 2);
    f.act = OrbitAct.Melee;
    f.attack = null;
    f.ml = { phase: 'close', timer: 0, hitIndex: 0, hitTimer: 0, hitDone: false, life: p.maxLife };
    this.events.push({ t: 'melee', id: f.id, stage: 0, pos: { ...f.pos }, dir: norm(sub(foe.pos, f.pos)) });
    return true;
  }

  private endMeleeLock(f: OrbitFighter, full: boolean): void {
    const p = f.def.meleeLock;
    f.ml = null;
    f.meleeLockout = Math.max(f.meleeLockout, full ? p.lockout : Math.round(p.lockout * 0.45));
    if (f.act === OrbitAct.Melee) f.act = OrbitAct.Free;
  }

  private stepMeleeLock(f: OrbitFighter, foe: OrbitFighter): void {
    const ml = f.ml;
    if (!ml) {
      f.act = OrbitAct.Free;
      return;
    }
    const p = f.def.meleeLock;
    ml.life--;
    if (foe.act === OrbitAct.Down || ml.life <= 0) {
      this.endMeleeLock(f, false);
      return;
    }
    const d = sub(foe.pos, f.pos);
    const dist = Math.max(0.025, len(d));
    const n = v3(d.x / dist, d.y / dist, d.z / dist);
    const thrust = p.thrust * PX;
    const lerpV = (want: V3, k: number): void => {
      f.vel.x += (want.x - f.vel.x) * k;
      f.vel.y += (want.y - f.vel.y) * k;
      f.vel.z += (want.z - f.vel.z) * k;
    };

    if (ml.phase === 'close') {
      ml.timer++;
      lerpV(v3(n.x * thrust, n.y * thrust, n.z * thrust), p.tracking);
      f.thrust = 1;
      // Bodies never overlap, so "in range" can be no closer than they can get.
      if (dist <= Math.max(p.range * PX, BODY_R * 2.1) || ml.timer > 28) {
        ml.phase = 'swing';
        ml.timer = 0;
        ml.hitTimer = 0;
        ml.hitDone = false;
      }
      return;
    }

    if (ml.phase === 'gap') {
      ml.timer++;
      f.vel.x *= 0.86;
      f.vel.y *= 0.86;
      f.vel.z *= 0.86;
      if (ml.timer >= p.gap) {
        ml.phase = 'swing';
        ml.timer = 0;
        ml.hitTimer = 0;
        ml.hitDone = false;
      }
      return;
    }

    // ---- swing: circle the target, a different side each hit ----
    ml.hitTimer++;
    const side = v3(-n.z, 0, n.x);
    const r = Math.max(BODY_R * 1.9, (42 + Math.min(24, ml.hitIndex * 3)) * PX);
    const sway = Math.sin((ml.hitIndex + 1) * 1.7);
    const want = v3(
      foe.pos.x - n.x * r + side.x * sway * r * 0.6,
      foe.pos.y - 12 * PX + sway * 10 * PX,
      foe.pos.z - n.z * r + side.z * sway * r * 0.6,
    );
    const cap = thrust * 0.74;
    const clampV = (v: number): number => Math.max(-cap, Math.min(cap, v));
    lerpV(v3(clampV(want.x - f.pos.x), clampV(want.y - f.pos.y), clampV(want.z - f.pos.z)), p.tracking * 0.74);

    const hits = OrbitSim.meleeHits(f);
    if (ml.hitTimer === 1) {
      // Each swing is paid for; running dry fizzles the sequence.
      if (!this.energyFree(f) && f.energy < p.hitEnergy) {
        this.endMeleeLock(f, true);
        return;
      }
      if (!this.energyFree(f)) f.energy -= p.hitEnergy;
      f.energyRegenTimer = 30;
      if (ml.hitIndex > 0) this.events.push({ t: 'melee', id: f.id, stage: ml.hitIndex, pos: { ...f.pos }, dir: n });
    }
    const activeStart = Math.max(2, Math.floor(p.swing * 0.34));
    const activeEnd = Math.max(activeStart + 1, Math.floor(p.swing * 0.72));
    if (
      !ml.hitDone && ml.hitTimer >= activeStart && ml.hitTimer <= activeEnd &&
      dist < (p.range + 54) * PX + hurtRadius(foe) * 0.5
    ) {
      ml.hitDone = true;
      this.meleeContact(f, foe, ml.hitIndex >= hits - 1, n);
      if (!f.ml) return;
    }
    if (ml.hitTimer >= p.swing) {
      ml.hitIndex++;
      if (ml.hitIndex >= hits) {
        this.endMeleeLock(f, true);
        return;
      }
      ml.phase = 'gap';
      ml.timer = 0;
    }
  }

  private meleeContact(f: OrbitFighter, foe: OrbitFighter, last: boolean, n: V3): void {
    const ml = f.ml!;
    const p = f.def.meleeLock;
    const at = v3((f.pos.x + foe.pos.x) / 2, (f.pos.y + foe.pos.y) / 2 + 0.3, (f.pos.z + foe.pos.z) / 2);
    // A burst on the opening blow throws the attacker off.
    if (foe.repel > 0 && ml.hitIndex === 0) {
      foe.repel = 0;
      foe.sat = Math.min(foe.def.gauges.maxSaturation, foe.sat + foe.def.gauges.satOnAbsorb * 2);
      this.endMeleeLock(f, false);
      f.act = OrbitAct.Hitstun;
      f.actTicks = 60;
      f.vel = v3(-n.x * 0.4, 0.12, -n.z * 0.4);
      this.events.push({ t: 'repel', id: foe.id, attacker: f.id, pos: at });
      return;
    }
    const base = f.def.melee[Math.min(ml.hitIndex, f.def.melee.length - 1)];
    const dmg = p.damage[Math.min(ml.hitIndex, p.damage.length - 1)];
    const knock = p.knock[Math.min(ml.hitIndex, p.knock.length - 1)];
    const swing: AttackDef = {
      ...base,
      damage: dmg,
      guardDamage: dmg * 0.5,
      hitstop: last ? 14 : 7,
      // The chain holds itself together: stun covers the cadence (see Combatant).
      hitstun: last ? 30 : Math.max(14, p.swing + p.gap + 2),
      knockback: last ? knock + p.finisherKnock : knock,
    };
    const shoot = f.satActive && f.satMode === SatMode.Shoot ? 1.5 : 1;
    this.applyHit(f, foe, swing, dmg * shoot, at, n, last ? 1.25 : 1, true);
    if (last && f.ml) {
      // The finisher forcibly creates neutral again.
      f.vel = v3(-n.x * p.finisherKnock * 0.28 * PX, p.finalLift * 0.4 * PX, -n.z * p.finisherKnock * 0.28 * PX);
    }
  }

  /** Damage, guard and barrier resolution for one hit. */
  private applyHit(
    f: OrbitFighter,
    foe: OrbitFighter,
    a: AttackDef,
    damage: number,
    at: V3,
    dir: V3,
    launch: number,
    melee: boolean,
  ): 'hit' | 'guard' | 'absorb' | 'ignored' {
    // Overlapping sources cannot chain-lock a machine: the main game's rule.
    if (foe.hitInvuln > 0) return 'ignored';
    if (foe.invuln > 0) {
      foe.sat = Math.min(foe.def.gauges.maxSaturation, foe.sat + foe.def.gauges.satOnAbsorb);
      this.events.push({ t: 'absorb', victim: foe.id, pos: at });
      return 'absorb';
    }
    const facing = dot(OrbitSim.toward(foe, f), norm(v3(-dir.x, 0, -dir.z))) > -0.2;
    // Melee "pierces" the barrier burst, not the guard: a raised guard still
    // stops a sword, and only a piercing *shot* goes through it.
    const pierce = a.barrier === BarrierResponse.Pierce && a.kind !== ProjKind.Melee;
    if (foe.guarding && facing && !pierce) {
      const scale = melee ? foe.def.barrier.meleeGuardScale : foe.def.barrier.guardScale;
      foe.life -= damage * scale;
      if (!this.barrierFree(foe)) foe.barrier -= a.guardDamage;
      this.events.push({ t: 'guard', victim: foe.id, pos: at });
      if (foe.barrier <= 0 && !this.barrierFree(foe)) {
        foe.barrier = 0;
        foe.guarding = false;
        foe.act = OrbitAct.GuardBreak;
        foe.actTicks = foe.def.barrier.breakStun;
        this.events.push({ t: 'guardBreak', id: foe.id, pos: { ...foe.pos } });
      }
      f.sat = Math.min(f.def.gauges.maxSaturation, f.sat + a.satGain * 0.5);
      return 'guard';
    }
    // Chassis defence, and the brace a machine gets with its feet planted.
    // Each further hit in one combo is worth a little less, as in every 3D
    // fighter; a long chain still pays, it just cannot pay for the whole bar.
    const prorate = Math.max(0.5, 1 - 0.07 * foe.combo);
    const landed = damage * prorate * foe.def.defence.mul * (foe.grounded ? foe.def.defence.groundedMul : 1);
    foe.combo++;
    if (!melee) foe.down += 1 + a.hitstun / 20;
    foe.life -= landed;
    foe.hitInvuln = foe.def.gauges.hitInvuln;
    foe.sat = Math.min(foe.def.gauges.maxSaturation, foe.sat + foe.def.gauges.satOnDamage * landed);
    f.sat = Math.min(f.def.gauges.maxSaturation, f.sat + a.satGain);
    // A hit knocks a transforming or mobile machine back into mech form.
    if (foe.transformTicks > 0 || foe.form === 'mobile') {
      foe.transformTicks = 0;
      foe.form = 'mech';
      this.events.push({ t: 'transformed', id: foe.id, form: 'mech', pos: { ...foe.pos } });
    }
    if (foe.act !== OrbitAct.Burnout) {
      foe.act = OrbitAct.Hitstun;
      foe.actTicks = Math.max(foe.actTicks, a.hitstun);
      foe.attack = null;
      if (foe.ml) this.endMeleeLock(foe, false);
      foe.act = OrbitAct.Hitstun;
    }
    const kb = a.knockback * PX * 1.2 * launch;
    foe.vel = v3(dir.x * kb, dir.y * kb + (launch > 1 ? 0.16 : 0.02), dir.z * kb);
    if (foe.down >= DOWN_LIMIT && foe.act === OrbitAct.Hitstun) {
      foe.act = OrbitAct.Knockdown;
      foe.actTicks = KNOCKDOWN_TICKS;
      foe.hitInvuln = KNOCKDOWN_TICKS + WAKE_INVULN;
      const flat = norm(v3(dir.x, 0, dir.z));
      foe.vel = v3(flat.x * 0.32, 0.2, flat.z * 0.32);
      this.events.push({ t: 'knockdown', id: foe.id, pos: { ...foe.pos } });
    }
    foe.hitstop = Math.min(10, a.hitstop);
    if (melee) f.hitstop = Math.min(8, a.hitstop);
    this.events.push({ t: 'hit', owner: f.id, victim: foe.id, pos: at, damage: landed, kind: a.kind });
    return 'hit';
  }

  // -------------------------------------------------------------- movement

  private flyMech(f: OrbitFighter, foe: OrbitFighter, input: InputFrame, busy: boolean): void {
    const fl = f.def.flight;
    const speedSat = f.satActive && f.satMode === SatMode.Speed;
    const fwd = OrbitSim.toward(f, foe);
    const right = v3(-fwd.z, 0, fwd.x);
    const along = -input.dy;
    const strafe = input.dx;
    let wish = v3(fwd.x * along + right.x * strafe, 0, fwd.z * along + right.z * strafe);
    const hasDir = len(wish) > 0.01;
    if (hasDir) wish = norm(wish);
    const free = f.act === OrbitAct.Free || f.act === OrbitAct.Attack;
    const anchored = f.act === OrbitAct.Attack ? 0.55 : 1;
    const guardSlow = f.guarding ? 0.35 : 1;

    // Dash: a tap of boost with a direction.
    if (f.dashTicks > 0) {
      f.dashTicks--;
      const ds = fl.dashSpeed * PX * (speedSat ? 1.6 : 1);
      f.vel.x = f.dashDir.x * ds;
      f.vel.z = f.dashDir.z * ds;
      f.vel.y *= 0.8;
      f.thrust = 1;
    } else if (
      free && hasDir && isPressed(input, Btn.Boost) && f.dashCooldown === 0 &&
      (f.boost >= fl.dashCost || this.boostFree(f))
    ) {
      if (!this.boostFree(f)) f.boost -= fl.dashCost;
      f.boostRegenTimer = fl.boostRegenDelay;
      f.dashTicks = fl.dashTicks;
      f.dashCooldown = fl.dashTicks + fl.dashCooldown;
      f.dashDir = { ...wish };
      f.act = f.act === OrbitAct.Attack ? OrbitAct.Attack : OrbitAct.Free;
      this.events.push({ t: 'dash', id: f.id, pos: { ...f.pos }, dir: { ...wish } });
    } else {
      // Ordinary flight and boosting, with momentum.
      const boosting = free && isHeld(input, Btn.Boost) && (f.boost > 0 || this.boostFree(f));
      const cap = (boosting && hasDir ? fl.boostMaxSpeed : fl.maxSpeed) * PX * (speedSat ? 1.35 : 1) * anchored * guardSlow;
      const acc = (boosting ? fl.boostAccel : fl.accel) * PX;
      if (!busy || f.act === OrbitAct.Attack) {
        const tx = wish.x * cap;
        const tz = wish.z * cap;
        f.vel.x += Math.max(-acc, Math.min(acc, tx - f.vel.x));
        f.vel.z += Math.max(-acc, Math.min(acc, tz - f.vel.z));
      } else {
        f.vel.x *= 0.92;
        f.vel.z *= 0.92;
      }
      if (boosting) {
        if (!this.boostFree(f)) f.boost = Math.max(0, f.boost - fl.boostDrain);
        f.boostRegenTimer = fl.boostRegenDelay;
      }
      // Climb on boost with no direction; otherwise a slow sink to the deck.
      if (boosting && !hasDir) {
        f.vel.y = Math.min(fl.boostMaxSpeed * PX * 0.62, f.vel.y + 0.02);
      } else if (boosting && hasDir) {
        f.vel.y *= 0.85;
      } else if (f.act !== OrbitAct.Melee) {
        f.vel.y = Math.max(-FALL_MAX, f.vel.y - FALL_ACCEL);
      }
      f.thrust = boosting ? (hasDir ? 0.85 : 0.75) : hasDir ? 0.3 : 0.15;
    }
    this.integrate(f, f.act === OrbitAct.Hitstun ? 0.95 : 1);
    // Banking into the strafe, and the walk cycle on the deck.
    const lateral = dot(f.vel, right);
    f.bank += (Math.max(-0.5, Math.min(0.5, lateral * 2.2)) - f.bank) * 0.15;
    if (f.grounded) f.walk += Math.hypot(f.vel.x, f.vel.z) * 0.9;
  }

  private flyMobile(f: OrbitFighter, input: InputFrame): void {
    const fl = f.def.flight;
    const speedSat = f.satActive && f.satMode === SatMode.Speed;
    f.yaw -= input.dx * MOBILE.turnRate;
    f.pitch = Math.max(-MOBILE.maxPitch, Math.min(MOBILE.maxPitch, f.pitch - input.dy * MOBILE.pitchRate));
    if (input.dy === 0) f.pitch *= 0.97;
    const burner = isHeld(input, Btn.Boost) && (f.boost > 0 || this.boostFree(f));
    const speed =
      (burner ? fl.dashSpeed * MOBILE.burner : fl.boostMaxSpeed * MOBILE.cruise) * PX * (speedSat ? 1.35 : 1);
    if (burner) {
      if (!this.boostFree(f)) f.boost = Math.max(0, f.boost - fl.boostDrain * MOBILE.burnerDrain);
      f.boostRegenTimer = fl.boostRegenDelay;
    }
    const nose = OrbitSim.nose(f);
    const k = 0.12;
    f.vel.x += (nose.x * speed - f.vel.x) * k;
    f.vel.y += (nose.y * speed - f.vel.y) * k;
    f.vel.z += (nose.z * speed - f.vel.z) * k;
    f.thrust = burner ? 1 : 0.6;
    f.bank += (input.dx * 0.6 - f.bank) * 0.12;
    this.integrate(f, 1);
  }

  /** Moves, then keeps the machine in the arena and out of the structure. */
  private integrate(f: OrbitFighter, drag: number): void {
    f.vel.x *= drag;
    f.vel.z *= drag;
    f.pos.x += f.vel.x;
    f.pos.y += f.vel.y;
    f.pos.z += f.vel.z;
    let hitWall = false;
    if (f.pos.x < ARENA.minX) (f.pos.x = ARENA.minX), (f.vel.x = Math.max(0, f.vel.x)), (hitWall = true);
    if (f.pos.x > ARENA.maxX) (f.pos.x = ARENA.maxX), (f.vel.x = Math.min(0, f.vel.x)), (hitWall = true);
    if (f.pos.z < ARENA.minZ) (f.pos.z = ARENA.minZ), (f.vel.z = Math.max(0, f.vel.z)), (hitWall = true);
    if (f.pos.z > ARENA.maxZ) (f.pos.z = ARENA.maxZ), (f.vel.z = Math.min(0, f.vel.z)), (hitWall = true);
    if (f.pos.y > ARENA.ceiling) (f.pos.y = ARENA.ceiling), (f.vel.y = Math.min(0, f.vel.y));
    const floorY = ARENA.floor + this.footHeight(f);
    const wasGrounded = f.grounded;
    f.grounded = false;
    if (f.pos.y <= floorY) {
      f.pos.y = floorY;
      if (f.vel.y < 0) f.vel.y = 0;
      f.grounded = f.form === 'mech';
      if (f.form === 'mobile') {
        // A mobile form skims off the deck rather than landing on it.
        f.pitch = Math.max(f.pitch, 0.1);
      }
    }
    if (f.grounded && !wasGrounded) this.events.push({ t: 'land', id: f.id, pos: { ...f.pos } });
    for (const b of OBSTACLES) {
      const axis = pushOut(f.pos, BODY_R, b);
      if (axis === 0) f.vel.x = 0;
      else if (axis === 1) {
        f.vel.y = Math.max(0, f.vel.y);
        if (f.pos.y > b.max.y) f.grounded = f.form === 'mech';
      } else if (axis === 2) f.vel.z = 0;
      if (axis >= 0 && f.form === 'mobile') hitWall = true;
    }
    // A mobile form that flies into something turns away from it.
    if (hitWall && f.form === 'mobile') {
      f.yaw += Math.PI * 0.5;
      this.events.push({ t: 'wall', pos: { ...f.pos } });
    }
  }

  /** How high a machine's core rides above the deck when standing on it. */
  footHeight(f: OrbitFighter): number {
    return f.form === 'mobile' ? 0.9 : f.def.rig.footOffset * f.def.rig.scale * PX;
  }

  /** Two machines never occupy the same space. */
  private separate(): void {
    const [a, b] = this.fighters;
    const d = sub(b.pos, a.pos);
    const l = len(d);
    const min = BODY_R * 1.7;
    if (l < min && l > 1e-6) {
      const push = (min - l) / 2;
      const n = v3(d.x / l, d.y / l, d.z / l);
      a.pos.x -= n.x * push;
      a.pos.y -= n.y * push;
      a.pos.z -= n.z * push;
      b.pos.x += n.x * push;
      b.pos.y += n.y * push;
      b.pos.z += n.z * push;
    }
  }

  // ------------------------------------------------------------ projectiles

  private stepProjectiles(): void {
    for (const p of this.projectiles) {
      if (!p.active) continue;
      p.age++;
      const target = this.fighters[1 - p.owner];
      // Homing: turn the velocity toward the target, a little each tick.
      if (p.homing > 0 && p.age < p.homingTicks && target.act !== OrbitAct.Down) {
        const want = norm(sub(v3(target.pos.x, target.pos.y + 0.2, target.pos.z), p.pos));
        const cur = norm(p.vel);
        const ang = Math.acos(Math.max(-1, Math.min(1, dot(cur, want))));
        if (ang > 1e-4) {
          const k = Math.min(1, p.homing / ang);
          const nd = norm(v3(cur.x + (want.x - cur.x) * k, cur.y + (want.y - cur.y) * k, cur.z + (want.z - cur.z) * k));
          p.vel = v3(nd.x * p.speed, nd.y * p.speed, nd.z * p.speed);
        }
      }
      p.prev = { ...p.pos };
      p.pos.x += p.vel.x;
      p.pos.y += p.vel.y;
      p.pos.z += p.vel.z;
      p.life--;
      let dead = p.life <= 0 || p.pos.y < 0 || p.pos.y > ARENA.ceiling + 6;
      if (!dead) for (const b of OBSTACLES) if (inBox(p.pos, b)) dead = true;
      if (dead) {
        p.active = false;
        continue;
      }
      if (target.act === OrbitAct.Down || this.phase !== 'fight') continue;
      if (segDist(p.prev, p.pos, target.pos) <= hurtRadius(target) + p.radius) {
        const shooter = this.fighters[p.owner];
        const res = this.applyHit(shooter, target, p.attack, p.damage, { ...p.pos }, norm(p.vel), 1, false);
        if (res === 'ignored') continue;
        if (res === 'hit' && p.pierce > 0) p.pierce--;
        else p.active = false;
      }
    }
  }
}

const NO_INPUT: InputFrame = { dx: 0, dy: 0, held: 0, pressed: 0, aimX: null, aimY: null };
