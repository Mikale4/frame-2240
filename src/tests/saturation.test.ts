import { describe, expect, it } from 'vitest';
import { Combatant } from '../combat/Combatant';
import { MatchSim } from '../combat/MatchSim';
import { HALCYON, NOCTURNE, ROSTER } from '../data/mechs';
import {
  ActState,
  Btn,
  SatMode,
  Team,
  emptyInput,
  type InputFrame,
  type ProjectileSpawn,
  type SimEvent,
} from '../combat/types';

/**
 * The three saturation modes, after the rework that gave each one a resource it
 * spends freely and a burnout to pay for it.
 *
 * The through-line worth protecting is that each mode makes exactly one resource
 * free — barrier, energy, boost — and that the freedom ends when the meter does.
 */

const W = 2400;
const H = 1200;

function make(def = HALCYON, x = 400, y = 600, id = 0, team = Team.Player): Combatant {
  return new Combatant({ id, team, def, x, y, facing: 1 });
}

function press(...btns: Btn[]): InputFrame {
  let m = 0;
  for (const b of btns) m |= 1 << b;
  return { ...emptyInput(), held: m, pressed: m };
}

function hold(...btns: Btn[]): InputFrame {
  let m = 0;
  for (const b of btns) m |= 1 << b;
  return { ...emptyInput(), held: m, pressed: 0 };
}

interface Ctx {
  spawns: ProjectileSpawn[];
  events: SimEvent[];
}
function ctx(): Ctx {
  return { spawns: [], events: [] };
}

function run(c: Combatant, input: InputFrame, ticks: number, target: Combatant | null, k: Ctx): void {
  for (let i = 0; i < ticks; i++) c.step(input, target, W, H, k.spawns, k.events);
}

/** Puts a mech into an active burst without going through the input. */
function activate(c: Combatant, mode: SatMode): void {
  c.satMode = mode;
  c.sat = c.def.gauges.maxSaturation;
  const k = ctx();
  c.step(press(Btn.Boost, Btn.Barrier), null, W, H, k.spawns, k.events);
  if (!c.satActive) throw new Error('activation did not take');
}

describe('saturation — activation', () => {
  /**
   * The combo used to be Main + Heavy, checked from behind `tryStartAction`.
   * Whichever weapon button landed first started its own attack, and that check
   * is never reached while an attack is running — so only a press of both inside
   * one 16.7ms tick ever worked, which no human does. It is now Boost + Barrier,
   * neither of which starts an attack, with a forgiving "both held, either one
   * pressed this tick" window.
   */
  it('activates when barrier is already held and boost is then pressed', () => {
    const c = make();
    c.sat = c.def.gauges.maxSaturation;
    const k = ctx();
    c.step(press(Btn.Barrier), null, W, H, k.spawns, k.events);
    expect(c.satActive).toBe(false);
    run(c, hold(Btn.Barrier), 4, null, k);
    c.step(
      { ...emptyInput(), held: (1 << Btn.Barrier) | (1 << Btn.Boost), pressed: 1 << Btn.Boost },
      null, W, H, k.spawns, k.events,
    );
    expect(c.satActive).toBe(true);
  });

  it('activates when boost is already held and barrier is then pressed', () => {
    const c = make();
    c.sat = c.def.gauges.maxSaturation;
    const k = ctx();
    c.step(press(Btn.Boost), null, W, H, k.spawns, k.events);
    expect(c.satActive).toBe(false);
    run(c, hold(Btn.Boost), 4, null, k);
    c.step(
      { ...emptyInput(), held: (1 << Btn.Boost) | (1 << Btn.Barrier), pressed: 1 << Btn.Barrier },
      null, W, H, k.spawns, k.events,
    );
    expect(c.satActive).toBe(true);
  });

  it('activates on a same-tick press too', () => {
    const c = make();
    c.sat = c.def.gauges.maxSaturation;
    const k = ctx();
    c.step(press(Btn.Boost, Btn.Barrier), null, W, H, k.spawns, k.events);
    expect(c.satActive).toBe(true);
  });

  it('spends neither a dash nor a barrier burst on the activation tick', () => {
    const c = make();
    c.sat = c.def.gauges.maxSaturation;
    const boost = c.boost;
    const k = ctx();
    c.step({ ...emptyInput(), dx: 1, held: (1 << Btn.Boost) | (1 << Btn.Barrier), pressed: (1 << Btn.Boost) | (1 << Btn.Barrier) }, null, W, H, k.spawns, k.events);
    expect(c.satActive).toBe(true);
    expect(c.dashTicks).toBe(0);
    // Ordinary boosting still happens — the button is held with a direction, and
    // suppressing that would be a different bug. What must not happen is the
    // dash, which costs 12 against a boost tick's 0.5.
    expect(boost - c.boost).toBeLessThan(c.def.flight.dashCost);
    expect(k.events.some((e) => e.t === 'barrier')).toBe(false);
  });

  it('leaves the weapon buttons free during a burst', () => {
    const c = make();
    c.sat = c.def.gauges.maxSaturation;
    const k = ctx();
    c.step(press(Btn.Boost, Btn.Barrier), null, W, H, k.spawns, k.events);
    expect(c.satActive).toBe(true);
    // Firing immediately afterwards works and does not re-trigger anything.
    c.step(press(Btn.Main), null, W, H, k.spawns, k.events);
    expect(c.attack).not.toBeNull();
  });

  it('does not activate on an empty meter', () => {
    const c = make();
    c.sat = 0;
    const k = ctx();
    c.step(press(Btn.Boost, Btn.Barrier), null, W, H, k.spawns, k.events);
    expect(c.satActive).toBe(false);
  });

  it('needs an actual press, not just two held buttons', () => {
    const c = make();
    c.sat = c.def.gauges.maxSaturation;
    const k = ctx();
    run(c, hold(Btn.Boost, Btn.Barrier), 20, null, k);
    expect(c.satActive).toBe(false);
  });
});

