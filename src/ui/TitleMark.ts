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
 * All the detail on them — filleted tooth roots, rim bands, relieved webs,
 * keyways, bolt circles, witness marks — is therefore paid for once at boot and
 * never again.
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
  /**
   * How the disc between hub and rim is relieved.
   *
   * **Varied on purpose.** Four wheels built to one drawing read as one sprite
   * pasted four times; a real train is assembled from whatever each station
   * needed, so no two here are relieved the same way.
   */
  web: 'spokes' | 'holes' | 'kidney' | 'solid';
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
  { r: 88, teeth: 26, x: 44, y: -4, dir: 1, alpha: 0.24, web: 'kidney' },
  { r: 58, teeth: 17, x: 174, y: -58, dir: -1, alpha: 0.2, web: 'spokes' },
  { r: 40, teeth: 12, x: -92, y: 62, dir: 1, alpha: 0.18, web: 'holes' },
  { r: 32, teeth: 9, x: -214, y: 30, dir: -1, alpha: 0.15, web: 'solid' },
];

/** Degrees per second for a 26-tooth gear; everything else scales off it. */
const BASE_RPM = 5.5;

/**
 * Supersampling factor for the gear rasters.
 *
 * **This is what stops the train shaking.** The game runs `roundPixels: true`,
 * and a gear is line art roughly a pixel and a half wide. Rasterised at final
 * size, every stroke crawls across a pixel boundary as the wheel turns, and a
 * ring of crawling strokes reads as the whole gear vibrating. Drawing at twice
 * the size and displaying at half means each screen pixel averages four texels,
 * so the lines resolve to steady grey instead of flickering between on and off.
 *
 * Costs one boot-time raster at 4x the area and nothing per frame.
 *
 * **Two, not more.** Three measured *worse* — 65 hard pixel flips against 25 —
 * because linear filtering averages a 2x2 texel neighbourhood and nothing
 * larger, so a 2x reduction is exactly what it can resolve and a 3x reduction
 * undersamples again. Raising this without also generating mipmaps makes the
 * problem it was added to fix come back.
 */
const GEAR_SS = 2;

const INK = 'rgba(146,176,220,0.7)';
const INK_FAINT = 'rgba(146,176,220,0.42)';
const INK_BRIGHT = 'rgba(226,198,142,0.85)';

/**
 * Texture key for the medallion: a faded semi-silhouette of **STILLWAKE YARD**
 * behind the whole mark. Loaded by `BootScene` only when the art exists — see
 * `docs/TITLE_MEDALLION_BRIEF.md`.
 *
 * **Not CATHEDRAL YARD**, which is the stage the game is fought on. Stillwake is
 * the floating city that went into the storm layer, and `2240` in the title is
 * the number of people taken off it alive — so the backdrop is the thing the
 * number counts. The image must read as nothing more than a city to anyone who
 * has not opened the Archive.
 */
export const MEDALLION_KEY = 'title_stillwake';

/**
 * Drawn width of the medallion in pixels, on the 960x540 logical screen.
 *
 * **Near the floor.** What makes the art read as a city rather than a smudge is
 * its internal structure — truss work, dock cranes, deck detail — and that is
 * the first thing lost as it shrinks. Much below this and it stops being a place.
 */
const MEDALLION_PX = 330;

/** Offset from the mark's origin. Centred on the F.R.A.M.E. block, not the mark. */
const MEDALLION_X = -108;
const MEDALLION_Y = -14;

/**
 * Opacity of the medallion. Low: it is a backdrop, not an illustration.
 *
 * The placeholder sits lower than the real art will, because hard line art and
 * a soft painted view do not read at the same weight for the same alpha — the
 * rose window at 0.3 competes with the mechs, where a faded painting at 0.3
 * will not. The briefed figure is the one the art is designed against, so it is
 * the one that stays.
 */
const MEDALLION_ALPHA = 0.3;
const MEDALLION_ALPHA_PLACEHOLDER = 0.17;

/**
 * The placeholder medallion: a gantry rose window drawn as an engineering
 * elevation.
 *
 * Stands in until real art arrives, and is a stand-in in subject as well as in
 * medium: the finished piece is a semi-silhouette of Stillwake Yard, not a
 * rose window. This is line art holding a slot, and it is meant to be replaced
 * rather than kept.
 *
 * **Its centre is deliberately empty**, which is the same constraint the real
 * art is briefed to honour: the lettering sits across the middle, so the middle
 * has to be the quietest part of the picture.
 */
