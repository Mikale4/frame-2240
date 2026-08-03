/**
 * Roster balance probe.
 *
 * Fights every machine against every other one, both slots, several seeds, and
 * reports each mech's mean life-bar lead over the field. This is the instrument
 * §5.1 of the handoff asks for, and it exists as a committed tool rather than a
 * scratch script because the numbers in `SESSION_HANDOFF.md` are only worth
 * anything if the next session can reproduce them.
 *
 * ```
 *   npx vite-node tools/probe/balance.ts -- --tier extreme
 *   npx vite-node tools/probe/balance.ts -- --tier extreme --only terramoth
 *   npx vite-node tools/probe/balance.ts -- --selftest
 * ```
 *
 * **The self-test is the point.** `docs/TESTING_PROTOCOL.md` records three
 * measurements that were believed and then overturned in a single session, and
 * the property that would have caught all three is that *an inert change must
 * measure exactly zero*. `--selftest` runs the same configuration twice in one
 * process and requires bit-identical output. If that ever disagrees, nothing
 * this file prints can be trusted, because the two arms of any A/B run through
 * it would then differ by something other than the change under test.
 *
 * Sharding: with no `--shard`, the process forks one child per shard and merges
 * their JSON. The work is embarrassingly parallel — every duel is independent
 * and seeded — so this is free wall-clock.
 */
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
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

interface Options {
  tier: Difficulty;
  tierName: string;
  seeds: number;
  ticks: number;
  only: string | null;
  shard: { index: number; count: number } | null;
  jobs: number;
  json: boolean;
  matrix: boolean;
  selftest: boolean;
}

function parseArgs(argv: string[]): Options {
  const get = (flag: string): string | null => {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
  };
  const tierName = (get('--tier') ?? 'extreme').toLowerCase();
  if (!(tierName in TIERS)) throw new Error(`unknown tier "${tierName}"`);
  const shardRaw = get('--shard');
  const shard = shardRaw
    ? (() => {
        const [i, n] = shardRaw.split('/').map(Number);
        return { index: i, count: n };
      })()
    : null;
  return {
    tier: TIERS[tierName],
    tierName,
    seeds: Number(get('--seeds') ?? 6),
    ticks: Number(get('--ticks') ?? ROUND_TIME_TICKS),
    only: get('--only'),
    shard,
    jobs: Number(get('--jobs') ?? Math.max(1, Math.min(10, cpus().length - 2))),
    json: argv.includes('--json'),
    matrix: argv.includes('--matrix'),
    selftest: argv.includes('--selftest'),
  };
}

/** One duel. Returns side A's life-bar lead: >0 means A finished ahead. */
interface Duel {
  /**
   * Side A's life-bar lead — the *margin*, not the result.
   *
   * Worth being blunt about, because the two get confused: a machine that wins
   * narrowly often and loses badly occasionally has a poor lead and a good win
   * rate. CIRRUS is the live example — most of her lead comes from a handful of
   * crushing wins inside OVERDRIVE, and her record outside it is a coin flip.
   * Both numbers are reported for that reason.
   */
  lead: number;
  /** +1 if side A finished ahead, -1 if behind, 0 on an exact tie. */
  win: number;
  /** +1 side A killed B, -1 B killed A, 0 the clock ran out. */
  ko: number;
  ticks: number;
}

function duel(a: MechDef, b: MechDef, seed: number, tier: Difficulty, ticks: number): Duel {
  const s = new MatchSim({
    playerDef: a,
    enemyDef: b,
    seed,
    introTicks: 1,
    roundTicks: ticks,
  });
  const p1 = new RivalAI({ difficulty: tier }, new Rng(seed ^ 0x1111));
  const p2 = new RivalAI({ difficulty: tier }, new Rng(seed ^ 0x2222));
  let n = 0;
  for (; n < ticks && s.phase !== MatchPhase.Over; n++) {
    s.step(
      p1.think(s.player, s.enemy, s.activeProjectiles(), ARENA_W, ARENA_H),
      p2.think(s.enemy, s.player, s.activeProjectiles(), ARENA_W, ARENA_H),
    );
  }
  const lead = s.player.life / a.gauges.maxLife - s.enemy.life / b.gauges.maxLife;
  return {
    lead,
    // The game's own rule: whoever is ahead on life fraction takes it, whether
    // that came by KO or by the clock.
    win: lead > 0 ? 1 : lead < 0 ? -1 : 0,
    ko: s.player.alive === s.enemy.alive ? 0 : s.enemy.alive ? -1 : 1,
    ticks: n,
  };
}

/**
 * The ordered list of (i, j, seed) samples, before sharding.
 *
 * Fixed and derived only from the roster order and the seed count, so two runs
 * of the same configuration draw the same fights — which is what makes an A/B
 * across a code change an A/B of *that change* rather than of the dice.
 */
