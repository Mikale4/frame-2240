import { describe, expect, it } from 'vitest';
import { ARCHIVE_SECTIONS, BATTLEFIELD_ARCHIVE } from '../data/archive';
import { session } from '../core/Session';

/**
 * Format guards for the Archive's prose.
 *
 * The bodies are built by concatenating string fragments across source lines,
 * which is readable in the editor and silently produces two classes of defect
 * that no other test would catch: a fragment ending without a space jams two
 * words together, and a fragment ending with one where the next begins with one
 * leaves a double space. Neither breaks the build, both are visible on screen,
 * and both survive review because the seam is invisible in the diff.
 *
 * These exist because the Archive's prose is expected to be revised by hand —
 * possibly repeatedly, possibly pasted back in from elsewhere — and a rewrite is
 * exactly when a seam gets broken.
 */

const everyEntry = ARCHIVE_SECTIONS.flatMap((s) => s.entries.map((e) => ({ section: s.id, e })));

describe('archive prose format', () => {
  it('has no doubled spaces in any body paragraph', () => {
    const bad: string[] = [];
    for (const { e } of everyEntry) {
      e.body.forEach((p, i) => {
        const m = p.match(/\S+ {2,}\S+/g);
        if (m) bad.push(`${e.id} ¶${i + 1}: ${m.join(' | ')}`);
      });
    }
    expect(bad).toEqual([]);
  });

  it('has no doubled spaces in a title, subtitle or tagline', () => {
    const bad: string[] = [];
    for (const { e } of everyEntry) {
      for (const [k, v] of [
        ['title', e.title],
        ['subtitle', e.subtitle],
        ['tagline', e.tagline],
      ] as const) {
        if (/\S {2,}\S/.test(v)) bad.push(`${e.id}.${k}: ${JSON.stringify(v)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('never leaves leading or trailing whitespace on a field', () => {
    for (const { e } of everyEntry) {
      for (const v of [e.title, e.subtitle, e.tagline, ...e.body]) {
        expect(v, e.id).toBe(v.trim());
      }
    }
  });

  it('has no empty paragraphs and no entry without a body', () => {
    for (const { e } of everyEntry) {
      expect(e.body.length, e.id).toBeGreaterThan(0);
      for (const p of e.body) expect(p.length, e.id).toBeGreaterThan(20);
    }
  });

  it('gives every entry a unique id within its section', () => {
    for (const s of ARCHIVE_SECTIONS) {
      const ids = s.entries.map((e) => e.id);
      expect(new Set(ids).size, s.id).toBe(ids.length);
    }
  });

  it('gives the arena being fought over a battlefield entry', () => {
    // BATTLEFIELD_ARCHIVE's ids are meant to be arena ids, so that shipping a
    // stage without its page is a failure rather than a silence. Nothing else
    // couples the two, and the comment claiming they are coupled is only true
    // while this runs. There is one arena today; this reads it off the session
    // rather than naming it, so a second one is caught the same way.
    const ids = BATTLEFIELD_ARCHIVE.map((e) => e.id);
    expect(ids, 'arena has no BATTLEFIELDS entry').toContain(session.arena);
  });

  it('uses a spaced em dash rather than a hyphen standing in for one', () => {
    // ' - ' between words is a fragment seam that lost its dash, or a typist
    // reaching for an em dash and not finding one. Either way it is not the
    // house punctuation, which is ' — '.
    const bad: string[] = [];
    for (const { e } of everyEntry) {
      e.body.forEach((p, i) => {
        if (/\w - \w/.test(p)) bad.push(`${e.id} ¶${i + 1}`);
      });
    }
    expect(bad).toEqual([]);
  });
});
