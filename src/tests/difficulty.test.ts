import { describe, expect, it } from 'vitest';
import { MatchSim } from '../combat/MatchSim';
import { AI_PROFILES, AiTactic, RivalAI } from '../ai/RivalAI';
import { Rng } from '../core/Rng';
import { DIFFICULTY_COUNT, DIFFICULTY_NAMES, Difficulty, session } from '../core/Session';
import { HALCYON } from '../data/mechs';
import type { MechDef } from '../mechs/MechDef';
import { MatchPhase, Team } from '../combat/types';
import { Combatant } from '../combat/Combatant';
import { ProjectilePool } from '../projectiles/Projectile';

/**
 * The four difficulty tiers, and whether they actually mean anything.
 *
 * A difficulty dial is worth exactly what it can be measured to be worth, so
 * most of this file fights AIs against each other and reads the life bars. It
 * is deterministic — seeded RNG, seeded simulation — so the numbers below are
 * reproducible rather than flaky, and a regression moves them.
 *
 * The history is why the measurement is here at all. The first cut of this
 * rewrite produced a ladder that ran *backwards*: EXTREME lost to HARD and
 * NORMAL lost to EASY, because `reactionTicks` was quietly doing three jobs at
 * once (input latency, the evade lookahead, and how often a heading is
 * re-chosen) and a faster rival got a shorter warning and thrashed between
 * directions. None of that is visible by reading the code.
 */

const W = 2400;
const H = 1200;

/**
 * The ladder's yardstick: HALCYON, **without LAST STAND**.
 *
 * This file measures *tiers*, by fighting the same chassis against itself. A
 * passive both sides carry therefore contributes no signal — and this one
 * contributes a great deal of noise, because a guaranteed ten-second reprieve
 * for each of them means the better pilot cannot convert its advantage into a
 * finish. Measured, adding it collapsed every rung to about a third:
 *
 * ```
 *                     with LAST STAND    without
 *   NORMAL vs EASY      0.057 (2.7σ)     0.193 (3.6σ)
 *   EXTREME vs HARD     0.041 (2.1σ)     0.110 (2.6σ)
 * ```
 *
 * The right-hand column is D92's original calibration to three decimal places,
 * which is the point: **the ladder was always measuring this, and stripping the
 * shared passive restores the instrument rather than moving the goalposts.**
 *
 * §8a of the handoff has warned since D92 that measuring tiers with HALCYON
 * mirrors couples this file to HALCYON's kit. This is that coupling arriving.
 * It is now insulated from *shared* passives; a change to HALCYON's weapons
 * would still move these numbers, and the real fix remains a yardstick that is
 * not a roster mech at all.
 */
const LADDER_MECH: MechDef = { ...HALCYON, lastStand: undefined };

/** One duel on identical machines. >0 means side A finished ahead. */
function duel(a: Difficulty, b: Difficulty, seed: number): number {
  const s = new MatchSim({ playerDef: LADDER_MECH, enemyDef: LADDER_MECH, seed, introTicks: 1 });
  const ai1 = new RivalAI({ difficulty: a }, new Rng(seed ^ 0x1111));
  const ai2 = new RivalAI({ difficulty: b }, new Rng(seed ^ 0x2222));
  for (let i = 0; i < 5400 && s.phase !== MatchPhase.Over; i++) {
    const pa = ai1.think(s.player, s.enemy, s.activeProjectiles(), W, H);
    const pb = ai2.think(s.enemy, s.player, s.activeProjectiles(), W, H);
    s.step(pa, pb);
  }
  const max = LADDER_MECH.gauges.maxLife;
  return s.player.life / max - s.enemy.life / max;
}

/**
 * Average life-bar lead of `a` over `b`, played from both slots.
 *
 * Swapping sides matters: the left slot carries a real positional advantage in
 * this harness, and an early version of these numbers was reading that bias as
 * skill. Every matchup is played once from each side and the two averaged.
 */
