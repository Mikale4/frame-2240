import { SatMode } from '../combat/types';

/**
 * Per-pilot playstyle, layered on top of the difficulty tier.
 *
 * `AI_PROFILES` answers *how good* a rival is. This answers *who it is*. The two
 * are deliberately separate axes: an EASY CIRRUS and an EXTREME CIRRUS should
 * both fight like Mira Holloway — reckless, close, always moving — and differ
 * only in how well they pull it off. Folding personality into the tier table
 * would have meant eight times as many profiles and no way to say "the same
 * pilot, better".
 *
 * **Everything here is a multiplier or a small bias, never an override.** The
 * tier still decides which *behaviours* are unlocked (`threatSolver`,
 * `closeOnGuard`, and so on); a playstyle only leans on the ones already
 * available. That is what keeps the difficulty ladder intact — the ladder test
 * fights identical machines, so any symmetric lean cancels — and it is why a
 * reckless EASY pilot cannot accidentally out-fight a cautious HARD one.
 *
 * Each entry is derived from three things that already exist and must keep
 * agreeing with them: the chassis stats in `data/mechs.ts`, the weapon kit, and
 * the pilot characterisation in `docs/PILOT_PORTRAIT_SPEC.md`. A playstyle that
 * contradicts its own machine reads as a bug rather than as a personality.
 */
export interface Playstyle {
  /** Mech id this belongs to. */
  mech: string;
  /** Why these numbers are these numbers. Not used at runtime. */
  note: string;

  /**
   * Multiplier on the tier's `aggression`.
   *
   * Above 1 is not free. Firing anchors movement, which is why EXTREME's base
   * aggression is *lower* than HARD's — so a reckless pilot is trading real
   * safety for pressure, exactly as their characterisation says they would.
   */
  aggressionMul: number;
  /** Multiplier on the distance the rival tries to hold. */
  rangeMul: number;
  /**
   * Added to the per-swing chance of committing to melee once inside reach.
   *
   * Clamped at the call site. This is where a long combo string earns its
   * keep — a pilot whose chain is six hits should be looking for it.
   */
  meleeAppetite: number;
  /** Multiplier on both dash chances — how twitchy the movement reads. */
  dashMul: number;
  /** Multiplier on `barrierChance`. Turtles guard; skirmishers dodge. */
  guardMul: number;
  /**
   * Saturation mode this pilot reaches for when nothing overrides it.
   *
   * The survival override (drop to SHIELD when badly hurt) still applies to
   * everyone — no characterisation is worth losing a match over — but which mode
   * a pilot *prefers* is one of the most legible personality tells in the game.
   */
  satPreference: SatMode;
  /** How this pilot's escort supports them. See `DroneDoctrine`. */
  droneDoctrine: DroneDoctrine;
  /**
   * Dashes clear after landing a melee chain instead of standing in the counter.
   *
   * Mira Holloway has the roster's longest chain and its thinnest margins —
   * eight hits on 1440 hit points — so the exchange after her turn is the one
   * she cannot afford. She has the fastest frame and double boost regen; this
   * is what they are for.
   */
  hitAndRun: boolean;
}

/**
 * What the drone is *for*, in this pilot's hands.
 *
 * The drone is permanently deployed and flies itself, so its standing orders are
 * the one remaining way its owner's plan shows up in where it goes.
 */
export type DroneDoctrine =
  /** Balanced: hold formation, lean toward a firing line when it is safe. */
  | 'escort'
  /**
   * Get in the target's face and stay there, drawing attention and fire.
   *
   * The point is not that the drone wins that exchange — it is that every shot
   * spent on the drone is one not spent on a pilot who needs to stand still.
   */
  | 'screen'
  /** Work an angle off the target's axis, away from where the owner is. */
  | 'flank'
  /** Stay tight, stay alive, keep the passive up. */
  | 'shadow';

/**
 * The roster's playstyles.
 *
 * Read this table as a whole rather than a row at a time — the values only mean
 * anything relative to each other, and the spread is the point.
 */
