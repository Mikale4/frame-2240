import { describe, expect, it } from 'vitest';
import { Combatant } from '../combat/Combatant';
import { ATTACK_TOTAL } from '../combat/AttackData';
import {
  ActState,
  BarrierResponse,
  Btn,
  Phase,
  ProjKind,
  SatMode,
  Team,
  emptyInput,
  type InputFrame,
  type ProjectileSpawn,
  type SimEvent,
} from '../combat/types';
import { HALCYON, NOCTURNE } from '../data/mechs';

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

describe('attack state machine', () => {
  it('walks startup -> active -> recovery and fires exactly once', () => {
    const c = make();
    const k = ctx();
    const a = HALCYON.main;

    c.step(press(Btn.Main), null, W, H, k.spawns, k.events);
    expect(c.act).toBe(ActState.Attack);
    expect(c.phase).toBe(Phase.Startup);
    expect(k.spawns.length).toBe(0);

    // Advance to the active window.
    run(c, emptyInput(), a.startup - 1, null, k);
    expect(c.phase).toBe(Phase.Active);
    expect(k.spawns.length).toBe(1);

    run(c, emptyInput(), a.active, null, k);
    expect(c.phase).toBe(Phase.Recovery);

    run(c, emptyInput(), a.recovery + 2, null, k);
    expect(c.attack).toBeNull();
    expect(c.act).toBe(ActState.Free);
    // Still exactly one shot for one press.
    expect(k.spawns.length).toBe(1);
  });

  it('charges energy for a shot and refuses when empty', () => {
    const c = make();
    const k = ctx();
    const before = c.energy;
    c.step(press(Btn.Main), null, W, H, k.spawns, k.events);
    expect(c.energy).toBeLessThan(before);

    const broke = make();
    broke.energy = 0;
    const k2 = ctx();
    broke.step(press(Btn.Heavy), null, W, H, k2.spawns, k2.events);
    expect(broke.attack).toBeNull();
    expect(k2.spawns.length).toBe(0);
  });

  it('applies recoil opposite the aim axis', () => {
    const c = make();
    const k = ctx();
    c.aim = 0; // pointing +x
    run(c, press(Btn.Heavy), HALCYON.heavy.startup + 1, null, k);
    expect(c.vx).toBeLessThan(0);
  });

  it('freezes completely during hitstop', () => {
    const c = make();
    const k = ctx();
    c.vx = 4;
    c.hitstop = 3;
    const x0 = c.x;
    run(c, emptyInput(), 3, null, k);
    expect(c.x).toBe(x0);
    expect(c.hitstop).toBe(0);
    c.step(emptyInput(), null, W, H, k.spawns, k.events);
    expect(c.x).not.toBe(x0);
  });

  it('spreads multi-shot attacks across distinct angles', () => {
    const c = make();
    const k = ctx();
    run(c, press(Btn.Sub), HALCYON.sub.startup + 1, null, k);
    expect(k.spawns.length).toBe(HALCYON.sub.projCount);
    const angles = k.spawns.map((s) => Math.atan2(s.vy, s.vx));
    expect(new Set(angles.map((a) => a.toFixed(4))).size).toBe(angles.length);
  });

  it('spends sub-weapon charges and recharges them over time', () => {
    const c = make();
    const k = ctx();
    expect(c.subCharges).toBe(HALCYON.subCharges);
    // Press once and release; holding the button would auto-fire a second volley.
    c.step(press(Btn.Sub), null, W, H, k.spawns, k.events);
    run(c, emptyInput(), ATTACK_TOTAL(HALCYON.sub) + 1, null, k);
    expect(c.subCharges).toBe(HALCYON.subCharges - 1);
    run(c, emptyInput(), HALCYON.subRechargeTicks + 2, null, k);
    expect(c.subCharges).toBe(HALCYON.subCharges);
  });
});

