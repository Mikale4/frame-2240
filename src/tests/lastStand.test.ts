import { describe, expect, it } from 'vitest';
import { MatchSim } from '../combat/MatchSim';
import { MECHS, ROSTER } from '../data/mechs';
import { MatchPhase, emptyInput } from '../combat/types';
import { BANTER_PRIORITY, pickBanter } from '../data/banter';

/**
 * HALCYON's LAST STAND — a once-a-match refusal to die.
 *
 * The dangerous properties are the ones that would make it either useless or
 * unbeatable, and both are easy to reach by accident: a check that lives in one
 * damage path saves you from bullets and not from burning ground, and a flag
 * that resets makes the machine immortal.
 */

const HALCYON = MECHS.halcyon;
const NOCTURNE = MECHS.nocturne;

function sim(playerDef = HALCYON): MatchSim {
  const s = new MatchSim({
    playerDef,
    enemyDef: NOCTURNE,
    seed: 5,
    introTicks: 1,
    roundTicks: 10800,
  });
  for (let i = 0; i < 4; i++) s.step(emptyInput(), emptyInput());
  return s;
}

describe('who carries it', () => {
  it('is HALCYON, and only HALCYON', () => {
    expect(HALCYON.lastStand).toBeDefined();
    expect(HALCYON.lastStand!.ticks).toBe(600);
    for (const m of ROSTER) {
      if (m.id === 'halcyon') continue;
      expect(m.lastStand, m.id).toBeUndefined();
    }
  });

  /**
   * NOCTURNE is built as `{ ...HALCYON }` and inherited this the moment it was
   * added — a second machine silently gaining a once-a-match refusal to die.
   * The `supporter` block already carries a warning about the same hazard.
   */
  it('is not inherited by NOCTURNE through the object spread', () => {
    expect(NOCTURNE.lastStand).toBeUndefined();
  });
});

describe('the reprieve', () => {
  it('turns a killing blow into a sliver of hull', () => {
    const s = sim();
    s.player.life = 40;
    s.player.takeHit({
      x: s.player.x, y: s.player.y, vx: 1, vy: 0,
      damage: 9999, guardDamage: 0, life: 5, radius: 5,
      ownerId: 1, team: 1, kind: 0, barrier: 0,
      hitstop: 0, hitstun: 0, knockback: 0, homing: 0, pierceCount: 0,
    });
    expect(s.player.life).toBe(0);
    // The gate runs inside the step, after damage and before the death check.
    s.step(emptyInput(), emptyInput());
    expect(s.player.alive).toBe(true);
    expect(s.player.life).toBeGreaterThan(0);
    expect(s.player.lastStandActive).toBe(true);
    expect(s.player.lastStandUsed).toBe(true);
  });

  it('announces itself', () => {
    const s = sim();
    s.player.life = 1;
    s.player.takeHit({
      x: s.player.x, y: s.player.y, vx: 1, vy: 0,
      damage: 9999, guardDamage: 0, life: 5, radius: 5,
      ownerId: 1, team: 1, kind: 0, barrier: 0,
      hitstop: 0, hitstun: 0, knockback: 0, homing: 0, pierceCount: 0,
    });
    s.step(emptyInput(), emptyInput());
    expect(s.events.some((e) => e.t === 'lastStand')).toBe(true);
  });

  /**
   * The reason the gate lives in `MatchSim` rather than in `takeHit`: hull comes
   * off in a dozen places. A passive that only survives gunfire is a bug that
   * looks like a balance decision.
   */
  it('survives damage that never goes through takeHit at all', () => {
    const s = sim();
    s.player.life = 5;
    // Straight to the field, as status chip and hazards do it.
    s.player.life = 0;
    s.step(emptyInput(), emptyInput());
    expect(s.player.alive).toBe(true);
    expect(s.player.lastStandActive).toBe(true);
  });

  it('cannot be killed while it runs, however hard it is hit', () => {
    const s = sim();
    s.player.life = 0;
    s.step(emptyInput(), emptyInput());
    expect(s.player.lastStandActive).toBe(true);
    for (let i = 0; i < 200; i++) {
      s.player.life = -500;
      s.step(emptyInput(), emptyInput());
      expect(s.player.alive).toBe(true);
    }
  });

  it('lasts ten seconds and then lets go', () => {
    const s = sim();
    s.player.life = 0;
    s.step(emptyInput(), emptyInput());
    expect(s.player.lastStandTicks).toBeGreaterThan(560);
    for (let i = 0; i < 620 && s.phase !== MatchPhase.Over; i++) {
      s.step(emptyInput(), emptyInput());
    }
    expect(s.player.lastStandActive).toBe(false);
    // ...and is then mortal again.
    s.player.life = 0;
    s.step(emptyInput(), emptyInput());
    expect(s.player.alive).toBe(false);
  });

  it('is once per match, not once per near-death', () => {
    const s = sim();
    s.player.life = 0;
    s.step(emptyInput(), emptyInput());
    expect(s.player.lastStandUsed).toBe(true);
    for (let i = 0; i < 620 && s.phase !== MatchPhase.Over; i++) {
      s.step(emptyInput(), emptyInput());
    }
    s.player.life = 0;
    s.step(emptyInput(), emptyInput());
    expect(s.player.alive).toBe(false);
  });

  it('announces the moment it lapses, so the window is legible', () => {
    const s = sim();
    s.player.life = 0;
    s.step(emptyInput(), emptyInput());
    let ended = false;
    for (let i = 0; i < 700 && s.phase !== MatchPhase.Over; i++) {
      s.step(emptyInput(), emptyInput());
      if (s.events.some((e) => e.t === 'lastStandEnd')) ended = true;
    }
    expect(ended).toBe(true);
  });

  it('does nothing at all for a machine without the passive', () => {
    const s = sim(NOCTURNE);
    s.player.life = 0;
    s.step(emptyInput(), emptyInput());
    expect(s.player.alive).toBe(false);
    expect(s.player.lastStandActive).toBe(false);
  });
});

describe('it is announced in words as well as pixels', () => {
  it('gives Naia Vesk something to say', () => {
    const line = pickBanter('halcyon', 'lastStand', 0.5);
    expect(line).toBeTruthy();
    expect((line ?? '').length).toBeGreaterThan(2);
  });

  it('outranks every in-fight line except the KO', () => {
    expect(BANTER_PRIORITY.lastStand).toBeGreaterThan(BANTER_PRIORITY.combo);
    expect(BANTER_PRIORITY.lastStand).toBeGreaterThan(BANTER_PRIORITY.hurt);
    expect(BANTER_PRIORITY.lastStand).toBeLessThan(BANTER_PRIORITY.win);
  });
});
