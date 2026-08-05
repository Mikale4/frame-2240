import { describe, expect, it } from 'vitest';
import { MatchSim } from '../combat/MatchSim';
import { DESPERATION_LIFE } from '../combat/Combatant';
import { HALCYON, MECHS, NOCTURNE } from '../data/mechs';
import type { MechDef } from '../mechs/MechDef';

/**
 * CIRRUS **without OVERDRIVE**, as this file's subject.
 *
 * These tests are about the *desperation* mechanic, not about Mira Holloway —
 * she is the subject only because she is the Speed-preferring pilot. Every one
 * of them drives her to a fifth of a life bar, which is now also under
 * OVERDRIVE's quarter-hull threshold, so the passive fires mid-test and turns on
 * all three saturation modes. `does not extend reach for the other two modes`
 * then fails for a reason that has nothing to do with what it is asserting.
 *
 * Same fix and same reasoning as `LADDER_MECH` in `difficulty.test.ts`: strip the
 * passive that is not under test rather than let it confound the measurement.
 */
const CIRRUS: MechDef = { ...MECHS.cirrus, overdrive: undefined };
const VESPER = MECHS.vesper;
import {
  BarrierResponse,
  Btn,
  ProjKind,
  SatMode,
  Team,
  emptyInput,
  type InputFrame,
  type ProjectileSpawn,
} from '../combat/types';

/**
 * Saturation opened from the brink.
 *
 * The meter charges off damage taken, so the pilot most likely to be holding a
 * full bar is the one losing — and until this existed that bar bought them the
 * same burst it bought the winner. These are deliberately enormous effects; the
 * tests exist to pin *which* enormous effect each mode gets, and to prove the
 * threshold is a decision rather than a passive.
 */
function sim(over: Partial<ConstructorParameters<typeof MatchSim>[0]> = {}): MatchSim {
  return new MatchSim({ playerDef: HALCYON, enemyDef: NOCTURNE, seed: 42, introTicks: 1, ...over });
}

function toFight(s: MatchSim, n = 4): void {
  for (let i = 0; i < n; i++) s.step(emptyInput(), emptyInput());
}

function press(...btns: Btn[]): InputFrame {
  let m = 0;
  for (const b of btns) m |= 1 << b;
  return { ...emptyInput(), held: m, pressed: m };
}

/** Opens a burst at `lifeFrac` of max life, in `mode`. */
function burst(s: MatchSim, lifeFrac: number, mode: SatMode): void {
  const p = s.player;
  p.life = p.def.gauges.maxLife * lifeFrac;
  p.sat = p.def.gauges.maxSaturation;
  p.satMode = mode;
  p.satActive = false;
  p.satTicks = 0;
  p.satBurnout = 0;
  s.step(press(Btn.Saturation), emptyInput());
}

function shot(over: Partial<ProjectileSpawn> = {}): ProjectileSpawn {
  return {
    x: 0,
    y: 0,
    vx: 6,
    vy: 0,
    damage: 100,
    guardDamage: 20,
    life: 30,
    radius: 8,
    ownerId: 1,
    team: Team.Enemy,
    kind: ProjKind.Bullet,
    barrier: BarrierResponse.Absorb,
    hitstop: 4,
    hitstun: 8,
    knockback: 2,
    homing: 0,
    pierceCount: 0,
    ...over,
  };
}

describe('the desperation threshold', () => {
  it('sits at a third of a life bar', () => {
    expect(DESPERATION_LIFE).toBeCloseTo(1 / 3, 6);
  });

  it('does not fire for a healthy pilot', () => {
    const s = sim();
    toFight(s);
    burst(s, 0.9, SatMode.Shield);
    expect(s.player.satActive).toBe(true);
    expect(s.player.satDesperate).toBe(false);
    expect(s.player.desperateShield).toBe(false);
  });

  it('fires at or below the threshold', () => {
    const s = sim();
    toFight(s);
    burst(s, DESPERATION_LIFE, SatMode.Shield);
    expect(s.player.satDesperate).toBe(true);
    expect(s.player.desperateShield).toBe(true);
  });

  /**
   * Latched at activation, not read live. Otherwise it would be a passive that
   * switches on whenever a pilot dips low, rather than a property of the
   * decision to spend the meter while losing.
   */
  it('is latched by the decision, not re-read every tick', () => {
    const s = sim();
    toFight(s);
    burst(s, 0.9, SatMode.Shield);
    s.player.life = 1;
    for (let i = 0; i < 30; i++) s.step(emptyInput(), emptyInput());
    expect(s.player.satActive).toBe(true);
    expect(s.player.satDesperate).toBe(false);
  });

  it('clears when the burst ends', () => {
    const s = sim();
    toFight(s);
    burst(s, 0.2, SatMode.Shield);
    expect(s.player.satDesperate).toBe(true);
    for (let i = 0; i < 60 * 12; i++) s.step(emptyInput(), emptyInput());
    expect(s.player.satActive).toBe(false);
    expect(s.player.satDesperate).toBe(false);
  });

  it('only ever arms the mode that was actually spent', () => {
    const s = sim();
    toFight(s);
    burst(s, 0.2, SatMode.Speed);
    expect(s.player.desperateSpeed).toBe(true);
    expect(s.player.desperateShield).toBe(false);
    expect(s.player.desperateShoot).toBe(false);
  });
});

