/**
 * Projectile families — the shape, glow, motion and trail of a shot.
 *
 * Taken from `docs/PROJECTILE_STUDY_2005.md`. The reference does not rotate one
 * sprite for everything: it carries sixteen *families*, each a base animation
 * number, and reuses them across the roster with per-pilot colour. Sixteen is
 * the right scale for us too — eight mechs times six weapons is far too many to
 * author individually, and one texture for all of them (which is what we had)
 * is why every shot looked the same.
 *
 * Three properties carry most of the look:
 *
 * - **Everything is additive.** Nothing in the reference's projectile bank is
 *   drawn opaque; that is where the glow comes from.
 * - **A hot core inside a coloured shell.** The single most recognisable trait
 *   of both the 2005 art and the Touhou bullets the user pointed at. It cannot
 *   be done with one tinted sprite, because tint multiplies uniformly — so a
 *   shot is drawn as separate halo / shell / core layers, and only the first two
 *   take the pilot's colour.
 * - **A per-frame intensity flicker.** The reference alternates between two
 *   additive strengths on consecutive frames (`A` and `A1`), a 60 Hz shimmer
 *   that is most of why the shots read as energy rather than as sprites.
 *
 * Nothing here may import anything: `Combatant.fire` reads the motion fields to
 * build a spawn, so this file has to stay usable from the headless simulation,
 * and `combat/types.ts` imports `ProjFamilyId` from it. Keeping this module a
 * leaf is what stops that pair becoming a cycle — which is also why the
 * kind-to-family fallback lives in `AttackData.ts` rather than here.
 */

export type ProjFamilyId =
  | 'pellet'
  | 'orb'
  | 'beam'
  | 'rocket'
  | 'kunai'
  | 'ring'
  | 'needle'
  | 'slug'
  | 'mortar'
  | 'star'
  | 'flame'
  | 'bolt'
  | 'shard'
  | 'wave'
  | 'dart'
  | 'plasma';

/**
 * How a volley is arranged in space.
 *
 * The reference draws a volley as "four to six thin streaks of slightly
 * different length side by side, not one thick line" — an arrangement our single
 * angular fan could not express.
 *
 * - `line`   — even angular fan about the aim. The pre-existing behaviour.
 * - `stack`  — segments strung along the aim axis. What beams already did.
 * - `bundle` — parallel, offset across the aim, each shot slightly faster or
 *              slower than its neighbour so the group frays as it travels.
 * - `ripple` — same heading, descending speeds, so the volley strings out into
 *              a moving wall rather than arriving all at once.
 * - `arc`    — a wide fan launched off a bowed front, so the shots read as a
 *              curved wave rather than a cone from a point.
 */
export type ProjPattern = 'line' | 'stack' | 'bundle' | 'ripple' | 'arc';

export interface ProjFamilyDef {
  /** Drawn length along the heading, in logical pixels, at visual scale 1. */
  length: number;
  /** Drawn width across the heading, in logical pixels, at visual scale 1. */
  width: number;
  /**
   * Hot white core, as a fraction of the shell. 0 draws no core.
   *
   * The core is the same silhouette drawn smaller and left untinted, so it burns
   * through the pilot's colour additively — a white centre in a coloured shell.
   */
  core: number;
  /** Soft outer bloom, as a multiple of the shell's longest axis. 0 disables. */
  halo: number;
  /**
   * How the sprite is oriented.
   *
   * `velocity` points the nose along travel — the only sane choice for anything
   * with a direction. `spin` tumbles, for shapes with no nose. `upright` never
   * rotates, which is what round bullets want: rotating a circle only makes its
   * antialiasing crawl.
   */
  align: 'velocity' | 'spin' | 'upright';
  /** Radians per tick, for `spin`. */
  spin: number;
  /**
   * Additive intensity flicker, 0..1, alternating each *simulation* tick.
   *
   * Driven off the projectile's age rather than the render frame, so it stays a
   * 60 Hz shimmer regardless of display rate.
   */
  flicker: number;
  /** Chance per frame of shedding a trail puff, and how big it is. */
  trail: number;
  trailScale: number;
  /** Tint of the trail: 0 uses the pilot's colour, otherwise this literal. */
  trailTint: number;
  /**
   * Character of the muzzle flash and the impact burst.
   *
   * Sixteen bespoke burst recipes would be unmaintainable and, at the size these
   * play at, indistinguishable. Five are not: a shell cracking apart does not
   * look like a fire bomb, and neither looks like a ring collapsing. Which one a
   * family uses says what the shot is *made of*.
   *
   * - `spark`   — hot white specks thrown outward. Solid energy rounds.
   * - `ember`   — falling embers and a puff of smoke. Fire and propellant.
   * - `shatter` — angular debris. Crystal, ice, cased ordnance.
   * - `pulse`   — expanding rings. Beams and anything annular.
   * - `arc`     — jittering streaks at hard angles. Electricity.
   */
  burst: 'spark' | 'ember' | 'shatter' | 'pulse' | 'arc';

