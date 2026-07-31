import Phaser from 'phaser';
import { PROJ_FAMILIES, PROJ_FAMILY_IDS, type ProjFamilyId } from '../projectiles/families';

/**
 * Procedural projectile art.
 *
 * Every family is drawn here, in white, into one packed canvas texture. White so
 * the pilot's colour can be applied as a tint at draw time — the reference gives
 * a pilot one colour across their whole output — and packed so that the three
 * layers of every shot on screen share a texture and batch into one draw call.
 *
 * Drawn rather than rendered. The user asked for the 2005 look, which is the
 * same look Touhou uses: flat additive 2D shapes with a hot white centre and a
 * saturated rim. That is a 2D idiom. A Blender render of a rocket is a superior
 * object and an inferior 40-pixel bullet, and it would cost a round trip through
 * the modelling pipeline for every tweak. Blender keeps the mech parts.
 *
 * Each cell holds one shape with its **nose pointing +X**, normalised so the
 * longer of the family's two axes spans `2*R`. The renderer therefore applies a
 * single uniform scale of `max(length,width) / (2*R)` and never distorts a
 * silhouette. The padding around `R` is what the soft outer bleed spills into.
 */

export const PROJ_TEX = 'fx_projectiles';
export const PROJ_HALO_FRAME = 'halo';

/** Cell size in texture pixels, and the half-extent shapes are drawn to. */
const CELL = 160;
const R = 74;
/** Logical pixels spanned by `2*R`, used by the renderer to size a family. */
export const PROJ_CELL_SPAN = R * 2;

const COLS = 6;

type Mode = 'shell' | 'core';
type Draw = (ctx: CanvasRenderingContext2D, hx: number, hy: number, mode: Mode) => void;

// ------------------------------------------------------------------ helpers

const white = (a: number) => `rgba(255,255,255,${a})`;

/** Radial falloff centred on the origin, scaled to an ellipse. */
function blob(ctx: CanvasRenderingContext2D, hx: number, hy: number, stops: [number, number][]): void {
  ctx.save();
  ctx.scale(hx, hy);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  for (const [t, a] of stops) g.addColorStop(t, white(a));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** A lens: pointed at both ends along X, fattest at `peak` of its length. */
function lensPath(ctx: CanvasRenderingContext2D, hx: number, hy: number, peak = 0.5): void {
  ctx.beginPath();
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = -hx + t * hx * 2;
    const s = t < peak ? t / peak : (1 - t) / (1 - peak);
    const y = -(Math.sin(Math.PI * 0.5 * Math.max(0, s)) ** 0.75) * hy;
    if (i === 0) ctx.moveTo(x, 0);
    else ctx.lineTo(x, y);
  }
  for (let i = steps; i >= 0; i--) {
    const t = i / steps;
    const x = -hx + t * hx * 2;
    const s = t < peak ? t / peak : (1 - t) / (1 - peak);
    ctx.lineTo(x, Math.sin(Math.PI * 0.5 * Math.max(0, s)) ** 0.75 * hy);
  }
  ctx.closePath();
}

/** A capsule along X with hard sides and rounded caps. */
function capsulePath(ctx: CanvasRenderingContext2D, hx: number, hy: number): void {
  const r = Math.min(hy, hx);
  ctx.beginPath();
  ctx.moveTo(-hx + r, -hy);
  ctx.lineTo(hx - r, -hy);
  ctx.arc(hx - r, 0, hy, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(-hx + r, hy);
  ctx.arc(-hx + r, 0, hy, Math.PI / 2, -Math.PI / 2);
  ctx.closePath();
}

function poly(ctx: CanvasRenderingContext2D, pts: [number, number][]): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
}

/** Fills the current path, then bleeds a soft copy of it outward. */
function fillGlow(ctx: CanvasRenderingContext2D, alpha: number, spread: number): void {
  ctx.save();
  ctx.shadowColor = white(0.85);
  ctx.shadowBlur = spread;
  ctx.fillStyle = white(alpha);
  ctx.fill();
  ctx.fill();
  ctx.restore();
}

// ------------------------------------------------------------------- shapes

/**
 * One entry per family.
 *
 * `shell` is the coloured body — softer, wider, and it carries the silhouette.
 * `core` is the white centre that burns through it, and is always crisper and
 * more opaque, because a core that fades looks like a smudge rather than heat.
 */
