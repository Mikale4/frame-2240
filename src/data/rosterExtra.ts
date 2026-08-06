import { attack } from '../combat/AttackData';
import { BarrierResponse, ProjKind } from '../combat/types';
import type { AttackDef } from '../combat/AttackData';
import type {
  BarrierDef,
  FlightDef,
  GaugeDef,
  MechDef,
  MechRigDef,
  SupporterDef,
  SupporterRole,
} from '../mechs/MechDef';
import { DEG } from '../core/MathUtil';
import { Element } from '../combat/Status';

/**
 * Roster expansion: six further chassis, bringing the line-up to eight.
 *
 * Every mech here is a distinct machine rather than a stat recolour. Each one
 * differs in frame proportions, flight envelope, all six weapons, its melee
 * chain and lock-on flurry, its supporter drone's behaviour, its status element
 * and its palette. Where two mechs share a number it is because the shared value
 * is genuinely neutral (barrier action frames, for instance), not for brevity.
 *
 * Art does not exist for these yet. `BootScene` substitutes a placeholder for a
 * missing sprite, so the roster is playable now and the Blender pass fills it in
 * against the pivots declared here — which is the point of defining data first:
 * a design change costs an edit, not a day of modelling.
 */

// ---------------------------------------------------------------- factories

/**
 * Builds the standard thirteen-part rig from a handful of proportions.
 *
 * Every chassis shares the same part *topology* — the renderer, the walk cycle
 * and the Blender exporter all assume it — but the offsets are what make a frame
 * read as squat, lanky or hunched. Those are the numbers worth stating per mech;
 * the parent/child wiring is not.
 *
 * These pivots must mirror the matching entry in tools/blender/build_mechs.py.
 */
function makeRig(o: {
  scale: number;
  hurtRadius: number;
  chassisHeight: number;
  footOffset: number;
  head: [number, number];
  backpack: [number, number];
  lowerBody: [number, number];
  leftArm: [number, number];
  subWeapon: [number, number];
  rightArm: [number, number];
  mainWeapon: [number, number];
  meleeWeapon: [number, number];
  /**
   * Where the projected blade leaves its emitter, in logical px from the sprite
   * centre — and, by being present at all, that this weapon projects one.
   *
   * The blade is its own part so it can skip the Freestyle contour and be
   * animated alone. CLAW, PILE and RAMSHIELD project nothing and must omit this;
   * the texture would be missing.
   *
   * It carries the root rather than a bare `true` because the blade *breathes*,
   * and a sprite scales about its centre: without the root the energy pulls away
   * from the staff it is pouring out of. Generated into `manifest.json` by
   * `tools/energy_blade.py`; `roster.test.ts` asserts they agree.
   */
  energy?: readonly [number, number];
  /**
   * That this weapon carries **discharge crawling over its hardware**, rather
   * than projected energy leaving an emitter. NULLTIDE's shock baton is the
   * only one, and the two are deliberately different parts rather than one
   * flag: a projected blade breathes from a root and is a silhouette, while an
   * arc layer re-strikes in place and has none.
   *
   * A bare `true` because there is no root to carry. The blade needs one only
   * because it scales, and a sprite scales about its centre; this layer never
   * scales, so a centred origin is exactly right. Generated into
   * `manifest.json` by `tools/electric_baton.py`.
   */
  arc?: boolean;
  leftThruster: [number, number];
  rightThruster: [number, number];
}): MechRigDef {
  type Follow = MechRigDef['parts'][number]['follow'];
  const p = (name: string, parent: string | null, xy: [number, number], follow: Follow) => ({
    name,
    parent,
    x: xy[0],
    y: xy[1],
    rotation: 0,
    follow,
  });
  return {
    scale: o.scale,
    hurtRadius: o.hurtRadius,
    chassisHeight: o.chassisHeight,
    footOffset: o.footOffset,
    parts: [
      p('core', null, [0, 0], 'chassis'),
      p('head', 'core', o.head, 'turret'),
      p('backpack', 'core', o.backpack, 'chassis'),
      p('lowerBody', 'core', o.lowerBody, 'chassis'),
      p('legFar', 'lowerBody', [0, 1], 'legFar'),
      p('legNear', 'lowerBody', [0, 1], 'legNear'),
      p('leftArm', 'core', o.leftArm, 'turret'),
      p('subWeapon', 'leftArm', o.subWeapon, 'turret'),
      p('rightArm', 'core', o.rightArm, 'turret'),
      p('mainWeapon', 'rightArm', o.mainWeapon, 'turret'),
      p('meleeWeapon', 'rightArm', o.meleeWeapon, 'turret'),
      // Same pivot as the weapon it belongs to: both were joined at the same
      // point in Blender, so they composite exactly when drawn at one offset.
      ...(o.energy
        ? [{ ...p('meleeEnergy', 'rightArm', o.meleeWeapon, 'turret'), anchor: o.energy }]
        : []),
      // Same pivot again, and no anchor — see `arc` above.
      ...(o.arc ? [p('meleeArc', 'rightArm', o.meleeWeapon, 'turret')] : []),
      p('leftThruster', 'core', o.leftThruster, 'thruster'),
      p('rightThruster', 'core', o.rightThruster, 'thruster'),
    ],
    drawOrder: [
      'backpack',
      'leftThruster',
      'leftArm',
      'subWeapon',
      'legFar',
      'lowerBody',
      'legNear',
      'core',
      'head',
      'rightThruster',
      'rightArm',
      'mainWeapon',
      'meleeWeapon',
      // Above the hardware: a projected blade is emitted from the weapon, so it
      // must not be occluded by it. Discharge is on the outside of the rod for
      // the same reason.
      ...(o.energy ? ['meleeEnergy'] : []),
      ...(o.arc ? ['meleeArc'] : []),
    ],
  };
}

/**
 * A three-stage melee chain: two quick openers and a committed finisher.
 *
 * The escalation shape is common to every chassis — light, light, heavy — so it
 * is expressed once. What varies per mech is reach, damage and how far the
 * finisher throws, which is what the arguments carry.
 */
function chain3(
  prefix: string,
  labels: [string, string, string],
  o: {
    dmg: [number, number, number];
    startup: [number, number, number];
    recovery: [number, number, number];
    lunge: [number, number, number];
    radius: number;
    finisherKnock: number;
    selfKnockback: number;
    element?: Element;
  },
): AttackDef[] {
  return [0, 1, 2].map((i) =>
    attack({
      id: `${prefix}${i + 1}`,
      label: labels[i],
      startup: o.startup[i],
      active: i === 2 ? 4 : 3,
      recovery: o.recovery[i],
      energyCost: 0,
      damage: o.dmg[i],
      guardDamage: Math.round(o.dmg[i] * 0.45),
      hitstop: i === 2 ? 14 : 8 + i,
      hitstun: i === 2 ? 30 : 16 + i * 2,
      knockback: i === 2 ? o.finisherKnock : 2.8 + i * 0.4,
      satGain: i === 2 ? 26 : 12 + i * 2,
      kind: ProjKind.Melee,
      // Melee ignores barriers throughout the roster: the 2005 reference marked
      // its sword states "barrier-impossible", and it is what keeps a turtling
      // opponent solvable.
      barrier: BarrierResponse.Pierce,
      ...(o.element ? { element: o.element } : {}),
      projSpeed: 0,
      projLife: i === 2 ? 4 : 3,
      projRadius: i === 2 ? o.radius + 6 : o.radius,
      muzzleForward: o.radius,
      lunge: o.lunge[i],
      ...(i < 2 ? { chainFrom: 8 - i * 3, chainTo: 24 - i * 4 } : {}),
      meleeStage: i,
      ...(i === 2 ? { selfKnockback: o.selfKnockback } : {}),
    }),
  );
}

// ---------------------------------------------------------------- shared bases

/** Neutral gauge block. Every mech below overrides what defines it. */
const GAUGES: GaugeDef = {
  maxLife: 1750,
  maxEnergy: 1000,
  energyRegen: 3.1,
  maxBoost: 100,
  maxBarrier: 100,
  barrierRegen: 0.52,
  barrierRegenDelay: 45,
  guardDrain: 0.62,
  maxSaturation: 500,
  satPassive: 0.5,
  satOnAbsorb: 25,
  satDuration: 420,
  satOnDamage: 0.3,
  hitInvuln: 3,
  meleeLockout: 34,
};

const BARRIER: BarrierDef = {
  actionTicks: 6,
  invulnTicks: 36,
  shieldBonusTicks: 24,
  cost: 30,
  cancelPenalty: 22,
  breakStun: 50,
  guardScale: 0.20,
  meleeGuardScale: 0.50,
  pierceGuardScale: 0.50,
  radius: 46,
};

