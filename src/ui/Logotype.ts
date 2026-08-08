// **Type-only.** Phaser's device probe touches `window` at import time, so a
// value import here drags a DOM into every node test that wants to check a
// letterform. Nothing in this file needs Phaser at runtime — `Phaser.Scene`
// appears only in a signature.
import type Phaser from 'phaser';

/**
 * The game's original letterforms, and the title wordmark built from them.
 *
 * Everything else in this project draws its type with the system monospace
 * stack. That is correct for a HUD readout and wrong for a title: a title is the
 * one piece of type that has to be *drawn*, and a stack that resolves to
 * Consolas on one machine and something else on the next is not a logo.
 *
 * **These are skeletons, not outlines.** Each glyph is a set of strokes between
 * points on a 100-unit cap box, and the renderer gives every stroke a weight, a
 * terminal and a slant. Two consequences, both deliberate:
 *
 * * A *style* is a parameter set, not a second alphabet. The directions below
 *   differ by numbers, so a change to the letter `R` is a change to every style
 *   of `R` rather than to one of them.
 * * Thick/thin contrast is per stroke. `stem` and `bar` carry different weights,
 *   which is the whole reason this reads as designed rather than as a grid font
 *   — a monoline alphabet has no voice.
 *
 * Coordinates run y-down from the cap line (0) to the baseline (100), which is
 * canvas order, so nothing has to be flipped at draw time.
 */

// ---------------------------------------------------------------- the skeleton

/** Which weight class a stroke carries. Resolved per style. */
type Weight = 'stem' | 'bar' | 'hair';

/** How a stroke ends. `point` converges to the centreline; `cut` chamfers. */
type Cap = 'flat' | 'cut' | 'point';

interface Stroke {
  a: readonly [number, number];
  b: readonly [number, number];
  w: Weight;
  /** Applies to both ends unless `capB` overrides the far one. */
  cap?: Cap;
  capB?: Cap;
  /**
   * Optional control point. Present means the centreline is a quadratic curve
   * rather than a segment, flattened into steps at draw time.
   *
   * **Curves are why the heraldic style can exist at all.** Straight skeletons
   * with constant weight produce engineering lettering and nothing else; the
   * flow in a drawn title comes from a centreline that bends and a weight that
   * swells along it.
   */
  c?: readonly [number, number];
  /**
   * Weight multipliers sampled evenly along the stroke and interpolated. `[1]`
   * or omitted is constant width; `[1, 0.35]` thins toward the far end;
   * `[0.4, 1, 0.4]` swells through the middle, which a two-value taper cannot
   * express and which is exactly the shape a bowl needs.
   */
  taper?: readonly number[];
}

interface Glyph {
  /** Advance width in cap units, before tracking. */
  adv: number;
  strokes: Stroke[];
}

const CAP = 100;

/**
 * The alphabet, such as it is: exactly the characters the title needs.
 *
 * Nine glyphs is not a font and is not claimed to be one. It is the seed of one
 * — the construction logic is uniform, so the remaining letters are more of the
 * same rather than a different job. Extending it is why `missingGlyphs` exists.
 */
