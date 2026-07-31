import { describe, expect, it } from 'vitest';
import { NEUTRAL_PLAYSTYLE, PLAYSTYLES, playstyleFor, type Playstyle } from '../ai/Playstyles';
import { ROSTER } from '../data/mechs';
import { MatchSim } from '../combat/MatchSim';
import { RivalAI } from '../ai/RivalAI';
import { Rng } from '../core/Rng';
import { Difficulty } from '../core/Session';
import { MatchPhase, SatMode } from '../combat/types';

/**
 * Playstyles are the layer that says *who* a pilot is, on top of the tier that
 * says how good they are. They are also the layer most able to quietly wreck the
 * roster: the first cut widened the balance spread from 0.555 to 0.854 and made
 * CIRRUS — the pilot the feature was designed around — the worst machine in the
 * game. The balance guard at the bottom of this file is the thing that would
 * have caught that.
 */
describe('playstyle table', () => {
  it('gives every mech on the roster a playstyle', () => {
    for (const m of ROSTER) {
      expect(PLAYSTYLES[m.id], m.id).toBeDefined();
      expect(PLAYSTYLES[m.id].mech).toBe(m.id);
    }
  });

  it('has no playstyle for a mech that does not exist', () => {
    const ids = new Set(ROSTER.map((m) => m.id));
    for (const k of Object.keys(PLAYSTYLES)) expect(ids.has(k)).toBe(true);
  });

  it('explains itself, so the numbers can be argued with', () => {
    for (const s of Object.values(PLAYSTYLES)) {
      expect(s.note.length, s.mech).toBeGreaterThan(40);
      // The characterisation should name its pilot; a note that could belong to
      // any row is not a justification.
      // Roster pilot names are upper case; the notes are prose.
      const pilot = ROSTER.find((m) => m.id === s.mech)!.pilot.split(/\s+/)[0].toLowerCase();
      expect(s.note.toLowerCase(), s.mech).toContain(pilot);
    }
  });

  /**
   * Bounded because these multiply tier values that are already tuned. A
   * playstyle is a lean, not a second difficulty dial — anything outside these
   * ranges is expressing a personality by breaking the game.
   */
  it('keeps every lever inside a sane range', () => {
    const check = (s: Playstyle) => {
      expect(s.aggressionMul, s.mech).toBeGreaterThanOrEqual(0.7);
      expect(s.aggressionMul, s.mech).toBeLessThanOrEqual(1.35);
      expect(s.rangeMul, s.mech).toBeGreaterThanOrEqual(0.5);
      expect(s.rangeMul, s.mech).toBeLessThanOrEqual(1.5);
      expect(Math.abs(s.meleeAppetite), s.mech).toBeLessThanOrEqual(0.4);
      expect(s.dashMul, s.mech).toBeGreaterThanOrEqual(0.5);
      expect(s.dashMul, s.mech).toBeLessThanOrEqual(1.6);
      expect(s.guardMul, s.mech).toBeGreaterThanOrEqual(0.5);
      expect(s.guardMul, s.mech).toBeLessThanOrEqual(1.6);
    };
    for (const s of Object.values(PLAYSTYLES)) check(s);
  });

  it('uses only doctrines the drone understands', () => {
    const valid = new Set(['escort', 'screen', 'flank', 'shadow']);
    for (const s of Object.values(PLAYSTYLES)) expect(valid.has(s.droneDoctrine), s.mech).toBe(true);
  });

  it('is a roster of distinguishable people, not eight copies', () => {
    const fingerprint = (s: Playstyle) =>
      [s.aggressionMul, s.rangeMul, s.meleeAppetite, s.dashMul, s.guardMul].join(',');
    const seen = new Set(Object.values(PLAYSTYLES).map(fingerprint));
    // HALCYON is deliberately the neutral baseline, so seven distinct others.
    expect(seen.size).toBeGreaterThanOrEqual(7);
  });

  it('agrees with the machines it describes', () => {
    // The marksman stands furthest off; the brawlers crowd in closest.
    const range = (id: string) => PLAYSTYLES[id].rangeMul;
    expect(range('vesper')).toBeGreaterThan(range('halcyon'));
    expect(range('pyre')).toBeLessThan(range('halcyon'));
    expect(range('cirrus')).toBeLessThan(range('halcyon'));

    // The two chassis built around the barrier guard the most.
    const guard = (id: string) => PLAYSTYLES[id].guardMul;
    expect(guard('obelisk')).toBeGreaterThan(guard('halcyon'));
    expect(guard('terramoth')).toBeGreaterThan(guard('halcyon'));

    // The lightest, fastest frame moves the most; the siege walker the least.
    const dash = (id: string) => PLAYSTYLES[id].dashMul;
    expect(dash('cirrus')).toBeGreaterThan(dash('halcyon'));
    expect(dash('terramoth')).toBeLessThan(dash('halcyon'));

    // The long melee chain wants melee; the sniper does not.
    expect(PLAYSTYLES.cirrus.meleeAppetite).toBeGreaterThan(0.15);
    expect(PLAYSTYLES.vesper.meleeAppetite).toBeLessThan(0);
  });

  it('falls back to a neutral style for an unknown machine', () => {
    expect(playstyleFor(undefined)).toBe(NEUTRAL_PLAYSTYLE);
    expect(playstyleFor('not_a_mech')).toBe(NEUTRAL_PLAYSTYLE);
    expect(playstyleFor('halcyon')).toBe(PLAYSTYLES.halcyon);
  });

  it('has a neutral style that genuinely changes nothing', () => {
    const n = NEUTRAL_PLAYSTYLE;
    expect([n.aggressionMul, n.rangeMul, n.dashMul, n.guardMul]).toEqual([1, 1, 1, 1]);
    expect(n.meleeAppetite).toBe(0);
    expect(n.droneDoctrine).toBe('escort');
  });
});

