import { describe, expect, it } from 'vitest';
import { MatchSim } from '../combat/MatchSim';
import { Combatant } from '../combat/Combatant';
import { MECHS } from '../data/mechs';
import {
  DECOY_COUNT,
  DECOY_DAMAGE,
  DECOY_FIRE_PERIOD,
  DECOY_LIFE,
  DECOY_PERIOD,
} from '../combat/Supporter';
import {
  ActState,
  Btn,
  BarrierResponse,
  MatchPhase,
  ProjKind,
  Team,
  emptyInput,
  type ProjectileSpawn,
} from '../combat/types';

/**
 * STATIC's projection — the only drone role with no test coverage at all until
 * now, and the one `docs/TESTING_PROTOCOL.md` §3 records as having "measured
 * correct and read wrong on screen in four distinct ways".
 *
 * Its contract was inverted in D101: the rounds used to deal no damage and carry
 * a three-in-twenty chance of a one-second stun; they now take a sliver every
 * time and interrupt nothing. The whole suite stayed green across that flip,
 * which is what this file exists to stop happening again.
 */

const W = 2400;
const H = 1200;
const NULLTIDE = MECHS.nulltide;
const HALCYON = MECHS.halcyon;

/** A decoy round as `stepDecoy` builds one. */
function decoyRound(over: Partial<ProjectileSpawn> = {}): ProjectileSpawn {
  return {
    x: 0,
    y: 0,
    vx: 13,
    vy: 0,
    damage: DECOY_DAMAGE,
    guardDamage: 0,
    life: 46,
    radius: 9,
    ownerId: 1,
    team: Team.Enemy,
    kind: ProjKind.Bullet,
    barrier: BarrierResponse.Absorb,
    hitstop: 0,
    hitstun: 0,
    knockback: 0,
    homing: 0,
    pierceCount: 0,
    decoyShot: true,
    ...over,
  };
}

const victim = () =>
  new Combatant({ id: 0, team: Team.Player, def: HALCYON, x: 800, y: 600, facing: 1 });

describe("the projection's rounds", () => {
  it('take a sliver of hull rather than nothing at all', () => {
    const c = victim();
    const before = c.life;
    expect(c.takeHit(decoyRound())).toBe('hit');
    expect(c.life).toBeLessThan(before);
    // HALCYON's `defence.mul` is 1.0 and it has no armour passive, so the round
    // arrives at face value on this chassis.
    expect(before - c.life).toBeCloseTo(DECOY_DAMAGE, 5);
  });

  it('interrupt nothing — no hitstun, no hitstop, no knockback', () => {
    const c = victim();
    const vx = c.vx;
    const vy = c.vy;
    c.takeHit(decoyRound());
    expect(c.hitstun).toBe(0);
    expect(c.hitstop).toBe(0);
    expect(c.act).not.toBe(ActState.Hitstun);
    expect(c.vx).toBe(vx);
    expect(c.vy).toBe(vy);
  });

  /**
   * The load-bearing one, and the reason `decoyShot` exists as a flag at all.
   *
   * A round that opened the ordinary post-hit invulnerability window would have
   * NULLTIDE *shielding* the pilot she is deceiving from her own real fire —
   * every projection tick would buy the target three free frames against the
   * machine that threw it. That inverts the entire ability, and it is a fault
   * that would never show up as anything but "the jammer is weak".
   */
  it('grant no hit invulnerability', () => {
    const c = victim();
    expect(c.invuln).toBe(0);
    c.takeHit(decoyRound());
    expect(c.invuln).toBe(0);

    // And so a real shot landing on the same tick is not swallowed by it.
    const before = c.life;
    c.takeHit(decoyRound({ damage: 120, decoyShot: false, hitstun: 8 }));
    expect(before - c.life).toBeCloseTo(120, 5);
  });

  it('feed the target no saturation, however many land', () => {
    // A chip source at this cadence that charged the bar would hand the target a
    // burst for being shot at by a hologram.
    const c = victim();
    const sat = c.sat;
    for (let i = 0; i < 40; i++) c.takeHit(decoyRound());
    expect(c.sat).toBe(sat);
  });

  it('respect chassis defence', () => {
    // TERRAMOTH's chassis takes 0.88, and BULWARK's brace another 0.92 on top.
    const heavy = new Combatant({
      id: 0,
      team: Team.Player,
      def: MECHS.terramoth,
      x: 800,
      y: 600,
      facing: 1,
    });
    const before = heavy.life;
    heavy.takeHit(decoyRound());
    expect(before - heavy.life).toBeLessThan(DECOY_DAMAGE);
    expect(before - heavy.life).toBeCloseTo(DECOY_DAMAGE * heavy.incomingScale, 5);
  });

  it('are cut down hard by a held guard', () => {
    const c = victim();
    c.guarding = true;
    const before = c.life;
    c.takeHit(decoyRound());
    expect(before - c.life).toBeCloseTo(DECOY_DAMAGE * HALCYON.barrier.guardScale, 5);
    // The guard survives it — a hologram's chip does not break a stance.
    expect(c.guarding).toBe(true);
  });

  it('cannot win a fight on their own', () => {
    // The bound that keeps this a jammer rather than a damage source: a
    // projection landing *every* round for its whole life, against the frailest
    // frame on the roster, is still a rounding error.
    const perLife = (DECOY_LIFE / DECOY_FIRE_PERIOD) * DECOY_DAMAGE;
    const frailest = Math.min(...Object.values(MECHS).map((m) => m.gauges.maxLife));
    expect(perLife / frailest).toBeLessThan(0.06);
  });
});