const GLYPHS: Record<string, Glyph> = {
  // Stem left, two arms. The mid arm is short of the top one, which is what
  // stops an F reading as a broken E.
  F: {
    adv: 60,
    strokes: [
      { a: [10, 0], b: [10, 100], w: 'stem', cap: 'cut' },
      { a: [10, 7], b: [58, 7], w: 'bar', capB: 'cut' },
      { a: [10, 46], b: [46, 46], w: 'bar', capB: 'point' },
    ],
  },
  // Bowl closed with two straights and a diagonal shoulder rather than a curve:
  // a milled part has no arcs it does not need.
  R: {
    adv: 70,
    strokes: [
      { a: [10, 0], b: [10, 100], w: 'stem', cap: 'cut' },
      // One bowl, not four chords. Flattened to the old chord run when a style
      // turns curves off, which is the whole point of the control point.
      { a: [10, 7], b: [10, 47], w: 'bar', c: [74, 27], taper: [0.85, 1.2, 0.85] },
      { a: [38, 47], b: [68, 100], w: 'stem', c: [46, 72], capB: 'cut', taper: [1.15, 0.7] },
    ],
  },
  // Apex is cut flat, not pointed — a point at 74px turns into a pixel and a
  // flat apex is the older, heavier drawing anyway.
  A: {
    adv: 74,
    strokes: [
      { a: [6, 100], b: [30, 0], w: 'stem', cap: 'cut', taper: [1.2, 0.72] },
      { a: [44, 0], b: [68, 100], w: 'stem', cap: 'cut', taper: [0.72, 1.2] },
      { a: [30, 0], b: [44, 0], w: 'bar' },
      { a: [17, 70], b: [57, 70], w: 'hair' },
    ],
  },
  // The vertex stops above the baseline. Taking it all the way down makes the
  // middle of the word the darkest thing in it.
  M: {
    adv: 88,
    strokes: [
      { a: [10, 0], b: [10, 100], w: 'stem', cap: 'cut' },
      { a: [78, 0], b: [78, 100], w: 'stem', cap: 'cut' },
      { a: [10, 0], b: [44, 64], w: 'bar', taper: [1.25, 0.8] },
      { a: [78, 0], b: [44, 64], w: 'bar', taper: [1.25, 0.8] },
    ],
  },
  E: {
    adv: 60,
    strokes: [
      { a: [10, 0], b: [10, 100], w: 'stem', cap: 'cut' },
      { a: [10, 7], b: [58, 7], w: 'bar', capB: 'cut' },
      { a: [10, 46], b: [46, 46], w: 'bar', capB: 'point' },
      { a: [10, 93], b: [58, 93], w: 'bar', capB: 'cut' },
    ],
  },
  // Full stop: a small lozenge, not a square. A square dot between capitals
  // reads as a decimal point in a number.
  '.': {
    adv: 24,
    strokes: [{ a: [12, 84], b: [12, 94], w: 'bar', cap: 'point' }],
  },
  // Shoulder is three chords rather than an arc, matching R's bowl.
  '2': {
    adv: 68,
    strokes: [
      { a: [7, 25], b: [61, 27], w: 'bar', c: [34, -8], cap: 'cut', taper: [0.7, 1.2, 0.95] },
      { a: [61, 27], b: [9, 92], w: 'stem', c: [50, 60], taper: [1.15, 0.8] },
      { a: [8, 93], b: [62, 93], w: 'bar', cap: 'cut' },
    ],
  },
  // Open-topped four. The counter is a real triangle, so it survives being
  // scaled down further than a closed one would.
  '4': {
    adv: 72,
    strokes: [
      { a: [46, 0], b: [6, 68], w: 'bar', cap: 'cut' },
      { a: [6, 68], b: [68, 68], w: 'bar', cap: 'cut' },
      { a: [46, 0], b: [46, 100], w: 'stem', cap: 'cut' },
    ],
  },
  // Hexagonal zero: two verticals and four diagonals. Distinct from O by
  // construction rather than by a slash through it.
  '0': {
    adv: 76,
    strokes: [
      { a: [38, 4], b: [38, 96], w: 'stem', c: [-14, 50], taper: [0.42, 1.25, 0.42] },
      { a: [38, 4], b: [38, 96], w: 'stem', c: [90, 50], taper: [0.42, 1.25, 0.42] },
    ],
  },
  ' ': { adv: 34, strokes: [] },
};

// ---------------------------------------------------------------- the styles

export interface LogoStyle {
  /** Stroke weights in cap units. Contrast between these is the voice. */
  stem: number;
  bar: number;
  hair: number;
  /** Corner cut on a `cut` terminal, in cap units. */
  chamfer: number;
  /** Forward lean in degrees. Shear, not rotation — verticals stay parallel. */
  slant: number;
  /** Extra space between glyphs, in cap units. */
  tracking: number;
  /**
   * Horizontal scale, applied after everything else. 1 is the drawn proportion.
   *
   * **The largest single lever on a wordmark's identity**, and the one thing a
   * shared skeleton could not express until now: 0.5 and 1.5 are the same
   * letters and read as different games. Stems narrow with the glyph, which is
   * what a real condensed cut does — it is not a faithful optical compression,
   * but at title size the difference is not the point.
   */
  xScale?: number;
  /**
   * Whether a stroke's control point is honoured. `false` flattens every bowl
   * and shoulder to a chord, which is what makes the engineering styles read as
   * machined rather than drawn — from the same skeletons.
   */
  curves: boolean;
  /** How much of each stroke's declared taper to apply. 0 is constant width. */
  modulation: number;
  /** Fill ramp, top to bottom. Read as a lit metal face. */
  ramp: readonly (readonly [number, string])[];
  /** Hairline drawn around every glyph, or 0 for none. */
  edge: number;
  edgeColor: number;
  /** Ornament drawn behind the word. */
  ornament: 'rules' | 'none';
}

