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
  /** Side A's life-bar lead. This is also the game's own timeout tiebreaker. */
  lead: number;
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
  return {
    lead: s.player.life / a.gauges.maxLife - s.enemy.life / b.gauges.maxLife,
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
  /** Mean length of the two fights, in ticks. */
  ticks: number;
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
}

function summarise(samples: Sample[]): { rows: Row[]; spread: number; ticks: number } {
  const per = new Map<string, number[]>(ROSTER.map((m) => [m.id, []]));
  const kos = new Map<string, number[]>(ROSTER.map((m) => [m.id, []]));
  for (const s of samples) {
    per.get(ROSTER[s.i].id)!.push(s.lead);
    per.get(ROSTER[s.j].id)!.push(-s.lead);
    kos.get(ROSTER[s.i].id)!.push(s.ko / 2);
    kos.get(ROSTER[s.j].id)!.push(-s.ko / 2);
  }
  const rows: Row[] = [];
  for (const m of ROSTER) {
    const xs = per.get(m.id)!;
    if (!xs.length) continue;
    const mean = xs.reduce((t, x) => t + x, 0) / xs.length;
    const v = xs.reduce((t, x) => t + (x - mean) ** 2, 0) / Math.max(1, xs.length - 1);
    const k = kos.get(m.id)!;
    rows.push({
      id: m.id,
      mean,
      se: Math.sqrt(v / xs.length),
      n: xs.length,
      ko: k.reduce((t, x) => t + x, 0) / k.length,
    });
  }
  rows.sort((p, q) => q.mean - p.mean);
  const ticks = samples.reduce((t, s) => t + s.ticks, 0) / Math.max(1, samples.length);
  return { rows, spread: rows.length ? rows[0].mean - rows[rows.length - 1].mean : 0, ticks };
}

function report(samples: Sample[], opts: Options): void {
  const { rows, spread, ticks } = summarise(samples);
  const label = opts.only ? ` (only ${opts.only})` : '';
  console.log(
    `\n  ${opts.tierName.toUpperCase()}  ${opts.seeds} seeds x both slots, ` +
      `${opts.ticks} tick cap${label}\n`,
  );
  for (const r of rows) {
    const bar = r.mean >= 0 ? '+' : '';
    console.log(
      `  ${r.id.toUpperCase().padEnd(10)} ${bar}${r.mean.toFixed(3).padStart(6)}` +
        `  +/-${r.se.toFixed(3)}   ko ${(r.ko >= 0 ? '+' : '') + r.ko.toFixed(2)}   n=${r.n}`,
    );
  }
  console.log(
    `\n  spread: ${spread.toFixed(3)}   mean fight ${(ticks / 60).toFixed(0)}s of ` +
      `${(opts.ticks / 60).toFixed(0)}s\n`,
  );

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