describe('desperate SHIELD — nothing lands', () => {
  it('ignores gunfire, melee, lances and chip alike', () => {
    const s = sim();
    toFight(s);
    burst(s, 0.2, SatMode.Shield);
    const p = s.player;
    const before = p.life;

    expect(p.takeHit(shot())).toBe('absorbed');
    expect(p.takeHit(shot({ kind: ProjKind.Melee, barrier: BarrierResponse.Pierce }))).toBe('absorbed');
    expect(p.takeHit(shot({ barrier: BarrierResponse.Pierce }))).toBe('absorbed');
    expect(p.life).toBe(before);
  });

  it('is strictly better than the same burst taken healthy', () => {
    const hurt = sim();
    toFight(hurt);
    burst(hurt, 0.2, SatMode.Shield);
    const healthy = sim();
    toFight(healthy);
    burst(healthy, 0.9, SatMode.Shield);

    // Clear the activation i-frames so the Shield scaling is what is measured.
    hurt.player.invuln = 0;
    healthy.player.invuln = 0;
    const a = hurt.player.life;
    const b = healthy.player.life;
    hurt.player.takeHit(shot());
    healthy.player.takeHit(shot());
    expect(hurt.player.life).toBe(a);
    expect(healthy.player.life).toBeLessThan(b);
  });

  it('still ends, so it is a burst and not a mode', () => {
    const s = sim();
    toFight(s);
    burst(s, 0.2, SatMode.Shield);
    for (let i = 0; i < 60 * 12; i++) s.step(emptyInput(), emptyInput());
    expect(s.player.desperateShield).toBe(false);
    s.player.invuln = 0;
    const before = s.player.life;
    s.player.takeHit(shot());
    expect(s.player.life).toBeLessThan(before);
  });
});

describe('desperate SHOOT — faster, and sometimes doubled', () => {
  it('throws its shots faster than an ordinary Shoot burst', () => {
    const hurt = sim();
    toFight(hurt);
    burst(hurt, 0.2, SatMode.Shoot);
    const healthy = sim();
    toFight(healthy);
    burst(healthy, 0.9, SatMode.Shoot);
    expect(hurt.player.satProjSpeedScale).toBeGreaterThan(healthy.player.satProjSpeedScale);
    // And an ordinary burst is itself faster than no burst at all.
    expect(healthy.player.satProjSpeedScale).toBeGreaterThan(1);
  });

  /**
   * Rolled per projectile rather than per volley: the roster's volleys already
   * differ in width, and a per-volley roll would pay the widest kit the most.
   */
  it('puts roughly a third more shots in the air', () => {
    // Counts spawns rather than survivors: a desperate burst throws its shots
    // 1.85x faster, so they clear the arena sooner and anything measured by
    // "still airborne" would read the speed buff as *fewer* projectiles.
    const fired = (desperate: boolean, seed: number): number => {
      const s = sim({ seed });
      toFight(s);
      burst(s, desperate ? 0.2 : 0.9, SatMode.Shoot);
      let n = 0;
      const pool = s.projectiles;
      const real = pool.spawn.bind(pool);
      (pool as unknown as { spawn: typeof pool.spawn }).spawn = (sp) => {
        if (sp.ownerId === s.player.id) n++;
        return real(sp);
      };
      for (let i = 0; i < 240; i++) s.step(press(Btn.Main), emptyInput());
      (pool as unknown as { spawn: typeof pool.spawn }).spawn = real;
      return n;
    };
    let plain = 0;
    let desperate = 0;
    for (let seed = 0; seed < 12; seed++) {
      plain += fired(false, seed);
      desperate += fired(true, seed);
    }
    expect(plain).toBeGreaterThan(0);
    // A third of every shot doubled, so ~1.33x. Bounded on both sides: too low
    // means the roll is not firing, too high means it is doubling more than one
    // projectile per roll.
    expect(desperate / plain).toBeGreaterThan(1.15);
    expect(desperate / plain).toBeLessThan(1.55);
  });

  it('draws the roll from the match RNG, so a replay reproduces it', () => {
    const run = () => {
      const s = sim({ seed: 991 });
      toFight(s);
      burst(s, 0.2, SatMode.Shoot);
      for (let i = 0; i < 90; i++) s.step(press(Btn.Main), emptyInput());
      return [s.projectiles.items.filter((p) => p.active).length, s.player.energy, s.enemy.life];
    };
    expect(run()).toEqual(run());
  });
});

