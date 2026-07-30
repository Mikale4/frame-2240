import { describe, expect, it } from 'vitest';
import { MatchSim } from '../combat/MatchSim';
import { HALCYON, NOCTURNE } from '../data/mechs';
import { Btn, MatchPhase, emptyInput, type InputFrame, type SimEvent } from '../combat/types';
import { ACTION_ORDER, BUTTON_ACTION, DEFAULT_BINDINGS } from '../input/Bindings';

const W = 2400;
const H = 1200;

function sim(over: Partial<ConstructorParameters<typeof MatchSim>[0]> = {}): MatchSim {
  return new MatchSim({
    playerDef: HALCYON,
    enemyDef: NOCTURNE,
    seed: 99,
    introTicks: 2,
    arenaW: W,
    arenaH: H,
    ...over,
  });
}

function press(...btns: Btn[]): InputFrame {
  let m = 0;
  for (const b of btns) m |= 1 << b;
  return { ...emptyInput(), held: m, pressed: m };
}

/** Steps past the intro so input is live. */
function toFight(s: MatchSim, ticks = 6): void {
  for (let i = 0; i < ticks; i++) s.step(emptyInput(), emptyInput());
}

function stepUntil(s: MatchSim, pred: () => boolean, max = 600): number {
  for (let i = 0; i < max; i++) {
    if (pred()) return i;
    s.step(emptyInput(), emptyInput());
  }
  return -1;
}

function eventsOfType<T extends SimEvent['t']>(s: MatchSim, t: T): Extract<SimEvent, { t: T }>[] {
  return s.events.filter((e): e is Extract<SimEvent, { t: T }> => e.t === t);
}

describe('supporter — station keeping', () => {
  it('exists for both machines from the first tick', () => {
    const s = sim();
    expect(s.player.supporter).toBeTruthy();
    expect(s.enemy.supporter).toBeTruthy();
    expect(s.player.supporter.def.name).toBe('ARBITER');
    expect(s.enemy.supporter.def.name).toBe('WARDEN');
  });

  it('starts on station rather than at the origin', () => {
    const s = sim();
    const p = s.player;
    const d = p.def.supporter;
    expect(p.supporter.x).toBeCloseTo(p.x - p.facing * d.followBack, 6);
    expect(p.supporter.y).toBeCloseTo(p.y + d.followDown, 6);
  });

  it('follows the owner across the arena and settles behind it', () => {
    const s = sim();
    toFight(s);
    const p = s.player;
    // Fly right for a while.
    for (let i = 0; i < 120; i++) s.step({ ...emptyInput(), dx: 1 }, emptyInput());
    // Then stop and let the drone catch up.
    for (let i = 0; i < 120; i++) s.step(emptyInput(), emptyInput());

    const d = p.def.supporter;
    const homeX = p.x - p.facing * d.followBack;
    const homeY = p.y + d.followDown;
    expect(Math.hypot(p.supporter.x - homeX, p.supporter.y - homeY)).toBeLessThan(6);
  });

  it('lags behind rather than being welded to the owner', () => {
    const s = sim();
    toFight(s);
    const p = s.player;
    let maxErr = 0;
    for (let i = 0; i < 60; i++) {
      s.step({ ...emptyInput(), dx: 1, dy: -1 }, emptyInput());
      const homeX = p.x - p.facing * p.def.supporter.followBack;
      maxErr = Math.max(maxErr, Math.abs(p.supporter.x - homeX));
    }
    // It should visibly trail while the owner accelerates away.
    expect(maxErr).toBeGreaterThan(8);
  });

  it('never produces NaN over a long run', () => {
    const s = sim();
    toFight(s);
    for (let i = 0; i < 3000; i++) {
      s.step(press(Btn.Sub), press(Btn.Sub));
      for (const c of s.combatants) {
        expect(Number.isFinite(c.supporter.x)).toBe(true);
        expect(Number.isFinite(c.supporter.y)).toBe(true);
        expect(Number.isFinite(c.supporter.aim)).toBe(true);
      }
    }
  });

  it('is deterministic for a given seed', () => {
    const a = sim();
    const b = sim();
    for (let i = 0; i < 400; i++) {
      const inp = i % 37 === 0 ? press(Btn.Sub) : { ...emptyInput(), dx: i % 5 === 0 ? 1 : -1 };
      a.step(inp, emptyInput());
      b.step(inp, emptyInput());
    }
    expect(a.player.supporter.x).toBe(b.player.supporter.x);
    expect(a.player.supporter.y).toBe(b.player.supporter.y);
    expect(a.player.supporter.aim).toBe(b.player.supporter.aim);
  });
});

