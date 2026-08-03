/**
 * Behavioural telemetry probe.
 *
 * `balance.ts` says *who* is losing. This says *how*. It runs the same duels
 * against the same seeds and, instead of a life-bar lead, reports what each
 * machine actually did with its 180 seconds: what it threw, how much of that
 * arrived, where the rest of it went, and how it spent its ticks.
 *
 * ```
 *   npx vite-node tools/probe/telemetry.ts -- --tier extreme --seeds 8
 *   npx vite-node tools/probe/telemetry.ts -- --tier extreme --seeds 8 --only obelisk --byfoe
 * ```
 *
 * It exists because three OBELISK passes were spent on hypotheses — durability,
 * reach, damage — that each measured near zero. §2 of `docs/TESTING_PROTOCOL.md`
 * says measure rather than reason; this is the instrument that lets a *diagnosis*
 * be measured before a fix is.
 *
 * **Nominal damage** is the sum of `damage` over every projectile a machine
 * spawned. **Landed** is what its opponent's hull actually lost. The ratio is
 * the single most informative number here: it folds accuracy, guards, barriers,
 * chassis defence and drone interception into one figure, and it is directly
 * comparable across the roster.
 */
import { ARENA_H, ARENA_W, ROUND_TIME_TICKS } from '../../src/core/GameConfig';
import { MatchSim } from '../../src/combat/MatchSim';
import { RivalAI } from '../../src/ai/RivalAI';
import { Rng } from '../../src/core/Rng';
import { Difficulty } from '../../src/core/Session';
import { ActState, MatchPhase } from '../../src/combat/types';
import { Combatant } from '../../src/combat/Combatant';
import { ProjectilePool } from '../../src/projectiles/Projectile';
import { ROSTER } from '../../src/data/mechs';
import type { MechDef } from '../../src/mechs/MechDef';

const TIERS: Record<string, Difficulty> = {
  easy: Difficulty.Easy,
  normal: Difficulty.Normal,
  hard: Difficulty.Hard,
  extreme: Difficulty.Extreme,
};

/** Per-combatant accumulators for one duel. */
interface Tally {
  /** Nominal damage spawned, split by who pulled the trigger. */
  nominalSelf: number;
  nominalDrone: number;
  /** Fire calls, by attack id. */
  calls: Map<string, number>;
  /**
   * Hull the opponent lost to *direct hits* — projectiles and the arc tether.
   *
   * Deliberately not the same number as `hullLost`. A status chip is applied
   * inside `Combatant.step` and emits no `hit` event, so anything read off the
   * event stream silently omits every burn and acid tick on the roster. That
   * fault made PYRE look like the worst machine in the game on the first run of
   * this probe. `landed` is kept only because the *ratio* of it to nominal is
   * the accuracy figure, and accuracy is a property of shots, not of burns.
   */
  landed: number;
  /** Hull actually lost, from life deltas: hits, burns, everything. */
  hullLost: number;
  /**
   * The same three numbers as a share of the bar they were spent against.
   *
   * `lead` is a life *fraction*, so raw damage is the wrong currency for
   * explaining it: 23 dps into TERRAMOTH's 2490 hull and 23 dps into CIRRUS's
   * 1440 are not the same fight. Every conclusion here should be read off
   * `barDealt` / `barTaken`, not off `landed`.
   */
  barDealt: number;
  barTaken: number;
  taken: number;
  /** Damage this machine put into the opponent's escort. */
  intoDrone: number;
  /** Events counted against this machine's opponent. */
  guardsForced: number;
  absorbsForced: number;
  breaksForced: number;
  /** Events counted against this machine. */
  guarded: number;
  absorbed: number;
  broken: number;
  satCharge: number;
  /** Ticks in each `ActState`, and a few conditions worth separating. */
  act: number[];
  ticksNoEnergy: number;
  ticksSwinging: number;
  ticksGuarding: number;
  /**
   * Per weapon: rounds spawned, rounds consumed on contact, rounds that expired
   * in flight, and the mean distance a round covered before it stopped existing.
   *
   * Three ways to stop existing, and they mean three different things:
   *
   * * **consumed** — something ate it: a mech, a guard, a barrier, a dome, a
   *   mine. The weapon reached a target and was answered.
   * * **expired** — its `life` counter ran out in open air. It fell short.
   * * **flewOff** — `MatchSim` culled it 260px outside the arena. It missed and
   *   kept going.
   *
   * The last one has to be separated or it reads as a hit: the cull deactivates
   * a round whose clock is still running, which is exactly the signature of
   * being eaten. Conflating them made OBELISK's main gun look 52 % effective.
   */
  shots: Map<
    string,
    { spawned: number; consumed: number; expired: number; flewOff: number; dist: number }
  >;
  bursts: number;
  burnouts: number;
  droneDown: number;
  droneAlive: number;
  distSum: number;
  ticks: number;
  /** Fights survived to the bell or won. */
  killed: number;
  wasKilled: number;
}

