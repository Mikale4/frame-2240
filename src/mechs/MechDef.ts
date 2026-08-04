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
   * Meter spent per tick by a **Shield** burst, where the other two modes spend
   * one. Omitted means the standing 2 — half the duration, as the reference did
   * for its barrier-type concentration.
   *
   * A chassis dial rather than a global constant, so a machine can be *good at
   * guarding* in the one place that costs the most. A single shared number
   * cannot express that: lowering it lifts every Shield pilot at once, which
   * measured as a 13-point win-rate gift to TERRAMOTH while fixing OBELISK.
   * Made per-chassis by request for exactly that reason. See D119.
   */
  satShieldDrain?: number;
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
  /**
   * Fraction of damage taken through a held guard. 0.20 = 80% reduction.
   *
   * A guard is a real answer to gunfire, not a slight discount — the previous
   * 0.32 left you eating a third of everything and made holding it feel like a
   * delaying tactic rather than a defence.
   */
  guardScale: number;
  /**
   * Fraction of *melee* damage taken through a held guard.
   *
   * Deliberately worse for the defender than `guardScale`. Melee used to ignore
   * a guard outright, which made a sword the unconditional answer to turtling
   * and left the defender with nothing to do about it. Halving it instead keeps
   * melee the better tool against a guard without making the guard pointless.
   */
  meleeGuardScale: number;
  /**
   * Fraction of *piercing* damage taken through a held guard — the lances.
   *
   * Exactly the problem `meleeGuardScale` was introduced to solve, one weapon
   * class later. Since every lance on the roster pierces, a held guard used to
   * be worth literally nothing against any of them: the branch that applies
   * `guardScale` excludes `Pierce`, so the shot arrived at full strength and the
   * gauge you were spending to hold the guard bought you not a single point.
   *
   * A lance still beats a guard — it is the roster's designated answer to
   * turtling and half damage is a great deal more than gunfire's fifth — but
   * holding guard is now a decision rather than a no-op.
   */
  pierceGuardScale: number;
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
/**
 * How a melee weapon is delivered.
 *
 * The arc alone cannot describe every weapon: it is purely rotational, so a
 * pile driver and a beam saber would move identically. Motion selects the
 * *shape* of the strike, and `reach` gives it a forward throw in logical pixels.
 *
 * - `swing`  — pure rotation. Blades: saber, cleaver, glaive, daggers, claw.
 * - `thrust` — draw back, then stab straight out along the aim. Bayonets.
 * - `bash`   — a short shoulder-first shove that returns. Ram shields.
 * - `piston` — no wind-up rotation, then a violent short extension. Pile drivers.
 */
/**
 * How a melee weapon is *used*, as distinct from what it looks like.
 *
 * This mattered more than anyone expected. Until D130 `swingArcAngle` did not
 * branch on motion at all — every machine ran the same wind-back-then-
 * decelerating-slash curve and differed only in its windup/sweep *numbers*. A
 * pile driver, a shield and a pair of daggers all moved like a sword, which is
 * exactly what a player reported. The weapons were never the problem; the
 * single shared curve was.
 */
export type MeleeMotion =
  | 'swing'
  | 'thrust'
  | 'bash'
  | 'piston'
  /** A raking claw swipe: short wind, violent lateral tear, alternating hands. */
  | 'swipe'
  /** Assassin's knifework — repeated stabs, each at a **different** height. */
  | 'stab'
  /** A scythe's reap: accelerating arc that **pulls in** rather than through. */
  | 'reap'
  /** Wide, constant-momentum arc at reach. A polearm carries its own weight. */
  | 'sweep';

/**
 * Which family of melee sound a chassis uses.
 *
 * `blade` covers everything with an energy edge — saber, bayonet, daggers,
 * cleaver, glaive — and escalates through the swing cues. `mechanical` covers
 * claws, rams and pile drivers, which should never play an energy swing.
 *
 * This lives in data rather than being switched on mech id in the audio layer,
 * which is what it used to be: that only worked while exactly one mech was not
 * carrying a sword.
 */
export type MeleeCue = 'blade' | 'mechanical';

