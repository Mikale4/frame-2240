import { describe, expect, it } from 'vitest';
import { MatchSim } from '../combat/MatchSim';
import { HALCYON, NOCTURNE, MECHS } from '../data/mechs';
import { swingArcAngle } from '../combat/Combatant';
import { STRIDE_MAX, buildTurretInheritance, partLocalRotation, type RigPose } from '../render/RigRotation';
import { DECK_Y } from '../core/GameConfig';
import { Btn, emptyInput, type InputFrame } from '../combat/types';
import { DEG } from '../core/MathUtil';

const W = 2400;
const H = 1200;

function sim(): MatchSim {
  return new MatchSim({
    playerDef: HALCYON,
    enemyDef: NOCTURNE,
    seed: 7,
    introTicks: 2,
    arenaW: W,
    arenaH: H,
  });
}

function press(...btns: Btn[]): InputFrame {
  let m = 0;
  for (const b of btns) m |= 1 << b;
  return { ...emptyInput(), held: m, pressed: m };
}

describe('melee swing arc', () => {
  const arc = HALCYON.meleeLock.arc;

  it('raises the blade before it sweeps', () => {
    // Positive windup is authored as "raised"; screen y is down, so raised is
    // a negative rotation.
    const top = swingArcAngle(arc, arc.windupFrac, 0);
    expect(top).toBeCloseTo(-arc.windup * DEG, 5);
    expect(top).toBeLessThan(0);
  });

  it('sweeps all the way through and past the target', () => {
    const start = swingArcAngle(arc, arc.windupFrac, 0);
    const end = swingArcAngle(arc, 1, 0);
    // Travels the full authored sweep, downward (increasing angle).
    expect(end - start).toBeCloseTo(arc.sweep * DEG, 4);
    expect(end).toBeGreaterThan(0);
  });

  it('covers a genuine arc rather than holding one angle', () => {
    const seen = [];
    for (let i = 0; i <= 20; i++) seen.push(swingArcAngle(arc, i / 20, 0));
    const span = Math.max(...seen) - Math.min(...seen);
    // A stab would barely move; this must be a wide sweep.
    expect(span).toBeGreaterThan(150 * DEG);
  });

  it('mirrors alternate hits so a chain does not repeat one stroke', () => {
    for (const t of [0.2, 0.5, 0.9]) {
      expect(swingArcAngle(arc, t, 1)).toBeCloseTo(-swingArcAngle(arc, t, 0), 6);
    }
  });

  it('decelerates into the follow-through', () => {
    // The second half of the slash should cover less ground than the first.
    const a = swingArcAngle(arc, arc.windupFrac, 0);
    const mid = swingArcAngle(arc, arc.windupFrac + (1 - arc.windupFrac) / 2, 0);
    const end = swingArcAngle(arc, 1, 0);
    expect(mid - a).toBeGreaterThan(end - mid);
  });

  it('drives the arm through the arc during a live lock-on sequence', () => {
    const s = sim();
    for (let i = 0; i < 6; i++) s.step(emptyInput(), emptyInput());
    const p = s.player;
    // Put the target inside acquire range.
    s.enemy.x = p.x + 240;
    s.enemy.y = p.y;
    s.step(press(Btn.Melee), emptyInput());
    expect(p.meleeLock).not.toBeNull();

    const spins: number[] = [];
    for (let i = 0; i < 70; i++) {
      s.step(emptyInput(), emptyInput());
      if (p.swinging) spins.push(p.spin);
    }
    expect(spins.length).toBeGreaterThan(20);
    const span = Math.max(...spins) - Math.min(...spins);
    expect(span).toBeGreaterThan(120 * DEG);
  });

  it('releases the arm once the sequence ends', () => {
    const s = sim();
    for (let i = 0; i < 6; i++) s.step(emptyInput(), emptyInput());
    const p = s.player;
    s.enemy.x = p.x + 240;
    s.step(press(Btn.Melee), emptyInput());
    // Then get clear. The rival's escort now runs team-up plays — it will cross
    // the arena and chain-hit a stationary target — and this test is about the
    // arm relaxing, not about surviving a pincer.
    for (let i = 0; i < 400; i++) {
      s.enemy.x = p.x + 2000;
      s.enemy.supporter.x = s.enemy.x;
      s.step(emptyInput(), emptyInput());
    }
    expect(p.meleeLock).toBeNull();
    expect(p.swinging).toBe(false);
    // The arm has relaxed back to rest rather than sticking at follow-through.
    expect(Math.abs(p.spin)).toBeLessThan(0.02);
  });
});