describe('supporter — the assist attack', () => {
  it('fires from the drone, not from the chassis', () => {
    const s = sim();
    toFight(s);
    const p = s.player;
    const sup = p.supporter;

    s.step(press(Btn.Sub), emptyInput());
    expect(eventsOfType(s, 'assist').length).toBe(1);

    // Nothing spawns during the windup.
    let spawned: { x: number; y: number } | null = null;
    for (let i = 0; i < p.def.supporter.windup + 2 && !spawned; i++) {
      s.step(emptyInput(), emptyInput());
      const fired = eventsOfType(s, 'fire').filter((e) => e.ownerId === p.id);
      if (fired.length) spawned = { x: fired[0].x, y: fired[0].y };
    }
    expect(spawned).not.toBeNull();

    // The shot must originate at the drone, far from the chassis.
    const dDrone = Math.hypot(spawned!.x - sup.x, spawned!.y - sup.y);
    const dChassis = Math.hypot(spawned!.x - p.x, spawned!.y - p.y);
    expect(dDrone).toBeLessThan(p.def.supporter.muzzleForward + 8);
    expect(dChassis).toBeGreaterThan(40);
  });

  it('keeps the owner and team on the assist projectile', () => {
    const s = sim();
    toFight(s);
    const p = s.player;
    s.step(press(Btn.Sub), emptyInput());
    stepUntil(s, () => s.projectiles.activeCount > 0);
    const shots = s.projectiles.items.filter((x) => x.active);
    expect(shots.length).toBeGreaterThan(0);
    for (const shot of shots) {
      expect(shot.ownerId).toBe(p.id);
      expect(shot.team).toBe(p.team);
    }
  });

  it('spreads its volley across distinct angles', () => {
    const s = sim();
    toFight(s);
    s.step(press(Btn.Sub), emptyInput());
    stepUntil(s, () => s.projectiles.activeCount > 0);
    const shots = s.projectiles.items.filter((x) => x.active && x.ownerId === s.player.id);
    expect(shots.length).toBe(HALCYON.sub.projCount);
    const angles = shots.map((x) => Math.atan2(x.vy, x.vx).toFixed(4));
    expect(new Set(angles).size).toBe(angles.length);
  });

  it('does not shove the owner with the drone\'s recoil', () => {
    const s = sim();
    toFight(s);
    const p = s.player;
    p.vx = 0;
    p.vy = 0;
    s.step(press(Btn.Sub), emptyInput());
    const before = { vx: p.vx, vy: p.vy };
    stepUntil(s, () => s.projectiles.activeCount > 0);
    // Only drag should have touched the owner's velocity; no recoil kick.
    expect(Math.abs(p.vx)).toBeLessThanOrEqual(Math.abs(before.vx) + 0.001);
  });

  it('spends a charge and refuses when there are none', () => {
    const s = sim();
    toFight(s);
    const p = s.player;
    expect(p.subCharges).toBe(HALCYON.subCharges);

    s.step(press(Btn.Sub), emptyInput());
    expect(p.subCharges).toBe(HALCYON.subCharges - 1);

    p.subCharges = 0;
    stepUntil(s, () => p.supporter.ready);
    s.step(press(Btn.Sub), emptyInput());
    expect(eventsOfType(s, 'assistDenied').length).toBe(1);
    expect(eventsOfType(s, 'assist').length).toBe(0);
  });

  it('refuses a second order while the drone is still busy, without charging for it', () => {
    const s = sim();
    toFight(s);
    const p = s.player;
    s.step(press(Btn.Sub), emptyInput());
    const after = p.subCharges;
    // Immediately order again: the drone is mid-windup.
    s.step(press(Btn.Sub), emptyInput());
    expect(eventsOfType(s, 'assistDenied').length).toBe(1);
    expect(p.subCharges).toBe(after);
  });

  it('honours the cooldown before accepting another order', () => {
    const s = sim();
    toFight(s);
    const p = s.player;
    const d = p.def.supporter;
    s.step(press(Btn.Sub), emptyInput());
    const readyAfter = stepUntil(s, () => p.supporter.ready, 400);
    expect(readyAfter).toBeGreaterThanOrEqual(d.windup + d.recover + d.cooldown - 2);
  });

  it('reports readiness as a 0..1 fraction for the HUD', () => {
    const s = sim();
    toFight(s);
    const p = s.player;
    expect(p.supporter.readyFraction).toBe(1);
    s.step(press(Btn.Sub), emptyInput());
    expect(p.supporter.readyFraction).toBe(0);
    stepUntil(s, () => p.supporter.ready);
    expect(p.supporter.readyFraction).toBe(1);
  });
});