describe('saturation — Shield', () => {
  it('raises the guard on activation and holds it without input', () => {
    const c = make();
    activate(c, SatMode.Shield);
    expect(c.guarding).toBe(true);
    const k = ctx();
    run(c, emptyInput(), 60, null, k);
    expect(c.guarding).toBe(true);
  });

  it('never lets the barrier gauge fall', () => {
    const c = make();
    activate(c, SatMode.Shield);
    const full = c.def.gauges.maxBarrier;
    expect(c.barrier).toBe(full);
    const k = ctx();
    // Hold guard, burst, and take guarded hits — none of it should cost a point.
    run(c, hold(Btn.Barrier), 40, null, k);
    c.step(press(Btn.Barrier), null, W, H, k.spawns, k.events);
    for (let i = 0; i < 6; i++) {
      c.invuln = 0;
      c.takeHit({
        x: c.x, y: c.y, vx: 6, vy: 0, damage: 40, guardDamage: 60, life: 4, radius: 8,
        ownerId: 9, team: Team.Enemy, kind: 0, barrier: 0, hitstop: 0, hitstun: 0,
        knockback: 0, homing: 0, pierceCount: 0,
      });
      c.invuln = 0;
    }
    expect(c.barrier).toBe(full);
    expect(c.guardBreakStun).toBe(0);
  });

  it('lets the pilot attack from behind the guard', () => {
    const c = make();
    activate(c, SatMode.Shield);
    const k = ctx();
    c.step(press(Btn.Main), null, W, H, k.spawns, k.events);
    expect(c.attack).not.toBeNull();
    // The guard survives the attack starting, and the attack owns the act state.
    expect(c.guarding).toBe(true);
    expect(c.act).not.toBe(ActState.GuardHold);
    run(c, emptyInput(), 8, null, k);
    expect(k.spawns.length).toBeGreaterThan(0);
    expect(c.guarding).toBe(true);
  });

  it('scales incoming damage by the guard rather than nullifying it', () => {
    const c = make();
    activate(c, SatMode.Shield);
    const before = c.life;
    // Activation grants 20 ticks of i-frames; clear them or the hit is absorbed
    // rather than guarded, which is a different code path from the one under test.
    c.invuln = 0;
    const result = c.takeHit({
      x: c.x, y: c.y, vx: 6, vy: 0, damage: 100, guardDamage: 20, life: 4, radius: 8,
      ownerId: 9, team: Team.Enemy, kind: 0, barrier: 0, hitstop: 0, hitstun: 0,
      knockback: 0, homing: 0, pierceCount: 0,
    });
    expect(result).toBe('guarded');
    expect(c.life).toBeLessThan(before);
    expect(c.life).toBeGreaterThan(before - 100);
  });

  it('still erases shots in the bubble, which is the other half of the mode', () => {
    const s = new MatchSim({ playerDef: HALCYON, enemyDef: NOCTURNE, seed: 5, introTicks: 1 });
    for (let i = 0; i < 4; i++) s.step(emptyInput(), emptyInput());
    activate(s.player, SatMode.Shield);
    s.projectiles.spawn({
      x: s.player.x + 20, y: s.player.y, vx: 1, vy: 0, damage: 30, guardDamage: 10,
      life: 40, radius: 6, ownerId: s.enemy.id, team: Team.Enemy, kind: 0, barrier: 0,
      hitstop: 0, hitstun: 0, knockback: 0, homing: 0, pierceCount: 0,
    });
    s.step(emptyInput(), emptyInput());
    expect(s.projectiles.items.filter((p) => p.active && p.team === Team.Enemy).length).toBe(0);
  });
});