const SHAPES: Record<ProjFamilyId, Draw> = {
  // ---- clean energy -------------------------------------------------------
  pellet: (ctx, hx, hy, mode) => {
    if (mode === 'core') {
      blob(ctx, hx, hy, [[0, 1], [0.62, 0.98], [1, 0]]);
      return;
    }
    blob(ctx, hx, hy, [[0, 0.9], [0.4, 0.72], [0.72, 0.34], [1, 0]]);
    // A defined rim, or the bullet dissolves into its own halo. Kept faint: a
    // strong rim plus a small core turns a large pellet into a donut, which is
    // what `ring` is for, and the two then collide across the roster.
    ctx.strokeStyle = white(0.3);
    ctx.lineWidth = hx * 0.09;
    ctx.beginPath();
    ctx.ellipse(0, 0, hx * 0.76, hy * 0.76, 0, 0, Math.PI * 2);
    ctx.stroke();
  },

  orb: (ctx, hx, hy, mode) => {
    if (mode === 'core') {
      blob(ctx, hx, hy, [[0, 1], [0.55, 0.92], [1, 0]]);
      return;
    }
    blob(ctx, hx, hy, [[0, 0.72], [0.35, 0.6], [0.68, 0.3], [1, 0]]);
    ctx.strokeStyle = white(0.4);
    ctx.lineWidth = hx * 0.1;
    ctx.beginPath();
    ctx.ellipse(0, 0, hx * 0.8, hy * 0.8, 0, 0, Math.PI * 2);
    ctx.stroke();
  },

  beam: (ctx, hx, hy, mode) => {
    if (mode === 'core') {
      capsulePath(ctx, hx, hy);
      fillGlow(ctx, 1, hy * 1.2);
      return;
    }
    capsulePath(ctx, hx, hy);
    ctx.save();
    ctx.clip();
    const g = ctx.createLinearGradient(0, -hy, 0, hy);
    g.addColorStop(0, white(0.16));
    g.addColorStop(0.5, white(0.95));
    g.addColorStop(1, white(0.16));
    ctx.fillStyle = g;
    ctx.fillRect(-hx, -hy, hx * 2, hy * 2);
    ctx.restore();
    capsulePath(ctx, hx, hy);
    ctx.strokeStyle = white(0.6);
    ctx.lineWidth = hy * 0.16;
    ctx.stroke();
  },

  plasma: (ctx, hx, hy, mode) => {
    // Deterministic lobes, so the blob is irregular but never re-rolls.
    const lobes: [number, number, number][] = [
      [0.22, -0.1, 0.72], [-0.3, 0.16, 0.6], [0.05, 0.3, 0.5], [-0.05, -0.34, 0.46],
    ];
    if (mode === 'core') {
      blob(ctx, hx * 0.9, hy * 0.9, [[0, 1], [0.6, 0.9], [1, 0]]);
      return;
    }
    for (const [ox, oy, r] of lobes) {
      ctx.save();
      ctx.translate(ox * hx, oy * hy);
      blob(ctx, hx * r, hy * r, [[0, 0.5], [0.5, 0.36], [1, 0]]);
      ctx.restore();
    }
    blob(ctx, hx * 0.72, hy * 0.72, [[0, 0.6], [0.55, 0.4], [1, 0]]);
  },

  // ---- thin and fast ------------------------------------------------------
  needle: (ctx, hx, hy, mode) => {
    if (mode === 'core') {
      lensPath(ctx, hx, hy, 0.66);
      fillGlow(ctx, 1, hy * 2.4);
      return;
    }
    lensPath(ctx, hx, hy, 0.66);
    fillGlow(ctx, 0.85, hy * 3.2);
    // A brighter forward third: a rail shot is hottest at its point.
    ctx.save();
    ctx.translate(hx * 0.5, 0);
    blob(ctx, hx * 0.4, hy * 1.6, [[0, 0.6], [1, 0]]);
    ctx.restore();
  },

  shard: (ctx, hx, hy, mode) => {
    poly(ctx, [
      [hx, 0], [hx * 0.3, -hy], [-hx * 0.55, -hy * 0.8], [-hx, 0], [-hx * 0.55, hy * 0.8], [hx * 0.3, hy],
    ]);
    if (mode === 'core') fillGlow(ctx, 1, hy * 0.9);
    else {
      fillGlow(ctx, 0.62, hy * 1.6);
      ctx.strokeStyle = white(0.8);
      ctx.lineWidth = hy * 0.14;
      ctx.stroke();
    }
  },

  dart: (ctx, hx, hy, mode) => {
    // Arrowhead with shallow fletching. A deeper tail notch turns this into a
    // bowtie — it stops reading as one arrow and starts reading as two heads.
    poly(ctx, [
      [hx, 0], [hx * 0.05, -hy], [-hx * 0.42, -hy * 0.34], [-hx * 0.95, -hy * 0.56],
      [-hx * 0.8, 0], [-hx * 0.95, hy * 0.56], [-hx * 0.42, hy * 0.34], [hx * 0.05, hy],
    ]);
    if (mode === 'core') fillGlow(ctx, 1, hy * 0.8);
    else {
      fillGlow(ctx, 0.7, hy * 1.5);
      ctx.strokeStyle = white(0.75);
      ctx.lineWidth = hy * 0.12;
      ctx.stroke();
    }
  },

  kunai: (ctx, hx, hy, mode) => {
    poly(ctx, [[hx, 0], [-hx * 0.2, -hy], [-hx * 0.72, -hy * 0.42], [-hx, 0], [-hx * 0.72, hy * 0.42], [-hx * 0.2, hy]]);
    if (mode === 'core') fillGlow(ctx, 1, hy * 0.7);
    else {
      fillGlow(ctx, 0.66, hy * 1.4);
      ctx.strokeStyle = white(0.85);
      ctx.lineWidth = hy * 0.11;
      ctx.stroke();
    }
  },

  // ---- big and slow -------------------------------------------------------
  slug: (ctx, hx, hy, mode) => {
    // Blunt nose forward, tapering tail — a shell, not a bullet.
    ctx.beginPath();
    ctx.moveTo(-hx, 0);
    ctx.quadraticCurveTo(-hx * 0.2, -hy, hx * 0.55, -hy * 0.82);
    ctx.quadraticCurveTo(hx, -hy * 0.55, hx, 0);
    ctx.quadraticCurveTo(hx, hy * 0.55, hx * 0.55, hy * 0.82);
    ctx.quadraticCurveTo(-hx * 0.2, hy, -hx, 0);
    ctx.closePath();
    if (mode === 'core') fillGlow(ctx, 1, hy * 0.6);
    else {
      fillGlow(ctx, 0.6, hy * 1.1);
      ctx.strokeStyle = white(0.62);
      ctx.lineWidth = hy * 0.13;
      ctx.stroke();
    }
  },

  mortar: (ctx, hx, hy, mode) => {
    if (mode === 'core') {
      blob(ctx, hx, hy, [[0, 1], [0.6, 0.9], [1, 0]]);
      return;
    }
    const spikes = 10;
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const a = (i / (spikes * 2)) * Math.PI * 2;
      const r = i % 2 === 0 ? 1 : 0.56;
      const x = Math.cos(a) * hx * r;
      const y = Math.sin(a) * hy * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    fillGlow(ctx, 0.55, hy * 0.5);
    blob(ctx, hx * 0.6, hy * 0.6, [[0, 0.75], [0.6, 0.5], [1, 0]]);
  },

  ring: (ctx, hx, hy, mode) => {
    // A dark centre is the whole point of a ring bullet, so neither layer fills.
    const r = mode === 'core' ? 0.74 : 0.72;
    ctx.strokeStyle = white(mode === 'core' ? 1 : 0.8);
    ctx.lineWidth = (mode === 'core' ? 0.1 : 0.26) * Math.min(hx, hy);
    ctx.save();
    ctx.shadowColor = white(0.8);
    ctx.shadowBlur = Math.min(hx, hy) * (mode === 'core' ? 0.3 : 0.55);
    ctx.beginPath();
    ctx.ellipse(0, 0, hx * r, hy * r, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.stroke();
    ctx.restore();
  },

  wave: (ctx, hx, hy, mode) => {
    // Crescent whose belly leads and whose horns trail.
    const lw = (mode === 'core' ? 0.14 : 0.3) * hx;
    ctx.strokeStyle = white(mode === 'core' ? 1 : 0.78);
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.save();
    ctx.shadowColor = white(0.8);
    ctx.shadowBlur = hx * (mode === 'core' ? 0.25 : 0.6);
    ctx.beginPath();
    ctx.ellipse(-hx * 0.55, 0, hx * 1.4, hy * 0.96, 0, -0.95, 0.95);
    ctx.stroke();
    ctx.stroke();
    ctx.restore();
  },

  // ---- ordnance and elements ---------------------------------------------
  rocket: (ctx, hx, hy, mode) => {
    if (mode === 'core') {
      // The core of a missile is its motor, not its body: a hot plug at the
      // tail and a thin bright spine forward of it.
      ctx.save();
      ctx.translate(-hx * 0.78, 0);
      blob(ctx, hx * 0.3, hy * 0.62, [[0, 1], [0.4, 0.8], [1, 0]]);
      ctx.restore();
      capsulePath(ctx, hx * 0.52, hy * 0.13);
      fillGlow(ctx, 0.95, hy * 0.4);
      return;
    }
    // Swept fins, drawn well proud of the body so they read as fins rather
    // than as a widening of the hull.
    for (const s of [-1, 1]) {
      poly(ctx, [
        [-hx * 0.42, s * hy * 0.3],
        [-hx * 0.86, s * hy],
        [-hx * 0.96, s * hy * 0.92],
        [-hx * 0.7, s * hy * 0.28],
      ]);
      fillGlow(ctx, 0.75, hy * 0.3);
    }
    // Slim hull with a long conical nose.
    ctx.beginPath();
    ctx.moveTo(hx, 0);
    ctx.quadraticCurveTo(hx * 0.62, -hy * 0.34, hx * 0.28, -hy * 0.38);
    ctx.lineTo(-hx * 0.9, -hy * 0.34);
    ctx.quadraticCurveTo(-hx, 0, -hx * 0.9, hy * 0.34);
    ctx.lineTo(hx * 0.28, hy * 0.38);
    ctx.quadraticCurveTo(hx * 0.62, hy * 0.34, hx, 0);
    ctx.closePath();
    fillGlow(ctx, 0.8, hy * 0.35);
    ctx.strokeStyle = white(0.95);
    ctx.lineWidth = hy * 0.1;
    ctx.stroke();
  },

  flame: (ctx, hx, hy, mode) => {
    // A tongue, not a cloud: a fat *rounded* head at the nose narrowing to a
    // wavering point behind it.
    //
    // The first attempt tapered at both ends, which on a near-square cell is
    // simply a lens — hence the cauliflower. The head has to stay at full width
    // and only round over the last few percent before the nose.
    const wob = mode === 'core' ? 0.05 : 0.14;
    const w = (t: number, s: number): number => {
      // Full width at the head, falling away to a point at the tail...
      const body = Math.cos(t * Math.PI * 0.5) ** 0.55;
      // ...with the nose itself capped round rather than cut off square.
      const nose = Math.sin(Math.PI * 0.5 * Math.min(1, t / 0.13));
      const base = body * nose;
      return (base + Math.sin(t * 11 + (s > 0 ? 0 : 2.4)) * wob * base) * hy * (mode === 'core' ? 0.72 : 1);
    };
    ctx.beginPath();
    const steps = 46;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = hx - t * hx * 2;
      const y = -w(t, 1);
      if (i === 0) ctx.moveTo(x, 0);
      else ctx.lineTo(x, y);
    }
    for (let i = steps; i >= 0; i--) {
      const t = i / steps;
      ctx.lineTo(hx - t * hx * 2, w(t, -1));
    }
    ctx.closePath();
    fillGlow(ctx, mode === 'core' ? 0.95 : 0.5, hy * (mode === 'core' ? 0.5 : 1.1));
    // A hotter heart just behind the leading edge.
    ctx.save();
    ctx.translate(hx * 0.3, 0);
    blob(ctx, hx * 0.42, hy * 0.5, [[0, mode === 'core' ? 1 : 0.55], [0.5, 0.34], [1, 0]]);
    ctx.restore();
  },

  bolt: (ctx, hx, hy, mode) => {
    // A fixed zigzag: an electric arc that re-rolled every frame would strobe.
    const pts: [number, number][] = [
      [-hx, 0], [-hx * 0.58, -hy * 0.72], [-hx * 0.18, hy * 0.28], [hx * 0.12, -hy * 0.5],
      [hx * 0.5, hy * 0.62], [hx * 0.78, -hy * 0.2], [hx, 0],
    ];
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = white(mode === 'core' ? 1 : 0.72);
    ctx.lineWidth = (mode === 'core' ? 0.16 : 0.36) * hy;
    ctx.save();
    ctx.shadowColor = white(0.9);
    ctx.shadowBlur = hy * (mode === 'core' ? 0.4 : 0.9);
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();
    ctx.stroke();
    ctx.restore();
    // Deliberately no forks. Two passes at drawing them — off a mid-path vertex
    // and off the extreme vertices — both read as a grey scratch laid across the
    // bright zigzag rather than as a branch, because a thin low-alpha line
    // cannot compete with a stroke six times its width and a glow around it. The
    // bolt is legible as electricity from its silhouette, its heavy flicker and
    // its `arc` impact; at the ~78px this actually draws at, a fork is noise.
  },

  star: (ctx, hx, hy, mode) => {
    const arms: [number, number][] = [[1, 0.16], [0.52, 0.34]];
    for (const [lx, ly] of arms) {
      for (const rot of [0, Math.PI / 2]) {
        ctx.save();
        ctx.rotate(rot);
        lensPath(ctx, hx * lx, hy * ly * (mode === 'core' ? 0.7 : 1), 0.5);
        fillGlow(ctx, mode === 'core' ? 1 : 0.6, hy * 0.4);
        ctx.restore();
      }
    }
    blob(ctx, hx * 0.34, hy * 0.34, [[0, mode === 'core' ? 1 : 0.75], [0.5, 0.5], [1, 0]]);
  },
};