describe('supporter — match states', () => {
  it('cannot be ordered during the intro', () => {
    const s = sim({ introTicks: 60 });
    s.step(press(Btn.Sub), press(Btn.Sub));
    expect(s.phase).toBe(MatchPhase.Intro);
    expect(eventsOfType(s, 'assist').length).toBe(0);
    expect(s.player.subCharges).toBe(HALCYON.subCharges);
  });

  it('still keeps station during the intro', () => {
    const s = sim({ introTicks: 60 });
    const p = s.player;
    const before = { x: p.supporter.x, y: p.supporter.y };
    for (let i = 0; i < 30; i++) s.step(emptyInput(), emptyInput());
    expect(Number.isFinite(p.supporter.x)).toBe(true);
    // On station and unmoved, because the owner is frozen too.
    expect(Math.hypot(p.supporter.x - before.x, p.supporter.y - before.y)).toBeLessThan(2);
  });

  it('drops a pending order when its owner dies mid-windup', () => {
    const s = sim();
    toFight(s);
    const p = s.player;
    s.step(press(Btn.Sub), emptyInput());
    expect(p.supporter.state).not.toBe(0); // not Idle: an order is in flight
    p.life = 0;
    s.step(emptyInput(), emptyInput());
    const before = s.projectiles.activeCount;
    for (let i = 0; i < p.def.supporter.windup + 4; i++) s.step(emptyInput(), emptyInput());
    // The dead machine's drone fired nothing.
    expect(s.projectiles.activeCount).toBeLessThanOrEqual(before);
  });

  it('will not fire for a dead owner even if ordered first', () => {
    const s = sim();
    toFight(s);
    const p = s.player;
    p.supporter.order(HALCYON.sub);
    p.life = 0;
    for (let i = 0; i < 40; i++) s.step(emptyInput(), emptyInput());
    const mine = s.projectiles.items.filter((x) => x.active && x.ownerId === p.id);
    expect(mine.length).toBe(0);
  });

  it('puts the drone back on station when a training dummy revives', () => {
    const s = sim({ dummy: true });
    toFight(s);
    const e = s.enemy;
    e.supporter.order(NOCTURNE.sub);
    e.life = 0;
    s.step(emptyInput(), emptyInput());
    expect(s.dummyDowns).toBe(1);
    const d = e.def.supporter;
    expect(e.supporter.x).toBeCloseTo(e.x - e.facing * d.followBack, 6);
    expect(e.supporter.state).toBe(0); // Idle
    expect(e.supporter.cooldown).toBe(0);
  });

  it('leaves a passive training dummy passive', () => {
    const s = sim({ dummy: true });
    toFight(s);
    for (let i = 0; i < 400; i++) s.step(emptyInput(), emptyInput());
    const enemyShots = s.projectiles.items.filter((x) => x.active && x.ownerId === s.enemy.id);
    expect(enemyShots.length).toBe(0);
    expect(s.enemy.subCharges).toBe(NOCTURNE.subCharges);
  });
});

describe('supporter — input path', () => {
  /**
   * The assist must stay reachable through the same remappable action table the
   * rest of the game reads. A previous bug shipped a melee button the simulation
   * understood and `InputManager` never sent; `bindings.test.ts` now proves every
   * `Btn` has an action and a default, and this pins the assist's own entry so a
   * rename cannot quietly detach the drone from its button.
   *
   * `InputManager` itself imports Phaser and needs a DOM, so it cannot be
   * constructed here — it is exercised in the live browser check instead.
   */
  it('is bound to a real, remappable action with a default key', () => {
    expect(BUTTON_ACTION[Btn.Sub]).toBe('sub');
    expect(ACTION_ORDER).toContain('sub');
    const b = DEFAULT_BINDINGS.sub;
    expect(b.keys.length + b.pads.length).toBeGreaterThan(0);
  });

  it('drives the drone from an ordinary InputFrame, with no private path', () => {
    const s = sim();
    toFight(s);
    // Exactly what InputManager builds when the bound key goes down.
    const frame: InputFrame = { ...emptyInput(), held: 1 << Btn.Sub, pressed: 1 << Btn.Sub };
    s.step(frame, emptyInput());
    expect(eventsOfType(s, 'assist').length).toBe(1);
  });

  it('fires on the pressed edge only, never while the button is held', () => {
    const s = sim();
    toFight(s);
    const held: InputFrame = { ...emptyInput(), held: 1 << Btn.Sub, pressed: 0 };

    let orders = 0;
    s.step({ ...held, pressed: 1 << Btn.Sub }, emptyInput());
    orders += eventsOfType(s, 'assist').length;
    expect(orders).toBe(1);

    // Keep holding for well past a full cooldown *and* past a recharge, so a
    // held button has every opportunity to sneak a second volley through.
    for (let i = 0; i < 400; i++) {
      s.step(held, emptyInput());
      orders += eventsOfType(s, 'assist').length;
    }
    expect(orders).toBe(1);
  });
});
