import Phaser from 'phaser';
import { ARENA_H, ARENA_W, VIEW_H, VIEW_W } from '../core/GameConfig';

/**
 * The arena "CATHEDRAL YARD": a procedural sky gradient plus three tiling
 * parallax strips rendered in Blender, and a drifting dust field for depth.
 */
export class Backdrop {
  private readonly sky: Phaser.GameObjects.Graphics;
  private readonly far: Phaser.GameObjects.TileSprite;
  private readonly mid: Phaser.GameObjects.TileSprite;
  private readonly near: Phaser.GameObjects.TileSprite;
  private readonly dust: Phaser.GameObjects.Container;
  private readonly motes: Phaser.GameObjects.Image[] = [];

  /** All backdrop objects, so the scene can assign them to the right camera. */
  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.sky, this.far, this.mid, this.near, this.dust];
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
    this.far = scene.add.tileSprite(0, 0, VIEW_W, 512, 'arena_far');
    this.far.setOrigin(0, 0).setDepth(-90);
    this.far.setTint(0x6f7fa8);
    this.far.setAlpha(0.85);

    this.mid = scene.add.tileSprite(0, 0, VIEW_W, 512, 'arena_mid');
    this.mid.setOrigin(0, 0).setDepth(-80);
    this.mid.setTint(0x9aa8c8);

    this.near = scene.add.tileSprite(0, 0, VIEW_W, 256, 'arena_near');
    this.near.setOrigin(0, 0).setDepth(60);

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

    place(this.far, -110 + vFrac * 70, 0.06);
    this.far.tilePositionY = vFrac * 24;
    place(this.mid, -40 + vFrac * 130, 0.18);
    // Anchored to the arena floor: diving brings the girder up into frame,
    // climbing drops it away below the view.
    place(this.near, VIEW_H - 210 + vFrac * 210, 0.62);

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