function blank(): Tally {
  return {
    nominalSelf: 0,
    nominalDrone: 0,
    calls: new Map(),
    landed: 0,
    hullLost: 0,
    barDealt: 0,
    barTaken: 0,
    taken: 0,
    intoDrone: 0,
    guardsForced: 0,
    absorbsForced: 0,
    breaksForced: 0,
    guarded: 0,
    absorbed: 0,
    broken: 0,
    satCharge: 0,
    shots: new Map(),
    act: [0, 0, 0, 0, 0, 0, 0],
    ticksNoEnergy: 0,
    ticksSwinging: 0,
    ticksGuarding: 0,
    bursts: 0,
    burnouts: 0,
    droneDown: 0,
    droneAlive: 0,
    distSum: 0,
    ticks: 0,
    killed: 0,
    wasKilled: 0,
  };
}

function merge(into: Tally, from: Tally): void {
  into.nominalSelf += from.nominalSelf;
  into.nominalDrone += from.nominalDrone;
  for (const [k, v] of from.calls) into.calls.set(k, (into.calls.get(k) ?? 0) + v);
  into.landed += from.landed;
  into.hullLost += from.hullLost;
  into.barDealt += from.barDealt;
  into.barTaken += from.barTaken;
  into.taken += from.taken;
  into.intoDrone += from.intoDrone;
  into.guardsForced += from.guardsForced;
  into.absorbsForced += from.absorbsForced;
  into.breaksForced += from.breaksForced;
  into.guarded += from.guarded;
  into.absorbed += from.absorbed;
  into.broken += from.broken;
  into.satCharge += from.satCharge;
  for (const [k, v] of from.shots) {
    const c = into.shots.get(k) ?? { spawned: 0, consumed: 0, expired: 0, flewOff: 0, dist: 0 };
    c.spawned += v.spawned;
    c.consumed += v.consumed;
    c.expired += v.expired;
    c.flewOff += v.flewOff;
    c.dist += v.dist;
    into.shots.set(k, c);
  }
  for (let i = 0; i < into.act.length; i++) into.act[i] += from.act[i];
  into.ticksNoEnergy += from.ticksNoEnergy;
  into.ticksSwinging += from.ticksSwinging;
  into.ticksGuarding += from.ticksGuarding;
  into.bursts += from.bursts;
  into.burnouts += from.burnouts;
  into.droneDown += from.droneDown;
  into.droneAlive += from.droneAlive;
  into.distSum += from.distSum;
  into.ticks += from.ticks;
  into.killed += from.killed;
  into.wasKilled += from.wasKilled;
}

/**
 * `Combatant.fire` is private to TypeScript and ordinary at runtime, so the
 * probe wraps it on the prototype to see what was thrown and by whom. The
 * alternative — inferring the weapon from a `hit` event — cannot work: several
 * attacks share a `ProjKind` and a family, and a hit carries neither an attack
 * id nor a projectile identity.
 *
 * `from` is set only by `fireFromSupporter`, which is exactly the escort's own
 * gun, so the split between chassis and drone output is free.
 */
