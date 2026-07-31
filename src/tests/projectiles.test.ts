import { describe, expect, it } from 'vitest';
import { Combatant } from '../combat/Combatant';
import { Projectile } from '../projectiles/Projectile';
import {
  PROJ_FAMILIES,
  PROJ_FAMILY_IDS,
  PROJ_SPEED_MAX,
  PROJ_SPEED_MIN,
  type ProjFamilyId,
} from '../projectiles/families';
import { ATTACK_TOTAL, defaultFamily } from '../combat/AttackData';
import { PROJECTILE_ART, WEAPON_KEYS } from '../data/projectileArt';
import { HALCYON, NOCTURNE, ROSTER } from '../data/mechs';
import { BarrierResponse, ProjKind, Team, emptyInput, type ProjectileSpawn, type SimEvent } from '../combat/types';
import type { AttackDef } from '../combat/AttackData';
import type { MechDef } from '../mechs/MechDef';

/**
 * Per-mech projectile art and motion.
 *
 * The art itself cannot be asserted — whether a needle reads as a needle is a
 * question for eyes. What *can* be asserted is everything around it that breaks
 * silently: a family that no weapon uses, a weapon with no family, two mechs
 * that ended up firing the same six shapes, and above all a motion curve that
 * quietly halves a weapon's range while looking like a cosmetic change.
 */

const W = 2400;
const H = 1200;

/**
 * Fires one attack from a real combatant and returns everything it spawned.
 *
 * This reaches through to `begin`, which is private. The alternative is to drive
 * each weapon through its own button or command motion, which would make these
 * tests fail whenever the *input* layer changed — and they are about what leaves
 * the barrel, not about how it was asked for. `commands.test.ts` owns that.
 */
function fireAttack(def: MechDef, a: AttackDef): ProjectileSpawn[] {
  const c = new Combatant({ id: 0, team: Team.Player, def, x: 600, y: 600, facing: 1 });
  const spawns: ProjectileSpawn[] = [];
  const events: SimEvent[] = [];

  // Pay for anything, so an energy or charge gate cannot make a test that
  // asserts on `spawns` silently assert on an empty array.
  c.energy = 1e6;
  c.subCharges = 99;

  (c as unknown as { begin(x: AttackDef): void }).begin(a);
  for (let i = 0; i <= ATTACK_TOTAL(a) && spawns.length === 0; i++) {
    c.step(emptyInput(), null, W, H, spawns, events);
  }
  return spawns;
}

const fireOnce = (def: MechDef, key: (typeof WEAPON_KEYS)[number]): ProjectileSpawn[] =>
  fireAttack(def, def[key]);

/** Runs a spawn to the end of its life and reports how it moved. */
function flight(s: ProjectileSpawn): {
  distance: number;
  minSpeed: number;
  maxSpeed: number;
  maxLateral: number;
} {
  const p = new Projectile();
  p.reset(s);
  const launch = Math.hypot(s.vx, s.vy);
  const aim = Math.atan2(s.vy, s.vx);
  const x0 = s.x;
  const y0 = s.y;

  let distance = 0;
  let minSpeed = launch;
  let maxSpeed = launch;
  let maxLateral = 0;

  while (p.active) {
    const px = p.x;
    const py = p.y;
    p.step(null, null);
    distance += Math.hypot(p.x - px, p.y - py);
    const sp = Math.hypot(p.vx, p.vy);
    minSpeed = Math.min(minSpeed, sp);
    maxSpeed = Math.max(maxSpeed, sp);
    // Perpendicular distance from the line the shot was aimed down.
    const dx = p.x - x0;
    const dy = p.y - y0;
    maxLateral = Math.max(maxLateral, Math.abs(-Math.sin(aim) * dx + Math.cos(aim) * dy));
  }
  return { distance, minSpeed, maxSpeed, maxLateral };
}

const everyWeapon = (): { mech: MechDef; key: (typeof WEAPON_KEYS)[number]; a: AttackDef }[] =>
  ROSTER.flatMap((mech) => WEAPON_KEYS.map((key) => ({ mech, key, a: mech[key] })));

