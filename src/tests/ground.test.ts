import { describe, expect, it } from 'vitest';
import { Combatant } from '../combat/Combatant';
import { MatchSim } from '../combat/MatchSim';
import { HALCYON, NOCTURNE } from '../data/mechs';
import { DECK_Y } from '../core/GameConfig';
import {
  BarrierResponse,
  Btn,
  ProjKind,
  Team,
  emptyInput,
  type InputFrame,
  type ProjectileSpawn,
  type SimEvent,
} from '../combat/types';

const W = 2400;
const H = 1200;

function make(def = HALCYON, x = 400, y = 600): Combatant {
  const c = new Combatant({ id: 0, team: Team.Player, def, x, y, facing: 1 });
  c.groundY = DECK_Y;
  return c;
}

function press(...btns: Btn[]): InputFrame {
  let m = 0;
  for (const b of btns) m |= 1 << b;
  return { ...emptyInput(), held: m, pressed: m };
}

function ctx(): { spawns: ProjectileSpawn[]; events: SimEvent[] } {
  return { spawns: [], events: [] };
}

function run(c: Combatant, input: InputFrame, ticks: number, k: ReturnType<typeof ctx>): void {
  for (let i = 0; i < ticks; i++) c.step(input, null, W, H, k.spawns, k.events);
}

describe('FlyingMode', () => {
  it('starts airborne — this is an aerial fighter first', () => {
    expect(make().flying).toBe(true);
  });

  it('toggles off and on, and kicks upward on take-off', () => {
    const c = make();
    const k = ctx();
    c.step(press(Btn.Flight), null, W, H, k.spawns, k.events);
    expect(c.flying).toBe(false);

    run(c, emptyInput(), 4, k);
    const vyBefore = c.vy;
    c.step(press(Btn.Flight), null, W, H, k.spawns, k.events);
    expect(c.flying).toBe(true);
    expect(c.vy).toBeLessThan(vyBefore); // upward impulse (negative y is up)
    expect(k.events.some((e) => e.t === 'takeoff')).toBe(true);
  });

  it('falls to the floor and settles when flight is off', () => {
    const c = make(HALCYON, 400, 300);
    const k = ctx();
    c.step(press(Btn.Flight), null, W, H, k.spawns, k.events);
    run(c, emptyInput(), 200, k);
    expect(c.y).toBeCloseTo(DECK_Y, 3);
    expect(c.vy).toBe(0);
    expect(c.grounded).toBe(true);
    expect(k.events.some((e) => e.t === 'land')).toBe(true);
  });

  it('never sinks through the floor', () => {
    const c = make(HALCYON, 400, 300);
    const k = ctx();
    c.step(press(Btn.Flight), null, W, H, k.spawns, k.events);
    for (let i = 0; i < 400; i++) {
      c.step(emptyInput(), null, W, H, k.spawns, k.events);
      expect(c.y).toBeLessThanOrEqual(DECK_Y + 1e-6);
    }
  });

  it('walks slower than it flies', () => {
    const air = make();
    const ground = make();
    const k = ctx();
    ground.step(press(Btn.Flight), null, W, H, k.spawns, k.events);
    run(ground, emptyInput(), 120, k); // settle on the deck

    const right = { ...emptyInput(), dx: 1 };
    run(air, right, 200, k);
    run(ground, right, 200, k);
    expect(Math.abs(ground.vx)).toBeLessThan(Math.abs(air.vx));
    expect(Math.abs(ground.vx)).toBeLessThanOrEqual(HALCYON.flight.walkSpeed + 1e-6);
  });

  it('cannot climb while grounded', () => {
    const c = make();
    const k = ctx();
    c.step(press(Btn.Flight), null, W, H, k.spawns, k.events);
    run(c, emptyInput(), 150, k);
    const up = { ...emptyInput(), dy: -1 };
    run(c, up, 60, k);
    expect(c.y).toBeCloseTo(DECK_Y, 3);
  });

  it('refuels boost faster on the deck', () => {
    const air = make();
    const ground = make();
    const k = ctx();
    ground.step(press(Btn.Flight), null, W, H, k.spawns, k.events);
    run(ground, emptyInput(), 150, k);
    air.boost = 10;
    ground.boost = 10;
    run(air, emptyInput(), 60, k);
    run(ground, emptyInput(), 60, k);
    expect(ground.boost).toBeGreaterThan(air.boost);
  });

  /** The reference switched FlyingMode on automatically for its Level 2 shot. */
  it('takes off automatically for a heavy shot', () => {
    const c = make();
    const k = ctx();
    c.step(press(Btn.Flight), null, W, H, k.spawns, k.events);
    run(c, emptyInput(), 150, k);
    expect(c.flying).toBe(false);

    c.step(press(Btn.Heavy), null, W, H, k.spawns, k.events);
    expect(c.flying).toBe(true);
    expect(c.attack?.kind).toBe(ProjKind.Heavy);
  });

  /**
   * Regression: chassis separation could shove a landed mech below the deck, and
   * the flight step could not correct it while the mech was frozen in hitstop.
   */
  it('keeps a grounded mech on the floor even when shoved by separation', () => {
    const s = new MatchSim({ playerDef: HALCYON, enemyDef: NOCTURNE, introTicks: 1, seed: 5 });
    // The intro tick freezes input, so clear it before sending the toggle.
    s.step(emptyInput(), emptyInput());
    const flip = press(Btn.Flight);
    s.step(flip, flip);
    for (let i = 0; i < 220; i++) s.step(emptyInput(), emptyInput());
    expect(s.player.grounded).toBe(true);

    // Stack them and freeze the player, the exact case that broke it.
    s.enemy.x = s.player.x;
    s.enemy.y = s.player.y - 10;
    s.player.hitstop = 8;
    for (let i = 0; i < 20; i++) {
      s.step(emptyInput(), emptyInput());
      expect(s.player.y).toBeLessThanOrEqual(s.player.groundY + 1e-6);
    }
  });

  /**
   * Regression: the walk-speed cap used to clamp the melee lunge, so a grounded
   * sword swing barely moved and its authored reach silently stopped working.
   */
  it('lunges at full speed even while grounded', () => {
    const air = make();
    const ground = make();
    const k = ctx();
    ground.step(press(Btn.Flight), null, W, H, k.spawns, k.events);
    run(ground, emptyInput(), 200, k);
    expect(ground.grounded).toBe(true);

    const startAir = air.x;
    const startGround = ground.x;
    run(air, press(Btn.Melee), 1, k);
    run(ground, press(Btn.Melee), 1, k);
    run(air, emptyInput(), 8, k);
    run(ground, emptyInput(), 8, k);

    const airMoved = air.x - startAir;
    const groundMoved = ground.x - startGround;
    // Far beyond anything the walk cap would allow.
    expect(groundMoved).toBeGreaterThan(HALCYON.flight.walkSpeed * 8);
    // Within a few percent of the airborne lunge; the airborne path also applies
    // coast drag, so they are close rather than identical.
    expect(groundMoved / airMoved).toBeGreaterThan(0.9);
    expect(groundMoved / airMoved).toBeLessThan(1.1);
  });

  it('places the floor inside the arena for both mechs', () => {
    const s = new MatchSim({ playerDef: HALCYON, enemyDef: NOCTURNE, introTicks: 1 });
    for (const c of s.combatants) {
      expect(c.groundY).toBeLessThanOrEqual(1200 - c.def.rig.hurtRadius);
      expect(c.groundY).toBeGreaterThan(0);
    }
  });
});

