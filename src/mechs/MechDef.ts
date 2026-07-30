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

/** One renderable part of the mech, mirroring the reference's helper-per-part build. */
export interface RigPart {
  name: string;
  parent: string | null;
  x: number;
  y: number;
  rotation: number;
  /** 'chassis' follows bank, 'turret' follows aim, 'thruster' reacts to accel. */
  follow: 'chassis' | 'turret' | 'thruster' | 'fixed';
}

export interface MechRigDef {
  parts: RigPart[];
  drawOrder: string[];
  /** Collision radius used by the simulation. */
  hurtRadius: number;
  /** Height of the chassis in logical pixels, used for HUD and camera framing. */
  chassisHeight: number;
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
  rig: MechRigDef;

  main: AttackDef;
  heavy: AttackDef;
  lance: AttackDef;
  spread: AttackDef;
  sub: AttackDef;
  salvo: AttackDef;
  melee: AttackDef[];

  /** Sub-weapon charge economy (the reference had its own charge indicator). */
  subCharges: number;
  subRechargeTicks: number;

  /** Soft-lock cone half-angle in radians and max range. */
  lockCone: number;
  lockRange: number;

  /** Palette used by the procedural fallback renderer and effects tinting. */
  tint: { primary: number; secondary: number; accent: number; thruster: number };
}