const FLIGHT: FlightDef = {
  accel: 1.7,
  maxSpeed: 5.3,
  coastDrag: 0.935,
  brakeDrag: 0.78,
  boostAccel: 2.4,
  boostMaxSpeed: 9,
  maxBoost: 100,
  boostDrain: 0.5,
  boostRegen: 0.9,
  boostRegenDelay: 16,
  dashSpeed: 14,
  dashTicks: 7,
  dashCost: 12,
  dashCooldown: 6,
  bankRate: 6 * DEG,
  bankMax: 24 * DEG,
  turretRate: 12 * DEG,
  gravity: 0.56,
  walkSpeed: 2.4,
  groundFriction: 0.8,
  takeoffImpulse: 5.7,
  groundedBoostRegen: 2.6,
};

/**
 * Shared drone chassis numbers.
 *
 * `name` and `passive` are deliberately NOT part of the base: they are the two
 * fields that must never be inherited by accident, so the type omits them and
 * the compiler makes every mech state its own. A drone that shipped with a
 * placeholder passive would be a silent balance bug, not a build error.
 */
const DRONE: Omit<SupporterDef, 'name' | 'passive' | 'role'> & { role: SupporterRole } = {
  // Every mech overrides this; the base carries the original behaviour so a new
  // chassis that forgets to choose still flies something sensible.
  role: 'shooter',
  followBack: 74,
  followDown: 58,
  followAccel: 0.055,
  followDamp: 0.86,
  maxSpeed: 15,
  turretRate: 7 * DEG,
  windup: 10,
  recover: 8,
  cooldown: 22,
  muzzleForward: 18,
  radius: 15,
  maxLife: 385,
  defenceMul: 1,
  hurtRadius: 13,
  deployTicks: 28,
  recallTicks: 24,
  repair: 0.28,
  fireRange: 720,
};

// ================================================================ VESPER
/**
 * A sniper that cannot afford to be hit. Longest reach in the roster, the
 * thinnest armour, and a main gun that costs real energy per shot — it is the
 * one chassis that runs dry from ordinary poking.
 */
