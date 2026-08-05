/**
 * Per-lever ablation of the AI's target selection.
 *
 * `TARGET_LEVERS` holds one flag per reason a rival might prefer the escort to
 * the pilot. This turns them off one at a time and measures what each is worth,
 * because the project's record on AI changes is unambiguous: reasoning about
 * them has been wrong every time, and the diagnosis that finally landed
 * (`satPreference`) came from exactly this — flipping levers, not arguing.
 *
 * Two measurements per configuration, because they answer different questions:
 *
 *   spread   how uneven the roster is at EXTREME. The reason the lock rework
 *            needs an answer at all: removing "nearest wins" took it 0.181 to
 *            0.250, because that rule was the only thing making rivals shoot
 *            escorts.
 *   ladder   EXTREME's mean lead against HARD on identical machines and seeds.
 *            Must stay positive. A tier that plays worse than the one below it
 *            is not a harder tier, and this is the failure the whole-levers-on
 *            configuration actually produced.
 *
 *   npx vite-node tools/probe/targetablate.ts -- --seeds 8
 */
import { MatchSim } from '../../src/combat/MatchSim';
import { RivalAI, TARGET_LEVERS } from '../../src/ai/RivalAI';
import { ROSTER } from '../../src/data/mechs';
import { Difficulty } from '../../src/core/Session';
import { Rng } from '../../src/core/Rng';
import { MatchPhase } from '../../src/combat/types';
import { ARENA_H, ARENA_W } from '../../src/core/GameConfig';
import type { MechDef } from '../../src/mechs/MechDef';

const TICKS = 10800;

function duel(a: MechDef, b: MechDef, seed: number, ta: Difficulty, tb: Difficulty): number {
  const s = new MatchSim({ playerDef: a, enemyDef: b, seed, introTicks: 1, roundTicks: TICKS });
  const p1 = new RivalAI({ difficulty: ta }, new Rng(seed ^ 0x1111));
  const p2 = new RivalAI({ difficulty: tb }, new Rng(seed ^ 0x2222));
  for (let n = 0; n < TICKS && s.phase !== MatchPhase.Over; n++) {
    s.step(
      p1.think(s.player, s.enemy, s.activeProjectiles(), ARENA_W, ARENA_H),
      p2.think(s.enemy, s.player, s.activeProjectiles(), ARENA_W, ARENA_H),
    );
  }
  return s.player.life / a.gauges.maxLife - s.enemy.life / b.gauges.maxLife;
}

/** Roster spread at EXTREME: every pair, both slot orders, N seeds. */
function spread(seeds: number): { spread: number; rows: Array<[string, number, number]> } {
  const lead = new Map<string, number[]>(ROSTER.map((m) => [m.id, []]));
  const win = new Map<string, number[]>(ROSTER.map((m) => [m.id, []]));
  for (let i = 0; i < ROSTER.length; i++) {
    for (let j = i + 1; j < ROSTER.length; j++) {
      for (let k = 0; k < seeds; k++) {
        const seed = 0x5eed + k * 7919 + i * 131 + j * 17;
        for (const flip of [false, true]) {
          const [a, b] = flip ? [ROSTER[j], ROSTER[i]] : [ROSTER[i], ROSTER[j]];
          const l = duel(a, b, seed, Difficulty.Extreme, Difficulty.Extreme);
          lead.get(a.id)!.push(l);
          lead.get(b.id)!.push(-l);
          win.get(a.id)!.push(l > 0 ? 1 : 0);
          win.get(b.id)!.push(l < 0 ? 1 : 0);
        }
      }
    }
  }
  const mean = (xs: number[]) => xs.reduce((t, x) => t + x, 0) / Math.max(1, xs.length);
  const rows = ROSTER.map(
    (m) => [m.id, mean(lead.get(m.id)!), mean(win.get(m.id)!)] as [string, number, number],
  ).sort((p, q) => q[1] - p[1]);
  return { spread: rows[0][1] - rows[rows.length - 1][1], rows };
}

/** EXTREME against HARD on the same machine, both slots. */
function ladder(seeds: number): number {
  const out: number[] = [];
  for (const m of ROSTER) {
    for (let k = 0; k < seeds; k++) {
      const seed = 0x1add17 + k * 6151 + m.id.length * 13;
      out.push(duel(m, m, seed, Difficulty.Extreme, Difficulty.Hard));
      out.push(-duel(m, m, seed ^ 0x55, Difficulty.Hard, Difficulty.Extreme));
    }
  }
  return out.reduce((t, x) => t + x, 0) / out.length;
}

const seeds = Number(process.argv.find((a, i) => process.argv[i - 1] === '--seeds') ?? 8);
const names = Object.keys(TARGET_LEVERS) as Array<keyof typeof TARGET_LEVERS>;
const set = (v: Partial<Record<string, boolean>>) => {
  for (const n of names) TARGET_LEVERS[n] = !!v[n];
};

type Cfg = [string, Partial<Record<string, boolean>>];

/**
 * `--combos` runs the shortlist instead of the full per-lever pass.
 *
 * The single-lever table is what says which levers are worth anything; it does
 * not say whether two of them add. Levers that each help on their own can
 * overlap — both `finish` and `blocking` pull the lock off the pilot, and two
 * reasons to stop shooting the pilot may simply be one reason twice.
 */
const combos: Cfg[] = [
  ['none (control)', {}],
  ['only finish', { finish: true }],
  ['only blocking', { blocking: true }],
  ['finish + blocking', { finish: true, blocking: true }],
  ['finish + blocking + healer', { finish: true, blocking: true, healer: true }],
];

const configs: Cfg[] = process.argv.includes('--combos')
  ? combos
  : [
      ['none (hold the pilot)', {}],
      ...names.map((n) => [`only ${n}`, { [n]: true }] as Cfg),
      ['all on', Object.fromEntries(names.map((n) => [n, true]))],
    ];

console.log(`\n  target-selection ablation — ${seeds} seeds\n`);
console.log('  configuration            spread   ladder(E vs H)   worst mech');
for (const [label, cfg] of configs) {
  set(cfg);
  const sp = spread(seeds);
  const ld = ladder(seeds);
  const worst = sp.rows[sp.rows.length - 1];
  const flag = ld <= 0 ? '  <-- LADDER BROKEN' : '';
  console.log(
    `  ${label.padEnd(22)}  ${sp.spread.toFixed(3)}   ${ld >= 0 ? '+' : ''}${ld.toFixed(3)}` +
      `          ${worst[0]} ${(worst[2] * 100).toFixed(0)}%${flag}`,
  );
}
console.log('');