describe('saturation — Shoot', () => {
  it('fires both weapons from a single main press', () => {
    const c = make();
    activate(c, SatMode.Shoot);
    const k = ctx();
    c.step(press(Btn.Main), null, W, H, k.spawns, k.events);
    expect(c.attack?.id).toBe('main');
    expect(c.coAttack?.id).toBe('heavy');
    // Both eventually leave the machine.
    run(c, emptyInput(), 40, null, k);
    const kinds = new Set(k.spawns.map((sp) => sp.kind));
    expect(kinds.size).toBeGreaterThan(1);
  });

  it('fires both from a heavy press too, so either button works', () => {
    const c = make();
    activate(c, SatMode.Shoot);
    const k = ctx();
    c.step(press(Btn.Heavy), null, W, H, k.spawns, k.events);
    expect(c.attack?.id).toBe('main');
    expect(c.coAttack?.id).toBe('heavy');
  });

  it('spends no energy on anything while it lasts', () => {
    const c = make();
    activate(c, SatMode.Shoot);
    expect(c.energy).toBe(c.def.gauges.maxEnergy);
    const k = ctx();
    run(c, hold(Btn.Main), 120, null, k);
    expect(c.energy).toBe(c.def.gauges.maxEnergy);
    expect(k.spawns.length).toBeGreaterThan(0);
  });

  it('rate-limits the twin slot to the heavy\'s own cadence', () => {
    const c = make();
    activate(c, SatMode.Shoot);
    const k = ctx();
    // The twin slot refuses a reload while busy, so holding main cannot produce
    // one heavy per main shot.
    run(c, hold(Btn.Main), 120, null, k);
    const heavies = k.spawns.filter((sp) => sp.kind === HALCYON.heavy.kind).length;
    const mains = k.spawns.filter((sp) => sp.kind === HALCYON.main.kind).length;
    expect(heavies).toBeGreaterThan(0);
    expect(heavies).toBeLessThan(mains);
  });

  it('still multiplies damage by 1.5', () => {
    const c = make();
    activate(c, SatMode.Shoot);
    const k = ctx();
    run(c, press(Btn.Main), HALCYON.main.startup + 1, null, k);
    const shot = k.spawns[0];
    expect(shot.damage).toBeCloseTo(HALCYON.main.damage * 1.5, 4);
  });

  it('does not fire twins outside the mode', () => {
    const c = make();
    const k = ctx();
    c.step(press(Btn.Main), null, W, H, k.spawns, k.events);
    expect(c.coAttack).toBeNull();
  });
});

describe('saturation — Speed', () => {
  it('makes thrust free and leaves the tank full', () => {
    const c = make();
    activate(c, SatMode.Speed);
    expect(c.boost).toBe(c.def.flight.maxBoost);
    const k = ctx();
    // Boost hard, and dash repeatedly, for far longer than the tank would last.
    for (let i = 0; i < 90; i++) {
      const f = { ...emptyInput(), dx: 1, held: 1 << Btn.Boost, pressed: i % 12 === 0 ? 1 << Btn.Boost : 0 };
      c.step(f, null, W, H, k.spawns, k.events);
    }
    expect(c.boost).toBe(c.def.flight.maxBoost);
  });

  it('adds three swings to a lock-on sequence, on top of the chassis count', () => {
    for (const def of ROSTER) {
      const c = make(def);
      expect(c.meleeLockHits).toBe(def.meleeLock.hits);
      c.satActive = true;
      c.satMode = SatMode.Speed;
      expect(c.meleeLockHits).toBe(def.meleeLock.hits + 3);
    }
  });

  it('adds three swings to a button chain as well', () => {
    const c = make();
    expect(c.maxMeleeHits).toBe(3);
    c.satActive = true;
    c.satMode = SatMode.Speed;
    expect(c.maxMeleeHits).toBe(6);
  });

  it('actually runs the extra swings', () => {
    const a = make(HALCYON, 500, 600, 0, Team.Player);
    const b = make(NOCTURNE, 560, 600, 1, Team.Enemy);
    activate(a, SatMode.Speed);
    const k = ctx();
    a.step(press(Btn.Melee), b, W, H, k.spawns, k.events);
    run(a, emptyInput(), HALCYON.meleeLock.maxLife + 30, b, k);
    const hits = k.spawns.filter((sp) => sp.kind === 4).length;
    expect(hits).toBe(HALCYON.meleeLock.hits + 3);
  });

  it('moves faster than a mech without it, and boosts faster still', () => {
    const plain = make();
    const fast = make();
    activate(fast, SatMode.Speed);
    const k = ctx();
    const drive = (c: Combatant) => {
      for (let i = 0; i < 60; i++) {
        c.step({ ...emptyInput(), dx: 1 }, null, W, H, k.spawns, k.events);
      }
    };
    drive(plain);
    drive(fast);
    expect(fast.x).toBeGreaterThan(plain.x);
  });
});

