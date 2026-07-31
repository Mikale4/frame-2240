import { describe, expect, it } from 'vitest';
import { Combatant } from '../combat/Combatant';
import { MatchSim } from '../combat/MatchSim';
import { HALCYON, NOCTURNE, ROSTER } from '../data/mechs';
import {
  ActState,
  BarrierResponse,
  Btn,
  ProjKind,
  Team,
  emptyInput,
  type InputFrame,
  type ProjectileSpawn,
  type SimEvent,
} from '../combat/types';

/**
 * Guarding, and the barrier burst's answer to a sword.
 *
 * Melee used to ignore a guard outright, which made it the unconditional answer
 * to turtling and left the defender with no read to make. It is now guardable —
 * badly — and a burst timed onto the *opening* strike throws the attacker off.
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

function ctx(): { spawns: ProjectileSpawn[]; events: SimEvent[] } {
  return { spawns: [], events: [] };
}

function shot(over: Partial<ProjectileSpawn> = {}): ProjectileSpawn {
  return {
    x: 0, y: 0, vx: 6, vy: 0, damage: 100, guardDamage: 10, life: 4, radius: 8,
    ownerId: 9, team: Team.Enemy, kind: ProjKind.Bullet, barrier: BarrierResponse.Absorb,
    hitstop: 0, hitstun: 0, knockback: 0, homing: 0, pierceCount: 0, ...over,
  };
}

function sword(over: Partial<ProjectileSpawn> = {}): ProjectileSpawn {
  return shot({ kind: ProjKind.Melee, barrier: BarrierResponse.Pierce, ...over });
}

/** Puts the mech into a held guard. */
function guarding(c: Combatant): void {
  const k = ctx();
  c.step(hold(Btn.Barrier), null, W, H, k.spawns, k.events);
  if (!c.guarding) throw new Error('guard did not engage');
}

describe('held guard vs a lance', () => {
  /** A lance: piercing, but not melee. The one thing a guard used to ignore. */
  const lance = (over: Partial<ProjectileSpawn> = {}): ProjectileSpawn =>
    shot({ kind: ProjKind.Beam, barrier: BarrierResponse.Pierce, damage: 200, ...over });

  const taken = (guard: boolean): number => {
    const c = make();
    if (guard) guarding(c);
    c.invuln = 0;
    const before = c.life;
    const p = lance();
    p.x = c.x;
    p.y = c.y;
    c.takeHit(p);
    return before - c.life;
  };

  it('halves it, where it used to do nothing at all', () => {
    const open = taken(false);
    expect(open).toBeGreaterThan(0);
    expect(1 - taken(true) / open).toBeCloseTo(0.5, 5);
  });

  it('still lets the lance beat the guard', () => {
    // A lance is the roster's answer to turtling. Half damage has to stay a
    // worse deal for the defender than the fifth that gunfire gets, or holding
    // guard becomes the correct response to everything.
    for (const m of ROSTER) {
      expect(m.barrier.pierceGuardScale, `${m.id}`).toBeGreaterThan(m.barrier.guardScale);
      expect(m.barrier.pierceGuardScale, `${m.id}`).toBeLessThan(1);
    }
  });

  it('keeps the lance a real hit rather than a blocked one', () => {
    // Only the damage was softened. A lance still staggers, still cancels what
    // you were doing and still knocks the guard down — it does not become a
    // 'guarded' ping the way gunfire and melee do.
    const c = make();
    guarding(c);
    c.invuln = 0;
    const p = lance({ hitstun: 20, knockback: 5 });
    p.x = c.x;
    p.y = c.y;
    expect(c.takeHit(p)).toBe('hit');
    expect(c.hitstun).toBeGreaterThan(0);
    expect(c.guarding).toBe(false);
  });
});

describe('held guard', () => {
  it('cuts ordinary damage by 80%', () => {
    const c = make();
    guarding(c);
    c.invuln = 0;
    const before = c.life;
    expect(c.takeHit(shot({ damage: 100 }))).toBe('guarded');
    // 100 x defence.mul (1.0 for HALCYON) x guardScale 0.20.
    expect(before - c.life).toBeCloseTo(100 * HALCYON.defence.mul * 0.2, 4);
  });

  it('cuts melee damage by only 50%', () => {
    const c = make();
    guarding(c);
    c.invuln = 0;
    const before = c.life;
    expect(c.takeHit(sword({ damage: 100 }))).toBe('guarded');
    expect(before - c.life).toBeCloseTo(100 * HALCYON.defence.mul * 0.5, 4);
  });

  it('leaves melee hurting more through a guard than gunfire does', () => {
    for (const def of ROSTER) {
      expect(def.barrier.meleeGuardScale, def.id).toBeGreaterThan(def.barrier.guardScale);
    }
  });

  it('no longer lets a sword walk straight through', () => {
    const guarded = make();
    const open = make();
    guarding(guarded);
    guarded.invuln = 0;
    open.invuln = 0;
    const g0 = guarded.life;
    const o0 = open.life;
    guarded.takeHit(sword({ damage: 100 }));
    open.takeHit(sword({ damage: 100 }));
    expect(g0 - guarded.life).toBeLessThan(o0 - open.life);
  });

  it('still cannot be erased by the Shield-saturation bubble', () => {
    // Melee keeps its Pierce marking: guardable, but not deletable.
    for (const def of ROSTER) {
      for (const m of def.melee) {
        expect(m.barrier, def.id).toBe(BarrierResponse.Pierce);
      }
    }
  });
});

