import { describe, expect, it } from 'vitest';
import { MatchSim } from '../combat/MatchSim';
import { MECHS, ROSTER } from '../data/mechs';
import { RivalAI } from '../ai/RivalAI';
import { Rng } from '../core/Rng';
import { Difficulty } from '../core/Session';
import { ARENA_H, ARENA_W } from '../core/GameConfig';
import {
  BarrierResponse,
  Btn,
  MatchPhase,
  ProjKind,
  Team,
  WeaponSlot,
  emptyInput,
  type InputFrame,
  type ProjectileSpawn,
  type SimEvent,
} from '../combat/types';
import { Combatant, DISARM_TICKS } from '../combat/Combatant';

/**
 * VESPER's sniper stance — a mode that replaces the heavy shot.
 *
 * The dangerous property is not the stance itself but the button: `Btn.Heavy` is
 * a *switch* on this chassis and a shot on every other one. Anything that
 * reaches for a heavy without knowing that will flicker the stance on and off,
 * which is the shape of fault §8c already documents for command motions and the
 * one D104 found in `hitAndRun`. Most of this file is about that.
 */

const VESPER = MECHS.vesper;
const HALCYON = MECHS.halcyon;

const press = (b: Btn): InputFrame => ({ ...emptyInput(), pressed: 1 << b, held: 1 << b });

function harness(): MatchSim {
  const s = new MatchSim({
    playerDef: VESPER,
    enemyDef: HALCYON,
    seed: 31,
    introTicks: 1,
    roundTicks: 10800,
  });
  for (let i = 0; i < 4; i++) s.step(emptyInput(), emptyInput());
  return s;
}

describe('the sniper stance, as data', () => {
  it('belongs to VESPER and to nobody else', () => {
    expect(VESPER.sniper).toBeDefined();
    for (const m of ROSTER) {
      if (m.id === 'vesper') continue;
      expect(m.sniper, m.id).toBeUndefined();
    }
  });

  it('fires a lance that is thinner, longer and faster than his own lance', () => {
    const shot = VESPER.sniper!.shot;
    expect(shot.kind).toBe(ProjKind.Beam);
    expect(shot.projRadius).toBeLessThan(VESPER.lance.projRadius);
    expect(shot.projLife).toBeGreaterThan(VESPER.lance.projLife);
    expect(shot.projSpeed).toBeGreaterThan(VESPER.lance.projSpeed);
  });

  it('costs real mobility, and has both a clock and a recharge', () => {
    const d = VESPER.sniper!;
    // "Drastically slows" — not a nudge. Anything above about half and the
    // sniper is simply a better version of himself.
    expect(d.speedScale).toBeLessThan(0.5);
    expect(d.duration).toBeGreaterThan(0);
    expect(d.cooldown).toBeGreaterThan(0);
    // Auto-aim is declared on the attack, where every weapon declares it.
    expect(d.shot.homing).toBeGreaterThan(0);
    expect(d.shot.homingTicks).toBeGreaterThan(0);
  });

  it('gets dressed by the art pass rather than defaulting to a pellet', () => {
    expect(VESPER.sniper!.shot.family).toBe('beam');
  });
});

