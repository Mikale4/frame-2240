import { describe, expect, it } from 'vitest';
import { MATCHUPS, matchupKey, pickConversation } from '../data/matchups';
import { ROSTER } from '../data/mechs';
import { BANTER } from '../data/banter';

/**
 * Matchup dialogue is 36 pairs of pure data, and a gap in it is invisible until
 * someone happens to pick that exact pairing. Every assertion here is about
 * completeness rather than taste.
 */

const IDS = ROSTER.map((m) => m.id);

/** Every unordered pair, mirrors included. */
function allPairs(): [string, string][] {
  const out: [string, string][] = [];
  for (let i = 0; i < IDS.length; i++) {
    for (let j = i; j < IDS.length; j++) out.push([IDS[i], IDS[j]]);
  }
  return out;
}

describe('matchup conversations — coverage', () => {
  it('covers every pairing in the roster, mirrors included', () => {
    const pairs = allPairs();
    // 8 mechs: 28 cross-matchups plus 8 mirrors.
    expect(pairs.length).toBe(36);
    for (const [a, b] of pairs) {
      expect(MATCHUPS[matchupKey(a, b)], `missing ${a} vs ${b}`).toBeTruthy();
    }
  });

  it('has exactly the pairs the roster needs and no strays', () => {
    const wanted = new Set(allPairs().map(([a, b]) => matchupKey(a, b)));
    for (const key of Object.keys(MATCHUPS)) {
      expect(wanted.has(key), `stray matchup ${key}`).toBe(true);
    }
    expect(Object.keys(MATCHUPS).length).toBe(wanted.size);
  });

  it('gives every pairing five conversations', () => {
    for (const [a, b] of allPairs()) {
      const set = MATCHUPS[matchupKey(a, b)];
      expect(set.length, `${a} vs ${b}`).toBe(5);
    }
  });

  it('makes every conversation an actual exchange', () => {
    for (const [a, b] of allPairs()) {
      for (const convo of MATCHUPS[matchupKey(a, b)]) {
        expect(convo.length, `${a} vs ${b}`).toBeGreaterThanOrEqual(2);
        // Both machines in the pairing must appear. In a mirror both entries
        // carry the same id, which is fine — the scene alternates by position.
        const speakers = new Set(convo.map((e) => e.who));
        for (const s of speakers) expect([a, b]).toContain(s);
        if (a !== b) expect(speakers.size).toBe(2);
      }
    }
  });

  it('only ever puts words in the mouths of the two pilots present', () => {
    for (const [a, b] of allPairs()) {
      for (const convo of MATCHUPS[matchupKey(a, b)]) {
        for (const ex of convo) {
          expect([a, b], `${ex.who} spoke in ${a} vs ${b}`).toContain(ex.who);
        }
      }
    }
  });

  it('keeps lines short enough to read in the corner box', () => {
    for (const key of Object.keys(MATCHUPS)) {
      for (const convo of MATCHUPS[key]) {
        for (const ex of convo) {
          expect(ex.line.length, `${key}: "${ex.line}"`).toBeLessThanOrEqual(58);
          expect(ex.line.trim()).toBe(ex.line);
        }
      }
    }
  });

  it('does not repeat a conversation within a pairing', () => {
    for (const key of Object.keys(MATCHUPS)) {
      const seen = new Set<string>();
      for (const convo of MATCHUPS[key]) {
        const sig = convo.map((e) => `${e.who}:${e.line}`).join('|');
        expect(seen.has(sig), `${key} repeats a conversation`).toBe(false);
        seen.add(sig);
      }
    }
  });
});

describe('matchup conversations — lookup', () => {
  it('does not care which pilot is player one', () => {
    for (const [a, b] of allPairs()) {
      expect(matchupKey(a, b)).toBe(matchupKey(b, a));
      for (const roll of [0, 0.4, 0.9]) {
        expect(pickConversation(a, b, roll)).toBe(pickConversation(b, a, roll));
      }
    }
  });

  it('reaches all five variations across the roll range', () => {
    const seen = new Set<unknown>();
    for (const roll of [0.0, 0.2, 0.4, 0.6, 0.8]) {
      seen.add(pickConversation('halcyon', 'nocturne', roll));
    }
    expect(seen.size).toBe(5);
  });

  it('stays in range at the extremes', () => {
    expect(pickConversation('halcyon', 'nocturne', 1)).toBeTruthy();
    expect(pickConversation('halcyon', 'nocturne', 0)).toBeTruthy();
  });

  it('returns null for a pairing that does not exist', () => {
    expect(pickConversation('halcyon', 'nonexistent', 0.5)).toBeNull();
  });
});

describe('saturation lines', () => {
  it('gives every pilot five, since the cutscene shows one every time', () => {
    for (const m of ROSTER) {
      expect(BANTER[m.id].saturation!.length, m.id).toBe(5);
    }
  });

  it('keeps them distinct within a pilot', () => {
    for (const m of ROSTER) {
      const lines = BANTER[m.id].saturation!;
      expect(new Set(lines).size, m.id).toBe(lines.length);
    }
  });
});
