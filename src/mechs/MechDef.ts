import type { AttackDef } from '../combat/AttackData';

/** Flight tuning. All values are logical pixels and ticks. */
export interface FlightDef {
  accel: number;
  maxSpeed: number;
  /** Per-tick velocity multiplier while coasting (no directional input). */
  coastDrag: number;
  /** Per-tick velocity multiplier while air-braking. */
  brakeDrag: number;

  boostAccel: number;
  boostMaxSpeed: number;
  /** Full boost gauge. Kept alongside GaugeDef so flight is self-contained. */
  maxBoost: number;
  /** Boost gauge drained per tick while boosting. */
  boostDrain: number;
  /** Boost gauge regained per tick once the refill delay has elapsed. */
  boostRegen: number;
  boostRegenDelay: number;

  dashSpeed: number;
  dashTicks: number;
  dashCost: number;
  /** Ticks after a dash before another may start. */
  dashCooldown: number;

  /** Radians per tick the chassis rotates toward its target bank angle. */
  bankRate: number;
  /** Max bank magnitude in radians. */
  bankMax: number;
  /** Radians per tick the weapon mounts slew toward the aim angle. */
  turretRate: number;

  /** Downward acceleration applied while FlyingMode is off. */
  gravity: number;
  /** Horizontal speed cap while walking on the ground. */
  walkSpeed: number;
  /** Per-tick velocity multiplier applied by ground contact. */
  groundFriction: number;
  /** Upward impulse when taking off from the ground. */
  takeoffImpulse: number;
  /** Boost regen multiplier while grounded — resting refuels faster. */
  groundedBoostRegen: number;
}

export interface GaugeDef {
  maxLife: number;
  maxEnergy: number;
  energyRegen: number;
  maxBoost: number;
  maxBarrier: number;
  barrierRegen: number;
  barrierRegenDelay: number;
  /** Barrier drained per tick while holding guard. */
  guardDrain: number;
  maxSaturation: number;
  /** Saturation gained per tick passively. */
  satPassive: number;
  /** Saturation gained when a barrier absorbs a shot. */
  satOnAbsorb: number;
  /** Ticks a full saturation activation lasts. */
  satDuration: number;
  /**
   * Saturation granted per point of damage *taken*. A losing pilot builds
   * toward their overdrive — a comeback valve the working Iron Babel build uses
   * (`target.sat += damage * .35`).
   */
  satOnDamage: number;
  /**
   * Ticks of invulnerability granted immediately after any hit lands, so
   * overlapping multi-hit sources cannot chain-lock a mech.
   */
  hitInvuln: number;
  /** Ticks melee is locked out after a finisher or a broken chain. */
  meleeLockout: number;
}

export interface BarrierDef {
  /** Ticks the barrier burst action locks the mech. */
  actionTicks: number;
  /** Ticks of invulnerability granted by the burst. */
  invulnTicks: number;
  /** Extra invulnerability while Shield saturation is active. */
  shieldBonusTicks: number;
  /** Barrier gauge cost of a burst. */
  cost: number;
  /** Extra cost when bursting out of guard or hitstun (reference penalty). */
  cancelPenalty: number;
  /** Ticks of stun on guard break. */
  breakStun: number;
  /** Fraction of damage taken through a held guard. */
  guardScale: number;
  radius: number;
}

/**
 * Layered defence, mirroring the reference's `DefenceMulSet` tiers.
 *
 * 2005 selected a multiplier from `var(30)` (0.55 / 0.85 / 0.65 / 0.75) on top of
 * the base `defence` stat, so incoming damage was scaled per chassis rather than
 * being a single flat number.
 */
export interface DefenceDef {
  /** Multiplier applied to all incoming damage. Lower = tougher. */
  mul: number;
  /** Extra multiplier while grounded — planted frames brace better. */
  groundedMul: number;
}

/**
 * How the arm carries the blade through one swing, in degrees relative to the
 * aim direction.
 *
 * Modelled on how the 2005 reference actually animated its close attack. Its
 * arm helper (statedef 6200) drives an explicit arm angle: over the first ~12
 * ticks the command rises by 5deg a tick to a raised position, then flips to a
 * far-side angle roughly 200-235deg away, which the arm chases at a fixed rate.
 * The reference carried four variants of this, mirrored, so consecutive swings
 * alternate handedness.
 *
 * The point is that a swing is an *arc*. Without one the mech simply translates
 * into its target with the blade held out, which reads as a repeated stab.
 */
export interface SwingArc {
  /** Degrees the blade is raised above the aim before the slash begins. */
  windup: number;
  /** Degrees swept downward from the raised position through the follow-through. */
  sweep: number;
  /** Fraction of the swing spent winding up; the rest is the slash. */
  windupFrac: number;
  /** Mirror the arc on alternate hits, as the reference's variants did. */
  alternate: boolean;
}

/**
 * Lock-on melee profile.
 *
 * Modelled on the working Iron Babel build's `meleeProfile`: melee is not a
 * manually re-pressed chain but a single committed sequence. One press acquires
 * a target, thrusts onto it, then runs `hits` swings while repositioning around
 * it, with escalating damage and a separating finisher.
 */