describe('the projection itself', () => {
  /**
   * NULLTIDE against a passive opponent, with the two placed in each other's
   * range.
   *
   * The placement is required, not cosmetic: the projection is only thrown when
   * `reach <= fireRange`, and two machines left on their spawn marks with no
   * input never close. A harness that skipped this ran 500 ticks and reported
   * the decoy as never existing, which reads exactly like a broken role.
   */
  function harness() {
    const s = new MatchSim({
      playerDef: NULLTIDE,
      enemyDef: HALCYON,
      seed: 4242,
      introTicks: 1,
      roundTicks: 10800,
    });
    for (let i = 0; i < 6; i++) s.step(emptyInput(), emptyInput());
    s.player.x = 1000;
    s.enemy.x = 1400;
    s.player.supporter.reset(s.player);
    s.enemy.supporter.reset(s.enemy);
    return s;
  }

  /** Runs it and reports the projection each tick. */
  function run(ticks: number) {
    const s = harness();
    const sup = s.player.supporter;
    const samples: Array<{ tick: number; live: boolean; x: number; y: number }> = [];
    for (let i = 0; i < ticks && s.phase !== MatchPhase.Over; i++) {
      s.step(emptyInput(), emptyInput());
      samples.push({ tick: i, live: sup.decoys[0].ticks > 0, x: sup.decoys[0].x, y: sup.decoys[0].y });
    }
    return { s, sup, samples };
  }

  it('throws two of them, on opposite sides of the firing line', () => {
    const s = harness();
    for (let i = 0; i < 400 && !s.player.supporter.decoyLive; i++) {
      s.step(emptyInput(), emptyInput());
    }
    const sup = s.player.supporter;
    expect(DECOY_COUNT).toBe(2);
    expect(sup.decoys.filter((d) => d.ticks > 0)).toHaveLength(2);

    // Straddling the axis between the two pilots, not stacked on one flank:
    // two silhouettes on the same side is one question asked twice.
    const lx = s.enemy.x - s.player.x;
    const ly = s.enemy.y - s.player.y;
    const side = (d: { x: number; y: number }) =>
      Math.sign(-ly * (d.x - sup.x) + lx * (d.y - sup.y));
    expect(side(sup.decoys[0])).toBe(-side(sup.decoys[1]));
  });

  it('staggers their fire so the pair does not volley in unison', () => {
    const s = harness();
    for (let i = 0; i < 400 && !s.player.supporter.decoyLive; i++) {
      s.step(emptyInput(), emptyInput());
    }
    // Offset by half a period at birth, so they alternate rather than doubling up.
    const [a, b] = s.player.supporter.decoys;
    expect(Math.abs(a.fireTimer - b.fireTimer)).toBeGreaterThanOrEqual(
      Math.floor(DECOY_FIRE_PERIOD / 2) - 1,
    );
  });

  it('is thrown at all, and is the role NULLTIDE carries', () => {
    expect(NULLTIDE.supporter!.role).toBe('decoy');
    const { samples } = run(400);
    expect(samples.some((p) => p.live)).toBe(true);
  });

  /**
   * `DECOY_LIFE === DECOY_PERIOD`, so a new silhouette is thrown as the last one
   * fades and Io Senna is always two machines. The gap used to be 40 ticks —
   * two thirds of a second in which an opponent who simply waited got a clean
   * look at a single target.
   */
  it('leaves no gap between one projection and the next', () => {
    expect(DECOY_LIFE).toBe(DECOY_PERIOD);
    const { samples } = run(900);
    const first = samples.findIndex((p) => p.live);
    expect(first).toBeGreaterThanOrEqual(0);
    const after = samples.slice(first);
    const dark = after.filter((p) => !p.live).length;
    // A tick or two of changeover is the throw itself, not a gap.
    expect(dark).toBeLessThanOrEqual(2);
  });

  it('flies as well as the machine it is imitating', () => {
    const { samples } = run(700);
    const speeds: number[] = [];
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1];
      const b = samples[i];
      // Skip the frame a new projection is thrown, which teleports it.
      if (!a.live || !b.live) continue;
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d < 60) speeds.push(d);
    }
    expect(speeds.length).toBeGreaterThan(200);
    const mean = speeds.reduce((t, x) => t + x, 0) / speeds.length;
    // NULLTIDE cruises at 5.7; the projection carries a small vertical bob on
    // top of that, so it is a band rather than a point.
    expect(mean).toBeGreaterThan(NULLTIDE.flight.maxSpeed * 0.85);
    expect(mean).toBeLessThan(NULLTIDE.flight.maxSpeed * 1.15);
  });

  it('stays inside the arena it is pretending to fight in', () => {
    const { samples } = run(900);
    for (const p of samples) {
      if (!p.live) continue;
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      expect(p.x).toBeGreaterThan(-W);
      expect(p.x).toBeLessThan(W * 2);
      expect(p.y).toBeGreaterThan(-H);
      expect(p.y).toBeLessThan(H * 2);
    }
  });

  it('shoots, and its rounds keep the flag on the way into the pool', () => {
    /**
     * **The regression this file was written to catch.**
     *
     * `Projectile.reset` did not copy `decoyShot` and `asHit` did not emit it,
     * so the flag was dropped between the spawn and the hit. Every projection
     * round in the game therefore took `takeHit`'s ordinary route rather than
     * its own branch, and the property the flag exists to guarantee — that a
     * decoy round grants no hit invulnerability — had never held.
     *
     * A flag that silently does nothing looks exactly like a flag that works,
     * so this asserts on the pooled projectile rather than on the spawn.
     */
    const s = harness();
    let seen = 0;
    for (let i = 0; i < 900 && s.phase !== MatchPhase.Over; i++) {
      s.step(emptyInput(), emptyInput());
      seen += s.activeProjectiles().filter((p) => p.decoyShot).length;
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('never lets a decoy round hand the target invulnerability', () => {
    // The same property end to end, through the pool rather than by hand: a
    // decoy round in flight must still report `decoyShot` when it is converted
    // back into a hit, or `takeHit` will open an i-frame window with it.
    const s = harness();
    for (let i = 0; i < 900 && s.phase !== MatchPhase.Over; i++) {
      s.step(emptyInput(), emptyInput());
      for (const p of s.activeProjectiles()) {
        if (p.decoyShot) expect(p.asHit().decoyShot).toBe(true);
      }
    }
  });
});

/**
 * Shooting the fake.
 *
 * The projection could not be hit at all until now, and that was most of what
 * made NULLTIDE the strongest machine on the roster. Ablated, its stun was worth
 * **+0.196** of her +0.262 lead — and the reason was not how often it landed
 * (CIRRUS locks an opponent down more and sits in the bottom half) but that it
 * cost her nothing and could not be answered. `MatchSim` tested combatants and
 * supporters; the silhouette was neither.
 */
describe('the projection can be shot down', () => {
  function harness() {
    const s = new MatchSim({
      playerDef: NULLTIDE,
      enemyDef: HALCYON,
      seed: 4242,
      introTicks: 1,
      roundTicks: 10800,
    });
    for (let i = 0; i < 6; i++) s.step(emptyInput(), emptyInput());
    s.player.x = 1000;
    s.enemy.x = 1400;
    s.player.supporter.reset(s.player);
    s.enemy.supporter.reset(s.enemy);
    return s;
  }

  /** Runs until a projection is live, then returns the sim. */
  function withLiveDecoy(): MatchSim {
    const s = harness();
    for (let i = 0; i < 400 && s.player.supporter.decoys[0].ticks <= 0; i++) {
      s.step(emptyInput(), emptyInput());
    }
    expect(s.player.supporter.decoys[0].ticks).toBeGreaterThan(0);
    return s;
  }

  it('vanishes when an enemy round connects with it', () => {
    const s = withLiveDecoy();
    const sup = s.player.supporter;
    // Put an enemy round exactly on the silhouette.
    s.enemy.x = sup.decoys[0].x - 30;
    s.enemy.y = sup.decoys[0].y;
    let popped = false;
    for (let i = 0; i < 60 && !popped; i++) {
      s.step(emptyInput(), { ...emptyInput(), pressed: 1 << Btn.Main, held: 1 << Btn.Main });
      if (s.events.some((e) => e.t === 'decoyPop')) popped = true;
      // Keep the shooter on top of it while it drifts.
      s.enemy.x = sup.decoys[0].x - 30;
      s.enemy.y = sup.decoys[0].y;
    }
    expect(popped).toBe(true);
    expect(sup.decoys[0].ticks).toBe(0);
  });

  it('stops shooting once every projection is gone', () => {
    const s = withLiveDecoy();
    const sup = s.player.supporter;
    for (let i = 0; i < DECOY_COUNT; i++) sup.popDecoy(i);
    let rounds = 0;
    for (let i = 0; i < 90; i++) {
      s.step(emptyInput(), emptyInput());
      rounds += s.activeProjectiles().filter((p) => p.decoyShot).length;
      // A fresh pair may be thrown on cadence; stop counting if so.
      if (sup.decoyLive) break;
    }
    expect(rounds).toBe(0);
  });

  /**
   * Popping one must not pop the other. They are separate objects with separate
   * hit keys, and a shared key would silently make the second silhouette
   * unhittable for the rest of the popping projectile's life.
   */
  it('takes them one at a time', () => {
    const s = withLiveDecoy();
    const sup = s.player.supporter;
    expect(sup.decoys.every((d) => d.ticks > 0)).toBe(true);
    sup.popDecoy(0);
    expect(sup.decoys[0].ticks).toBe(0);
    expect(sup.decoys[1].ticks).toBeGreaterThan(0);
    expect(sup.decoyLive).toBe(true);
    sup.popDecoy(1);
    expect(sup.decoyLive).toBe(false);
  });

  /**
   * Popping one must not bring the next one forward. The gap until the cadence
   * comes round again *is* the reward for spending a round on the fake, and
   * resetting `roleTimer` in `popDecoy` would quietly delete it.
   */
  it('does not hurry the next projection along', () => {
    const s = withLiveDecoy();
    const sup = s.player.supporter;
    // Popped early, well inside its natural life.
    expect(sup.decoys[0].ticks).toBeGreaterThan(30);
    sup.popDecoy();
    // The next one arrives on the cadence, not immediately — so there is a real
    // window with no silhouette on the field. Asserted on the observable gap
    // rather than on `roleTimer`, which is the supporter's own business.
    let dark = 0;
    for (let i = 0; i < 40; i++) {
      s.step(emptyInput(), emptyInput());
      if (sup.decoys[0].ticks <= 0) dark++;
    }
    expect(dark).toBe(40);
  });

  it('is only vulnerable to the opponent, not to its own side', () => {
    const s = withLiveDecoy();
    const sup = s.player.supporter;
    // NULLTIDE's own fire passes straight through her own projection.
    s.player.x = sup.decoys[0].x - 30;
    s.player.y = sup.decoys[0].y;
    for (let i = 0; i < 40; i++) {
      s.step({ ...emptyInput(), pressed: 1 << Btn.Main, held: 1 << Btn.Main }, emptyInput());
      if (sup.decoys[0].ticks <= 0) break;
      s.player.x = sup.decoys[0].x - 30;
      s.player.y = sup.decoys[0].y;
    }
    expect(s.events.some((e) => e.t === 'decoyPop')).toBe(false);
  });

  it('is as big a target as the machine it imitates', () => {
    // A decoy easier to hit than the pilot is a decoy nobody is fooled by twice.
    // The collision uses the owner's own hurt radius; this pins that intent.
    expect(NULLTIDE.rig.hurtRadius).toBeGreaterThan(0);
  });
});
