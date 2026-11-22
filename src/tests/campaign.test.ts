import { describe, expect, it } from 'vitest';
import { Coroutine, Latch, ScriptRunner, ticks, type Script } from '../campaign/Script';
import { STEP_DOWN, STEP_UP, WalkModel } from '../campaign/WorldModel';

describe('story scripts', () => {
  it('waits on numbers, waitables, sub-scripts and parallel lists', () => {
    const log: string[] = [];
    const latch = new Latch<string>();
    function* sub(): Script {
      yield 2;
      log.push('sub done');
      return 7;
    }
    function* main(): Script {
      log.push('start');
      yield 3;
      log.push('after 3');
      const v = (yield sub()) as number;
      log.push(`sub gave ${v}`);
      const said = (yield latch) as string;
      log.push(`latch ${said}`);
      yield [ticks(4), ticks(2)];
      log.push('parallel');
      return 'end';
    }
    const c = new Coroutine(main());
    let n = 0;
    while (c.tick() && n < 100) {
      n++;
      if (n === 12) latch.finish('yes');
    }
    expect(log).toEqual(['start', 'after 3', 'sub done', 'sub gave 7', 'latch yes', 'parallel']);
    expect(c.result).toBe('end');
    expect(n).toBeGreaterThan(12);
  });

  it('the main script holds control; background scripts do not', () => {
    const r = new ScriptRunner();
    function* cut(): Script {
      yield 5;
    }
    function* pacing(): Script {
      for (;;) yield 1;
    }
    r.parallel(pacing());
    expect(r.busy).toBe(false);
    expect(r.run(cut())).toBe(true);
    expect(r.busy).toBe(true);
    expect(r.run(cut())).toBe(false);
    for (let i = 0; i < 10; i++) r.tick();
    expect(r.busy).toBe(false);
  });

  it('a script that throws is stopped and reported, not fatal', () => {
    const r = new ScriptRunner();
    function* bad(): Script {
      yield 1;
      throw new Error('missing actor');
    }
    r.run(bad());
    for (let i = 0; i < 5; i++) r.tick();
    expect(r.busy).toBe(false);
    expect(String(r.errors[0])).toContain('missing actor');
  });
});

describe('walking the Reach', () => {
  const yard = (): WalkModel =>
    new WalkModel().add({
      decks: [
        { x0: 0, z0: 0, x1: 20, z1: 20, y: 0 },
        // A raised platform, too high to step onto.
        { x0: 10, z0: 0, x1: 20, z1: 5, y: 2 },
        // A curb you can step onto.
        { x0: 0, z0: 10, x1: 5, z1: 20, y: 0.3 },
      ],
      ramps: [{ x0: 6, z0: 0, x1: 10, z1: 5, y0: 0, y1: 2, axis: 'x' }],
      walls: [{ x0: 2, y0: 0, z0: 4, x1: 3, y1: 3, z1: 6 }],
    });

  it('stands on the highest surface within a step', () => {
    const w = yard();
    expect(w.ground(1, 1, 0)).toBe(0);
    expect(w.ground(15, 2, 0)).toBe(0);
    expect(w.ground(15, 2, 2)).toBe(2);
    expect(w.ground(2, 12, 0)).toBeCloseTo(0.3);
    expect(w.ground(-5, 1, 0)).toBeNull();
  });

  it('walks under a catwalk, but into a platform', () => {
    const w = yard().add({ decks: [{ x0: 0, z0: 8, x1: 20, z1: 9, y: 4, under: 3.6 }] });
    let p = { x: 1, y: 0, z: 7 };
    for (let i = 0; i < 30; i++) p = w.move(p, 0, 0.1);
    expect(p.z).toBeGreaterThan(9);
    expect(p.y).toBe(0);
  });

  it('walks up a ramp onto the platform', () => {
    const w = yard();
    let p = { x: 5, y: 0, z: 2 };
    for (let i = 0; i < 80; i++) p = w.move(p, 0.1, 0);
    expect(p.x).toBeGreaterThan(12);
    expect(p.y).toBeCloseTo(2);
  });

  it('cannot climb a ledge higher than a step', () => {
    const w = yard();
    let p = { x: 15, y: 0, z: 8 };
    for (let i = 0; i < 60; i++) p = w.move(p, 0, -0.1);
    // Stopped against the platform's face.
    expect(p.z).toBeGreaterThan(5);
    expect(p.y).toBe(0);
    expect(STEP_UP).toBeLessThan(2);
  });

  it('never walks off the edge of a yard', () => {
    const w = yard();
    let p = { x: 1, y: 0, z: 15 };
    for (let i = 0; i < 100; i++) p = w.move(p, -0.2, 0);
    expect(p.x).toBeGreaterThan(0);
    expect(w.ground(p.x, p.z, p.y)).not.toBeNull();
  });

  it('steps down a little, but not off a drop', () => {
    const w = yard();
    // Off the curb (0.3 m): fine.
    let p = { x: 4.5, y: 0.3, z: 15 };
    for (let i = 0; i < 20; i++) p = w.move(p, 0.1, 0);
    expect(p.x).toBeGreaterThan(5.5);
    expect(p.y).toBe(0);
    // Off the raised platform's far side (2 m): refused.
    let q = { x: 15, y: 2, z: 4 };
    for (let i = 0; i < 40; i++) q = w.move(q, 0, 0.1);
    expect(q.z).toBeLessThanOrEqual(5);
    expect(STEP_DOWN).toBeLessThan(2);
  });

  it('slides along a wall instead of sticking', () => {
    const w = yard();
    // Straight into the corner of the wall, diagonally: it slides round.
    let p = { x: 1.2, y: 0, z: 3 };
    for (let i = 0; i < 60; i++) p = w.move(p, 0.1, 0.1);
    expect(p.z).toBeGreaterThan(6);
    expect(w.blocked(p.x, p.z, p.y)).toBe(false);
  });
});