describe('walk cycle', () => {
  it('does not stride while flying', () => {
    const s = sim();
    for (let i = 0; i < 60; i++) s.step({ ...emptyInput(), dx: 1 }, emptyInput());
    expect(s.player.flying).toBe(true);
    expect(s.player.stride).toBe(0);
  });

  it('strides once grounded and moving, and settles when stopped', () => {
    const s = sim();
    const p = s.player;
    for (let i = 0; i < 4; i++) s.step(emptyInput(), emptyInput());
    s.step(press(Btn.Flight), emptyInput());
    let guard = 0;
    while (!p.grounded && guard++ < 400) s.step(emptyInput(), emptyInput());
    expect(p.grounded).toBe(true);

    for (let i = 0; i < 60; i++) s.step({ ...emptyInput(), dx: 1 }, emptyInput());
    expect(p.stride).toBeGreaterThan(0.7);

    for (let i = 0; i < 120; i++) s.step(emptyInput(), emptyInput());
    expect(p.stride).toBeLessThan(0.05);
  });

  it('advances the phase with distance covered, not with time', () => {
    const s = sim();
    const p = s.player;
    for (let i = 0; i < 4; i++) s.step(emptyInput(), emptyInput());
    s.step(press(Btn.Flight), emptyInput());
    let guard = 0;
    while (!p.grounded && guard++ < 400) s.step(emptyInput(), emptyInput());

    // Standing still: the phase must not creep.
    const held = p.walkPhase;
    for (let i = 0; i < 40; i++) s.step(emptyInput(), emptyInput());
    expect(p.walkPhase).toBeCloseTo(held, 6);

    // Walking: it must advance.
    for (let i = 0; i < 30; i++) s.step({ ...emptyInput(), dx: 1 }, emptyInput());
    expect(p.walkPhase).not.toBeCloseTo(held, 3);
  });

  it('swings the two legs in antiphase', () => {
    const parts = MECHS.halcyon.rig.parts;
    const inherits = buildTurretInheritance(parts);
    const near = parts.find((x) => x.name === 'legNear')!;
    const far = parts.find((x) => x.name === 'legFar')!;
    const pose: RigPose = {
      turretRot: 0,
      turretRotHead: 0,
      spin: 0,
    weaponSpin: 0,
    lean: 0,
      reach: 0,
    lift: 0,
      thrust: 0,
      meleeing: false,
      walkPhase: Math.PI / 2,
      stride: 1,
      // Full stride, so the airborne dangle is faded fully out and this stays a
      // test of the gait rather than of the hang.
      legNear: 0,
      legFar: 0,
    };
    const a = partLocalRotation(near, inherits.get('legNear')!, pose);
    const b = partLocalRotation(far, inherits.get('legFar')!, pose);
    expect(a).toBeCloseTo(STRIDE_MAX, 6);
    expect(b).toBeCloseTo(-STRIDE_MAX, 6);
  });

  it('does not let the legs inherit the aim', () => {
    const parts = MECHS.halcyon.rig.parts;
    const inherits = buildTurretInheritance(parts);
    expect(inherits.get('legNear')).toBe(false);
    expect(inherits.get('legFar')).toBe(false);
  });
});

/**
 * The legs move *in the air*, which for this game is the only case that matters.
 *
 * The walk cycle above is gated on `grounded && !flying` and `grounded` measures
 * **0.0 %** across every machine in the harness, so before this existed the legs
 * held a fixed splay for entire matches. Every assertion here is therefore about
 * a flying mech; a green `walk cycle` block says nothing about what a player
 * actually sees.
 */