export const VESPER: MechDef = {
  id: 'vesper',
  name: 'VESPER',
  codeName: 'AV-12',
  pilot: 'KESTREL DOYNE',
  faction: 'CONCORD SKYWARD',
  blurb: 'Long-range marksman. Devastating at distance, fragile up close.',
  statPower: 4,
  statSpeed: 3,
  statRange: 5,
  /**
   * **Slow cruise, violent dash.** The movement profile is the character.
   *
   * A marksman should not travel well. Everything that moves him *continuously*
   * — cruise, acceleration, boost — is the slowest on the roster bar the two
   * heavies, so drifting across the arena is genuinely a bad way for Kestrel
   * Doyne to spend time. What he gets instead is the best dash in the game:
   * `dashSpeed` 18 over `dashTicks` 9 covers roughly 162px against the roster's
   * standard 98, so the one move he is good at is *leaving*.
   *
   * That is the sniper mentality expressed in the flight model rather than in a
   * note: hold still, watch, and when the answer arrives spend the dash and be
   * somewhere else. See D120.
   */
  flight: {
    ...FLIGHT,
    accel: 1.4,
    maxSpeed: 4.5,
    boostMaxSpeed: 8.0,
    dashSpeed: 18,
    dashTicks: 9,
    turretRate: 15 * DEG,
    bankMax: 20 * DEG,
  },
  // Glass cannon: fewer hit points and no grounded bracing bonus.
  gauges: { ...GAUGES, maxLife: 1490, maxEnergy: 1150, energyRegen: 3.4 },
  barrier: { ...BARRIER, cost: 34, invulnTicks: 32 },
  defence: { mul: 1.15, groundedMul: 1.0 },
  rig: makeRig({
    scale: 0.93,
    hurtRadius: 26,
    chassisHeight: 108,
    footOffset: 88,
    head: [23, -9],
    backpack: [-28, -20],
    lowerBody: [-8, 28],
    leftArm: [-2, -3],
    subWeapon: [-3, -24],
    rightArm: [15, 5],
    mainWeapon: [46, 8],
    meleeWeapon: [26, 6],
    energy: [16.8, 1.9],
    leftThruster: [-38, 0],
    rightThruster: [-34, 12],
  }),
  main: attack({
    id: 'main',
    label: 'RAILNEEDLE',
    startup: 6,
    active: 1,
    recovery: 9,
    energyCost: 58,
    damage: 62,
    guardDamage: 20,
    hitstop: 6,
    hitstun: 10,
    knockback: 2.6,
    satGain: 11,
    recoil: 1.6,
    kind: ProjKind.Bullet,
    projSpeed: 22,
    projLife: 110,
    projRadius: 5,
    pierceCount: 1,
    muzzleForward: 44,
  }),
  /**
   * **Unreachable, and kept deliberately.**
   *
   * `Btn.Heavy` opens the sniper stance on this chassis, so LONGSHOT can never
   * be fired — see `MechDef.sniper`. It stays because `MechDef.heavy` is
   * required and because `reachOf` reads it when the AI works out how far this
   * machine can threaten, which is still a fair description of Kestrel's
   * envelope. If a future change makes reach depend on what is *firable*, this
   * is the entry to revisit.
   */
  heavy: attack({
    id: 'heavy',
    label: 'LONGSHOT',
    startup: 14,
    active: 1,
    recovery: 20,
    energyCost: 150,
    damage: 168,
    guardDamage: 52,
    hitstop: 12,
    hitstun: 22,
    knockback: 7,
    satGain: 24,
    recoil: 3.4,
    kind: ProjKind.Heavy,
    projSpeed: 26,
    projLife: 130,
    projRadius: 9,
    pierceCount: 2,
    muzzleForward: 48,
  }),
  lance: attack({
    id: 'lance',
    label: 'PIERCE BEAM',
    startup: 18,
    active: 2,
    recovery: 26,
    energyCost: 260,
    damage: 210,
    guardDamage: 84,
    hitstop: 16,
    hitstun: 30,
    knockback: 9,
    satGain: 34,
    recoil: 2.4,
    kind: ProjKind.Beam,
    barrier: BarrierResponse.Pierce,
    projSpeed: 34,
    projLife: 90,
    projRadius: 11,
    pierceCount: 4,
    muzzleForward: 50,
  }),
  spread: attack({
    id: 'spread',
    label: 'FLECHETTE',
    startup: 7,
    active: 1,
    recovery: 16,
    energyCost: 96,
    damage: 30,
    guardDamage: 10,
    hitstop: 4,
    hitstun: 7,
    knockback: 1.5,
    satGain: 6,
    recoil: 1.8,
    kind: ProjKind.Bullet,
    projSpeed: 17,
    projLife: 46,
    projRadius: 4,
    projCount: 3,
    spreadRad: 7 * DEG,
    muzzleForward: 42,
  }),
  sub: attack({
    id: 'sub',
    label: 'TRACER POD',
    startup: 5,
    active: 1,
    recovery: 12,
    energyCost: 0,
    subCost: 1,
    damage: 66,
    guardDamage: 24,
    hitstop: 7,
    hitstun: 14,
    knockback: 3,
    satGain: 12,
    kind: ProjKind.Missile,
    homing: 0.05,
    projSpeed: 9,
    projLife: 120,
    projRadius: 7,
    muzzleForward: 26,
  }),
  salvo: attack({
    id: 'salvo',
    label: 'MARKER VOLLEY',
    startup: 8,
    active: 1,
    recovery: 18,
    energyCost: 0,
    damage: 44,
    guardDamage: 15,
    hitstop: 5,
    hitstun: 10,
    knockback: 2,
    satGain: 8,
    kind: ProjKind.Missile,
    homing: 0.07,
    projSpeed: 8,
    projLife: 130,
    projRadius: 6,
    projCount: 2,
    spreadRad: 12 * DEG,
    muzzleForward: 22,
  }),
  melee: chain3('melee', ['BAYONET I', 'BAYONET II', 'IMPALE'], {
    dmg: [70, 58, 150],
    startup: [12, 8, 11],
    recovery: [15, 13, 24],
    lunge: [12, 13.4, 16.5],
    radius: 36,
    finisherKnock: 13,
    selfKnockback: 9.4,
  }),
  // Two committed stabs, not a flurry. A bayonet is a thrusting weapon and
  // VESPER is not meant to win at this range — it should hurt when it connects
  // and leave the pilot exposed if it does not.
  meleeLock: {
    name: 'VESPER LANCE TWO',
    hits: 2,
    thrust: 19,
    tracking: 0.24,
    range: 72,
    acquireRange: 420,
    energy: 80,
    hitEnergy: 18,
    lockout: 70,
    swing: 13,
    gap: 8,
    // Barely any rotation: the arc exists to aim the point, not to slash.
    arc: { windup: 22, sweep: 44, windupFrac: 0.42, alternate: false, motion: 'thrust', reach: 26 },
    damage: [56, 100],
    knock: [6, 16],
    finisherKnock: 20,
    finalLift: 9,
    maxLife: 150,
  },
  /**
   * SNIPER MODE — Kestrel Doyne's answer to being crowded.
   *
   * `Btn.Heavy` stops being a shot and becomes a switch. LONGSHOT is gone from
   * his kit entirely; what it bought was a second, slower gun, and what he
   * actually lacked was a reason for anyone to respect the range he wants to
   * hold. See D107.
   *
   * The trade, stated plainly: he gives up **most of his movement and every
   * other weapon he owns** for three seconds of a gun that steers, crosses the
   * arena in under a second and pierces four targets. Then seven seconds with
   * no stance at all.
   *
   * **Three seconds, not six** (D120). Six was long enough that planting was a
   * commitment he could not survive being wrong about — and measured, more
   * stance uptime made him *worse*, not better: sweeping the cooldown from 420
   * down to 200 moved his lead −0.119 → −0.123, flat to negative, because the
   * stance's cost is standing still and standing still is what was killing him.
   * A shorter window is a smaller bet on the same read.
   *
   * **He is no longer defenceless in it.** The stance still takes his cruise
   * and his thrust, but `dashSpeedScale` leaves the dash whole, so the answer to
   * being found is one committed move rather than none. That is the difference
   * between a turret and a marksman.
   */
  sniper: {
    duration: 180,
    cooldown: 420,
    // Still severe, and deliberately a shade less than the 0.32 it launched at:
    // enough to adjust a firing line, nowhere near enough to travel on.
    speedScale: 0.38,
    // The escape hatch. See `SniperModeDef.dashSpeedScale`.
    dashSpeedScale: 1,
    shot: attack({
      id: 'sniperShot',
      label: 'LONG LANCE',
      /**
       * **One shot a second, on the nose.** 12 + 1 + 47 = 60 ticks.
       *
       * Three settings have been tried and the middle one is the answer. It
       * shipped at **25 ticks**, which is not a sniper rifle — it is a machine
       * gun that happens to be accurate, and it put VESPER 0.53 of a life bar
       * clear of the field. The first nerf went to **109** (a shade under two
       * seconds), which played as "way too slow" — three shots per stance, and a
       * pilot spending most of his six seconds waiting.
       *
       * 60 gives **six shots per stance**: fast enough to feel like a weapon
       * being worked rather than a timer being watched, slow enough that each
       * round is aimed. The startup came down with it, from 16 to 12, because
       * half of "sluggish" was the delay between pressing and firing rather than
       * the gap between shots.
       *
       * The balance cost of this dial is small and measured — see D110. Doubling
       * the rate of fire is worth about 0.077, against the 0.503 that removing
       * the lance properties cost, so cadence is a feel knob far more than a
       * power knob. That is what makes it safe to set by playtest.
       */
      startup: 12,
      active: 1,
      recovery: 47,
      // Dearer per shot than RAILNEEDLE and far dearer than it looks, because
      // the stance blocks the recovery options he would normally spend energy
      // on. A sniper who empties the reactor is a sniper standing still with
      // nothing to fire.
      energyCost: 96,
      damage: 108,
      guardDamage: 44,
      hitstop: 9,
      hitstun: 15,
      knockback: 4,
      satGain: 15,
      /**
       * Kickback. The chassis is shoved back along its own aim on every shot.
       *
       * Worth far more than the number looks, because the stance already caps
       * movement at 0.32 — the shove is roughly four times what he can push
       * against, so a sniper who fires is a sniper drifting backwards out of his
       * own firing line and having to crawl back into it. `FlightModel` lets
       * overspeed bleed off as momentum rather than clamping it to the cap,
       * which is what makes this land at all while planted.
       */
      recoil: 6.5,
      /**
       * **Not a lance any more, and that is the nerf.**
       *
       * It kept `Beam` + `Pierce` + `pierceCount: 4` from the day it was built,
       * which meant the stance's shot ignored a held guard's damage reduction,
       * punched through the escort *and* the pilot behind it, and could not be
       * picked out of the air by a point-defence drone. Three separate
       * advantages, none of them asked for, all on the weapon that already had
       * the best connect rate in the game.
       *
       * Now an ordinary absorbable round: a guard works against it, a barrier
       * burst eats it, an interceptor can shoot it down, and it stops at the
       * first thing it hits.
       *
       * **Presentation is untouched, deliberately.** `kind` stays `Beam` because
       * it is what drives the beam report, the heavier screen shake and the big
       * impact flash, and `projectileArt` dresses the round as `beam` for the
       * sprite. `kind` carries no defensive behaviour at all — every lance
       * property above rides `barrier` and `pierceCount`, which are the two
       * fields that changed. It still looks and sounds exactly like the lance it
       * is drawn as; it simply no longer behaves like one.
       */
      kind: ProjKind.Beam,
      barrier: BarrierResponse.Absorb,
      /**
       * Thinner and longer than PIERCE BEAM (radius 11, life 90, speed 34), and
       * **3.2x as fast** — a shot that arrives before the target can react to
       * the muzzle flash is the point of a sniper.
       *
       * 110 is chosen off a sweep, and the sweep says speed is close to spent as
       * a lever. Stance-shot connect rate against the field at EXTREME:
       *
       * ```
       *   speed  54 -> 49.8%      speed 130 -> 53.6%
       *   speed  88 -> 53.2%      speed 180 -> 51.3%
       * ```
       *
       * It plateaus around 53 % from 88 upward and then *falls*, which travel
       * time cannot explain — the protocol's rule for a dial that has run out of
       * resolution. The rounds that miss are not missing because they are slow;
       * they are missing because of where they were aimed and what the target did
       * afterwards. 110 sits in the plateau with margin on either side.
       */
      projSpeed: 110,
      projLife: 120,
      projRadius: 5,
      pierceCount: 0,
      // Auto-aim, for a window. It corrects onto the target early and then
      // commits, so a pilot who moves late still beats it — a round that steered
      // for its whole flight at this speed would be unanswerable.
      homing: 0.021,
      homingTicks: 45,
      /**
       * Three in ten of the rounds that land knock a weapon out for five seconds.
       *
       * The stance's real payload, and the reason it is worth planting for. A
       * sniper does not out-damage anyone — he takes pieces off them. Which of
       * the three goes is random, so the stance is a threat the opponent cannot
       * plan around rather than a targeted removal; and it is on the *stance*
       * shot only, so it exists exactly while Kestrel is standing still and
       * paying for it.
       *
       * Raised twice, both times to compensate the bolt-action cadence. The two
       * move together and should keep moving together: at 25 ticks a shot this
       * landed **2.43 disarms a fight**, and slowing to 60 dropped it to 1.14 —
       * the per-shot chance is only half the rate, and the other half is how
       * often he gets to shoot. 0.25 → 0.30 put it at 1.43; **0.50** takes it to
       * roughly one every other shot, which is the point at which planting reads
       * as *taking something off* the opponent rather than hoping to.
       *
       * **It stays at 0.50, and D120 is why it did not move a third time.**
       *
       * The stance was cut from six seconds to three in D120, which halves how
       * often he gets to shoot, and by the reasoning above that is half the
       * rate — so 0.60 was tried, to hold the payload across the shorter window.
       * Measured, it was worth **+0.005 against a 0.035 standard error**: it
       * does no balance work whatsoever.
       *
       * Reverted deliberately rather than kept as a free flourish. A dial that
       * measures at nothing is a dial the next reader will assume is load-
       * bearing, and the disarm already has three tuning notes on it. Two shots
       * a stance that take something off half the time is the same threat it
       * always was, arriving in a shorter window.
       */
      disarms: 0.5,
      muzzleForward: 52,
    }),
  },
  subCharges: 2,
  subRechargeTicks: 165,
  // SIGHTLINE hangs far back, matching its pilot's preferred engagement range.
  // Thin-skinned like the chassis it serves, and the easiest drone to shoot down
  // — VESPER pays for the roster's best damage passive with the frailest escort.
  supporter: {
    ...DRONE,
    name: 'SIGHTLINE',
    // Shoots incoming fire out of the air so Doyne never has to move.
    role: 'interceptor',
    roleValue: 320,
    // SIGHTLINE also marks. Doyne's whole problem is that he cannot make a shot
    // count from where he wants to stand, and the paint is the half of ARBITER's
    // job that fixes it — 20 % more damage taken and guidance on his own rounds,
    // which is what turns a held firing line into a threat. It costs the escort
    // nothing it is not already doing while it screens him. See D106.
    paints: true,
    followBack: 96,
    followDown: 44,
    cooldown: 26,
    maxSpeed: 13,
    maxLife: 350,
    defenceMul: 1.12,
    hurtRadius: 12,
    fireRange: 1000,
    passive: {
      name: 'TARGETING UPLINK',
      text: 'Every weapon you fire hits 14% harder.',
      damageMul: 1.14,
    },
  },
  lockCone: 60 * DEG,
  lockRange: 1100,
  meleeRange: 180,
  tint: { primary: 0x2fa8a0, secondary: 0x14545a, accent: 0xf2e14c, thruster: 0x7ff5e6, glow: 0x7ff5e6 },
};