function samplePlan(opts: Options): Array<{ i: number; j: number; seed: number }> {
  const plan: Array<{ i: number; j: number; seed: number }> = [];
  for (let i = 0; i < ROSTER.length; i++) {
    for (let j = i + 1; j < ROSTER.length; j++) {
      if (opts.only && ROSTER[i].id !== opts.only && ROSTER[j].id !== opts.only) continue;
      for (let k = 0; k < opts.seeds; k++) {
        plan.push({ i, j, seed: 900 + i * 131 + j * 17 + k * 7717 });
      }
    }
  }
  return plan;
}

interface Sample {
  i: number;
  j: number;
  /** Slot-cancelled lead of i over j: (duel(i,j) - duel(j,i)) / 2. */
  lead: number;
  /** Net kills i took off j across the two slot orders, in [-2, 2]. */
  ko: number;
  /** Matches i won against j, of the two slot orders. */
  wins: number;
  /** Mean length of the two fights, in ticks. */
  ticks: number;
}

/** A duel's contribution to a win count: 1 won, 0 lost, half a draw. */
function drawAware(win: number): number {
  return win > 0 ? 1 : win < 0 ? 0 : 0.5;
}

/** Runs one shard of the plan. */
function runShard(opts: Options): Sample[] {
  const plan = samplePlan(opts);
  const out: Sample[] = [];
  for (let n = 0; n < plan.length; n++) {
    if (opts.shard && n % opts.shard.count !== opts.shard.index) continue;
    const { i, j, seed } = plan[n];
    const a = ROSTER[i];
    const b = ROSTER[j];
    // Both slot orders on the same seed, so the harness's left-slot bias
    // cancels inside every single sample rather than only in the average.
    const fwd = duel(a, b, seed, opts.tier, opts.ticks);
    const rev = duel(b, a, seed, opts.tier, opts.ticks);
    out.push({
      i,
      j,
      lead: (fwd.lead - rev.lead) / 2,
      /**
       * Half a win each on a draw.
       *
       * This read `(fwd.win > 0 ? 1 : 0)`, which gives the left side nothing on
       * a tie — and since the right side's share is derived as `2 - wins`, a
       * draw was silently scored as a **full win for whoever happened to be
       * listed second**. Both sides then swap slots, so it did not vanish in the
       * average; it just moved a fixed amount of credit down the roster order.
       *
       * Harmless while draws were rare and not any more: letting a status land
       * the killing blow (D121) made **double KOs** possible, and they went from
       * about 3 per machine to about 11 of 168 — 6.5 % of PYRE's fights end with
       * both machines dying on the same tick.
       */
      wins: drawAware(fwd.win) + drawAware(-rev.win),
      ko: fwd.ko - rev.ko,
      ticks: (fwd.ticks + rev.ticks) / 2,
    });
  }
  return out;
}

interface Row {
  id: string;
  mean: number;
  se: number;
  n: number;
  /** Net kills per fight: +1 means it always kills and is never killed. */
  ko: number;
  /** Share of individual matches won, 0..1. The number a player thinks in. */
  winRate: number;
}

function summarise(samples: Sample[]): { rows: Row[]; spread: number; ticks: number } {
  const per = new Map<string, number[]>(ROSTER.map((m) => [m.id, []]));
  const kos = new Map<string, number[]>(ROSTER.map((m) => [m.id, []]));
  const wins = new Map<string, number[]>(ROSTER.map((m) => [m.id, []]));
  for (const s of samples) {
    per.get(ROSTER[s.i].id)!.push(s.lead);
    per.get(ROSTER[s.j].id)!.push(-s.lead);
    kos.get(ROSTER[s.i].id)!.push(s.ko / 2);
    kos.get(ROSTER[s.j].id)!.push(-s.ko / 2);
    // Each sample is two matches; `wins` counts i's share of them.
    wins.get(ROSTER[s.i].id)!.push(s.wins / 2);
    wins.get(ROSTER[s.j].id)!.push((2 - s.wins) / 2);
  }
  const rows: Row[] = [];
  for (const m of ROSTER) {
    const xs = per.get(m.id)!;
    if (!xs.length) continue;
    const mean = xs.reduce((t, x) => t + x, 0) / xs.length;
    const v = xs.reduce((t, x) => t + (x - mean) ** 2, 0) / Math.max(1, xs.length - 1);
    const k = kos.get(m.id)!;
    const w = wins.get(m.id)!;
    rows.push({
      id: m.id,
      mean,
      se: Math.sqrt(v / xs.length),
      n: xs.length,
      ko: k.reduce((t, x) => t + x, 0) / k.length,
      winRate: w.reduce((t, x) => t + x, 0) / w.length,
    });
  }
  rows.sort((p, q) => q.mean - p.mean);
  const ticks = samples.reduce((t, s) => t + s.ticks, 0) / Math.max(1, samples.length);
  return { rows, spread: rows.length ? rows[0].mean - rows[rows.length - 1].mean : 0, ticks };
}

