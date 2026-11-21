import * as THREE from 'three';
import { WORLD_PER_PX, worldX, worldY } from './World';

/**
 * The slice of Phaser's `Graphics` API the battle overlays draw with, drawn
 * into the fight plane of the 3D yard instead.
 *
 * AEGIS's dome, the arc and feed tethers, ARBITER's paint reticle, the sniper's
 * sight line, the LAST STAND and OVERDRIVE auras, the drone's bars and the
 * debug hitboxes are all a few hundred lines of carefully tuned `lineStyle` /
 * `strokeCircle` / `arc` calls, every number of which was looked at and kept.
 * Rewriting them for 3D would have thrown that tuning away. This adapter takes
 * the same calls, in the same simulation coordinates, and emits flat triangles
 * at z = `z` in world space, so the overlays are unchanged and simply live in
 * the yard now.
 *
 * Lines are quads (WebGL has no wide lines); circles and arcs are polylines.
 * Everything is rebuilt each frame between `clear()` and the next render, which
 * is exactly how the callers already use Phaser's version.
 */

const LIVE = new Set<Gfx3D>();

/** Uploads every adapter's geometry. The battle view calls this before drawing. */
export function flushAllGfx(): void {
  for (const g of LIVE) g.flush();
}

export interface Gfx3DOptions {
  /** Depth of the drawing plane, world units. Positive is toward the camera. */
  z?: number;
  /** Draw over everything, ignoring depth (reticles, the things you must see). */
  overlay?: boolean;
}

export class Gfx3D {
  readonly mesh: THREE.Mesh;
  private readonly geo = new THREE.BufferGeometry();
  private readonly mat: THREE.MeshBasicMaterial;
  private pos = new Float32Array(0);
  private col = new Float32Array(0);
  private n = 0;
  private dirty = true;
  private lw = 1;
  private lr = 1;
  private lg = 1;
  private lb = 1;
  private la = 1;
  private fr = 1;
  private fg = 1;
  private fb = 1;
  private fa = 1;
  private alpha = 1;
  private readonly z: number;
  private path: number[] = [];
  /** Separate runs inside one path (moveTo starts a new one). */
  private runs: number[][] = [];

  constructor(parent: THREE.Object3D, opts: Gfx3DOptions = {}) {
    this.z = opts.z ?? 0;
    this.mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      depthTest: !opts.overlay,
      side: THREE.DoubleSide,
      toneMapped: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = opts.overlay ? 40 : 18;
    parent.add(this.mesh);
    this.ensure(4096);
    LIVE.add(this);
  }

  private ensure(verts: number): void {
    if (this.pos.length / 3 >= verts) return;
    let cap = Math.max(1024, this.pos.length / 3);
    while (cap < verts) cap *= 2;
    const p = new Float32Array(cap * 3);
    const c = new Float32Array(cap * 4);
    p.set(this.pos.subarray(0, this.n * 3));
    c.set(this.col.subarray(0, this.n * 4));
    this.pos = p;
    this.col = c;
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
  }

  private vert(x: number, y: number, r: number, g: number, b: number, a: number): void {
    this.ensure(this.n + 1);
    const i = this.n++;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = this.z;
    this.col[i * 4] = r;
    this.col[i * 4 + 1] = g;
    this.col[i * 4 + 2] = b;
    this.col[i * 4 + 3] = a;
    this.dirty = true;
  }

  /** A triangle in world units with the fill colour. */
  private tri(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, r: number, g: number, b: number, a: number): void {
    this.vert(ax, ay, r, g, b, a);
    this.vert(bx, by, r, g, b, a);
    this.vert(cx, cy, r, g, b, a);
  }

  /** A stroked segment between two sim points. */
  private seg(x1: number, y1: number, x2: number, y2: number): void {
    const ax = worldX(x1);
    const ay = worldY(y1);
    const bx = worldX(x2);
    const by = worldY(y2);
    const dx = bx - ax;
    const dy = by - ay;
    const l = Math.hypot(dx, dy) || 1;
    const h = (this.lw * WORLD_PER_PX) / 2;
    const nx = (-dy / l) * h;
    const ny = (dx / l) * h;
    const { lr: r, lg: g, lb: b } = this;
    const a = this.la;
    this.tri(ax + nx, ay + ny, bx + nx, by + ny, bx - nx, by - ny, r, g, b, a);
    this.tri(ax + nx, ay + ny, bx - nx, by - ny, ax - nx, ay - ny, r, g, b, a);
  }