describe('barrier burst — repelling a sword', () => {
  function burst(c: Combatant): void {
    const k = ctx();
    c.step(press(Btn.Barrier), null, W, H, k.spawns, k.events);
    if (c.repelTicks <= 0) throw new Error('burst did not open a repel window');
  }

  it('throws back the opening melee strike instead of taking it', () => {
    const c = make();
    burst(c);
    const before = c.life;
    expect(c.takeHit(sword({ damage: 100 }))).toBe('repelled');
    expect(c.life).toBe(before);
  });

  it('banks the read as saturation, like an absorb', () => {
    const c = make();
    c.sat = 0;
    burst(c);
    c.takeHit(sword({ damage: 100 }));
    expect(c.sat).toBeGreaterThan(0);
  });

  it('only works on the opening strike, not mid-combo', () => {
    const c = make();
    c.invuln = 0;
    // Eat one sword hit first, so a sequence is already landing.
    c.takeHit(sword({ damage: 40, hitstun: 30 }));
    expect(c.meleeHitsTaken).toBe(1);
    const k = ctx();
    c.barrier = c.def.gauges.maxBarrier;
    c.step(press(Btn.Barrier), null, W, H, k.spawns, k.events);
    expect(c.repelTicks).toBe(0);
    c.invuln = 0;
    expect(c.takeHit(sword({ damage: 40 }))).not.toBe('repelled');
  });

  it('does not repel gunfire — that is still an absorb', () => {
    const c = make();
    burst(c);
    expect(c.takeHit(shot({ damage: 100 }))).toBe('absorbed');
  });

  it('spends the window on the strike it repels', () => {
    const c = make();
    burst(c);
    c.takeHit(sword({ damage: 100 }));
    expect(c.repelTicks).toBe(0);
  });

  it('is not opened by the invulnerability a plain hit grants', () => {
    // Getting hit gives i-frames. Those must never turn the next sword into a
    // free parry, or every trade would become one.
    const c = make();
    c.invuln = 0;
    c.takeHit(shot({ damage: 10 }));
    expect(c.invuln).toBeGreaterThan(0);
    expect(c.repelTicks).toBe(0);
  });
});

describe('barrier burst — what the repel does to the attacker', () => {
  function pair(): MatchSim {
    const s = new MatchSim({ playerDef: HALCYON, enemyDef: NOCTURNE, seed: 3, introTicks: 1, arenaW: W, arenaH: H });
    for (let i = 0; i < 4; i++) s.step(emptyInput(), emptyInput());
    s.player.x = 900;
    s.enemy.x = 980;
    s.player.y = s.enemy.y = 600;
    return s;
  }

  it('knocks the attacker away and stuns them for a second', () => {
    const s = pair();
    const k = ctx();
    // Defender bursts.
    s.player.step(press(Btn.Barrier), s.enemy, W, H, k.spawns, k.events);
    expect(s.player.repelTicks).toBeGreaterThan(0);

    // The rival's sword lands on the defender.
    s.projectiles.spawn({
      ...sword({ damage: 60 }),
      x: s.player.x, y: s.player.y,
      ownerId: s.enemy.id, team: s.enemy.team,
    });
    const before = s.enemy.x;
    s.step(emptyInput(), emptyInput());

    expect(s.events.some((e) => e.t === 'meleeRepel')).toBe(true);
    expect(s.enemy.hitstun).toBeGreaterThanOrEqual(55);
    expect(s.enemy.act).toBe(ActState.Hitstun);
    // Thrown away from the defender, who was to their left.
    expect(s.enemy.x + s.enemy.vx).toBeGreaterThan(before);
  });

  it('costs the defender no life', () => {
    const s = pair();
    const k = ctx();
    s.player.step(press(Btn.Barrier), s.enemy, W, H, k.spawns, k.events);
    const before = s.player.life;
    s.projectiles.spawn({
      ...sword({ damage: 120 }),
      x: s.player.x, y: s.player.y,
      ownerId: s.enemy.id, team: s.enemy.team,
    });
    s.step(emptyInput(), emptyInput());
    expect(s.player.life).toBe(before);
  });

  it('drops the attacker\'s lock-on sequence', () => {
    const s = pair();
    const k = ctx();
    s.enemy.step(press(Btn.Melee), s.player, W, H, k.spawns, k.events);
    expect(s.enemy.meleeLock).not.toBeNull();
    s.player.step(press(Btn.Barrier), s.enemy, W, H, k.spawns, k.events);
    s.projectiles.spawn({
      ...sword({ damage: 60 }),
      x: s.player.x, y: s.player.y,
      ownerId: s.enemy.id, team: s.enemy.team,
    });
    s.step(emptyInput(), emptyInput());
    expect(s.enemy.meleeLock).toBeNull();
  });
});