describe('the stance, in the sim', () => {
  it('opens on Heavy instead of firing a heavy shot', () => {
    const s = harness();
    expect(s.player.sniperActive).toBe(false);
    s.step(press(Btn.Heavy), emptyInput());
    expect(s.player.sniperActive).toBe(true);
    // And no LONGSHOT went out with it.
    expect(s.activeProjectiles().filter((p) => p.ownerId === s.player.id)).toHaveLength(0);
  });

  it('closes on a second press, and pays the recharge for leaving early', () => {
    const s = harness();
    s.step(press(Btn.Heavy), emptyInput());
    expect(s.player.sniperActive).toBe(true);
    s.step(press(Btn.Heavy), emptyInput());
    expect(s.player.sniperActive).toBe(false);
    // Bailing out must not be free, or the slow costs nothing.
    expect(s.player.sniperCooldown).toBeGreaterThan(0);
  });

  it('refuses to reopen until the recharge has run', () => {
    const s = harness();
    s.step(press(Btn.Heavy), emptyInput());
    s.step(press(Btn.Heavy), emptyInput());
    s.step(press(Btn.Heavy), emptyInput());
    expect(s.player.sniperActive).toBe(false);
  });

  it('drops on its own when the clock runs out', () => {
    const s = harness();
    s.step(press(Btn.Heavy), emptyInput());
    for (let i = 0; i < VESPER.sniper!.duration + 4; i++) s.step(emptyInput(), emptyInput());
    expect(s.player.sniperActive).toBe(false);
    expect(s.player.sniperCooldown).toBeGreaterThan(0);
  });

  /**
   * Sampled every tick rather than once at the end.
   *
   * The stance round travels 110px a tick and the arena is 2400 wide, so a shot
   * fired early is off the field and culled well before a loop of 30 steps
   * finishes. Snapshotting `activeProjectiles()` afterwards found an empty pool
   * and read as "the stance does not fire" — a test measuring its own timing
   * rather than the behaviour.
   */
  it('fires the stance lance from the main button while it is up', () => {
    const s = harness();
    s.step(press(Btn.Heavy), emptyInput());
    const seen: { kind: number; homing: number }[] = [];
    for (let i = 0; i < 60; i++) {
      s.step(press(Btn.Main), emptyInput());
      for (const p of s.activeProjectiles()) {
        if (p.ownerId === s.player.id) seen.push({ kind: p.kind, homing: p.homing });
      }
    }
    expect(seen.length).toBeGreaterThan(0);
    // Beams, not the ordinary RAILNEEDLE bullet.
    expect(seen.every((p) => p.kind === ProjKind.Beam)).toBe(true);
    expect(seen.some((p) => p.homing > 0)).toBe(true);
  });

  it('slows the chassis hard while it is up', () => {
    const travel = (sniper: boolean): number => {
      const s = harness();
      if (sniper) s.step(press(Btn.Heavy), emptyInput());
      const x0 = s.player.x;
      const run: InputFrame = { ...emptyInput(), dx: 1, held: 1 << Btn.Boost };
      for (let i = 0; i < 60; i++) s.step(run, emptyInput());
      return Math.abs(s.player.x - x0);
    };
    const free = travel(false);
    const planted = travel(true);
    expect(planted).toBeLessThan(free * 0.6);
  });

  it('gives up melee while planted', () => {
    const s = harness();
    s.step(press(Btn.Heavy), emptyInput());
    for (let i = 0; i < 20; i++) s.step(press(Btn.Melee), emptyInput());
    expect(s.player.meleeLock).toBeNull();
  });
});

describe('the rival and the switch', () => {
  /**
   * The regression that matters. Before `sniperIntent` owned `Btn.Heavy`, the
   * rival's ordinary "fire a heavy" paths would toggle the stance as a side
   * effect — five separate `return Btn.Heavy` sites in `chooseAttack`, any one
   * of which turns the mode into a strobe.
   */
  it('does not flicker the stance while simply fighting', () => {
    const s = new MatchSim({
      playerDef: VESPER,
      enemyDef: HALCYON,
      seed: 808,
      introTicks: 1,
      roundTicks: 10800,
    });
    const a = new RivalAI({ difficulty: Difficulty.Extreme }, new Rng(1));
    const b = new RivalAI({ difficulty: Difficulty.Extreme }, new Rng(2));
    let flips = 0;
    let was = false;
    for (let i = 0; i < 3600 && s.phase !== MatchPhase.Over; i++) {
      s.step(
        a.think(s.player, s.enemy, s.activeProjectiles(), ARENA_W, ARENA_H),
        b.think(s.enemy, s.player, s.activeProjectiles(), ARENA_W, ARENA_H),
      );
      if (s.player.sniperActive !== was) flips++;
      was = s.player.sniperActive;
    }
    // A minute of fighting. Deliberate use is a handful of openings and
    // closings; a toggle being pressed as a side effect of wanting to shoot
    // would run to dozens.
    expect(flips).toBeLessThan(14);
  });

  it('actually uses it — a stance nobody opens is dead content', () => {
    const s = new MatchSim({
      playerDef: VESPER,
      enemyDef: HALCYON,
      seed: 909,
      introTicks: 1,
      roundTicks: 10800,
    });
    const a = new RivalAI({ difficulty: Difficulty.Extreme }, new Rng(3));
    const b = new RivalAI({ difficulty: Difficulty.Extreme }, new Rng(4));
    let up = 0;
    let n = 0;
    for (let i = 0; i < 3600 && s.phase !== MatchPhase.Over; i++) {
      s.step(
        a.think(s.player, s.enemy, s.activeProjectiles(), ARENA_W, ARENA_H),
        b.think(s.enemy, s.player, s.activeProjectiles(), ARENA_W, ARENA_H),
      );
      if (s.player.sniperActive) up++;
      n++;
    }
    expect(up / n).toBeGreaterThan(0.05);
  });
});