// ================================================================ TERRAMOTH
/**
 * Siege platform. Slowest and toughest thing in the roster, happiest planted on
 * the deck — its grounded defence bonus is the largest here, so it plays the
 * ground game the other seven avoid.
 */
export const TERRAMOTH: MechDef = {
  id: 'terramoth',
  name: 'TERRAMOTH',
  codeName: 'HV-03',
  pilot: 'BRUNN OKONKWO',
  faction: 'IRONWAKE COLLIERY',
  blurb: 'Siege walker. Immense armour and mortars, but slow to reposition.',
  statPower: 5,
  statSpeed: 1,
  statRange: 3,
  flight: {
    ...FLIGHT,
    accel: 1.25,
    maxSpeed: 4.2,
    coastDrag: 0.955,
    boostAccel: 1.9,
    boostMaxSpeed: 7.4,
    dashSpeed: 11,
    dashCost: 16,
    bankMax: 16 * DEG,
    turretRate: 9 * DEG,
    gravity: 0.74,
    walkSpeed: 2.0,
    takeoffImpulse: 4.8,
    groundedBoostRegen: 3.4,
  },
  gauges: { ...GAUGES, maxLife: 2490, maxEnergy: 900, energyRegen: 2.7, barrierRegen: 0.44 },
  barrier: { ...BARRIER, radius: 56, cost: 26, breakStun: 58 },
  // Built to stand and take it.
  defence: { mul: 0.88, groundedMul: 0.66 },
  rig: makeRig({
    scale: 1.29,
    hurtRadius: 36,
    chassisHeight: 96,
    footOffset: 66,
    head: [20, 2],
    backpack: [-34, -10],
    lowerBody: [-12, 22],
    leftArm: [-6, 2],
    subWeapon: [-8, -28],
    rightArm: [20, 12],
    mainWeapon: [42, 4],
    meleeWeapon: [32, 2],
    leftThruster: [-44, 6],
    rightThruster: [-38, 18],
  }),
  main: attack({
    id: 'main',
    label: 'SIEGE REPEATER',
    startup: 4,
    active: 1,
    recovery: 7,
    energyCost: 40,
    damage: 52,
    guardDamage: 20,
    hitstop: 6,
    hitstun: 9,
    knockback: 3,
    satGain: 10,
    recoil: 1.8,
    kind: ProjKind.Bullet,
    projSpeed: 17,
    projLife: 62,
    projRadius: 9,
    muzzleForward: 40,
  }),
  heavy: attack({
    id: 'heavy',
    label: 'MORTAR',
    startup: 12,
    active: 1,
    recovery: 22,
    energyCost: 150,
    damage: 190,
    guardDamage: 76,
    hitstop: 15,
    hitstun: 26,
    knockback: 11,
    satGain: 28,
    recoil: 4.2,
    kind: ProjKind.Heavy,
    projSpeed: 12,
    projLife: 90,
    projRadius: 18,
    muzzleForward: 42,
  }),
  lance: attack({
    id: 'lance',
    label: 'BREACH LANCE',
    startup: 20,
    active: 2,
    recovery: 30,
    energyCost: 280,
    damage: 240,
    guardDamage: 110,
    hitstop: 18,
    hitstun: 32,
    knockback: 12,
    satGain: 36,
    kind: ProjKind.Beam,
    barrier: BarrierResponse.Pierce,
    projSpeed: 24,
    projLife: 70,
    projRadius: 16,
    pierceCount: 3,
    muzzleForward: 46,
  }),
  spread: attack({
    id: 'spread',
    label: 'GRAPESHOT',
    startup: 8,
    active: 1,
    recovery: 20,
    energyCost: 110,
    damage: 34,
    guardDamage: 14,
    hitstop: 5,
    hitstun: 8,
    knockback: 2.2,
    satGain: 7,
    recoil: 3.6,
    kind: ProjKind.Bullet,
    projSpeed: 12,
    projLife: 34,
    projRadius: 7,
    projCount: 7,
    spreadRad: 20 * DEG,
    muzzleForward: 40,
  }),
  sub: attack({
    id: 'sub',
    label: 'CLUSTER SHELL',
    startup: 7,
    active: 1,
    recovery: 16,
    energyCost: 0,
    subCost: 1,
    damage: 84,
    guardDamage: 34,
    hitstop: 9,
    hitstun: 16,
    knockback: 5,
    satGain: 14,
    kind: ProjKind.Missile,
    homing: 0.02,
    projSpeed: 7,
    projLife: 100,
    projRadius: 12,
    projCount: 2,
    spreadRad: 9 * DEG,
    muzzleForward: 24,
  }),
  salvo: attack({
    id: 'salvo',
    label: 'BARRAGE',
    startup: 10,
    active: 1,
    recovery: 24,
    energyCost: 0,
    damage: 40,
    guardDamage: 16,
    hitstop: 5,
    hitstun: 10,
    knockback: 2.4,
    satGain: 8,
    kind: ProjKind.Missile,
    homing: 0.03,
    projSpeed: 6.5,
    projLife: 120,
    projRadius: 9,
    projCount: 5,
    spreadRad: 26 * DEG,
    muzzleForward: 20,
  }),
  melee: chain3('melee', ['PILE I', 'PILE II', 'QUAKE DRIVER'], {
    dmg: [96, 78, 214],
    startup: [15, 11, 16],
    recovery: [20, 17, 30],
    lunge: [9, 10.2, 11.5],
    radius: 48,
    finisherKnock: 17,
    selfKnockback: 5.0,
  }),
  // The heaviest weapon in the roster, so the fewest hits and the hardest ones.
  // A pile driver does not combo; it winds, drives, and resets.
  meleeLock: {
    name: 'TERRAMOTH PILE TWO',
    hits: 2,
    thrust: 12,
    tracking: 0.16,
    range: 86,
    acquireRange: 380,
    energy: 110,
    hitEnergy: 20,
    lockout: 86,
    swing: 15,
    gap: 9,
    // Almost no sweep: the ram is cocked, then fired straight down the aim.
    arc: { windup: 30, sweep: 52, windupFrac: 0.55, alternate: false, motion: 'piston', reach: 30 },
    damage: [86, 130],
    knock: [8, 22],
    finisherKnock: 26,
    finalLift: 5,
    maxLife: 150,
  },
  subCharges: 3,
  subRechargeTicks: 190,
  // BULWARK is slow and sits low, shielding the walker's flank.
  // BULWARK tucks in under the siege frame's shoulder and armours up. The
  // toughest drone in the roster, and the slowest to bring back in — TERRAMOTH
  // cannot flick it out of danger, so it is meant to stay out and soak.
  supporter: {
    ...DRONE,
    name: 'BULWARK',
    // Seeds the ground with charges. A colliery pilot's answer to being slow.
    role: 'miner',
    followBack: 58,
    followDown: 30,
    maxSpeed: 10,
    cooldown: 30,
    radius: 19,
    maxLife: 595,
    defenceMul: 0.82,
    hurtRadius: 17,
    deployTicks: 38,
    recallTicks: 32,
    repair: 0.2,
    fireRange: 640,
    passive: {
      name: 'ARMOUR BRACE',
      text: 'You take 8% less damage.',
      defenceMul: 0.92,
    },
  },
  lockCone: 85 * DEG,
  lockRange: 820,
  meleeRange: 210,
  meleeCue: 'mechanical',
  tint: { primary: 0x9a6a2f, secondary: 0x4e3418, accent: 0xffc24c, thruster: 0xff9a3c, glow: 0xffc24c },
};

