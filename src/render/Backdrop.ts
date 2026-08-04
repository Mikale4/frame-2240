import Phaser from 'phaser';
import { ARENA_H, ARENA_W, DECK_Y, VIEW_H, VIEW_W } from '../core/GameConfig';
import { depthSortAt } from '../core/Depth';

/**
 * Row in `arena_near.png` where the deck surface becomes solid.
 *
 * **Measured from the asset, never estimated.** The engine positions the strip
 * so this row lands exactly on `DECK_Y`, which is what makes the drawn floor and
 * the floor the simulation stands machines on the same line. Guessing it puts
 * them in different places, which this arena has already shipped once.
 *
 * 748 for the hand-authored deck, measured as the first fully opaque row per
 * column: 747 at the lowest, 752 at the highest, median 748 across the full
 * width. **Re-measure whenever the art changes** — the old Blender strip was
 * 111, and nothing warns you when it moves.
 */
const NEAR_LIP_ROW = 748;

/**
 * The painted sky's scroll rate and how much of the gradient shows through it.
 *
 * 0.02 because the sky is the one thing in a parallax stack that is genuinely at
 * infinity — it should barely acknowledge the camera at all.
 */
const SKY_SCROLL = 0.02;
const SKY_ALPHA = 1;

/** How much faster than the world the foreground columns travel. */
const FORE_SCROLL = 1.35;
/**
 * Draw order for the foreground.
 *
 * Above the machines, which sort around `depthSortAt(y, 20)` and below, and
 * below the HUD, which the UI camera draws separately at zoom 1.
 */
const FORE_DEPTH = 60;

/**
 * The arena "CATHEDRAL YARD": a procedural sky gradient, five tiling parallax
 * strips and a drifting dust field for depth.
 */
export class Backdrop {
  private readonly sky: Phaser.GameObjects.Graphics;
  /**
   * The painted night sky.
   *
   * **Its levels are corrected in the asset, not at runtime.** As delivered it
   * measured luminance 15/23/31/43/88 by fifths against a gradient pitched at
   * 22/44/66/80/86 — far darker through the middle — and dropping it in at 0.88
   * alpha made the composite ~35 in the band `arena_far` occupies, against that
   * strip's ~89. A ratio of 2.5, where the procedural gradient had been 1.35.
   * The far layer stopped reading as distant fog and started glowing against a
   * void, which is the exact fault the gradient rework had just fixed.
   *
   * Neither alpha nor tint can raise a backdrop — tint only multiplies down and
   * alpha only blends toward whatever is behind. So the fix belongs in the
   * asset: `source/sky_master_1536_lifted.png` applies a shadow lift,
   * `new = old + L(1 - old/255)`, with `L` a smoothstepped hump across the
   * height. That form raises the dark sky field while leaving the stars, which
   * are already near maximum, essentially untouched. Result 24/42/60/68/96, and
   * a far-to-sky ratio back in the 1.3–1.5 that reads correctly.
   */
  private readonly skyArt: Phaser.GameObjects.TileSprite;
  private readonly far: Phaser.GameObjects.TileSprite;
  /**
   * Mid-distance haze: cranes and gantry platforms between the skyline and the
   * dock proper.
   *
   * Added because the stack had a hole in it. `far` scrolls at 0.06 and `mid` at
   * 0.18 — a factor of three with nothing between them, which a player spotted
   * as "it still looks like its missing a layer". Depth reads as a gradient, and
   * a gradient with a gap in it reads as two flats.
   */
  private readonly haze: Phaser.GameObjects.TileSprite;
  private readonly mid: Phaser.GameObjects.TileSprite;
  private readonly near: Phaser.GameObjects.TileSprite;
  /**
   * The fast foreground: girder columns passing in front of the machines.
   *
   * The only layer that scrolls *faster* than the world. Everything else in a
   * parallax stack sits behind the action and moves slower than it; this one is
   * nearer than the camera's subject, so it has to overtake it, and that
   * overtaking is the entire depth cue it provides.
   */
  private readonly fore: Phaser.GameObjects.TileSprite;
  /**
   * The night sky itself.
   *
   * Canon supports it: the Archive has the air above the storm layer as "clear,
   * cold and thin", which at this altitude means no atmosphere overhead to wash
   * anything out. Deliberately **no traffic** — no ships, no distant machines.
   * CATHEDRAL YARD's entire character is that nobody holds it and nobody comes
   * back, and a moving object in the sky would both contradict that and compete
   * with the fight for the eye.
   */
  private readonly stars: Phaser.GameObjects.Container;
  private readonly starField: Phaser.GameObjects.Image[] = [];
  private readonly dust: Phaser.GameObjects.Container;
  private readonly motes: Phaser.GameObjects.Image[] = [];
  /** Seconds elapsed, for the twinkle. */
  private starTime = 0;

