import { attack } from '../combat/AttackData';
import { BarrierResponse, ProjKind } from '../combat/types';
import type { FlightDef, GaugeDef, BarrierDef, MechDef, MechRigDef } from '../mechs/MechDef';
import { DEG } from '../core/MathUtil';

/**
 * Original mech roster for the vertical slice.
 *
 * Naming, factions and pilots are original to this project. Timings are our own
 * tuning, informed by the *shape* of the 2005 reference's state machine
 * (hit-confirmed melee chains, firing that anchors movement, a cheap-but-short
 * barrier burst, a three-mode saturation meter).
 */

/**
 * Rig offsets MUST mirror PIVOTS_PX in tools/blender/build_mechs.py, in the same
 * logical pixels (1 Blender unit = 60 of them). Child offsets are relative to
 * the parent, so e.g. mainWeapon = world(54,14) - rightArm(16,6) = (38,8).
 *
 * The anatomy is a hunched reverse-joint walker, not an upright humanoid: the
 * cockpit pod sits forward and low, the hips trail behind and below, and the
 * rifle is thrust well ahead of the chassis.
 */
const HALCYON_RIG: MechRigDef = {
  hurtRadius: 28,
  chassisHeight: 104,
  // Hip at y=27 from the core, and halcyon_legNear.png reaches 57 logical px
  // below its hip pivot.
  footOffset: 84,
  parts: [
    { name: 'core', parent: null, x: 0, y: 0, rotation: 0, follow: 'chassis' },
    { name: 'head', parent: 'core', x: 21, y: -7, rotation: 0, follow: 'turret' },
    { name: 'backpack', parent: 'core', x: -26, y: -18, rotation: 0, follow: 'chassis' },
    { name: 'lowerBody', parent: 'core', x: -8, y: 26, rotation: 0, follow: 'chassis' },
    // Legs hang off the pelvis at the hip line and stride in antiphase.
    { name: 'legFar', parent: 'lowerBody', x: 0, y: 1, rotation: 0, follow: 'legFar' },
    { name: 'legNear', parent: 'lowerBody', x: 0, y: 1, rotation: 0, follow: 'legNear' },
    { name: 'leftArm', parent: 'core', x: -2, y: -2, rotation: 0, follow: 'turret' },
    { name: 'subWeapon', parent: 'leftArm', x: -3, y: -23, rotation: 0, follow: 'turret' },
    { name: 'rightArm', parent: 'core', x: 16, y: 6, rotation: 0, follow: 'turret' },
    { name: 'mainWeapon', parent: 'rightArm', x: 38, y: 8, rotation: 0, follow: 'turret' },
    // Beam saber: hidden until a melee sequence, when the rifle is stowed.
    { name: 'meleeWeapon', parent: 'rightArm', x: 28, y: 6, rotation: 0, follow: 'turret' },
    { name: 'leftThruster', parent: 'core', x: -36, y: 0, rotation: 0, follow: 'thruster' },
    { name: 'rightThruster', parent: 'core', x: -32, y: 12, rotation: 0, follow: 'thruster' },
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
  ],
};

/**
 * NOCTURNE is a separate chassis, not a recolour: broader hull, shallower pitch,
 * shorter//thicker legs, rotary cannon and a bigger missile rack. Its pivots
 * therefore differ and must mirror CHASSIS['nocturne']['pivots'] in
 * tools/blender/build_mechs.py.
 */
