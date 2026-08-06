import Phaser from 'phaser';
import { GAME_TITLE } from '../core/GameConfig';
import { createLogoTexture, splitTitle, type LogoStyle } from './Logotype';

/**
 * The title mark: two wordmark blocks on a shared diagonal, over a turning
 * gear train.
 *
 * The name splits across two lines rather than running as one string, because a
 * single 15-character line is a bar and a bar is what made the title screen read
 * as empty. `F.R.A.M.E.` sits high and left, `2240` low and right, on a
 * descending axis — so the eye travels the diagonal instead of scanning a line,
 * and the space that opens between them is where the gears live.
 *
 * **The name is on the left because the title still has to be read.** Putting
 * the number on the left put it first in reading order, so the mark announced
 * itself as `2240 F.R.A.M.E.` however it was laid out. The diagonal survives the
 * swap; the reading order does not survive not making it.
 *
 * **The gears are sprites, not redrawn geometry.** Each distinct gear is
 * rasterised once into its own texture and then simply rotated, so the whole
 * train costs four transforms a frame rather than a few hundred filled paths.
 */

/**
 * Tilt of both blocks, in degrees, positive clockwise.
 *
 * Anticlockwise, so each block rises to the right while the pair still steps
 * down the screen — the blocks lean *against* the arrangement rather than lying
 * along it, which keeps the diagonal from reading as a slide. Distinct from the
 * style's `slant`, which shears the letters within a block; this rotates the
 * block itself, and the two compose.
 */
const AXIS_DEG = -6;

interface GearSpec {
  /** Pitch radius in pixels at cap 100. */
  r: number;
  teeth: number;
  /** Centre, relative to the mark's origin. */
  x: number;
  y: number;
  /**
   * Turn direction. Meshed gears alternate, and the train below is ordered so
   * that alternating the sign down the list is also physically right.
   */
  dir: 1 | -1;
  alpha: number;
}

/**
 * A four-gear train sitting in the gap the diagonal opens up.
 *
 * Centres are one pitch radius apart so neighbours read as meshed, and angular
 * speed is scaled by `1 / teeth`, which is the real gear ratio — a small gear
 * visibly hurries. **Tooth phase is not solved**, only speed and direction; at
 * this alpha and scale the interleave is not resolvable, and solving it would
 * mean constraining the placement to exact pitch distances for something nobody
 * can see.
 */
const TRAIN: GearSpec[] = [
  { r: 88, teeth: 26, x: 44, y: -4, dir: 1, alpha: 0.22 },
  { r: 58, teeth: 17, x: 174, y: -58, dir: -1, alpha: 0.18 },
  { r: 40, teeth: 12, x: -92, y: 62, dir: 1, alpha: 0.16 },
  { r: 32, teeth: 9, x: -214, y: 30, dir: -1, alpha: 0.14 },
];

/** Degrees per second for a 26-tooth gear; everything else scales off it. */
const BASE_RPM = 5.5;

/**
 * Draws one gear into a texture: toothed rim, hub, and lightening holes.
 *
 * Line art rather than solid, so it reads as structure seen *through* the
 * darkness behind the name instead of as a shape competing with it.
 */
