import { describe, expect, it } from 'vitest';
import { MatchSim } from '../combat/MatchSim';
import { MECHS, ROSTER } from '../data/mechs';
import { RivalAI } from '../ai/RivalAI';
import { Rng } from '../core/Rng';
import { Difficulty } from '../core/Session';
import { ARENA_H, ARENA_W } from '../core/GameConfig';
import { Btn, MatchPhase, ProjKind, emptyInput, type InputFrame } from '../combat/types';

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

  it('fires the stance lance from the main button while it is up', () => {
    const s = harness();
    s.step(press(Btn.Heavy), emptyInput());
    for (let i = 0; i < 30; i++) s.step(press(Btn.Main), emptyInput());
    const mine = s.activeProjectiles().filter((p) => p.ownerId === s.player.id);
    expect(mine.length).toBeGreaterThan(0);
    // Beams, not the ordinary RAILNEEDLE bullet.
    expect(mine.every((p) => p.kind === ProjKind.Beam)).toBe(true);
    expect(mine.some((p) => p.homing > 0)).toBe(true);
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