const NOCTURNE_RIG: MechRigDef = {
  hurtRadius: 31,
  chassisHeight: 100,
  // Shorter, thicker legs: hip at y=25, reaching 47 logical px below it.
  footOffset: 72,
  parts: [
    { name: 'core', parent: null, x: 0, y: 0, rotation: 0, follow: 'chassis' },
    { name: 'head', parent: 'core', x: 23, y: -2, rotation: 0, follow: 'turret' },
    { name: 'backpack', parent: 'core', x: -30, y: -14, rotation: 0, follow: 'chassis' },
    { name: 'lowerBody', parent: 'core', x: -10, y: 24, rotation: 0, follow: 'chassis' },
    { name: 'legFar', parent: 'lowerBody', x: 0, y: 1, rotation: 0, follow: 'legFar' },
    { name: 'legNear', parent: 'lowerBody', x: 0, y: 1, rotation: 0, follow: 'legNear' },
    { name: 'leftArm', parent: 'core', x: -4, y: 0, rotation: 0, follow: 'turret' },
    { name: 'subWeapon', parent: 'leftArm', x: -6, y: -26, rotation: 0, follow: 'turret' },
    { name: 'rightArm', parent: 'core', x: 18, y: 10, rotation: 0, follow: 'turret' },
    { name: 'mainWeapon', parent: 'rightArm', x: 40, y: 6, rotation: 0, follow: 'turret' },
    { name: 'meleeWeapon', parent: 'rightArm', x: 30, y: 4, rotation: 0, follow: 'turret' },
    { name: 'leftThruster', parent: 'core', x: -40, y: 4, rotation: 0, follow: 'thruster' },
    { name: 'rightThruster', parent: 'core', x: -34, y: 16, rotation: 0, follow: 'thruster' },
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
  ],
};

/**
 * Flight feel.
 *
 * Retuned after comparing against 2005 (which used `velset` â€” instantaneous)
 * and the working Iron Babel build (an instant boost impulse plus heavy drag).
 * The original values here accelerated at 0.62 toward a 5.2 cap, i.e. ~8 ticks
 * to reach top speed, which reads as floaty next to either reference.
 *
 * Now: acceleration reaches cap in ~3 ticks, drag is crisper so you stop when
 * you let go, and the dash impulse is cheap and short-cooldown so boosting is a
 * constantly available movement tool rather than a committed resource dump.
 */
const HALCYON_FLIGHT: FlightDef = {
  accel: 1.85,
  maxSpeed: 5.6,
  coastDrag: 0.93,
  brakeDrag: 0.78,
  boostAccel: 2.6,
  boostMaxSpeed: 9.4,
  maxBoost: 100,
  boostDrain: 0.5,
  boostRegen: 0.9,
  boostRegenDelay: 16,
  dashSpeed: 15,
  dashTicks: 7,
  dashCost: 12,
  dashCooldown: 6,
  bankRate: 6 * DEG,
  bankMax: 26 * DEG,
  turretRate: 13 * DEG,
  gravity: 0.52,
  walkSpeed: 2.6,
  groundFriction: 0.80,
  takeoffImpulse: 6.0,
  groundedBoostRegen: 2.6,
};

const NOCTURNE_FLIGHT: FlightDef = {
  ...HALCYON_FLIGHT,
  accel: 1.55,
  maxSpeed: 5.0,
  coastDrag: 0.945,
  boostAccel: 2.2,
  boostMaxSpeed: 8.6,
  dashSpeed: 13.5,
  bankMax: 22 * DEG,
  turretRate: 11 * DEG,
  // Heavier frame: falls harder, walks slower, takes off less sharply.
  gravity: 0.62,
  walkSpeed: 2.2,
  takeoffImpulse: 5.4,
};

const BASE_GAUGES: GaugeDef = {
  maxLife: 1000,
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
  satOnDamage: 0.30,
  hitInvuln: 3,
  meleeLockout: 34,
};

const BASE_BARRIER: BarrierDef = {
  actionTicks: 6,
  invulnTicks: 36,
  shieldBonusTicks: 24,
  cost: 30,
  cancelPenalty: 22,
  breakStun: 50,
  guardScale: 0.32,
  radius: 46,
};