/**
 * Three directions, offered because this is a taste decision and taste
 * decisions are cheaper to make from pictures than from adjectives.
 */
export const LOGO_STYLES: Record<string, LogoStyle> = {
  /**
   * **MILLED** — the machine's own voice. Heavy stems, hairline crossbars,
   * every terminal chamfered like a part that came off a mill. Cold steel with
   * a warm rim from below, which is the stage's own lighting: cold void above,
   * warm haze under the deck.
   */
  milled: {
    stem: 15,
    bar: 9,
    hair: 5.5,
    chamfer: 5,
    slant: 0,
    tracking: 4,
    curves: false,
    modulation: 0,
    ramp: [
      [0.0, '#f4f9ff'],
      [0.34, '#a8bcd6'],
      [0.52, '#5d7392'],
      [0.72, '#8c9bb4'],
      [1.0, '#e8c48a'],
    ],
    edge: 1.6,
    edgeColor: 0x0a1018,
    ornament: 'rules',
  },
  /**
   * **HERALDIC** — the Final Fantasy read. Much higher contrast, pointed
   * terminals and a slight lean. The circular backdrop it used to carry is now
   * `TitleMark`'s, drawn once for the whole mark rather than once per word. This
   * is the one
   * that treats the title as a crest rather than as a nameplate.
   */
  heraldic: {
    stem: 18,
    bar: 9.5,
    hair: 4.4,
    chamfer: 7,
    slant: 4,
    tracking: 6,
    curves: true,
    modulation: 0.55,
    ramp: [
      [0.0, '#fff6e2'],
      [0.3, '#f0d49a'],
      [0.5, '#c9a05a'],
      [0.68, '#8d6a34'],
      [0.86, '#d8b478'],
      [1.0, '#fbeccb'],
    ],
    edge: 1.3,
    edgeColor: 0x140d05,
    ornament: 'none',
  },
  /**
   * **ORDNANCE** — painted on a hull. Nearly monoline, flat terminals, wide
   * tracking, no ornament. The plainest of the three and the only one that
   * would survive being stencilled onto a real part.
   */
  ordnance: {
    stem: 13,
    bar: 11,
    hair: 9,
    chamfer: 0,
    slant: 0,
    tracking: 9,
    curves: false,
    modulation: 0,
    ramp: [
      [0.0, '#dfe7f2'],
      [0.5, '#9fb0c6'],
      [1.0, '#6b7d95'],
    ],
    edge: 2.2,
    edgeColor: 0x0a1018,
    ornament: 'none',
  },
};

// ---------------------------------------------------------------- geometry

type Pt = [number, number];

/** Every character in `text` that has no glyph. Empty means drawable. */
export function missingGlyphs(text: string): string[] {
  const out: string[] = [];
  for (const ch of text.toUpperCase()) if (!GLYPHS[ch] && !out.includes(ch)) out.push(ch);
  return out;
}

/** Advance width of `text` in cap units, tracking included. */
export function measure(text: string, style: LogoStyle): number {
  let w = 0;
  const chars = [...text.toUpperCase()];
  chars.forEach((ch, i) => {
    const g = GLYPHS[ch];
    if (!g) return;
    w += g.adv + (i < chars.length - 1 ? style.tracking : 0);
  });
  return w * (style.xScale ?? 1);
}

/**
 * One stroke as a closed polygon.
 *
 * A stroke is a quad expanded either side of its centreline. Terminals modify
 * only the two vertices at that end, which is why `cut` and `point` can differ
 * per end without the middle of the stroke knowing about it.
 */