function lead(a: Difficulty, b: Difficulty, pairs: number): { mean: number; se: number } {
  const xs: number[] = [];
  for (let i = 0; i < pairs; i++) {
    const seed = 1000 + i * 7717;
    xs.push((duel(a, b, seed) - duel(b, a, seed + 3331)) / 2);
  }
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  const v = xs.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, xs.length - 1);
  return { mean, se: Math.sqrt(v / xs.length) };
}

/**
 * Assert a rung, and say enough on failure to tell a regression from a bad roll.
 *
 * A bare "expected 0.03 to be greater than 0" cannot be acted on: it does not
 * say how precise 0.03 was, so the reader cannot tell whether the ladder broke
 * or the dice did. Every failure here reports the standard error and how many
 * of them separate the measurement from its floor.
 */
function expectRung(
  label: string,
  a: Difficulty,
  b: Difficulty,
  floor: number,
  pairs: number,
): void {
  const { mean, se } = lead(a, b, pairs);
  const sigma = se > 0 ? (mean - floor) / se : Infinity;
  expect(
    mean,
    `${label}: ${mean.toFixed(3)} ±${se.toFixed(3)} (${pairs} pairs), ` +
      `floor ${floor} is ${sigma.toFixed(1)}σ away`,
  ).toBeGreaterThan(floor);
}

/**
 * Sampling, and why it is not uniform.
 *
 * These assertions were failing and passing on luck. Calibrated at 32 pairs, the
 * rungs and their standard errors are:
 *
 * ```
 *   NORMAL v EASY     0.193 ±0.053      HARD v EASY       0.287 ±0.039
 *   HARD v NORMAL     0.241 ±0.052      EXTREME v EASY    0.310 ±0.043
 *   EXTREME v HARD    0.099 ±0.044      EXTREME v NORMAL  0.283 ±0.046
 * ```
 *
 * At the six pairs this file used, every one of those errors is ~2.3x larger —
 * so `EXTREME v HARD > 0` was a measurement of 0.099 ±0.102 against a floor of
 * zero, which is close to a coin toss. That is exactly what was observed: the
 * assertion flickered across a parameter sweep in a pattern no monotonic effect
 * could produce, and a drone change reddened it while measuring no significant
 * difference at 24 pairs.
 *
 * Common random numbers were tried and do not rescue it: pairing the two slot
 * orders on the same seed moved the standard error from 0.053 to 0.047, because
 * swapping which tier holds which slot changes the fight too much for the draws
 * to cancel. The variance is intrinsic, so the only honest fix is samples.
 *
 * **Spent where the margin is thin.** `EXTREME v HARD` is the tight one — the top
 * rung is the smallest gap on the ladder — and gets 40 pairs. The other five get
 * 16. That puts every floor about **2.5 standard errors** below its measured
 * value, against roughly 1σ before, which is the difference between an assertion
 * that catches regressions and one that reports coin tosses.
 *
 * Note these seeds are fixed, so a given build always produces the same numbers:
 * the risk being managed is not run-to-run flakiness but **sensitivity** — an
 * unrelated change nudging a measurement across a floor it was already sitting
 * on top of. That is what happened when a drone change reddened this file.
 */
const TIGHT_PAIRS = 40;
const PAIRS = 16;
/** The bias smoke check is one duel per sample, so it can afford more of them. */
const BIAS_PAIRS = 24;