/** ---------------------------------------------------------------- AV-07 HALCYON */
export const HALCYON: MechDef = {
  id: 'halcyon',
  name: 'HALCYON',
  codeName: 'AV-07',
  pilot: 'NAIA VESK',
  faction: 'CONCORD SKYWARD',
  blurb: 'Balanced interceptor. Fast lance charge, forgiving barrier.',
  statPower: 3,
  statSpeed: 4,
  statRange: 4,

  flight: HALCYON_FLIGHT,
  gauges: BASE_GAUGES,
  barrier: BASE_BARRIER,
  // Light frame: takes full damage, braces a little when planted.
  defence: { mul: 1.0, groundedMul: 0.9 },
  rig: HALCYON_RIG,

  main: attack({
    id: 'main',
    label: 'VULCAN',
    startup: 3,
    active: 1,
    recovery: 5,
    energyCost: 34,
    damage: 42,
    guardDamage: 13,
    hitstop: 5,
    hitstun: 8,
    knockback: 2.2,
    satGain: 10,
    recoil: 0.9,
    kind: ProjKind.Bullet,
    projSpeed: 13,
    projLife: 72,
    projRadius: 6,
    muzzleForward: 36,
    muzzleLateral: -2,
  }),

  heavy: attack({
    id: 'heavy',
    label: 'BREAKER',
    startup: 8,
    active: 1,
    recovery: 14,
    energyCost: 120,
    damage: 118,
    guardDamage: 42,
    hitstop: 10,
    hitstun: 16,
    knockback: 5.5,
    satGain: 20,
    recoil: 3.2,
    kind: ProjKind.Heavy,
    projSpeed: 11,
    projLife: 84,
    projRadius: 12,
    pierceCount: 1,
    muzzleForward: 38,
  }),

  lance: attack({
    id: 'lance',
    label: 'LANCE',
    startup: 14,
    active: 4,
    recovery: 22,
    energyCost: 265,
    damage: 96,
    guardDamage: 34,
    hitstop: 8,
    hitstun: 14,
    knockback: 3.4,
    satGain: 50,
    recoil: 5.5,
    kind: ProjKind.Beam,
    projSpeed: 26,
    projLife: 40,
    projRadius: 13,
    projCount: 3,
    spreadRad: 0,
    pierceCount: 4,
    muzzleForward: 40,
  }),

  spread: attack({
    id: 'spread',
    label: 'SCATTER',
    startup: 5,
    active: 1,
    recovery: 12,
    energyCost: 95,
    damage: 34,
    guardDamage: 11,
    hitstop: 4,
    hitstun: 7,
    knockback: 1.8,
    satGain: 16,
    recoil: 2.4,
    kind: ProjKind.Bullet,
    projSpeed: 12,
    projLife: 52,
    projRadius: 6,
    projCount: 5,
    spreadRad: 26 * DEG,
    muzzleForward: 34,
  }),

  sub: attack({
    id: 'sub',
    label: 'SEEKER',
    startup: 6,
    active: 1,
    recovery: 18,
    energyCost: 0,
    subCost: 1,
    damage: 74,
    guardDamage: 26,
    hitstop: 8,
    hitstun: 14,
    knockback: 4.2,
    satGain: 12,
    recoil: 1.2,
    kind: ProjKind.Missile,
    projSpeed: 7.4,
    projLife: 150,
    projRadius: 9,
    projCount: 2,
    spreadRad: 22 * DEG,
    homing: 0.048,
    muzzleForward: 20,
    muzzleLateral: -16,
  }),

  salvo: attack({
    id: 'salvo',
    label: 'SALVO',
    startup: 9,
    active: 1,
    recovery: 26,
    energyCost: 0,
    subCost: 2,
    damage: 62,
    guardDamage: 20,
    hitstop: 7,
    hitstun: 12,
    knockback: 3.4,
    satGain: 24,
    recoil: 2.2,
    kind: ProjKind.Missile,
    projSpeed: 6.6,
    projLife: 170,
    projRadius: 9,
    projCount: 5,
    spreadRad: 46 * DEG,
    homing: 0.058,
    muzzleForward: 20,
    muzzleLateral: -14,
  }),

  /**
   * Three-stage sword chain. Chaining requires the previous stage to have
   * connected â€” the reference gated its follow-up on a hit-confirm variable.
   * Melee ignores barriers (the reference marked it "barrier-impossible").
   */
  melee: [
    attack({
      id: 'melee1',
      label: 'SWORD I',
      startup: 11,
      active: 3,
      recovery: 14,
      energyCost: 0,
      damage: 88,
      guardDamage: 44,
      hitstop: 9,
      hitstun: 18,
      knockback: 3.2,
      satGain: 14,
      kind: ProjKind.Melee,
      barrier: BarrierResponse.Pierce,
      projSpeed: 0,
      projLife: 3,
      projRadius: 40,
      muzzleForward: 40,
      // The reference lunged 4.2-5.0 px/tick in a 320-wide space; scaled to this
      // project's 960-wide space that is ~13-15. It stops on contact rather than
      // overshooting (see Combatant.stepAttack).
      lunge: 13.2,
      chainFrom: 8,
      chainTo: 24,
      meleeStage: 0,
    }),
    attack({
      id: 'melee2',
      label: 'SWORD II',
      startup: 7,
      active: 3,
      recovery: 12,
      energyCost: 0,
      damage: 68,
      guardDamage: 34,
      hitstop: 8,
      hitstun: 16,
      knockback: 2.8,
      satGain: 12,
      kind: ProjKind.Melee,
      barrier: BarrierResponse.Pierce,
      projSpeed: 0,
      projLife: 3,
      projRadius: 40,
      muzzleForward: 40,
      lunge: 14.5,
      chainFrom: 5,
      chainTo: 20,
      meleeStage: 1,
    }),
    attack({
      id: 'melee3',
      label: 'SWORD III',
      startup: 9,
      active: 4,
      recovery: 22,
      energyCost: 0,
      damage: 176,
      guardDamage: 70,
      hitstop: 14,
      hitstun: 30,
      knockback: 12,
      satGain: 26,
      kind: ProjKind.Melee,
      barrier: BarrierResponse.Pierce,
      projSpeed: 0,
      projLife: 4,
      projRadius: 46,
      muzzleForward: 44,
      lunge: 15.5,
      meleeStage: 2,
      selfKnockback: 8.2,
    }),
  ],

  // Fast six-hit saber chain: light frame, tight tracking, cheap swings.
  meleeLock: {
    name: 'HALCYON SABER SIX',
    hits: 6,
    thrust: 17,
    tracking: 0.30,
    range: 78,
    acquireRange: 460,
    energy: 90,
    hitEnergy: 14,
    lockout: 62,
    swing: 9,
    gap: 4,
    // Wide, fast saber arcs. The blade winds back over the shoulder and sweeps
    // ~200deg through the target, alternating handedness each hit, so a six-hit
    // chain reads as a flurry of slashes rather than one stroke on repeat.
    arc: { windup: 74, sweep: 202, windupFrac: 0.34, alternate: true },
    damage: [26, 26, 30, 30, 34, 74],
    knock: [3, 3, 4, 4, 5, 13],
    finisherKnock: 15,
    finalLift: 8.5,
    maxLife: 150,
  },

  subCharges: 2,
  subRechargeTicks: 150,
  // ARBITER: the light escort drone. Sits close, turns fast, fires quickly.
  // The reference scaled its helper's stand-off distance by the chassis weight
  // class, so the lighter frame keeps its supporter tucked in.
  supporter: {
    name: 'ARBITER',
    followBack: 70,
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
  },
  lockCone: 75 * DEG,
  lockRange: 900,
  // ~2x the chassis height. The 11-tick startup lunges ~81px and the arc itself
  // reaches 40px, so a swing started here closes and connects.
  meleeRange: 200,
  // Mirrors PALETTES['halcyon'] in tools/blender/build_mechs.py.
  tint: {
    primary: 0x1a70db,
    secondary: 0x0f4390,
    accent: 0xff5c10,
    thruster: 0x33e6ff,
    glow: 0x33e6ff,
  },
};

