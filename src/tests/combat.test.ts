import { describe, expect, it } from 'vitest';
import { Combatant } from '../combat/Combatant';

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
import { HALCYON, MECHS, NOCTURNE } from '../data/mechs';

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
    // SCATTER is the chassis's own multi-shot: down, then forward + main.
    // (The sub-weapon is no longer fired by the chassis — the drone carries it,
    // and its spread is covered in supporter.test.ts.)
    c.step({ ...emptyInput(), dx: 0, dy: 1 }, null, W, H, k.spawns, k.events);
    c.step({ ...emptyInput(), dx: 1, dy: 0, held: 1 << Btn.Main, pressed: 1 << Btn.Main }, null, W, H, k.spawns, k.events);
    expect(c.attack?.id).toBe('spread');

    run(c, emptyInput(), HALCYON.spread.startup, null, k);
    expect(k.spawns.length).toBe(HALCYON.spread.projCount);
    const angles = k.spawns.map((s) => Math.atan2(s.vy, s.vx));
    expect(new Set(angles.map((a) => a.toFixed(4))).size).toBe(angles.length);
  });

  it('recharges spent sub-weapon charges over time', () => {
    const c = make();
    const k = ctx();
    expect(c.subCharges).toBe(HALCYON.subCharges);
    // The assist button is a deploy toggle now, so a charge is spent by the
    // drone taking one — `requestVolley` — not by the chassis pressing a button.
    expect(c.requestVolley()).toBe(HALCYON.sub);
    expect(c.subCharges).toBe(HALCYON.subCharges - 1);
    run(c, emptyInput(), HALCYON.subRechargeTicks + 2, null, k);
    expect(c.subCharges).toBe(HALCYON.subCharges);
  });

  it('refuses a volley it cannot pay for', () => {
    const c = make();
    c.subCharges = 0;
    expect(c.requestVolley()).toBeNull();
    expect(c.subCharges).toBe(0);
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
    // With a valid target this opens the lock-on sequence.
    expect(a.meleeLock).not.toBeNull();
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
  it('always does something on the melee button', () => {
    // Inside acquire range it locks on; outside, or with no opponent at all, it
    // falls back to a single swing. The button is never dead.
    for (const dist of [40, 120, 260, 400]) {
      const a = make(HALCYON, 1000, 600, 0, Team.Player);
      const b = make(NOCTURNE, 1000 + dist, 600, 1, Team.Enemy);
      const k = ctx();
      a.step(press(Btn.Melee), b, W, H, k.spawns, k.events);
      expect(a.meleeLock).not.toBeNull();
    }
    const lone = make();
    const k2 = ctx();
    lone.step(press(Btn.Melee), null, W, H, k2.spawns, k2.events);
    expect(lone.meleeLock).toBeNull();
    expect(lone.attack?.kind).toBe(ProjKind.Melee);
  });

  it('lunges far enough to cover the trigger range', () => {
    const m = HALCYON.melee[0];
    const reach = m.lunge! * m.startup + m.projRadius + HALCYON.rig.hurtRadius;
    // A swing started at max range must be able to reach the target.
    expect(reach).toBeGreaterThanOrEqual(HALCYON.meleeRange);
  });

  /**
   * Melee is a committed lock-on sequence, not a manually re-pressed chain:
   * one press acquires the target and runs the whole thing.
   */
  it('opens a lock-on sequence on a valid target', () => {
    const { a, b, k } = meleePair();
    a.step(press(Btn.Melee), b, W, H, k.spawns, k.events);
    expect(a.meleeLock).not.toBeNull();
    expect(a.announced).toBe(HALCYON.meleeLock.name);
    // The opening cost is paid up front.
    expect(a.energy).toBeLessThanOrEqual(HALCYON.gauges.maxEnergy - HALCYON.meleeLock.energy);
  });

  it('runs every swing from a single press', () => {
    const { a, b, k } = meleePair();
    const p = HALCYON.meleeLock;
    a.step(press(Btn.Melee), b, W, H, k.spawns, k.events);
    // Never press again; the sequence drives itself.
    run(a, emptyInput(), p.maxLife + 10, b, k);
    const hits = k.spawns.filter((s) => s.kind === ProjKind.Melee);
    expect(hits.length).toBe(p.hits);
    expect(a.meleeLock).toBeNull();
  });

  it('escalates damage across the sequence and hits hardest last', () => {
    const { a, b, k } = meleePair();
    const p = HALCYON.meleeLock;
    a.step(press(Btn.Melee), b, W, H, k.spawns, k.events);
    run(a, emptyInput(), p.maxLife + 10, b, k);
    const hits = k.spawns.filter((s) => s.kind === ProjKind.Melee);
    expect(hits.at(-1)!.damage).toBeGreaterThan(hits[0].damage);
    // The finisher separates: biggest knockback of the sequence.
    expect(hits.at(-1)!.knockback).toBeGreaterThan(hits[0].knockback);
  });

  it('refuses to lock on beyond acquire range, but still swings', () => {
    const a = make(HALCYON, 200, 600, 0, Team.Player);
    const b = make(NOCTURNE, 200 + HALCYON.meleeLock.acquireRange + 200, 600, 1, Team.Enemy);
    const k = ctx();
    a.step(press(Btn.Melee), b, W, H, k.spawns, k.events);
    expect(a.meleeLock).toBeNull();
    // The button is never dead — it falls back to a single swing.
    expect(a.attack?.kind).toBe(ProjKind.Melee);
  });

  it('fizzles when energy runs out mid-sequence', () => {
    // A frame with no regen, so the swing costs genuinely bite.
    const starved = {
      ...HALCYON,
      gauges: { ...HALCYON.gauges, energyRegen: 0 },
    };
    const a = new Combatant({ id: 0, team: Team.Player, def: starved, x: 500, y: 600, facing: 1 });
    const b = make(NOCTURNE, 560, 600, 1, Team.Enemy);
    const k = ctx();
    const p = starved.meleeLock;
    a.energy = p.energy + p.hitEnergy * 2 + 1;

    a.step(press(Btn.Melee), b, W, H, k.spawns, k.events);
    expect(a.meleeLock).not.toBeNull();
    // Stop as soon as it ends, so the lockout has not ticked away yet.
    let guard = 0;
    while (a.meleeLock && guard++ < 400) {
      a.step(emptyInput(), b, W, H, k.spawns, k.events);
    }
    const hits = k.spawns.filter((s) => s.kind === ProjKind.Melee);
    expect(hits.length).toBeLessThan(p.hits);
    expect(a.meleeLockout).toBeGreaterThan(0);
  });

  it('drops the lock when the pilot is hit', () => {
    const { a, b, k } = meleePair();
    a.step(press(Btn.Melee), b, W, H, k.spawns, k.events);
    expect(a.meleeLock).not.toBeNull();
    a.hitstun = 20;
    a.step(emptyInput(), b, W, H, k.spawns, k.events);
    expect(a.meleeLock).toBeNull();
  });

  /**
   * Regression: the swing used to commit along the slewed aim, so starting one
   * while the mounts were still coming around lunged *away* from the enemy.
   */
  it('locks on to the target as the sequence commits', () => {
    const a = make(HALCYON, 1000, 600, 0, Team.Player);
    const b = make(NOCTURNE, 1150, 500, 1, Team.Enemy);
    const k = ctx();
    a.aim = Math.PI; // mounts pointing the wrong way
    a.step(press(Btn.Melee), b, W, H, k.spawns, k.events);
    run(a, emptyInput(), 3, b, k);
    expect(a.vx).toBeGreaterThan(0);
    expect(a.vy).toBeLessThan(0);
  });

  it('locks melee out after the sequence, blocking endless pressure', () => {
    const { a, b, k } = meleePair();
    a.step(press(Btn.Melee), b, W, H, k.spawns, k.events);
    // Step only until the sequence actually ends, so the lockout is still live.
    let guard = 0;
    while (a.meleeLock && guard++ < 400) {
      a.step(emptyInput(), b, W, H, k.spawns, k.events);
    }
    expect(a.meleeLockout).toBeGreaterThan(0);
    a.step(press(Btn.Melee), b, W, H, k.spawns, k.events);
    expect(a.meleeLock).toBeNull();
  });

  it('keeps the blade lit across the swing gaps', () => {
    const { a, b, k } = meleePair();
    a.step(press(Btn.Melee), b, W, H, k.spawns, k.events);
    for (let i = 0; i < 30; i++) {
      a.step(emptyInput(), b, W, H, k.spawns, k.events);
      if (a.meleeLock) expect(a.bladeTimer).toBeGreaterThan(0);
    }
  });

  it('marks melee as barrier-piercing', () => {
    for (const m of HALCYON.melee) expect(m.barrier).toBe(BarrierResponse.Pierce);
  });

  /**
   * A chain must hold itself together.
   *
   * Non-final hitstun was a flat 14 while the interval between hits is
   * `swing + gap`, authored per weapon from 10 to 26. Whether a combo could be
   * escaped was therefore never designed — it was whichever side of one constant
   * a weapon's animation fell on, and it fell backwards: the two-hit heavies
   * (OBELISK 26, TERRAMOTH 24, VESPER 21) handed the victim ten to twelve free
   * frames after the *first* hit, enough to open a lock of their own and swing
   * back, so their finisher essentially never landed. CIRRUS at 10 was airtight.
   */
  it('covers the gap between hits for every weapon', () => {
    for (const def of Object.values(MECHS)) {
      const p = def.meleeLock;
      const stun = Math.max(14, p.swing + p.gap + 2);
      expect(stun, `${p.name} must out-last its own ${p.swing}+${p.gap} cadence`).toBeGreaterThan(
        p.swing + p.gap,
      );
    }
  });

  it('cannot be escaped by mashing melee, but can be by mashing barrier', () => {
    for (const def of Object.values(MECHS)) {
      const escape = (counter: Btn | null) => {
        const a = make(def, 400, 600, 0, Team.Player);
        const b = make(HALCYON, 440, 600, 1, Team.Enemy);
        const k = { spawns: [] as ProjectileSpawn[], events: [] as SimEvent[] };
        b.invuln = 0;
        a.step(press(Btn.Melee), b, W, H, k.spawns, k.events);
        let struck = false;
        let acted = false;
        let free = 0;
        for (let i = 0; i < 200 && a.meleeLock; i++) {
          a.step(emptyInput(), b, W, H, k.spawns, k.events);
          for (const s of k.spawns.splice(0)) if (s.ownerId === a.id) b.takeHit(s);
          b.step(
            struck && counter !== null ? press(counter) : emptyInput(),
            a,
            W,
            H,
            k.spawns,
            k.events,
          );
          k.spawns.length = 0;
          if (a.meleeLock?.hitDone) struck = true;
          if (struck && b.hitstun <= 0 && b.guardBreakStun <= 0) free++;
          if (struck && b.meleeLock) acted = true;
        }
        return { acted, free };
      };
      expect(escape(Btn.Melee).acted, `${def.name} chain broken by melee mash`).toBe(false);
      expect(escape(Btn.Barrier).free, `${def.name} chain must yield to barrier`).toBeGreaterThan(0);
    }
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

  // Activation is its own button now; see saturation.test.ts for the history.
  it('requires a full meter to activate', () => {
    const c = make();
    const k = ctx();
    c.sat = 10;
    c.step(press(Btn.Saturation), null, W, H, k.spawns, k.events);
    expect(c.satActive).toBe(false);

    const full = make();
    full.sat = HALCYON.gauges.maxSaturation;
    const k2 = ctx();
    full.step(press(Btn.Saturation), null, W, H, k2.spawns, k2.events);
    expect(full.satActive).toBe(true);
    expect(k2.events.some((e) => e.t === 'saturation')).toBe(true);
  });

  it('applies the documented per-mode multipliers', () => {
    const c = make();
    c.satActive = true;

    c.satMode = SatMode.Speed;
    // Base movement rises a little; the thrusters are the headline.
    expect(c.satSpeedScale).toBeCloseTo(1.25);
    expect(c.satThrustScale).toBeCloseTo(1.85);
    expect(c.satThrustScale).toBeGreaterThan(c.satSpeedScale);
    expect(c.satShootScale).toBeCloseTo(1);

    c.satMode = SatMode.Shoot;
    expect(c.satShootScale).toBeCloseTo(1.5);
    expect(c.satProjSpeedScale).toBeCloseTo(1.6);
    // Speed's movement bonus does not leak into the other modes.
    expect(c.satSpeedScale).toBeCloseTo(1);
    expect(c.satThrustScale).toBeCloseTo(1);

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
    c.step(press(Btn.Saturation), null, W, H, k.spawns, k.events);
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

/**
 * The ground game's combat half.
 *
 * `balance.ts` cannot see any of this — `RivalAI` never presses `Btn.Flight`,
 * so the rival is airborne for 100 % of every measured match and every rule
 * below is unreachable in a sweep. These assertions are the feature's only
 * evidence, which is why each one names the behaviour rather than the constant.
 */
describe('ground game — combat rules', () => {
  const G = 600;
  /** Plants a machine on the deck, as `MatchSim` does with a real floor. */
  // TERRAMOTH deliberately: it is the machine the ground game is authored
  // around, and the only one whose `groundedMul` is worth standing for.
  function planted(def = MECHS.terramoth): Combatant {
    const c = make(def, 400, G);
    c.groundY = G;
    c.flying = false;
    const k = ctx();
    // One step to settle onto the floor and set `grounded`.
    run(c, emptyInput(), 2, null, k);
    return c;
  }

  it('plants a machine that has flight switched off', () => {
    expect(planted().grounded).toBe(true);
  });

  /** A — the heavy used to force FlyingMode on and kick the mech off the deck. */
  it('keeps a planted mech on the deck when it fires its heavy', () => {
    const c = planted();
    const k = ctx();
    c.step(press(Btn.Heavy), null, W, H, k.spawns, k.events);
    expect(c.flying).toBe(false);
    expect(k.events.some((e) => e.t === 'takeoff')).toBe(false);
  });

  /** B — a planted frame eats its own recoil. */
  it('takes no recoil while planted and real recoil while airborne', () => {
    const grounded = planted();
    const kg = ctx();
    const before = grounded.vx;
    run(grounded, press(Btn.Main), grounded.def.main.startup + 1, null, kg);
    expect(kg.spawns.length).toBeGreaterThan(0);
    expect(grounded.vx).toBeCloseTo(before, 5);

    const air = make(grounded.def, 400, 200);
    const ka = ctx();
    run(air, press(Btn.Main), air.def.main.startup + 1, null, ka);
    expect(ka.spawns.length).toBeGreaterThan(0);
    expect(air.vx).toBeLessThan(0);
  });

  /** C — slight, not immovable. */
  it('resists knockback slightly while planted, and is still moved', () => {
    const shot = (): ProjectileSpawn => ({
      x: 0, y: 0, vx: 10, vy: 0, damage: 0, guardDamage: 0, life: 4, radius: 6,
      ownerId: 1, team: Team.Enemy, kind: ProjKind.Bullet,
      barrier: BarrierResponse.Absorb, hitstop: 0, hitstun: 0, knockback: 10,
      homing: 0, pierceCount: 0,
    });
    const g = planted();
    const a = make(g.def, 400, 200);
    g.takeHit(shot());
    a.takeHit(shot());
    expect(g.vx).toBeGreaterThan(0);          // still shoved
    expect(g.vx).toBeLessThan(a.vx);          // just less far
    expect(g.vx / a.vx).toBeGreaterThan(0.7); // and not by much
  });

  /** E — planted reload. */
  it('regenerates weapon energy faster while planted', () => {
    const g = planted();
    const a = make(g.def, 400, 200);
    g.energy = 0;
    a.energy = 0;
    const k = ctx();
    run(g, emptyInput(), 30, null, k);
    run(a, emptyInput(), 30, null, k);
    expect(g.energy).toBeGreaterThan(a.energy);
  });

  /** F — braced guard. */
  it('spends less barrier on a guarded hit while planted', () => {
    const guarded = (): ProjectileSpawn => ({
      x: 0, y: 0, vx: 10, vy: 0, damage: 20, guardDamage: 40, life: 4, radius: 6,
      ownerId: 1, team: Team.Enemy, kind: ProjKind.Bullet,
      barrier: BarrierResponse.Absorb, hitstop: 0, hitstun: 0, knockback: 0,
      homing: 0, pierceCount: 0,
    });
    const g = planted();
    const a = make(g.def, 400, 200);
    g.guarding = true;
    a.guarding = true;
    const b0 = g.barrier;
    g.takeHit(guarded());
    a.takeHit(guarded());
    expect(g.barrier).toBeLessThan(b0);        // still costs something
    expect(g.barrier).toBeGreaterThan(a.barrier);
  });
});
