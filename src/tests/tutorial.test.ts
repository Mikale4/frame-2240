import { describe, expect, it } from 'vitest';
import { MatchSim } from '../combat/MatchSim';
import { HALCYON, NOCTURNE } from '../data/mechs';
import { Btn, type InputFrame } from '../combat/types';
import { DEFAULT_BINDINGS, cloneBindings } from '../input/Bindings';
import { BEACONS, CLEAR_TICKS, LESSONS, TutorialDirector, keyNames } from '../tutorial/Tutorial';

/**
 * The tutorial, played.
 *
 * Every lesson is driven to completion through the real simulation by a
 * scripted pilot pressing the same buttons a player would — the point being
 * that no lesson can ship that a player cannot finish. Each has a tick budget
 * well inside what a person would take, so a lesson that quietly became
 * impossible (a renamed event, a gauge that runs dry) fails here, not on the
 * owner's screen.
 */

function course(): { s: MatchSim; d: TutorialDirector } {
  const s = new MatchSim({
    playerDef: HALCYON,
    enemyDef: NOCTURNE,
    seed: 4242,
    introTicks: 2,
    roundTicks: 99 * 60 * 10,
    dummy: true,
  });
  for (let i = 0; i < 4; i++) s.step(blank(), blank());
  return { s, d: new TutorialDirector(s, 7) };
}

function blank(): InputFrame {
  return { dx: 0, dy: 0, held: 0, pressed: 0, aimX: null, aimY: null };
}

/** Turns "what is held this tick" into a frame with correct press edges. */
class Pilot {
  private prev = 0;
  frame(dx: number, dy: number, held: Btn[] = []): InputFrame {
    let mask = 0;
    for (const b of held) mask |= 1 << b;
    const f = { dx, dy, held: mask, pressed: mask & ~this.prev, aimX: null, aimY: null };
    this.prev = mask;
    return f;
  }
}

type Driver = (s: MatchSim, d: TutorialDirector, p: Pilot, t: number) => InputFrame;

const toward = (from: number, to: number, dead = 12): number => (Math.abs(to - from) > dead ? Math.sign(to - from) : 0);

/** A fighting-game motion, replayed every `period` ticks: down, down-X, X + button. */
const motion =
  (back: boolean, btn: Btn, period = 40): Driver =>
  (s, _d, p, t) => {
    const fwd = s.enemy.x >= s.player.x ? 1 : -1;
    const x = back ? -fwd : fwd;
    const k = t % period;
    if (k < 3) return p.frame(0, 1);
    if (k < 6) return p.frame(x, 1);
    if (k === 6) return p.frame(x, 0, [btn]);
    return p.frame(0, 0);
  };

const DRIVERS: Record<string, Driver> = {
  welcome: (_s, _d, p, t) => p.frame(0, 0, t === 2 ? [Btn.Main] : []),
  hud: (_s, _d, p, t) => p.frame(0, 0, t === 2 ? [Btn.Main] : []),
  fly: (s, d, p) => {
    const b = BEACONS[Math.min(d.progress, BEACONS.length - 1)];
    return p.frame(toward(s.player.x, b[0]), toward(s.player.y, b[1]));
  },
  brake: (_s, d, p, t) => {
    const k = t % 80;
    const dir = d.progress % 2 === 0 ? 1 : -1;
    return k < 34 ? p.frame(dir, 0) : p.frame(0, 0, [Btn.Boost]);
  },
  boost: (s, _d, p) => {
    const dir = s.player.x < 1200 ? 1 : -1;
    return p.frame(dir, 0, [Btn.Boost]);
  },
  dash: (s, _d, p, t) => {
    const dir = s.player.x < 1200 ? 1 : -1;
    return t % 40 === 0 ? p.frame(dir, 0, [Btn.Boost]) : p.frame(0, 0);
  },
  ground: (s, _d, p, t) => {
    if (t === 2) return p.frame(0, 0, [Btn.Flight]);
    if (s.player.grounded && t % 20 === 0) return p.frame(0, 0, [Btn.Flight]);
    return p.frame(0, 0);
  },
  gun: (_s, _d, p) => p.frame(0, 0, [Btn.Main]),
  heavy: (_s, _d, p, t) => p.frame(0, 0, t % 30 === 0 ? [Btn.Heavy] : []),
  sword: (s, _d, p, t) => closeAndSwing(s, p, t),
  chain: (s, _d, p, t) => closeAndSwing(s, p, t),
  scatter: motion(false, Btn.Main),
  lance: motion(true, Btn.Heavy),
  drone: (_s, _d, p) => p.frame(0, 0),
  salvo: motion(false, Btn.Sub),
  target: (_s, _d, p, t) => p.frame(0, 0, t === 5 || t === 40 ? [Btn.TargetCycle] : []),
  guard: (_s, _d, p) => p.frame(0, 0, [Btn.Barrier]),
  barrier: (s, _d, p) => {
    // Burst when a round is about to arrive.
    const near = s
      .activeProjectiles()
      .some((q) => q.ownerId === s.enemy.id && Math.hypot(q.x - s.player.x, q.y - s.player.y) < 140);
    return p.frame(0, 0, near ? [Btn.Barrier] : []);
  },
  repel: (s, _d, p) => {
    // The cue a player sees: the dummy's sword sequence opening (stage 0).
    const opening = s.events.some((e) => e.t === 'melee' && e.id === s.enemy.id && e.stage === 0);
    return p.frame(0, 0, opening ? [Btn.Barrier] : []);
  },
  modes: (_s, _d, p, t) => p.frame(0, 0, t % 20 === 0 ? [Btn.ModeCycle] : []),
  saturate: (_s, d, p, t) => {
    if (d.progress === 0) return p.frame(0, 0, t % 30 === 2 ? [Btn.Saturation] : []);
    return p.frame(0, 0, [Btn.Main]);
  },
};