describe('desperate SPEED — reach, dash and true damage', () => {
  it('extends melee reach across the arena', () => {
    const s = sim({ playerDef: CIRRUS, enemyDef: VESPER });
    toFight(s);
    const plain = s.player.effectiveMeleeRange;
    burst(s, 0.2, SatMode.Speed);
    expect(s.player.effectiveMeleeRange).toBeGreaterThan(plain);
    // "Across the screen" is meant literally: past the 960px viewport width.
    expect(s.player.effectiveMeleeRange).toBeGreaterThan(960);
  });

  it('does not extend reach for the other two modes', () => {
    for (const mode of [SatMode.Shield, SatMode.Shoot]) {
      const s = sim({ playerDef: CIRRUS, enemyDef: VESPER });
      toFight(s);
      const plain = s.player.effectiveMeleeRange;
      burst(s, 0.2, mode);
      expect(s.player.effectiveMeleeRange).toBe(plain);
    }
  });

  it('covers more ground in one dash', () => {
    const measure = (desperate: boolean): number => {
      const s = sim({ playerDef: CIRRUS, enemyDef: VESPER });
      toFight(s);
      burst(s, desperate ? 0.2 : 0.9, SatMode.Speed);
      const p = s.player;
      p.boost = p.def.flight.maxBoost;
      p.dashCooldown = 0;
      const x0 = p.x;
      // Dash right, then let it run its authored length.
      s.step({ ...press(Btn.Boost), dx: 1 }, emptyInput());
      for (let i = 0; i < 12; i++) s.step({ ...emptyInput(), dx: 1 }, emptyInput());
      return Math.abs(p.x - x0);
    };
    const plain = measure(false);
    const desperate = measure(true);
    expect(desperate).toBeGreaterThan(plain * 1.25);
  });

  it('puts melee through a guard, a Shield burst and armour alike', () => {
    // A defender doing everything right: guarding, inside a Shield burst.
    const s = sim({ playerDef: CIRRUS, enemyDef: VESPER });
    toFight(s);
    burst(s, 0.2, SatMode.Speed);
    const e = s.enemy;
    e.guarding = true;
    e.satMode = SatMode.Shield;
    e.satActive = true;
    e.satTicks = 600;
    e.invuln = 0;
    const before = e.life;
    e.takeHit(
      shot({
        ownerId: s.player.id,
        team: Team.Player,
        kind: ProjKind.Melee,
        barrier: BarrierResponse.Pierce,
        damage: 100,
        trueDamage: true,
      }),
    );
    // Full damage, not the 30 % a Shield burst would otherwise leave.
    expect(before - e.life).toBeCloseTo(100, 4);
  });

  it('leaves ordinary melee scaled exactly as before', () => {
    const s = sim({ playerDef: CIRRUS, enemyDef: VESPER });
    toFight(s);
    const e = s.enemy;
    e.guarding = true;
    e.invuln = 0;
    const before = e.life;
    e.takeHit(
      shot({
        ownerId: s.player.id,
        team: Team.Player,
        kind: ProjKind.Melee,
        barrier: BarrierResponse.Pierce,
        damage: 100,
      }),
    );
    expect(before - e.life).toBeLessThan(100);
    expect(before - e.life).toBeGreaterThan(0);
  });
});

/**
 * The desperate close.
 *
 * A Speed burst can open a lock from anywhere on the map, and the ordinary
 * approach could not deliver on that: `thrust` is a lunge of 12–19 a tick behind
 * a `tracking` lerp, and the close phase gave up after 22 ticks and swung
 * regardless of distance. A long-range desperation melee therefore ran its whole
 * chain on empty air during the approach and arrived with the sequence over,
 * having been a stationary target the entire way in.
 */
