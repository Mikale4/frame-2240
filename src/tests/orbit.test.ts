import { describe, expect, it } from 'vitest';
import {
  ARENA,
  DOWN_LIMIT,
  KNOCKDOWN_TICKS,
  MOBILE,
  OBSTACLES,
  OrbitAct,
  OrbitSim,
  PX,
  TRANSFORM_TICKS,
  type OrbitEvent,
} from '../orbit/OrbitSim';
import { OrbitAI, lineOfSight } from '../orbit/OrbitAI';
import { HALCYON, NOCTURNE, ROSTER } from '../data/mechs';
import { Btn, type InputFrame } from '../combat/types';
import { Difficulty, MODE_LABELS, matchScene } from '../core/Session';

/**
 * FREE ORBIT, the three-dimensional mode.
 *
 * The rules (`OrbitSim`) and the rival (`OrbitAI`) are pure TypeScript, so
 * everything here runs headless and deterministic — a seed replays a fight
 * bit for bit, which is what lets the duel numbers below be asserted rather
 * than eyeballed.
 */

const idle = (): InputFrame => ({ dx: 0, dy: 0, held: 0, pressed: 0, aimX: null, aimY: null });

/** A press on this tick (held too). */
const press = (...b: Btn[]): InputFrame => {
  let m = 0;
  for (const x of b) m |= 1 << x;
  return { dx: 0, dy: 0, held: m, pressed: m, aimX: null, aimY: null };
};

const hold = (dx: number, dy: number, ...b: Btn[]): InputFrame => {
  let m = 0;
  for (const x of b) m |= 1 << x;
  return { dx, dy, held: m, pressed: 0, aimX: null, aimY: null };
};

function fresh(playerDef = HALCYON, enemyDef = NOCTURNE, seed = 1): OrbitSim {
  return new OrbitSim({ playerDef, enemyDef, seed, introTicks: 1 });
}

/** Both machines standing on the deck, `gap` apart, so nothing sinks out of a shot's path. */
function plant(sim: OrbitSim, gap: number): void {
  const [p, e] = sim.fighters;
  e.pos = { x: 10, y: sim.footHeight(e), z: 0 };
  p.pos = { x: 10 - gap, y: sim.footHeight(p), z: 0 };
  p.vel = { x: 0, y: 0, z: 0 };
  e.vel = { x: 0, y: 0, z: 0 };
}

function run(sim: OrbitSim, ticks: number, p0: () => InputFrame = idle, p1: () => InputFrame = idle): OrbitEvent[] {
  const all: OrbitEvent[] = [];
  for (let i = 0; i < ticks && sim.phase !== 'over'; i++) {
    sim.step(p0(), p1());
    all.push(...sim.events);
  }
  return all;
}

function duel(a: number, b: number, da: Difficulty, db: Difficulty, seed: number) {
  const sim = new OrbitSim({ playerDef: ROSTER[a], enemyDef: ROSTER[b], seed });
  const ai0 = new OrbitAI(0, da, sim.player, seed);
  const ai1 = new OrbitAI(1, db, sim.enemy, seed + 1);
  const events: Record<string, number> = {};
  let mobile = 0;
  while (sim.phase !== 'over') {
    sim.step(ai0.think(sim), ai1.think(sim));
    for (const e of sim.events) events[e.t] = (events[e.t] ?? 0) + 1;
    for (const f of sim.fighters) if (f.form === 'mobile') mobile++;
  }
  return { sim, events, mobileShare: mobile / (sim.tick * 2) };
}

describe('FREE ORBIT: the mode', () => {
  it('is a match mode with its own scene', () => {
    expect(MODE_LABELS.orbit).toBe('FREE ORBIT');
    expect(matchScene('orbit')).toBe('Orbit');
    expect(matchScene('vsCpu')).toBe('Battle');
    expect(matchScene('tutorial')).toBe('Battle');
  });
});