  /** All backdrop objects, so the scene can assign them to the right camera. */
  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.sky, this.skyArt, this.stars, this.far, this.haze, this.mid, this.near, this.fore, this.dust];
  }

  constructor(scene: Phaser.Scene) {
    // ---- sky ------------------------------------------------------------
    // The backdrop lives in world space and is re-fitted to the camera each
    // frame. A scrollFactor-0 layer would still be scaled by camera zoom and
    // would leave uncovered gaps whenever the camera zooms out.
    this.sky = scene.add.graphics();
    this.sky.setDepth(-100);
    this.paintSky();

    // ---- painted sky ------------------------------------------------------
    // Mirrored to 3072 like `far` and `haze`. It scrolls slower than anything
    // else on the stack: it is the sky, and the sky does not move.
    this.skyArt = scene.add.tileSprite(0, 0, VIEW_W, 1024, 'arena_sky');
    this.skyArt.setOrigin(0, 0).setDepth(-98);
    this.skyArt.setAlpha(SKY_ALPHA);

    // ---- stars -----------------------------------------------------------
    // Behind every strip and in front of nothing but the gradient. Concentrated
    // in the upper half, where the sky is dark enough to hold them: lower down
    // the storm glow lifts the gradient past the point where a star would read,
    // so drawing them there would only add noise over the fight.
    this.stars = scene.add.container(0, 0);
    this.stars.setDepth(-95);
    for (let i = 0; i < 110; i++) {
      const st = scene.add.image(0, 0, 'fx_glow');
      const sc = 0.018 + Math.random() * 0.032;
      st.setScale(sc);
      st.setTint(Math.random() < 0.22 ? 0xbfd4ff : 0xe6eeff);
      st.setBlendMode(Phaser.BlendModes.ADD);
      st.setData('bx', Math.random());
      // Squared, so they crowd the top of the frame and thin out downward.
      st.setData('by', Math.random() ** 2 * 0.62);
      st.setData('a', 0.20 + Math.random() * 0.45);
      // A slow, shallow twinkle. Fast or deep reads as a flickering artefact.
      st.setData('tw', 0.4 + Math.random() * 1.1);
      st.setData('ph', Math.random() * Math.PI * 2);
      this.stars.add(st);
      this.starField.push(st);
    }

    // ---- parallax strips -------------------------------------------------
    // Each strip is anchored so the arena floor sits near the arena's bottom.
    // 1024 to match the hand-authored asset's height, as with the mid strip.
    // `arena_far.png` is the delivered 1536-wide art mirrored to 3072: the
    // painting ran off both edges and did not tile, and mirroring makes the
    // wrap exact by construction. Undetectable here because the far layer is
    // fog, scrolls at 0.06 and is tinted and faded on top of that.
    this.far = scene.add.tileSprite(0, 0, VIEW_W, 1024, 'arena_far');
    this.far.setOrigin(0, 0).setDepth(-90);
    /**
     * No tint and no suppression: the art is already a dark silhouette.
     *
     * The first far layer was a grey fog bank measuring luminance ~89 against a
     * sky of ~60, so it glowed rather than receding and had to be held back with
     * a dark tint at half alpha. The replacement is dock structure drawn as
     * silhouette — 31 and 35 in the two bands it occupies, against a sky at 57
     * and 75 — so it recedes on its own and needs nothing done to it.
     */
    this.far.setAlpha(1);

    // Mirrored to 3072 for the same reason as `far`: the delivered art ran off
    // both edges. Its structure sits in the lower two thirds of its own image,
    // so it is placed lower than `far` rather than in front of it — depth here
    // is the scroll rate, not the height.
    this.haze = scene.add.tileSprite(0, 0, VIEW_W, 1024, 'arena_haze');
    this.haze.setOrigin(0, 0).setDepth(-85);
    /**
     * Held at 0.64 to put it back in the right place in the depth order.
     *
     * As delivered it measures 10–12, which is *darker than `mid`* at 24–25 —
     * inverted, because the middle-distance layer should not be blacker than the
     * nearer one. Alpha blends it toward the sky behind, and 0.64 lands it near
     * 27: between `mid` at 25 and `far` at 31, so the three read as a gradient
     * from near-black to nearly-sky as they recede.
     */
    this.haze.setAlpha(0.64);

    // 1024, not 512: the hand-authored mid art is 1536x1024. A tile sprite
    // shorter than its texture crops rather than fits, so the strip has to match
    // the asset's height or the bottom of the structure is simply never drawn.
    this.mid = scene.add.tileSprite(0, 0, VIEW_W, 1024, 'arena_mid');
    this.mid.setOrigin(0, 0).setDepth(-80);
    this.mid.setTint(0x9aa8c8);

    // The near girder belongs to the deck, not to the camera. It used to be
    // placed at a screen offset, which meant the "floor" it implied slid around
    // independently of the floor machines actually stand on. It is now world
    // geometry spanning the arena, pinned to the deck line, and drawn behind the
    // machines so it reads as the deck's own structure rather than as a bar
    // across the fight.
    // 1024 to match the hand-authored asset. The strip carries a lot of empty
    // sky above its deck line, which is fine — it is transparent, and the deck
    // itself is placed by `NEAR_LIP_ROW` rather than by the strip's top edge.
    this.near = scene.add.tileSprite(0, 0, ARENA_W + 800, 1024, 'arena_near');
    this.near.setOrigin(0, 0).setDepth(depthSortAt(DECK_Y, 11));
    // Muted: at full saturation the hazard diamonds along the lip pulled the eye
    // harder than the machines did.
    this.near.setTint(0x8d97bb);

    // ---- foreground ------------------------------------------------------
    // Drawn in front of everything the fight contains. The art is deliberately
    // free-standing columns with a wide clear span between them: a foreground
    // that framed the view would hide a machine at altitude, and mechs here fly
    // to the ceiling. Measured on the asset — 0 rows span the full width and the
    // centre 50 % is empty — which is what makes it safe to put on top.
    this.fore = scene.add.tileSprite(0, 0, VIEW_W, 1024, 'arena_fore');
    this.fore.setOrigin(0, 0).setDepth(FORE_DEPTH);
    // Darker and cooler than the mid strip: it is nearer than every light in
    // the scene, so it reads as an unlit mass with the dock glowing past it.
    this.fore.setTint(0x5a6480);
    /**
     * Semi-transparent, because it is drawn *over* the fight.
     *
     * At full opacity a machine passing behind a column vanished outright. A
     * foreground is a depth cue, and a depth cue that hides the thing you are
     * controlling has stopped being one — the player has to keep reading the
     * silhouette through it. 0.62 is enough mass to sell the parallax and thin
     * enough that a mech behind it is still legible.
     */
    this.fore.setAlpha(0.62);

    // ---- dust / debris field --------------------------------------------
    this.dust = scene.add.container(0, 0);
    this.dust.setDepth(-70);
    for (let i = 0; i < 44; i++) {
      const m = scene.add.image(
        Math.random() * VIEW_W,
        Math.random() * VIEW_H,
        'fx_glow',
      );
      const s = 0.05 + Math.random() * 0.12;
      m.setScale(s);
      m.setAlpha(0.16 + Math.random() * 0.3);
      m.setTint(0x9fc4ff);
      m.setBlendMode(Phaser.BlendModes.ADD);
      m.setData('depth', 0.25 + Math.random() * 0.8);
      m.setData('drift', 0.15 + Math.random() * 0.5);
      m.setData('baseX', Math.random() * (VIEW_W + 40));
      m.setData('baseY', Math.random() * VIEW_H);
      m.setData('baseScale', s);
      this.dust.add(m);
      this.motes.push(m);
    }
  }

  private paintSky(): void {
    const g = this.sky;
    g.clear();
    /**
     * Cold void above, storm-glow below — **lifted to sit under the art rather
     * than behind it.**
     *
     * The first gradient ran luminance 15 at the top to 54 at the bottom, while
     * the hand-authored far and haze layers measure **72–98 once tinted**. The
     * art was up to six times brighter than its own sky, so instead of receding
     * into distance it floated on a void, which a player reported as the sky
     * looking like darkness against the layers.
     *
     * It also fought them in hue: the old bottom band `0x3a2c3c` is warm mauve,
     * red-dominant, against art that is blue-dominant throughout.
     *
     * Now it climbs 22 → 82, passing through the art's own band as it goes, and
     * stays in the blue family with only a slight warm push at the very bottom
     * for the haze coming off the storm layer. The far strip reads as brighter
     * fog against a dark sky; the lower dock silhouettes against the glow.
     */
    const bands: Array<[number, number]> = [
      [0x0c1224, 0.0],
      [0x1b2742, 0.22],
      [0x2c3c5e, 0.45],
      [0x3a4c6c, 0.7],
      [0x47516a, 1.0],
    ];
    const steps = 48;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      let lo = bands[0];
      let hi = bands[bands.length - 1];
      for (let b = 0; b < bands.length - 1; b++) {
        if (t >= bands[b][1] && t <= bands[b + 1][1]) {
          lo = bands[b];
          hi = bands[b + 1];
          break;
        }
      }
      const span = Math.max(1e-6, hi[1] - lo[1]);
      const k = (t - lo[1]) / span;
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(lo[0]),
        Phaser.Display.Color.ValueToColor(hi[0]),
        100,
        Math.round(k * 100),
      );
      g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1);
      g.fillRect(0, Math.floor((i * VIEW_H) / steps), VIEW_W, Math.ceil(VIEW_H / steps) + 1);
    }
  }

  /**
   * Scrolls the layers from the camera position.
   *
   * Vertical parallax is anchored to the arena's vertical extent so flying to
   * the ceiling reveals sky and diving reveals the dock floor.
   */
  /**
   * Fits the layers to the camera's current world view.
   *
   * Everything is placed in world coordinates and scaled by 1/zoom, so the
   * backdrop always covers exactly the visible region no matter how far the
   * camera has zoomed out to keep both pilots framed.
   */
  update(cam: Phaser.Cameras.Scene2D.Camera, dt: number): void {
    const camX = cam.scrollX;
    const camY = cam.scrollY;
    const inv = 1 / cam.zoom;
    const view = cam.worldView;
    const ox = view.x;
    const oy = view.y;

    const vFrac = Phaser.Math.Clamp(camY / Math.max(1, ARENA_H - VIEW_H), 0, 1);

    this.sky.setScale(inv);
    this.sky.setPosition(ox, oy);

    // Stars are effectively at infinity, so they take the smallest parallax on
    // the stack — enough that the sky is not glued to the camera, far too
    // little to read as motion.
    this.starTime += dt;
    const starSpanX = VIEW_W * inv;
    const starSpanY = VIEW_H * inv;
    for (const st of this.starField) {
      const bx = st.getData('bx') as number;
      const by = st.getData('by') as number;
      let sx = (bx * starSpanX - camX * 0.02) % starSpanX;
      if (sx < 0) sx += starSpanX;
      st.setPosition(ox + sx, oy + by * starSpanY - camY * 0.02 * inv);
      const tw = st.getData('tw') as number;
      const ph = st.getData('ph') as number;
      st.setAlpha((st.getData('a') as number) * (0.78 + 0.22 * Math.sin(this.starTime * tw + ph)));
    }

    const place = (
      obj: Phaser.GameObjects.TileSprite,
      screenY: number,
      scrollRate: number,
    ) => {
      obj.setScale(inv);
      obj.setPosition(ox, oy + screenY * inv);
      obj.tilePositionX = camX * scrollRate;
    };

    // Faster than the world (1.0), so it overtakes the machines rather than
    // trailing them. 1.35 is enough to read as "very close" without strobing
    // past at the speeds a dash reaches.
    /**
     * Held high enough that the columns' own top edge never enters the view.
     *
     * The art's structure spans rows 44–968 of its 1024, so the columns
     * *terminate* 44px down — and at the old `-150 + vFrac * 210` that
     * termination drifted into frame whenever the camera sat low, leaving
     * machines flying above a row of severed girders. A player reported it as
     * mechs flying over the foreground.
     *
     * The strip is 1.9x the view height at every zoom, so this was never a
     * coverage problem: it was placement. The range is now -230..-80, which
     * keeps the content's top edge between 36 and 186px *above* the view at both
     * zoom extremes while preserving most of the vertical drift.
     *
     * If the art is ever redrawn, the columns should run off both edges of their
     * image rather than stopping inside it — a foreground fragment that visibly
     * ends is a fragment the camera can catch.
     */
    place(this.fore, -230 + vFrac * 150, FORE_SCROLL);
    // Behind everything, and barely moving.
    place(this.skyArt, -240 + vFrac * 150, SKY_SCROLL);
    place(this.far, -110 + vFrac * 70, 0.06);
    this.far.tilePositionY = vFrac * 24;
    // Between far (0.06) and mid (0.18), and offset up so its structure band
    // lands above the mid gantry rather than behind it.
    place(this.haze, -300 + vFrac * 100, 0.11);
    place(this.mid, -40 + vFrac * 130, 0.18);
    // World-anchored, and offset so the strip's own deck lip — the first fully
    // opaque row of arena_near.png, measured at y=111 — lands exactly on DECK_Y.
    // That is what makes the drawn floor and the simulated floor the same line.
    this.near.setScale(1);
    this.near.setPosition(-400, DECK_Y - NEAR_LIP_ROW);

    const span = VIEW_W + 40;
    for (const m of this.motes) {
      const d = m.getData('depth') as number;
      const drift = m.getData('drift') as number;
      // Track a wrapped base position, then offset by camera depth for parallax.
      let base = ((m.getData('baseX') as number) ?? 0) - drift * dt * 60 * 0.35;
      base = ((base % span) + span) % span;
      m.setData('baseX', base);
      const sx = ((base - camX * 0.35 * d) % span + span) % span - 20;
      m.setPosition(ox + sx * inv, oy + (m.getData('baseY') as number) * inv);
      m.setScale((m.getData('baseScale') as number) * inv);
    }
    void ARENA_W;
  }

  destroy(): void {
    this.sky.destroy();
    this.far.destroy();
    this.mid.destroy();
    this.near.destroy();
    this.dust.destroy(true);
  }
}