describe('airborne leg dangle', () => {
  /** Flies the player under thrust for `n` ticks and returns the leg angles. */
  const flyFor = (n: number, dx: number): { s: MatchSim; legs: number[] } => {
    const s = sim();
    for (let i = 0; i < 4; i++) s.step(emptyInput(), emptyInput());
    for (let i = 0; i < n; i++) s.step({ ...press(Btn.Boost), dx, dy: 0 }, emptyInput());
    return { s, legs: [...s.player.legSwing] };
  };

  it('swings the legs while airborne, where the walk cycle never runs', () => {
    const { s, legs } = flyFor(40, 1);
    // The precondition this whole feature rests on: no gait is running.
    expect(s.player.grounded).toBe(false);
    expect(s.player.stride).toBe(0);
    expect(Math.abs(legs[0])).toBeGreaterThan(2 * DEG);
    expect(Math.abs(legs[1])).toBeGreaterThan(2 * DEG);
  });

  it('trails the legs opposite to the direction of travel', () => {
    const right = flyFor(40, 1).legs;
    const left = flyFor(40, -1).legs;
    // Opposite travel, opposite hang. Sign, not magnitude — the magnitudes
    // differ because the springs differ, which is the point of the next test.
    expect(Math.sign(right[0])).toBe(-Math.sign(left[0]));
    expect(Math.sign(right[1])).toBe(-Math.sign(left[1]));
  });

  it('never returns the same angle for both legs', () => {
    // The failure being guarded is two sprites welded into one silhouette. It
    // is not enough that they move; they have to move *differently*, or the
    // pair still reads as a single piece however far it swings.
    const seen: number[] = [];
    const s = sim();
    for (let i = 0; i < 4; i++) s.step(emptyInput(), emptyInput());
    for (let i = 0; i < 90; i++) {
      s.step({ ...press(Btn.Boost), dx: i < 45 ? 1 : -1, dy: 0 }, emptyInput());
      seen.push(Math.abs(s.player.legSwing[0] - s.player.legSwing[1]));
    }
    // Separated on essentially every frame, and meaningfully so at some point.
    expect(seen.filter((d) => d > 0.001).length).toBeGreaterThan(80);
    expect(Math.max(...seen)).toBeGreaterThan(1.5 * DEG);
  });

  it('keeps swinging for a moment after the machine stops driving', () => {
    // A spring, not a sine locked to velocity: cut the input and the legs should
    // still be moving on the next tick rather than snapping to a new rest angle.
    const s = sim();
    for (let i = 0; i < 4; i++) s.step(emptyInput(), emptyInput());
    for (let i = 0; i < 40; i++) s.step({ ...press(Btn.Boost), dx: 1, dy: 0 }, emptyInput());
    const atCut = [...s.player.legSwing];
    s.step(emptyInput(), emptyInput());
    const after = [...s.player.legSwing];
    expect(after[0]).not.toBeCloseTo(atCut[0], 6);
    expect(after[1]).not.toBeCloseTo(atCut[1], 6);
  });

  it('is deterministic, so a replay reproduces the pose', () => {
    expect(flyFor(50, 1).legs).toEqual(flyFor(50, 1).legs);
  });
});

describe('deck', () => {
  /**
   * How far a chassis's feet sit below its own pivot.
   *
   * `footOffset` is measured on the unscaled sprite, so it must be multiplied by
   * the chassis scale: an eight-mech roster is drawn at 0.82x to 1.29x, and
   * without this a siege walker stands with its shins through the deck.
   */
  const foot = (c: { def: { rig: { footOffset: number; scale: number } } }) =>
    c.def.rig.footOffset * c.def.rig.scale;

  it('rests every chassis with its own feet on the deck line', () => {
    const s = sim();
    for (const c of s.combatants) {
      expect(c.groundY + foot(c)).toBeCloseTo(DECK_Y, 6);
    }
  });

  it('stands a tall walker and a squat one on the same line', () => {
    const s = sim();
    const p = s.player;
    const e = s.enemy;
    // Different leg lengths and different chassis sizes...
    expect(foot(p)).not.toBe(foot(e));
    // ...but the same contact height.
    expect(p.groundY + foot(p)).toBeCloseTo(e.groundY + foot(e), 6);
  });

  it('lands feet exactly on the deck, not through it', () => {
    const s = sim();
    const p = s.player;
    for (let i = 0; i < 4; i++) s.step(emptyInput(), emptyInput());
    s.step(press(Btn.Flight), emptyInput());
    let guard = 0;
    while (!p.grounded && guard++ < 400) s.step(emptyInput(), emptyInput());
    expect(p.y + foot(p)).toBeCloseTo(DECK_Y, 4);
    // And stays there.
    for (let i = 0; i < 120; i++) s.step({ ...emptyInput(), dx: 1 }, emptyInput());
    expect(p.y + foot(p)).toBeLessThanOrEqual(DECK_Y + 1e-6);
  });
});
