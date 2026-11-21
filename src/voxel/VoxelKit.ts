import * as THREE from 'three';

/**
 * The voxel kit: a paintable grid, a mesher with ambient occlusion, and the two
 * shared materials every voxel object in the game draws with.
 *
 * A TypeScript port of the kit the other voxel games share (KNOCK//BACK's
 * `voxel.js`), kept deliberately close to it so the look carries over:
 *
 * - every exposed face is one quad, darkened per corner by the voxels around it
 *   (classic voxel AO), with a fixed per-face shade so top, sides and underside
 *   read apart even under flat light;
 * - every voxel gets a small deterministic colour jitter so a flat panel reads
 *   as painted metal rather than plastic;
 * - colours flagged with `glow()` are emitted into a separate, unlit mesh — the
 *   game's energy (beams, eyes, running lights, thruster bells) ignores lighting
 *   and shadow, which is what makes it read as light.
 *
 * Conventions: +Y is up, +Z is toward the camera (the near side of a machine),
 * +X is a machine's forward when it faces right. A grid is painted in integer
 * voxel coordinates; the voxel at (0, 0, 0) is centred on the object's origin.
 * Colours are 0xRRGGBB.
 */

/** A flag bit above the 24 colour bits: the voxel is unlit light. */
export const GLOW = 0x1000000;
export const glow = (c: number): number => (c & 0xffffff) | GLOW;
export const isGlow = (c: number): boolean => (c & GLOW) !== 0;

/** A tiny deterministic hash, so per-voxel colour jitter is stable between builds. */
export function hash3(x: number, y: number, z: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

const OFF = 512;
const key = (x: number, y: number, z: number): number => ((x + OFF) * 1024 + (y + OFF)) * 1024 + (z + OFF);

export type Paint = number | ((x: number, y: number, z: number) => number);

/** A sparse voxel grid. */
export class Grid {
  readonly m = new Map<number, number>();
  /** Per-voxel brightness jitter, as a fraction. */
  jit = 0.06;

  set(x: number, y: number, z: number, c: number | null): this {
    x = Math.round(x);
    y = Math.round(y);
    z = Math.round(z);
    if (c == null || c < 0) this.m.delete(key(x, y, z));
    else this.m.set(key(x, y, z), c);
    return this;
  }

  get(x: number, y: number, z: number): number {
    const v = this.m.get(key(x, y, z));
    return v === undefined ? -1 : v;
  }

  has(x: number, y: number, z: number): boolean {
    return this.m.has(key(x, y, z));
  }

  private paintAt(c: Paint, x: number, y: number, z: number): number {
    return typeof c === 'function' ? c(x, y, z) : c;
  }

  /** Inclusive box. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: Paint): this {
    if (x0 > x1) [x0, x1] = [x1, x0];
    if (y0 > y1) [y0, y1] = [y1, y0];
    if (z0 > z1) [z0, z1] = [z1, z0];
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) {
          const v = this.paintAt(c, x, y, z);
          if (v >= 0) this.set(x, y, z, v);
        }
    return this;
  }

  /** Removes every voxel in an inclusive box. */
  cut(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): this {
    if (x0 > x1) [x0, x1] = [x1, x0];
    if (y0 > y1) [y0, y1] = [y1, y0];
    if (z0 > z1) [z0, z1] = [z1, z0];
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) this.m.delete(key(x, y, z));
    return this;
  }

  /** Ellipsoid centred at (cx, cy, cz). */
  ell(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, c: Paint): this {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
        for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
          const d = ((x - cx) / (rx + 0.5)) ** 2 + ((y - cy) / (ry + 0.5)) ** 2 + ((z - cz) / (rz + 0.5)) ** 2;
          if (d > 1) continue;
          const v = this.paintAt(c, x, y, z);
          if (v >= 0) this.set(x, y, z, v);
        }
    return this;
  }

  /** Cylinder along an axis, centred (c1, c2) on the other two, from a0 to a1. */
  cyl(axis: 'x' | 'y' | 'z', c1: number, c2: number, r: number, a0: number, a1: number, c: Paint): this {
    if (a0 > a1) [a0, a1] = [a1, a0];
    for (let a = a0; a <= a1; a++)
      for (let i = Math.floor(c1 - r); i <= Math.ceil(c1 + r); i++)
        for (let j = Math.floor(c2 - r); j <= Math.ceil(c2 + r); j++) {
          if ((i - c1) ** 2 + (j - c2) ** 2 > (r + 0.35) ** 2) continue;
          const [x, y, z] = axis === 'x' ? [a, i, j] : axis === 'y' ? [i, a, j] : [i, j, a];
          const v = this.paintAt(c, x, y, z);
          if (v >= 0) this.set(x, y, z, v);
        }
    return this;
  }

  /** A line of voxels with an optional radius. */
  line(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: Paint, r = 0): this {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)) * 2));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      const z = z0 + (z1 - z0) * t;
      if (r > 0) this.ell(x, y, z, r, r, r, c);
      else this.set(x, y, z, this.paintAt(c, Math.round(x), Math.round(y), Math.round(z)));
    }
    return this;
  }

  each(fn: (x: number, y: number, z: number, c: number) => void): void {
    for (const [k, v] of this.m) {
      const z = (k % 1024) - OFF;
      const y = (Math.floor(k / 1024) % 1024) - OFF;
      const x = Math.floor(k / 1048576) - OFF;
      fn(x, y, z, v);
    }
  }

  get size(): number {
    return this.m.size;
  }

  bounds(): { min: [number, number, number]; max: [number, number, number] } {
    const min: [number, number, number] = [1e9, 1e9, 1e9];
    const max: [number, number, number] = [-1e9, -1e9, -1e9];
    this.each((x, y, z) => {
      min[0] = Math.min(min[0], x);
      min[1] = Math.min(min[1], y);
      min[2] = Math.min(min[2], z);
      max[0] = Math.max(max[0], x);
      max[1] = Math.max(max[1], y);
      max[2] = Math.max(max[2], z);
    });
    return { min, max };
  }
}