/**
 * The lesson from the ablation, pinned.
 *
 * A pilot's favourite burst may *widen the window* their mode already wins in.
 * It may not override the situation. Letting it override was measured as the
 * single most destructive change in the feature, because SHOOT is currently the
 * strongest burst and so any pilot told to prefer something else was being told
 * to lose.
 */
describe('saturation preference is a lean, not an override', () => {
  const modeAt = (mech: string, lifeFrac: number, dist: number): SatMode => {
    const def = ROSTER.find((m) => m.id === mech)!;
    const s = new MatchSim({ playerDef: def, enemyDef: def, seed: 7, introTicks: 1 });
    const ai = new RivalAI({ difficulty: Difficulty.Hard }, new Rng(7));
    s.player.life = def.gauges.maxLife * lifeFrac;
    // `chooseSatMode` is private; reach it the way a test may, since the whole
    // point of this block is that this one function stayed honest.
    return (ai as unknown as { chooseSatMode(c: unknown, d: number): SatMode }).chooseSatMode(
      s.player,
      dist,
    );
  };

  it('still picks SHOOT at range for a pilot who prefers SHIELD', () => {
    expect(PLAYSTYLES.obelisk.satPreference).toBe(SatMode.Shield);
    expect(modeAt('obelisk', 0.9, 700)).toBe(SatMode.Shoot);
  });

  it('still picks SHOOT at range for a pilot who prefers SPEED', () => {
    expect(PLAYSTYLES.cirrus.satPreference).toBe(SatMode.Speed);
    expect(modeAt('cirrus', 0.9, 700)).toBe(SatMode.Shoot);
  });

  it('reaches for SHIELD earlier for a pilot who prefers it', () => {
    // 0.42 life: past a Shield-preferring pilot's threshold, short of everyone else's.
    expect(modeAt('obelisk', 0.42, 700)).toBe(SatMode.Shield);
    expect(modeAt('halcyon', 0.42, 700)).toBe(SatMode.Shoot);
  });

  it('reaches for SPEED from further out for a pilot who prefers it', () => {
    // 300px: inside CIRRUS's widened window, outside the default one.
    expect(modeAt('cirrus', 0.9, 300)).toBe(SatMode.Speed);
    expect(modeAt('halcyon', 0.9, 300)).toBe(SatMode.Shoot);
  });

  it('drops to SHIELD when badly hurt whatever the pilot prefers', () => {
    for (const m of ROSTER) expect(modeAt(m.id, 0.1, 700), m.id).toBe(SatMode.Shield);
  });
});

/**
 * The balance guard.
 *
 * Playstyles must not widen the gap between the best and worst machine. This is
 * the assertion the first cut failed — 0.854 against a 0.555 baseline — and the
 * only reason the failure was found at all was that someone went looking.
 *
 * Deterministic: seeded sim, seeded AI, both slots played so the left-slot bias
 * cancels. A regression moves the number rather than flaking.
 */
describe('playstyles and roster balance', () => {
  const W = 2400;
  const H = 1200;
  const CAP = 120 * 60;

  const duel = (ai: string, bi: string, seed: number): number => {
    const a = ROSTER.find((m) => m.id === ai)!;
    const b = ROSTER.find((m) => m.id === bi)!;
    const s = new MatchSim({ playerDef: a, enemyDef: b, seed, introTicks: 1, roundTicks: CAP });
    const p1 = new RivalAI({ difficulty: Difficulty.Hard }, new Rng(seed ^ 0x1111));
    const p2 = new RivalAI({ difficulty: Difficulty.Hard }, new Rng(seed ^ 0x2222));
    for (let i = 0; i < CAP && s.phase !== MatchPhase.Over; i++) {
      s.step(
        p1.think(s.player, s.enemy, s.activeProjectiles(), W, H),
        p2.think(s.enemy, s.player, s.activeProjectiles(), W, H),
      );
    }
    return s.player.life / a.gauges.maxLife - s.enemy.life / b.gauges.maxLife;
  };

  it('keeps every machine within a playable band of the field', () => {
    const lead = new Map(ROSTER.map((m) => [m.id, 0]));
    const n = new Map(ROSTER.map((m) => [m.id, 0]));
    for (let i = 0; i < ROSTER.length; i++) {
      for (let j = i + 1; j < ROSTER.length; j++) {
        const seed = 900 + i * 131 + j * 17;
        const l = duel(ROSTER[i].id, ROSTER[j].id, seed) - duel(ROSTER[j].id, ROSTER[i].id, seed + 77);
        lead.set(ROSTER[i].id, lead.get(ROSTER[i].id)! + l);
        lead.set(ROSTER[j].id, lead.get(ROSTER[j].id)! - l);
        n.set(ROSTER[i].id, n.get(ROSTER[i].id)! + 2);
        n.set(ROSTER[j].id, n.get(ROSTER[j].id)! + 2);
      }
    }
    const v = [...lead].map(([k, s]) => s / n.get(k)!);
    const spread = Math.max(...v) - Math.min(...v);
    // Measured at 0.511 with playstyles on, against 0.555 with them neutralised.
    // The ceiling is the baseline plus headroom, so this fails on a regression
    // rather than on ordinary tuning noise.
    expect(spread).toBeLessThan(0.7);
  }, 120_000);
});