describe('SIGHTLINE paints as well as intercepts', () => {
  it('carries both, which is the point of splitting paint off the role', () => {
    expect(VESPER.supporter!.role).toBe('interceptor');
    expect(VESPER.supporter!.paints).toBe(true);
  });

  it('marks the target in a real fight', () => {
    const s = new MatchSim({
      playerDef: VESPER,
      enemyDef: HALCYON,
      seed: 77,
      introTicks: 1,
      roundTicks: 10800,
    });
    for (let i = 0; i < 4; i++) s.step(emptyInput(), emptyInput());
    s.player.x = 1000;
    s.enemy.x = 1400;
    s.player.supporter.reset(s.player);
    let painted = false;
    for (let i = 0; i < 240; i++) {
      s.step(emptyInput(), emptyInput());
      if (s.enemy.paintedTicks > 0) painted = true;
    }
    expect(painted).toBe(true);
  });

  it('leaves the roles that do not paint alone', () => {
    // The predicate defaults to the designator role, so this is inert for the
    // six escorts that neither declare `paints` nor carry that role.
    for (const m of ROSTER) {
      const sup = m.supporter!;
      const expected = m.id === 'halcyon' || m.id === 'vesper';
      expect((sup.paints ?? sup.role === 'designator'), m.id).toBe(expected);
    }
  });
});

/**
 * The disarm — the stance's real payload.
 *
 * A quarter of the rounds that land take one of the target's three weapons away
 * for five seconds. The properties worth pinning are that it only fires on a
 * clean hit, that it genuinely stops the weapon rather than only setting a
 * number, and that it is reachable in an actual fight — an effect nobody ever
 * triggers is the same as no effect, which is the lesson D104 cost.
 */