describe('melee chain', () => {
  function meleePair(): { a: Combatant; b: Combatant; k: Ctx } {
    const a = make(HALCYON, 500, 600, 0, Team.Player);
    const b = make(NOCTURNE, 540, 600, 1, Team.Enemy);
    return { a, b, k: ctx() };
  }

  it('swings on the dedicated melee button', () => {
    const { a, b, k } = meleePair();
    a.step(press(Btn.Melee), b, W, H, k.spawns, k.events);
    expect(a.attack?.kind).toBe(ProjKind.Melee);
    expect(a.attack?.meleeStage).toBe(0);
  });

  it('always fires the gun on the main button, even point blank', () => {
    const { a, b, k } = meleePair();
    a.step(press(Btn.Main), b, W, H, k.spawns, k.events);
    expect(a.attack?.kind).toBe(ProjKind.Bullet);
  });

  /**
   * Melee is now a deliberate button rather than a proximity switch, so a swing
   * must be available at any range - the startup lunge is what closes distance.
   */
  it('swings at any range, with no target required', () => {
    for (const dist of [40, 120, 260, 800]) {
      const a = make(HALCYON, 1000, 600, 0, Team.Player);
      const b = make(NOCTURNE, 1000 + dist, 600, 1, Team.Enemy);
      const k = ctx();
      a.step(press(Btn.Melee), b, W, H, k.spawns, k.events);
      expect(a.attack?.kind).toBe(ProjKind.Melee);
    }
    // Even with no opponent at all.
    const lone = make();
    const k2 = ctx();
    lone.step(press(Btn.Melee), null, W, H, k2.spawns, k2.events);
    expect(lone.attack?.kind).toBe(ProjKind.Melee);
  });

  it('lunges far enough to cover the trigger range', () => {
    const m = HALCYON.melee[0];
    const reach = m.lunge! * m.startup + m.projRadius + HALCYON.rig.hurtRadius;
    // A swing started at max range must be able to reach the target.
    expect(reach).toBeGreaterThanOrEqual(HALCYON.meleeRange);
  });

  it('refuses to chain when the first stage whiffed', () => {
    const { a, b, k } = meleePair();
    const stage0 = HALCYON.melee[0];
    a.step(press(Btn.Melee), b, W, H, k.spawns, k.events);
    // Buffer a chain input inside the window but never confirm a hit.
    run(a, press(Btn.Melee), stage0.chainTo! - 1, b, k);
    expect(a.meleeChainQueued).toBe(true);
    run(a, emptyInput(), ATTACK_TOTAL(stage0) + 2, b, k);
    expect(a.attack).toBeNull();
    expect(a.meleeCount).toBe(0);
  });

  it('chains to stage two once the hit is confirmed', () => {
    const { a, b, k } = meleePair();
    const stage0 = HALCYON.melee[0];
    a.step(press(Btn.Melee), b, W, H, k.spawns, k.events);
    // Advance into the authored chain window before buffering the follow-up.
    run(a, emptyInput(), stage0.chainFrom!, b, k);
    a.confirmHit();
    run(a, press(Btn.Melee), 2, b, k);
    expect(a.meleeChainQueued).toBe(true);
    run(a, emptyInput(), ATTACK_TOTAL(stage0) + 2, b, k);
    expect(a.attack?.meleeStage).toBe(1);
  });

  it('reaches three hits normally and six under Speed saturation', () => {
    const normal = make();
    expect(normal.maxMeleeHits).toBe(3);
    normal.satActive = true;
    normal.satMode = SatMode.Speed;
    expect(normal.maxMeleeHits).toBe(6);
  });

  /**
   * Regression: the swing committed along the slewed aim. Starting a swing while
   * the mounts were still coming around lunged *away* from the enemy, and the
   * in-flight tracking could not correct it inside the startup window.
   */
  it('locks on to the target as the swing commits', () => {
    const a = make(HALCYON, 1000, 600, 0, Team.Player);
    const b = make(NOCTURNE, 1150, 500, 1, Team.Enemy);
    const k = ctx();
    a.aim = Math.PI; // mounts pointing the wrong way
    a.step(press(Btn.Melee), b, W, H, k.spawns, k.events);
    run(a, emptyInput(), 3, b, k);
    // Now travelling toward the target, not away from it.
    expect(a.vx).toBeGreaterThan(0);
    expect(a.vy).toBeLessThan(0);
  });

  it('connects on an off-axis target', () => {
    const a = make(HALCYON, 1000, 600, 0, Team.Player);
    const b = make(NOCTURNE, 1150, 500, 1, Team.Enemy);
    const k = ctx();
    a.step(press(Btn.Melee), b, W, H, k.spawns, k.events);
    run(a, emptyInput(), HALCYON.melee[0].startup + 1, b, k);
    const hit = k.spawns.find((s) => s.kind === ProjKind.Melee);
    expect(hit).toBeDefined();
    // The hit spawns close enough to the target to actually land.
    const d = Math.hypot(hit!.x - b.x, hit!.y - b.y);
    expect(d).toBeLessThan(hit!.radius + b.def.rig.hurtRadius);
  });

  it('locks melee out after a chain ends, blocking endless pressure', () => {
    const { a, b, k } = meleePair();
    a.step(press(Btn.Melee), b, W, H, k.spawns, k.events);
    run(a, emptyInput(), ATTACK_TOTAL(HALCYON.melee[0]) + 2, b, k);
    expect(a.attack).toBeNull();
    expect(a.meleeLockout).toBeGreaterThan(0);
    // A fresh press during the lockout does nothing.
    a.step(press(Btn.Melee), b, W, H, k.spawns, k.events);
    expect(a.attack).toBeNull();
    // ...but works once it expires.
    run(a, emptyInput(), a.meleeLockout + 1, b, k);
    a.step(press(Btn.Melee), b, W, H, k.spawns, k.events);
    expect(a.attack?.kind).toBe(ProjKind.Melee);
  });

  it('marks melee as barrier-piercing', () => {
    for (const m of HALCYON.melee) expect(m.barrier).toBe(BarrierResponse.Pierce);
  });
});