let hook: ((id: number, attackId: string, nominal: number, drone: boolean) => void) | null = null;

/** Marks a spawn, and then the pooled projectile, with the weapon that made it. */
interface Tagged {
  __src?: string;
  __serial?: number;
}

{
  const proto = Combatant.prototype as unknown as Record<string, unknown>;
  const orig = proto.fire as (...a: unknown[]) => void;
  proto.fire = function patched(this: Combatant, ...args: unknown[]): void {
    const spawns = args[2] as Array<{ damage: number } & Tagged>;
    const before = spawns.length;
    orig.apply(this, args);
    const attackId = (args[0] as { id: string }).id;
    let nominal = 0;
    for (let i = before; i < spawns.length; i++) {
      nominal += spawns[i].damage;
      // Tagged on the *spawn*, then carried onto the pooled projectile below.
      // §8b of the handoff is the standing warning that `fire` copies the spawn
      // field by field, so a tag put on the AttackDef would never arrive; this
      // one is attached after the copy, to the object that actually leaves.
      spawns[i].__src = args[4] !== undefined ? `${attackId}~drone` : attackId;
    }
    if (hook) hook(this.id, attackId, nominal, args[4] !== undefined);
  };

  let serial = 0;
  const pool = ProjectilePool.prototype as unknown as Record<string, unknown>;
  const origSpawn = pool.spawn as (s: unknown) => (Tagged & { active: boolean }) | null;
  pool.spawn = function patchedSpawn(this: ProjectilePool, s: Tagged): unknown {
    const p = origSpawn.call(this, s);
    if (p) {
      p.__src = s.__src;
      p.__serial = ++serial;
    }
    return p;
  };
}

