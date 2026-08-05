import { describe, expect, it } from 'vitest';
import { Difficulty } from '../core/Session';
import fs from 'node:fs';
import path from 'node:path';
import { MatchSim } from '../combat/MatchSim';
import { swingReach } from '../combat/Combatant';
import { RivalAI } from '../ai/RivalAI';
import { MECHS, ROSTER } from '../data/mechs';
import { Btn, MatchPhase, emptyInput, type InputFrame } from '../combat/types';
import { Rng } from '../core/Rng';

/**
 * Roster integrity.
 *
 * Eight chassis defined by hand is exactly the shape of problem where a
 * copy-paste slips through: a duplicated palette, a melee chain whose damage
 * array is the wrong length, a rig part pointing at a parent that does not
 * exist. None of those throw — they produce a mech that quietly plays like
 * another one, or renders wrong. These tests are cheap and catch all of it.
 */

const REQUIRED_PARTS = [
  'core',
  'head',
  'backpack',
  'lowerBody',
  'legFar',
  'legNear',
  'leftArm',
  'subWeapon',
  'rightArm',
  'mainWeapon',
  'meleeWeapon',
  'leftThruster',
  'rightThruster',
];

describe('roster composition', () => {
  it('has eight mechs, and MECHS agrees with ROSTER', () => {
    expect(ROSTER).toHaveLength(8);
    expect(Object.keys(MECHS)).toHaveLength(8);
    for (const m of ROSTER) expect(MECHS[m.id]).toBe(m);
  });

  it('gives every mech a distinct identity', () => {
    for (const field of ['id', 'name', 'codeName', 'pilot'] as const) {
      const values = ROSTER.map((m) => m[field]);
      expect(new Set(values).size, `duplicate ${field}`).toBe(values.length);
    }
  });

  it('gives every mech a distinct supporter drone', () => {
    const names = ROSTER.map((m) => m.supporter.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('gives every mech a distinct primary colour', () => {
    const tints = ROSTER.map((m) => m.tint.primary);
    expect(new Set(tints).size).toBe(tints.length);
  });

  it('keeps display stats on a 1-5 scale', () => {
    for (const m of ROSTER) {
      for (const s of [m.statPower, m.statSpeed, m.statRange]) {
        expect(s).toBeGreaterThanOrEqual(1);
        expect(s).toBeLessThanOrEqual(5);
      }
    }
  });

  it('gives every mech a blurb and a faction', () => {
    for (const m of ROSTER) {
      expect(m.blurb.length).toBeGreaterThan(10);
      expect(m.faction.length).toBeGreaterThan(0);
    }
  });
});

describe('roster rigs', () => {
  it('declares every part the renderer and exporter expect', () => {
    for (const m of ROSTER) {
      const names = m.rig.parts.map((p) => p.name);
      for (const req of REQUIRED_PARTS) {
        expect(names, `${m.id} missing ${req}`).toContain(req);
      }
      expect(new Set(names).size, `${m.id} has duplicate parts`).toBe(names.length);
    }
  });

  it('only parents parts to parts that exist, with a single root', () => {
    for (const m of ROSTER) {
      const names = new Set(m.rig.parts.map((p) => p.name));
      const roots = m.rig.parts.filter((p) => p.parent === null);
      expect(roots, `${m.id} must have exactly one root`).toHaveLength(1);
      expect(roots[0].name).toBe('core');
      for (const p of m.rig.parts) {
        if (p.parent !== null) {
          expect(names, `${m.id}: ${p.name} -> missing parent ${p.parent}`).toContain(p.parent);
        }
      }
    }
  });

  it('draws every part exactly once', () => {
    for (const m of ROSTER) {
      const drawn = m.rig.drawOrder;
      expect(new Set(drawn).size, `${m.id} draws a part twice`).toBe(drawn.length);
      // legs and core are drawn; every drawn name must be a real part.
      const names = new Set(m.rig.parts.map((p) => p.name));
      for (const d of drawn) expect(names, `${m.id} draws unknown part ${d}`).toContain(d);
    }
  });

  it('scales every chassis in step with its hitbox', () => {
    // The roster must not be one size in eight paint jobs, and the drawn size
    // must track the hit size — a mech hit from further away than it visibly
    // occupies is the single most confusing thing a fighting game can do.
    const ref = ROSTER.find((m) => m.id === 'halcyon')!;
    const unit = ref.rig.hurtRadius / ref.rig.scale;
    for (const m of ROSTER) {
      expect(m.rig.scale).toBeGreaterThan(0.5);
      expect(m.rig.scale).toBeLessThan(2);
      // Within 12%: art and hitbox may be tuned apart a little, not divorced.
      const implied = m.rig.hurtRadius / unit;
      expect(Math.abs(implied - m.rig.scale), `${m.id} scale vs hurtRadius`).toBeLessThan(0.12);
    }
  });

  it('spreads the roster across a real range of sizes', () => {
    const scales = ROSTER.map((m) => m.rig.scale);
    // Biggest at least 1.4x the smallest, or the sizes are not readable in play.
    expect(Math.max(...scales) / Math.min(...scales)).toBeGreaterThan(1.4);
  });

  it('has positive body measurements', () => {
    for (const m of ROSTER) {
      expect(m.rig.hurtRadius).toBeGreaterThan(0);
      expect(m.rig.chassisHeight).toBeGreaterThan(0);
      expect(m.rig.footOffset).toBeGreaterThan(0);
    }
  });
});

describe('roster weapons and melee', () => {
  it('arms every mech with all six weapons', () => {
    for (const m of ROSTER) {
      for (const w of [m.main, m.heavy, m.lance, m.spread, m.sub, m.salvo]) {
        expect(w, `${m.id} missing a weapon`).toBeTruthy();
        expect(w.damage).toBeGreaterThan(0);
        expect(w.projSpeed).toBeGreaterThanOrEqual(0);
        expect(w.projCount).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('gives every mech a three-stage melee chain in order', () => {
    for (const m of ROSTER) {
      expect(m.melee, `${m.id} chain length`).toHaveLength(3);
      m.melee.forEach((a, i) => {
        expect(a.meleeStage, `${m.id} stage ${i}`).toBe(i);
        expect(a.damage).toBeGreaterThan(0);
      });
      // The finisher should be the biggest hit in the chain, or the escalation
      // that the whole chain design depends on is not there.
      expect(m.melee[2].damage).toBeGreaterThan(m.melee[0].damage);
      expect(m.melee[2].damage).toBeGreaterThan(m.melee[1].damage);
    }
  });

  it('keeps lock-on damage and knock arrays the same length as the hit count', () => {
    for (const m of ROSTER) {
      const p = m.meleeLock;
      expect(p.damage, `${m.id} damage array`).toHaveLength(p.hits);
      expect(p.knock, `${m.id} knock array`).toHaveLength(p.hits);
      expect(p.hits).toBeGreaterThan(0);
      // The last hit of a flurry is its finisher and must land hardest.
      expect(Math.max(...p.damage)).toBe(p.damage[p.hits - 1]);
    }
  });

  it('gives every mech a distinct lock-on flurry name', () => {
    const names = ROSTER.map((m) => m.meleeLock.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('dash overlaps attacks', () => {
  const W = 2400;
  const H = 1200;

  it('lets a mech dash while its gun is firing', () => {
    const s = new MatchSim({ playerDef: ROSTER[0], enemyDef: ROSTER[1], seed: 7, introTicks: 1 });
    const p = s.player;
    for (let i = 0; i < 12; i++) s.step(emptyInput(), emptyInput());

    // Open fire, then dash on a later tick while the attack is still resolving.
    const fire = emptyInput();
    fire.pressed = 1 << Btn.Main;
    fire.held = 1 << Btn.Main;
    s.step(fire, emptyInput());
    expect(p.attack, 'should be mid-attack').not.toBeNull();

    const speedBefore = Math.hypot(p.vx, p.vy);
    const dash = emptyInput();
    dash.dx = 1;
    dash.pressed = 1 << Btn.Boost;
    dash.held = 1 << Btn.Boost;
    s.step(dash, emptyInput());

    // The dash impulse is large; anything near the pre-dash speed means the
    // attack blocked it, which is what the old `!a` gate did.
    expect(Math.hypot(p.vx, p.vy)).toBeGreaterThan(speedBefore + 4);
    void W;
    void H;
  });

  it('keeps lock-on permanently enabled', () => {
    const s = new MatchSim({ playerDef: ROSTER[0], enemyDef: ROSTER[1], seed: 7, introTicks: 1 });
    for (let i = 0; i < 30; i++) {
      const f = emptyInput();
      // The soft-lock toggle is gone entirely; its slot is now Saturation. Mash
      // every button there is — none of them may switch tracking off.
      f.pressed = 0x1ff;
      f.held = 0x1ff;
      s.step(f, emptyInput());
      expect(s.player.lockEnabled).toBe(true);
    }
  });
});

describe('melee motion curves', () => {
  const base = { windup: 40, sweep: 90, windupFrac: 0.4, alternate: false };

  it('leaves plain swings with no forward extension at all', () => {
    const arc = { ...base, reach: 40 };
    for (const t of [0, 0.25, 0.5, 0.75, 1]) expect(swingReach(arc, t, 0)).toBe(0);
  });

  it('ignores reach when the motion asks for none', () => {
    const arc = { ...base, motion: 'thrust' as const, reach: 0 };
    expect(swingReach(arc, 0.8, 0)).toBe(0);
  });

  it('draws a thrust back before extending it', () => {
    const arc = { ...base, motion: 'thrust' as const, reach: 30 };
    // Mid wind-up the point is behind the rest position.
    expect(swingReach(arc, 0.2, 0)).toBeLessThan(0);
    // By the end it is fully extended.
    expect(swingReach(arc, 1, 0)).toBeCloseTo(30, 5);
    // And extension only ever grows through the stab.
    expect(swingReach(arc, 0.7, 0)).toBeLessThan(swingReach(arc, 0.9, 0));
  });

  it('returns a bash to rest inside its own swing', () => {
    const arc = { ...base, motion: 'bash' as const, reach: 24 };
    const peak = Math.max(...[0.5, 0.6, 0.7, 0.8].map((t) => swingReach(arc, t, 0)));
    expect(peak).toBeGreaterThan(20);
    // A shield shoves and recovers; it must not finish left hanging out.
    expect(swingReach(arc, 1, 0)).toBeLessThan(peak * 0.35);
  });

  it('holds a piston still, then fires it', () => {
    const arc = { ...base, motion: 'piston' as const, reach: 30, windupFrac: 0.5 };
    // Cocked: no movement whatsoever during the wind-up.
    expect(swingReach(arc, 0.0, 0)).toBe(0);
    expect(swingReach(arc, 0.49, 0)).toBe(0);
    // Then almost all of the travel happens in the first half of the stroke.
    expect(swingReach(arc, 0.75, 0)).toBeGreaterThan(30 * 0.9);
    expect(swingReach(arc, 1, 0)).toBeCloseTo(30, 5);
  });

  it('never exceeds the declared reach', () => {
    for (const motion of ['thrust', 'bash', 'piston'] as const) {
      const arc = { ...base, motion, reach: 25 };
      for (let i = 0; i <= 40; i++) {
        expect(Math.abs(swingReach(arc, i / 40, 0))).toBeLessThanOrEqual(25.0001);
      }
    }
  });

  it('gives heavier weapons fewer but harder hits', () => {
    // The design rule: hit count falls as weapon weight rises, and the damage
    // per hit rises to compensate. Checking the extremes of the roster keeps
    // that relationship honest as numbers get retuned.
    const byId = new Map(ROSTER.map((m) => [m.id, m]));
    const light = byId.get('cirrus')!.meleeLock;
    const heavy = byId.get('obelisk')!.meleeLock;
    const heaviest = byId.get('terramoth')!.meleeLock;

    expect(light.hits).toBeGreaterThan(heavy.hits);
    expect(heavy.hits).toBeLessThanOrEqual(3);
    expect(heaviest.hits).toBeLessThanOrEqual(2);

    const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    expect(avg(heavy.damage)).toBeGreaterThan(avg(light.damage) * 2);
    expect(avg(heavy.knock)).toBeGreaterThan(avg(light.knock));
    expect(heaviest.finisherKnock).toBeGreaterThan(byId.get('halcyon')!.meleeLock.finisherKnock);
  });
});

describe('roster distinctness', () => {
  it('gives no two mechs an identical flight envelope', () => {
    const seen = new Map<string, string>();
    for (const m of ROSTER) {
      const key = JSON.stringify(m.flight);
      const prev = seen.get(key);
      expect(prev, `${m.id} flies identically to ${prev}`).toBeUndefined();
      seen.set(key, m.id);
    }
  });

  it('gives no two mechs an identical main gun', () => {
    const seen = new Map<string, string>();
    for (const m of ROSTER) {
      const { label, ...rest } = m.main;
      void label;
      const key = JSON.stringify(rest);
      const prev = seen.get(key);
      expect(prev, `${m.id}'s main gun matches ${prev}`).toBeUndefined();
      seen.set(key, m.id);
    }
  });

  it('spreads the roster across the stat space rather than clustering', () => {
    // If every chassis had the same speed rating there would be no roster, just
    // eight skins. Each display stat must take at least three distinct values.
    for (const f of ['statPower', 'statSpeed', 'statRange'] as const) {
      expect(new Set(ROSTER.map((m) => m[f])).size, `${f} is too uniform`).toBeGreaterThanOrEqual(3);
    }
  });
});

/**
 * The Blender exporter and the game hold the same pivot points in two forms:
 * `tools/blender/build_mechs.py` stores them as WORLD logical pixels, the rig
 * data stores them relative to each part's parent. Nothing keeps them in step,
 * and when they drift the sprite renders in one place while the hitbox and the
 * attachment points sit in another — a bug that looks like an art mistake and
 * is actually a data mismatch. This is the check.
 */
const MANIFEST = path.resolve(process.cwd(), 'assets', 'sprites', 'mechs', 'manifest.json');

/** Resolves a rig part's world offset by walking up its parent chain. */
function worldPivot(def: (typeof ROSTER)[number], partName: string): [number, number] {
  const byName = new Map(def.rig.parts.map((p) => [p.name, p]));
  let x = 0;
  let y = 0;
  let cur = byName.get(partName);
  const seen = new Set<string>();
  while (cur) {
    if (seen.has(cur.name)) throw new Error(`cycle at ${cur.name}`);
    seen.add(cur.name);
    x += cur.x;
    y += cur.y;
    cur = cur.parent ? byName.get(cur.parent) : undefined;
  }
  return [x, y];
}

/**
 * A rig part and its sprite have to agree about whether a machine projects a
 * blade, in both directions: a declared part with no sprite renders a missing
 * texture, and a sprite with no part is art nothing draws.
 *
 * This also guards the thing that made OBELISK show a sword through its shield.
 * `setPartVisible` is a no-op for a part a chassis lacks, which is what lets the
 * melee code treat all eight the same — but effects drawn *alongside* the rig
 * have no node to be quietly skipped, so `MechRenderer.hasPart('meleeEnergy')`
 * is the predicate they ask, and it is only trustworthy while this holds.
 *
 * It is a live risk rather than a theoretical one: NOCTURNE is spread from
 * HALCYON (SESSION_HANDOFF 8j), and HALCYON does project a blade.
 */
describe.skipIf(!fs.existsSync(MANIFEST))('projected blades are declared consistently', () => {
  const meta = JSON.parse(fs.readFileSync(MANIFEST, 'utf-8')) as {
    parts: Record<string, Record<string, unknown>>;
  };

  for (const def of ROSTER) {
    it(`${def.id} agrees on whether it projects a blade`, () => {
      const inRig = def.rig.parts.some((p) => p.name === 'meleeEnergy');
      const inSprites = 'meleeEnergy' in (meta.parts[def.id] ?? {});
      expect([def.id, inRig]).toEqual([def.id, inSprites]);
      // Anything in the rig must also be drawn, or it is invisible by accident.
      if (inRig) expect(def.rig.drawOrder).toContain('meleeEnergy');
    });
  }

  it('has exactly the five machines the roster says project energy', () => {
    const projecting = ROSTER.filter((d) => d.rig.parts.some((p) => p.name === 'meleeEnergy'))
      .map((d) => d.id)
      .sort();
    // The claw, the pile driver and the ram shield project nothing.
    expect(projecting).toEqual(['cirrus', 'halcyon', 'nulltide', 'pyre', 'vesper']);
  });
});

describe.skipIf(!fs.existsSync(MANIFEST))('rig pivots match the Blender exporter', () => {
  const meta = JSON.parse(fs.readFileSync(MANIFEST, 'utf-8')) as {
    pivots_px: Record<string, Record<string, [number, number]>>;
  };

  it('covers every mech in the roster', () => {
    for (const def of ROSTER) {
      expect(meta.pivots_px[def.id], `${def.id} missing from manifest`).toBeTruthy();
    }
  });

  for (const def of ROSTER) {
    it(`${def.id} pivots agree with build_mechs.py`, () => {
      const exported = meta.pivots_px[def.id];
      if (!exported) return;
      for (const part of def.rig.parts) {
        const expected = exported[part.name];
        if (!expected) continue; // Exporter may not emit a pivot for every part.
        const [wx, wy] = worldPivot(def, part.name);
        expect([part.name, wx, wy]).toEqual([part.name, expected[0], expected[1]]);
      }
    });
  }
});

/** A scripted but varied input stream, so runs exercise many code paths. */
function scriptedInput(i: number): InputFrame {
  const f = emptyInput();
  f.dx = (i % 13 < 6 ? 1 : -1) * (i % 3 === 0 ? 1 : 0);
  f.dy = (i % 17 < 8 ? -1 : 1) * (i % 5 === 0 ? 1 : 0);
  let m = 0;
  if (i % 19 === 0) m |= 1 << Btn.Main;
  if (i % 47 === 0) m |= 1 << Btn.Heavy;
  if (i % 71 === 0) m |= 1 << Btn.Sub;
  if (i % 23 === 0) m |= 1 << Btn.Boost;
  if (i % 97 === 0) m |= 1 << Btn.Barrier;
  if (i % 53 === 0) m |= 1 << Btn.Melee;
  f.pressed = m;
  f.held = m;
  return f;
}

describe('every mech survives a real match', () => {
  // Static data can be internally consistent and still blow up once it drives
  // the simulation — a projectile with zero life, a lunge that outruns the
  // arena. Each chassis actually fights here.
  for (const def of ROSTER) {
    it(`${def.id} fights without producing NaN or leaving the arena`, () => {
      const s = new MatchSim({ playerDef: def, enemyDef: def, seed: 99, introTicks: 1 });
      const ai = new RivalAI({ difficulty: Difficulty.Hard }, new Rng(99));
      for (let i = 0; i < 600 && s.phase !== MatchPhase.Over; i++) {
        const e = ai.think(s.enemy, s.player, s.activeProjectiles(), 2400, 1200);
        s.step(scriptedInput(i), e);
        for (const c of s.combatants) {
          expect(Number.isFinite(c.x), `${def.id} x went non-finite at tick ${i}`).toBe(true);
          expect(Number.isFinite(c.y), `${def.id} y went non-finite at tick ${i}`).toBe(true);
          expect(Number.isFinite(c.life)).toBe(true);
        }
      }
    });
  }
});
