import { describe, expect, it } from 'vitest';
import { BANTER, BANTER_PRIORITY, pickBanter, type BanterTrigger } from '../data/banter';
import { ROSTER } from '../data/mechs';

/**
 * The banter table is pure data, and the thing most likely to go wrong with it
 * is a gap — one pilot missing a trigger, so a machine goes silent at exactly
 * the moment the others speak. That is invisible in play until someone happens
 * to pick that mech, so it is worth a test rather than a proofread.
 */

const TRIGGERS = Object.keys(BANTER_PRIORITY) as BanterTrigger[];

describe('pilot banter — coverage', () => {
  it('has an entry for every mech in the roster', () => {
    for (const m of ROSTER) {
      expect(BANTER[m.id], `no banter for ${m.id}`).toBeTruthy();
    }
  });

  it('carries no lines for a mech that does not exist', () => {
    const ids = new Set(ROSTER.map((m) => m.id));
    for (const id of Object.keys(BANTER)) {
      expect(ids.has(id), `banter for unknown mech ${id}`).toBe(true);
    }
  });

  /**
   * Most triggers can happen to anyone. `lastStand` cannot: it fires only on a
   * chassis that declares `MechDef.lastStand`, which is HALCYON alone.
   *
   * So the rule is **exactly the pilots who can reach it**, in both directions.
   * Blanket coverage would force seven pilots to carry lines that can never
   * play — dead content, and the same landmine D74 describes. Requiring only
   * *some* pilot to have them would let the one who can trigger it ship silent.
   */
  it('covers every universal trigger for every pilot', () => {
    for (const m of ROSTER) {
      for (const t of TRIGGERS) {
        if (t === 'lastStand') continue;
        const lines = BANTER[m.id][t];
        expect(lines, `${m.id} has nothing for ${t}`).toBeTruthy();
        expect(lines!.length, `${m.id}.${t} is empty`).toBeGreaterThan(0);
      }
    }
  });

  it('gives lastStand lines to exactly the pilots who can trigger it', () => {
    for (const m of ROSTER) {
      const lines = BANTER[m.id].lastStand;
      if (m.lastStand) {
        expect(lines, `${m.id} can trigger LAST STAND and says nothing`).toBeTruthy();
        expect(lines!.length).toBeGreaterThan(0);
      } else {
        expect(lines, `${m.id} cannot trigger LAST STAND but carries lines`).toBeUndefined();
      }
    }
  });

  it('keeps every line short enough to read mid-fight', () => {
    for (const m of ROSTER) {
      for (const t of TRIGGERS) {
        for (const line of BANTER[m.id][t] ?? []) {
          expect(line.length, `${m.id}.${t}: "${line}"`).toBeLessThanOrEqual(46);
          expect(line.trim()).toBe(line);
          expect(line.length).toBeGreaterThan(2);
        }
      }
    }
  });

  it('gives both saturation flavours five lines', () => {
    // The cutscene shows one every single time a burst opens, so a short list
    // becomes a catchphrase within one session.
    for (const m of ROSTER) {
      expect(BANTER[m.id].saturation!.length, m.id).toBe(5);
      expect(BANTER[m.id].saturationEarly!.length, m.id).toBe(5);
    }
  });

  it('keeps the desperate lines distinct from the confident ones', () => {
    for (const m of ROSTER) {
      const calm = new Set(BANTER[m.id].saturation!);
      for (const line of BANTER[m.id].saturationEarly!) {
        expect(calm.has(line), `${m.id} reuses "${line}"`).toBe(false);
      }
    }
  });

  it('gives the frequent triggers more than one take', () => {
    // firstHit and combo fire many times a session; a single line becomes a
    // catchphrase within one match.
    for (const m of ROSTER) {
      expect(BANTER[m.id].firstHit!.length, m.id).toBeGreaterThan(1);
      expect(BANTER[m.id].combo!.length, m.id).toBeGreaterThan(1);
    }
  });

  it('gives each pilot their own words', () => {
    // Nothing should be copy-pasted between pilots: the whole point is eight
    // voices, and a shared line is the fastest way to lose one.
    const seen = new Map<string, string>();
    for (const m of ROSTER) {
      for (const t of TRIGGERS) {
        for (const line of BANTER[m.id][t] ?? []) {
          const key = line.toLowerCase();
          const owner = seen.get(key);
          expect(owner, `"${line}" used by both ${owner} and ${m.id}`).toBeUndefined();
          seen.set(key, m.id);
        }
      }
    }
  });
});

describe('pilot banter — selection', () => {
  it('returns a line the pilot actually owns', () => {
    for (const m of ROSTER) {
      for (const t of TRIGGERS) {
        const owned = BANTER[m.id][t];
        for (const roll of [0, 0.25, 0.5, 0.99]) {
          const line = pickBanter(m.id, t, roll);
          // A pilot with no lines for a trigger they can never reach returns
          // null, and that is correct — `lastStand` is HALCYON's alone.
          if (!owned) {
            expect(line, `${m.id}.${t} should be silent`).toBeNull();
            continue;
          }
          expect(line).not.toBeNull();
          expect(owned).toContain(line!);
        }
      }
    }
  });

  it('is a pure function of the roll, so a replay says the same things', () => {
    for (const roll of [0, 0.31, 0.77, 1]) {
      expect(pickBanter('halcyon', 'combo', roll)).toBe(pickBanter('halcyon', 'combo', roll));
    }
  });

  it('stays in range at the extremes of the roll', () => {
    // A roll of exactly 1 must not index past the end.
    expect(pickBanter('halcyon', 'combo', 1)).toBeTruthy();
    expect(pickBanter('halcyon', 'combo', 0)).toBeTruthy();
    expect(pickBanter('halcyon', 'combo', -0.5)).toBeTruthy();
  });

  it('returns null rather than throwing for an unknown mech or trigger', () => {
    expect(pickBanter('nonexistent', 'intro', 0.5)).toBeNull();
  });
});

describe('pilot banter — priority', () => {
  it('lets a KO interrupt anything else', () => {
    for (const t of TRIGGERS) {
      if (t === 'win' || t === 'lose') continue;
      expect(BANTER_PRIORITY.win).toBeGreaterThan(BANTER_PRIORITY[t]);
      expect(BANTER_PRIORITY.lose).toBeGreaterThan(BANTER_PRIORITY[t]);
    }
  });

  it('ranks the noisy triggers below the rare ones', () => {
    expect(BANTER_PRIORITY.combo).toBeLessThan(BANTER_PRIORITY.burnout);
    expect(BANTER_PRIORITY.firstHit).toBeLessThan(BANTER_PRIORITY.droneLost);
    expect(BANTER_PRIORITY.intro).toBeLessThan(BANTER_PRIORITY.combo);
  });
});
