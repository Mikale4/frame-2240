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
  parts: [
    { name: 'core', parent: null, x: 0, y: 0, rotation: 0, follow: 'chassis' },
    { name: 'head', parent: 'core', x: 21, y: -7, rotation: 0, follow: 'turret' },
    { name: 'backpack', parent: 'core', x: -26, y: -18, rotation: 0, follow: 'chassis' },
    { name: 'lowerBody', parent: 'core', x: -8, y: 26, rotation: 0, follow: 'chassis' },
    { name: 'leftArm', parent: 'core', x: -2, y: -2, rotation: 0, follow: 'turret' },
    { name: 'subWeapon', parent: 'leftArm', x: -3, y: -23, rotation: 0, follow: 'turret' },
    { name: 'rightArm', parent: 'core', x: 16, y: 6, rotation: 0, follow: 'turret' },
    { name: 'mainWeapon', parent: 'rightArm', x: 38, y: 8, rotation: 0, follow: 'turret' },
    { name: 'leftThruster', parent: 'core', x: -36, y: 0, rotation: 0, follow: 'thruster' },
    { name: 'rightThruster', parent: 'core', x: -32, y: 12, rotation: 0, follow: 'thruster' },
  ],
  drawOrder: [
    'backpack',
    'leftThruster',
    'leftArm',
    'subWeapon',
    'lowerBody',
    'core',
    'head',
    'rightThruster',
    'rightArm',
    'mainWeapon',
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
  parts: [
    { name: 'core', parent: null, x: 0, y: 0, rotation: 0, follow: 'chassis' },
    { name: 'head', parent: 'core', x: 23, y: -2, rotation: 0, follow: 'turret' },
    { name: 'backpack', parent: 'core', x: -30, y: -14, rotation: 0, follow: 'chassis' },
    { name: 'lowerBody', parent: 'core', x: -10, y: 24, rotation: 0, follow: 'chassis' },
    { name: 'leftArm', parent: 'core', x: -4, y: 0, rotation: 0, follow: 'turret' },
    { name: 'subWeapon', parent: 'leftArm', x: -6, y: -26, rotation: 0, follow: 'turret' },
    { name: 'rightArm', parent: 'core', x: 18, y: 10, rotation: 0, follow: 'turret' },
    { name: 'mainWeapon', parent: 'rightArm', x: 40, y: 6, rotation: 0, follow: 'turret' },
    { name: 'leftThruster', parent: 'core', x: -40, y: 4, rotation: 0, follow: 'thruster' },
    { name: 'rightThruster', parent: 'core', x: -34, y: 16, rotation: 0, follow: 'thruster' },
  ],
  drawOrder: [
    'backpack',
    'leftThruster',
    'leftArm',
    'subWeapon',
    'lowerBody',
    'core',
    'head',
    'rightThruster',
    'rightArm',
    'mainWeapon',
  ],
};

const HALCYON_FLIGHT: FlightDef = {
  accel: 0.62,
  maxSpeed: 5.2,
  coastDrag: 0.955,
  brakeDrag: 0.84,
  boostAccel: 0.95,
  boostMaxSpeed: 9.0,
  maxBoost: 100,
  boostDrain: 0.55,
  boostRegen: 0.78,
  boostRegenDelay: 22,
  dashSpeed: 16,
  dashTicks: 10,
  dashCost: 22,
  dashCooldown: 16,
  bankRate: 6 * DEG,
  bankMax: 26 * DEG,
  turretRate: 13 * DEG,
};

const NOCTURNE_FLIGHT: FlightDef = {
  ...HALCYON_FLIGHT,
  accel: 0.55,
  maxSpeed: 4.7,
  boostAccel: 0.86,
  boostMaxSpeed: 8.2,
  dashSpeed: 14.5,
  bankMax: 22 * DEG,
  turretRate: 11 * DEG,
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
   * connected — the reference gated its follow-up on a hit-confirm variable.
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

  subCharges: 2,
  subRechargeTicks: 150,
  lockCone: 75 * DEG,
  lockRange: 900,
  // ~2x the chassis height. The 11-tick startup lunges ~81px and the arc itself
  // reaches 40px, so a swing started here closes and connects.
  meleeRange: 200,
  tint: { primary: 0x9fd8ef, secondary: 0x2c4a63, accent: 0xffd166, thruster: 0x74d6ff },
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
  rig: NOCTURNE_RIG,
  // Broader frame reaches slightly further with the claw.
  meleeRange: 210,

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

  tint: { primary: 0xe2809b, secondary: 0x3a1f33, accent: 0xffe08a, thruster: 0xff7ad9 },
};

export const MECHS: Record<string, MechDef> = {
  halcyon: HALCYON,
  nocturne: NOCTURNE,
};