describe('desperate SPEED — the close', () => {
  /**
   * Puts the two machines `gap` apart with the player desperate on Speed and one
   * tick into the approach.
   *
   * The extra step matters: `startMeleeLock` runs inside `tryStartAction`, which
   * sits *after* the `stepMeleeLock` call in the same tick, so the lock exists
   * but has not yet had a close frame when the starting tick ends.
   */
  const closing = (gap: number) => {
    const s = sim({ playerDef: CIRRUS, enemyDef: VESPER });
    toFight(s);
    burst(s, 0.2, SatMode.Speed);
    s.enemy.x = s.player.x + gap;
    s.enemy.y = s.player.y;
    s.step(press(Btn.Melee), emptyInput());
    s.step(emptyInput(), emptyInput());
    return s;
  };

  it('does not start swinging until the target is actually in reach', () => {
    const s = closing(1400);
    const range = CIRRUS.meleeLock.range;
    let sawSwingOutOfRange = false;
    for (let i = 0; i < 140; i++) {
      const ml = s.player.meleeLock;
      if (!ml) break;
      const dist = Math.hypot(s.enemy.x - s.player.x, s.enemy.y - s.player.y);
      if (ml.phase !== 'close' && dist > range * 1.6) sawSwingOutOfRange = true;
      s.step(emptyInput(), emptyInput());
    }
    expect(sawSwingOutOfRange).toBe(false);
  });

  it('arrives, rather than expiring on the way in', () => {
    const s = closing(1400);
    let arrived = false;
    for (let i = 0; i < 140; i++) {
      const ml = s.player.meleeLock;
      if (!ml) break;
      if (ml.phase !== 'close') {
        arrived = true;
        break;
      }
      s.step(emptyInput(), emptyInput());
    }
    expect(arrived).toBe(true);
  });

  it('guards for free while closing, and stops both when it lands', () => {
    const s = closing(1400);
    const p = s.player;
    expect(p.desperateClosing).toBe(true);
    expect(p.guarding).toBe(true);
    expect(p.barrierFree).toBe(true);

    // Free means the gauge never falls, not that it is frozen — ordinary regen
    // still runs underneath, which is why this is a floor and not an equality.
    p.barrier = p.def.gauges.maxBarrier * 0.5;
    let floor = p.barrier;
    for (let i = 0; i < 140 && p.meleeLock?.phase === 'close'; i++) {
      s.step(emptyInput(), emptyInput());
      expect(p.barrier).toBeGreaterThanOrEqual(floor);
      floor = p.barrier;
    }
    // The guard belongs to the approach, not to the pilot.
    expect(p.desperateClosing).toBe(false);
    expect(p.barrierFree).toBe(false);
  });

  it('holds the blade rather than sweeping it on the way in', () => {
    // The reported symptom was swing animations playing during the approach.
    // `spin` drives the arm: in `close` it ramps once to the arc's t=0 wind-up
    // and then holds, and in `swing` it sweeps. So a blade that is being carried
    // rather than swung shows a settled `spin` for the whole approach.
    const s = closing(1400);
    const p = s.player;
    const spins: number[] = [];
    for (let i = 0; i < 140 && p.meleeLock?.phase === 'close'; i++) {
      spins.push(p.spin);
      s.step(emptyInput(), emptyInput());
    }
    expect(spins.length).toBeGreaterThan(20);
    // Past the 8-tick wind-up ramp the pose is constant all the way to contact.
    const settled = spins.slice(10);
    for (const v of settled) expect(v).toBeCloseTo(settled[0], 6);
  });

  it('gives a non-desperate Speed burst none of it', () => {
    const s = sim({ playerDef: CIRRUS, enemyDef: VESPER });
    toFight(s);
    burst(s, 0.9, SatMode.Speed);
    s.enemy.x = s.player.x + 200;
    s.enemy.y = s.player.y;
    s.step(press(Btn.Melee), emptyInput());
    expect(s.player.desperateSpeed).toBe(false);
    expect(s.player.desperateClosing).toBe(false);
    expect(s.player.barrierFree).toBe(false);
  });

  it('drops the free guard if the lock breaks mid-approach', () => {
    const s = closing(1400);
    const p = s.player;
    expect(p.guarding).toBe(true);
    p.hitstun = 6; // a piercing hit is the counter to the charge
    s.step(emptyInput(), emptyInput());
    expect(p.meleeLock).toBeNull();
    expect(p.guarding).toBe(false);
    expect(p.barrierFree).toBe(false);
  });
});

/**
 * The weapon mounts point at a target, always.
 *
 * This used to be gated on `inLockCone` — inside `lockRange` *and* within a
 * facing cone — and when that failed the aim fell through to the movement
 * direction. A mech strafing while firing pointed its guns along its own travel
 * and shot at empty air, which read as the weapons being broken. There is no
 * range at which "aim at nothing" is the better answer.
 */
