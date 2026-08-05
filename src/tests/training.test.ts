import { describe, expect, it } from 'vitest';
import { MatchSim } from '../combat/MatchSim';
import { HALCYON, NOCTURNE } from '../data/mechs';
import { DroneMode } from '../combat/Supporter';
import { emptyInput } from '../combat/types';
import { HEALTH_STEPS, cycleHealth, defaultTrainingSettings, healthLabel } from '../core/TrainingSettings';
import { commandHeading, commandRows, motionNotation } from '../ui/TrainingOptions';
import { MOTIONS } from '../combat/CommandBuffer';

function sim(): MatchSim {
  return new MatchSim({
    playerDef: HALCYON,
    enemyDef: NOCTURNE,
    seed: 99,
    introTicks: 2,
    dummy: true,
  });
}

function run(s: MatchSim, ticks: number): void {
  for (let i = 0; i < ticks; i++) s.step(emptyInput(), emptyInput());
}

describe('training settings', () => {
  it('defaults to a normal match', () => {
    // The switches exist to *depart* from a normal fight, so the untouched rig
    // has to be one — otherwise training silently teaches the wrong game.
    expect(defaultTrainingSettings()).toEqual({ drones: true, infiniteSat: false, health: 1 });
  });

  it('cycles health through every step in both directions', () => {
    let v = 1;
    const seen: number[] = [];
    for (let i = 0; i < HEALTH_STEPS.length; i++) {
      v = cycleHealth(v, 1);
      seen.push(v);
    }
    expect(new Set(seen).size).toBe(HEALTH_STEPS.length);
    expect(v).toBe(1); // a full lap returns to where it started
    expect(cycleHealth(1, -1)).toBe(HEALTH_STEPS[HEALTH_STEPS.length - 1]);
  });

  it('recovers from a value that is not on the list', () => {
    expect(HEALTH_STEPS).toContain(cycleHealth(0.42, 1));
  });

  it('labels health as a percentage', () => {
    expect(healthLabel(1)).toBe('100%');
    expect(healthLabel(0.25)).toBe('25%');
  });
});

describe('training switches drive the simulation', () => {
  it('leaves drones deployed by default', () => {
    const s = sim();
    run(s, 120);
    expect(s.dronesEnabled).toBe(true);
    expect(s.combatants.some((c) => c.supporter.mode !== DroneMode.Stowed)).toBe(true);
  });

  it('stows both escorts when drones are switched off', () => {
    const s = sim();
    run(s, 120);
    s.dronesEnabled = false;
    run(s, 10);
    for (const c of s.combatants) {
      expect(c.supporter.mode).toBe(DroneMode.Stowed);
      // `visible` is the same predicate the renderer and the hit test use, so a
      // stowed escort is off screen *and* unshootable rather than merely idle.
      expect(c.supporter.visible).toBe(false);
    }
  });

  it('holds a saturation burst open while satFree is set', () => {
    const s = sim();
    run(s, 6);
    const c = s.combatants[0];
    c.satFree = true;
    c.satActive = true;
    c.satTicks = 30;
    run(s, 240);
    expect(c.satActive).toBe(true);
    expect(c.sat).toBe(c.def.gauges.maxSaturation);
  });

  it('keeps the meter charged and never burnt out while satFree is set', () => {
    const s = sim();
    run(s, 6);
    const c = s.combatants[0];
    c.satFree = true;
    c.sat = 0;
    c.satBurnout = 90;
    run(s, 4);
    expect(c.sat).toBe(c.def.gauges.maxSaturation);
    expect(c.satBurnout).toBe(0);
  });

  it('drains normally when satFree is off — the default path is untouched', () => {
    const s = sim();
    run(s, 6);
    const c = s.combatants[0];
    c.satActive = true;
    c.satTicks = 30;
    run(s, 60);
    expect(c.satActive).toBe(false);
  });
});

describe('command list', () => {
  it('reads the notation off MOTIONS rather than a hand-written copy', () => {
    // The failure mode of a written-out command list is that it goes on
    // describing an input nobody implements any more.
    expect(motionNotation(MOTIONS.lance)).toContain('↓');
    expect(motionNotation(MOTIONS.lance)).toContain('←');
    expect(motionNotation(MOTIONS.spread)).toContain('→');
  });

  it('names the attacks that belong to each machine', () => {
    const hal = commandRows('halcyon');
    expect(hal.length).toBe(3);
    for (const r of hal) expect(r.attack.length).toBeGreaterThan(0);
    // Same motions, different weapons: the per-mech list is the point.
    const pyre = commandRows('pyre');
    expect(pyre.map((r) => r.attack)).not.toEqual(hal.map((r) => r.attack));
    expect(pyre.map((r) => r.motion)).toEqual(hal.map((r) => r.motion));
  });

  it('heads each block with the machine designation', () => {
    expect(commandHeading('halcyon')).toBe('AV-07  HALCYON');
  });

  it('does not throw on an unknown mech id', () => {
    expect(commandRows('nobody')).toEqual([]);
    expect(commandHeading('nobody')).toBe('NOBODY');
  });
});
