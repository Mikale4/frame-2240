/**
 * Outcome probe — *how* a match ended, not who was ahead.
 *
 * `balance.ts` reports a life-bar margin and a record derived from it. Neither
 * says whether a fight was decided by a kill, by the clock, or by a rule at the
 * very edge of the life bar. This splits that out, because a player reported
 * PYRE feeling "high 40s" against a measured 38 % and the aggregates could not
 * explain the gap: her margin is nearly even, her exchange rate is nearly even,
 * and her matchup row is the flattest on the roster.
 *
 * ```
 *   npx vite-node tools/probe/outcomes.ts -- --tier extreme --seeds 12 --only pyre
 * ```
 *
 * The two things it exists to see:
 *
 * * **`clamped`** — ticks a machine spent alive at exactly 1 hull while burning.
 *   Status chip is applied as `Math.max(1, life - chip)` in `Combatant.step`, so
 *   a burn *cannot* land the killing blow. A machine that reduces opponents by
 *   fire therefore stalls one point short and has to finish with something else.
 * * **`tie`** — duels ending on an exactly equal life fraction. `balance.ts`
 *   scores a tie as no win for the left side and, by `2 - wins`, a full win for
 *   the right one, so ties are not neutral there.
 */
import { ARENA_H, ARENA_W, ROUND_TIME_TICKS } from '../../src/core/GameConfig';
import { MatchSim } from '../../src/combat/MatchSim';
import { RivalAI } from '../../src/ai/RivalAI';
import { Rng } from '../../src/core/Rng';
import { Difficulty } from '../../src/core/Session';
import { MatchPhase } from '../../src/combat/types';
import { ROSTER } from '../../src/data/mechs';
import type { MechDef } from '../../src/mechs/MechDef';

const TIERS: Record<string, Difficulty> = {
  easy: Difficulty.Easy,
  normal: Difficulty.Normal,
  hard: Difficulty.Hard,
  extreme: Difficulty.Extreme,
};

interface Tally {
  koWin: number;
  koLoss: number;
  clockWin: number;
  clockLoss: number;
  tie: number;
  /** Duels this machine finished within 1 % of a bar of its opponent. */
  razor: number;
  /** Duels the *opponent* survived at 1 hull. */
  leftAtOne: number;
  /** Duels this machine survived at 1 hull. */
  savedAtOne: number;
  /** Ticks the opponent spent pinned at 1 hull by the burn clamp. */
  clampedTicks: number;
  n: number;
}

const blank = (): Tally => ({
  koWin: 0, koLoss: 0, clockWin: 0, clockLoss: 0, tie: 0,
  razor: 0, leftAtOne: 0, savedAtOne: 0, clampedTicks: 0, n: 0,
});

/**
 * One duel, recorded from **both** sides.
 *
 * The first cut of this tallied only side A, so each machine was measured purely
 * in the slot it happened to be listed first in and the harness's left-slot bias
 * never cancelled — it read PYRE at 32 % against `balance.ts`'s 38 % for the
 * same fights. Every mech now gets both perspectives of every duel.
 */