export interface SwingArc {
  /** Degrees the blade is raised above the aim before the slash begins. */
  windup: number;
  /** Degrees swept downward from the raised position through the follow-through. */
  sweep: number;
  /** Fraction of the swing spent winding up; the rest is the slash. */
  windupFrac: number;
  /** Mirror the arc on alternate hits, as the reference's variants did. */
  alternate: boolean;
  /** Delivery style. Omitted means `swing`, which is the pre-existing behaviour. */
  motion?: MeleeMotion;
  /**
   * Peak forward extension in logical pixels, along the aim. Ignored by `swing`.
   * This is presentation only — reach and damage come from the attack data, so a
   * bigger lunge here never changes what the move actually hits.
   */
  reach?: number;
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
 * What a drone physically does with its turn.
 *
 * Every one of these is a different *verb*, not a different number: the point is
 * that fighting NOCTURNE's escort and fighting OBELISK's should be different
 * problems, not the same problem in another colour.
 */
export type SupporterRole =
  /** Fires its owner's sub-weapon. The original behaviour, and the baseline. */
  | 'shooter'
  /**
   * Paints the target. Its owner's shots gain tracking against a painted mech.
   *
   * A force multiplier rather than a second gun — it makes the *pilot* better,
   * which is the most HALCYON thing an escort could do.
   */
  | 'designator'
  /** Runs a beam back to its owner that regenerates their barrier. */
  | 'tether'
  /**
   * Shoots down incoming projectiles instead of shooting the enemy.
   *
   * A marksman's problem is being made to move. This is what lets one not.
   */
  | 'interceptor'
  /** Seeds the stage with stationary proximity mines. */
  | 'miner'
  /**
   * Strings a live wire between itself and its owner.
   *
   * Pairs with the Pincer play: cross to the far side and the tether sweeps
   * through anything between the two machines.
   */
  | 'arcTether'
  /** Raises a dome that erases enemy shots around itself and its owner. */
  | 'dome'
  /** Leaves burning ground that keeps applying its element after it has moved on. */
  | 'hazard'
  /**
   * Projects a false silhouette that draws lock-on and fire.
   *
   * The only ability in the game that attacks the opponent's *information*
   * rather than their hull.
   */
  | 'decoy';

/**
 * What a drone does for its pilot simply by being in the air.
 *
 * Every entry is a multiplier applied only while the drone is deployed and
 * alive, which is what gives the deploy/recall toggle a decision behind it:
 * flying the drone buys the passive and the auto-fire, and risks losing both
 * permanently. Omitted fields mean 1 — no effect — so a passive states only the
 * one thing it changes, and adding a new lever cannot silently alter the other
 * seven drones.
 *
 * Deliberately one lever each. A passive that touched three stats would be
 * impossible to feel and impossible to balance against the others.
 */
export interface DronePassiveDef {
  /** Short name, shown on the select screen and when the drone reaches station. */
  name: string;
  /** One-line description for the select screen. */
  text: string;

  /** Multiplier on the owner's energy regeneration. */
  energyRegenMul?: number;
  /** Multiplier on the owner's barrier gauge regeneration. */
  barrierRegenMul?: number;
  /** Multiplier on the owner's guard drain. Lower is better. */
  guardDrainMul?: number;
  /** Multiplier on the owner's boost regeneration. */
  boostRegenMul?: number;
  /** Multiplier on damage the owner deals. */
  damageMul?: number;
  /** Multiplier on damage the owner takes. Lower is better. */
  defenceMul?: number;
  /** Multiplier on the owner's passive saturation gain. */
  satGainMul?: number;
  /**
   * Multiplier on the *opponent's* energy regeneration. The one outward-facing
   * lever, and NULLTIDE's whole identity — an electronic-warfare drone that
   * starves the other pilot rather than feeding its own.
   */
  enemyEnergyRegenMul?: number;
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
  /** Display name, announced when the drone reaches station. */
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
  /** Drawn size / effect scale. */
  radius: number;

  // ---- deployment ---------------------------------------------------------

