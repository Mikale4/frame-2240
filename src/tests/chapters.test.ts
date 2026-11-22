import { describe, expect, it } from 'vitest';
import { CHAPTERS } from '../campaign/chapters';
import { Coroutine, type Script, type Waitable } from '../campaign/Script';
import type { ChapterDef, StoryApi } from '../campaign/Story';
import { buildReachWalk, regionById } from '../campaign/Regions';
import { PILOT_IDS, isPilotId } from '../account/Accounts';

/**
 * Dry-runs every chapter the way the owner's FF7 game validated its map
 * scripts (`tools/validate.js`): a mock story API answers every question with
 * its first option, loses the first sanctioned flight and wins the second, and
 * the "player" talks to everyone and uses everything until the chapter
 * completes. A chapter that cannot be finished, names a speaker who is not in
 * it, or puts someone where nobody can stand, fails here instead of in play.
 */

const done = <T,>(result?: T): Waitable<T> => ({ done: true, result });

interface Run {
  completed: boolean;
  speakers: Set<string>;
  objectives: string[];
  unlocked: string[];
  battles: string[];
  errors: unknown[];
}

function play(ch: ChapterDef): Run {
  const flags = new Set<string>();
  const run: Run = { completed: false, speakers: new Set(), objectives: [ch.objective], unlocked: [], battles: [], errors: [] };
  let fights = 0;
  const api: StoryApi = {
    me: ch.pilot,
    say: (who, text) => {
      run.speakers.add(who);
      expect(text.length, `${ch.id}: empty line`).toBeGreaterThan(0);
      return done();
    },
    ask: (who, _text, options) => {
      run.speakers.add(who);
      expect(options.length).toBeGreaterThan(1);
      return done(0);
    },
    caption: () => done(),
    objective: (t) => {
      run.objectives.push(t);
    },
    walk: () => done(),
    face: () => {},
    shot: (a, b) => {
      run.speakers.add(a);
      if (b) run.speakers.add(b);
    },
    release: () => {},
    fade: () => done(),
    wait: () => done(),
    show: () => {},
    battle: (o) => {
      run.battles.push(o.foe);
      return done(fights++ === 0 ? 'lose' : 'win');
    },
    flag: (n) => flags.has(n),
    set: (n, on = true) => {
      if (on) flags.add(n);
      else flags.delete(n);
    },
    unlock: (p) => {
      run.unlocked.push(p);
    },
    complete: () => {
      run.completed = true;
    },
  };
  const exec = (gen: Script): void => {
    const c = new Coroutine(gen);
    for (let i = 0; i < 100000 && c.tick(); i++);
    if (c.error) run.errors.push(c.error);
  };
  if (ch.intro) exec(ch.intro(api));
  const fired = new Set<string>();
  for (let round = 0; round < 12 && !run.completed; round++) {
    for (const id of Object.keys(ch.talk)) exec(ch.talk[id](api));
    for (const a of ch.areas ?? []) {
      if (a.when && !flags.has(a.when)) continue;
      if (!a.prompt && !a.repeat && fired.has(a.id)) continue;
      fired.add(a.id);
      exec(a.run(api));
      if (run.completed) break;
    }
  }
  return run;
}

describe('campaign chapters', () => {
  it('every chapter can be played to the end', () => {
    expect(CHAPTERS.length).toBeGreaterThan(0);
    for (const ch of CHAPTERS) {
      const r = play(ch);
      expect(r.errors, ch.id).toEqual([]);
      expect(r.completed, `${ch.id} never completes`).toBe(true);
      expect(r.objectives.length).toBeGreaterThan(1);
    }
  });

  it('every speaker is someone in the chapter', () => {
    for (const ch of CHAPTERS) {
      const ids = new Set(['me', ...ch.actors.map((a) => a.id)]);
      for (const who of play(ch).speakers) expect(ids.has(who), `${ch.id}: unknown speaker ${who}`).toBe(true);
    }
  });

  it('features and unlocks name real pilots, and fights are against them', () => {
    for (const ch of CHAPTERS) {
      const r = play(ch);
      for (const p of [...(ch.features ?? []), ...r.unlocked, ...r.battles]) expect(isPilotId(p), `${ch.id}: ${p}`).toBe(true);
      expect(PILOT_IDS).toContain(ch.pilot);
      expect(r.battles.includes(ch.pilot), `${ch.id}: a pilot cannot fight themselves`).toBe(false);
    }
  });

  it('every pilot has a Chapter 1 to start with', () => {
    for (const id of PILOT_IDS) expect(CHAPTERS.some((c) => c.pilot === id && c.number === 1), id).toBe(true);
  });

  it("each Chapter 1 unlocks a different pilot, so all eight can be earned", () => {
    const earned = new Set<string>();
    for (const id of PILOT_IDS) {
      const ch = CHAPTERS.find((c) => c.pilot === id && c.number === 1)!;
      const r = play(ch);
      const got = [...new Set([...(ch.features ?? []), ...r.unlocked])];
      expect(got.length, ch.id).toBe(1);
      expect(got[0]).not.toBe(id);
      earned.add(got[0]);
    }
    expect(earned.size).toBe(PILOT_IDS.length);
  });

  it('every region spot for people is on walkable deck', () => {
    const w = buildReachWalk();
    for (const id of PILOT_IDS) {
      const reg = regionById(CHAPTERS.find((c) => c.pilot === id)!.region)!;
      for (const [role, s] of Object.entries(reg.people)) {
        expect(w.standAt(reg.cx + s.x, reg.cz + s.z, reg.y, 0.3), `${reg.id}.${role}`).not.toBeNull();
      }
    }
  });

  it('everyone stands somewhere a pilot can stand', () => {
    const w = buildReachWalk();
    for (const ch of CHAPTERS) {
      const reg = regionById(ch.region);
      expect(reg, ch.id).toBeTruthy();
      const at = (x: number, z: number) => w.standAt(reg!.cx + x, reg!.cz + z, reg!.y, 0.3);
      expect(at(ch.start.x, ch.start.z), `${ch.id}: start`).not.toBeNull();
      for (const a of ch.actors) expect(at(a.x, a.z), `${ch.id}: ${a.id}`).not.toBeNull();
    }
  });
});
