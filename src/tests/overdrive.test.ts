import { describe, expect, it } from 'vitest';
import { MatchSim } from '../combat/MatchSim';
import { MECHS, ROSTER } from '../data/mechs';
import {
  Btn,
  MatchPhase,
  ProjKind,
  SatMode,
  WeaponSlot,
  emptyInput,
  type InputFrame,
} from '../combat/types';

/**
 * CIRRUS's OVERDRIVE — all three saturation modes at once, then nothing.
 *
 * Two states, and the second is the interesting one: after the window the
 * thrusters and both guns are *destroyed*, not disabled, and the only thing left
 * is the sword at half again its damage.
 */

const CIRRUS = MECHS.cirrus;
const HALCYON = MECHS.halcyon;
const press = (b: Btn): InputFrame => ({ ...emptyInput(), pressed: 1 << b, held: 1 << b });

function sim(playerDef = CIRRUS): MatchSim {
  const s = new MatchSim({
    playerDef,
    enemyDef: HALCYON,
    seed: 9,
    introTicks: 1,
    roundTicks: 10800,
  });
  for (let i = 0; i < 4; i++) s.step(emptyInput(), emptyInput());
  return s;
}

/** Drops CIRRUS under the threshold and lets the gate fire. */
function open(s: MatchSim): void {
  s.player.life = s.player.def.gauges.maxLife * 0.2;
  s.step(emptyInput(), emptyInput());
}

describe('who carries it', () => {
  it('is CIRRUS, and only CIRRUS', () => {
    expect(CIRRUS.overdrive).toEqual({ threshold: 0.25, ticks: 600, meleeMul: 1.5 });
    for (const m of ROSTER) {
      if (m.id === 'cirrus') continue;
      expect(m.overdrive, m.id).toBeUndefined();
    }
  });
});

describe('the window', () => {
  it('opens at a quarter hull and not before', () => {
    const s = sim();
    s.player.life = s.player.def.gauges.maxLife * 0.3;
    s.step(emptyInput(), emptyInput());
    expect(s.player.overdriveActive).toBe(false);
    open(s);
    expect(s.player.overdriveActive).toBe(true);
    expect(s.player.overdriveTicks).toBeGreaterThan(560);
  });

  it('runs all three saturation modes at once', () => {
    const s = sim();
    open(s);
    expect(s.player.shieldActive).toBe(true);
    expect(s.player.shootActive).toBe(true);
    expect(s.player.speedActive).toBe(true);
    // ...which is what makes every derived resource free, with no special cases.
    expect(s.player.barrierFree).toBe(true);
    expect(s.player.energyFree).toBe(true);
    expect(s.player.boostFree).toBe(true);
  });

  it('denies the pilot a saturation burst of their own while it runs', () => {
    const s = sim();
    open(s);
    s.player.sat = s.player.def.gauges.maxSaturation;
    for (let i = 0; i < 30; i++) s.step(press(Btn.Saturation), emptyInput());
    expect(s.player.satActive).toBe(false);
    expect(s.player.overdriveActive).toBe(true);
  });

  /**
   * **It is not LAST STAND.** All three modes include Shield, so damage is
   * reduced — but nothing about OVERDRIVE prevents death, and a machine that
   * could not be killed for ten seconds would be a different ability entirely.
   */
  it('does not make her invulnerable — she can still be killed', () => {
    const s = sim();
    open(s);
    expect(s.player.overdriveActive).toBe(true);
    const before = s.player.life;
    s.player.takeHit({
      x: s.player.x,
      y: s.player.y,
      vx: 1,
      vy: 0,
      damage: 300,
      guardDamage: 0,
      life: 5,
      radius: 5,
      ownerId: 1,
      team: 1,
      kind: ProjKind.Bullet,
      barrier: 0,
      hitstop: 0,
      hitstun: 0,
      knockback: 0,
      homing: 0,
      pierceCount: 0,
    });
    // Reduced by Shield, but taken.
    expect(s.player.life).toBeLessThan(before);

    s.player.life = 0;
    s.step(emptyInput(), emptyInput());
    expect(s.player.alive).toBe(false);
  });

  /**
   * **OVERDRIVE is not a desperation burst and must not borrow its effects.**
   *
   * `desperateSpeed` is `speedActive && satDesperate`, and OVERDRIVE turns
   * `speedActive` on. Desperation opens below a third of a life bar and OVERDRIVE
   * at a quarter, so a pilot is often already inside a desperate burst when it
   * fires — and leaving `satDesperate` set handed her true-damage melee and
   * arena-crossing reach from a mechanic this passive does not use.
   */
  it('does not inherit desperation, even when it interrupts a desperate burst', () => {
    const s = sim();
    // Open a genuine desperate burst first: under the desperation line, but
    // still above OVERDRIVE's threshold.
    s.player.life = s.player.def.gauges.maxLife * 0.3;
    s.player.sat = s.player.def.gauges.maxSaturation;
    s.player.satMode = SatMode.Speed;
    for (let i = 0; i < 10 && !s.player.satActive; i++) {
      s.step(press(Btn.Saturation), emptyInput());
    }
    expect(s.player.satActive).toBe(true);
    expect(s.player.satDesperate).toBe(true);
    const desperateReach = s.player.effectiveMeleeRange;

    // Now drop her into OVERDRIVE.
    open(s);
    expect(s.player.overdriveActive).toBe(true);
    expect(s.player.satDesperate).toBe(false);
    expect(s.player.desperateSpeed).toBe(false);
    expect(s.player.desperateShoot).toBe(false);
    expect(s.player.desperateShield).toBe(false);
    // Reach is back to the ordinary number, not desperation's arena-crossing one.
    expect(s.player.effectiveMeleeRange).toBeLessThan(desperateReach);
    expect(s.player.effectiveMeleeRange).toBe(s.player.def.meleeRange);
  });

  it('is once per match', () => {
    const s = sim();
    open(s);
    for (let i = 0; i < 640 && s.phase !== MatchPhase.Over; i++) s.step(emptyInput(), emptyInput());
    expect(s.player.overdriveActive).toBe(false);
    expect(s.player.overdriveUsed).toBe(true);
    s.player.life = 10;
    for (let i = 0; i < 30; i++) s.step(emptyInput(), emptyInput());
    expect(s.player.overdriveActive).toBe(false);
  });
});