function strokePoly(s: Stroke, style: LogoStyle): Pt[] {
  const base = style[s.w];
  const capA = s.cap ?? 'flat';
  const capB = s.capB ?? s.cap ?? 'flat';
  // **Flattened, never discarded.** `curves: false` used to drop the control
  // point entirely, which collapsed both of `0`'s opposing arcs onto the same
  // vertical chord — one bar instead of a ring — and turned `2`'s shoulder into
  // a diagonal, so the number read `zz41`. Every engineering style shipped
  // broken and the test suite missed it, because a bar still encloses ink.
  // Flattening to a few chords keeps the letterform and still reads as machined.
  const curve = s.c ?? null;
  const segments = style.curves ? 20 : 3;

  /**
   * Taper at `t`, pulled toward constant width by the style.
   *
   * `modulation` 0 makes every glyph constant-weight without editing a single
   * skeleton, which is what lets the engineering styles and the drawn style
   * share one alphabet instead of forking it.
   */
  const taperAt = (t: number): number => {
    const ramp = s.taper;
    if (!ramp || ramp.length === 0 || style.modulation <= 0) return 1;
    const raw =
      ramp.length === 1
        ? ramp[0]
        : (() => {
            const x = t * (ramp.length - 1);
            const i = Math.min(Math.floor(x), ramp.length - 2);
            return ramp[i] + (ramp[i + 1] - ramp[i]) * (x - i);
          })();
    return 1 + (raw - 1) * style.modulation;
  };

  // A straight stroke needs two samples; a curved one needs enough that the
  // flattening does not show as facets at title size. A tapered straight stroke
  // needs them too, or the width steps instead of sliding.
  //
  // **A shaped cap needs at least one sample between the ends.** Both caps
  // consume their own end sample, so a straight stroke pointed at both ends has
  // nothing left to give the polygon width and collapses to a two-vertex line —
  // which is what kept dropping the full stop, twice. The floor of 2 is the
  // actual fix; closing the ends against an inboard sample only works if one
  // exists.
  const shapedCap = capA !== 'flat' || capB !== 'flat';
  const N = curve
    ? segments
    : (s.taper && s.taper.length > 2 && style.modulation > 0) ? 20 : shapedCap ? 2 : 1;

  const at = (t: number): { p: Pt; u: Pt; h: number } => {
    let p: Pt;
    let d: Pt;
    if (curve) {
      const [x0, y0] = s.a;
      const [cx, cy] = curve;
      const [x1, y1] = s.b;
      const m = 1 - t;
      p = [m * m * x0 + 2 * m * t * cx + t * t * x1, m * m * y0 + 2 * m * t * cy + t * t * y1];
      d = [2 * (m * (cx - x0) + t * (x1 - cx)), 2 * (m * (cy - y0) + t * (y1 - cy))];
    } else {
      p = [s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t];
      d = [s.b[0] - s.a[0], s.b[1] - s.a[1]];
    }
    const len = Math.hypot(d[0], d[1]) || 1;
    return { p, u: [d[0] / len, d[1] / len], h: (base * taperAt(t)) / 2 };
  };

  const samples = Array.from({ length: N + 1 }, (_, i) => at(i / N));
  const off = (i: number, sign: number): Pt => {
    const { p, u, h } = samples[i];
    return [p[0] - u[1] * h * sign, p[1] + u[0] * h * sign];
  };

  /**
   * Vertices that close one end, walking left side to right side.
   *
   * `dir` is +1 at the far end and -1 at the near end so a chamfer always cuts
   * back into the stroke. **A `point` cap returns a single vertex**, which is
   * what silently dropped the full stop: a stroke pointed at both ends produced
   * a two-vertex polygon that the draw loop skipped. The ends are now closed
   * against the *inboard* sample rather than against each other, so a stroke may
   * be pointed at both ends and still enclose area.
   */
  const capVerts = (i: number, cap: Cap, dir: number): Pt[] => {
    const { p, u, h } = samples[i];
    const c = Math.min(style.chamfer, h * 0.95);
    if (cap === 'point') return [[p[0] + u[0] * h * dir, p[1] + u[1] * h * dir]];
    if (cap === 'cut' && c > 0.2) {
      const nx = -u[1];
      const ny = u[0];
      return [
        [p[0] + nx * h - u[0] * c * dir, p[1] + ny * h - u[1] * c * dir],
        [p[0] + nx * (h - c), p[1] + ny * (h - c)],
        [p[0] - nx * (h - c), p[1] - ny * (h - c)],
        [p[0] - nx * h - u[0] * c * dir, p[1] - ny * h - u[1] * c * dir],
      ];
    }
    return [off(i, 1), off(i, -1)];
  };

  // Left side out, round the far end, right side back, round the near end.
  const lastInner = capB === 'flat' ? N : N - 1;
  const firstInner = capA === 'flat' ? 0 : 1;

  const poly: Pt[] = [];
  for (let i = firstInner; i <= lastInner; i++) poly.push(off(i, 1));
  poly.push(...(capB === 'flat' ? [] : capVerts(N, capB, +1)));
  for (let i = lastInner; i >= firstInner; i--) poly.push(off(i, -1));
  // Reversed: `capVerts` walks left to right, and the near end is reached on
  // the way back, so it has to close right to left or the polygon crosses
  // itself and the nonzero fill punches a hole where the ink should be.
  poly.push(...(capA === 'flat' ? [] : capVerts(0, capA, -1).reverse()));
  return poly;
}