function gearTexture(scene: Phaser.Scene, key: string, r: number, teeth: number): void {
  if (scene.textures.exists(key)) return;
  const pad = 8;
  const size = Math.ceil((r + pad) * 2);
  const tex = scene.textures.createCanvas(key, size, size);
  if (!tex) return;
  const ctx = tex.getContext();
  const cx = size / 2;
  const cy = size / 2;

  const rootR = r * 0.88;
  const tipR = r * 1.06;
  const step = (Math.PI * 2) / teeth;
  // Half the pitch is tooth, half is gap, with the tooth narrowing toward the
  // tip — an involute flank read off a drawing rather than a square castellation.
  const tHalfRoot = step * 0.27;
  const tHalfTip = step * 0.17;

  ctx.beginPath();
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    ctx.lineTo(cx + Math.cos(a - tHalfRoot) * rootR, cy + Math.sin(a - tHalfRoot) * rootR);
    ctx.lineTo(cx + Math.cos(a - tHalfTip) * tipR, cy + Math.sin(a - tHalfTip) * tipR);
    ctx.lineTo(cx + Math.cos(a + tHalfTip) * tipR, cy + Math.sin(a + tHalfTip) * tipR);
    ctx.lineTo(cx + Math.cos(a + tHalfRoot) * rootR, cy + Math.sin(a + tHalfRoot) * rootR);
    const next = a + step;
    ctx.lineTo(cx + Math.cos(next - tHalfRoot) * rootR, cy + Math.sin(next - tHalfRoot) * rootR);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(22,32,52,0.42)';
  ctx.fill();
  ctx.lineWidth = Math.max(1.4, r * 0.022);
  ctx.strokeStyle = 'rgba(146,176,220,0.7)';
  ctx.stroke();

  // Hub and rim.
  for (const rr of [r * 0.62, r * 0.2]) {
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Lightening holes — what makes it read as a machined wheel rather than a
  // clock cog. Count follows size so a small gear does not look perforated.
  const holes = Math.max(4, Math.round(teeth / 2.2));
  const holeR = r * 0.13;
  ctx.lineWidth = Math.max(1.1, r * 0.016);
  for (let i = 0; i < holes; i++) {
    const a = (i / holes) * Math.PI * 2 + step / 2;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * r * 0.41, cy + Math.sin(a) * r * 0.41, holeR, 0, Math.PI * 2);
    ctx.stroke();
  }

  tex.refresh();
}

export class TitleMark {
  readonly container: Phaser.GameObjects.Container;
  private readonly gears: { img: Phaser.GameObjects.Image; rate: number }[] = [];

  /**
   * @param capPx Cap height of `F.R.A.M.E.`. `2240` is drawn smaller — it is a
   *   number attached to a name, and setting it at the same height makes the
   *   title read as two names.
   */
  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    style: LogoStyle,
    capPx = 66,
  ) {
    this.container = scene.add.container(x, y).setDepth(1200).setScrollFactor(0);

    // Gears first, so everything else lands on top of them.
    for (const g of TRAIN) {
      const key = `gear_${g.r}_${g.teeth}`;
      gearTexture(scene, key, g.r, g.teeth);
      const img = scene.add.image(g.x, g.y, key).setAlpha(g.alpha);
      this.container.add(img);
      // Real ratio: angular speed is inversely proportional to tooth count.
      this.gears.push({ img, rate: ((BASE_RPM * 26) / g.teeth) * g.dir });
    }

    const [word, number] = splitTitle(GAME_TITLE);

    const wm = createLogoTexture(scene, 'logo_word', word, style, capPx);
    const nm = createLogoTexture(scene, 'logo_num', number, style, capPx * 0.78);

    const axis = Phaser.Math.DegToRad(AXIS_DEG);
    // Opposite ends of one descending axis: the name up and left, the number
    // down and right, which is also the order they are read in.
    //
    // Held close enough to read as one mark. The two blocks overlap in x — the
    // number starts left of where the name ends — and only clear each other
    // because each texture carries `PAD` of empty margin and the ink inside it
    // stops well short of the edge. Moving them further together eats that
    // margin before it touches the glyphs, so the collision to watch for is ink
    // against ink, not box against box.

    const wordImg = scene.add
      .image(-124, -32, wm.key)
      .setRotation(axis)
      .setOrigin(0.5, 0.5);
    const numImg = scene.add
      .image(158, 48, nm.key)
      .setRotation(axis)
      .setOrigin(0.5, 0.5);

    this.container.add(wordImg);
    this.container.add(numImg);
  }

  /** @param t Seconds. */
  update(t: number): void {
    for (const g of this.gears) g.img.setRotation(Phaser.Math.DegToRad(t * g.rate));
  }

  destroy(): void {
    this.container.destroy(true);
  }
}
