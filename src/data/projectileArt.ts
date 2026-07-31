import { ProjKind } from '../combat/types';
import type { AttackDef } from '../combat/AttackData';
import type { MechDef } from '../mechs/MechDef';
import type { ProjFamilyId, ProjPattern } from '../projectiles/families';

/**
 * What every weapon on the roster looks like in flight.
 *
 * One file for all forty-eight, rather than eight fields added to each attack
 * where it is defined. Projectile identity is a *comparative* design problem —
 * the question is never "what should PYRE's main gun look like", it is "is
 * PYRE's main gun distinguishable from NULLTIDE's at a glance, mid-fight" — and
 * that question can only be answered with the whole roster on one screen. The
 * weapon numbers stay where they are; only appearance lives here.
 *
 * The rule the reference sets (`docs/PROJECTILE_STUDY_2005.md` §8) is that
 * **colour belongs to the pilot and shape belongs to the weapon**. Colour is
 * already handled — the renderer tints every shot with its owner's palette — so
 * what is chosen here is silhouette, size, motion and arrangement. Each mech
 * gets a shape *language* rather than six unrelated shapes, so a stray bullet
 * crossing the screen identifies who fired it.
 *
 * | Mech | Language |
 * | --- | --- |
 * | HALCYON | Perfect circles. Disciplined, standard-issue beam tech. |
 * | NOCTURNE | Angular darts and rings. Heavier, cruder, thrown rather than fired. |
 * | VESPER | Needles and parallel bundles. Everything is thin and very fast. |
 * | TERRAMOTH | Shells and spiked mortars. Big, slow, and it arrives late. |
 * | CIRRUS | Sparkles that weave. Small, quick and hard to track. |
 * | OBELISK | Annuli. Slow rings that hang in the air like a wall. |
 * | PYRE | Fire and plasma. Irregular, short-ranged, and it dies rather than flies. |
 * | NULLTIDE | Forked lightning and ice shards. Jittering, jagged. |
 */

/** Weapons that fire a projectile. Melee is a hit volume, not a shot. */
export type WeaponKey = 'main' | 'heavy' | 'lance' | 'spread' | 'sub' | 'salvo';

export const WEAPON_KEYS: readonly WeaponKey[] = ['main', 'heavy', 'lance', 'spread', 'sub', 'salvo'];

interface ProjArt {
  family: ProjFamilyId;
  /** Drawn size multiplier. Independent of the hitbox, which does not change. */
  scale: number;
  pattern?: ProjPattern;
  /** Lateral spacing for `bundle` and `arc`, in logical pixels. */
  gap?: number;
  /**
   * Raise the shot count for a denser volley.
   *
   * Per-shot `damage` and `guardDamage` are divided by the same ratio, so a
   * volley that fully connects deals exactly what it dealt before — six shots of
   * sixteen where there were four of twenty-four. What does change is texture:
   * partial hits are finer-grained, a guard chips in smaller steps, and a
   * piercing shot has more bodies to pass through. `projectiles.test.ts` pins
   * the resulting totals against the pre-change numbers.
   */
  count?: number;
  /** Motion overrides, where a family's default would cost a weapon its range. */
  velMul?: number;
  accel?: number;
}