describe('barrier and guard', () => {
  function shot(over: Partial<ProjectileSpawn> = {}): ProjectileSpawn {
    return {
      x: 0,
      y: 0,
      vx: -10,
      vy: 0,
      damage: 100,
      guardDamage: 30,
      life: 50,
      radius: 6,
      ownerId: 9,
      team: Team.Enemy,
      kind: ProjKind.Bullet,
      barrier: BarrierResponse.Absorb,
      hitstop: 6,
      hitstun: 10,
      knockback: 3,
      homing: 0,
      pierceCount: 0,
      ...over,
    };
  }

  it('grants invulnerability and converts absorbed shots into saturation', () => {
    const c = make();
    const k = ctx();
    c.step(press(Btn.Barrier), null, W, H, k.spawns, k.events);
    expect(c.invuln).toBeGreaterThan(0);
    expect(k.events.some((e) => e.t === 'barrier')).toBe(true);

    const sat0 = c.sat;
    expect(c.takeHit(shot())).toBe('absorbed');
    expect(c.sat).toBeGreaterThan(sat0);
    expect(c.life).toBe(HALCYON.gauges.maxLife);
  });

  it('lets melee through a barrier', () => {
    const c = make();
    const k = ctx();
    c.step(press(Btn.Barrier), null, W, H, k.spawns, k.events);
    const before = c.life;
    expect(c.takeHit(shot({ barrier: BarrierResponse.Pierce }))).toBe('ignored');
    // Ignored means no damage this instant, but the barrier does not absorb it
    // into saturation either — melee simply is not answered by barrier.
    expect(c.life).toBe(before);
  });

  it('costs extra to barrier out of hitstun', () => {
    const plain = make();
    const k1 = ctx();
    plain.step(press(Btn.Barrier), null, W, H, k1.spawns, k1.events);
    const plainSpend = HALCYON.gauges.maxBarrier - plain.barrier;

    const cancel = make();
    cancel.hitstun = 20;
    cancel.act = ActState.Hitstun;
    const k2 = ctx();
    cancel.step(press(Btn.Barrier), null, W, H, k2.spawns, k2.events);
    const cancelSpend = HALCYON.gauges.maxBarrier - cancel.barrier;

    expect(cancelSpend).toBeGreaterThan(plainSpend);
    expect(cancel.hitstun).toBe(0);
  });

  it('scales damage down while guarding', () => {
    const guard = make();
    const k = ctx();
    guard.step(hold(Btn.Barrier), null, W, H, k.spawns, k.events);
    expect(guard.guarding).toBe(true);
    expect(guard.takeHit(shot())).toBe('guarded');
    expect(guard.life).toBeGreaterThan(HALCYON.gauges.maxLife - 100);

    const open = make();
    expect(open.takeHit(shot())).toBe('hit');
    expect(open.life).toBe(HALCYON.gauges.maxLife - 100);
  });

  it('breaks the guard when the barrier gauge empties', () => {
    const c = make();
    const k = ctx();
    c.barrier = 2;
    run(c, hold(Btn.Barrier), 8, null, k);
    expect(c.guardBreakStun).toBeGreaterThan(0);
    expect(k.events.some((e) => e.t === 'guardBreak')).toBe(true);
  });

  it('cannot guard mid-dash', () => {
    const c = make();
    c.dashTicks = 5;
    expect(c.canGuard).toBe(false);
  });
});