/**
 * How far from the field a machine has to sit before the word "outlier" is
 * earned.
 *
 * Two standard deviations, and it is a **flag rather than a verdict**: with only
 * eight machines, one of them landing past 2σ is not a surprising event. What it
 * is good for is the opposite direction — when nothing is flagged, the roster is
 * one population and "X is the outlier" is not a claim the data supports.
 *
 * This exists because that claim was made about NOCTURNE off a sorted list, on
 * the strength of it being last on lead. It was −1.10σ. The lowest machine in a
 * tight field is not an outlier, PYRE was further out on win rate anyway, and
 * the genuinely most extreme machine was VESPER at +1.75σ — at the *top*.
 * Sorting shows you an order; it does not show you whether the order means
 * anything.
 */
const OUTLIER_Z = 2;

interface Dispersion {
  meanLead: number;
  sdLead: number;
  meanWin: number;
  sdWin: number;
  /**
   * Dispersion with measurement error removed.
   *
   * Each row carries its own standard error, so the spread you can *see* is
   * inflated by it: `observed² ≈ true² + SE²`. Subtracting gives the part that
   * is actually the machines differing from each other. It runs about a fifth of
   * the observed figure at 12 seeds, which is worth knowing before treating a
   * 0.01 gap as real.
   */
  trueSdLead: number;
  noiseShare: number;
  outliers: string[];
}

/** Null for a partial sweep, where the field is not a comparable population. */
function dispersion(rows: Row[]): Dispersion | null {
  if (rows.length < 3) return null;
  /**
   * **Every row must carry the same sample count.**
   *
   * `--only X` gives X a full 84 samples and every other machine the 12 from
   * their single pairing against it. Those rows are not a field — they are seven
   * one-opponent records — and treating them as one produced a lead SD of 0.125
   * and a straight-faced "no outliers" on numbers that meant nothing. Detected by
   * unequal `n` rather than by reading `opts.only`, so any future sampling mode
   * that skews the plan is caught by the same check.
   */
  const counts = rows.map((r) => r.n);
  if (Math.min(...counts) !== Math.max(...counts)) return null;
  const n = rows.length;
  const spreadOfN = (xs: number[]): { mean: number; sd: number } => {
    const mean = xs.reduce((t, x) => t + x, 0) / xs.length;
    const v = xs.reduce((t, x) => t + (x - mean) ** 2, 0) / Math.max(1, xs.length - 1);
    return { mean, sd: Math.sqrt(v) };
  };
  const lead = spreadOfN(rows.map((r) => r.mean));
  const win = spreadOfN(rows.map((r) => r.winRate));
  const meanSeSq = rows.reduce((t, r) => t + r.se ** 2, 0) / n;
  const trueVar = Math.max(0, lead.sd ** 2 - meanSeSq);
  const trueSd = Math.sqrt(trueVar);
  const outliers = rows
    .filter(
      (r) =>
        Math.abs((r.mean - lead.mean) / (lead.sd || 1)) >= OUTLIER_Z ||
        Math.abs((r.winRate - win.mean) / (win.sd || 1)) >= OUTLIER_Z,
    )
    .map((r) => r.id.toUpperCase());
  return {
    meanLead: lead.mean,
    sdLead: lead.sd,
    meanWin: win.mean,
    sdWin: win.sd,
    trueSdLead: trueSd,
    noiseShare: lead.sd > 0 ? 1 - trueSd / lead.sd : 0,
    outliers,
  };
}

