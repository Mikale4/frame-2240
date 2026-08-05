import { describe, expect, it } from 'vitest';
import { MatchSim } from '../combat/MatchSim';
import { HALCYON, NOCTURNE } from '../data/mechs';
import { DroneMode } from '../combat/Supporter';
import { Btn, emptyInput, isHeld, isPressed } from '../combat/types';
import { DUMMY_CYCLE, dummyInput } from '../combat/TrainingDummy';
import { CommandBuffer } from '../combat/CommandBuffer';
import { flickerLevel } from '../render/EnergyFlicker';
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
    expect(defaultTrainingSettings()).toEqual({
      drones: true,
      infiniteSat: false,
      health: 1,
      p2: 'dummy',
      p2Difficulty: 1,
      forceButton: null,
      forceCommand: 'none',
      forceMove: 'none',
    });
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

describe('the forced dummy script', () => {
  const base = { forceButton: null, forceCommand: 'none' as const, forceMove: 'none' as const };

  it('does nothing when nothing is forced', () => {
    const f = dummyInput(base, 0, 1);
    expect([f.dx, f.dy, f.held, f.pressed]).toEqual([0, 0, 0, 0]);
  });

  it('mirrors a held direction with facing', () => {
    // TOWARD has to mean toward, from either side of the arena — the two
    // machines swap sides constantly, so an absolute direction is not a drill.
    expect(dummyInput({ ...base, forceMove: 'fwd' }, 0, 1).dx).toBe(1);
    expect(dummyInput({ ...base, forceMove: 'fwd' }, 0, -1).dx).toBe(-1);
    // Vertical does not mirror.
    expect(dummyInput({ ...base, forceMove: 'up' }, 0, -1).dy).toBe(-1);
  });

  it('holds a forced button but only presses it once a cycle', () => {
    const script = { ...base, forceButton: Btn.Barrier };
    let presses = 0;
    for (let t = 0; t < DUMMY_CYCLE * 3; t++) {
      const f = dummyInput(script, t, 1);
      // Held every tick, so a guard stays up.
      expect(isHeld(f, Btn.Barrier)).toBe(true);
      if (isPressed(f, Btn.Barrier)) presses++;
    }
    // Edge-triggered moves repeat at a readable rate instead of jamming.
    expect(presses).toBe(3);
  });

  it('throws a forced command the recogniser actually accepts', () => {
    // The real check: feed the frames to a real CommandBuffer and ask it.
    for (const name of ['spread', 'lance', 'salvo'] as const) {
      const cmd = new CommandBuffer();
      const script = { ...base, forceCommand: name };
      let matched = false;
      for (let t = 0; t < DUMMY_CYCLE; t++) {
        const f = dummyInput(script, t, 1);
        cmd.push(f, 1);
        if (cmd.matches(MOTIONS[name])) matched = true;
      }
      expect([name, matched]).toEqual([name, true]);
    }
  });

  it('throws it from the other side too', () => {
    const cmd = new CommandBuffer();
    const script = { ...base, forceCommand: 'lance' as const };
    let matched = false;
    for (let t = 0; t < DUMMY_CYCLE; t++) {
      const f = dummyInput(script, t, -1);
      cmd.push(f, -1);
      if (cmd.matches(MOTIONS.lance)) matched = true;
    }
    expect(matched).toBe(true);
  });

  it('repeats the command every cycle', () => {
    const cmd = new CommandBuffer();
    const script = { ...base, forceCommand: 'spread' as const };
    let hits = 0;
    let armed = true;
    for (let t = 0; t < DUMMY_CYCLE * 3; t++) {
      cmd.push(dummyInput(script, t, 1), 1);
      const m = cmd.matches(MOTIONS.spread);
      if (m && armed) {
        hits++;
        armed = false;
      }
      if (!m) armed = true;
    }
    expect(hits).toBe(3);
  });

  it('lets the command take the stick from a held direction', () => {
    // A motion is a direction sequence; it cannot share the stick.
    const script = { ...base, forceCommand: 'lance' as const, forceMove: 'fwd' as const };
    expect(dummyInput(script, 0, 1).dy).toBe(1); // down, the motion's first step
    // ...and the held direction resumes once the motion is done.
    expect(dummyInput(script, DUMMY_CYCLE - 1, 1).dx).toBe(1);
  });
});

/**
 * The blade's brightness comes from a transcribed table, not a sine, so the
 * properties worth guarding are the ones that make it read as flicker at all.
 */
describe('energy flicker', () => {
  const cycle = 31;

  it('repeats on a 31-frame cycle', () => {
    for (let f = 0; f < 40; f++) {
      expect([f, flickerLevel(f)]).toEqual([f, flickerLevel(f + cycle)]);
    }
  });

  it('survives a negative frame index', () => {
    expect(flickerLevel(-1)).toBe(flickerLevel(cycle - 1));
  });

  it('reaches full brightness and dips deep', () => {
    const levels = Array.from({ length: cycle }, (_, f) => flickerLevel(f));
    expect(Math.max(...levels)).toBe(1);
    // The reference's own floor is 100/256 on the deep loop; anything shallower
    // than roughly a third reads as a pulse rather than a struggle to stay lit.
    expect(Math.min(...levels)).toBeLessThanOrEqual(0.4);
  });

  it('steps rather than sweeping — it holds, then jumps', () => {
    const levels = Array.from({ length: cycle }, (_, f) => flickerLevel(f));
    let holds = 0;
    let jumps = 0;
    for (let f = 1; f < cycle; f++) {
      if (levels[f] === levels[f - 1]) holds++;
      else jumps++;
    }
    // Both, and neither dominant: all holds is a constant, all jumps is noise.
    expect(holds).toBeGreaterThan(4);
    expect(jumps).toBeGreaterThan(8);
  });

  it('is not periodic on any short sub-cycle', () => {
    // A sine or a single repeated loop would match itself at some small period;
    // three concatenated loops of different lengths should not.
    const levels = Array.from({ length: cycle }, (_, f) => flickerLevel(f));
    for (const period of [2, 3, 4, 5, 6, 8, 10, 12]) {
      const same = levels.every((v, i) => v === levels[(i + period) % cycle]);
      expect([period, same]).toEqual([period, false]);
    }
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