/** One duel, instrumented. Returns [side A's tally, side B's tally]. */
function duel(a: MechDef, b: MechDef, seed: number, tier: Difficulty, ticks: number): [Tally, Tally] {
  const s = new MatchSim({ playerDef: a, enemyDef: b, seed, introTicks: 1, roundTicks: ticks });
  const p1 = new RivalAI({ difficulty: tier }, new Rng(seed ^ 0x1111));
  const p2 = new RivalAI({ difficulty: tier }, new Rng(seed ^ 0x2222));
  const t: [Tally, Tally] = [blank(), blank()];

  hook = (id, attackId, nominal, drone) => {
    const x = t[id];
    if (drone) x.nominalDrone += nominal;
    else x.nominalSelf += nominal;
    x.calls.set(attackId, (x.calls.get(attackId) ?? 0) + 1);
  };

  let n = 0;
  const prevLife = [s.player.life, s.enemy.life];
  /**
   * What was in each pool slot last tick, so a recycled slot is not read as the
   * previous round surviving — and so a round whose slot was reused inside a
   * single tick is still closed out on *its own* last known state rather than
   * on its successor's.
   */
  interface Watch {
    serial: number;
    src: string;
    team: number;
    x0: number;
    y0: number;
    life: number;
    x: number;
    y: number;
  }
  const watched = new Map<number, Watch>();
  const closeShot = (w: Watch, exact: { life: number; x: number; y: number } | null): void => {
    const x = t[w.team];
    const c = x.shots.get(w.src) ?? { spawned: 0, consumed: 0, expired: 0, flewOff: 0, dist: 0 };
    // `life` counts down and the pool deactivates it at zero, so a round that
    // is gone while its clock still had ticks left was eaten by something.
    // Without an exact final state the last sample stands in, and a round one
    // tick from expiry is called expired.
    const life = exact ? exact.life : w.life - 1;
    const ex = exact ?? w;
    const off =
      ex.x < -CULL_MARGIN ||
      ex.y < -CULL_MARGIN ||
      ex.x > ARENA_W + CULL_MARGIN ||
      ex.y > ARENA_H + CULL_MARGIN;
    if (life <= 0) c.expired++;
    else if (off) c.flewOff++;
    else c.consumed++;
    c.dist += Math.hypot(ex.x - w.x0, ex.y - w.y0);
    x.shots.set(w.src, c);
  };

  for (; n < ticks && s.phase !== MatchPhase.Over; n++) {
    s.step(
      p1.think(s.player, s.enemy, s.activeProjectiles(), ARENA_W, ARENA_H),
      p2.think(s.enemy, s.player, s.activeProjectiles(), ARENA_W, ARENA_H),
    );
    for (const e of s.events) {
      switch (e.t) {
        case 'hit':
          // `victimId` is a combatant; drone damage arrives as `droneHit`.
          t[e.ownerId].landed += e.damage;
          break;
        case 'droneHit':
          t[e.ownerId].intoDrone += e.damage;
          break;
        case 'guard':
          t[e.victimId].guarded++;
          t[1 - e.victimId].guardsForced++;
          break;
        case 'absorb':
          t[e.victimId].absorbed++;
          t[e.victimId].satCharge += e.charge;
          t[1 - e.victimId].absorbsForced++;
          break;
        case 'guardBreak':
          t[e.id].broken++;
          t[1 - e.id].breaksForced++;
          break;
        case 'saturation':
          t[e.id].bursts++;
          break;
        case 'satBurnout':
          t[e.id].burnouts++;
          break;
        case 'droneDown':
          t[e.ownerId].droneDown++;
          break;
      }
    }
    // Projectile bookkeeping. Keyed on the pool slot, matched on serial, so a
    // slot recycled into a new round in the same tick is not read as the old
    // round surviving.
    const items = s.projectiles.items as unknown as Array<
      Tagged & { active: boolean; life: number; x: number; y: number; team: number }
    >;
    for (let k = 0; k < items.length; k++) {
      const p = items[k];
      const prev = watched.get(k);
      if (prev && (!p.active || p.__serial !== prev.serial)) {
        // Same serial means this really is the round we were watching, so its
        // own final state is exact. A changed serial means the slot was reused
        // inside the tick and only last tick's sample is honest.
        closeShot(prev, p.__serial === prev.serial ? p : null);
        watched.delete(k);
      }
      if (p.active && p.__src !== undefined) {
        const w = watched.get(k);
        if (w && w.serial === p.__serial) {
          w.life = p.life;
          w.x = p.x;
          w.y = p.y;
        } else {
          const x = t[p.team];
          const c = x.shots.get(p.__src) ?? { spawned: 0, consumed: 0, expired: 0, flewOff: 0, dist: 0 };
          c.spawned++;
          x.shots.set(p.__src, c);
          watched.set(k, {
            serial: p.__serial!,
            src: p.__src,
            team: p.team,
            x0: p.x,
            y0: p.y,
            life: p.life,
            x: p.x,
            y: p.y,
          });
        }
      }
    }

    const d = Math.hypot(s.player.x - s.enemy.x, s.player.y - s.enemy.y);
    for (const c of [s.player, s.enemy]) {
      const x = t[c.id];
      x.act[c.act]++;
      x.ticks++;
      x.distSum += d;
      if (c.energy < c.def.main.energyCost) x.ticksNoEnergy++;
      if (c.swinging) x.ticksSwinging++;
      if (c.guarding) x.ticksGuarding++;
      // `onStation` rather than a liveness flag: a drone in the backpack is not
      // shooting, dome-ing or tethering, so for every question this probe is
      // asked it is as absent as a dead one.
      if (c.supporter.onStation && c.supporter.life > 0) x.droneAlive++;
      // Only decreases: a repair drone puts life back and that is not negative
      // damage, it is the escort doing its job and belongs in its own column.
      const lost = Math.max(0, prevLife[c.id] - c.life);
      t[1 - c.id].hullLost += lost;
      prevLife[c.id] = c.life;
    }
  }
  hook = null;
  // Cross-fill: what I dealt is what my opponent took, and the bar it came off
  // is the *opponent's*, which is the whole reason this is kept separately.
  t[0].taken = t[1].hullLost;
  t[1].taken = t[0].hullLost;
  t[0].barDealt = t[0].hullLost / b.gauges.maxLife;
  t[1].barDealt = t[1].hullLost / a.gauges.maxLife;
  t[0].barTaken = t[1].hullLost / a.gauges.maxLife;
  t[1].barTaken = t[0].hullLost / b.gauges.maxLife;
  if (!s.enemy.alive && s.player.alive) {
    t[0].killed++;
    t[1].wasKilled++;
  } else if (!s.player.alive && s.enemy.alive) {
    t[1].killed++;
    t[0].wasKilled++;
  }
  return t;
}