describe('the projectile family bank', () => {
  it('describes every family with usable numbers', () => {
    for (const id of PROJ_FAMILY_IDS) {
      const f = PROJ_FAMILIES[id];
      expect(f.length, `${id} length`).toBeGreaterThan(0);
      expect(f.width, `${id} width`).toBeGreaterThan(0);
      expect(f.core, `${id} core`).toBeGreaterThanOrEqual(0);
      expect(f.core, `${id} core`).toBeLessThan(1);
      expect(f.halo, `${id} halo`).toBeGreaterThan(0);
      expect(f.flicker, `${id} flicker`).toBeGreaterThanOrEqual(0);
      // A full-depth flicker would strobe a shot out of existence every other
      // frame, which is a seizure risk long before it is a style.
      expect(f.flicker, `${id} flicker`).toBeLessThanOrEqual(0.5);
      expect(f.swervePeriod, `${id} swervePeriod`).toBeGreaterThan(0);
      expect(f.velMul, `${id} velMul`).toBeGreaterThan(0.9);
      expect(f.velMul, `${id} velMul`).toBeLessThanOrEqual(1);
    }
  });

  it('leaves no family unused and no weapon without one', () => {
    const used = new Set<ProjFamilyId>();
    for (const { mech, key, a } of everyWeapon()) {
      const fam = a.family;
      expect(fam, `${mech.id}.${key} has no family`).toBeTruthy();
      expect(PROJ_FAMILIES[fam!], `${mech.id}.${key} names a family that does not exist`).toBeTruthy();
      used.add(fam!);
    }
    // Dead art is worse than no art: it looks finished and is never seen.
    const unused = PROJ_FAMILY_IDS.filter((id) => !used.has(id));
    expect(unused, `families drawn but never fired: ${unused.join(', ')}`).toHaveLength(0);
  });

  it('falls back to a real family for an attack that declares none', () => {
    for (const kind of [ProjKind.Bullet, ProjKind.Heavy, ProjKind.Beam, ProjKind.Missile, ProjKind.Melee]) {
      expect(PROJ_FAMILIES[defaultFamily(kind)]).toBeTruthy();
    }
  });
});

describe('every mech looks like itself', () => {
  it('covers the whole roster', () => {
    for (const m of ROSTER) {
      expect(PROJECTILE_ART[m.id], `${m.id} has no projectile art`).toBeTruthy();
    }
  });

  it('gives no two mechs the same six shapes', () => {
    const seen = new Map<string, string>();
    for (const m of ROSTER) {
      const key = WEAPON_KEYS.map((k) => m[k].family).join('/');
      const prev = seen.get(key);
      expect(prev, `${m.id} fires exactly what ${prev} fires`).toBeUndefined();
      seen.set(key, m.id);
    }
  });

  it('de-aliases the weapons NOCTURNE inherits from HALCYON', () => {
    // NOCTURNE is built as `{ ...HALCYON }`, so before the art pass its lance
    // and spread were the *same objects* as HALCYON's. Writing art through one
    // would have changed both; this is the guard on that.
    expect(NOCTURNE.lance).not.toBe(HALCYON.lance);
    expect(NOCTURNE.spread).not.toBe(HALCYON.spread);
    expect(NOCTURNE.lance.family).not.toBe(HALCYON.lance.family);
    expect(NOCTURNE.spread.family).not.toBe(HALCYON.spread.family);
    // ...and they still hit for what they always hit for.
    expect(NOCTURNE.lance.damage).toBe(HALCYON.lance.damage);
    expect(NOCTURNE.spread.projCount).toBe(HALCYON.spread.projCount);
  });

  it('gives all eight lances the same relationship to a guard', () => {
    // HALCYON's and NOCTURNE's were the only two that did not pierce, purely
    // because they predate the flag. A lance is the roster's answer to turtling
    // and it has to mean that on every chassis.
    for (const m of ROSTER) {
      expect(m.lance.barrier, `${m.id} lance does not pierce`).toBe(BarrierResponse.Pierce);
    }
  });

  it('draws a shot bigger than the box that actually hits', () => {
    // The reference draws a 6x6 hitbox as a shot many times that size, and
    // deliberately decouples the two. Ours used to size sprites off `projRadius`,
    // which is why every weapon looked like a scaled copy of every other.
    for (const { mech, key, a } of everyWeapon()) {
      const f = PROJ_FAMILIES[a.family!];
      const drawn = Math.max(f.length, f.width) * (a.visualScale ?? 1);
      expect(drawn, `${mech.id}.${key} is drawn smaller than its hitbox`).toBeGreaterThan(a.projRadius * 2);
    }
  });
});