  private static rgb(c: number): [number, number, number] {
    return [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
  }

  // ------------------------------------------------------ the Phaser surface

  clear(): this {
    this.n = 0;
    this.path = [];
    this.runs = [];
    this.dirty = true;
    return this;
  }

  lineStyle(width: number, color: number, alpha = 1): this {
    this.lw = width;
    [this.lr, this.lg, this.lb] = Gfx3D.rgb(color);
    this.la = alpha;
    return this;
  }

  fillStyle(color: number, alpha = 1): this {
    [this.fr, this.fg, this.fb] = Gfx3D.rgb(color);
    this.fa = alpha;
    return this;
  }

  lineBetween(x1: number, y1: number, x2: number, y2: number): this {
    this.seg(x1, y1, x2, y2);
    return this;
  }

  private ellipsePoints(x: number, y: number, rx: number, ry: number, a0 = 0, a1 = Math.PI * 2): number[] {
    const span = Math.abs(a1 - a0);
    const n = Math.max(8, Math.min(96, Math.ceil(span * Math.max(rx, ry) * 0.12)));
    const out: number[] = [];
    for (let i = 0; i <= n; i++) {
      const t = a0 + ((a1 - a0) * i) / n;
      out.push(x + Math.cos(t) * rx, y + Math.sin(t) * ry);
    }
    return out;
  }

  private strokePoly(p: number[]): void {
    for (let i = 0; i + 3 < p.length; i += 2) this.seg(p[i], p[i + 1], p[i + 2], p[i + 3]);
  }

  private fillFan(cx: number, cy: number, p: number[]): void {
    const wx = worldX(cx);
    const wy = worldY(cy);
    const { fr: r, fg: g, fb: b, fa: a } = this;
    for (let i = 0; i + 3 < p.length; i += 2) {
      this.tri(wx, wy, worldX(p[i]), worldY(p[i + 1]), worldX(p[i + 2]), worldY(p[i + 3]), r, g, b, a);
    }
  }

  strokeCircle(x: number, y: number, r: number): this {
    this.strokePoly(this.ellipsePoints(x, y, r, r));
    return this;
  }

  fillCircle(x: number, y: number, r: number): this {
    this.fillFan(x, y, this.ellipsePoints(x, y, r, r));
    return this;
  }

  /** Phaser's ellipse takes full width and height. */
  strokeEllipse(x: number, y: number, w: number, h: number): this {
    this.strokePoly(this.ellipsePoints(x, y, w / 2, h / 2));
    return this;
  }

  fillEllipse(x: number, y: number, w: number, h: number): this {
    this.fillFan(x, y, this.ellipsePoints(x, y, w / 2, h / 2));
    return this;
  }

  fillRect(x: number, y: number, w: number, h: number): this {
    const ax = worldX(x);
    const ay = worldY(y);
    const bx = worldX(x + w);
    const by = worldY(y + h);
    const { fr: r, fg: g, fb: b, fa: a } = this;
    this.tri(ax, ay, bx, ay, bx, by, r, g, b, a);
    this.tri(ax, ay, bx, by, ax, by, r, g, b, a);
    return this;
  }

  strokeRect(x: number, y: number, w: number, h: number): this {
    this.strokePoly([x, y, x + w, y, x + w, y + h, x, y + h, x, y]);
    return this;
  }

  beginPath(): this {
    this.path = [];
    this.runs = [];
    return this;
  }

  moveTo(x: number, y: number): this {
    if (this.path.length >= 4) this.runs.push(this.path);
    this.path = [x, y];
    return this;
  }

  lineTo(x: number, y: number): this {
    this.path.push(x, y);
    return this;
  }

  arc(x: number, y: number, r: number, start: number, end: number, anticlockwise = false): this {
    let a0 = start;
    let a1 = end;
    if (anticlockwise && a1 > a0) a1 -= Math.PI * 2;
    else if (!anticlockwise && a1 < a0) a1 += Math.PI * 2;
    const pts = this.ellipsePoints(x, y, r, r, a0, a1);
    this.path.push(...pts);
    return this;
  }

  closePath(): this {
    if (this.path.length >= 4) this.path.push(this.path[0], this.path[1]);
    return this;
  }

  strokePath(): this {
    for (const run of this.runs) this.strokePoly(run);
    this.strokePoly(this.path);
    return this;
  }

  fillPath(): this {
    const p = this.path;
    if (p.length >= 6) this.fillFan(p[0], p[1], p.slice(2));
    return this;
  }

  setDepth(d: number): this {
    // Keep overlays above the yard and below nothing in particular; the 2D
    // depth only ever ordered overlays among themselves.
    this.mesh.renderOrder = (this.mat.depthTest ? 18 : 40) + d * 0.01;
    return this;
  }

  setAlpha(a: number): this {
    this.alpha = a;
    this.mat.opacity = a;
    return this;
  }

  setVisible(v: boolean): this {
    this.mesh.visible = v;
    return this;
  }

  /** Phaser's ADD is 1; anything else is normal blending. */
  setBlendMode(mode: number | string): this {
    const add = mode === 1 || mode === 'ADD';
    this.mat.blending = add ? THREE.AdditiveBlending : THREE.NormalBlending;
    this.mat.needsUpdate = true;
    return this;
  }

  get visible(): boolean {
    return this.mesh.visible;
  }

  get alphaValue(): number {
    return this.alpha;
  }

  flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    const pa = this.geo.getAttribute('position') as THREE.BufferAttribute;
    const ca = this.geo.getAttribute('color') as THREE.BufferAttribute;
    pa.needsUpdate = true;
    ca.needsUpdate = true;
    this.geo.setDrawRange(0, this.n);
  }

  destroy(): void {
    LIVE.delete(this);
    this.mesh.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
  }
}
