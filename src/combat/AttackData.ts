import { BarrierResponse, ProjKind } from './types';

/**
 * Frame data for one attack. Authored in ticks at 60Hz.
 *
 * The startup/active/recovery split is explicit (CLAUDE.md) and the numbers are
 * scaled from the 2005 reference's melee states (statedef 210 fired its hit at
 * tick 20 and ended at 35; the chain follow-up 211 fired at tick 12).
 */
export interface AttackDef {
  id: string;
  label: string;
  startup: number;
  active: number;
  recovery: number;

  /** Energy consumed on the first tick. */
  energyCost: number;
  /** Sub-weapon charges consumed, if any. */
  subCost?: number;

  damage: number;
  guardDamage: number;
  hitstop: number;
  hitstun: number;
  knockback: number;
  /** Saturation charge granted for using the attack. */
  satGain: number;

  /** Backward impulse applied to the attacker when it fires. */
  recoil: number;

  kind: ProjKind;
  barrier: BarrierResponse;

  /** Projectile parameters. `count` > 1 spreads over `spreadRad`. */
  projSpeed: number;
  projLife: number;
  projRadius: number;
  projCount: number;
  spreadRad: number;
  homing: number;
  pierceCount: number;

  /** Muzzle offset along the aim axis / perpendicular to it. */
  muzzleForward: number;
  muzzleLateral: number;

  /** Melee-only: forward lunge speed during startup, and chain metadata. */
  lunge?: number;
  /** Ticks (inclusive) during which a chain input is buffered. */
  chainFrom?: number;
  chainTo?: number;
  /** Melee stage index; the last stage launches. */
  meleeStage?: number;
  /** Velocity change applied to the attacker after a connecting finisher. */
  selfKnockback?: number;
}

export const ATTACK_TOTAL = (a: AttackDef): number => a.startup + a.active + a.recovery;

/** Cheap helper so definitions stay readable. */
export function attack(base: Partial<AttackDef> & Pick<AttackDef, 'id' | 'label'>): AttackDef {
  return {
    startup: 4,
    active: 1,
    recovery: 6,
    energyCost: 0,
    damage: 30,
    guardDamage: 10,
    hitstop: 5,
    hitstun: 8,
    knockback: 2,
    satGain: 0,
    recoil: 0,
    kind: ProjKind.Bullet,
    barrier: BarrierResponse.Absorb,
    projSpeed: 12,
    projLife: 70,
    projRadius: 6,
    projCount: 1,
    spreadRad: 0,
    homing: 0,
    pierceCount: 0,
    muzzleForward: 34,
    muzzleLateral: 0,
    ...base,
  } as AttackDef;
}