function closeAndSwing(s: MatchSim, p: Pilot, t: number): InputFrame {
  const me = s.player;
  const foe = s.enemy;
  const d = Math.hypot(foe.x - me.x, foe.y - me.y);
  if (d > me.def.meleeRange * 0.8) return p.frame(toward(me.x, foe.x), toward(me.y, foe.y, 20));
  return p.frame(0, 0, t % 6 < 3 ? [Btn.Melee] : []);
}

/** Plays the open lesson until it clears; returns the ticks it took, or -1. */
function play(s: MatchSim, d: TutorialDirector, budget: number): number {
  const L = d.lesson;
  const drive = DRIVERS[L.id];
  const p = new Pilot();
  for (let t = 0; t < budget; t++) {
    const input = drive ? drive(s, d, p, t) : p.frame(0, 0);
    s.step(input, d.foeInput());
    d.afterStep(input);
    if (d.clearing > 0 || d.index !== LESSONS.indexOf(L)) return t;
  }
  return -1;
}

describe('the tutorial course', () => {
  it('names the player’s real keys', () => {
    const k = keyNames(DEFAULT_BINDINGS, false);
    expect(k.main).toBe('[Z]');
    expect(k.move).toBe('[ARROW KEYS]');
    expect(keyNames(DEFAULT_BINDINGS, true).main).toBe('[Z / PAD A]');
    // A rebind shows up on the card.
    const b = cloneBindings(DEFAULT_BINDINGS);
    b.main.keys = ['KeyJ'];
    expect(keyNames(b, false).main).toBe('[J]');
    for (const L of LESSONS) {
      const words = L.text(k) + L.goal(k);
      expect(words, L.id).not.toMatch(/undefined|NaN|\[\]/);
    }
  });

  it('has a driver for every lesson but the spar', () => {
    for (const L of LESSONS) if (L.id !== 'spar') expect(DRIVERS[L.id], L.id).toBeDefined();
  });

  it('can be played through, every lesson, by pressing buttons', () => {
    const { s, d } = course();
    const took: Record<string, number> = {};
    for (const L of LESSONS) {
      expect(d.lesson.id).toBe(L.id);
      if (L.id === 'spar') break;
      const t = play(s, d, 60 * 45);
      took[L.id] = t;
      expect(t, `${L.id} never cleared`).toBeGreaterThanOrEqual(0);
      // Let the CLEAR stamp run out; the next lesson opens by itself.
      for (let i = 0; i < CLEAR_TICKS + 1; i++) {
        s.step(blank(), d.foeInput());
        d.afterStep(blank());
      }
    }
    expect(d.lesson.id).toBe('spar');
    expect(d.cleared.size).toBe(LESSONS.length - 1);
  });

  it('keeps both machines standing until the spar', () => {
    const { s, d } = course();
    // Sit in the guard lesson and the rush lesson doing nothing at all.
    for (const id of ['guard', 'repel']) {
      d.open(LESSONS.findIndex((l) => l.id === id));
      for (let i = 0; i < 60 * 20; i++) {
        s.step(blank(), d.foeInput());
        d.afterStep(blank());
        expect(s.player.life).toBeGreaterThan(0);
        expect(s.enemy.life).toBe(s.enemy.def.gauges.maxLife);
      }
    }
    expect(s.playerDowns).toBe(0);
    expect(s.dummyDowns).toBe(0);
  });

  it('ends on the spar when the rival goes down, and then is done', () => {
    const { s, d } = course();
    d.open(LESSONS.length - 1);
    expect(d.lesson.id).toBe('spar');
    // The rival fights back here.
    let hostile = false;
    for (let i = 0; i < 60 * 6; i++) {
      const f = d.foeInput();
      if (f.held || f.dx || f.dy) hostile = true;
      s.step(blank(), f);
      d.afterStep(blank());
    }
    expect(hostile).toBe(true);
    // Put it down: the dummy match revives it and counts the knockdown.
    s.enemy.life = 0;
    s.step(blank(), d.foeInput());
    d.afterStep(blank());
    expect(d.clearing).toBeGreaterThan(0);
    for (let i = 0; i < CLEAR_TICKS; i++) {
      s.step(blank(), d.foeInput());
      d.afterStep(blank());
    }
    expect(d.done).toBe(true);
  });

  it('skips, goes back and restarts without counting skipped lessons', () => {
    const { d } = course();
    d.next();
    d.next();
    expect(d.lesson.id).toBe(LESSONS[2].id);
    expect(d.cleared.size).toBe(0);
    d.back();
    expect(d.index).toBe(1);
    d.progress = 1;
    d.restart();
    expect(d.progress).toBe(0);
    d.open(LESSONS.length - 1);
    d.next();
    expect(d.done).toBe(true);
  });
});