export const PLAYSTYLES: Record<string, Playstyle> = {
  halcyon: {
    mech: 'halcyon',
    note:
      'Naia Vesk — composed, professional, faintly arrogant. The reference chassis and ' +
      'the tutorial pick, so she is the baseline every other row is a deviation from: ' +
      'textbook spacing, no vice.',
    aggressionMul: 1.0,
    rangeMul: 1.0,
    meleeAppetite: 0,
    dashMul: 1.0,
    guardMul: 1.0,
    satPreference: SatMode.Shoot,
    droneDoctrine: 'escort',
    hitAndRun: false,
  },

  nocturne: {
    mech: 'nocturne',
    note:
      'Halden Rook — late-forties assault veteran, scarred and unbothered. Fights at a ' +
      'measured pace and takes the hit rather than the panic dodge: high guard, low ' +
      'dash, and a rotary cannon that rewards standing still to use it.',
    aggressionMul: 1.02,
    rangeMul: 0.92,
    meleeAppetite: 0.05,
    dashMul: 0.85,
    guardMul: 1.15,
    satPreference: SatMode.Shoot,
    droneDoctrine: 'escort',
    hitAndRun: false,
  },

  vesper: {
    mech: 'vesper',
    note:
      'Kestrel Doyne — marksman. Quiet, watchful, still. The longest reach on the ' +
      'roster and the second-thinnest life pool, so every metre of distance is worth ' +
      'more to him than to anyone else. His drone is a bodyguard: it stays on him ' +
      'and breaks up anyone who gets inside his line.',
    aggressionMul: 0.95,
    rangeMul: 1.18,
    meleeAppetite: -0.2,
    dashMul: 1.08,
    guardMul: 0.92,
    satPreference: SatMode.Shoot,
    /**
     * **`shadow`, not `screen` — the escort's job changed.**
     *
     * Screening measured best when SIGHTLINE's only trick was point defence
     * (-0.146 against escort's -0.201 and shadow's -0.217), because a drone
     * making a nuisance of itself out front bought Kestrel time. It now carries
     * the breaker pulse, which only fires when someone is on top of *him* — so
     * the escort has to be there, not out front. The old measurement priced a
     * drone that no longer exists.
     */
    droneDoctrine: 'shadow',
    hitAndRun: false,
  },

  terramoth: {
    mech: 'terramoth',
    note:
      'Brunn Okonkwo — colliery pilot, not a soldier. Broad, calm, immovable. The ' +
      'heaviest frame, the biggest life pool and a damage-taken passive, so the ' +
      'winning line is to walk forward and let it happen. Guards rather than dodges ' +
      'because at 1.29 scale it cannot dodge.',
    aggressionMul: 1.0,
    rangeMul: 0.9,
    meleeAppetite: 0.08,
    dashMul: 0.7,
    guardMul: 1.2,
    satPreference: SatMode.Shield,
    droneDoctrine: 'shadow',
    hitAndRun: false,
  },

  cirrus: {
    mech: 'cirrus',
    note:
      'Mira Holloway — young, quick, grinning, and certain it will work. The smallest ' +
      'and fastest chassis with twin daggers on the longest melee chain in the game, ' +
      'so recklessness is not a flaw in the plan, it *is* the plan. Prefers SPEED ' +
      'saturation: more of the chain lands inside one burst, and the extra closing ' +
      'speed is what buys the opening to start it.',
    aggressionMul: 1.1,
    rangeMul: 0.78,
    meleeAppetite: 0.25,
    dashMul: 1.35,
    guardMul: 0.85,
    satPreference: SatMode.Speed,
    droneDoctrine: 'flank',
    hitAndRun: true,
  },

  obelisk: {
    mech: 'obelisk',
    note:
      'Saar Tengku — steady, patient, defensive. The only pilot whose kit is built ' +
      'around the barrier itself: biggest pool, fastest regen, cheapest burst. Holds ' +
      'the line and lets the opponent break themselves on it, then answers with the ' +
      'ram shield. Keeps his drone tucked in, because the passive is the point.',
    aggressionMul: 0.92,
    rangeMul: 0.94,
    meleeAppetite: 0.1,
    dashMul: 0.85,
    guardMul: 1.3,
    satPreference: SatMode.Shield,
    droneDoctrine: 'shadow',
    hitAndRun: false,
  },

  pyre: {
    mech: 'pyre',
    note:
      'Rasa Volkov — reckless, cheerful, genuinely delighted to be here. Incendiary ' +
      'brawler with the shortest-reaching main gun on the roster, so there is no ' +
      'version of this fight that happens at range. Gains saturation at 1.8x, which ' +
      'means she can afford to spend it early and often — and she does.',
    aggressionMul: 1.08,
    rangeMul: 0.72,
    meleeAppetite: 0.2,
    dashMul: 1.1,
    guardMul: 0.85,
    satPreference: SatMode.Shoot,
    droneDoctrine: 'screen',
    hitAndRun: false,
  },

  nulltide: {
    mech: 'nulltide',
    note:
      'Io Senna — electronic warfare. Detached, clinical, unreadable. Wins by ' +
      'subtraction rather than damage: halves the opponent\'s energy regeneration ' +
      'while deployed, so the correct fight is a long one held at a distance she ' +
      'controls. Her drone flanks, because a jammer works best from somewhere ' +
      'nobody is looking.',
    aggressionMul: 0.94,
    rangeMul: 1.06,
    meleeAppetite: -0.16,
    dashMul: 1.12,
    guardMul: 0.98,
    satPreference: SatMode.Shoot,
    droneDoctrine: 'flank',
    hitAndRun: true,
  },
};

/** The neutral playstyle, for a mech with no entry. Changes nothing. */
export const NEUTRAL_PLAYSTYLE: Playstyle = {
  mech: '',
  note: 'No characterisation: behaves exactly as the difficulty tier says.',
  aggressionMul: 1,
  rangeMul: 1,
  meleeAppetite: 0,
  dashMul: 1,
  guardMul: 1,
  satPreference: SatMode.Shoot,
  droneDoctrine: 'escort',
  hitAndRun: false,
};

export function playstyleFor(mechId: string | undefined): Playstyle {
  return (mechId && PLAYSTYLES[mechId]) || NEUTRAL_PLAYSTYLE;
}