// ================================================================ CIRRUS
/**
 * The fastest frame here, and the only one with an eight-hit lock-on flurry.
 * Individually its hits are the weakest in the roster; the damage is in staying
 * attached to someone.
 */
export const CIRRUS: MechDef = {
  id: 'cirrus',
  name: 'CIRRUS',
  codeName: 'LT-21',
  pilot: 'MIRA HOLLOWAY',
  faction: 'FREE LATITUDE',
  blurb: 'Hit-and-run skirmisher. Blistering speed, thin margins.',
  statPower: 2,
  statSpeed: 5,
  statRange: 3,
  /**
   * OVERDRIVE — Mira Holloway spends the machine.
   *
   * At a quarter hull the reactor is dumped: all three saturation modes at once
   * for ten seconds, with no burst of her own available while it runs. Then the
   * thrusters and both guns are **destroyed** and what is left is the eight-hit
   * flurry, half again as hard.
   *
   * It fits her better than it would fit anyone. CIRRUS already has the roster's
   * thinnest margins and its longest chain — 1440 hull and eight hits — and a
   * pilot written as "hit-and-run, thin margins" reaching a point where there is
   * nothing left to run with is the natural end of that sentence. The mode also
   * costs her the two things her playstyle is built on, thrusters and range, and
   * leaves only the thing she was always best at.
   *
   * `threshold` matches the desperation line the rest of the game already uses,
   * so a player who knows what a third of a life bar means also knows what a
   * quarter of one means on this machine.
   *
   * **The window is four seconds, down from ten, and the length was the whole
   * balance problem.** At ten she won **85 %** of her matches against a
   * next-best 66 %, and the phase was the reason: measured across 42 fights she
   * went **17–0** in matches that ended inside the window and **7–6** in matches
   * that ran past it. The aftermath was already fair; the window was not.
   *
   * Swept at EXTREME, twelve seeds:
   *
   * ```
   *   600 (10s) -> +0.204, 85% wins, roster spread 0.316
   *   480  (8s) -> +0.180, 78%
   *   360  (6s) -> +0.154, 72%
   *   300  (5s) -> +0.124,          roster spread 0.225
   *   240  (4s) -> +0.096, 58% wins, roster spread 0.200
   * ```
   *
   * 240 was where that sweep stopped paying. She landed inside the top group
   * rather than above it — +0.096 against TERRAMOTH's +0.055 is 1.3σ — and below
   * it the spread was bound by OBELISK's floor rather than by her ceiling, so
   * shortening further cost the moment without buying balance.
   *
   * A shorter window also shifts weight onto the blade-only phase, which is the
   * half that already measured fair. That is the right way round.
   *
   * **Now 330 — five and a half seconds, by request.** The sweep above is kept
   * for its shape, not its values: it was taken against a roster that has since
   * had OBELISK, VESPER and PYRE rebuilt and a solid deck added under all of
   * them. Read it as "this dial is steep", not as a lookup table.
   */
  overdrive: { threshold: 0.25, ticks: 330, meleeMul: 1.5 },
  flight: {
    ...FLIGHT,
    accel: 2.15,
    maxSpeed: 6.4,
    coastDrag: 0.92,
    brakeDrag: 0.74,
    boostAccel: 3.0,
    boostMaxSpeed: 10.8,
    dashSpeed: 17.5,
    dashTicks: 6,
    dashCost: 9,
    dashCooldown: 4,
    bankRate: 8 * DEG,
    bankMax: 32 * DEG,
    turretRate: 16 * DEG,
    gravity: 0.46,
    walkSpeed: 3.0,
    takeoffImpulse: 6.6,
  },
  gauges: { ...GAUGES, maxLife: 1440, maxBoost: 130, energyRegen: 3.6, barrierRegenDelay: 38 },
  barrier: { ...BARRIER, cost: 24, invulnTicks: 30, radius: 40 },
  defence: { mul: 1.18, groundedMul: 1.1 },
  rig: makeRig({
    scale: 0.82,
    hurtRadius: 23,
    chassisHeight: 88,
    footOffset: 70,
    head: [19, -8],
    backpack: [-22, -16],
    lowerBody: [-6, 22],
    leftArm: [-1, -3],
    subWeapon: [-2, -20],
    rightArm: [14, 4],
    mainWeapon: [32, 7],
    meleeWeapon: [24, 5],
    energy: [14.5, -2.05],
    leftThruster: [-32, -2],
    rightThruster: [-28, 9],
  }),
  main: attack({
    id: 'main',
    label: 'TWIN SMG',
    startup: 2,
    active: 1,
    recovery: 3,
    energyCost: 22,
    damage: 26,
    guardDamage: 8,
    hitstop: 3,
    hitstun: 5,
    knockback: 1.2,
    satGain: 7,
    recoil: 0.5,
    kind: ProjKind.Bullet,
    projSpeed: 15,
    projLife: 52,
    projRadius: 4,
    projCount: 2,
    spreadRad: 4 * DEG,
    muzzleForward: 30,
  }),
  heavy: attack({
    id: 'heavy',
    label: 'SLUG BURST',
    startup: 6,
    active: 1,
    recovery: 11,
    energyCost: 92,
    damage: 92,
    guardDamage: 32,
    hitstop: 9,
    hitstun: 16,
    knockback: 5,
    satGain: 18,
    recoil: 2.0,
    kind: ProjKind.Heavy,
    projSpeed: 18,
    projLife: 60,
    projRadius: 8,
    muzzleForward: 34,
  }),
  lance: attack({
    id: 'lance',
    label: 'ARC LANCE',
    startup: 12,
    active: 2,
    recovery: 18,
    energyCost: 200,
    damage: 150,
    guardDamage: 60,
    hitstop: 12,
    hitstun: 24,
    knockback: 7,
    satGain: 28,
    kind: ProjKind.Beam,
    barrier: BarrierResponse.Pierce,
    projSpeed: 32,
    projLife: 60,
    projRadius: 9,
    pierceCount: 2,
    muzzleForward: 36,
  }),
  spread: attack({
    id: 'spread',
    label: 'FAN SHOT',
    startup: 4,
    active: 1,
    recovery: 12,
    energyCost: 78,
    damage: 24,
    guardDamage: 8,
    hitstop: 4,
    hitstun: 6,
    knockback: 1.4,
    satGain: 6,
    recoil: 1.2,
    kind: ProjKind.Bullet,
    projSpeed: 16,
    projLife: 40,
    projRadius: 4,
    projCount: 5,
    spreadRad: 15 * DEG,
    muzzleForward: 32,
  }),
  sub: attack({
    id: 'sub',
    label: 'DART POD',
    startup: 4,
    active: 1,
    recovery: 9,
    energyCost: 0,
    subCost: 1,
    damage: 52,
    guardDamage: 18,
    hitstop: 6,
    hitstun: 12,
    knockback: 2.4,
    satGain: 10,
    kind: ProjKind.Missile,
    homing: 0.09,
    projSpeed: 11,
    projLife: 95,
    projRadius: 5,
    projCount: 2,
    spreadRad: 14 * DEG,
    muzzleForward: 22,
  }),
  salvo: attack({
    id: 'salvo',
    label: 'SWARM',
    startup: 6,
    active: 1,
    recovery: 14,
    energyCost: 0,
    damage: 26,
    guardDamage: 9,
    hitstop: 4,
    hitstun: 8,
    knockback: 1.6,
    satGain: 6,
    kind: ProjKind.Missile,
    homing: 0.12,
    projSpeed: 10,
    projLife: 110,
    projRadius: 4,
    projCount: 6,
    spreadRad: 30 * DEG,
    muzzleForward: 20,
  }),
  melee: chain3('melee', ['SLASH I', 'SLASH II', 'CROSSCUT'], {
    dmg: [62, 54, 128],
    startup: [8, 5, 8],
    recovery: [11, 9, 18],
    lunge: [15, 16.4, 18],
    radius: 34,
    finisherKnock: 11,
    selfKnockback: 10.5,
  }),
  meleeLock: {
    name: 'CIRRUS EIGHTFOLD',
    hits: 8,
    thrust: 19,
    tracking: 0.36,
    range: 70,
    acquireRange: 500,
    energy: 84,
    hitEnergy: 9,
    lockout: 54,
    swing: 7,
    gap: 3,
    // Knifework. Eight stabs, each angled at a different part of the target,
    // withdrawn before the next begins - an assassin picking spots.
    arc: { windup: 34, sweep: 96, windupFrac: 0.18, alternate: false, motion: 'stab', reach: 22 },
    damage: [18, 18, 20, 20, 22, 22, 26, 58],
    knock: [2, 2, 3, 3, 3, 4, 4, 11],
    finisherKnock: 13,
    finalLift: 10,
    maxLife: 150,
  },
  subCharges: 3,
  subRechargeTicks: 120,
  // WISP is barely there: the fastest, smallest and flimsiest drone, in and out
  // of the backpack in a third of a second. CIRRUS can duck it out of a firing
  // line and put it straight back, which is the only reason it survives at all.
  supporter: {
    ...DRONE,
    name: 'WISP',
    // Strings a live wire home. With the Pincer play it sweeps the target.
    role: 'arcTether',
    followBack: 62,
    followDown: 66,
    maxSpeed: 19,
    turretRate: 9 * DEG,
    cooldown: 16,
    radius: 12,
    maxLife: 335,
    defenceMul: 1.15,
    hurtRadius: 10,
    deployTicks: 18,
    recallTicks: 15,
    repair: 0.42,
    fireRange: 620,
    passive: {
      name: 'THERMAL SIPHON',
      text: 'Boost refills at double rate.',
      boostRegenMul: 2,
    },
  },
  lockCone: 90 * DEG,
  lockRange: 860,
  meleeRange: 195,
  tint: { primary: 0xd8dfe8, secondary: 0x7c8798, accent: 0x4ad6ff, thruster: 0xbdf0ff, glow: 0xbdf0ff },
};