// ------------------------------------------------------------------ packing

/** Anisotropic core shrink: elongated shapes keep their length, lose their width. */
function coreExtents(length: number, width: number, core: number): [number, number] {
  const long = Math.max(length, width);
  const short = Math.min(length, width);
  const elong = 1 - short / long;
  const k = core + (1 - core) * elong * 0.75;
  return length >= width ? [k, core] : [core, k];
}

/** Frame name for a family's shell / core cell. */
export const shellFrame = (id: ProjFamilyId): string => id;
export const coreFrame = (id: ProjFamilyId): string => `${id}_core`;

/**
 * Builds the packed projectile texture. Idempotent — `BootScene` and the battle
 * scene may both ask for it.
 */
export function createProjectileTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(PROJ_TEX)) return;

  const cells = PROJ_FAMILY_IDS.length * 2 + 1;
  const rows = Math.ceil(cells / COLS);
  const tex = scene.textures.createCanvas(PROJ_TEX, COLS * CELL, rows * CELL);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = true;

  let slot = 0;
  const place = (name: string, draw: (c: CanvasRenderingContext2D) => void): void => {
    const cx = (slot % COLS) * CELL;
    const cy = Math.floor(slot / COLS) * CELL;
    ctx.save();
    ctx.translate(cx + CELL / 2, cy + CELL / 2);
    draw(ctx);
    ctx.restore();
    tex.add(name, 0, cx, cy, CELL, CELL);
    slot++;
  };

  for (const id of PROJ_FAMILY_IDS) {
    const f = PROJ_FAMILIES[id];
    const long = Math.max(f.length, f.width);
    const hx = R * (f.length / long);
    const hy = R * (f.width / long);
    const [kx, ky] = coreExtents(f.length, f.width, f.core);

    place(shellFrame(id), (c) => SHAPES[id](c, hx, hy, 'shell'));
    if (f.core > 0) place(coreFrame(id), (c) => SHAPES[id](c, hx * kx, hy * ky, 'core'));
    else place(coreFrame(id), () => {});
  }

  // Shared soft bloom, in the same texture so it batches with the shapes.
  place(PROJ_HALO_FRAME, (c) => {
    blob(c, R, R, [[0, 0.62], [0.25, 0.36], [0.58, 0.12], [1, 0]]);
  });

  tex.refresh();
}