describe('FREE ORBIT: simulation', () => {
  it('replays bit for bit from a seed', () => {
    const play = () => {
      const sim = new OrbitSim({ playerDef: ROSTER[2], enemyDef: ROSTER[5], seed: 77 });
      const a = new OrbitAI(0, Difficulty.Extreme, sim.player, 77);
      const b = new OrbitAI(1, Difficulty.Hard, sim.enemy, 78);
      for (let i = 0; i < 2400 && sim.phase !== 'over'; i++) sim.step(a.think(sim), b.think(sim));
      return JSON.stringify(sim.fighters.map((f) => [f.life, f.pos, f.form, f.sat]));
    };
    expect(play()).toBe(play());
  });

  it("flies at each machine's own speeds, converted from the side-on game", () => {
    for (const def of ROSTER) {
      const sim = fresh(def, NOCTURNE);
      run(sim, 90, () => hold(0, -1));
      const f = sim.player;
      const speed = Math.hypot(f.vel.x, f.vel.z);
      expect(speed).toBeGreaterThan(def.flight.maxSpeed * PX * 0.9);
      expect(speed).toBeLessThanOrEqual(def.flight.maxSpeed * PX * 1.01);
    }
  });

  it('climbs on boost with no direction, and sinks back without thrust', () => {
    const sim = fresh();
    const y0 = sim.player.pos.y;
    run(sim, 40, () => hold(0, 0, Btn.Boost));
    const high = sim.player.pos.y;
    expect(high).toBeGreaterThan(y0 + 1);
    run(sim, 120);
    expect(sim.player.pos.y).toBeLessThan(high);
  });

  it('tap boost with a direction is a dash', () => {
    const sim = fresh();
    run(sim, 2);
    let t = 0;
    const ev = run(sim, 4, () => (t++ === 0 ? { ...press(Btn.Boost), dx: 1 } : hold(1, 0)));
    expect(ev.some((e) => e.t === 'dash')).toBe(true);
    expect(Math.hypot(sim.player.vel.x, sim.player.vel.z)).toBeGreaterThan(HALCYON.flight.boostMaxSpeed * PX);
  });

  it('keeps machines inside the yard and out of the gantry', () => {
    const sim = fresh();
    const f = sim.player;
    f.pos = { x: ARENA.maxX + 20, y: 50, z: ARENA.minZ - 9 };
    run(sim, 1);
    expect(f.pos.x).toBeLessThanOrEqual(ARENA.maxX);
    expect(f.pos.z).toBeGreaterThanOrEqual(ARENA.minZ);
    expect(f.pos.y).toBeLessThanOrEqual(ARENA.ceiling);
    // Dropped into the middle of a pylon, it is pushed clear.
    const b = OBSTACLES[0];
    f.pos = { x: (b.min.x + b.max.x) / 2, y: 10, z: (b.min.z + b.max.z) / 2 };
    f.vel = { x: 0, y: 0, z: 0 };
    run(sim, 1);
    const inside = f.pos.x > b.min.x && f.pos.x < b.max.x && f.pos.z > b.min.z && f.pos.z < b.max.z && f.pos.y < b.max.y;
    expect(inside).toBe(false);
  });

  it('a pylon blocks line of sight', () => {
    const b = OBSTACLES[0];
    const cz = (b.min.z + b.max.z) / 2;
    expect(lineOfSight({ x: b.min.x - 5, y: 8, z: cz }, { x: b.max.x + 5, y: 8, z: cz })).toBe(false);
    expect(lineOfSight({ x: -10, y: 8, z: 4 }, { x: 10, y: 8, z: 4 })).toBe(true);
  });

  it('the lock-on leads a moving target and not a still one', () => {
    const sim = fresh();
    const e = sim.enemy;
    e.vel = { x: 0, y: 0, z: 0 };
    const still = OrbitSim.lead(sim.player.pos, e, 0.3);
    expect(still.x).toBeCloseTo(e.pos.x);
    expect(still.z).toBeCloseTo(e.pos.z);
    e.vel = { x: 0, y: 0, z: 0.15 };
    const moving = OrbitSim.lead(sim.player.pos, e, 0.3);
    expect(moving.z).toBeGreaterThan(e.pos.z + 1);
  });

  it('weapons, gauges and damage come straight from the MechDef', () => {
    const sim = fresh();
    run(sim, 2);
    plant(sim, 6);
    const e0 = sim.player.energy;
    let t = 0;
    const shoot = (): InputFrame => (t++ === 0 ? press(Btn.Main) : idle());
    const ev = run(sim, 6, shoot);
    expect(e0 - sim.player.energy).toBeCloseTo(HALCYON.main.energyCost, 0);
    ev.push(...run(sim, 40, shoot));
    const hit = ev.find((x) => x.t === 'hit');
    expect(hit && hit.t === 'hit' ? hit.damage : 0).toBeCloseTo(HALCYON.main.damage * NOCTURNE.defence.mul * NOCTURNE.defence.groundedMul, 3);
  });
});