// ================================================================ OBELISK
/**
 * The barrier specialist. Regenerates guard roughly twice as fast as anything
 * else and converts absorbed fire into meter at a premium, so it wants to be
 * shot at — the inverse of how the rest of the roster plays.
 */
export const OBELISK: MechDef = {
  id: 'obelisk',
  name: 'OBELISK',
  codeName: 'GD-09',
  pilot: 'SAAR TENGKU',
  faction: 'IRONWAKE COLLIERY',
  blurb: 'Bulwark. Turns incoming fire into overdrive; punishing at close range.',
  statPower: 4,
  statSpeed: 2,
  statRange: 2,
  flight: {
    ...FLIGHT,
    accel: 1.45,
    maxSpeed: 4.7,
    boostAccel: 2.1,
    boostMaxSpeed: 8.0,
    dashSpeed: 12.5,
    bankMax: 19 * DEG,
    turretRate: 10 * DEG,
    gravity: 0.66,
    walkSpeed: 2.2,
  },
  // Barrier is the whole identity: bigger pool, faster regen, cheaper burst.
  gauges: {
    ...GAUGES,
    maxLife: 2070,
    maxBarrier: 160,
    barrierRegen: 1.05,
    barrierRegenDelay: 30,
    guardDrain: 0.42,
    satOnAbsorb: 42,
    // The one chassis that gets a full-length Shield burst. Every other machine
    // spends the meter at 2/tick in that mode and gets half a burst for it;
    // Saar Tengku is the barrier specialist, and this is the place to say so.
    satShieldDrain: 1,
  },
  barrier: { ...BARRIER, cost: 20, invulnTicks: 44, shieldBonusTicks: 34, guardScale: 0.14, meleeGuardScale: 0.38, pierceGuardScale: 0.38, radius: 54, breakStun: 44 },
  defence: { mul: 0.86, groundedMul: 0.76 },
  rig: makeRig({
    scale: 1.18,
    hurtRadius: 33,
    chassisHeight: 98,
    footOffset: 74,
    head: [21, -1],
    backpack: [-30, -12],
    lowerBody: [-10, 24],
    leftArm: [-5, 1],
    subWeapon: [-7, -25],
    rightArm: [18, 9],
    mainWeapon: [36, 6],
    meleeWeapon: [28, 4],
    leftThruster: [-40, 4],
    rightThruster: [-34, 15],
  }),
  main: attack({
    id: 'main',
    label: 'BREACH GUN',
    startup: 4,
    active: 1,
    recovery: 8,
    energyCost: 44,
    damage: 66,
    guardDamage: 26,
    hitstop: 7,
    hitstun: 10,
    knockback: 3.4,
    satGain: 12,
    recoil: 1.5,
    kind: ProjKind.Bullet,
    projSpeed: 12,
    projLife: 44,
    projRadius: 9,
    muzzleForward: 34,
  }),
  heavy: attack({
    id: 'heavy',
    label: 'RAM CHARGE',
    startup: 10,
    active: 1,
    recovery: 18,
    energyCost: 130,
    damage: 170,
    guardDamage: 88,
    hitstop: 13,
    hitstun: 24,
    knockback: 9,
    satGain: 24,
    recoil: 2.6,
    kind: ProjKind.Heavy,
    projSpeed: 14,
    projLife: 48,
    projRadius: 13,
    muzzleForward: 36,
  }),
  lance: attack({
    id: 'lance',
    label: 'AEGIS BEAM',
    startup: 16,
    active: 2,
    recovery: 24,
    energyCost: 240,
    damage: 214,
    guardDamage: 120,
    hitstop: 15,
    hitstun: 28,
    knockback: 8,
    satGain: 32,
    kind: ProjKind.Beam,
    barrier: BarrierResponse.Pierce,
    projSpeed: 28,
    projLife: 56,
    projRadius: 13,
    pierceCount: 2,
    muzzleForward: 38,
  }),
  spread: attack({
    id: 'spread',
    label: 'SCATTERGUN',
    startup: 5,
    active: 1,
    recovery: 15,
    energyCost: 88,
    damage: 37,
    guardDamage: 15,
    hitstop: 5,
    hitstun: 8,
    knockback: 2.6,
    satGain: 7,
    recoil: 2.8,
    kind: ProjKind.Bullet,
    projSpeed: 13,
    projLife: 26,
    projRadius: 6,
    projCount: 6,
    spreadRad: 24 * DEG,
    muzzleForward: 32,
  }),
  sub: attack({
    id: 'sub',
    label: 'SHOCK MINE',
    startup: 6,
    active: 1,
    recovery: 14,
    energyCost: 0,
    subCost: 1,
    damage: 72,
    guardDamage: 40,
    hitstop: 8,
    hitstun: 18,
    knockback: 4,
    satGain: 13,
    kind: ProjKind.Missile,
    element: Element.Shock,
    homing: 0,
    projSpeed: 4,
    projLife: 200,
    projRadius: 13,
    muzzleForward: 22,
  }),
  salvo: attack({
    id: 'salvo',
    label: 'MINEFIELD',
    startup: 9,
    active: 1,
    recovery: 20,
    energyCost: 0,
    damage: 46,
    guardDamage: 24,
    hitstop: 6,
    hitstun: 12,
    knockback: 2.6,
    satGain: 9,
    kind: ProjKind.Missile,
    element: Element.Shock,
    homing: 0,
    projSpeed: 3.5,
    projLife: 220,
    projRadius: 10,
    projCount: 3,
    spreadRad: 34 * DEG,
    muzzleForward: 20,
  }),
  melee: chain3('melee', ['SHIELD BASH', 'CRUSH', 'TOWER FALL'], {
    dmg: [86, 72, 190],
    startup: [12, 9, 13],
    recovery: [17, 14, 26],
    lunge: [11, 12.2, 13.5],
    radius: 44,
    finisherKnock: 15,
    selfKnockback: 6.2,
  }),
  // A tower shield is not a combo weapon. Two enormous shoulder-charges, each
  // throwing the target far harder than any blade hit — the whole point of
  // carrying something this heavy is what happens when it lands.
  meleeLock: {
    name: 'OBELISK BASH TWO',
    hits: 2,
    thrust: 14,
    tracking: 0.2,
    range: 80,
    acquireRange: 400,
    energy: 96,
    hitEnergy: 26,
    lockout: 72,
    swing: 16,
    gap: 10,
    // Shallow rotation; the damage comes from the shove, not from an arc.
    arc: { windup: 34, sweep: 70, windupFrac: 0.46, alternate: true, motion: 'bash', reach: 22 },
    damage: [92, 132],
    knock: [9, 20],
    finisherKnock: 26,
    finalLift: 6.5,
    maxLife: 150,
  },
  subCharges: 2,
  subRechargeTicks: 175,
  // AEGIS flies close in against the guard frame's shoulder, where the mech's own
  // bulk shields it. Armoured, and it makes OBELISK's guard stance sustainable
  // rather than a brief pause.
  supporter: {
    ...DRONE,
    name: 'AEGIS',
    // Raises a bubble that erases incoming shots. Its name, and Tengku's whole kit.
    role: 'dome',
    roleValue: 150,
    followBack: 54,
    followDown: 40,
    maxSpeed: 12,
    cooldown: 28,
    radius: 18,
    maxLife: 510,
    defenceMul: 0.88,
    hurtRadius: 16,
    deployTicks: 32,
    recallTicks: 26,
    repair: 0.26,
    fireRange: 660,
    passive: {
      name: 'GUARD RELAY',
      text: 'Holding guard costs 45% less barrier.',
      guardDrainMul: 0.55,
    },
  },
  lockCone: 80 * DEG,
  lockRange: 760,
  meleeRange: 205,
  meleeCue: 'mechanical',
  tint: { primary: 0x6d5fa8, secondary: 0x342c5c, accent: 0xc8b4ff, thruster: 0xa88cff, glow: 0xc8b4ff },
};

