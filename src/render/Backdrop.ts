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
 * The arena "CATHEDRAL YARD": a procedural sky gradient, four tiling parallax
 * strips and a drifting dust field for depth.
 */
export class Backdrop {
  private readonly sky: Phaser.GameObjects.Graphics;
  private readonly far: Phaser.GameObjects.TileSprite;
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
  private readonly dust: Phaser.GameObjects.Container;
  private readonly motes: Phaser.GameObjects.Image[] = [];

  /** All backdrop objects, so the scene can assign them to the right camera. */
  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.sky, this.far, this.mid, this.near, this.fore, this.dust];
  }

  constructor(scene: Phaser.Scene) {
    // ---- sky ------------------------------------------------------------
    // The backdrop lives in world space and is re-fitted to the camera each
    // frame. A scrollFactor-0 layer would still be scaled by camera zoom and
    // would leave uncovered gaps whenever the camera zooms out.
    this.sky = scene.add.graphics();
    this.sky.setDepth(-100);
    this.paintSky();

    // ---- parallax strips -------------------------------------------------
    // Each strip is anchored so the arena floor sits near the arena's bottom.
    // 1024 to match the hand-authored asset's height, as with the mid strip.
    // `arena_far.png` is the delivered 1536-wide art mirrored to 3072: the
    // painting ran off both edges and did not tile, and mirroring makes the
    // wrap exact by construction. Undetectable here because the far layer is
    // fog, scrolls at 0.06 and is tinted and faded on top of that.
    this.far = scene.add.tileSprite(0, 0, VIEW_W, 1024, 'arena_far');
    this.far.setOrigin(0, 0).setDepth(-90);
    this.far.setTint(0x6f7fa8);
    this.far.setAlpha(0.85);

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
    // Vertical band gradient: cold void above, warm dock haze below.
    const bands: Array<[number, number]> = [
      [0x0a0d18, 0.0],
      [0x121a2e, 0.34],
      [0x1d2440, 0.58],
      [0x2c2a44, 0.78],
      [0x3a2c3c, 1.0],
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
    place(this.fore, -150 + vFrac * 210, FORE_SCROLL);
    place(this.far, -110 + vFrac * 70, 0.06);
    this.far.tilePositionY = vFrac * 24;
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