describe('FREE ORBIT: transformation', () => {
  it('every machine transforms to mobile form and back', () => {
    for (const def of ROSTER) {
      const sim = fresh(def, NOCTURNE);
      run(sim, 2);
      const ev = run(sim, 1, () => press(Btn.Flight));
      expect(ev.some((e) => e.t === 'transform' && e.to === 'mobile')).toBe(true);
      expect(sim.player.transformTicks).toBe(TRANSFORM_TICKS);
      expect(sim.player.act).toBe(OrbitAct.Transform);
      const done = run(sim, TRANSFORM_TICKS);
      expect(done.some((e) => e.t === 'transformed' && e.form === 'mobile')).toBe(true);
      expect(sim.player.form).toBe('mobile');
      run(sim, 1, () => press(Btn.Flight));
      run(sim, TRANSFORM_TICKS);
      expect(sim.player.form).toBe('mech');
    }
  });

  it('the mobile form cruises faster than the mech boosts, and cruising is free', () => {
    const sim = fresh();
    run(sim, 2);
    run(sim, 1, () => press(Btn.Flight));
    run(sim, TRANSFORM_TICKS + 60);
    const f = sim.player;
    const speed = Math.hypot(f.vel.x, f.vel.y, f.vel.z);
    expect(speed).toBeGreaterThan(HALCYON.flight.boostMaxSpeed * PX * 1.2);
    expect(speed).toBeCloseTo(HALCYON.flight.boostMaxSpeed * PX * MOBILE.cruise, 2);
    const b0 = f.boost;
    run(sim, 60);
    expect(f.boost).toBeGreaterThanOrEqual(b0);
  });

  it('steers like an aircraft: left and right turn the nose', () => {
    const sim = fresh();
    run(sim, 2);
    run(sim, 1, () => press(Btn.Flight));
    run(sim, TRANSFORM_TICKS);
    const yaw0 = sim.player.yaw;
    run(sim, 20, () => hold(1, 0));
    expect(sim.player.yaw).toBeLessThan(yaw0 - 0.5);
  });

  it('the mobile form has the nose gun only; the sword or the heavy turns it back', () => {
    const sim = fresh();
    run(sim, 2);
    run(sim, 1, () => press(Btn.Flight));
    run(sim, TRANSFORM_TICKS + 5);
    const shots = run(sim, 2, () => press(Btn.Heavy));
    expect(shots.some((e) => e.t === 'fire')).toBe(false);
    expect(shots.some((e) => e.t === 'transform' && e.to === 'mech')).toBe(true);
    run(sim, TRANSFORM_TICKS + 2);
    expect(sim.player.form).toBe('mech');
    // Back in mobile form, the main gun fires.
    run(sim, 1, () => press(Btn.Flight));
    run(sim, TRANSFORM_TICKS + 5);
    const gun = run(sim, 12, () => hold(0, 0, Btn.Main));
    expect(gun.some((e) => e.t === 'fire' && e.owner === 0)).toBe(true);
  });

  it('a hit knocks a mobile machine back into a mech', () => {
    const sim = fresh();
    run(sim, 2);
    run(sim, 1, () => press(Btn.Flight));
    run(sim, TRANSFORM_TICKS);
    expect(sim.player.form).toBe('mobile');
    const p = sim.player;
    const e = sim.enemy;
    e.pos = { x: p.pos.x + 8, y: p.pos.y, z: p.pos.z };
    p.vel = { x: 0, y: 0, z: 0 };
    let landed = false;
    for (let i = 0; i < 90 && !landed; i++) {
      sim.step(idle(), i % 10 === 0 ? press(Btn.Main) : idle());
      landed = sim.events.some((x) => x.t === 'hit' && x.victim === 0);
      p.vel = { x: 0, y: 0, z: 0 };
    }
    expect(landed).toBe(true);
    expect(sim.player.form).toBe('mech');
  });
});

describe('FREE ORBIT: close combat and defence', () => {
  it("one press runs the machine's whole sword sequence", () => {
    for (const def of [HALCYON, NOCTURNE, ROSTER[3]]) {
      const sim = fresh(def, HALCYON);
      run(sim, 2);
      sim.player.pos = { x: sim.enemy.pos.x - 5, y: sim.enemy.pos.y, z: sim.enemy.pos.z };
      let t = 0;
      const ev = run(sim, 260, () => (t++ === 0 ? press(Btn.Melee) : idle()));
      const hits = ev.filter((e) => e.t === 'hit' && e.owner === 0).length;
      expect(hits).toBe(def.meleeLock.hits);
      expect(sim.player.ml).toBeNull();
    }
  });

  it('a raised guard takes a fraction of the damage', () => {
    const shoot = (guard: boolean): number => {
      const sim = fresh();
      run(sim, 2);
      plant(sim, 8);
      const p = sim.player;
      const l0 = p.life;
      for (let i = 0; i < 40; i++) {
        sim.step(guard ? hold(0, 0, Btn.Barrier) : idle(), i === 0 ? press(Btn.Main) : idle());
      }
      return l0 - p.life;
    };
    const open = shoot(false);
    const guarded = shoot(true);
    expect(open).toBeGreaterThan(0);
    expect(guarded).toBeGreaterThan(0);
    expect(guarded).toBeLessThan(open * 0.5);
  });

  it('a burst on the opening blow repels the sequence', () => {
    const sim = fresh();
    run(sim, 2);
    sim.player.pos = { x: sim.enemy.pos.x - 5, y: sim.enemy.pos.y, z: sim.enemy.pos.z };
    let t = 0;
    const ev = run(
      sim,
      60,
      () => (t === 1 ? press(Btn.Melee) : idle()),
      () => (t++ === 3 ? press(Btn.Barrier) : idle()),
    );
    expect(ev.some((e) => e.t === 'repel' && e.id === 1)).toBe(true);
    expect(ev.some((e) => e.t === 'hit' && e.owner === 0)).toBe(false);
  });

  it('a long ranged combo ends in a knockdown, and the downed machine is untouchable', () => {
    const sim = fresh();
    run(sim, 2);
    const p = sim.player;
    const e = sim.enemy;
    e.pos = { x: p.pos.x + 7, y: p.pos.y, z: p.pos.z };
    let downAt = -1;
    for (let i = 0; i < 600 && downAt < 0; i++) {
      sim.step(idle(), hold(0, 0, Btn.Main));
      e.energy = e.def.gauges.maxEnergy;
      if (sim.events.some((x) => x.t === 'knockdown' && x.id === 0)) downAt = sim.tick;
    }
    expect(downAt).toBeGreaterThan(0);
    expect(p.down).toBeGreaterThanOrEqual(DOWN_LIMIT);
    const lifeDown = p.life;
    for (let i = 0; i < KNOCKDOWN_TICKS - 2; i++) {
      sim.step(idle(), hold(0, 0, Btn.Main));
      e.energy = e.def.gauges.maxEnergy;
    }
    expect(p.life).toBe(lifeDown);
  });
});