describe('weapons stay locked on', () => {
  const aimError = (dx: number, dy: number, gap: number): number => {
    const s = sim({ arenaW: 4000 });
    toFight(s);
    const p = s.player;
    const e = s.enemy;
    p.x = 300;
    p.y = 600;
    e.x = 300 + gap;
    e.y = 320;
    // Hold a movement direction that points nowhere near the opponent, and let
    // the turret settle.
    for (let i = 0; i < 90; i++) {
      p.x = 300;
      p.y = 600;
      e.x = 300 + gap;
      e.y = 320;
      s.step({ ...emptyInput(), dx, dy }, emptyInput());
    }
    const want = Math.atan2(e.y - p.y, e.x - p.x);
    return Math.abs(Math.atan2(Math.sin(p.aim - want), Math.cos(p.aim - want)));
  };

  it('aims at the opponent while moving the other way, at close range', () => {
    expect(aimError(-1, 1, 260)).toBeLessThan(0.12);
  });

  it('still aims at the opponent well beyond the old lock range', () => {
    // 3000px: far outside every chassis's `lockRange`. This is the case that
    // used to fall through to the movement heading.
    expect(aimError(-1, 1, 3000)).toBeLessThan(0.12);
  });

  it('does not aim along the movement direction at any distance', () => {
    for (const gap of [200, 700, 1500, 3000]) {
      expect(aimError(1, -1, gap), `gap ${gap}`).toBeLessThan(0.12);
    }
  });

  it('prefers the pilot over their escort unless the escort is clearly nearer', () => {
    const s = sim({ arenaW: 4000 });
    toFight(s);
    const p = s.player;
    const e = s.enemy;
    p.x = 300;
    p.y = 600;
    e.x = 1400;
    e.y = 600;
    // Escort parked just in front of its owner: nearer, but not by enough.
    e.supporter.x = 1340;
    e.supporter.y = 240;
    for (let i = 0; i < 90; i++) {
      p.x = 300;
      p.y = 600;
      e.x = 1400;
      e.y = 600;
      e.supporter.x = 1340;
      e.supporter.y = 240;
      s.step(emptyInput(), emptyInput());
    }
    const toMech = Math.atan2(e.y - p.y, e.x - p.x);
    expect(Math.abs(Math.atan2(Math.sin(p.aim - toMech), Math.cos(p.aim - toMech)))).toBeLessThan(0.12);
  });

  it('holds the pilot even with the escort well out in front', () => {
    // **This asserted the opposite until the lock became a choice.** Distance
    // used to decide it, so an escort drifting 1100 px ahead of its pilot took
    // the mounts whether or not that was what anyone wanted to shoot — which in
    // play meant the drone repeatedly dragged the guns off the pilot at the
    // moment the pilot was worth shooting. `lockPref` decides now, and it
    // defaults to the pilot.
    const s = sim({ arenaW: 4000 });
    toFight(s);
    const p = s.player;
    const e = s.enemy;
    for (let i = 0; i < 90; i++) {
      p.x = 300;
      p.y = 600;
      e.x = 2000;
      e.y = 600;
      e.supporter.x = 900;
      e.supporter.y = 900;
      s.step(emptyInput(), emptyInput());
    }
    const toMech = Math.atan2(e.y - p.y, e.x - p.x);
    expect(Math.abs(Math.atan2(Math.sin(p.aim - toMech), Math.cos(p.aim - toMech)))).toBeLessThan(0.12);
  });

  it('swings onto the escort once it is chosen, and back again', () => {
    const s = sim({ arenaW: 4000 });
    toFight(s);
    const p = s.player;
    const e = s.enemy;
    const hold = () => {
      p.x = 300;
      p.y = 600;
      e.x = 2000;
      e.y = 600;
      e.supporter.x = 900;
      e.supporter.y = 900;
    };
    p.lockPref = 'drone';
    for (let i = 0; i < 90; i++) {
      hold();
      s.step(emptyInput(), emptyInput());
    }
    const toDrone = Math.atan2(e.supporter.y - p.y, e.supporter.x - p.x);
    expect(Math.abs(Math.atan2(Math.sin(p.aim - toDrone), Math.cos(p.aim - toDrone)))).toBeLessThan(0.12);

    p.lockPref = 'mech';
    for (let i = 0; i < 90; i++) {
      hold();
      s.step(emptyInput(), emptyInput());
    }
    const toMech = Math.atan2(e.y - p.y, e.x - p.x);
    expect(Math.abs(Math.atan2(Math.sin(p.aim - toMech), Math.cos(p.aim - toMech)))).toBeLessThan(0.12);
  });
});