describe('saturation', () => {
  it('cycles modes with the dedicated button', () => {
    const c = make();
    const k = ctx();
    expect(c.satMode).toBe(SatMode.Shield);
    c.step(press(Btn.ModeCycle), null, W, H, k.spawns, k.events);
    expect(c.satMode).toBe(SatMode.Shoot);
    c.step(press(Btn.ModeCycle), null, W, H, k.spawns, k.events);
    expect(c.satMode).toBe(SatMode.Speed);
    c.step(press(Btn.ModeCycle), null, W, H, k.spawns, k.events);
    expect(c.satMode).toBe(SatMode.Shield);
  });

  it('requires a full meter to activate', () => {
    const c = make();
    const k = ctx();
    c.sat = 10;
    c.step(press(Btn.Main, Btn.Heavy), null, W, H, k.spawns, k.events);
    expect(c.satActive).toBe(false);

    const full = make();
    full.sat = HALCYON.gauges.maxSaturation;
    const k2 = ctx();
    full.step(press(Btn.Main, Btn.Heavy), null, W, H, k2.spawns, k2.events);
    expect(full.satActive).toBe(true);
    expect(k2.events.some((e) => e.t === 'saturation')).toBe(true);
  });

  it('applies the documented per-mode multipliers', () => {
    const c = make();
    c.satActive = true;

    c.satMode = SatMode.Speed;
    expect(c.satSpeedScale).toBeCloseTo(1.75);
    expect(c.satShootScale).toBeCloseTo(1);

    c.satMode = SatMode.Shoot;
    expect(c.satShootScale).toBeCloseTo(1.5);
    expect(c.satProjSpeedScale).toBeCloseTo(1.6);

    c.satMode = SatMode.Shield;
    expect(c.shieldActive).toBe(true);
  });

  it('drains Shield mode twice as fast as the others', () => {
    const shield = make();
    const shoot = make();
    for (const c of [shield, shoot]) {
      c.satActive = true;
      c.satTicks = 100;
    }
    shield.satMode = SatMode.Shield;
    shoot.satMode = SatMode.Shoot;
    const k = ctx();
    run(shield, emptyInput(), 10, null, k);
    run(shoot, emptyInput(), 10, null, k);
    expect(shield.satTicks).toBe(80);
    expect(shoot.satTicks).toBe(90);
  });

  it('refills the boost tank when Speed mode activates', () => {
    const c = make();
    c.sat = HALCYON.gauges.maxSaturation;
    c.satMode = SatMode.Speed;
    c.boost = 5;
    const k = ctx();
    c.step(press(Btn.Main, Btn.Heavy), null, W, H, k.spawns, k.events);
    expect(c.boost).toBe(HALCYON.flight.maxBoost);
  });

  it('boosts shot damage while Shoot mode is up', () => {
    const c = make();
    c.satActive = true;
    c.satTicks = HALCYON.gauges.satDuration;
    c.satMode = SatMode.Shoot;
    const k = ctx();
    run(c, press(Btn.Main), HALCYON.main.startup + 1, null, k);
    expect(k.spawns[0].damage).toBeCloseTo(HALCYON.main.damage * 1.5);
    expect(k.spawns[0].vx ** 2 + k.spawns[0].vy ** 2).toBeGreaterThan(
      (HALCYON.main.projSpeed * 1.3) ** 2,
    );
  });
});

describe('damage and death', () => {
  it('never drops below zero life and reports death', () => {
    const c = make();
    const spawn: ProjectileSpawn = {
      x: 0, y: 0, vx: 1, vy: 0, damage: 99999, guardDamage: 0, life: 1, radius: 4,
      ownerId: 9, team: Team.Enemy, kind: ProjKind.Bullet, barrier: BarrierResponse.Absorb,
      hitstop: 0, hitstun: 0, knockback: 0, homing: 0, pierceCount: 0,
    };
    c.takeHit(spawn);
    expect(c.life).toBe(0);
    expect(c.alive).toBe(false);
  });

  it('interrupts an in-progress attack when hit', () => {
    const c = make();
    const k = ctx();
    c.step(press(Btn.Heavy), null, W, H, k.spawns, k.events);
    expect(c.attack).not.toBeNull();
    c.takeHit({
      x: 0, y: 0, vx: -1, vy: 0, damage: 10, guardDamage: 0, life: 1, radius: 4,
      ownerId: 9, team: Team.Enemy, kind: ProjKind.Bullet, barrier: BarrierResponse.Absorb,
      hitstop: 4, hitstun: 12, knockback: 2, homing: 0, pierceCount: 0,
    });
    expect(c.attack).toBeNull();
    expect(c.act).toBe(ActState.Hitstun);
  });
});