interface Options {
  tier: Difficulty;
  tierName: string;
  seeds: number;
  ticks: number;
  only: string | null;
  byfoe: boolean;
}

function parseArgs(argv: string[]): Options {
  const get = (flag: string): string | null => {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
  };
  const tierName = (get('--tier') ?? 'extreme').toLowerCase();
  if (!(tierName in TIERS)) throw new Error(`unknown tier "${tierName}"`);
  return {
    tier: TIERS[tierName],
    tierName,
    seeds: Number(get('--seeds') ?? 6),
    ticks: Number(get('--ticks') ?? ROUND_TIME_TICKS),
    only: get('--only'),
    byfoe: argv.includes('--byfoe'),
  };
}

const SEC = 60;
/** `MatchSim` culls a round this far outside the arena. Kept in step with it. */
const CULL_MARGIN = 260;

function line(id: string, x: Tally): string {
  const secs = x.ticks / SEC;
  const dps = (v: number): string => (v / secs).toFixed(1).padStart(5);
  const pct = (v: number): string => ((v / Math.max(1, x.ticks)) * 100).toFixed(0).padStart(3);
  const nominal = x.nominalSelf + x.nominalDrone;
  const eff = nominal > 0 ? (x.landed / nominal) * 100 : 0;
  // Bars per minute, dealt and taken. `net` is the number `lead` is made of.
  const bpm = (v: number): string => ((v / secs) * 60 * 100).toFixed(1).padStart(5);
  const net = ((x.barDealt - x.barTaken) / secs) * 60 * 100;
  return (
    `  ${id.toUpperCase().padEnd(10)}` +
    ` bar/min ${bpm(x.barDealt)} out ${bpm(x.barTaken)} in` +
    `  net ${(net >= 0 ? '+' : '') + net.toFixed(1).padStart(5)}` +
    `  dps ${dps(x.hullLost)} (nom ${dps(nominal)}` +
    `, drone ${((x.nominalDrone / Math.max(1, nominal)) * 100).toFixed(0).padStart(2)}%)` +
    ` arrive ${eff.toFixed(1).padStart(4)}%` +
    `  atk ${pct(x.act[ActState.Attack])}%` +
    ` grd ${pct(x.ticksGuarding)}%` +
    ` stun ${pct(x.act[ActState.Hitstun])}%` +
    ` dry ${pct(x.ticksNoEnergy)}%` +
    ` dist ${(x.distSum / Math.max(1, x.ticks)).toFixed(0).padStart(3)}`
  );
}

