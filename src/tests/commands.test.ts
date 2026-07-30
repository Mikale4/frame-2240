import { describe, expect, it } from 'vitest';
import { CommandBuffer, MOTIONS, Sym, dirFrom } from '../combat/CommandBuffer';
import { Btn, emptyInput, type InputFrame } from '../combat/types';
import { Rng } from '../core/Rng';
import { approachAngle, angleDelta, wrapAngle, limitLength } from '../core/MathUtil';

function frame(dx: number, dy: number, pressed: Btn[] = [], held: Btn[] = []): InputFrame {
  const f = emptyInput();
  f.dx = dx;
  f.dy = dy;
  for (const b of pressed) f.pressed |= 1 << b;
  for (const b of [...pressed, ...held]) f.held |= 1 << b;
  return f;
}

describe('direction symbols', () => {
  it('maps the 9 numpad directions', () => {
    expect(dirFrom(0, 0)).toBe(Sym.N);
    expect(dirFrom(1, 0)).toBe(Sym.Fwd);
    expect(dirFrom(-1, 0)).toBe(Sym.Back);
    expect(dirFrom(0, -1)).toBe(Sym.Up);
    expect(dirFrom(0, 1)).toBe(Sym.Down);
    expect(dirFrom(1, -1)).toBe(Sym.UpFwd);
    expect(dirFrom(-1, -1)).toBe(Sym.UpBack);
    expect(dirFrom(1, 1)).toBe(Sym.DownFwd);
    expect(dirFrom(-1, 1)).toBe(Sym.DownBack);
  });

  it('mirrors forward/back when facing left', () => {
    const b = new CommandBuffer();
    b.push(frame(1, 0), -1);
    expect(b.current()).toBe(Sym.Back);
    b.push(frame(-1, 0), -1);
    expect(b.current()).toBe(Sym.Fwd);
  });
});

describe('motion recognition', () => {
  it('recognises down-forward + Main as the spread motion', () => {
    const b = new CommandBuffer();
    b.push(frame(0, 1), 1); // down
    b.push(frame(1, 1), 1); // down-forward
    b.push(frame(1, 0, [Btn.Main]), 1); // forward + button
    expect(b.matches(MOTIONS.spread)).toBe(true);
  });

  it('recognises down-back + Heavy as the lance motion', () => {
    const b = new CommandBuffer();
    b.push(frame(0, 1), 1);
    b.push(frame(-1, 1), 1);
    b.push(frame(-1, 0, [Btn.Heavy]), 1);
    expect(b.matches(MOTIONS.lance)).toBe(true);
  });

  it('rejects the button alone', () => {
    const b = new CommandBuffer();
    for (let i = 0; i < 5; i++) b.push(frame(0, 0), 1);
    b.push(frame(0, 0, [Btn.Main]), 1);
    expect(b.matches(MOTIONS.spread)).toBe(false);
  });

  it('rejects the right motion with the wrong button', () => {
    const b = new CommandBuffer();
    b.push(frame(0, 1), 1);
    b.push(frame(1, 1), 1);
    b.push(frame(1, 0, [Btn.Sub]), 1);
    expect(b.matches(MOTIONS.spread)).toBe(false);
    // ...but Sub with the same motion is the salvo.
    expect(b.matches(MOTIONS.salvo)).toBe(true);
  });

  it('expires once the motion falls outside its window', () => {
    const b = new CommandBuffer();
    b.push(frame(0, 1), 1);
    b.push(frame(1, 1), 1);
    for (let i = 0; i < 20; i++) b.push(frame(0, 0), 1);
    b.push(frame(1, 0, [Btn.Main]), 1);
    expect(b.matches(MOTIONS.spread)).toBe(false);
  });

  it('only fires on a fresh button press, not several ticks later', () => {
    const b = new CommandBuffer();
    b.push(frame(0, 1), 1);
    b.push(frame(1, 1), 1);
    b.push(frame(1, 0, [Btn.Main]), 1);
    expect(b.matches(MOTIONS.spread)).toBe(true);
    for (let i = 0; i < 4; i++) b.push(frame(0, 0), 1);
    expect(b.matches(MOTIONS.spread)).toBe(false);
  });

  it('detects a double tap inside the window and consumes it', () => {
    const b = new CommandBuffer();
    b.push(frame(1, 0), 1);
    b.noteForDoubleTap(Sym.Fwd);
    b.push(frame(0, 0), 1);
    b.push(frame(1, 0), 1);
    b.noteForDoubleTap(Sym.Fwd);
    expect(b.consumeDoubleTap(Sym.Fwd, 14)).toBe(true);
    // Consumed exactly once.
    expect(b.consumeDoubleTap(Sym.Fwd, 14)).toBe(false);
  });

  it('does not treat two slow taps as a double tap', () => {
    const b = new CommandBuffer();
    b.push(frame(1, 0), 1);
    b.noteForDoubleTap(Sym.Fwd);
    for (let i = 0; i < 30; i++) b.push(frame(0, 0), 1);
    b.push(frame(1, 0), 1);
    b.noteForDoubleTap(Sym.Fwd);
    expect(b.consumeDoubleTap(Sym.Fwd, 14)).toBe(false);
  });
});

describe('math helpers', () => {
  it('wraps angles into (-PI, PI]', () => {
    expect(wrapAngle(0)).toBeCloseTo(0);
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI * 3)).toBeCloseTo(Math.PI);
  });

  it('takes the short way around when slewing', () => {
    // From just below +PI to just above -PI is a short hop across the seam.
    const from = Math.PI - 0.05;
    const to = -Math.PI + 0.05;
    expect(Math.abs(angleDelta(from, to))).toBeLessThan(0.2);
    const next = approachAngle(from, to, 0.05);
    expect(Math.abs(angleDelta(next, to))).toBeLessThan(Math.abs(angleDelta(from, to)));
  });

  it('snaps to the target when within one step', () => {
    expect(approachAngle(0, 0.01, 1)).toBeCloseTo(0.01);
  });

  it('limits vector length without changing direction', () => {
    const [x, y] = limitLength(30, 40, 5); // length 50 -> 5
    expect(Math.hypot(x, y)).toBeCloseTo(5);
    expect(y / x).toBeCloseTo(40 / 30);
  });
});

describe('rng', () => {
  it('is reproducible from a seed', () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    for (let i = 0; i < 50; i++) expect(a.next()).toBe(b.next());
  });

  it('differs across seeds', () => {
    expect(new Rng(1).next()).not.toBe(new Rng(2).next());
  });

  it('stays in range', () => {
    const r = new Rng(9);
    for (let i = 0; i < 2000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(r.int(6)).toBeLessThan(6);
    }
  });

  it('can save and restore its state', () => {
    const r = new Rng(77);
    r.next();
    const snap = r.save();
    const a = [r.next(), r.next()];
    r.load(snap);
    expect([r.next(), r.next()]).toEqual(a);
  });
});
