import { describe, expect, it } from 'vitest';
import { Difficulty } from '../core/Session';
import { MatchSim } from '../combat/MatchSim';
import { RivalAI } from '../ai/RivalAI';
import { HALCYON, NOCTURNE } from '../data/mechs';
import { Btn, MatchPhase, emptyInput, type InputFrame } from '../combat/types';
import { Projectile, sweptHit } from '../projectiles/Projectile';
import { BarrierResponse, ProjKind, Team } from '../combat/types';
import { Rng } from '../core/Rng';

function sim(seed = 1234): MatchSim {
  return new MatchSim({
    playerDef: HALCYON,
    enemyDef: NOCTURNE,
    seed,
    introTicks: 1,
  });
}

/** A scripted but varied input stream, so runs exercise many code paths. */
function scriptedInput(i: number): InputFrame {
  const f = emptyInput();
  f.dx = ((i % 13) < 6 ? 1 : -1) * ((i % 3) === 0 ? 1 : 0);
  f.dy = ((i % 17) < 8 ? -1 : 1) * ((i % 5) === 0 ? 1 : 0);
  let m = 0;
  if (i % 19 === 0) m |= 1 << Btn.Main;
  if (i % 47 === 0) m |= 1 << Btn.Heavy;
  if (i % 71 === 0) m |= 1 << Btn.Sub;
  if (i % 23 === 0) m |= 1 << Btn.Boost;
  if (i % 97 === 0) m |= 1 << Btn.Barrier;
  f.pressed = m;
  f.held = m | (i % 23 === 0 ? 1 << Btn.Boost : 0);
  return f;
}

describe('match simulation', () => {
  it('runs an intro then unlocks the fight', () => {
    const s = new MatchSim({ playerDef: HALCYON, enemyDef: NOCTURNE, introTicks: 30 });
    expect(s.phase).toBe(MatchPhase.Intro);
    for (let i = 0; i < 29; i++) s.step(emptyInput(), emptyInput());
    expect(s.phase).toBe(MatchPhase.Intro);
    s.step(emptyInput(), emptyInput());
    expect(s.phase).toBe(MatchPhase.Fight);
  });

  it('is bit-identical for the same seed and inputs', () => {
    const a = sim(777);
    const b = sim(777);
    for (let i = 0; i < 900; i++) {
      const pi = scriptedInput(i);
      const ei = scriptedInput(i + 5);
      a.step(pi, ei);
      b.step(pi, ei);
    }
    const snap = (s: MatchSim) => [
      s.tick,
      s.player.x, s.player.y, s.player.vx, s.player.vy, s.player.life,
      s.player.energy, s.player.boost, s.player.barrier, s.player.sat, s.player.aim,
      s.enemy.x, s.enemy.y, s.enemy.vx, s.enemy.vy, s.enemy.life,
      s.projectiles.activeCount,
    ];
    expect(snap(a)).toEqual(snap(b));
  });

  it('diverges for different seeds once the AI drives it', () => {
    const runWithAi = (seed: number) => {
      const s = sim(seed);
      const ai = new RivalAI({ difficulty: Difficulty.Hard }, new Rng(seed));
      for (let i = 0; i < 600; i++) {
        const e = ai.think(s.enemy, s.player, s.activeProjectiles(), 2400, 1200);
        s.step(scriptedInput(i), e);
      }
      return [s.enemy.x, s.enemy.y, s.player.life];
    };
    expect(runWithAi(1)).not.toEqual(runWithAi(99999));
  });

  it('ends in a KO and reports the winner', () => {
    const s = sim();
    for (let i = 0; i < 5; i++) s.step(emptyInput(), emptyInput());
    s.enemy.life = 0;
    s.step(emptyInput(), emptyInput());
    expect(s.outcome).toBe('playerWin');
    expect(s.phase).toBe(MatchPhase.KO);
    expect(s.events.some((e) => e.t === 'ko')).toBe(true);
    // The KO freeze eventually resolves to Over so the results screen can show.
    for (let i = 0; i < 200; i++) s.step(emptyInput(), emptyInput());
    expect(s.phase).toBe(MatchPhase.Over);
  });

  it('awards a timeout to whoever has more life left', () => {
    const s = new MatchSim({
      playerDef: HALCYON,
      enemyDef: NOCTURNE,
      introTicks: 1,
      roundTicks: 10,
    });
    s.enemy.life = 100;
    for (let i = 0; i < 14; i++) s.step(emptyInput(), emptyInput());
    expect(s.outcome).toBe('playerWin');
  });

  it('lands hits and drains life over a scripted exchange', () => {
    const s = sim(42);
    // Park the two mechs in each other's faces and let the player attack.
    s.player.x = 900;
    s.enemy.x = 1010;
    s.player.y = s.enemy.y = 600;
    const startLife = s.enemy.life;
    for (let i = 0; i < 420; i++) {
      const f = emptyInput();
      if (i % 14 === 0) {
        f.pressed = 1 << Btn.Main;
        f.held = 1 << Btn.Main;
      }
      s.step(f, emptyInput());
    }
    expect(s.enemy.life).toBeLessThan(startLife);
  });

  it('never leaves a mech outside the arena', () => {
    const s = sim(5);
    for (let i = 0; i < 1500; i++) {
      const f = emptyInput();
      f.dx = 1;
      f.dy = 1;
      f.held = 1 << Btn.Boost;
      s.step(f, f);
      for (const c of s.combatants) {
        expect(c.x).toBeGreaterThanOrEqual(c.def.rig.hurtRadius - 1e-6);
        expect(c.x).toBeLessThanOrEqual(2400 - c.def.rig.hurtRadius + 1e-6);
        expect(c.y).toBeGreaterThanOrEqual(c.def.rig.hurtRadius - 1e-6);
        expect(c.y).toBeLessThanOrEqual(1200 - c.def.rig.hurtRadius + 1e-6);
      }
    }
  });

  it('keeps the chassis from overlapping', () => {
    const s = sim(9);
    s.player.x = 900;
    s.enemy.x = 902;
    s.player.y = s.enemy.y = 600;
    s.step(emptyInput(), emptyInput());
    const d = Math.hypot(s.enemy.x - s.player.x, s.enemy.y - s.player.y);
    expect(d).toBeGreaterThan(20);
  });

  it('produces no NaN state under sustained random play', () => {
    const s = sim(31337);
    const ai = new RivalAI({ difficulty: Difficulty.Extreme }, new Rng(4321));
    for (let i = 0; i < 2000; i++) {
      const e = ai.think(s.enemy, s.player, s.activeProjectiles(), 2400, 1200);
      s.step(scriptedInput(i * 3), e);
      for (const c of s.combatants) {
        expect(Number.isFinite(c.x)).toBe(true);
        expect(Number.isFinite(c.y)).toBe(true);
        expect(Number.isFinite(c.vx)).toBe(true);
        expect(Number.isFinite(c.aim)).toBe(true);
        expect(Number.isFinite(c.life)).toBe(true);
      }
    }
  });
});

