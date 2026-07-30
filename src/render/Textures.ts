import Phaser from 'phaser';

/**
 * Runtime-generated effect textures.
 *
 * Effects are drawn from a handful of procedural glow/streak textures rather
 * than authored PNGs, so hit sparks, trails and explosions stay original,
 * recolourable per mech, and add nothing to the asset payload.
 */

export const TEX = {
  glow: 'fx_glow',
  spark: 'fx_spark',
  ring: 'fx_ring',
  streak: 'fx_streak',
  slash: 'fx_slash',
  shard: 'fx_shard',
  hex: 'fx_hex',
} as const;

function canvasTex(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  const ctx = tex.getContext();
  draw(ctx, w, h);
  tex.refresh();
}

export function createEffectTextures(scene: Phaser.Scene): void {
  // Soft radial glow — the workhorse for muzzle flashes, trails, explosions.
  canvasTex(scene, TEX.glow, 128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0.0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.62)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.20)');
    g.addColorStop(1.0, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });

  // Tight bright dot with a faint halo, for impact sparks.
  canvasTex(scene, TEX.spark, 32, 32, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0.0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.85)');
    g.addColorStop(1.0, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });

  // Hollow ring for shockwaves and barrier pulses.
  canvasTex(scene, TEX.ring, 128, 128, (ctx, w, h) => {
    ctx.strokeStyle = 'rgba(255,255,255,1)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 14, 0, Math.PI * 2);
    ctx.stroke();
  });

  // Horizontal streak with hot core, used for bullets and beams.
  canvasTex(scene, TEX.streak, 128, 24, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0.0, 'rgba(255,255,255,0)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.82, 'rgba(255,255,255,1)');
    g.addColorStop(1.0, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    // Lens shape: fat in the middle, tapering to the ends.
    for (let x = 0; x < w; x++) {
      const t = x / (w - 1);
      const thickness = Math.sin(Math.PI * Math.min(1, t * 1.05)) ** 0.7;
      const bh = Math.max(1, thickness * h);
      ctx.fillRect(x, (h - bh) / 2, 1, bh);
    }
  });

  // Crescent slash for melee arcs.
  canvasTex(scene, TEX.slash, 192, 192, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    for (let i = 0; i < 22; i++) {
      const t = i / 21;
      const r = w / 2 - 6 - t * 16;
      ctx.strokeStyle = `rgba(255,255,255,${(1 - t) * 0.5})`;
      ctx.lineWidth = 3 + (1 - t) * 9;
      ctx.beginPath();
      ctx.arc(cx, cy, r, -1.05, 1.05);
      ctx.stroke();
    }
  });

  // Angular debris shard for explosions.
  canvasTex(scene, TEX.shard, 24, 24, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(255,255,255,1)';
    ctx.beginPath();
    ctx.moveTo(w * 0.5, 0);
    ctx.lineTo(w, h * 0.42);
    ctx.lineTo(w * 0.62, h);
    ctx.lineTo(w * 0.12, h * 0.72);
    ctx.closePath();
    ctx.fill();
  });

  // Hex plate for the barrier bubble.
  canvasTex(scene, TEX.hex, 160, 160, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    const r = w / 2 - 6;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    const g = ctx.createRadialGradient(cx, cy, r * 0.35, cx, cy, r);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(255,255,255,0.28)');
    ctx.fillStyle = g;
    ctx.fill();
  });
}

/** A 1x1 white pixel, handy for cheap bars and flashes. */
export function createPixel(scene: Phaser.Scene, key = 'fx_px'): string {
  canvasTex(scene, key, 2, 2, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 2, 2);
  });
  return key;
}
