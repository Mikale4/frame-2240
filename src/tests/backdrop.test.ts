import { describe, expect, it } from 'vitest';
import { randomBackdrop } from '../scenes/BackdropFight';
import { ROSTER } from '../data/mechs';
import { Difficulty } from '../core/Session';
import { Rng } from '../core/Rng';

/**
 * The fight behind the title screen.
 *
 * Its casting is the old attract demo's: two *different* machines, both on the
 * top tier, so the background is the game at its best rather than a mirror
 * match or two machines bumbling about.
 */
describe('title backdrop fight', () => {
  it('always casts two different machines from the roster, on EXTREME', () => {
    const r = new Rng(31);
    const ids = new Set(ROSTER.map((m) => m.id));
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const b = randomBackdrop(() => r.next());
      expect(ids.has(b.player)).toBe(true);
      expect(ids.has(b.enemy)).toBe(true);
      expect(b.player).not.toBe(b.enemy);
      expect(b.tier).toBe(Difficulty.Extreme);
      seen.add(b.player);
    }
    // Every machine gets its turn in front of the title.
    expect(seen.size).toBe(ids.size);
  });
});