function detail(id: string, x: Tally): void {
  const secs = x.ticks / SEC;
  const per = (v: number): string => (v / (secs / 60)).toFixed(1).padStart(6);
  console.log(`\n  ${id.toUpperCase()} — per minute of fight`);
  const ordered = [...x.calls.entries()].sort((p, q) => q[1] - p[1]);
  for (const [k, v] of ordered) console.log(`    fire ${k.padEnd(10)} ${per(v)}`);
  console.log('    weapon        rounds   consumed  expired  flew off   mean flight');
  const shots = [...x.shots.entries()].sort((p, q) => q[1].spawned - p[1].spawned);
  for (const [k, v] of shots) {
    const n = Math.max(1, v.spawned);
    console.log(
      `    ${k.padEnd(14)}${String(v.spawned).padStart(6)}` +
        `  ${((v.consumed / n) * 100).toFixed(0).padStart(6)}%` +
        `   ${((v.expired / n) * 100).toFixed(0).padStart(5)}%` +
        `    ${((v.flewOff / n) * 100).toFixed(0).padStart(5)}%` +
        `      ${(v.dist / Math.max(1, v.consumed + v.expired + v.flewOff)).toFixed(0).padStart(5)}px`,
    );
  }
  console.log(`    guards forced ${per(x.guardsForced)}   absorbs forced ${per(x.absorbsForced)}` +
    `   breaks forced ${per(x.breaksForced)}`);
  console.log(`    guarded  ${per(x.guarded)}   absorbed ${per(x.absorbed)}   broken ${per(x.broken)}`);
  console.log(`    drone dmg ${(x.intoDrone / secs).toFixed(2)}/s   escort alive ` +
    `${((x.droneAlive / Math.max(1, x.ticks)) * 100).toFixed(0)}%   lost ${per(x.droneDown)}`);
  console.log(`    sat charge ${(x.satCharge / secs).toFixed(1)}/s   bursts ${per(x.bursts)}` +
    `   burnouts ${per(x.burnouts)}   kills ${x.killed} deaths ${x.wasKilled}`);
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2));
  const totals = new Map<string, Tally>(ROSTER.map((m) => [m.id, blank()]));
  const byFoe = new Map<string, Tally>();
  const t0 = Date.now();

  for (let i = 0; i < ROSTER.length; i++) {
    for (let j = i + 1; j < ROSTER.length; j++) {
      if (opts.only && ROSTER[i].id !== opts.only && ROSTER[j].id !== opts.only) continue;
      for (let k = 0; k < opts.seeds; k++) {
        // The same seed formula as `balance.ts`, so the fights sampled here are
        // literally the fights that produced the lead numbers being explained.
        const seed = 900 + i * 131 + j * 17 + k * 7717;
        for (const [a, b] of [
          [i, j],
          [j, i],
        ]) {
          const [ta, tb] = duel(ROSTER[a], ROSTER[b], seed, opts.tier, opts.ticks);
          merge(totals.get(ROSTER[a].id)!, ta);
          merge(totals.get(ROSTER[b].id)!, tb);
          if (opts.byfoe && opts.only) {
            const me = ROSTER[a].id === opts.only ? ta : tb;
            const foe = ROSTER[a].id === opts.only ? ROSTER[b].id : ROSTER[a].id;
            if (!byFoe.has(foe)) byFoe.set(foe, blank());
            merge(byFoe.get(foe)!, me);
          }
        }
      }
    }
  }

  console.log(`\n  ${opts.tierName.toUpperCase()}  ${opts.seeds} seeds x both slots` +
    `${opts.only ? ` (only ${opts.only})` : ''}\n`);
  const rows = [...totals.entries()].filter(([, x]) => x.ticks > 0);
  rows.sort(
    (p, q) =>
      (q[1].barDealt - q[1].barTaken) / q[1].ticks - (p[1].barDealt - p[1].barTaken) / p[1].ticks,
  );
  for (const [id, x] of rows) console.log(line(id, x));

  if (opts.only) {
    const x = totals.get(opts.only);
    if (x) detail(opts.only, x);
    if (opts.byfoe) {
      console.log(`\n  ${opts.only.toUpperCase()} against each opponent\n`);
      for (const [foe, y] of byFoe) console.log(line(foe, y));
    }
  }
  console.log(`\n  ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
}

main();