// ------------------------------------------------------------------ mesher

interface Face {
  d: [number, number, number];
  c: [number, number, number][];
  s: number;
}

const FACES: Face[] = [
  { d: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], s: 0.86 },
  { d: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], s: 0.86 },
  { d: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], s: 1.0 },
  { d: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], s: 0.62 },
  { d: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], s: 0.94 },
  { d: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], s: 0.78 },
];
const AO = [0.52, 0.7, 0.86, 1.0];

export interface MeshOptions {
  /** Overrides the grid's own jitter. */
  jitter?: number;
  /** Skip faces pointing down (floors that are never seen from below). */
  noBottom?: boolean;
  /** Ambient occlusion on (default) or off. */
  ao?: boolean;
  /** Offset added to every voxel before scaling, in voxels. */
  offset?: [number, number, number];
}

interface Buckets {
  p: number[];
  n: number[];
  c: number[];
  i: number[];
}

export interface MeshedGrid {
  lit: THREE.BufferGeometry | null;
  glow: THREE.BufferGeometry | null;
}

const _col = new THREE.Color();

/**
 * Every exposed face becomes a quad, AO-darkened per corner and jittered per
 * voxel. Returns separate lit and glowing geometry; either may be null.
 */
export function meshGrid(grid: Grid, s: number, opts: MeshOptions = {}): MeshedGrid {
  const jit = opts.jitter ?? grid.jit;
  const off = opts.offset ?? [0, 0, 0];
  const lit: Buckets = { p: [], n: [], c: [], i: [] };
  const glo: Buckets = { p: [], n: [], c: [], i: [] };
  const solid = (x: number, y: number, z: number): boolean => grid.has(x, y, z);
  const useAo = opts.ao !== false;

  grid.each((x, y, z, v) => {
    const g = isGlow(v);
    const B = g ? glo : lit;
    _col.setHex(v & 0xffffff);
    const j = 1 + (hash3(x, y, z) - 0.5) * 2 * (g ? jit * 0.4 : jit);
    for (const F of FACES) {
      const [dx, dy, dz] = F.d;
      if (solid(x + dx, y + dy, z + dz)) continue;
      if (opts.noBottom && dy === -1) continue;
      const base = B.p.length / 3;
      const aos: number[] = [];
      const axes = [0, 1, 2].filter((k) => F.d[k] === 0);
      for (const cr of F.c) {
        const px = x - 0.5 + cr[0] + off[0];
        const py = y - 0.5 + cr[1] + off[1];
        const pz = z - 0.5 + cr[2] + off[2];
        B.p.push(px * s, py * s, pz * s);
        B.n.push(dx, dy, dz);
        let a = 3;
        if (!g && useAo) {
          const ox = x + dx;
          const oy = y + dy;
          const oz = z + dz;
          const u0 = cr[axes[0]] ? 1 : -1;
          const u1 = cr[axes[1]] ? 1 : -1;
          const e1 = [0, 0, 0];
          const e2 = [0, 0, 0];
          e1[axes[0]] = u0;
          e2[axes[1]] = u1;
          const s1 = solid(ox + e1[0], oy + e1[1], oz + e1[2]) ? 1 : 0;
          const s2 = solid(ox + e2[0], oy + e2[1], oz + e2[2]) ? 1 : 0;
          const sc = solid(ox + e1[0] + e2[0], oy + e1[1] + e2[1], oz + e1[2] + e2[2]) ? 1 : 0;
          a = s1 && s2 ? 0 : 3 - (s1 + s2 + sc);
        }
        aos.push(a);
        const k = (g ? 1 : F.s * AO[a]) * j;
        B.c.push(Math.min(1, _col.r * k), Math.min(1, _col.g * k), Math.min(1, _col.b * k));
      }
      // Flip the quad's diagonal where that hides the AO gradient better.
      if (aos[0] + aos[2] > aos[1] + aos[3]) B.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else B.i.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
    }
  });

  const mk = (B: Buckets): THREE.BufferGeometry | null => {
    if (!B.i.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(B.n, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(B.c, 3));
    geo.setIndex(B.i);
    geo.computeBoundingSphere();
    return geo;
  };
  return { lit: mk(lit), glow: mk(glo) };
}

// --------------------------------------------------------------- materials

let LIT: THREE.MeshLambertMaterial | null = null;
let GLOW_MAT: THREE.MeshBasicMaterial | null = null;

/** The shared lit voxel material. Clone it for anything that tints or flashes. */
export function litMat(): THREE.MeshLambertMaterial {
  if (!LIT) LIT = new THREE.MeshLambertMaterial({ vertexColors: true });
  return LIT;
}

/** The shared unlit material for glowing voxels. */
export function glowMat(): THREE.MeshBasicMaterial {
  if (!GLOW_MAT) GLOW_MAT = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  return GLOW_MAT;
}

export interface ObjectOptions extends MeshOptions {
  cast?: boolean;
  receive?: boolean;
  material?: THREE.Material;
}

/** A static object (a prop, a piece of scenery) from one grid. */
export function voxelObject(grid: Grid, s: number, opts: ObjectOptions = {}): THREE.Group {
  const G = meshGrid(grid, s, opts);
  const root = new THREE.Group();
  if (G.lit) {
    const m = new THREE.Mesh(G.lit, opts.material ?? litMat());
    m.castShadow = opts.cast !== false;
    m.receiveShadow = opts.receive !== false;
    root.add(m);
  }
  if (G.glow) root.add(new THREE.Mesh(G.glow, glowMat()));
  return root;
}

/**
 * A sky dome: a vertical gradient from `top` (zenith) through `mid` (horizon)
 * to `bottom`, unlit and unfogged.
 */
export function skyDome(radius: number, top: number, mid: number, bottom: number): THREE.Mesh {
  const geo = new THREE.SphereGeometry(radius, 32, 20);
  const pos = geo.attributes.position;
  const cols: number[] = [];
  const T = new THREE.Color(top);
  const M = new THREE.Color(mid);
  const B = new THREE.Color(bottom);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i) / radius;
    if (h >= 0) c.copy(M).lerp(T, Math.pow(h, 0.55));
    else c.copy(M).lerp(B, Math.min(1, -h * 3));
    cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const m = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  m.renderOrder = -10;
  m.name = 'sky';
  return m;
}

/** Scales a 0xRRGGBB colour's brightness, clamped. */
export function shade(c: number, k: number): number {
  const r = Math.min(255, Math.max(0, Math.round(((c >> 16) & 255) * k)));
  const g = Math.min(255, Math.max(0, Math.round(((c >> 8) & 255) * k)));
  const b = Math.min(255, Math.max(0, Math.round((c & 255) * k)));
  return (r << 16) | (g << 8) | b;
}

/** Linear blend of two 0xRRGGBB colours. */
export function mixHex(a: number, b: number, t: number): number {
  const ch = (s: number): number =>
    Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t) & 255;
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
