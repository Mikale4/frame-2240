import { describe, expect, it } from 'vitest';
import {
  TAG_ARRIVALS,
  TAG_LATE,
  TAG_PAIRS,
  tagKey,
  canTag,
  pickTagArrival,
  pickTagLate,
} from '../data/tags';
import { ROSTER } from '../data/mechs';

/**
 * The assist tables are pure data across sixteen pairings, and a gap in them is
 * invisible until someone picks that exact pair and hears silence — or worse,
 * calls an assist that never arrives because the id was misspelt. Everything
 * here is completeness rather than taste.
 */

const IDS = ROSTER.map((m) => m.id);

/** Every legal ordered call: caller, then one of their two. */
function allCalls(): [string, string][] {
  const out: [string, string][] = [];
  for (const caller of IDS) for (const a of TAG_PAIRS[caller]) out.push([caller, a]);
  return out;
}

describe('assist pairings', () => {
  it('gives every machine on the roster exactly two', () => {
    for (const id of IDS) {
      expect(TAG_PAIRS[id], `${id} has no assists`).toBeTruthy();
      expect(TAG_PAIRS[id].length, id).toBe(2);
    }
    expect(Object.keys(TAG_PAIRS).length).toBe(IDS.length);
  });

  it('never names a machine that is not on the roster', () => {
    for (const [caller, assist] of allCalls()) {
      expect(IDS, `${caller} calls unknown ${assist}`).toContain(assist);
    }
  });

  it('never lets a pilot call themselves, or the same pilot twice', () => {
    for (const caller of IDS) {
      const [a, b] = TAG_PAIRS[caller];
      expect(a, `${caller} calls itself`).not.toBe(caller);
      expect(b, `${caller} calls itself`).not.toBe(caller);
      expect(a, `${caller} lists the same assist twice`).not.toBe(b);
    }
  });

  it('produces sixteen distinct calls', () => {
    const calls = allCalls();
    expect(calls.length).toBe(16);
    expect(new Set(calls.map(([c, a]) => tagKey(c, a))).size).toBe(16);
  });

  it('answers canTag for exactly the legal pairs', () => {
    for (const caller of IDS) {
      for (const other of IDS) {
        expect(canTag(caller, other), `${caller} -> ${other}`).toBe(
          TAG_PAIRS[caller].includes(other),
        );
      }
    }
  });
});

describe('assist arrival dialogue', () => {
  it('covers all sixteen calls with no strays', () => {
    const wanted = new Set(allCalls().map(([c, a]) => tagKey(c, a)));
    for (const [caller, assist] of allCalls()) {
      expect(TAG_ARRIVALS[tagKey(caller, assist)], `missing ${caller} -> ${assist}`).toBeTruthy();
    }
    for (const key of Object.keys(TAG_ARRIVALS)) {
      expect(wanted.has(key), `stray arrival ${key}`).toBe(true);
    }
    expect(Object.keys(TAG_ARRIVALS).length).toBe(16);
  });

  it('gives every call five arrivals', () => {
    for (const [caller, assist] of allCalls()) {
      expect(TAG_ARRIVALS[tagKey(caller, assist)].length, `${caller} -> ${assist}`).toBe(5);
    }
  });

  it('makes every arrival a two-way exchange between exactly those two pilots', () => {
    for (const [caller, assist] of allCalls()) {
      for (const ex of TAG_ARRIVALS[tagKey(caller, assist)]) {
        expect(ex.length, `${caller} -> ${assist}`).toBeGreaterThanOrEqual(2);
        const speakers = new Set(ex.map((e) => e.who));
        // Both are present and nobody else got a word in.
        expect(speakers.size, `${caller} -> ${assist}`).toBe(2);
        for (const s of speakers) expect([caller, assist]).toContain(s);
      }
    }
  });

  it('keeps lines short enough to read in the corner box', () => {
    for (const key of Object.keys(TAG_ARRIVALS)) {
      for (const ex of TAG_ARRIVALS[key]) {
        for (const line of ex) {
          expect(line.line.length, `${key}: "${line.line}"`).toBeLessThanOrEqual(58);
          expect(line.line.trim()).toBe(line.line);
        }
      }
    }
  });

  it('does not repeat an arrival within a pairing', () => {
    for (const key of Object.keys(TAG_ARRIVALS)) {
      const seen = new Set<string>();
      for (const ex of TAG_ARRIVALS[key]) {
        const sig = ex.map((e) => `${e.who}:${e.line}`).join('|');
        expect(seen.has(sig), `${key} repeats an arrival`).toBe(false);
        seen.add(sig);
      }
    }
  });
});

describe('assist late dialogue', () => {
  it('covers all sixteen calls with no strays', () => {
    const wanted = new Set(allCalls().map(([c, a]) => tagKey(c, a)));
    for (const [caller, assist] of allCalls()) {
      expect(TAG_LATE[tagKey(caller, assist)], `missing late ${caller} -> ${assist}`).toBeTruthy();
    }
    for (const key of Object.keys(TAG_LATE)) {
      expect(wanted.has(key), `stray late ${key}`).toBe(true);
    }
  });

  it('gives every call two distinct late lines, short and trimmed', () => {
    for (const [caller, assist] of allCalls()) {
      const lines = TAG_LATE[tagKey(caller, assist)];
      expect(lines.length, `${caller} -> ${assist}`).toBe(2);
      expect(new Set(lines).size, `${caller} -> ${assist} repeats`).toBe(2);
      for (const l of lines) {
        expect(l.length, `${caller} -> ${assist}: "${l}"`).toBeLessThanOrEqual(58);
        expect(l.trim()).toBe(l);
      }
    }
  });
});

describe('assist lookup', () => {
  it('reaches all five arrivals across the roll range', () => {
    const seen = new Set<unknown>();
    for (const roll of [0.0, 0.2, 0.4, 0.6, 0.8]) seen.add(pickTagArrival('halcyon', 'vesper', roll));
    expect(seen.size).toBe(5);
  });

  it('stays in range at the extremes', () => {
    expect(pickTagArrival('halcyon', 'vesper', 1)).toBeTruthy();
    expect(pickTagArrival('halcyon', 'vesper', 0)).toBeTruthy();
    expect(pickTagLate('halcyon', 'vesper', 1)).toBeTruthy();
    expect(pickTagLate('halcyon', 'vesper', 0)).toBeTruthy();
  });

  it('returns null for a call that is not legal', () => {
    // CIRRUS is a real chassis and a real assist — just not one HALCYON knows.
    expect(pickTagArrival('halcyon', 'cirrus', 0.5)).toBeNull();
    expect(pickTagLate('halcyon', 'cirrus', 0.5)).toBeNull();
    expect(pickTagArrival('halcyon', 'nonexistent', 0.5)).toBeNull();
  });

  it('is directional — a call is not its own reverse', () => {
    // NOCTURNE can call HALCYON and HALCYON can call NOCTURNE, and the two
    // exchanges are different writing. Reversing the key must not collide.
    expect(tagKey('halcyon', 'nocturne')).not.toBe(tagKey('nocturne', 'halcyon'));
    expect(pickTagArrival('halcyon', 'nocturne', 0)).not.toBe(pickTagArrival('nocturne', 'halcyon', 0));
  });
});