function duel(
  a: MechDef,
  b: MechDef,
  seed: number,
  tier: Difficulty,
  ticks: number,
  ta: Tally,
  tb: Tally,
): void {
  const s = new MatchSim({ playerDef: a, enemyDef: b, seed, introTicks: 1, roundTicks: ticks });
  const p1 = new RivalAI({ difficulty: tier }, new Rng(seed ^ 0x1111));
  const p2 = new RivalAI({ difficulty: tier }, new Rng(seed ^ 0x2222));
  let clampedB = 0;
  let clampedA = 0;
  for (let n = 0; n < ticks && s.phase !== MatchPhase.Over; n++) {
    s.step(
      p1.think(s.player, s.enemy, s.activeProjectiles(), ARENA_W, ARENA_H),
      p2.think(s.enemy, s.player, s.activeProjectiles(), ARENA_W, ARENA_H),
    );
    // Pinned at the floor the chip clamp cannot cross, and still burning.
    if (s.enemy.alive && s.enemy.life <= 1 && s.enemy.status.def) clampedB++;
    if (s.player.alive && s.player.life <= 1 && s.player.status.def) clampedA++;
  }
  const lead = s.player.life / a.gauges.maxLife - s.enemy.life / b.gauges.maxLife;
  const aLow = s.player.alive && s.player.life <= 1;
  const bLow = s.enemy.alive && s.enemy.life <= 1;
  const razor = Math.abs(lead) <= 0.01;

  ta.n++;
  tb.n++;
  ta.clampedTicks += clampedB;
  tb.clampedTicks += clampedA;
  if (bLow) ta.leftAtOne++;
  if (aLow) tb.leftAtOne++;
  if (aLow) ta.savedAtOne++;
  if (bLow) tb.savedAtOne++;
  if (razor) {
    ta.razor++;
    tb.razor++;
  }
  if (!s.enemy.alive && s.player.alive) {
    ta.koWin++;
    tb.koLoss++;
  } else if (!s.player.alive && s.enemy.alive) {
    ta.koLoss++;
    tb.koWin++;
  } else if (lead > 0) {
    ta.clockWin++;
    tb.clockLoss++;
  } else if (lead < 0) {
    ta.clockLoss++;
    tb.clockWin++;
  } else {
    ta.tie++;
    tb.tie++;
  }
}

function main(): void {
  const argv = process.argv.slice(2);
  const get = (f: string): string | null => {
    const i = argv.indexOf(f);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
  };
  const tierName = (get('--tier') ?? 'extreme').toLowerCase();
  const tier = TIERS[tierName];
  const seeds = Number(get('--seeds') ?? 12);
  const ticks = Number(get('--ticks') ?? ROUND_TIME_TICKS);
  const only = get('--only');

  const per = new Map<string, Tally>(ROSTER.map((m) => [m.id, blank()]));
  for (let i = 0; i < ROSTER.length; i++) {
    for (let j = i + 1; j < ROSTER.length; j++) {
      if (only && ROSTER[i].id !== only && ROSTER[j].id !== only) continue;
      for (let k = 0; k < seeds; k++) {
        const seed = 900 + i * 131 + j * 17 + k * 7717;
        const ti = per.get(ROSTER[i].id)!;
        const tj = per.get(ROSTER[j].id)!;
        // Both slot orders, same seed — the same plan `balance.ts` uses.
        duel(ROSTER[i], ROSTER[j], seed, tier, ticks, ti, tj);
        duel(ROSTER[j], ROSTER[i], seed, tier, ticks, tj, ti);
      }
    }
  }

  console.log(`\n  ${tierName.toUpperCase()}  ${seeds} seeds x both slots${only ? ` (only ${only})` : ''}\n`);
  console.log('  mech         n   KO-W  KO-L  CLK-W CLK-L   tie   win%   razor  leftAt1  clamp/fight');
  const rows = [...per.entries()].filter(([, t]) => t.n > 0);
  for (const [id, t] of rows) {
    const wins = t.koWin + t.clockWin;
    console.log(
      `  ${id.toUpperCase().padEnd(10)}${String(t.n).padStart(4)}` +
        `${String(t.koWin).padStart(6)}${String(t.koLoss).padStart(6)}` +
        `${String(t.clockWin).padStart(7)}${String(t.clockLoss).padStart(6)}` +
        `${String(t.tie).padStart(6)}` +
        `${((wins / t.n) * 100).toFixed(0).padStart(7)}%` +
        `${String(t.razor).padStart(7)}` +
        `${String(t.leftAtOne).padStart(9)}` +
        `${(t.clampedTicks / t.n).toFixed(1).padStart(13)}`,
    );
  }
  console.log('');
}

main();