export interface MeleeProfile {
  /** Display name, announced when the sequence opens. */
  name: string;
  /** Number of swings in the sequence. */
  hits: number;
  /** Approach speed while closing on the target. */
  thrust: number;
  /** Velocity lerp factor toward the desired position, 0..1. */
  tracking: number;
  /** Distance at which a swing connects. */
  range: number;
  /** Furthest a target may be to acquire a lock at all. */
  acquireRange: number;
  /** Energy to open the sequence. */
  energy: number;
  /** Energy per swing; the sequence fizzles if it cannot be paid. */
  hitEnergy: number;
  /** Ticks melee is locked out after the sequence ends. */
  lockout: number;
  /** Ticks per swing, and the pause between swings. */
  swing: number;
  gap: number;
  /** How the arm carries the blade through each swing. */
  arc: SwingArc;
  /** Per-hit damage and knockback; the last entry is the finisher. */
  damage: number[];
  knock: number[];
  /** Extra separation applied by the finisher. */
  finisherKnock: number;
  finalLift: number;
  /** Ticks before the whole sequence gives up. */
  maxLife: number;
}

/**
 * The supporter drone that carries the sub-weapon.
 *
 * The 2005 reference lists it as its own screen element — "2) supporter - sub
 * shoot" — flying beside the machine with its own charge gauge drawn on it
 * (see docs/REFERENCE_AUDIT.md 4c). It is a real entity there, not a muzzle on
 * the chassis, and it trails behind the owner's facing at a distance that scales
 * with the chassis weight.
 *
 * The projectile itself is described by the owner's `sub`/`salvo` `AttackDef`,
 * so per-chassis spread and speed stay in one place.
 */
export interface SupporterDef {
  /** Display name, announced when the assist is ordered. */
  name: string;
  /** Rest offset from the owner: behind its facing, and below it. */
  followBack: number;
  followDown: number;
  /** Spring pull toward the rest offset, per tick. */
  followAccel: number;
  /** Per-tick velocity multiplier; damps the spring. */
  followDamp: number;
  /** Speed cap while catching up, so it never teleports. */
  maxSpeed: number;
  /** Radians per tick the drone slews toward its firing angle. */
  turretRate: number;
  /** Ticks between the order and the shot leaving the drone. */
  windup: number;
  /** Ticks the drone holds the firing pose afterwards. */
  recover: number;
  /** Ticks before it will accept another order. */
  cooldown: number;
  /** Distance from the drone's centre that the shot leaves. */
  muzzleForward: number;
  /** Drawn size / effect scale. The drone is not hittable. */
  radius: number;
}

/** One renderable part of the mech, mirroring the reference's helper-per-part build. */
export interface RigPart {
  name: string;
  parent: string | null;
  x: number;
  y: number;
  rotation: number;
  /**
   * 'chassis' follows bank, 'turret' follows aim, 'thruster' reacts to accel,
   * 'legNear'/'legFar' stride in antiphase while walking.
   */
  follow: 'chassis' | 'turret' | 'thruster' | 'legNear' | 'legFar' | 'fixed';
}

export interface MechRigDef {
  parts: RigPart[];
  drawOrder: string[];
  /** Collision radius used by the simulation. */
  hurtRadius: number;
  /** Height of the chassis in logical pixels, used for HUD and camera framing. */
  chassisHeight: number;
  /**
   * Distance from the body centre down to the soles, in logical pixels.
   *
   * Measured from the exported sprites: hip offset plus the leg's reach below
   * its hip pivot. Subtracting this from `DECK_Y` gives the body height at which
   * this chassis's feet touch the deck, so a tall walker and a squat one both
   * stand *on* the floor rather than one hovering and one sunk into it.
   */
  footOffset: number;
}

export interface MechDef {
  id: string;
  name: string;
  codeName: string;
  pilot: string;
  faction: string;
  /** Short flavour line shown on the title/versus screen. */
  blurb: string;
  /** Display stats 1..5 for the UI. */
  statPower: number;
  statSpeed: number;
  statRange: number;

  flight: FlightDef;
  gauges: GaugeDef;
  barrier: BarrierDef;
  defence: DefenceDef;
  rig: MechRigDef;

  main: AttackDef;
  heavy: AttackDef;
  lance: AttackDef;
  spread: AttackDef;
  sub: AttackDef;
  salvo: AttackDef;
  /** Frame data for a single swing's hit; the sequence is driven by `meleeLock`. */
  melee: AttackDef[];
  meleeLock: MeleeProfile;

  /** Sub-weapon charge economy (the reference had its own charge indicator). */
  subCharges: number;
  subRechargeTicks: number;
  /** The drone that actually fires `sub` and `salvo`. */
  supporter: SupporterDef;

  /** Soft-lock cone half-angle in radians and max range. */
  lockCone: number;
  lockRange: number;

  /**
   * Centre-to-centre distance at which the main-gun button becomes a sword
   * swing. Deliberately generous: the swing lunges forward during its startup
   * (see AttackDef.lunge), exactly as the reference closed distance with
   * `posadd` during its melee startup. Deriving this from the hit radius makes
   * it smaller than the chassis itself and the melee feels broken.
   */
  meleeRange: number;

  /** Palette used by the procedural fallback renderer and effects tinting. */
  /** `glow` matches the mech's emissive palette entry — beam blade, visor, tubes. */
  tint: {
    primary: number;
    secondary: number;
    accent: number;
    thruster: number;
    glow: number;
  };
}