function medallionFallback(scene: Phaser.Scene, key: string, size: number): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, size, size);
  if (!tex) return;
  const ctx = tex.getContext();
  const c = size / 2;
  const R = size * 0.44;

  ctx.strokeStyle = 'rgba(214,178,110,0.55)';
  ctx.lineWidth = Math.max(1.2, size * 0.0035);
  for (const r of [R, R * 0.78, R * 0.42]) {
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Radial spokes — sixteen, as a gantry ring would be framed.
  ctx.strokeStyle = 'rgba(214,178,110,0.46)';
  ctx.lineWidth = Math.max(1, size * 0.0026);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * R * 0.42, c + Math.sin(a) * R * 0.42);
    ctx.lineTo(c + Math.cos(a) * R, c + Math.sin(a) * R);
    ctx.stroke();
  }

  // Outer lancets: the pointed heads that make it a window and not a wheel.
  ctx.strokeStyle = 'rgba(236,206,150,0.55)';
  ctx.lineWidth = Math.max(1.1, size * 0.0032);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const t = R * 1.13;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a - 0.13) * R, c + Math.sin(a - 0.13) * R);
    ctx.lineTo(c + Math.cos(a) * t, c + Math.sin(a) * t);
    ctx.lineTo(c + Math.cos(a + 0.13) * R, c + Math.sin(a + 0.13) * R);
    ctx.stroke();
  }

  tex.refresh();
}

/**
 * Draws one gear into a texture: filleted teeth, a rim band, a relieved web, a
 * bored hub with a keyway, and one witness mark.
 *
 * Line art rather than solid, so it reads as structure seen *through* the
 * darkness behind the name instead of as a shape competing with it.
 *
 * **The witness mark is functional, not decoration.** Twenty-six identical teeth
 * turning slowly are very nearly indistinguishable from twenty-six identical
 * teeth standing still — there is no feature for the eye to track, so the train
 * read as static art. One marked tooth per wheel is what a millwright uses to
 * time a train, and it is also the cheapest way to make the motion legible at
 * this alpha.
 */