describe('training dummy', () => {
  it('gets back up instead of ending the session', () => {
    const s = new MatchSim({
      playerDef: HALCYON, enemyDef: NOCTURNE, introTicks: 1, dummy: true,
    });
    s.step(emptyInput(), emptyInput());
    s.enemy.life = 0;
    s.step(emptyInput(), emptyInput());

    expect(s.dummyDowns).toBe(1);
    expect(s.enemy.alive).toBe(true);
    expect(s.enemy.life).toBe(NOCTURNE.gauges.maxLife);
    expect(s.outcome).toBe('none');
    expect(s.phase).toBe(MatchPhase.Fight);
  });

  it('respawns at a readable distance, inside the arena', () => {
    const s = new MatchSim({
      playerDef: HALCYON, enemyDef: NOCTURNE, introTicks: 1, dummy: true,
    });
    s.step(emptyInput(), emptyInput());
    s.player.x = 200;
    s.enemy.life = 0;
    s.step(emptyInput(), emptyInput());
    const gap = Math.abs(s.enemy.x - s.player.x);
    expect(gap).toBeGreaterThan(200);
    expect(s.enemy.x).toBeGreaterThanOrEqual(s.enemy.def.rig.hurtRadius);
    expect(s.enemy.x).toBeLessThanOrEqual(2400 - s.enemy.def.rig.hurtRadius);
  });

  it('can be downed repeatedly', () => {
    const s = new MatchSim({
      playerDef: HALCYON, enemyDef: NOCTURNE, introTicks: 1, dummy: true,
    });
    s.step(emptyInput(), emptyInput());
    for (let i = 0; i < 5; i++) {
      s.enemy.life = 0;
      s.step(emptyInput(), emptyInput());
    }
    expect(s.dummyDowns).toBe(5);
    expect(s.outcome).toBe('none');
  });

  it('still lets a normal match end', () => {
    const s = new MatchSim({ playerDef: HALCYON, enemyDef: NOCTURNE, introTicks: 1 });
    s.step(emptyInput(), emptyInput());
    s.enemy.life = 0;
    s.step(emptyInput(), emptyInput());
    expect(s.outcome).toBe('playerWin');
  });
});

