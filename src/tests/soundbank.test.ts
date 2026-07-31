import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { CUES, cueFiles, totalFiles } from '../audio/SoundBank';

/**
 * The sound bank is a manifest that has to agree with what is actually on disk.
 * Nothing at runtime enforces that: a cue named wrong just falls back to its
 * synthesised version, silently, and the recorded sound is never heard. These
 * tests are the thing that catches it.
 */
const AUDIO_DIR = path.resolve(process.cwd(), 'assets', 'audio');

describe('sound bank manifest', () => {
  it('has no duplicate cue names', () => {
    const names = CUES.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('names every cue in lower_snake_case, matching the cue sheet', () => {
    for (const cue of CUES) expect(cue.name).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it('suffixes multi-take cues and leaves single-take cues bare', () => {
    const single = CUES.find((c) => c.variations === 1);
    const multi = CUES.find((c) => c.variations > 1);
    expect(single && cueFiles(single)).toEqual([`${single?.name}.mp3`]);
    expect(multi && cueFiles(multi)?.[0]).toBe(`${multi?.name}_1.mp3`);
    expect(multi && cueFiles(multi)?.length).toBe(multi?.variations);
  });

  it('declares a positive variation count for every cue', () => {
    for (const cue of CUES) expect(cue.variations).toBeGreaterThan(0);
  });

  it('marks exactly the two seamless beds as loops', () => {
    const loops = CUES.filter((c) => c.loop).map((c) => c.name).sort();
    expect(loops).toEqual(['drone_hover', 'thruster_loop']);
  });

  it('keeps every gain in a sane range', () => {
    for (const cue of CUES) {
      if (cue.gain === undefined) continue;
      expect(cue.gain).toBeGreaterThan(0);
      expect(cue.gain).toBeLessThanOrEqual(1);
    }
  });

  it('counts the same number of files the loader will request', () => {
    const listed = CUES.reduce((n, c) => n + cueFiles(c).length, 0);
    expect(totalFiles()).toBe(listed);
  });
});

// Skipped automatically when assets/audio is absent, so a bare checkout without
// the generated sound set still has a green suite.
const haveAudio = fs.existsSync(AUDIO_DIR);

describe.skipIf(!haveAudio)('sound bank against assets/audio', () => {
  /**
   * Underscore-prefixed files are review aids, not cues — audition candidates
   * awaiting a verdict, and the audition page itself. `vite.config.ts` strips
   * the same prefix from `dist/audio`, so both places agree on what ships.
   */
  const onDisk = (): string[] =>
    fs
      .readdirSync(AUDIO_DIR)
      .filter((f: string) => f.toLowerCase().endsWith('.mp3') && !f.startsWith('_'))
      .sort();

  it('finds every file the manifest declares', () => {
    const present = onDisk();
    const expected = CUES.flatMap(cueFiles).sort();
    const missing = expected.filter((f: string) => !present.includes(f));
    expect(missing).toEqual([]);
  });

  it('leaves no audio file unclaimed by a cue', () => {
    const expected = new Set(CUES.flatMap(cueFiles));
    const orphans = onDisk().filter((f: string) => !expected.has(f));
    expect(orphans).toEqual([]);
  });

  it('has no empty or truncated files', () => {
    const tiny = onDisk().filter((f: string) => fs.statSync(path.join(AUDIO_DIR, f)).size < 4000);
    expect(tiny).toEqual([]);
  });
});