function gearTexture(
  scene: Phaser.Scene,
  key: string,
  r: number,
  teeth: number,
  web: GearSpec['web'],
): void {
  if (scene.textures.exists(key)) return;
  const pad = 10;
  // Everything below is drawn in supersampled space; the caller scales back down.
  r *= GEAR_SS;
  const size = Math.ceil((r + pad * GEAR_SS) * 2);
  const tex = scene.textures.createCanvas(key, size, size);
  if (!tex) return;
  const ctx = tex.getContext();
  const cx = size / 2;
  const cy = size / 2;
  const line = Math.max(1.2, r * 0.02);

  const rootR = r * 0.88;
  const tipR = r * 1.06;
  const step = (Math.PI * 2) / teeth;
  const tHalfRoot = step * 0.27;
  const tHalfTip = step * 0.17;
  const px = (a: number, rad: number): number => cx + Math.cos(a) * rad;
  const py = (a: number, rad: number): number => cy + Math.sin(a) * rad;

  // ---- toothed rim, filleted where each flank meets the root ---------------
  ctx.beginPath();
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    if (i === 0) ctx.moveTo(px(a - tHalfRoot, rootR), py(a - tHalfRoot, rootR));
    else ctx.lineTo(px(a - tHalfRoot, rootR), py(a - tHalfRoot, rootR));
    ctx.lineTo(px(a - tHalfTip, tipR), py(a - tHalfTip, tipR));
    ctx.lineTo(px(a + tHalfTip, tipR), py(a + tHalfTip, tipR));
    ctx.lineTo(px(a + tHalfRoot, rootR), py(a + tHalfRoot, rootR));
    // A quadratic through the valley rounds it the way a cutter leaves it. A
    // square valley is the tell of a drawn cog rather than a cut one.
    const next = a + step;
    ctx.quadraticCurveTo(
      px(a + step / 2, rootR * 0.962),
      py(a + step / 2, rootR * 0.962),
      px(next - tHalfRoot, rootR),
      py(next - tHalfRoot, rootR),
    );
  }
  ctx.closePath();

  // Radial shading, which is rotation-invariant so it survives the sprite
  // turning. A directional highlight would turn with the wheel and stop reading
  // as light falling on it.
  const depth = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, tipR);
  depth.addColorStop(0, 'rgba(30,42,64,0.50)');
  depth.addColorStop(0.72, 'rgba(20,29,48,0.40)');
  depth.addColorStop(1, 'rgba(34,48,72,0.52)');
  ctx.fillStyle = depth;
  ctx.fill();
  ctx.lineWidth = line;
  ctx.strokeStyle = INK;
  ctx.stroke();

  // ---- rim band ------------------------------------------------------------
  for (const rr of [r * 0.74, r * 0.63]) {
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.stroke();
  }

  // ---- web -----------------------------------------------------------------
  const hubR = r * 0.26;
  ctx.strokeStyle = INK_FAINT;
  ctx.lineWidth = Math.max(1, r * 0.016);

  if (web === 'spokes') {
    const n = Math.max(4, Math.round(teeth / 3));
    for (let i = 0; i < n; i++) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((i / n) * Math.PI * 2);
      // Tapered: wider where it meets the hub, which is where the torque is.
      ctx.beginPath();
      ctx.moveTo(hubR, r * 0.075);
      ctx.lineTo(r * 0.63, r * 0.045);
      ctx.lineTo(r * 0.63, -r * 0.045);
      ctx.lineTo(hubR, -r * 0.075);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
  } else if (web === 'holes') {
    const n = Math.max(4, Math.round(teeth / 2.2));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + step / 2;
      ctx.beginPath();
      ctx.arc(px(a, r * 0.44), py(a, r * 0.44), r * 0.13, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (web === 'kidney') {
    // Arc slots, which is what a large wheel actually gets: a row of round
    // holes removes far less metal for the same weakening.
    const n = 6;
    const r1 = r * 0.34;
    const r2 = r * 0.55;
    const half = (Math.PI * 2) / n / 2 - 0.16;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r2, a - half, a + half);
      ctx.arc(cx, cy, r1, a + half, a - half, true);
      ctx.closePath();
      ctx.stroke();
    }
  }

  // ---- hub: bore, keyway, bolt circle --------------------------------------
  ctx.strokeStyle = INK;
  ctx.lineWidth = line;
  ctx.beginPath();
  ctx.arc(cx, cy, hubR, 0, Math.PI * 2);
  ctx.stroke();

  const boreR = r * 0.13;
  ctx.beginPath();
  ctx.arc(cx, cy, boreR, 0, Math.PI * 2);
  ctx.stroke();

  // Keyway — the notch in the bore that stops the wheel spinning on its shaft.
  // Small, and the single most machine-specific mark on the whole part.
  const kw = Math.max(1.6, r * 0.05);
  ctx.strokeRect(cx - kw / 2, cy - boreR - kw * 0.9, kw, kw * 1.2);

  // Bolt circle, on the wheels big enough to carry one legibly.
  if (r > 45) {
    ctx.strokeStyle = INK_FAINT;
    ctx.lineWidth = Math.max(0.9, r * 0.012);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.4;
      ctx.beginPath();
      ctx.arc(px(a, r * 0.2), py(a, r * 0.2), Math.max(1.1, r * 0.022), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // ---- witness mark --------------------------------------------------------
  ctx.strokeStyle = INK_BRIGHT;
  ctx.lineWidth = Math.max(1.4, r * 0.026);
  ctx.beginPath();
  ctx.moveTo(px(0, rootR * 0.82), py(0, rootR * 0.82));
  ctx.lineTo(px(0, tipR), py(0, tipR));
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(px(0, r * 0.44), py(0, r * 0.44), Math.max(1.8, r * 0.035), 0, Math.PI * 2);
  ctx.stroke();

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
  constructor(scene: Phaser.Scene, x: number, y: number, style: LogoStyle, capPx = 66) {
    this.container = scene.add.container(x, y).setDepth(1200).setScrollFactor(0);

    // Medallion first: the place, behind the machinery, behind the name.
    //
    // **One element for the whole mark.** This used to be baked into each
    // wordmark texture, which meant the screen carried two of them — a backdrop
    // drawn once per foreground object is not a backdrop. Falls back to drawn
    // line art when the painted art is absent, so the composition never has a
    // hole in it while the asset is outstanding.
    const hasArt = scene.textures.exists(MEDALLION_KEY);
    const key = hasArt ? MEDALLION_KEY : 'title_medallion_placeholder';
    if (!hasArt) medallionFallback(scene, key, 512);
    const medallion = scene.add
      .image(MEDALLION_X, MEDALLION_Y, key)
      .setAlpha(hasArt ? MEDALLION_ALPHA : MEDALLION_ALPHA_PLACEHOLDER);
    medallion.setDisplaySize(MEDALLION_PX, MEDALLION_PX);
    // **Rotation after sizing.** `setDisplaySize` writes scaleX/scaleY and leaves
    // rotation alone, but it is easy to read the pair as one transform and set
    // them in the other order; doing that silently drops the tilt.
    medallion.setRotation(Phaser.Math.DegToRad(AXIS_DEG));
    if (hasArt) {
      // The art is delivered as light structure on pure black with no alpha
      // channel, so ADD composites it correctly with no keying pass: black
      // contributes nothing and the structure adds its own light. This is also
      // what makes the lift spars fade out at their tips for free.
      medallion.setBlendMode(Phaser.BlendModes.ADD);
    }
    this.container.add(medallion);

    // Gears next, so everything else lands on top of them.
    for (const g of TRAIN) {
      const key = `gear_${g.r}_${g.teeth}_${g.web}`;
      gearTexture(scene, key, g.r, g.teeth, g.web);
      const img = scene.add.image(g.x, g.y, key).setAlpha(g.alpha);
      // Back down to logical size. Linear filtering is what actually averages
      // the supersampled texels; without it this would just be a bigger raster.
      img.setScale(1 / GEAR_SS);
      scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
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
    // number begins left of where the final stop ends — and clear each other
    // only because they pass vertically. Measured at 0 overlapping ink pixels;
    // bounding boxes stopped being a useful check at this spacing.
    const wordImg = scene.add.image(-108, -26, wm.key).setRotation(axis).setOrigin(0.5, 0.5);
    const numImg = scene.add.image(138, 40, nm.key).setRotation(axis).setOrigin(0.5, 0.5);

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