/** Applies slant. Shear about the baseline, so the feet stay put. */
function shear(p: Pt, slant: number): Pt {
  if (!slant) return p;
  const k = Math.tan((slant * Math.PI) / 180);
  return [p[0] + (CAP - p[1]) * k, p[1]];
}

/**
 * Every polygon of `text`, in cap units, origin at the left cap corner.
 *
 * Separated from drawing so the same geometry can feed the fill, the edge and
 * the mask without being rebuilt three times — and so it can be measured in a
 * test without a scene.
 */
export function wordPolys(text: string, style: LogoStyle): Pt[][] {
  const out: Pt[][] = [];
  const xs = style.xScale ?? 1;
  let x = 0;
  for (const ch of text.toUpperCase()) {
    const g = GLYPHS[ch];
    if (!g) continue;
    for (const s of g.strokes) {
      // Shear first, then compress: shearing a compressed glyph would change
      // the slant angle as a side effect of the proportion.
      const poly = strokePoly(s, style).map(([px, py]) => {
        const [sx, sy] = shear([px + x, py], style.slant);
        return [sx * xs, sy] as Pt;
      });
      out.push(poly);
    }
    x += g.adv + style.tracking;
  }
  return out;
}

// ---------------------------------------------------------------- rendering

/**
 * Bloom radius under the letters, in **device pixels**.
 *
 * Canvas `shadowBlur` is not affected by the transformation matrix — it is
 * always device space. An earlier version divided this by the glyph scale to
 * "compensate" for the scaled context, which did the opposite: at cap 66 the
 * scale is 0.66, so a nominal 22 became a real 33.
 */
const BLOOM_PX = 18;

/**
 * Margin around the wordmark, for the edge stroke and the bloom.
 *
 * **Derived from the bloom rather than set beside it.** A Gaussian tail needs
 * roughly twice its radius to reach zero, and when this was a hand-picked 26
 * against a 33-pixel blur the glow was sliced flat by the texture bounds — the
 * word carried alpha 87 along its top and bottom edges and drew a visible
 * rectangle over the background. Computing it means the two cannot drift apart
 * again.
 */
const PAD = Math.ceil(BLOOM_PX * 2.4);

export interface LogoTexture {
  key: string;
  width: number;
  height: number;
}

/**
 * Draws the wordmark into a canvas texture once, at final size.
 *
 * A canvas rather than `Graphics` plus a geometry mask, for three reasons: the
 * ramp is a real `createLinearGradient` instead of banded strips, the result is
 * one `Image` at runtime rather than a mask evaluated every frame, and it
 * follows the `canvasTex` idiom `render/Textures.ts` already uses.
 *
 * **Stroke first, then fill.** Every stroke of every glyph goes into one path,
 * so stroking it would ink the internal seams where a bar meets a stem. Painting
 * the outline first and the gradient over it leaves only the outer half of that
 * stroke visible, which is the silhouette and nothing else. Filling a single
 * path also unions the overlaps for free under the nonzero winding rule.
 */