describe('the difficulty ladder', () => {
  it('offers exactly four named tiers', () => {
    expect(DIFFICULTY_COUNT).toBe(4);
    expect(DIFFICULTY_NAMES).toHaveLength(4);
    expect(DIFFICULTY_NAMES).toEqual(['EASY', 'NORMAL', 'HARD', 'EXTREME']);
    expect(Object.keys(AI_PROFILES)).toHaveLength(4);
  });

  it('makes every tier more competent than the last, on the numbers', () => {
    const tiers = [Difficulty.Easy, Difficulty.Normal, Difficulty.Hard, Difficulty.Extreme];
    for (let i = 1; i < tiers.length; i++) {
      const lo = AI_PROFILES[tiers[i - 1]];
      const hi = AI_PROFILES[tiers[i]];
      expect(hi.skill, `skill ${i}`).toBeGreaterThan(lo.skill);
      expect(hi.reaction, `reaction ${i}`).toBeLessThan(lo.reaction);
      expect(hi.barrierChance, `barrier ${i}`).toBeGreaterThan(lo.barrierChance);
    }
  });

  it('never lets a rival react on the same frame it sees something', () => {
    // The class is built on emitting inputs a human could have emitted. A
    // zero-tick reaction is not a hard opponent, it is an unfair one.
    for (const d of [Difficulty.Easy, Difficulty.Normal, Difficulty.Hard, Difficulty.Extreme]) {
      expect(AI_PROFILES[d].reaction, DIFFICULTY_NAMES[d]).toBeGreaterThanOrEqual(3);
    }
  });

  it('unlocks behaviours rather than only turning a dial', () => {
    // The point of the rewrite: EXTREME is not NORMAL with better dice.
    const flags = [
      'threatSolver',
      'punishRecovery',
      'weaponIq',
      'energyDiscipline',
      'rangeIq',
      'tempoIq',
      'closeOnGuard',
    ] as const;
    const count = (d: Difficulty) => flags.filter((f) => AI_PROFILES[d][f]).length;

    expect(count(Difficulty.Easy)).toBe(0);
    expect(count(Difficulty.Normal)).toBe(0);
    expect(count(Difficulty.Hard)).toBeGreaterThan(0);
    expect(count(Difficulty.Extreme)).toBe(flags.length);
    expect(count(Difficulty.Extreme)).toBeGreaterThan(count(Difficulty.Hard));
  });
});

describe('the difficulty ladder — measured in the ring', () => {
  /**
   * **Ordering is the contract; the margins are a sanity floor.**
   *
   * The absolute gaps here are much smaller than they were when this file was
   * written, and the reason is that the game changed underneath them rather than
   * the tiers getting closer in skill: life pools went up 1.75x and the round
   * clock went 99s to 180s (D62), so a match now runs two to three times longer
   * and a weaker pilot has far more time to claw damage back. Every lead in a
   * longer fight regresses toward the middle.
   *
   * So these assert the thing that must never break — each tier finishing ahead
   * of the one below, from both slots — with floors set below the measured
   * values rather than tight against them.
   */
  it('has every tier beat the one below it', () => {
    expectRung('NORMAL vs EASY', Difficulty.Normal, Difficulty.Easy, 0, PAIRS);
    expectRung('HARD vs NORMAL', Difficulty.Hard, Difficulty.Normal, 0.05, PAIRS);
    // The narrowest rung on the ladder, and the one that was flickering.
    expectRung('EXTREME vs HARD', Difficulty.Extreme, Difficulty.Hard, 0, TIGHT_PAIRS);
  }, 120_000);

  it('has the top tiers beat the bottom decisively', () => {
    // Floors sit ~2.5 standard errors below the calibrated means (0.287, 0.310,
    // 0.283), so they catch a regression rather than a bad roll.
    expectRung('HARD vs EASY', Difficulty.Hard, Difficulty.Easy, 0.15, PAIRS);
    expectRung('EXTREME vs EASY', Difficulty.Extreme, Difficulty.Easy, 0.15, PAIRS);
    expectRung('EXTREME vs NORMAL', Difficulty.Extreme, Difficulty.Normal, 0.12, PAIRS);
  }, 120_000);

  it('has no meaningful slot bias', () => {
    /**
     * **This used to measure noise and call it symmetry.**
     *
     * It asserted `|lead(d, d)| < 0.2`, and `lead` compares `duel(seed)` against
     * `duel(seed + 3331)` — *two different fights*. Between identical opponents
     * that difference is pure sampling noise, so the assertion could never read
     * zero however symmetric the harness was, and it passed or failed on the
     * spread of the roll rather than on any property of the game. It is the same
     * fault as an A/B whose arms differ by more than the thing under test.
     *
     * What is actually worth asserting is the harness's **slot bias**: play a
     * true mirror and see whether the left slot wins for being the left slot.
     * Every threshold in this file is a lead measured across two slots, so a
     * large bias would make all of them meaningless.
     *
     * Measured at 32 pairs: EASY -0.143, NORMAL -0.071, HARD -0.089,
     * EXTREME -0.022. Small, and consistently favouring the *right* slot.
     *
     * **A smoke check, not a gate, and the tolerance says so.** Every threshold
     * above is a lead of the form `(duel(a,b) - duel(b,a)) / 2`, which cancels
     * slot bias by construction — so a bias here does not invalidate them; it
     * would only mean the harness had developed a lopsidedness worth knowing
     * about. EASY is much the noisiest row (two weak pilots flail, and the
     * spread is wide), so the bound is set to catch a harness that has genuinely
     * tilted rather than to police the roll.
     */
    for (const d of [Difficulty.Easy, Difficulty.Normal, Difficulty.Hard, Difficulty.Extreme]) {
      const xs: number[] = [];
      for (let i = 0; i < BIAS_PAIRS; i++) xs.push(duel(d, d, 1000 + i * 7717));
      const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
      expect(Math.abs(mean), `${DIFFICULTY_NAMES[d]} slot bias ${mean.toFixed(3)}`).toBeLessThan(
        0.45,
      );
    }
  }, 120_000);
});