// ================================================================ PYRE
/**
 * Incendiary brawler. Almost everything it fires applies burn, so its damage
 * arrives late — it wins fights it has already left.
 */
export const PYRE: MechDef = {
  id: 'pyre',
  name: 'PYRE',
  codeName: 'IN-05',
  pilot: 'RASA VOLKOV',
  faction: 'ASHFALL IRREGULARS',
  blurb: 'Incendiary brawler. Sets the fight on fire and waits it out.',
  statPower: 4,
  statSpeed: 3,
  statRange: 2,
  flight: {
    ...FLIGHT,
    accel: 1.8,
    maxSpeed: 5.4,
    boostMaxSpeed: 9.2,
    dashSpeed: 15,
    bankMax: 26 * DEG,
    turretRate: 13 * DEG,
    gravity: 0.58,
  },
  gauges: { ...GAUGES, maxLife: 1860, energyRegen: 3.3, satPassive: 0.62 },
  barrier: { ...BARRIER, cost: 28 },
  defence: { mul: 0.95, groundedMul: 0.88 },
  rig: makeRig({
    scale: 1.04,
    hurtRadius: 29,
    chassisHeight: 100,
    footOffset: 78,
    head: [22, -5],
    backpack: [-27, -17],
    lowerBody: [-9, 25],
    leftArm: [-3, -1],
    subWeapon: [-5, -24],
    rightArm: [17, 7],
    mainWeapon: [34, 8],
    meleeWeapon: [27, 5],
    energy: [91.55, 2.65],
    leftThruster: [-37, 2],
    rightThruster: [-33, 13],
  }),
  main: attack({
    id: 'main',
    label: 'CINDER JET',
    startup: 3,
    active: 1,
    recovery: 4,
    energyCost: 28,
    damage: 30,
    guardDamage: 11,
    hitstop: 4,
    hitstun: 6,
    knockback: 1.4,
    satGain: 8,
    recoil: 0.6,
    kind: ProjKind.Bullet,
    element: Element.Incendiary,
    projSpeed: 10,
    projLife: 30,
    projRadius: 8,
    muzzleForward: 32,
  }),
  heavy: attack({
    id: 'heavy',
    label: 'FIREBOMB',
    startup: 9,
    active: 1,
    recovery: 16,
    energyCost: 122,
    damage: 128,
    guardDamage: 46,
    hitstop: 12,
    hitstun: 20,
    knockback: 6,
    satGain: 22,
    recoil: 2.2,
    kind: ProjKind.Heavy,
    element: Element.Incendiary,
    projSpeed: 13,
    projLife: 66,
    projRadius: 15,
    muzzleForward: 34,
  }),
  lance: attack({
    id: 'lance',
    label: 'PLASMA LANCE',
    startup: 15,
    active: 2,
    recovery: 22,
    energyCost: 230,
    damage: 176,
    guardDamage: 70,
    hitstop: 14,
    hitstun: 26,
    knockback: 8,
    satGain: 30,
    kind: ProjKind.Beam,
    barrier: BarrierResponse.Pierce,
    element: Element.Incendiary,
    projSpeed: 30,
    projLife: 62,
    projRadius: 12,
    pierceCount: 2,
    muzzleForward: 38,
  }),
  spread: attack({
    id: 'spread',
    label: 'EMBER FAN',
    startup: 5,
    active: 1,
    recovery: 13,
    energyCost: 84,
    damage: 22,
    guardDamage: 9,
    hitstop: 4,
    hitstun: 6,
    knockback: 1.5,
    satGain: 6,
    recoil: 1.6,
    kind: ProjKind.Bullet,
    element: Element.Incendiary,
    projSpeed: 11,
    projLife: 28,
    projRadius: 7,
    projCount: 5,
    spreadRad: 22 * DEG,
    muzzleForward: 32,
  }),
  sub: attack({
    id: 'sub',
    label: 'NAPALM POD',
    startup: 6,
    active: 1,
    recovery: 13,
    energyCost: 0,
    subCost: 1,
    damage: 62,
    guardDamage: 22,
    hitstop: 7,
    hitstun: 14,
    knockback: 3,
    satGain: 12,
    kind: ProjKind.Missile,
    element: Element.Incendiary,
    homing: 0.05,
    projSpeed: 8.5,
    projLife: 110,
    projRadius: 10,
    muzzleForward: 24,
  }),
  salvo: attack({
    id: 'salvo',
    label: 'FIRESTORM',
    startup: 8,
    active: 1,
    recovery: 18,
    energyCost: 0,
    damage: 34,
    guardDamage: 13,
    hitstop: 5,
    hitstun: 9,
    knockback: 1.8,
    satGain: 7,
    kind: ProjKind.Missile,
    element: Element.Incendiary,
    homing: 0.06,
    projSpeed: 7.5,
    projLife: 120,
    projRadius: 8,
    projCount: 4,
    spreadRad: 24 * DEG,
    muzzleForward: 22,
  }),
  melee: chain3('melee', ['TORCH I', 'TORCH II', 'IMMOLATE'], {
    dmg: [78, 66, 162],
    startup: [10, 7, 10],
    recovery: [14, 12, 22],
    lunge: [13, 14.2, 15.8],
    radius: 40,
    finisherKnock: 13,
    selfKnockback: 8.0,
    element: Element.Incendiary,
  }),
  // A thermal cleaver is a chopping weapon: heavier than a saber, so three
  // slower strokes rather than a flurry, each one worth landing.
  meleeLock: {
    name: 'PYRE BRAND THREE',
    hits: 3,
    thrust: 16,
    tracking: 0.28,
    range: 76,
    acquireRange: 440,
    energy: 88,
    hitEnergy: 17,
    lockout: 64,
    swing: 12,
    gap: 7,
    // A scythe: thrown out wide, accelerating through the arc, and drawn
    // back *through* the target. It ends nearer than it started.
    arc: {
      windup: 104,
      sweep: 236,
      // **0.60, and the 0.19 that was here was a measurement error.** The strike
      // was timed against the whole 107-frame reference clip — but that clip is
      // *three* slashes. Within one slash the raise runs about 18 frames of 29,
      // the strike 3, and the recovery 8.
      windupFrac: 0.60,
      alternate: true,
      motion: 'reap',
      reach: 30,
      // A blade longer than the machine cannot be swung one-handed.
      twoHanded: true,
    },
    damage: [54, 58, 88],
    knock: [5, 6, 15],
    finisherKnock: 18,
    finalLift: 8,
    maxLife: 150,
  },
  subCharges: 2,
  subRechargeTicks: 145,
  // EMBER runs hot, like its pilot: an ordinary frame carrying an overdrive tap.
  // PYRE already has the roster's fastest passive saturation gain, so this
  // doubles down rather than covering a weakness — the aggressive pick.
  supporter: {
    ...DRONE,
    name: 'EMBER',
    // Leaves the ground burning behind it. Rasa makes the room dangerous.
    role: 'hazard',
    followBack: 68,
    followDown: 54,
    maxSpeed: 16,
    cooldown: 20,
    maxLife: 300,
    defenceMul: 0.98,
    hurtRadius: 13,
    deployTicks: 24,
    recallTicks: 21,
    repair: 0.3,
    fireRange: 740,
    passive: {
      name: 'OVERDRIVE TAP',
      text: 'Saturation builds 80% faster.',
      satGainMul: 1.8,
    },
  },
  lockCone: 78 * DEG,
  lockRange: 820,
  meleeRange: 198,
  // Bright industrial orange, deliberately clear of NOCTURNE's deep crimson —
  // two red machines would be unreadable against each other in a firefight.
  tint: { primary: 0xe8761c, secondary: 0x7a350a, accent: 0xffe066, thruster: 0xff9a2c, glow: 0xffc247 },
};

