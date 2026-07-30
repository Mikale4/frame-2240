import type { FlightDef } from '../mechs/MechDef';
import { limitLength } from '../core/MathUtil';

/** Per-tick decay applied to carried overspeed above the nominal cap. */
const OVERSPEED_BLEED = 0.96;

/** The mutable motion state a flight step reads and writes. */
export interface FlightState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  boost: number;
  boostRegenTimer: number;
  dashTicks: number;
  dashCooldown: number;
  dashDirX: number;
  dashDirY: number;
}

export interface FlightIntent {
  dx: number;
  dy: number;
  /** Boost button held. With a direction this boosts; with none it air-brakes. */
  boost: boolean;
  /** A dash was requested this tick (tap + direction, or a double-tap). */
  dash: boolean;
  /** Multiplier applied to speed caps, e.g. Speed saturation. */
  speedScale: number;
  /** Multiplier applied to velocity each tick, e.g. firing anchor. */
  moveScale: number;
}

export interface FlightResult {
  /** True when a dash actually started this tick (for events/effects). */
  dashStarted: boolean;
  /** True while boosting and consuming gauge. */
  boosting: boolean;
  /** True while air-braking. */
  braking: boolean;
}

/**
 * Momentum-based 8-direction free flight.
 *
 * The 2005 reference set velocity directly (`velset`) each tick, which is very
 * snappy but has no momentum. CLAUDE.md asks for momentum, braking, boost and
 * dash, so this model accelerates toward the input direction with a high
 * acceleration and a light coast drag: it still turns crisply, but you carry
 * speed and must brake. Dashes remain an authored constant-velocity burst,
 * matching the reference's `vel * 2.25` feel.
 */
export function stepFlight(
  s: FlightState,
  def: FlightDef,
  intent: FlightIntent,
): FlightResult {
  const result: FlightResult = { dashStarted: false, boosting: false, braking: false };

  if (s.dashCooldown > 0) s.dashCooldown--;

  const hasDir = intent.dx !== 0 || intent.dy !== 0;
  // Normalise so diagonals are not faster (the reference divided by 1.414).
  let nx = intent.dx;
  let ny = intent.dy;
  if (hasDir) {
    const l = Math.hypot(nx, ny);
    nx /= l;
    ny /= l;
  }

  // ---- Dash start -------------------------------------------------------
  if (
    intent.dash &&
    hasDir &&
    s.dashTicks <= 0 &&
    s.dashCooldown <= 0 &&
    s.boost >= def.dashCost
  ) {
    s.boost -= def.dashCost;
    s.boostRegenTimer = def.boostRegenDelay;
    s.dashTicks = def.dashTicks;
    s.dashCooldown = def.dashTicks + def.dashCooldown;
    s.dashDirX = nx;
    s.dashDirY = ny;
    result.dashStarted = true;
  }

  // ---- Dash sustain -----------------------------------------------------
  if (s.dashTicks > 0) {
    s.dashTicks--;
    const speed = def.dashSpeed * intent.speedScale;
    s.vx = s.dashDirX * speed;
    s.vy = s.dashDirY * speed;
    s.x += s.vx;
    s.y += s.vy;
    return result;
  }

  // ---- Boost / brake / accelerate ---------------------------------------
  const wantsBoost = intent.boost && hasDir && s.boost > 0;
  const wantsBrake = intent.boost && !hasDir;

  // Speed at the start of the tick. The cap for this tick is allowed to sit
  // above the nominal cap by whatever overspeed we already carried, decayed a
  // little — so recoil and launch impulses bleed off as momentum instead of
  // being snapped away, while ordinary thrust still tops out at `cap`.
  const prevSpeed = Math.hypot(s.vx, s.vy);

  let accel = def.accel;
  let cap = def.maxSpeed * intent.speedScale;

  if (wantsBoost) {
    accel = def.boostAccel;
    cap = def.boostMaxSpeed * intent.speedScale;
    s.boost = Math.max(0, s.boost - def.boostDrain);
    s.boostRegenTimer = def.boostRegenDelay;
    result.boosting = true;
  }

  if (hasDir) {
    s.vx += nx * accel;
    s.vy += ny * accel;
  }

  if (wantsBrake) {
    s.vx *= def.brakeDrag;
    s.vy *= def.brakeDrag;
    result.braking = true;
  } else if (!hasDir) {
    s.vx *= def.coastDrag;
    s.vy *= def.coastDrag;
  }

  // Firing anchor / external scaling.
  if (intent.moveScale !== 1) {
    s.vx *= intent.moveScale;
    s.vy *= intent.moveScale;
  }

  const allowed = Math.max(cap, prevSpeed * OVERSPEED_BLEED);
  if (Math.hypot(s.vx, s.vy) > allowed) {
    [s.vx, s.vy] = limitLength(s.vx, s.vy, allowed);
  }

  // Kill numerical dust so the sim settles to exact rest.
  if (Math.abs(s.vx) < 0.004) s.vx = 0;
  if (Math.abs(s.vy) < 0.004) s.vy = 0;

  s.x += s.vx;
  s.y += s.vy;

  // ---- Boost regeneration ----------------------------------------------
  if (s.boostRegenTimer > 0) {
    s.boostRegenTimer--;
  } else if (s.boost < def.maxBoost) {
    s.boost = Math.min(def.maxBoost, s.boost + def.boostRegen);
  }

  return result;
}

/** Keeps a mech inside the arena, bleeding the velocity component that hit. */
export function clampToArena(
  s: FlightState,
  radius: number,
  w: number,
  h: number,
  bounce = 0.25,
): void {
  if (s.x < radius) {
    s.x = radius;
    if (s.vx < 0) s.vx = -s.vx * bounce;
  } else if (s.x > w - radius) {
    s.x = w - radius;
    if (s.vx > 0) s.vx = -s.vx * bounce;
  }
  if (s.y < radius) {
    s.y = radius;
    if (s.vy < 0) s.vy = -s.vy * bounce;
  } else if (s.y > h - radius) {
    s.y = h - radius;
    if (s.vy > 0) s.vy = -s.vy * bounce;
  }
}
