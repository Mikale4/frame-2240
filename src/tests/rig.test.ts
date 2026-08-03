import { describe, expect, it } from 'vitest';
import {
  HEAD_TRACKING,
  buildTurretInheritance,
  partLocalRotation,
  type RigPose,
} from '../render/RigRotation';
import { MECHS } from '../data/mechs';
import type { RigPart } from '../mechs/MechDef';
import { DEG } from '../core/MathUtil';

/**
 * Container rotations compound down the rig tree, so the accumulated world
 * rotation of a part is the sum of its own and every ancestor's local rotation.
 */
function worldRotation(
  parts: readonly RigPart[],
  name: string,
  pose: RigPose,
): number {
  const byName = new Map(parts.map((p) => [p.name, p]));
  const inherits = buildTurretInheritance(parts);
  let total = 0;
  for (let p = byName.get(name); p; p = p.parent ? byName.get(p.parent) : undefined) {
    total += partLocalRotation(p, inherits.get(p.name) ?? false, pose);
  }
  return total;
}

const restPose: RigPose = {
  turretRot: 0,
  spin: 0,
  reach: 0,
  thrust: 0,
  meleeing: false,
  walkPhase: 0,
  stride: 0,
  legNear: 0,
  legFar: 0,
};
const pose = (over: Partial<RigPose>): RigPose => ({ ...restPose, ...over });

describe('rig turret inheritance', () => {
  it('flags weapons hung off an arm, not the arms themselves', () => {
    for (const id of Object.keys(MECHS)) {
      const inherits = buildTurretInheritance(MECHS[id].rig.parts);
      expect(inherits.get('rightArm'), `${id} rightArm`).toBe(false);
      expect(inherits.get('leftArm'), `${id} leftArm`).toBe(false);
      expect(inherits.get('head'), `${id} head`).toBe(false);
      expect(inherits.get('mainWeapon'), `${id} mainWeapon`).toBe(true);
      expect(inherits.get('subWeapon'), `${id} subWeapon`).toBe(true);
      expect(inherits.get('meleeWeapon'), `${id} meleeWeapon`).toBe(true);
    }
  });

  it('walks the whole parent chain, not just the immediate parent', () => {
    const parts: RigPart[] = [
      { name: 'core', parent: null, x: 0, y: 0, rotation: 0, follow: 'chassis' },
      { name: 'arm', parent: 'core', x: 0, y: 0, rotation: 0, follow: 'turret' },
      { name: 'mount', parent: 'arm', x: 0, y: 0, rotation: 0, follow: 'chassis' },
      { name: 'gun', parent: 'mount', x: 0, y: 0, rotation: 0, follow: 'turret' },
    ];
    const inherits = buildTurretInheritance(parts);
    expect(inherits.get('arm')).toBe(false);
    expect(inherits.get('gun')).toBe(true);
  });

  it('terminates on a cyclic rig instead of hanging', () => {
    const parts: RigPart[] = [
      { name: 'a', parent: 'b', x: 0, y: 0, rotation: 0, follow: 'turret' },
      { name: 'b', parent: 'a', x: 0, y: 0, rotation: 0, follow: 'chassis' },
    ];
    expect(() => buildTurretInheritance(parts)).not.toThrow();
  });
});

describe('rig aim rotation', () => {
  /**
   * The regression this guards: every turret part used to add the aim itself,
   * so a weapon parented to an arm rotated twice. Aiming 60deg up drew the
   * rifle and beam saber at 120deg — back through the mech.
   */
  it('points an arm-held weapon exactly along the aim', () => {
    for (const id of Object.keys(MECHS)) {
      const parts = MECHS[id].rig.parts;
      for (const deg of [-90, -60, -30, 0, 45, 90]) {
        const p = pose({ turretRot: deg * DEG });
        for (const part of ['rightArm', 'mainWeapon', 'meleeWeapon', 'subWeapon']) {
          expect(worldRotation(parts, part, p), `${id} ${part} @ ${deg}deg`).toBeCloseTo(
            deg * DEG,
            6,
          );
        }
      }
    }
  });

  it('tracks the head only partway, and never doubles it', () => {
    const parts = MECHS.halcyon.rig.parts;
    const p = pose({ turretRot: 60 * DEG });
    expect(worldRotation(parts, 'head', p)).toBeCloseTo(60 * DEG * HEAD_TRACKING, 6);
  });

  it('leaves chassis parts on the bank alone', () => {
    const parts = MECHS.halcyon.rig.parts;
    const p = pose({ turretRot: 60 * DEG });
    for (const part of ['core', 'backpack', 'lowerBody']) {
      expect(worldRotation(parts, part, p), part).toBeCloseTo(0, 6);
    }
  });

  it('applies the melee spin once, at the arm', () => {
    const parts = MECHS.halcyon.rig.parts;
    const p = pose({ turretRot: 10 * DEG, spin: 40 * DEG, meleeing: true });
    const expected = (10 + 40) * DEG;
    expect(worldRotation(parts, 'rightArm', p)).toBeCloseTo(expected, 6);
    expect(worldRotation(parts, 'meleeWeapon', p)).toBeCloseTo(expected, 6);
  });

  it('does not spin the head with the sword', () => {
    const parts = MECHS.halcyon.rig.parts;
    const p = pose({ turretRot: 0, spin: 40 * DEG, meleeing: true });
    expect(worldRotation(parts, 'head', p)).toBeCloseTo(0, 6);
  });

  it('honours a part\'s own authored offset on top of the aim', () => {
    const parts: RigPart[] = [
      { name: 'core', parent: null, x: 0, y: 0, rotation: 0, follow: 'chassis' },
      { name: 'arm', parent: 'core', x: 0, y: 0, rotation: 0, follow: 'turret' },
      { name: 'gun', parent: 'arm', x: 0, y: 0, rotation: 12, follow: 'turret' },
    ];
    const p = pose({ turretRot: 30 * DEG });
    expect(worldRotation(parts, 'gun', p)).toBeCloseTo((30 + 12) * DEG, 6);
  });

  it('splays thrusters against load without inheriting the aim twice', () => {
    const parts = MECHS.halcyon.rig.parts;
    const p = pose({ turretRot: 45 * DEG, thrust: 1 });
    const left = worldRotation(parts, 'leftThruster', p);
    const right = worldRotation(parts, 'rightThruster', p);
    // Equal and opposite splay around the shared aim-gimbal term.
    const gimbal = -45 * DEG * 0.12;
    expect(left).toBeCloseTo(gimbal - 9 * DEG, 6);
    expect(right).toBeCloseTo(gimbal + 9 * DEG, 6);
  });
});