// ================================================================ NULLTIDE
/**
 * Electronic warfare. Trades raw damage for shock and cryo pressure — the only
 * chassis carrying two elements, and the only one whose drone outranges it.
 */
export const NULLTIDE: MechDef = {
  id: 'nulltide',
  name: 'NULLTIDE',
  codeName: 'EW-14',
  pilot: 'IO SENNA',
  faction: 'FREE LATITUDE',
  blurb: 'Disruptor. Freezes, shocks and unpicks an opponent rather than out-shooting them.',
  statPower: 2,
  statSpeed: 4,
  statRange: 4,
  flight: {
    ...FLIGHT,
    accel: 1.9,
    maxSpeed: 5.7,
    boostMaxSpeed: 9.6,
    dashSpeed: 15.5,
    dashCost: 10,
    bankMax: 28 * DEG,
    turretRate: 14 * DEG,
    gravity: 0.5,
  },
  gauges: { ...GAUGES, maxLife: 1610, maxEnergy: 1250, energyRegen: 3.9, maxSaturation: 440, satPassive: 0.72 },
  barrier: { ...BARRIER, cost: 26, invulnTicks: 40 },
  defence: { mul: 1.08, groundedMul: 1.0 },
  rig: makeRig({
    scale: 0.89,
    hurtRadius: 25,
    chassisHeight: 94,
    footOffset: 76,
    head: [20, -10],
    backpack: [-25, -19],
    lowerBody: [-7, 23],
    leftArm: [-2, -4],
    subWeapon: [-4, -22],
    rightArm: [15, 3],
    mainWeapon: [35, 9],
    meleeWeapon: [25, 6],
    // The glaive became an extended shock baton (D146): all hardware, with the
    // electricity drawn over it instead of a blade projected from it.
    arc: true,
    leftThruster: [-34, -1],
    rightThruster: [-30, 11],
  }),
  main: attack({
    id: 'main',
    label: 'STATIC BOLT',
    startup: 3,
    active: 1,
    recovery: 5,
    energyCost: 30,
    damage: 34,
    guardDamage: 15,
    hitstop: 4,
    hitstun: 7,
    knockback: 1.8,
    satGain: 9,
    recoil: 0.7,
    kind: ProjKind.Bullet,
    element: Element.Shock,
    projSpeed: 16,
    projLife: 70,
    projRadius: 6,
    muzzleForward: 34,
  }),
  heavy: attack({
    id: 'heavy',
    label: 'CRYO SLUG',
    startup: 8,
    active: 1,
    recovery: 15,
    energyCost: 116,
    damage: 104,
    guardDamage: 40,
    hitstop: 11,
    hitstun: 22,
    knockback: 5,
    satGain: 20,
    recoil: 1.9,
    kind: ProjKind.Heavy,
    element: Element.Cryo,
    projSpeed: 16,
    projLife: 74,
    projRadius: 10,
    muzzleForward: 36,
  }),
  lance: attack({
    id: 'lance',
    label: 'NULL BEAM',
    startup: 14,
    active: 2,
    recovery: 20,
    energyCost: 210,
    damage: 142,
    guardDamage: 96,
    hitstop: 13,
    hitstun: 34,
    knockback: 6,
    satGain: 30,
    kind: ProjKind.Beam,
    barrier: BarrierResponse.Pierce,
    element: Element.Shock,
    projSpeed: 33,
    projLife: 76,
    projRadius: 10,
    pierceCount: 3,
    muzzleForward: 38,
  }),
  spread: attack({
    id: 'spread',
    label: 'ARC SPRAY',
    startup: 4,
    active: 1,
    recovery: 12,
    energyCost: 80,
    damage: 20,
    guardDamage: 11,
    hitstop: 3,
    hitstun: 6,
    knockback: 1.2,
    satGain: 6,
    recoil: 1.1,
    kind: ProjKind.Bullet,
    element: Element.Shock,
    projSpeed: 14,
    projLife: 44,
    projRadius: 5,
    projCount: 4,
    spreadRad: 17 * DEG,
    muzzleForward: 34,
  }),
  sub: attack({
    id: 'sub',
    label: 'FROST POD',
    startup: 5,
    active: 1,
    recovery: 11,
    energyCost: 0,
    subCost: 1,
    damage: 48,
    guardDamage: 20,
    hitstop: 6,
    hitstun: 20,
    knockback: 2.4,
    satGain: 11,
    kind: ProjKind.Missile,
    element: Element.Cryo,
    homing: 0.1,
    projSpeed: 9.5,
    projLife: 120,
    projRadius: 8,
    muzzleForward: 22,
  }),
  salvo: attack({
    id: 'salvo',
    label: 'DISRUPT NET',
    startup: 7,
    active: 1,
    recovery: 16,
    energyCost: 0,
    damage: 24,
    guardDamage: 12,
    hitstop: 4,
    hitstun: 16,
    knockback: 1.4,
    satGain: 6,
    kind: ProjKind.Missile,
    element: Element.Cryo,
    homing: 0.11,
    projSpeed: 8.5,
    projLife: 130,
    projRadius: 6,
    projCount: 4,
    spreadRad: 28 * DEG,
    muzzleForward: 20,
  }),
  melee: chain3('melee', ['SHOCK I', 'SHOCK II', 'OVERLOAD'], {
    dmg: [58, 50, 132],
    startup: [9, 6, 9],
    recovery: [12, 10, 20],
    lunge: [14, 15.2, 16.8],
    radius: 36,
    finisherKnock: 12,
    selfKnockback: 9.0,
    element: Element.Shock,
  }),
  // An extended baton: longer reach and a wider sweep than a saber, but heavier
  // at the head, so five strokes rather than six or eight. The weapon changed
  // shape in D146 and these numbers did not — a baton at full extension is the
  // same length of lever the polearm was, and the chain was authored against
  // the lever rather than against the blade.
  meleeLock: {
    name: 'NULLTIDE CASCADE FIVE',
    hits: 5,
    thrust: 17,
    tracking: 0.32,
    range: 82,
    acquireRange: 470,
    energy: 82,
    hitEnergy: 13,
    lockout: 58,
    swing: 9,
    gap: 5,
    // Held out at reach for the whole arc. Constant momentum through a wide
    // sweep; it never extends because it was already out there — which is now
    // literally true of the hardware, since the baton is drawn extended.
    arc: { windup: 68, sweep: 246, windupFrac: 0.30, alternate: true, motion: 'sweep', reach: 30 },
    damage: [26, 26, 30, 30, 72],
    knock: [3, 3, 4, 4, 13],
    finisherKnock: 15,
    finalLift: 9,
    maxLife: 150,
  },
  subCharges: 3,
  subRechargeTicks: 130,
  // STATIC ranges further out than its parent, screening the approach.
  // STATIC is the only drone that points its effect at the other pilot. It is an
  // electronic-warfare platform, so it stands well off, and halving an opponent's
  // energy regeneration quietly closes off their heavy weapons entirely.
  supporter: {
    ...DRONE,
    name: 'STATIC',
    // Projects a false silhouette that draws lock-on and fire.
    role: 'decoy',
    followBack: 88,
    followDown: 70,
    maxSpeed: 17,
    turretRate: 8 * DEG,
    cooldown: 18,
    radius: 13,
    // 385 is 110 × 3.5. STATIC was the one drone the D63 scaling pass missed —
    // the other seven all took the multiplier and this one kept its pre-D63
    // value at every commit since, leaving it 2.7× frailer than the next
    // weakest escort against pools that had all tripled around it.
    maxLife: 385,
    defenceMul: 1.06,
    hurtRadius: 12,
    deployTicks: 26,
    recallTicks: 22,
    repair: 0.32,
    fireRange: 820,
    passive: {
      name: 'JAMMING FIELD',
      text: "Halves the opponent's energy regeneration.",
      enemyEnergyRegenMul: 0.5,
    },
  },
  lockCone: 82 * DEG,
  lockRange: 980,
  meleeRange: 192,
  // Near-black slate with electric cyan: a stealthy EW frame, and clear of
  // HALCYON's bright azure, which an earlier draft of this palette collided with.
  tint: { primary: 0x243a4a, secondary: 0x121d26, accent: 0x8affe0, thruster: 0x5ce0ff, glow: 0x8affe0 },
};

/** The six chassis added on top of the original pair. */
export const EXTRA_MECHS: MechDef[] = [VESPER, TERRAMOTH, CIRRUS, OBELISK, PYRE, NULLTIDE];