describe('FREE ORBIT: the rival', () => {
  it('every machine can fight a full match at EXTREME, and transforms doing it', () => {
    let transforms = 0;
    let mobile = 0;
    for (let i = 0; i < 8; i++) {
      const r = duel(i, (i + 1) % 8, Difficulty.Extreme, Difficulty.Extreme, 100 + i);
      expect(r.sim.phase).toBe('over');
      expect(r.sim.outcome).not.toBe('none');
      // Both sides land hits.
      for (const f of r.sim.fighters) expect(f.life).toBeLessThan(f.def.gauges.maxLife);
      transforms += r.events.transform ?? 0;
      mobile += r.mobileShare;
    }
    expect(transforms).toBeGreaterThan(30);
    expect(mobile / 8).toBeGreaterThan(0.04);
  }, 60_000);

  it('fights last about as long as the side-on game\'s', () => {
    const secs: number[] = [];
    for (let i = 0; i < 8; i++) secs.push(duel(i, (i + 3) % 8, Difficulty.Extreme, Difficulty.Extreme, 300 + i).sim.tick / 60);
    const mean = secs.reduce((a, b) => a + b, 0) / secs.length;
    expect(mean).toBeGreaterThan(25);
    expect(mean).toBeLessThan(120);
  }, 60_000);

  const ladder = (hi: Difficulty, lo: Difficulty): { wins: number; n: number; lead: number } => {
    let wins = 0;
    let n = 0;
    let lead = 0;
    for (let m = 0; m < 8; m++) {
      for (let k = 0; k < 2; k++) {
        const seed = 900 + m * 7 + k;
        const r = k === 0 ? duel(m, m, hi, lo, seed) : duel(m, m, lo, hi, seed);
        const side = k === 0 ? 0 : 1;
        n++;
        const o = r.sim.outcome;
        if ((o === 'playerWin' && side === 0) || (o === 'enemyWin' && side === 1)) wins++;
        const fr = (f: (typeof r.sim.fighters)[number]) => Math.max(0, f.life) / f.def.gauges.maxLife;
        lead += fr(r.sim.fighters[side]) - fr(r.sim.fighters[1 - side]);
      }
    }
    return { wins, n, lead: lead / n };
  };

  it('EXTREME beats EASY nearly every time', () => {
    const r = ladder(Difficulty.Extreme, Difficulty.Easy);
    expect(r.wins / r.n).toBeGreaterThanOrEqual(0.85);
    expect(r.lead).toBeGreaterThan(0.25);
  }, 120_000);

  it('EXTREME beats HARD more often than not', () => {
    const r = ladder(Difficulty.Extreme, Difficulty.Hard);
    expect(r.wins / r.n).toBeGreaterThan(0.6);
    expect(r.lead).toBeGreaterThan(0.05);
  }, 120_000);

  it('HARD beats NORMAL, and NORMAL beats EASY', () => {
    const a = ladder(Difficulty.Hard, Difficulty.Normal);
    const b = ladder(Difficulty.Normal, Difficulty.Easy);
    expect(a.wins / a.n).toBeGreaterThan(0.6);
    expect(b.wins / b.n).toBeGreaterThan(0.55);
    expect(a.lead).toBeGreaterThan(0);
    expect(b.lead).toBeGreaterThan(0);
  }, 120_000);
});
