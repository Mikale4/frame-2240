import { describe, expect, it } from 'vitest';
import { DEPTH_SCALE_MAX, DEPTH_SCALE_MIN, depthScaleAt, depthSortAt } from '../core/Depth';
import { ARENA_H } from '../core/GameConfig';
import { MatchSim } from '../combat/MatchSim';
import { HALCYON, NOCTURNE } from '../data/mechs';
import { Btn, emptyInput } from '../combat/types';

describe('pseudo-3D depth scaling', () => {
  it('runs small at the top of the arena to large at the bottom', () => {
    expect(depthScaleAt(0)).toBeCloseTo(DEPTH_SCALE_MIN, 5);
    expect(depthScaleAt(ARENA_H)).toBeCloseTo(DEPTH_SCALE_MAX, 5);
    expect(depthScaleAt(ARENA_H / 2)).toBeCloseTo((DEPTH_SCALE_MIN + DEPTH_SCALE_MAX) / 2, 5);
  });

  it('is monotonically increasing with depth', () => {
    let prev = -Infinity;
    for (let y = 0; y <= ARENA_H; y += ARENA_H / 40) {
      const s = depthScaleAt(y);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });

  it('clamps outside the arena instead of running away', () => {
    expect(depthScaleAt(-5000)).toBeCloseTo(DEPTH_SCALE_MIN, 5);
    expect(depthScaleAt(ARENA_H * 9)).toBeCloseTo(DEPTH_SCALE_MAX, 5);
  });

  /**
   * The reference kept fvar(35) = (ScreenPos Y + 25)/240 * 0.4 + 0.8 over a
   * 240px field: a 1.5x span from top to bottom. Ours should be in the same
   * ballpark - enough to read as depth, not so much that a high mech becomes
   * unreadable.
   */
  it('spans a similar range to the reference formula', () => {
    const ratio = DEPTH_SCALE_MAX / DEPTH_SCALE_MIN;
    const referenceRatio = 1.2 / 0.8;
    expect(ratio).toBeGreaterThan(1.2);
    expect(ratio).toBeLessThanOrEqual(referenceRatio + 0.05);
  });

  it('sorts lower objects in front, within a layer', () => {
    expect(depthSortAt(ARENA_H, 20)).toBeGreaterThan(depthSortAt(0, 20));
    // Layers never interleave: a projectile layer stays above the mech layer.
    expect(depthSortAt(0, 40)).toBeGreaterThan(depthSortAt(ARENA_H, 20));
  });
});

describe('depth is presentation only', () => {
  /**
   * The reference applied its scale to the drawing of part helpers, not to
   * collision. Keeping hitboxes depth-independent means altitude never changes
   * how big a target you are, and keeps arena containment provable.
   */
  it('does not change the simulated hurt radius', () => {
    const s = new MatchSim({ playerDef: HALCYON, enemyDef: NOCTURNE, introTicks: 1 });
    const r0 = s.player.def.rig.hurtRadius;
    s.player.y = 10;
    s.step(emptyInput(), emptyInput());
    expect(s.player.def.rig.hurtRadius).toBe(r0);
    s.player.y = ARENA_H - 10;
    s.step(emptyInput(), emptyInput());
    expect(s.player.def.rig.hurtRadius).toBe(r0);
  });

  it('leaves the simulation bit-identical regardless of altitude', () => {
    const run = (startY: number) => {
      const s = new MatchSim({
        playerDef: HALCYON,
        enemyDef: NOCTURNE,
        seed: 4242,
        introTicks: 1,
      });
      s.player.y = startY;
      s.enemy.y = startY;
      // Move the *whole machine*, escort included. `MatchSim` places each drone
      // relative to its owner's spawn, so teleporting only the chassis leaves the
      // drone hundreds of pixels away — above the mech in one run and below it in
      // the other. That is a different starting configuration, not a different
      // altitude, and it diverges the moment the drones start firing.
      s.player.supporter.reset(s.player);
      s.enemy.supporter.reset(s.enemy);
      const f = emptyInput();
      f.dx = 1;
      f.pressed = 1 << Btn.Main;
      f.held = 1 << Btn.Main;
      for (let i = 0; i < 120; i++) s.step(f, emptyInput());
      // Compare motion relative to where each run started.
      return [
        +(s.player.x).toFixed(6),
        +(s.player.y - startY).toFixed(6),
        +(s.player.vx).toFixed(6),
        s.projectiles.activeCount,
      ];
    };
    // Same inputs at two very different altitudes produce the same dynamics.
    expect(run(300)).toEqual(run(900));
  });
});