describe('what EXTREME does that the others do not', () => {
  const pair = (): { self: Combatant; foe: Combatant } => ({
    self: new Combatant({ id: 0, team: Team.Player, def: HALCYON, x: 500, y: 600, facing: 1 }),
    foe: new Combatant({ id: 1, team: Team.Enemy, def: HALCYON, x: 1100, y: 600, facing: -1 }),
  });

  it('closes on an opponent who is hiding behind a guard', () => {
    // Straight off the damage table: a held guard takes 20 % from gunfire and
    // 50 % from melee. Standing off and shooting a turtle is the worst
    // available option, and only EXTREME knows that.
    const approaches = (d: Difficulty): boolean => {
      const { self, foe } = pair();
      foe.guarding = true;
      const ai = new RivalAI({ difficulty: d }, new Rng(77));
      const pool = new ProjectilePool(1);
      for (let i = 0; i < 90; i++) {
        ai.think(self, foe, pool.items, W, H);
        if (ai.tactic === AiTactic.Approach) return true;
      }
      return false;
    };
    expect(approaches(Difficulty.Extreme), 'EXTREME should close').toBe(true);
  });

  it('reads a guard the lower tiers ignore', () => {
    // Not "does it ever approach" — every tier approaches sometimes — but that
    // the guard is what causes it, every single tick, without fail.
    const { self, foe } = pair();
    foe.guarding = true;
    const ai = new RivalAI({ difficulty: Difficulty.Extreme }, new Rng(5));
    const pool = new ProjectilePool(1);
    let approach = 0;
    for (let i = 0; i < 120; i++) {
      ai.think(self, foe, pool.items, W, H);
      if (ai.tactic === AiTactic.Approach) approach++;
    }
    expect(approach).toBe(120);
  });
});