export function createLogoTexture(
  scene: Phaser.Scene,
  key: string,
  text: string,
  style: LogoStyle,
  capPx: number,
): LogoTexture {
  const polys = wordPolys(text, style);
  const scale = capPx / CAP;

  // Real ink extent, not the advance box: the slant pushes past both, and a
  // texture sized to the advance would clip the lean off the F.
  let minX = Infinity;
  let maxX = -Infinity;
  for (const p of polys) {
    for (const [x] of p) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    maxX = 0;
  }

  const w = Math.ceil((maxX - minX) * scale) + PAD * 2;
  const h = Math.ceil(CAP * scale) + PAD * 2;

  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return { key, width: w, height: h };
  const ctx = tex.getContext();

  const ox = PAD - minX * scale;
  const oy = PAD;

  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);

  if (style.ornament !== 'none') {
    drawOrnament(ctx, style, minX, maxX);
  }

  const path = new Path2D();
  for (const poly of polys) {
    if (poly.length < 3) continue;
    path.moveTo(poly[0][0], poly[0][1]);
    for (let i = 1; i < poly.length; i++) path.lineTo(poly[i][0], poly[i][1]);
    path.closePath();
  }

  // Bloom under the letters. `shadowBlur` is not clipped to the caster, which
  // is exactly what PAD is for.
  ctx.save();
  ctx.shadowColor = 'rgba(150,196,255,0.5)';
  // Device pixels, and deliberately not divided by `scale` — see BLOOM_PX.
  ctx.shadowBlur = BLOOM_PX;
  ctx.fillStyle = 'rgba(0,0,0,1)';
  ctx.fill(path);
  ctx.restore();

  if (style.edge > 0) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = style.edge * 2;
    ctx.strokeStyle = hex(style.edgeColor);
    ctx.stroke(path);
  }

  const grad = ctx.createLinearGradient(0, 0, 0, CAP);
  for (const [stop, colour] of style.ramp) grad.addColorStop(stop, colour);
  ctx.fillStyle = grad;
  ctx.fill(path);

  ctx.restore();
  tex.refresh();
  return { key, width: w, height: h };
}

function hex(v: number): string {
  return `#${v.toString(16).padStart(6, '0')}`;
}

/**
 * Per-word chrome drawn into the same texture as the letters.
 *
 * **The circular ornament used to live here and no longer does.** It was a
 * gantry rose window drawn as an engineering elevation, and baking it into
 * `createLogoTexture` meant it was drawn once per wordmark — so the title
 * screen carried two of them, one behind the name and one behind the number,
 * which is not what a single backdrop is. It is now one element owned by
 * `TitleMark`, where it is also replaceable by real art. What is left here is
 * only chrome that genuinely belongs to one word.
 */
function drawOrnament(
  ctx: CanvasRenderingContext2D,
  style: LogoStyle,
  minX: number,
  maxX: number,
): void {
  if (style.ornament !== 'rules') return;
  ctx.save();
  ctx.lineCap = 'butt';

  // Twin rules running the full width. Reads as a datum line on a drawing.
  ctx.strokeStyle = 'rgba(150,178,214,0.34)';
  ctx.lineWidth = 1.6;
  for (const y of [CAP * 0.06, CAP * 0.97]) {
    ctx.beginPath();
    ctx.moveTo(minX - 16, y);
    ctx.lineTo(maxX + 16, y);
    ctx.stroke();
  }
  // Corner ticks, turned inward.
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = 'rgba(232,196,138,0.55)';
  for (const [x, dir] of [
    [minX - 16, 1],
    [maxX + 16, -1],
  ] as const) {
    for (const y of [CAP * 0.06, CAP * 0.97]) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 13 * dir, y);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(x, CAP * 0.06);
    ctx.lineTo(x, CAP * 0.97);
    ctx.stroke();
  }
  ctx.restore();
}


/**
 * Splits the title into its name and its number.
 *
 * Reads the split off the string rather than hard-coding two literals, so the
 * mark still composes if the title is reconfigured — which `CLAUDE.md` asks for
 * explicitly. Falls back to putting everything on the first line, which is ugly
 * but is never blank.
 *
 * Lives here rather than beside the thing that uses it because it is pure
 * string work, and `TitleMark` genuinely needs Phaser at runtime — a test that
 * wanted this function would otherwise have to load a renderer to get it.
 */
export function splitTitle(title: string): [string, string] {
  const i = title.search(/\s+\d/);
  if (i < 0) return [title, ''];
  return [title.slice(0, i).trim(), title.slice(i).trim()];
}