describe('the burnout', () => {
  function burn(): MatchSim {
    const s = sim();
    open(s);
    for (let i = 0; i < 640 && s.phase !== MatchPhase.Over; i++) s.step(emptyInput(), emptyInput());
    return s;
  }

  it('announces both moments', () => {
    const s = sim();
    open(s);
    expect(s.events.some((e) => e.t === 'overdrive')).toBe(true);
    let spent = false;
    for (let i = 0; i < 640 && s.phase !== MatchPhase.Over; i++) {
      s.step(emptyInput(), emptyInput());
      if (s.events.some((e) => e.t === 'overdriveSpent')) spent = true;
    }
    expect(spent).toBe(true);
  });

  it('destroys both guns, permanently', () => {
    const s = burn();
    expect(s.player.overdriveSpent).toBe(true);
    expect(s.player.weaponDisabled(WeaponSlot.Main)).toBe(true);
    expect(s.player.weaponDisabled(WeaponSlot.Heavy)).toBe(true);
    // Not a disarm on a timer — nothing brings these back.
    for (let i = 0; i < 400; i++) s.step(emptyInput(), emptyInput());
    expect(s.player.weaponDisabled(WeaponSlot.Main)).toBe(true);
    expect(s.player.weaponDisabled(WeaponSlot.Heavy)).toBe(true);
  });

  it('fires nothing from the gun buttons afterwards', () => {
    const s = burn();
    let shots = 0;
    for (let i = 0; i < 90; i++) {
      s.step(press(Btn.Main), emptyInput());
      shots += s.events.filter((e) => e.t === 'fire' && e.ownerId === s.player.id).length;
      s.step(press(Btn.Heavy), emptyInput());
      shots += s.events.filter((e) => e.t === 'fire' && e.ownerId === s.player.id).length;
    }
    expect(shots).toBe(0);
  });

  it('leaves the sword, and leaves it working', () => {
    const s = burn();
    expect(s.player.weaponDisabled(WeaponSlot.Melee)).toBe(false);
    let swung = false;
    for (let i = 0; i < 60 && !swung; i++) {
      s.step(press(Btn.Melee), emptyInput());
      if (s.events.some((e) => e.t === 'melee' && e.id === s.player.id)) swung = true;
    }
    expect(swung).toBe(true);
  });

  it('makes the sword half again as strong', () => {
    const s = burn();
    expect(s.player.meleeScale).toBeCloseTo(1.5, 5);
    // ...and only after the burnout.
    const fresh = sim();
    expect(fresh.player.meleeScale).toBe(1);
  });

  it('takes the thrusters away', () => {
    const travel = (spent: boolean): number => {
      const s = spent ? burn() : sim();
      const x0 = s.player.x;
      const run: InputFrame = { ...emptyInput(), dx: 1, held: 1 << Btn.Boost };
      for (let i = 0; i < 60; i++) s.step(run, emptyInput());
      return Math.abs(s.player.x - x0);
    };
    expect(travel(true)).toBeLessThan(travel(false));
  });

  it('leaves the three modes off once the window closes', () => {
    const s = burn();
    expect(s.player.shieldActive).toBe(false);
    expect(s.player.shootActive).toBe(false);
    expect(s.player.speedActive).toBe(false);
  });
});

describe('it does not disturb the seven machines without it', () => {
  it('leaves an ordinary saturation burst alone', () => {
    const s = sim(HALCYON);
    s.player.sat = s.player.def.gauges.maxSaturation;
    s.player.satMode = SatMode.Shoot;
    for (let i = 0; i < 10 && !s.player.satActive; i++) {
      s.step(press(Btn.Saturation), emptyInput());
    }
    expect(s.player.satActive).toBe(true);
    expect(s.player.shootActive).toBe(true);
    // The other two must stay off. OVERDRIVE is wired through these getters, and
    // that wiring must not leak into an ordinary burst.
    expect(s.player.shieldActive).toBe(false);
    expect(s.player.speedActive).toBe(false);
  });
});