describe('saturation — burnout', () => {
  it('leaves the pilot stunned when the meter empties', () => {
    const c = make();
    activate(c, SatMode.Shoot);
    c.satTicks = 1;
    const k = ctx();
    c.step(emptyInput(), null, W, H, k.spawns, k.events);
    expect(c.satActive).toBe(false);
    expect(c.satBurnout).toBeGreaterThan(0);
    expect(c.act).toBe(ActState.Hitstun);
    expect(k.events.some((e) => e.t === 'satBurnout')).toBe(true);
  });

  it('refuses input for the whole burnout, then hands control back', () => {
    const c = make();
    activate(c, SatMode.Shoot);
    c.satTicks = 1;
    const k = ctx();
    c.step(emptyInput(), null, W, H, k.spawns, k.events);
    const stun = c.satBurnout;

    const before = k.spawns.length;
    run(c, press(Btn.Main), stun, null, k);
    expect(k.spawns.length).toBe(before);
    expect(c.satBurnout).toBe(0);

    c.step(press(Btn.Main), null, W, H, k.spawns, k.events);
    expect(c.attack).not.toBeNull();
  });

  it('cannot be barrier-cancelled, unlike every other stun', () => {
    const c = make();
    activate(c, SatMode.Shoot);
    c.satTicks = 1;
    const k = ctx();
    c.step(emptyInput(), null, W, H, k.spawns, k.events);
    const stun = c.satBurnout;
    c.barrier = c.def.gauges.maxBarrier;
    c.step(press(Btn.Barrier), null, W, H, k.spawns, k.events);
    expect(c.satBurnout).toBe(stun - 1);
    expect(c.act).toBe(ActState.Hitstun);
  });

  it('drops whatever the burst was doing', () => {
    const a = make(HALCYON, 500, 600, 0, Team.Player);
    const b = make(NOCTURNE, 560, 600, 1, Team.Enemy);
    activate(a, SatMode.Speed);
    const k = ctx();
    a.step(press(Btn.Melee), b, W, H, k.spawns, k.events);
    expect(a.meleeLock).not.toBeNull();
    a.satTicks = 1;
    a.step(emptyInput(), b, W, H, k.spawns, k.events);
    expect(a.meleeLock).toBeNull();
    expect(a.attack).toBeNull();
    expect(a.coAttack).toBeNull();
  });

  it('takes the free resources away with it', () => {
    const c = make();
    activate(c, SatMode.Shield);
    expect(c.barrierFree).toBe(true);
    c.satTicks = 1;
    const k = ctx();
    c.step(emptyInput(), null, W, H, k.spawns, k.events);
    expect(c.barrierFree).toBe(false);
    expect(c.energyFree).toBe(false);
    expect(c.boostFree).toBe(false);
    expect(c.guarding).toBe(false);
  });

  it('gives exactly one mode its free resource and no other', () => {
    const c = make();
    for (const [mode, flags] of [
      [SatMode.Shield, ['barrierFree']],
      [SatMode.Shoot, ['energyFree']],
      [SatMode.Speed, ['boostFree']],
    ] as const) {
      c.satActive = true;
      c.satMode = mode;
      const all = { barrierFree: c.barrierFree, energyFree: c.energyFree, boostFree: c.boostFree };
      for (const key of Object.keys(all) as (keyof typeof all)[]) {
        expect(all[key]).toBe((flags as readonly string[]).includes(key));
      }
    }
  });
});