  /**
   * Hit points, and how hard they are to take off it.
   *
   * A fraction of a chassis's, on purpose: a drone is meant to be a resource the
   * pilot has to protect, not a second health bar that doubles the length of a
   * match. Around 12 % of the owner's `maxLife` puts it four to six clean hits
   * from destruction, which is enough that a stray shot does not delete it and
   * few enough that deliberately hunting it pays off.
   */
  maxLife: number;
  /** Multiplier on damage the drone takes. Lower is tougher. */
  defenceMul: number;
  /** Collision radius. Smaller than `radius`, which is the drawn size. */
  hurtRadius: number;
  /** Ticks to fly out to station on a deploy order. */
  deployTicks: number;
  /** Ticks to fold back into the chassis on a recall order. */
  recallTicks: number;
  /** Hit points repaired per tick while stowed — the reward for recalling. */
  repair: number;
  /**
   * Furthest the target may be for the drone to open fire on its own. Keeps a
   * drone from emptying its charges across an arena it cannot reach.
   */
  fireRange: number;
  /** What this drone does for its pilot while deployed and alive. */
  passive: DronePassiveDef;
  /**
   * What the drone physically *does*, as opposed to what it grants.
   *
   * The 2005 reference's supporters are not eight copies of a gun: some raise a
   * shield, some seed the stage with mines, some fire a beam far bigger than the
   * machine carrying it. `shooter` is the original behaviour and remains the
   * default; every other role is its own mechanic, tied to the pilot it belongs
   * to. See `SupporterRole`.
   */
  role: SupporterRole;
  /** Role tuning. Meaning depends on `role`; see each role's implementation. */
  roleValue?: number;
  /**
   * Marks the target for the owner's own weapons, as the `designator` role does.
   *
   * Split out from `role` because painting is the one escort ability that
   * genuinely *composes* — it costs the drone nothing it is otherwise doing, so
   * an escort can paint while also intercepting, tethering or laying mines. Every
   * other role is a full-time job and stays mutually exclusive.
   *
   * Defaults to whether the role is `designator`, so the eight existing escorts
   * behave exactly as before and this field is inert unless a def opts in.
   */
  paints?: boolean;
}

/**
 * Does this escort mark targets? See `SupporterDef.paints`.
 *
 * One predicate, used by both halves of the ability — the damage multiplier and
 * the guidance on the painter's rounds — so the two can never disagree about who
 * is a painter.
 */
export function dronePaints(d: SupporterDef): boolean {
  return d.paints ?? d.role === 'designator';
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

/**
 * How big this machine is on screen, relative to HALCYON at 1.0.
 *
 * The roster is not one chassis in eight paint jobs — a siege walker should
 * loom over a skirmisher. The gameplay hitboxes already encoded this (TERRAMOTH
 * `hurtRadius` 36 against CIRRUS 23); only the rendering did not, because every
 * part was drawn at one uniform `PART_SCALE`.
 *
 * Keep this proportional to `hurtRadius`, or a mech will be hit from further
 * away than it visibly occupies. `roster.test.ts` asserts the two stay in step.
 */
export interface MechRigDef {
  /** Visual scale relative to HALCYON. See the note above. */
  scale: number;
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

/**
 * A stance the chassis can switch into, replacing its heavy shot with a mode.
 *
 * VESPER's, and built as a `MechDef` field rather than a VESPER special case so
 * the next machine that wants a stance declares one instead of editing
 * `Combatant`. A mech with no `sniper` block behaves exactly as the roster
 * always has: `Btn.Heavy` fires the heavy.
 *
 * The trade is the whole design. A sniper gives up **mobility, every other
 * weapon, and the ability to answer anything that reaches him** in exchange for
 * rounds that steer, travel fast and reach far. It is a commitment with a clock
 * on it, not a free upgrade, which is why `duration` and `cooldown` are both
 * required rather than optional.
 */
export interface SniperModeDef {
  /** Ticks the stance runs before it drops on its own. */
  duration: number;
  /** Ticks before it may be engaged again, counted from when it ends. */
  cooldown: number;
  /**
   * Multiplier on movement, thrust and dash while the stance is up.
   *
   * Deliberately severe. Standing still is what is being paid; if the sniper can
   * reposition he is simply a better version of himself.
   */
  speedScale: number;
  /**
   * Multiplier on the **dash** while planted. Omitted means `speedScale`, which
   * is what a stance did before this existed.
   *
   * Split out so the stance can punish *travelling* without punishing
   * *escaping*. A sniper who cannot reposition is the design; a sniper who
   * cannot get out of the way when somebody arrives is just a slow target, and
   * at `speedScale` the dash was scaled to 32 % — a panic button that moved him
   * about a third of a body length.
   *
   * At 1 the stance costs cruise speed and thrust and leaves the dash whole, so
   * the answer to being found is one committed move rather than a slow walk.
   */
  dashSpeedScale?: number;
  /**
   * What the main weapon fires instead of its own while the stance is up.
   *
   * Auto-aim lives on the attack, as `homing` / `homingTicks`, rather than being
   * restated here — one place a weapon declares how it steers, so the two can
   * never disagree. The first cut duplicated it onto this interface and the
   * duplicate was simply never read, which a test caught.
   */
  shot: AttackDef;
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
  /**
   * OVERDRIVE — everything at once, and then nothing.
   *
   * At or below `threshold` of maximum hull the chassis dumps its reactor: all
   * three saturation modes run **simultaneously** for `ticks`, and the pilot
   * cannot open a saturation burst of their own while it lasts. When the window
   * closes the thrusters and both guns are **destroyed** — permanently, for the
   * rest of the match — and the only thing left is the sword, which hits
   * `meleeMul` harder.
   *
   * It is not a comeback so much as a decision the machine makes on the pilot's
   * behalf: ten seconds of being everything, bought with everything.
   *
   * Once per match. Absent on seven of eight machines.
   */
  overdrive?: { threshold: number; ticks: number; meleeMul: number };

  /**
   * LAST STAND — refuses to die, once per match, for a window.
   *
   * A hit that would take the chassis to zero instead leaves it on its feet with
   * a sliver of hull and a clock. Nothing can kill it until the clock runs out;
   * everything can hurt it, and it is still on a sliver when the clock stops.
   *
   * Once per match by design. An unlimited version is not a comeback mechanic,
   * it is immortality — the drama is entirely in it being the *last* one.
   *
   * Absent on seven of eight machines, and absence is the normal case.
   */
  lastStand?: { ticks: number };

  /**
   * Optional stance replacing the heavy shot. See `SniperModeDef`.
   *
   * Absent on seven of eight machines, and absence is the normal case: `Btn.Heavy`
   * fires `heavy` unless this exists.
   */
  sniper?: SniperModeDef;

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
  /** Melee sound family. Omitted means `blade`. */
  meleeCue?: MeleeCue;

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