  // ---- motion -------------------------------------------------------------

  /**
   * Per-tick speed multiplier. 1 coasts.
   *
   * The reference runs 0.945 here, which over our projectile lifetimes would
   * bring a shot almost to a halt and gut the weapon's range. These are gentler,
   * and the speed clamp below stops any of them from stalling outright —
   * `projectiles.test.ts` asserts every weapon still covers most of the distance
   * it used to.
   */
  velMul: number;
  /** Per-tick speed added along the heading, as a fraction of launch speed. */
  accel: number;
  /**
   * Peak weave off the aim line, in radians.
   *
   * Applied as the derivative of a sinusoid, so the heading is exactly
   * `aim + swerve * sin(t)` — the shot oscillates about its aim line and never
   * drifts off it. A weave that accumulated would make these weapons impossible
   * to lead with and impossible for the AI to read.
   */
  swerve: number;
  /** Ticks per weave cycle. */
  swervePeriod: number;
}

/** Speed may never fall below this fraction of launch speed, nor rise above. */
export const PROJ_SPEED_MIN = 0.35;
export const PROJ_SPEED_MAX = 2.4;

const family = (
  id: ProjFamilyId,
  d: Partial<ProjFamilyDef> & Pick<ProjFamilyDef, 'length' | 'width'>,
): [ProjFamilyId, ProjFamilyDef] => [
  id,
  {
    core: 0.45,
    halo: 1.5,
    align: 'velocity',
    spin: 0,
    flicker: 0.18,
    trail: 0.25,
    trailScale: 0.22,
    trailTint: 0,
    burst: 'spark',
    velMul: 1,
    accel: 0,
    swerve: 0,
    swervePeriod: 24,
    ...d,
  },
];

/**
 * The bank. Sixteen shapes covering every weapon on the roster.
 *
 * Grouped by what they are made of rather than by which mech uses them, because
 * they are shared: OBELISK and NOCTURNE both fire rings, in their own colours,
 * exactly as the reference reused a family across characters.
 */