/** --------------------------------------------------------------- AV-13 NOCTURNE */
export const NOCTURNE: MechDef = {
  ...HALCYON,
  id: 'nocturne',
  name: 'NOCTURNE',
  codeName: 'AV-13',
  pilot: 'HALDEN ROOK',
  faction: 'EMBERLINE PACT',
  blurb: 'Heavier rival frame. Slower, harder hits, wider salvo.',
  statPower: 4,
  statSpeed: 3,
  statRange: 3,
  flight: NOCTURNE_FLIGHT,
  gauges: { ...BASE_GAUGES, maxLife: 1000, energyRegen: 2.9 },
  barrier: { ...BASE_BARRIER, cost: 34 },
  // Heavy frame: thicker armour, and very hard to shift once planted.
  defence: { mul: 0.82, groundedMul: 0.8 },
  rig: NOCTURNE_RIG,
  // WARDEN: the heavy frame's drone stands further off and is slower to bring
  // to bear, but its volley is the harder one.
  supporter: {
    name: 'WARDEN',
    followBack: 94,
    followDown: 66,
    followAccel: 0.042,
    followDamp: 0.88,
    maxSpeed: 12.5,
    turretRate: 5 * DEG,
    windup: 14,
    recover: 11,
    cooldown: 30,
    muzzleForward: 21,
    radius: 18,
  },
  // Broader frame reaches slightly further with the claw.
  meleeRange: 210,
  // Heavy three-hit siege chain: slower, longer reach, far harder per swing.
  meleeLock: {
    name: 'NOCTURNE SIEGE CLAW',
    hits: 3,
    thrust: 13,
    tracking: 0.16,
    range: 96,
    acquireRange: 430,
    energy: 110,
    hitEnergy: 20,
    lockout: 82,
    swing: 14,
    gap: 6,
    // Heavy overhead chops: a longer, higher wind-up and a shorter, blunter
    // sweep than the saber. Still a swing â€” the claw comes down through the
    // target rather than being shoved into it â€” but it reads as weight.
    arc: { windup: 96, sweep: 168, windupFrac: 0.44, alternate: true },
    damage: [62, 70, 118],
    knock: [6, 8, 16],
    finisherKnock: 20,
    finalLift: 7.8,
    maxLife: 150,
  },

  main: attack({
    ...HALCYON.main,
    id: 'main',
    label: 'AUTOCANNON',
    startup: 4,
    recovery: 6,
    damage: 46,
    energyCost: 38,
    projSpeed: 12,
  }),
  heavy: attack({
    ...HALCYON.heavy,
    id: 'heavy',
    label: 'SLUG',
    damage: 130,
    energyCost: 132,
    projSpeed: 10.2,
    projRadius: 13,
  }),
  sub: attack({
    ...HALCYON.sub,
    id: 'sub',
    label: 'HORNET',
    damage: 80,
    projCount: 2,
    homing: 0.052,
  }),
  salvo: attack({
    ...HALCYON.salvo,
    id: 'salvo',
    label: 'SWARM',
    damage: 58,
    projCount: 6,
    spreadRad: 54 * DEG,
    homing: 0.062,
  }),

  // Mirrors PALETTES['nocturne'] in tools/blender/build_mechs.py.
  tint: {
    primary: 0xd12a19,
    secondary: 0x85170f,
    accent: 0x1aebdb,
    thruster: 0xffc72e,
    glow: 0xffc72e,
  },
};

export const MECHS: Record<string, MechDef> = {
  halcyon: HALCYON,
  nocturne: NOCTURNE,
};