describe('family motion', () => {
  it('never costs a weapon its range', () => {
    // A projectile that decelerates looks great and silently halves a mech's
    // effective reach. Nominal is the old constant-velocity distance.
    for (const { mech, key } of everyWeapon()) {
      for (const s of fireOnce(mech, key)) {
        const nominal = Math.hypot(s.vx, s.vy) * s.life;
        const { distance } = flight(s);
        expect(distance / nominal, `${mech.id}.${key} travels too little`).toBeGreaterThan(0.7);
        expect(distance / nominal, `${mech.id}.${key} travels too far`).toBeLessThan(1.5);
      }
    }
  });

  it('holds every shot inside its speed clamps', () => {
    for (const { mech, key } of everyWeapon()) {
      for (const s of fireOnce(mech, key)) {
        const launch = Math.hypot(s.vx, s.vy);
        const { minSpeed, maxSpeed } = flight(s);
        expect(minSpeed, `${mech.id}.${key} stalled`).toBeGreaterThanOrEqual(launch * PROJ_SPEED_MIN - 1e-6);
        expect(maxSpeed, `${mech.id}.${key} ran away`).toBeLessThanOrEqual(launch * PROJ_SPEED_MAX + 1e-6);
      }
    }
  });

  it('weaves about the aim line without drifting off it', () => {
    // The weave is the derivative of a sinusoid, so heading stays bounded and
    // the shot oscillates around where it was pointed. If this ever integrated
    // instead, weaving weapons would curve away and be impossible to lead.
    const s: ProjectileSpawn = {
      x: 0, y: 0, vx: 10, vy: 0,
      damage: 0, guardDamage: 0, life: 240, radius: 4,
      ownerId: 0, team: Team.Player, kind: ProjKind.Bullet, barrier: 0,
      hitstop: 0, hitstun: 0, knockback: 0, homing: 0, pierceCount: 0,
      family: 'star', swerve: 0.12, swervePeriod: 26,
    };
    const { maxLateral, distance } = flight(s);
    // A ±0.12 rad weave over a 26-tick period displaces by roughly
    // speed * swerve / angular-frequency — tens of pixels, not hundreds.
    expect(maxLateral).toBeLessThan(60);
    expect(distance).toBeGreaterThan(2000);
  });

  it('leaves homing ordnance on the motion model it already had', () => {
    // `Projectile.step` accelerates a homing shot. A family velMul/accel on top
    // would fight or compound it, so missiles coast unless asked otherwise.
    for (const { mech, key, a } of everyWeapon()) {
      if (a.kind !== ProjKind.Missile) continue;
      expect(a.velMul ?? 1, `${mech.id}.${key} velMul`).toBe(1);
      expect(a.projAccel ?? 0, `${mech.id}.${key} accel`).toBe(0);
    }
  });
});