describe('projectiles', () => {
  it('does not tunnel through a target at high speed', () => {
    const p = new Projectile();
    p.reset({
      x: -60, y: 0, vx: 120, vy: 0, damage: 1, guardDamage: 0, life: 10, radius: 4,
      ownerId: 0, team: Team.Player, kind: ProjKind.Bullet, barrier: BarrierResponse.Absorb,
      hitstop: 0, hitstun: 0, knockback: 0, homing: 0, pierceCount: 0,
    });
    p.step(null, null); // now at x = 60, having crossed a target at x = 0
    expect(p.x).toBe(60);
    expect(sweptHit(p, 0, 0, 20)).toBe(true);
  });

  it('turns toward a homing target', () => {
    const p = new Projectile();
    p.reset({
      x: 0, y: 0, vx: 8, vy: 0, damage: 1, guardDamage: 0, life: 200, radius: 4,
      ownerId: 0, team: Team.Player, kind: ProjKind.Missile, barrier: BarrierResponse.Absorb,
      hitstop: 0, hitstun: 0, knockback: 0, homing: 0.06, pierceCount: 0,
    });
    for (let i = 0; i < 30; i++) p.step(400, 400);
    expect(p.vy).toBeGreaterThan(0); // curved down toward the target
  });

  it('expires after its authored lifetime', () => {
    const p = new Projectile();
    p.reset({
      x: 0, y: 0, vx: 1, vy: 0, damage: 1, guardDamage: 0, life: 3, radius: 4,
      ownerId: 0, team: Team.Player, kind: ProjKind.Bullet, barrier: BarrierResponse.Absorb,
      hitstop: 0, hitstun: 0, knockback: 0, homing: 0, pierceCount: 0,
    });
    p.step(null, null);
    p.step(null, null);
    expect(p.active).toBe(true);
    p.step(null, null);
    expect(p.active).toBe(false);
  });
});

describe('rival AI fairness', () => {
  it('only ever emits a normal input frame', () => {
    const s = sim(2);
    const ai = new RivalAI({ difficulty: Difficulty.Extreme }, new Rng(2));
    for (let i = 0; i < 600; i++) {
      const f = ai.think(s.enemy, s.player, s.activeProjectiles(), 2400, 1200);
      expect(Math.abs(f.dx)).toBeLessThanOrEqual(1);
      expect(Math.abs(f.dy)).toBeLessThanOrEqual(1);
      expect(f.held).toBeGreaterThanOrEqual(0);
      // Pressed bits must be a subset of held bits.
      expect(f.pressed & ~f.held).toBe(0);
      s.step(emptyInput(), f);
    }
  });

  it('actually fights: it damages an idle opponent', () => {
    const s = sim(8);
    const ai = new RivalAI({ difficulty: Difficulty.Extreme }, new Rng(8));
    const start = s.player.life;
    for (let i = 0; i < 1800; i++) {
      const f = ai.think(s.enemy, s.player, s.activeProjectiles(), 2400, 1200);
      s.step(emptyInput(), f);
    }
    expect(s.player.life).toBeLessThan(start);
  });

  it('can be beaten: a scripted aggressor damages it', () => {
    const s = sim(11);
    const ai = new RivalAI({ difficulty: Difficulty.Normal }, new Rng(11));
    const start = s.enemy.life;
    for (let i = 0; i < 1800; i++) {
      const f = emptyInput();
      // Chase and swing.
      f.dx = Math.sign(s.enemy.x - s.player.x);
      f.dy = Math.sign(s.enemy.y - s.player.y);
      if (i % 12 === 0) {
        f.pressed = 1 << Btn.Main;
        f.held = 1 << Btn.Main;
      }
      const e = ai.think(s.enemy, s.player, s.activeProjectiles(), 2400, 1200);
      s.step(f, e);
    }
    expect(s.enemy.life).toBeLessThan(start);
  });

  it('respects its own gauges (never spends below zero)', () => {
    const s = sim(3);
    const ai = new RivalAI({ difficulty: Difficulty.Extreme }, new Rng(3));
    for (let i = 0; i < 1200; i++) {
      const f = ai.think(s.enemy, s.player, s.activeProjectiles(), 2400, 1200);
      s.step(emptyInput(), f);
      expect(s.enemy.energy).toBeGreaterThanOrEqual(0);
      expect(s.enemy.boost).toBeGreaterThanOrEqual(0);
      expect(s.enemy.barrier).toBeGreaterThanOrEqual(0);
      expect(s.enemy.subCharges).toBeGreaterThanOrEqual(0);
    }
  });
});