import { REGIONS, SPANS, buildReachWalk, edgeToward, regionById, spanGeometry, homeOf, worldOf } from '../campaign/Regions';
import { PILOT_IDS } from '../account/Accounts';

/** Walks toward each waypoint in turn; returns where it ended up. */
function walkPath(w: ReturnType<typeof buildReachWalk>, start: { x: number; y: number; z: number }, path: { x: number; z: number }[]) {
  let p = { ...start };
  for (const t of path) {
    for (let i = 0; i < 4000; i++) {
      const dx = t.x - p.x;
      const dz = t.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.4) break;
      const s = Math.min(0.15, d);
      p = w.move(p, (dx / d) * s, (dz / d) * s);
    }
  }
  return p;
}

describe('the Reach is one connected world', () => {
  const w = buildReachWalk();

  it('every pilot has a home region to start in', () => {
    for (const id of PILOT_IDS) {
      const r = homeOf(id);
      expect(r.id).not.toBe('cathedral');
      const s = worldOf(r, r.spawn);
      expect(w.ground(s.x, s.z, s.y)).toBe(r.y);
    }
  });

  it('every region can be walked to Cathedral Yard and back', () => {
    for (const s of SPANS) {
      const A = regionById(s.from)!;
      const B = regionById(s.to)!;
      const g = spanGeometry(s);
      const start = worldOf(A, A.spawn);
      // Spawn -> A's edge toward B -> the dog-leg corner -> B's edge -> B's centre.
      const eA = edgeToward(A, B.cx, B.cz);
      const xFirst = Math.abs(g.b.x - g.a.x) >= Math.abs(g.b.z - g.a.z);
      const corner = xFirst ? { x: g.b.x, z: g.a.z } : { x: g.a.x, z: g.b.z };
      const inA = { x: eA.x + (A.cx - eA.x) * 0.15, z: eA.z + (A.cz - eA.z) * 0.15 };
      // A few metres onto B's deck: far enough to be off the span, near enough
      // that no building on B stands in a straight line's way.
      const inB = { x: g.b.x + (B.cx - g.b.x) * 0.08, z: g.b.z + (B.cz - g.b.z) * 0.08 };
      const end = walkPath(w, start, [inA, eA, corner, { x: g.b.x, z: g.b.z }, inB]);
      expect(Math.hypot(end.x - inB.x, end.z - inB.z), `${s.from} -> ${s.to}`).toBeLessThan(1);
      expect(end.y).toBeCloseTo(B.y);
      // And back again.
      const back = walkPath(w, end, [{ x: g.b.x, z: g.b.z }, corner, eA, inA]);
      expect(Math.hypot(back.x - inA.x, back.z - inA.z), `${s.to} -> ${s.from}`).toBeLessThan(1);
      expect(back.y).toBeCloseTo(A.y);
    }
    expect(REGIONS.length).toBeGreaterThanOrEqual(8);
  });
});