function report(samples: Sample[], opts: Options): void {
  const { rows, spread, ticks } = summarise(samples);
  const label = opts.only ? ` (only ${opts.only})` : '';
  console.log(
    `\n  ${opts.tierName.toUpperCase()}  ${opts.seeds} seeds x both slots, ` +
      `${opts.ticks} tick cap${label}\n`,
  );
  const d = dispersion(rows);
  for (const r of rows) {
    const bar = r.mean >= 0 ? '+' : '';
    const z = d ? (r.mean - d.meanLead) / d.sdLead : 0;
    const zw = d ? (r.winRate - d.meanWin) / d.sdWin : 0;
    const flag = d && (Math.abs(z) >= OUTLIER_Z || Math.abs(zw) >= OUTLIER_Z) ? '  <- outlier' : '';
    console.log(
      `  ${r.id.toUpperCase().padEnd(10)} win ${(r.winRate * 100).toFixed(0).padStart(3)}%` +
        `   lead ${bar}${r.mean.toFixed(3).padStart(6)} +/-${r.se.toFixed(3)}` +
        `   ko ${(r.ko >= 0 ? '+' : '') + r.ko.toFixed(2)}` +
        (d
          ? `   z ${(z >= 0 ? '+' : '') + z.toFixed(2)}/${(zw >= 0 ? '+' : '') + zw.toFixed(2)}`
          : '') +
        `   n=${r.n}${flag}`,
    );
  }
  console.log(
    `\n  spread: ${spread.toFixed(3)}   mean fight ${(ticks / 60).toFixed(0)}s of ` +
      `${(opts.ticks / 60).toFixed(0)}s`,
  );
  if (d) {
    console.log(
      `  dispersion: lead SD ${d.sdLead.toFixed(3)} (true ${d.trueSdLead.toFixed(3)}, ` +
        `${(d.noiseShare * 100).toFixed(0)}% of it is measurement noise)   ` +
        `win SD ${(d.sdWin * 100).toFixed(1)}pts`,
    );
    console.log(
      d.outliers.length
        ? `  outliers (|z| >= ${OUTLIER_Z}): ${d.outliers.join(', ')}`
        : `  outliers (|z| >= ${OUTLIER_Z}): none — the field is one population`,
    );
  }
  console.log('');

  if (opts.matrix) {
    const cell = new Map<string, number[]>();
    for (const s of samples) {
      const k = `${s.i},${s.j}`;
      (cell.get(k) ?? cell.set(k, []).get(k)!).push(s.lead);
    }
    console.log('  row beats column, slot-cancelled:\n');
    console.log('  '.padEnd(12) + ROSTER.map((m) => m.id.slice(0, 6).padStart(7)).join(''));
    for (let i = 0; i < ROSTER.length; i++) {
      let line = '  ' + ROSTER[i].id.padEnd(10);
      for (let j = 0; j < ROSTER.length; j++) {
        if (i === j) {
          line += '      .';
          continue;
        }
        const xs = cell.get(i < j ? `${i},${j}` : `${j},${i}`);
        if (!xs) {
          line += '       ';
          continue;
        }
        const sign = i < j ? 1 : -1;
        const m = (sign * xs.reduce((t, x) => t + x, 0)) / xs.length;
        line += m.toFixed(2).padStart(7);
      }
      console.log(line);
    }
    console.log('');
  }
}

/**
 * Children are launched as `node node_modules/vite-node/dist/cli.mjs ...` rather
 * than through `npx`, which on Windows means a shell and a `.cmd` shim.
 */
const VITE_NODE_CLI = 'node_modules/vite-node/dist/cli.mjs';

/** Forks `jobs` children, each running one shard, and merges their samples. */
async function runParallel(opts: Options): Promise<Sample[]> {
  const args = [
    'tools/probe/balance.ts',
    '--tier',
    opts.tierName,
    '--seeds',
    String(opts.seeds),
    '--ticks',
    String(opts.ticks),
    '--json',
  ];
  if (opts.only) args.push('--only', opts.only);

  const children = Array.from({ length: opts.jobs }, (_, k) =>
    new Promise<Sample[]>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [VITE_NODE_CLI, ...args, '--shard', `${k}/${opts.jobs}`],
        { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'inherit'] },
      );
      let buf = '';
      child.stdout.on('data', (d) => (buf += d));
      child.on('error', reject);
      child.on('close', (code) => {
        if (code !== 0) return reject(new Error(`shard ${k} exited ${code}`));
        try {
          resolve(JSON.parse(buf) as Sample[]);
        } catch {
          reject(new Error(`shard ${k} produced unparseable output:\n${buf.slice(0, 400)}`));
        }
      });
    }),
  );
  const parts = await Promise.all(children);
  // Re-sort into plan order so the merged list does not depend on which shard
  // happened to finish first; two runs must be byte-comparable.
  return parts.flat().sort((a, b) => a.i - b.i || a.j - b.j || a.lead - b.lead);
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.selftest) {
    // Same configuration, twice, in one process. Anything but an exact match
    // means the simulation carries state between runs and every A/B measured
    // with this file is confounded.
    const small: Options = { ...opts, seeds: 2, only: opts.only ?? 'terramoth', shard: null };
    const a = JSON.stringify(runShard(small));
    const b = JSON.stringify(runShard(small));
    if (a !== b) {
      console.error('SELFTEST FAILED: two identical runs disagreed.');
      process.exit(1);
    }
    console.log(`selftest ok — ${JSON.parse(a).length} samples reproduced exactly`);
    return;
  }

  const t0 = Date.now();
  const samples = opts.shard ? runShard(opts) : await runParallel(opts);
  if (opts.json) {
    process.stdout.write(JSON.stringify(samples));
    return;
  }
  report(samples, opts);
  console.log(`  ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
}

void main();
