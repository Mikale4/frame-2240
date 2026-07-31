import { describe, expect, it } from 'vitest';
import { MatchSim } from '../combat/MatchSim';
import { AI_PROFILES, AiTactic, RivalAI } from '../ai/RivalAI';
import { Rng } from '../core/Rng';
import { DIFFICULTY_COUNT, DIFFICULTY_NAMES, Difficulty, session } from '../core/Session';
import { HALCYON } from '../data/mechs';
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

/** One duel on identical machines. >0 means side A finished ahead. */
function duel(a: Difficulty, b: Difficulty, seed: number): number {
  const s = new MatchSim({ playerDef: HALCYON, enemyDef: HALCYON, seed, introTicks: 1 });
  const ai1 = new RivalAI({ difficulty: a }, new Rng(seed ^ 0x1111));
  const ai2 = new RivalAI({ difficulty: b }, new Rng(seed ^ 0x2222));
  for (let i = 0; i < 5400 && s.phase !== MatchPhase.Over; i++) {
    const pa = ai1.think(s.player, s.enemy, s.activeProjectiles(), W, H);
    const pb = ai2.think(s.enemy, s.player, s.activeProjectiles(), W, H);
    s.step(pa, pb);
  }
  const max = HALCYON.gauges.maxLife;
  return s.player.life / max - s.enemy.life / max;
}

/**
 * Average life-bar lead of `a` over `b`, played from both slots.
 *
 * Swapping sides matters: the left slot carries a real positional advantage in
 * this harness, and an early version of these numbers was reading that bias as
 * skill. Every matchup is played once from each side and the two averaged.
 */
function lead(a: Difficulty, b: Difficulty, pairs = 6): number {
  let sum = 0;
  for (let i = 0; i < pairs; i++) {
    const seed = 1000 + i * 7717;
    sum += duel(a, b, seed) - duel(b, a, seed + 3331);
  }
  return sum / (pairs * 2);
}

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
  it('has every tier beat the one below it', () => {
    expect(lead(Difficulty.Normal, Difficulty.Easy), 'NORMAL vs EASY').toBeGreaterThan(0);
    expect(lead(Difficulty.Hard, Difficulty.Normal), 'HARD vs NORMAL').toBeGreaterThan(0.2);
    expect(lead(Difficulty.Extreme, Difficulty.Hard), 'EXTREME vs HARD').toBeGreaterThan(0);
  });

  it('has the top tiers beat the bottom decisively', () => {
    expect(lead(Difficulty.Hard, Difficulty.Easy), 'HARD vs EASY').toBeGreaterThan(0.25);
    expect(lead(Difficulty.Extreme, Difficulty.Easy), 'EXTREME vs EASY').toBeGreaterThan(0.25);
    expect(lead(Difficulty.Extreme, Difficulty.Normal), 'EXTREME vs NORMAL').toBeGreaterThan(0.25);
  });

  it('is roughly even against itself', () => {
    // The harness's own bias, and the noise floor everything above sits on. If
    // this drifts far from zero the thresholds above stop meaning anything.
    for (const d of [Difficulty.Normal, Difficulty.Hard, Difficulty.Extreme]) {
      expect(Math.abs(lead(d, d)), DIFFICULTY_NAMES[d]).toBeLessThan(0.2);
    }
  });
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
    const s = new MatchSim({ playerDef: HALCYON, enemyDef: HALCYON, seed, introTicks: 1 });
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
      sum += s.player.boost / HALCYON.flight.maxBoost;
      if (s.player.boost < HALCYON.flight.dashCost) dry++;
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