describe('resource management', () => {
  /** Runs a mirror match and reports how the boost gauge was managed. */
  function boostUse(d: Difficulty, seed: number): { mean: number; dry: number } {
    const s = new MatchSim({ playerDef: LADDER_MECH, enemyDef: LADDER_MECH, seed, introTicks: 1 });
    const a = new RivalAI({ difficulty: d }, new Rng(seed ^ 0x1111));
    const b = new RivalAI({ difficulty: d }, new Rng(seed ^ 0x2222));
    let sum = 0;
    let dry = 0;
    let n = 0;
    for (let i = 0; i < 5400 && s.phase !== MatchPhase.Over; i++) {
      s.step(
        a.think(s.player, s.enemy, s.activeProjectiles(), W, H),
        b.think(s.enemy, s.player, s.activeProjectiles(), W, H),
      );
      sum += s.player.boost / LADDER_MECH.flight.maxBoost;
      if (s.player.boost < LADDER_MECH.flight.dashCost) dry++;
      n++;
    }
    return { mean: sum / n, dry: dry / n };
  }

  const average = (d: Difficulty) => {
    let mean = 0;
    let dry = 0;
    for (let i = 0; i < 4; i++) {
      const r = boostUse(d, 1000 + i * 7717);
      mean += r.mean;
      dry += r.dry;
    }
    return { mean: mean / 4, dry: dry / 4 };
  };

  it('never flies the boost gauge into the ground', () => {
    /**
     * The regression this exists for: every tier used to hold the thruster down
     * whenever it wanted to move, and EXTREME spent **59 % of a match** with
     * less boost than a single dash costs — permanently unable to dodge. The
     * gauge pays for travel *and* for evasion and the two are not
     * interchangeable, so a share of it is reserved rather than spent.
     */
    for (const d of [Difficulty.Normal, Difficulty.Hard, Difficulty.Extreme]) {
      const r = average(d);
      expect(r.mean, `${DIFFICULTY_NAMES[d]} mean boost`).toBeGreaterThan(0.25);
      expect(r.dry, `${DIFFICULTY_NAMES[d]} ticks unable to dash`).toBeLessThan(0.3);
    }
  });

  it('keeps a dash in hand at the tiers that know to', () => {
    for (const d of [Difficulty.Normal, Difficulty.Hard, Difficulty.Extreme]) {
      expect(AI_PROFILES[d].boostReserveDashes, DIFFICULTY_NAMES[d]).toBeGreaterThan(0);
    }
    // ...but not so much that it never spends any. Hoarding is not management:
    // reserving three dashes left EXTREME repositioning at walking pace and
    // measurably behind HARD.
    for (const d of [Difficulty.Easy, Difficulty.Normal, Difficulty.Hard, Difficulty.Extreme]) {
      expect(AI_PROFILES[d].boostReserveDashes, DIFFICULTY_NAMES[d]).toBeLessThanOrEqual(2);
    }
  });

  it('treats the dash as the evasion and sustained thrust as travel', () => {
    // A dash covers 105px in the seven ticks an evasion takes, where holding
    // boost covers 66. Every tier should reach for it harder when dodging than
    // when merely repositioning.
    for (const d of [Difficulty.Normal, Difficulty.Hard, Difficulty.Extreme]) {
      const p = AI_PROFILES[d];
      expect(p.evadeDashChance, DIFFICULTY_NAMES[d]).toBeGreaterThan(p.dashChance);
    }
  });
});

describe('difficulty is chosen per side', () => {
  it('keeps a tier for each CPU slot', () => {
    session.playerDifficulty = Difficulty.Easy;
    session.enemyDifficulty = Difficulty.Extreme;
    expect(session.playerDifficulty).not.toBe(session.enemyDifficulty);
  });

  it('folds both tiers into the match seed', () => {
    session.matchIndex = 0;
    session.playerDifficulty = Difficulty.Easy;
    session.enemyDifficulty = Difficulty.Easy;
    const base = session.seed();

    session.enemyDifficulty = Difficulty.Extreme;
    const enemyChanged = session.seed();
    session.enemyDifficulty = Difficulty.Easy;
    session.playerDifficulty = Difficulty.Extreme;
    const playerChanged = session.seed();

    expect(enemyChanged).not.toBe(base);
    expect(playerChanged).not.toBe(base);
    expect(playerChanged).not.toBe(enemyChanged);

    session.playerDifficulty = Difficulty.Normal;
    session.enemyDifficulty = Difficulty.Normal;
  });
});
