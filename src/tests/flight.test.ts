import { describe, expect, it } from 'vitest';
import { stepFlight, clampToArena, type FlightIntent, type FlightState } from '../combat/FlightModel';
import { HALCYON } from '../data/mechs';

const def = HALCYON.flight;

function state(over: Partial<FlightState> = {}): FlightState {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    boost: def.maxBoost,
    boostRegenTimer: 0,
    dashTicks: 0,
    dashCooldown: 0,
    dashDirX: 1,
    dashDirY: 0,
    ...over,
  };
}

function intent(over: Partial<FlightIntent> = {}): FlightIntent {
  return { dx: 0, dy: 0, boost: false, dash: false, speedScale: 1, moveScale: 1, ...over };
}

describe('flight model', () => {
  it('accelerates toward input and respects the speed cap', () => {
    const s = state();
    for (let i = 0; i < 400; i++) stepFlight(s, def, intent({ dx: 1 }));
    expect(s.vx).toBeGreaterThan(0);
    expect(s.vx).toBeLessThanOrEqual(def.maxSpeed + 1e-6);
    expect(s.vx).toBeCloseTo(def.maxSpeed, 1);
  });

  it('does not make diagonals faster than cardinals', () => {
    const a = state();
    const b = state();
    for (let i = 0; i < 400; i++) {
      stepFlight(a, def, intent({ dx: 1 }));
      stepFlight(b, def, intent({ dx: 1, dy: 1 }));
    }
    expect(Math.hypot(b.vx, b.vy)).toBeLessThanOrEqual(Math.abs(a.vx) + 0.02);
  });

  it('coasts with momentum and brakes harder than it coasts', () => {
    const coast = state({ vx: 5 });
    const brake = state({ vx: 5 });
    for (let i = 0; i < 12; i++) {
      stepFlight(coast, def, intent());
      stepFlight(brake, def, intent({ boost: true })); // boost with no direction = air brake
    }
    expect(coast.vx).toBeGreaterThan(0); // momentum is retained
    expect(brake.vx).toBeLessThan(coast.vx);
  });

  it('dash spends boost and produces dash speed', () => {
    const s = state();
    const r = stepFlight(s, def, intent({ dx: 1, dash: true }));
    expect(r.dashStarted).toBe(true);
    expect(s.boost).toBe(def.maxBoost - def.dashCost);
    expect(Math.abs(s.vx)).toBeCloseTo(def.dashSpeed, 5);
  });

  it('refuses to dash without enough boost', () => {
    const s = state({ boost: 1 });
    const r = stepFlight(s, def, intent({ dx: 1, dash: true }));
    expect(r.dashStarted).toBe(false);
    expect(s.dashTicks).toBe(0);
  });

  it('enforces a dash cooldown', () => {
    const s = state();
    stepFlight(s, def, intent({ dx: 1, dash: true }));
    for (let i = 0; i < def.dashTicks; i++) stepFlight(s, def, intent({ dx: 1 }));
    const r = stepFlight(s, def, intent({ dx: 1, dash: true }));
    expect(r.dashStarted).toBe(false);
  });

  it('regenerates boost only after the refill delay', () => {
    const s = state({ boost: 40 });
    stepFlight(s, def, intent({ dx: 1, boost: true }));
    const afterDrain = s.boost;
    // Immediately after boosting, the delay must block regen.
    stepFlight(s, def, intent());
    expect(s.boost).toBeLessThanOrEqual(afterDrain);
    for (let i = 0; i < def.boostRegenDelay + 30; i++) stepFlight(s, def, intent());
    expect(s.boost).toBeGreaterThan(afterDrain);
  });

  it('applies a firing anchor through moveScale', () => {
    const free = state({ vx: 5 });
    const firing = state({ vx: 5 });
    stepFlight(free, def, intent());
    stepFlight(firing, def, intent({ moveScale: 0.24 }));
    expect(firing.vx).toBeLessThan(free.vx * 0.5);
  });

  it('clamps inside the arena and bleeds the impacting velocity', () => {
    const s = state({ x: -50, vx: -6 });
    clampToArena(s, 26, 1000, 800);
    expect(s.x).toBe(26);
    expect(s.vx).toBeGreaterThan(0);
    expect(Math.abs(s.vx)).toBeLessThan(6);
  });

  it('is deterministic for identical input sequences', () => {
    const a = state();
    const b = state();
    const seq: FlightIntent[] = [];
    for (let i = 0; i < 200; i++) {
      seq.push(intent({ dx: (i % 7) - 3, dy: (i % 5) - 2, boost: i % 11 === 0, dash: i % 37 === 0 }));
    }
    for (const s of seq) stepFlight(a, def, s);
    for (const s of seq) stepFlight(b, def, s);
    expect([a.x, a.y, a.vx, a.vy, a.boost]).toEqual([b.x, b.y, b.vx, b.vy, b.boost]);
  });
});
