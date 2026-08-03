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
  /** False when FlyingMode is off: gravity applies and movement is walking. */
  flying?: boolean;
  /** Arena floor, used only when `flying` is false. */
  groundY?: number;
  /**
   * True while a melee lunge is driving the velocity. The walk cap must not
   * apply then, or a grounded sword swing barely moves and the attack's
   * authored reach silently stops working on the deck.
   */
  lunging?: boolean;
  /** Boost button held. With a direction this boosts; with none it air-brakes. */
  boost: boolean;
  /** A dash was requested this tick (tap + direction, or a double-tap). */
  dash: boolean;
  /**
   * Multiplier on the *base* speed caps — free flight and walking. Speed
   * saturation lifts this a little; a cryo affliction drags it down.
   */
  speedScale: number;
  /**
   * Multiplier on the *boost and dash* caps specifically. Split from
   * `speedScale` because Speed saturation is meant to make the thrusters
   * dramatically faster while lifting ordinary movement only slightly — one
   * shared number could express one or the other, never both. Defaults to
   * `speedScale` when omitted, which is the pre-split behaviour.
   */
  boostSpeedScale?: number;
  /**
   * Multiplier on dash speed alone, and therefore on the distance one dash
   * covers. Defaults to `boostSpeedScale`, which is the pre-split behaviour.
   */
  dashSpeedScale?: number;
  /** Multiplier applied to velocity each tick, e.g. firing anchor. */
  moveScale: number;
  /**
   * Thrusters run free: boost drains no gauge and a dash costs nothing. Speed
   * saturation's "does not overheat" clause.
   */
  boostFree?: boolean;
  /**
   * Multiplier on boost refill, e.g. a thermal-siphon drone. Applied to the
   * airborne and grounded refill alike, so parking on the deck to recover still
   * benefits from whatever is boosting the rate.
   */
  boostRegenScale?: number;
}

export interface FlightResult {
  /** True when a dash actually started this tick (for events/effects). */
  dashStarted: boolean;
  /** True while boosting and consuming gauge. */
  boosting: boolean;
  /** True while air-braking. */
  braking: boolean;
  /** True while resting on the floor with FlyingMode off. */
  grounded: boolean;
  /** True on the tick the mech touched down. */
  landed: boolean;
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
  const result: FlightResult = {
    dashStarted: false,
    boosting: false,
    braking: false,
    grounded: false,
    landed: false,
  };

  if (s.dashCooldown > 0) s.dashCooldown--;
  const regen = def.boostRegen * (intent.boostRegenScale ?? 1);
  // Thrust caps default to the base scale, so a caller that does not care about
  // the split behaves exactly as it did before the split existed.
  const thrustScale = intent.boostSpeedScale ?? intent.speedScale;
  const dashCost = intent.boostFree ? 0 : def.dashCost;
  const boostDrain = intent.boostFree ? 0 : def.boostDrain;

  // ---- grounded mode (FlyingMode off) -----------------------------------
  // The reference is not purely aerial: with the flight flag clear a machine
  // walks and is pulled down. Dash and boost stay available so ground movement
  // is not a dead end.
  if (intent.flying === false) {
    const groundY = intent.groundY ?? Infinity;
    const wasAirborne = s.y < groundY - 0.5;

    if (!intent.lunging) {
      s.vx += Math.sign(intent.dx) * def.accel;
      const cap = def.walkSpeed * intent.speedScale;
      if (Math.abs(s.vx) > cap) s.vx = Math.sign(s.vx) * cap;
      if (intent.dx === 0) s.vx *= def.groundFriction;
    }

    s.vy += def.gravity;
    s.x += s.vx;
    s.y += s.vy;

    if (s.y >= groundY) {
      s.y = groundY;
      if (s.vy > 0) s.vy = 0;
      result.grounded = true;
      result.landed = wasAirborne;
      // Resting on the deck refuels the boost tank faster.
      s.boostRegenTimer = 0;
      s.boost = Math.min(def.maxBoost, s.boost + regen * def.groundedBoostRegen);
    } else if (s.boostRegenTimer > 0) {
      s.boostRegenTimer--;
    } else if (s.boost < def.maxBoost) {
      s.boost = Math.min(def.maxBoost, s.boost + regen);
    }

    if (Math.abs(s.vx) < 0.004) s.vx = 0;
    return result;
  }

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
    s.boost >= dashCost
  ) {
    s.boost -= dashCost;
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
    // Dash gets its own scale so a burst can extend the *dash* without also
    // raising the sustained boost cap; falls back to the thrust scale.
    const speed = def.dashSpeed * (intent.dashSpeedScale ?? thrustScale);
    s.vx = s.dashDirX * speed;
    s.vy = s.dashDirY * speed;
    s.x += s.vx;
    s.y += s.vy;
    return result;
  }

  // ---- Boost / brake / accelerate ---------------------------------------
  const wantsBoost = intent.boost && hasDir && (s.boost > 0 || intent.boostFree === true);
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
    cap = def.boostMaxSpeed * thrustScale;
    s.boost = Math.max(0, s.boost - boostDrain);
    // Free thrust must not park the refill timer at its delay every tick, or the
    // gauge would sit empty for the whole burst and then refuse to refill.
    if (!intent.boostFree) s.boostRegenTimer = def.boostRegenDelay;
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
    s.boost = Math.min(def.maxBoost, s.boost + regen);
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
  /**
   * The deck, as a body-centre height. Defaults to no floor at all.
   *
   * **The floor used to exist only in grounded mode.** The whole ground clamp
   * lives inside the `intent.flying === false` branch above, so a flying machine
   * — which is every machine, essentially all of the time — was bounded only by
   * the arena's bottom edge. Measured, that let feet reach **64–86px below the
   * drawn deck** depending on chassis, and it was invisible for as long as the
   * floor was a placeholder bar. It is not invisible against real art.
   *
   * Passed here rather than fixed inside the grounded branch because the dash
   * path returns early, so a dash could punch through a floor enforced anywhere
   * later in the step. This is the one place every motion path funnels into.
   */
  floorY = Infinity,
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
    return;
  }
  // The deck, or the arena's bottom edge if this caller declares no deck.
  const bottom = Math.min(h - radius, floorY);
  if (s.y > bottom) {
    s.y = bottom;
    // Killed rather than bounced. A wall throws you off it, which reads as
    // impact; a floor you are hovering against should simply stop you, or a
    // machine held down against the deck jitters on it every tick.
    if (s.vy > 0) s.vy = 0;
  }
}