export const PROJ_FAMILIES: Record<ProjFamilyId, ProjFamilyDef> = Object.fromEntries([
  // ---- clean energy -------------------------------------------------------
  /** The plain round bullet. Hard white centre, tight coloured rim. */
  family('pellet', { length: 26, width: 26, core: 0.46, halo: 1.9, align: 'upright', flicker: 0.16 }),
  /** A heavier sphere of the same construction. */
  family('orb', { length: 46, width: 46, core: 0.42, halo: 2.1, align: 'upright', velMul: 0.995, trail: 0.4, trailScale: 0.3 }),
  /** Hard-edged lance segment. Stacked end to end it reads as one long beam. */
  family('beam', { length: 96, width: 22, core: 0.34, halo: 1.35, flicker: 0.24, trail: 0.5, trailScale: 0.26, burst: 'pulse' }),
  /** Soft irregular blob with a very hot middle. */
  family('plasma', { length: 40, width: 34, core: 0.5, halo: 2.3, align: 'spin', spin: 0.04, velMul: 0.994, swerve: 0.04, swervePeriod: 30, trail: 0.45, trailScale: 0.3, burst: 'ember' }),

  // ---- thin and fast ------------------------------------------------------
  /** Hairline rail shot: near-white, very long, still building speed. */
  family('needle', { length: 118, width: 7, core: 0.3, halo: 1.1, flicker: 0.1, accel: 0.004, trail: 0.55, trailScale: 0.14 }),
  /** Elongated crystal sliver. */
  family('shard', { length: 74, width: 18, core: 0.4, halo: 1.3, velMul: 0.996, trail: 0.35, trailScale: 0.18, burst: 'shatter' }),
  /** Small thin arrow, for light sub-munitions. */
  family('dart', { length: 48, width: 15, core: 0.38, halo: 1.4, accel: 0.004, trail: 0.3, trailScale: 0.16 }),
  /** Angular thrown dart. Bleeds speed the way a thrown thing does. */
  family('kunai', { length: 62, width: 24, core: 0.4, halo: 1.4, velMul: 0.992, trail: 0.3, trailScale: 0.2, burst: 'shatter' }),

  // ---- big and slow -------------------------------------------------------
  /** Fat blunt-nosed shell. */
  family('slug', { length: 66, width: 40, core: 0.44, halo: 1.8, velMul: 0.993, trail: 0.45, trailScale: 0.34, burst: 'shatter' }),
  /** Spiked orb, lobbed and slowing hard. */
  family('mortar', { length: 56, width: 56, core: 0.38, halo: 1.9, align: 'spin', spin: 0.055, velMul: 0.994, trail: 0.4, trailScale: 0.32, burst: 'shatter' }),
  /** Bright annulus with a dark centre. Hangs in the air. */
  family('ring', { length: 52, width: 52, core: 0.62, halo: 1.7, align: 'spin', spin: -0.03, velMul: 0.992, flicker: 0.22, trail: 0.28, trailScale: 0.26, burst: 'pulse' }),
  /** Crescent wave front, opening away from travel. */
  family('wave', { length: 44, width: 76, core: 0.5, halo: 1.5, velMul: 0.993, flicker: 0.2, trail: 0.3, trailScale: 0.28, burst: 'pulse' }),

  // ---- ordnance and elements ---------------------------------------------
  /** Missile body with fins. The one family that reads as a solid object. */
  family('rocket', { length: 54, width: 22, core: 0.3, halo: 1.25, flicker: 0.08, trail: 0.85, trailScale: 0.34, trailTint: 0xffb066, burst: 'ember' }),
  /**
   * Fire tongue. Short-lived, licking, and it dies rather than flies.
   *
   * Points along travel rather than tumbling: once the shape has a rounded head
   * and a tapering tail it has a direction, and spinning it looks like debris.
   * The lick comes from the weave instead.
   */
  family('flame', { length: 64, width: 30, core: 0.5, halo: 2.2, velMul: 0.99, swerve: 0.07, swervePeriod: 16, flicker: 0.3, trail: 0.9, trailScale: 0.36, trailTint: 0xff7a2a, burst: 'ember' }),
  /** Jagged electric bolt. Snaps forward and jitters as it goes. */
  family('bolt', { length: 78, width: 30, core: 0.44, halo: 1.5, accel: 0.012, swerve: 0.1, swervePeriod: 9, flicker: 0.42, trail: 0.5, trailScale: 0.2, trailTint: 0xbfe6ff, burst: 'arc' }),
  /** Four-point sparkle. Weaves, and never points anywhere. */
  family('star', { length: 40, width: 40, core: 0.44, halo: 1.9, align: 'spin', spin: 0.07, swerve: 0.12, swervePeriod: 26, flicker: 0.26, trail: 0.4, trailScale: 0.2 }),
]) as Record<ProjFamilyId, ProjFamilyDef>;

export const PROJ_FAMILY_IDS = Object.keys(PROJ_FAMILIES) as ProjFamilyId[];
