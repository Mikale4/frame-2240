import { describe, expect, it } from 'vitest';
import { GAME_TITLE } from '../core/GameConfig';
import { LOGO_STYLES, measure, missingGlyphs, splitTitle, wordPolys } from '../ui/Logotype';

/**
 * Guards for the title's letterforms.
 *
 * **The full stop disappeared twice.** Both terminals of a `point` stroke
 * collapse to a single vertex, so the one glyph that is a single such stroke
 * produced a two-vertex polygon, which the draw loop skipped as degenerate. The
 * word rendered as `FRAME 2240` and looked entirely deliberate — nothing errored,
 * nothing logged, and the second "fix" did not fix it either. A glyph that
 * silently renders as nothing is invisible to every other kind of test, which is
 * exactly why this file exists.
 */

const STYLES = Object.entries(LOGO_STYLES);

/** Shoelace area, unsigned. Zero means the polygon encloses nothing. */
function area(poly: [number, number][]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

describe('logotype', () => {
  it('has a glyph for every character in the title', () => {
    expect(missingGlyphs(GAME_TITLE)).toEqual([]);
  });

  it.each(STYLES)('draws every title character as real ink in %s', (_name, style) => {
    // Per character rather than for the whole word: a word-level area check
    // passes comfortably while one glyph contributes nothing, which is the
    // failure that actually happened.
    for (const ch of GAME_TITLE) {
      if (ch === ' ') continue;
      const polys = wordPolys(ch, style);
      const drawable = polys.filter((p) => p.length >= 3);
      expect(drawable.length, `${ch} produced no drawable polygon`).toBeGreaterThan(0);
      const total = drawable.reduce((sum, p) => sum + area(p), 0);
      expect(total, `${ch} encloses no area`).toBeGreaterThan(1);
    }
  });

  it.each(STYLES)('gives the full stop a stroke of its own in %s', (_name, style) => {
    // Named separately because it is the glyph that failed and the only one
    // built from a single stroke pointed at both ends.
    const polys = wordPolys('.', style).filter((p) => p.length >= 3);
    expect(polys.length).toBe(1);
    expect(area(polys[0])).toBeGreaterThan(4);
  });

  it.each(STYLES)('advances monotonically across the word in %s', (_name, style) => {
    expect(measure('F', style)).toBeGreaterThan(0);
    expect(measure('F.', style)).toBeGreaterThan(measure('F', style));
  });

  it('splits the title into a name and a number', () => {
    expect(splitTitle('F.R.A.M.E. 2240')).toEqual(['F.R.A.M.E.', '2240']);
    // Degrades rather than throwing, since the title is meant to be configurable.
    expect(splitTitle('NONUMBER')).toEqual(['NONUMBER', '']);
  });
});