describe('layered defence', () => {
  function shot(damage = 100): ProjectileSpawn {
    return {
      x: 0, y: 0, vx: -10, vy: 0, damage, guardDamage: 30, life: 50, radius: 6,
      ownerId: 9, team: Team.Enemy, kind: ProjKind.Bullet, barrier: BarrierResponse.Absorb,
      hitstop: 0, hitstun: 0, knockback: 0, homing: 0, pierceCount: 0,
    };
  }

  it('applies the per-chassis multiplier', () => {
    const light = make(HALCYON);
    const heavy = new Combatant({ id: 1, team: Team.Enemy, def: NOCTURNE, x: 0, y: 0, facing: 1 });
    light.takeHit(shot());
    heavy.takeHit(shot());
    const lightLost = HALCYON.gauges.maxLife - light.life;
    const heavyLost = NOCTURNE.gauges.maxLife - heavy.life;
    expect(heavyLost).toBeLessThan(lightLost);
    expect(lightLost).toBeCloseTo(100 * HALCYON.defence.mul, 5);
    expect(heavyLost).toBeCloseTo(100 * NOCTURNE.defence.mul, 5);
  });

  it('braces harder when planted on the deck', () => {
    const flying = make();
    const planted = make();
    planted.grounded = true;
    flying.takeHit(shot());
    planted.takeHit(shot());
    expect(HALCYON.gauges.maxLife - planted.life).toBeLessThan(
      HALCYON.gauges.maxLife - flying.life,
    );
  });

  it('still cannot drive life below zero', () => {
    const c = make();
    c.takeHit(shot(999999));
    expect(c.life).toBe(0);
    expect(c.alive).toBe(false);
  });
});