describe('volley patterns', () => {
  const spawnsFor = (a: AttackDef, def: MechDef): ProjectileSpawn[] => fireAttack(def, a);

  it('fires exactly the declared number of shots, whatever the pattern', () => {
    // Patterns rearrange a volley; they must never quietly add or drop damage.
    for (const { mech, key, a } of everyWeapon()) {
      expect(spawnsFor(a, mech), `${mech.id}.${key} count`).toHaveLength(a.projCount);
    }
  });

  /**
   * Full-connect damage for the six weapons whose shot count was raised for a
   * denser volley, as it stood *before* the change.
   *
   * This is the guard on the whole "more shots, same damage" claim. Raising a
   * count without dividing the per-shot damage is a silent, roster-wide buff
   * that no other test would catch — every weapon would still be internally
   * consistent and the match would just get faster.
   */
  const PRE_CHANGE_TOTALS: Record<string, number> = {
    'vesper.spread': 30 * 3,
    'cirrus.main': 26 * 2,
    'obelisk.salvo': 46 * 3,
    'pyre.salvo': 34 * 4,
    'nulltide.spread': 20 * 4,
    'nulltide.salvo': 24 * 4,
  };

  it('holds a volley worth the same after making it denser', () => {
    for (const [id, total] of Object.entries(PRE_CHANGE_TOTALS)) {
      const [mechId, key] = id.split('.') as [string, (typeof WEAPON_KEYS)[number]];
      const mech = ROSTER.find((m) => m.id === mechId)!;
      const a = mech[key];
      expect(a.damage * a.projCount, `${id} full-connect damage`).toBeCloseTo(total, 6);
      // ...and the volley genuinely did get denser.
      expect(a.projCount, `${id} count`).toBeGreaterThanOrEqual(4);
    }
  });

  it('lays a bundle out side by side on parallel headings', () => {
    const a = { ...HALCYON.main, projCount: 5, spreadRad: 0, pattern: 'bundle' as const, projGap: 12 };
    const s = spawnsFor(a, HALCYON);
    const headings = s.map((p) => Math.atan2(p.vy, p.vx));
    // Parallel: a bundle spreads across the aim, not around it.
    for (const h of headings) expect(h).toBeCloseTo(headings[0], 6);
    // And genuinely offset from each other.
    const ys = s.map((p) => p.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(40);
    // Each shot slightly faster or slower than its neighbour, so the group frays.
    const speeds = s.map((p) => Math.hypot(p.vx, p.vy));
    expect(new Set(speeds.map((v) => v.toFixed(4))).size).toBe(5);
  });

  it('strings a ripple out by speed alone', () => {
    const a = { ...HALCYON.main, projCount: 4, spreadRad: 0, pattern: 'ripple' as const };
    const s = spawnsFor(a, HALCYON);
    const speeds = s.map((p) => Math.hypot(p.vx, p.vy));
    for (let i = 1; i < speeds.length; i++) expect(speeds[i]).toBeLessThan(speeds[i - 1]);
    // Same launch point and the same heading — only the speed differs.
    for (const p of s) {
      expect(p.x).toBeCloseTo(s[0].x, 6);
      expect(p.y).toBeCloseTo(s[0].y, 6);
    }
  });

  it('bows an arc back at its edges', () => {
    const a = { ...HALCYON.spread, projCount: 5, pattern: 'arc' as const, projGap: 14 };
    const s = spawnsFor(a, HALCYON);
    // Facing +x, so "further back" is a smaller x. The middle shot leads.
    const mid = s[2].x;
    expect(s[0].x).toBeLessThan(mid);
    expect(s[4].x).toBeLessThan(mid);
    // And it still fans: an arc spreads in angle as well as in position.
    const headings = s.map((p) => Math.atan2(p.vy, p.vx));
    expect(headings[4] - headings[0]).toBeGreaterThan(0.05);
  });

  it('keeps beams stacked along the aim, as they always were', () => {
    const s = spawnsFor(HALCYON.lance, HALCYON);
    expect(s.length).toBe(HALCYON.lance.projCount);
    const headings = s.map((p) => Math.atan2(p.vy, p.vx));
    for (const h of headings) expect(h).toBeCloseTo(headings[0], 6);
    // Strung out along the firing axis rather than across it.
    for (let i = 1; i < s.length; i++) expect(s[i].x).toBeGreaterThan(s[i - 1].x);
  });
});
