import { describe, expect, it } from 'vitest';
import { ELEMENTS, Element, StatusState } from '../combat/Status';
import { MatchSim } from '../combat/MatchSim';
import { HALCYON, NOCTURNE } from '../data/mechs';
import { Btn, Team, emptyInput, type InputFrame, type ProjectileSpawn } from '../combat/types';
import { BarrierResponse, ProjKind } from '../combat/types';

function sim(): MatchSim {
  return new MatchSim({
    playerDef: HALCYON,
    enemyDef: NOCTURNE,
    seed: 3,
    introTicks: 2,
    arenaW: 2400,
    arenaH: 1200,
  });
}

function shot(over: Partial<ProjectileSpawn> = {}): ProjectileSpawn {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    damage: 10,
    guardDamage: 4,
    life: 10,
    radius: 6,
    ownerId: 99,
    team: Team.Enemy,
    kind: ProjKind.Bullet,
    barrier: BarrierResponse.Absorb,
    hitstop: 0,
    hitstun: 0,
    knockback: 0,
    homing: 0,
    pierceCount: 0,
    ...over,
  };
}

describe('status state', () => {
  it('starts clean', () => {
    const s = new StatusState();
    expect(s.active).toBe(false);
    expect(s.speedScale).toBe(1);
    expect(s.step()).toBe(0);
  });

  it('applies an element for its authored duration', () => {
    const s = new StatusState();
    expect(s.apply(Element.Incendiary)).toBe(true);
    expect(s.active).toBe(true);
    expect(s.ticks).toBe(ELEMENTS[Element.Incendiary]!.duration);
  });

  it('expires exactly on schedule', () => {
    const s = new StatusState();
    s.apply(Element.Cryo);
    const d = ELEMENTS[Element.Cryo]!;
    for (let i = 0; i < d.duration - 1; i++) s.step();
    expect(s.active).toBe(true);
    s.step();
    expect(s.active).toBe(false);
    expect(s.element).toBe(Element.None);
  });

  it('refreshes the same element without reporting a change', () => {
    const s = new StatusState();
    s.apply(Element.Shock);
    for (let i = 0; i < 40; i++) s.step();
    expect(s.apply(Element.Shock)).toBe(false);
    expect(s.ticks).toBe(ELEMENTS[Element.Shock]!.duration);
  });

  it('replaces a different element rather than stacking', () => {
    const s = new StatusState();
    s.apply(Element.Corrosive);
    expect(s.apply(Element.Cryo)).toBe(true);
    expect(s.element).toBe(Element.Cryo);
    expect(s.ticks).toBe(ELEMENTS[Element.Cryo]!.duration);
  });

  it('ignores Element.None', () => {
    const s = new StatusState();
    expect(s.apply(Element.None)).toBe(false);
    expect(s.active).toBe(false);
  });

  it('reports a 0..1 fraction that falls as it burns down', () => {
    const s = new StatusState();
    s.apply(Element.Corrosive);
    expect(s.fraction).toBeCloseTo(1, 3);
    for (let i = 0; i < 105; i++) s.step();
    expect(s.fraction).toBeLessThan(0.6);
    expect(s.fraction).toBeGreaterThan(0);
  });

  it('slows movement only for the elements that should', () => {
    const s = new StatusState();
    s.apply(Element.Cryo);
    expect(s.speedScale).toBeLessThan(1);
    s.apply(Element.Corrosive);
    expect(s.speedScale).toBe(1);
  });
});

describe('status in a live match', () => {
  /**
   * Puts a live elemental shot on top of the player and resolves it.
   *
   * `playerInput` is fed for real, because `guarding` is recomputed from input
   * every tick — setting the flag directly would be overwritten before the
   * collision resolves.
   */
  function hitPlayerWith(s: MatchSim, element: Element, playerInput = emptyInput()): void {
    const v = s.player;
    s.projectiles.spawn(
      shot({ x: v.x, y: v.y, element, ownerId: s.enemy.id, team: s.enemy.team }),
    );
    s.step(playerInput, emptyInput());
  }

  it('takes hold on a clean hit and emits an event', () => {
    const s = sim();
    for (let i = 0; i < 6; i++) s.step(emptyInput(), emptyInput());
    hitPlayerWith(s, Element.Incendiary);
    expect(s.player.status.element).toBe(Element.Incendiary);
    expect(s.events.some((e) => e.t === 'status')).toBe(true);
  });

  it('does not take hold through a guard', () => {
    const s = sim();
    for (let i = 0; i < 6; i++) s.step(emptyInput(), emptyInput());
    s.player.barrier = 100;
    const guard: InputFrame = { ...emptyInput(), held: 1 << Btn.Barrier };
    hitPlayerWith(s, Element.Incendiary, guard);
    // Guarding turns aside whatever the shot was carrying.
    expect(s.player.guarding).toBe(true);
    expect(s.player.status.active).toBe(false);
  });

  it('burns life down over time', () => {
    const s = sim();
    for (let i = 0; i < 6; i++) s.step(emptyInput(), emptyInput());
    const v = s.player;
    v.status.apply(Element.Incendiary);
    const before = v.life;
    for (let i = 0; i < 60; i++) s.step(emptyInput(), emptyInput());
    expect(v.life).toBeLessThan(before);
  });

  it('never lands the killing blow with chip damage', () => {
    const s = sim();
    for (let i = 0; i < 6; i++) s.step(emptyInput(), emptyInput());
    const v = s.player;
    v.life = 3;
    v.status.apply(Element.Incendiary);
    for (let i = 0; i < 400; i++) s.step(emptyInput(), emptyInput());
    expect(v.alive).toBe(true);
    expect(v.life).toBeGreaterThan(0);
  });

  it('shock drains energy and stalls regeneration', () => {
    const s = sim();
    for (let i = 0; i < 6; i++) s.step(emptyInput(), emptyInput());
    const v = s.player;
    v.energy = 500;
    v.status.apply(Element.Shock);
    for (let i = 0; i < 30; i++) s.step(emptyInput(), emptyInput());
    expect(v.energy).toBeLessThan(500);
  });

  it('clears on its own, restoring normal regen', () => {
    const s = sim();
    for (let i = 0; i < 6; i++) s.step(emptyInput(), emptyInput());
    const v = s.player;
    v.energy = 100;
    v.status.apply(Element.Shock);
    for (let i = 0; i < ELEMENTS[Element.Shock]!.duration + 5; i++) {
      s.step(emptyInput(), emptyInput());
    }
    expect(v.status.active).toBe(false);
    const mid = v.energy;
    for (let i = 0; i < 30; i++) s.step(emptyInput(), emptyInput());
    expect(v.energy).toBeGreaterThan(mid);
  });

  it('stays deterministic across identical runs', () => {
    const a = sim();
    const b = sim();
    a.player.status.apply(Element.Corrosive);
    b.player.status.apply(Element.Corrosive);
    for (let i = 0; i < 300; i++) {
      a.step(emptyInput(), emptyInput());
      b.step(emptyInput(), emptyInput());
    }
    expect(a.player.life).toBe(b.player.life);
    expect(a.player.status.ticks).toBe(b.player.status.ticks);
  });

  it('gives the two chassis different damage identities', () => {
    expect(HALCYON.lance.element).toBe(Element.Shock);
    expect(NOCTURNE.sub.element).toBe(Element.Incendiary);
    // And plain kinetic weapons stay elementless.
    expect(HALCYON.main.element ?? Element.None).toBe(Element.None);
  });
});