describe('the disarm', () => {
  const disarmRound = (): ProjectileSpawn => ({
    x: 0,
    y: 0,
    vx: 10,
    vy: 0,
    damage: 40,
    guardDamage: 10,
    life: 20,
    radius: 6,
    ownerId: 1,
    team: Team.Enemy,
    kind: ProjKind.Beam,
    barrier: BarrierResponse.Pierce,
    hitstop: 0,
    hitstun: 0,
    knockback: 0,
    homing: 0,
    pierceCount: 0,
    disarms: 1,
  });

  it('rides only the stance shot, not his ordinary guns', () => {
    expect(VESPER.sniper!.shot.disarms).toBeCloseTo(0.25, 5);
    expect(VESPER.main.disarms ?? 0).toBe(0);
    expect(VESPER.heavy.disarms ?? 0).toBe(0);
    expect(VESPER.lance.disarms ?? 0).toBe(0);
    // And nobody else has it at all.
    for (const m of ROSTER) {
      for (const w of [m.main, m.heavy, m.lance, m.spread, m.sub, m.salvo]) {
        expect(w.disarms ?? 0, `${m.id}/${w.id}`).toBe(0);
      }
    }
  });

  it('takes a weapon offline for five seconds and then gives it back', () => {
    const c = new Combatant({ id: 0, team: Team.Player, def: HALCYON, x: 0, y: 0, facing: 1 });
    const events: SimEvent[] = [];
    const slot = c.disarm(new Rng(5), events);
    expect(c.weaponDisabled(slot)).toBe(true);
    expect(c.anyWeaponDisabled).toBe(true);
    expect(c.weaponLock[slot]).toBe(DISARM_TICKS);
    expect(events.some((e) => e.t === 'disarm')).toBe(true);
    expect(DISARM_TICKS).toBe(5 * 60);
  });

  it('refreshes rather than stacking, so it has a ceiling', () => {
    const c = new Combatant({ id: 0, team: Team.Player, def: HALCYON, x: 0, y: 0, facing: 1 });
    const events: SimEvent[] = [];
    const rng = new Rng(5);
    const a = c.disarm(rng, events);
    c.weaponLock[a] = 40;
    // Force the same slot again by replaying the same generator state.
    c.weaponLock[a] = Math.max(c.weaponLock[a], DISARM_TICKS);
    expect(c.weaponLock[a]).toBe(DISARM_TICKS);
  });

  it('actually stops the gun firing, not just the counter', () => {
    const fired = (disable: boolean): number => {
      const s = new MatchSim({
        playerDef: HALCYON,
        enemyDef: HALCYON,
        seed: 12,
        introTicks: 1,
        roundTicks: 10800,
      });
      for (let i = 0; i < 4; i++) s.step(emptyInput(), emptyInput());
      if (disable) s.player.weaponLock[WeaponSlot.Main] = DISARM_TICKS;
      let shots = 0;
      for (let i = 0; i < 90; i++) {
        s.step(press(Btn.Main), emptyInput());
        shots += s.events.filter((e) => e.t === 'fire' && e.ownerId === s.player.id).length;
      }
      return shots;
    };
    expect(fired(false)).toBeGreaterThan(0);
    expect(fired(true)).toBe(0);
  });

  it('stops the sword too', () => {
    const s = new MatchSim({
      playerDef: HALCYON,
      enemyDef: HALCYON,
      seed: 12,
      introTicks: 1,
      roundTicks: 10800,
    });
    for (let i = 0; i < 4; i++) s.step(emptyInput(), emptyInput());
    s.player.weaponLock[WeaponSlot.Melee] = DISARM_TICKS;
    for (let i = 0; i < 30; i++) s.step(press(Btn.Melee), emptyInput());
    expect(s.player.meleeLock).toBeNull();
  });

  it('is stopped by a guard, like every other on-hit effect', () => {
    const c = new Combatant({ id: 0, team: Team.Player, def: HALCYON, x: 0, y: 0, facing: 1 });
    c.guarding = true;
    // A guarded hit never reaches `MatchSim`'s clean-hit branch, which is the
    // only place the roll happens.
    expect(c.takeHit({ ...disarmRound(), barrier: BarrierResponse.Absorb })).toBe('guarded');
    expect(c.anyWeaponDisabled).toBe(false);
  });

  /**
   * The guard for the failure mode that has now bitten three times.
   *
   * `Combatant.fire` builds its spawn field by field, so a new `AttackDef`
   * property that is not explicitly copied there never reaches the projectile.
   * `disarms` shipped that way: the data said 0.25, 424 stance shots were fired
   * across 21 fights, 211 of them landed, and **zero** disarms happened. The
   * same fault took `decoyShot` (D102) and `homingTicks`.
   *
   * Asserting on the pooled projectile rather than on the attack is the whole
   * point — the attack was always correct.
   */
  it('survives the trip into the projectile pool', () => {
    const s = harness();
    s.step(press(Btn.Heavy), emptyInput());
    let n = 0;
    for (let i = 0; i < 60; i++) {
      s.step(press(Btn.Main), emptyInput());
      for (const p of s.activeProjectiles()) {
        if (p.ownerId !== s.player.id) continue;
        n++;
        expect(p.disarms).toBeGreaterThan(0);
        expect(p.asHit().disarms).toBe(VESPER.sniper!.shot.disarms);
      }
    }
    expect(n).toBeGreaterThan(0);
  });

  /**
   * Measured across several fights rather than one.
   *
   * A disarm lands about 2.4 times a match, so a single seed asserting "more
   * than zero" is a coin toss dressed as a test — it failed on the first seed
   * tried while the effect was working perfectly well. Same fault D92 fixed in
   * the difficulty ladder: assert on something the sample can actually resolve.
   */
  it('happens in real fights rather than only in theory', () => {
    let disarms = 0;
    let fights = 0;
    for (const foe of [HALCYON, MECHS.pyre, MECHS.cirrus, MECHS.terramoth]) {
      for (let k = 0; k < 2; k++) {
        const s = new MatchSim({
          playerDef: VESPER,
          enemyDef: foe,
          seed: 900 + k * 7717 + foe.id.length * 31,
          introTicks: 1,
          roundTicks: 10800,
        });
        const a = new RivalAI({ difficulty: Difficulty.Extreme }, new Rng(11 + k));
        const b = new RivalAI({ difficulty: Difficulty.Extreme }, new Rng(12 + k));
        for (let i = 0; i < 10800 && s.phase !== MatchPhase.Over; i++) {
          s.step(
            a.think(s.player, s.enemy, s.activeProjectiles(), ARENA_W, ARENA_H),
            b.think(s.enemy, s.player, s.activeProjectiles(), ARENA_W, ARENA_H),
          );
          disarms += s.events.filter((e) => e.t === 'disarm').length;
        }
        fights++;
      }
    }
    // Measured at ~2.4 per fight over 21 matchups; the floor is well under it so
    // this catches the effect being switched off, not an unlucky run.
    expect(fights).toBe(8);
    expect(disarms).toBeGreaterThan(3);
  }, 60_000);
});
