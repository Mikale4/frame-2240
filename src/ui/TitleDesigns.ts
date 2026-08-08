import Phaser from 'phaser';
import { createLogoTexture, measure, type LogoStyle } from './Logotype';

/**
 * Candidate wordmark lockups, built from the shared skeletons.
 *
 * A *style* controls how a letter is drawn; a **lockup** controls how the two
 * halves of the title relate to each other — and that turns out to matter as
 * much as the letterforms. `F.R.A.M.E.` and `2240` do not have to sit on one
 * line, and every design here answers that question differently: ruled apart,
 * boxed together, stacked into a column, or justified into a solid block.
 *
 * These exist to be compared on the real screen and then thrown away. Three of
 * the four are expected to lose.
 */

export type TitleDesignId = 'instrument' | 'plate' | 'column' | 'block';

export const TITLE_DESIGN_IDS: readonly TitleDesignId[] = [
  'instrument',
  'plate',
  'column',
  'block',
];

const PALE: LogoStyle['ramp'] = [
  [0, '#f6faff'],
  [0.55, '#dce7f6'],
  [1, '#b9c8de'],
];

const WHITE: LogoStyle['ramp'] = [
  [0, '#ffffff'],
  [1, '#e8eef8'],
];

const shared = {
  slant: 0,
  ornament: 'none' as const,
  edgeColor: 0x0a0d16,
  curves: false,
  modulation: 0,
};

/**
 * **INSTRUMENT** — hairline, wide, a rule between the two halves.
 *
 * Reads as an instrument panel or a spec sheet rather than a logo. Only viable
 * on a dark field: at this weight it has no presence against a light one, which
 * is why the backdrop and the mark had to be decided together.
 */
const INSTRUMENT: LogoStyle = {
  ...shared,
  stem: 5.5,
  bar: 4.2,
  hair: 3.4,
  chamfer: 2,
  tracking: 15,
  curves: true,
  modulation: 0.2,
  ramp: PALE,
  edge: 0,
};

/** **PLATE** — bold and boxed. The border makes the mark literally a frame. */
const PLATE: LogoStyle = {
  ...shared,
  stem: 19,
  bar: 13.5,
  hair: 9,
  chamfer: 2,
  tracking: 4,
  xScale: 0.92,
  ramp: WHITE,
  edge: 0,
};

/** **COLUMN** — extreme condensation, stacked. The narrowest thing on the sheet. */
const COLUMN: LogoStyle = {
  ...shared,
  stem: 27,
  bar: 19,
  hair: 13,
  chamfer: 2,
  tracking: 3,
  xScale: 0.46,
  ramp: WHITE,
  edge: 0,
};

/** **BLOCK** — massive, both lines justified to one width, forming a slab. */
const BLOCK: LogoStyle = {
  ...shared,
  stem: 30,
  bar: 21,
  hair: 15,
  chamfer: 3,
  tracking: 2,
  ramp: WHITE,
  edge: 0,
};

const WORD = 'F.R.A.M.E.';
const NUM = '2240';

/** One image, origin-centred, from a freshly built texture. */
function mark(
  scene: Phaser.Scene,
  key: string,
  text: string,
  style: LogoStyle,
  capPx: number,
  x: number,
  y: number,
): Phaser.GameObjects.Image {
  const t = createLogoTexture(scene, key, text, style, capPx);
  return scene.add.image(x, y, t.key).setOrigin(0.5, 0.5);
}

/**
 * Builds one candidate into `out`, centred on the container origin.
 *
 * Returns nothing: every design manages its own internal spacing, because the
 * relationship between the parts *is* the design and factoring it out would
 * leave four identical calls and no lockups.
 */
export function buildTitleDesign(
  scene: Phaser.Scene,
  id: TitleDesignId,
  out: Phaser.GameObjects.Container,
): void {
  if (id === 'instrument') {
    const cap = 40;
    const word = mark(scene, 'td_i_w', WORD, INSTRUMENT, cap, 0, -34);
    const num = mark(scene, 'td_i_n', NUM, { ...INSTRUMENT, tracking: 22 }, cap * 0.92, 0, 34);
    // The rule spans the wider of the two, which is what makes the pair read as
    // one object rather than as two lines that happen to be near each other.
    const w = Math.max(word.displayWidth, num.displayWidth) * 0.86;
    const g = scene.add.graphics();
    g.lineStyle(1.4, 0xd7e3f4, 0.85);
    g.lineBetween(-w / 2, 0, w / 2, 0);
    // A single dot on the rule, the same device the full stops use.
    g.fillStyle(0xd7e3f4, 0.9);
    g.fillCircle(0, 0, 2.2);
    out.add([word, num, g]);
    return;
  }

  if (id === 'plate') {
    const cap = 52;
    const word = mark(scene, 'td_p_w', WORD, PLATE, cap, 0, -26);
    const num = mark(scene, 'td_p_n', NUM, { ...PLATE, xScale: 0.8, tracking: 8 }, cap * 0.5, 0, 34);
    const halfW = Math.max(word.displayWidth, num.displayWidth) / 2 + 26;
    const g = scene.add.graphics();
    g.lineStyle(3, 0xffffff, 1);
    g.strokeRect(-halfW, -64, halfW * 2, 128);
    g.lineStyle(2, 0xffffff, 0.9);
    g.lineBetween(-halfW, 12, halfW, 12);
    // Dots flanking the number, inside the bar.
    g.fillStyle(0xffffff, 1);
    g.fillCircle(-halfW + 14, 34, 3);
    g.fillCircle(halfW - 14, 34, 3);
    out.add([g, word, num]);
    return;
  }

  if (id === 'column') {
    const cap = 74;
    const word = mark(scene, 'td_c_w', WORD, COLUMN, cap, 0, -40);
    const num = mark(scene, 'td_c_n', NUM, { ...COLUMN, xScale: 0.62 }, cap, 0, 44);
    out.add([word, num]);
    return;
  }

  // BLOCK: justify both lines to a single width so the pair reads as one slab.
  // Solved rather than eyeballed — `measure` gives each line's natural width in
  // cap units, and the ratio between them is the horizontal scale that makes
  // them equal.
  const cap = 56;
  const target = 430;
  const wUnits = measure(WORD, BLOCK);
  const nUnits = measure(NUM, BLOCK);
  const wStyle: LogoStyle = { ...BLOCK, xScale: target / (wUnits * (cap / 100)) };
  const nStyle: LogoStyle = { ...BLOCK, xScale: target / (nUnits * (cap / 100)) };
  const word = mark(scene, 'td_b_w', WORD, wStyle, cap, 0, -30);
  const num = mark(scene, 'td_b_n', NUM, nStyle, cap, 0, 30);
  out.add([word, num]);
}