const ART: Record<string, Record<WeaponKey, ProjArt>> = {
  // Standard-issue circles. The baseline every other kit reads against.
  halcyon: {
    main: { family: 'pellet', scale: 0.95 },
    heavy: { family: 'orb', scale: 1.1 },
    lance: { family: 'beam', scale: 1.0 },
    spread: { family: 'pellet', scale: 0.72 },
    sub: { family: 'rocket', scale: 0.95 },
    salvo: { family: 'rocket', scale: 0.8 },
  },

  // NOCTURNE inherits HALCYON's lance and spread by object spread in mechs.ts.
  // Giving them their own art is the first thing that has ever made the two
  // weapons distinguishable in play — see `applyProjectileArt` on the clone.
  nocturne: {
    main: { family: 'kunai', scale: 0.85 },
    heavy: { family: 'slug', scale: 1.15 },
    // Three crescents chasing each other down the same line: a shock lance
    // rather than HALCYON's clean beam, from identical frame data.
    lance: { family: 'wave', scale: 0.95 },
    spread: { family: 'ring', scale: 0.6, pattern: 'arc' },
    sub: { family: 'rocket', scale: 1.0 },
    salvo: { family: 'rocket', scale: 0.75, pattern: 'arc' },
  },

  // Thin and fast, and the flechettes fly as a parallel bundle — the arrangement
  // the reference's screenshots actually show, which we could not draw before.
  vesper: {
    main: { family: 'needle', scale: 1.0 },
    // A needle is already the longest shape in the bank at 118px; 1.55 put
    // LONGSHOT at 183px, longer than the mech firing it.
    heavy: { family: 'needle', scale: 1.25 },
    lance: { family: 'beam', scale: 1.6 },
    // Five parallel slivers rather than three: the reference draws a volley as
    // four to six streaks side by side, and FLECHETTE is the weapon on the
    // roster that most wants to be exactly that.
    spread: { family: 'shard', scale: 0.85, pattern: 'bundle', count: 5, gap: 14 },
    sub: { family: 'dart', scale: 0.85 },
    salvo: { family: 'dart', scale: 0.75 },
  },

  // Ordnance. The mortar and cluster shell are the only spiked shapes in the
  // game, so a TERRAMOTH lob is identifiable the moment it leaves the tube.
  terramoth: {
    main: { family: 'slug', scale: 0.8 },
    // Gentler than the family default: a siege mech losing a third of its
    // signature weapon's reach is a nerf disguised as an art pass.
    heavy: { family: 'mortar', scale: 1.3, velMul: 0.996 },
    lance: { family: 'beam', scale: 1.5 },
    spread: { family: 'pellet', scale: 0.8, pattern: 'arc' },
    sub: { family: 'mortar', scale: 0.9 },
    salvo: { family: 'slug', scale: 0.8, pattern: 'arc' },
  },

  // Small, weaving sparkles. The SMG already fired two rounds a shot; as a
  // bundle they finally read as twin barrels rather than a slightly wide fan.
  cirrus: {
    // Four in the bundle, two per barrel — still visibly a twin weapon, and now
    // a stream rather than a pair.
    main: { family: 'star', scale: 0.5, pattern: 'bundle', count: 4, gap: 12 },
    heavy: { family: 'pellet', scale: 1.15 },
    lance: { family: 'bolt', scale: 1.1 },
    spread: { family: 'star', scale: 0.45 },
    sub: { family: 'dart', scale: 0.7 },
    salvo: { family: 'dart', scale: 0.6 },
  },

  // Rings, fired off a bowed front so a scattergun blast arrives as a curved
  // wall. Slow and wide suits the one chassis built to hold ground.
  obelisk: {
    main: { family: 'ring', scale: 0.85 },
    heavy: { family: 'wave', scale: 1.2 },
    lance: { family: 'beam', scale: 1.35 },
    spread: { family: 'ring', scale: 0.55, pattern: 'arc' },
    sub: { family: 'mortar', scale: 1.0 },
    // A three-mine "MINEFIELD" was a thin field. Five reads as one.
    salvo: { family: 'mortar', scale: 0.85, pattern: 'arc', count: 5 },
  },

  // Fire. CINDER JET rippling out at descending speeds reads as a jet of flame
  // rather than a stream of bullets, which is what the label always promised.
  pyre: {
    main: { family: 'flame', scale: 0.8, pattern: 'ripple' },
    heavy: { family: 'plasma', scale: 1.3 },
    // PLASMA LANCE was a third plasma blob, which read as "bigger fire bomb"
    // rather than as a lance — half of PYRE's kit was the same round shape.
    lance: { family: 'beam', scale: 1.3 },
    spread: { family: 'flame', scale: 0.55 },
    sub: { family: 'plasma', scale: 1.0 },
    salvo: { family: 'flame', scale: 0.85, pattern: 'arc', count: 6 },
  },

  // Lightning and ice: the two jittering families, and the only kit that mixes
  // a hard crystalline silhouette with a soft electrical one.
  nulltide: {
    main: { family: 'bolt', scale: 0.85 },
    heavy: { family: 'shard', scale: 1.3 },
    lance: { family: 'beam', scale: 1.2 },
    spread: { family: 'bolt', scale: 0.6, pattern: 'bundle', count: 6, gap: 13 },
    sub: { family: 'shard', scale: 0.9 },
    // A "net" of four was four bolts. Six, spread wider, is a net.
    salvo: { family: 'bolt', scale: 0.7, pattern: 'bundle', count: 6, gap: 15 },
  },
};

/**
 * Applies the table to a roster, in place.
 *
 * Two things this has to be careful about.
 *
 * **It clones before it writes.** `NOCTURNE` is built as `{ ...HALCYON, … }`,
 * so the two share the *same* `lance` and `spread` objects. Assigning art to one
 * would silently change the other; replacing the object instead de-aliases them,
 * which is also what lets the two fire visibly different lances.
 *
 * **Homing ordnance keeps its own motion model.** `Projectile.step` already
 * accelerates a homing shot, and layering a family's `velMul`/`accel` on top
 * would either fight it or compound it. Missiles therefore default to coasting
 * and take a family's motion only when this table asks for it explicitly.
 */
export function applyProjectileArt(roster: MechDef[]): void {
  for (const mech of roster) {
    const kit = ART[mech.id];
    if (!kit) continue;
    for (const key of WEAPON_KEYS) {
      const art = kit[key];
      const base = mech[key];
      if (!art || !base) continue;

      const homing = base.kind === ProjKind.Missile;
      // Denser volley, same damage: dividing per-shot damage by the ratio keeps
      // a full connect worth exactly what it was worth before.
      const split = art.count ? base.projCount / art.count : 1;

      const next: AttackDef = {
        ...base,
        family: art.family,
        visualScale: art.scale,
        ...(art.pattern ? { pattern: art.pattern } : {}),
        ...(art.gap !== undefined ? { projGap: art.gap } : {}),
        ...(art.count
          ? {
              projCount: art.count,
              damage: base.damage * split,
              guardDamage: base.guardDamage * split,
            }
          : {}),
        ...(art.velMul !== undefined ? { velMul: art.velMul } : homing ? { velMul: 1 } : {}),
        ...(art.accel !== undefined ? { projAccel: art.accel } : homing ? { projAccel: 0 } : {}),
      };
      mech[key] = next;
    }
  }
}

/** Exposed for tests: the raw table, so coverage can be asserted against it. */
export const PROJECTILE_ART = ART;
