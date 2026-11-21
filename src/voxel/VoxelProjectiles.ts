import * as THREE from 'three';
import { PROJ_FAMILIES, type ProjFamilyId } from '../projectiles/families';
import { ProjKind } from '../combat/types';
import { clamp } from '../core/MathUtil';
import type { Projectile } from '../projectiles/Projectile';
import { Grid, glow, meshGrid } from './VoxelKit';
import type { VoxelFx } from './VoxelFx';
import { glowTexture } from './VoxelArena';
import { WORLD_PER_PX, worldX, worldY } from './World';

/**
 * Live shots, as voxel shapes.
 *
 * The 2D layer's anatomy survives intact — a coloured **shell**, a white-hot
 * **core** inside it, a soft **halo** around both, the 60 Hz flicker and the
 * fade — because that is what makes a shot read as energy, and none of it was a
 * property of sprites. Each of the sixteen families gets a small voxel shape
 * standing in for its silhouette: a pellet is a ball, a needle a hairline, a
 * kunai a blade with a ring on its grip, a rocket an actual missile with a lit
 * body and a burning tail.
 *
 * The shell is drawn **additively** so the core shows through it, exactly the
 * reason the sprite version needed three layers: a solid shell would hide the
 * white centre. Per-instance colour carries both the pilot's tint and the
 * alpha, since for additive light the two are the same thing.
 */

interface Shape {
  grid: Grid;
  /** Extent along the heading and across it, in voxels. */
  len: number;
  wid: number;
}

const W = 0xffffff;
const BODY = 0x9aa3ad;
const BODY_DARK = 0x4a525c;

function shapeFor(id: ProjFamilyId): Shape {
  const g = new Grid();
  g.jit = 0.02;
  const G = glow(W);
  switch (id) {
    case 'pellet':
      g.ell(0, 0, 0, 3, 3, 3, G);
      return { grid: g, len: 7, wid: 7 };
    case 'orb':
      g.ell(0, 0, 0, 4, 4, 4, G);
      return { grid: g, len: 9, wid: 9 };
    case 'plasma':
      g.ell(0, 0, 0, 4, 3, 3, G);
      g.ell(2, 1, 1, 2, 2, 2, G);
      g.ell(-2, -1, -1, 2, 2, 2, G);
      return { grid: g, len: 10, wid: 8 };
    case 'beam':
      g.box(-8, -1, -1, 8, 1, 1, G);
      g.box(-10, 0, 0, 10, 0, 0, G);
      return { grid: g, len: 21, wid: 3 };
    case 'needle':
      g.box(-10, 0, 0, 10, 0, 0, G);
      g.box(-4, -1, 0, 6, 1, 0, G);
      return { grid: g, len: 21, wid: 3 };
    case 'shard':
      for (let x = -6; x <= 6; x++) {
        const hw = Math.round(2 * (1 - Math.abs(x) / 6.5));
        g.box(x, -hw, -Math.max(0, hw - 1), x, hw, Math.max(0, hw - 1), G);
      }
      return { grid: g, len: 13, wid: 5 };
    case 'dart':
      for (let x = 0; x <= 5; x++) {
        const hw = Math.round(2 * (1 - x / 5.5));
        g.box(x, -hw, 0, x, hw, 0, G);
      }
      g.box(-6, 0, 0, 0, 0, 0, G);
      g.box(-6, -2, 0, -5, 2, 0, G);
      return { grid: g, len: 12, wid: 5 };
    case 'kunai':
      for (let x = 0; x <= 6; x++) {
        const hw = Math.round(2.4 * (1 - x / 6.5));
        g.box(x, -hw, 0, x, hw, 0, G);
      }
      g.box(-4, 0, 0, -1, 0, 0, G);
      g.box(-6, -1, 0, -6, 1, 0, G);
      g.box(-7, 0, 0, -5, 0, 0, G);
      return { grid: g, len: 14, wid: 5 };
    case 'slug':
      g.ell(0, 0, 0, 6, 3, 3, G);
      return { grid: g, len: 13, wid: 7 };
    case 'mortar':
      g.ell(0, 0, 0, 4, 4, 4, G);
      g.box(-5, -1, -1, 5, 1, 1, G);
      return { grid: g, len: 11, wid: 9 };
    case 'ring':
      for (let a = 0; a < Math.PI * 2; a += 0.08) g.set(Math.round(Math.cos(a) * 5), Math.round(Math.sin(a) * 5), 0, G);
      for (let a = 0; a < Math.PI * 2; a += 0.12) g.set(Math.round(Math.cos(a) * 4), Math.round(Math.sin(a) * 4), 0, G);
      return { grid: g, len: 11, wid: 11 };
    case 'wave':
      for (let t = -1.25; t <= 1.25; t += 0.05) {
        g.set(Math.round(Math.cos(t) * 6 - 4), Math.round(Math.sin(t) * 6), 0, G);
        g.set(Math.round(Math.cos(t) * 5 - 4), Math.round(Math.sin(t) * 5), 0, G);
      }
      return { grid: g, len: 4, wid: 12 };
    case 'rocket':
      g.cyl('x', 0, 0, 1.4, -5, 3, (x) => (x % 3 === 0 ? BODY_DARK : BODY));
      g.box(4, -1, -1, 5, 1, 1, BODY);
      g.set(6, 0, 0, BODY);
      g.box(-5, -3, 0, -3, 3, 0, BODY_DARK);
      g.box(-5, 0, -3, -3, 0, 3, BODY_DARK);
      g.box(-7, -1, -1, -6, 1, 1, G);
      return { grid: g, len: 14, wid: 5 };
    case 'flame':
      for (let x = -6; x <= 5; x++) {
        const r = x > 2 ? 3 - (x - 2) : 1 + (x + 6) * 0.3;
        g.ell(x, 0, 0, 0, r, r, G);
      }
      return { grid: g, len: 12, wid: 7 };
    case 'bolt': {
      const pts = [[-8, 0], [-4, 2], [-1, -2], [3, 2], [8, 0]];
      for (let i = 0; i < pts.length - 1; i++) g.line(pts[i][0], pts[i][1], 0, pts[i + 1][0], pts[i + 1][1], 0, G);
      return { grid: g, len: 17, wid: 5 };
    }
    case 'star':
    default:
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2;
        g.line(0, 0, 0, Math.round(Math.cos(a) * 5), Math.round(Math.sin(a) * 5), 0, G);
      }
      g.box(-1, -1, -1, 1, 1, 1, G);
      return { grid: g, len: 11, wid: 11 };
  }
}

interface FamilyMeshes {
  shell: THREE.InstancedMesh;
  core: THREE.InstancedMesh;
  body: THREE.InstancedMesh | null;
  len: number;
  wid: number;
  n: number;
}

const CAP = 160;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();
const _d = new THREE.Vector3();
const _x = new THREE.Vector3(1, 0, 0);

/** A shot in FREE ORBIT's yard: world position and unit heading. */
export interface Shot3 {
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  family: ProjFamilyId;
  kind: ProjKind;
  visualScale: number;
  age: number;
  life: number;
  owner: number;
}

export class VoxelProjectiles {
  readonly group = new THREE.Group();
  private readonly fams = new Map<ProjFamilyId, FamilyMeshes>();
  private readonly halo: THREE.InstancedMesh;
  private haloN = 0;

  constructor(parent: THREE.Object3D) {
    parent.add(this.group);
    const shellMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const coreMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    for (const id of Object.keys(PROJ_FAMILIES) as ProjFamilyId[]) {
      const sh = shapeFor(id);
      const meshed = meshGrid(sh.grid, 1, { ao: true });
      const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, order: number): THREE.InstancedMesh => {
        const im = new THREE.InstancedMesh(geo, mat, CAP);
        im.setColorAt(0, _c.setRGB(1, 1, 1));
        im.instanceColor!.setUsage(THREE.DynamicDrawUsage);
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        im.count = 0;
        im.frustumCulled = false;
        im.renderOrder = order;
        this.group.add(im);
        return im;
      };
      const glowGeo = meshed.glow ?? new THREE.BufferGeometry();
      this.fams.set(id, {
        shell: mk(glowGeo, shellMat, 21),
        core: mk(glowGeo, coreMat, 20),
        body: meshed.lit ? mk(meshed.lit, bodyMat, 0) : null,
        len: sh.len,
        wid: sh.wid,
        n: 0,
      });
    }
    const haloGeo = new THREE.PlaneGeometry(1, 1);
    this.halo = new THREE.InstancedMesh(
      haloGeo,
      new THREE.MeshBasicMaterial({
        map: glowTexture(),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
      CAP,
    );
    this.halo.setColorAt(0, _c.setRGB(1, 1, 1));
    this.halo.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    this.halo.count = 0;
    this.halo.frustumCulled = false;
    this.halo.renderOrder = 19;
    this.group.add(this.halo);
  }

  private haloAt(x: number, y: number, sx: number, sy: number, rot: number, tint: number, a: number): void {
    if (this.haloN >= CAP) return;
    _e.set(0, 0, rot);
    _q.setFromEuler(_e);
    _p.set(x, y, 0.02);
    _s.set(sx, sy, 1);
    _m.compose(_p, _q, _s);
    this.halo.setMatrixAt(this.haloN, _m);
    this.halo.setColorAt(this.haloN, _c.setHex(tint).multiplyScalar(a));
    this.haloN++;
  }

  draw(projectiles: readonly Projectile[], tintOf: (ownerId: number) => number, fx: VoxelFx): void {
    for (const f of this.fams.values()) f.n = 0;
    this.haloN = 0;

    for (const p of projectiles) {
      if (!p.active) continue;
      const x = worldX(p.x);
      const y = worldY(p.y);
      const tint = tintOf(p.ownerId);

      if (p.kind === ProjKind.Melee) {
        this.haloAt(x, y, 0.5, 0.5, 0, tint, 0.4);
        continue;
      }

      const f = PROJ_FAMILIES[p.family];
      const fm = this.fams.get(p.family);
      if (!f || !fm || fm.n >= CAP) continue;
      const k = p.visualScale * WORLD_PER_PX;
      const rot =
        f.align === 'velocity' ? -p.angle : f.align === 'spin' ? -p.age * f.spin : 0;
      const flick = 1 - f.flicker * (p.age & 1);
      const fade = p.kind === ProjKind.Beam ? clamp(p.life / 12, 0.15, 1) : clamp(p.life / 8, 0.3, 1);
      const a = flick * fade;

      const sx = (f.length * k) / fm.len;
      const sy = (f.width * k) / fm.wid;
      // Round shapes tumble a little out of the plane, so a ball reads as a ball.
      const tumble = f.align === 'spin' ? p.age * 0.05 : f.align === 'upright' ? p.age * 0.03 : 0;
      _e.set(tumble * 0.6, tumble, rot);
      _q.setFromEuler(_e);
      _p.set(x, y, 0);
      _s.set(sx, sy, sy);
      _m.compose(_p, _q, _s);
      const i = fm.n++;
      fm.shell.setMatrixAt(i, _m);
      fm.shell.setColorAt(i, _c.setHex(tint).multiplyScalar(0.95 * a));
      if (fm.body) {
        fm.body.setMatrixAt(i, _m);
        fm.body.setColorAt(i, _c.setRGB(1, 1, 1));
      }
      const cs = f.core > 0 ? f.core * (0.75 + 0.25 * a) : 0.0001;
      _s.set(sx * cs, sy * cs, sy * cs);
      _m.compose(_p, _q, _s);
      fm.core.setMatrixAt(i, _m);
      fm.core.setColorAt(i, _c.setRGB(1, 1, 1));

      const hx = f.length * f.halo * k;
      const hy = Math.max(f.width, f.length * 0.22) * f.halo * k;
      this.haloAt(x, y, hx, hy, f.align === 'velocity' ? rot : 0, tint, 0.42 * a);

      if (f.trail > 0 && Math.random() < f.trail) fx.projTrail(p.prevX, p.prevY, p.angle, p.family, tint);
    }

    for (const f of this.fams.values()) {
      for (const im of [f.shell, f.core, f.body]) {
        if (!im) continue;
        im.count = f.n;
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
      }
    }
    this.halo.count = this.haloN;
    this.halo.instanceMatrix.needsUpdate = true;
    if (this.halo.instanceColor) this.halo.instanceColor.needsUpdate = true;
  }

  /**
   * FREE ORBIT's shots: world positions and true 3D headings rather than
   * side-on sim coordinates. Same shapes, same shell / core / halo anatomy; the
   * shape is turned down its heading with a quaternion, and the halo is a
   * billboard facing the lens, since there is no fight plane to lie in.
   */
  draw3(shots: readonly Shot3[], tintOf: (owner: number) => number, camera: THREE.Camera, fx: VoxelFx): void {
    for (const f of this.fams.values()) f.n = 0;
    this.haloN = 0;
    for (const p of shots) {
      const f = PROJ_FAMILIES[p.family];
      const fm = this.fams.get(p.family);
      if (!f || !fm || fm.n >= CAP) continue;
      const tint = tintOf(p.owner);
      const k = p.visualScale * WORLD_PER_PX;
      const flick = 1 - f.flicker * (p.age & 1);
      const fade = p.kind === ProjKind.Beam ? clamp(p.life / 12, 0.15, 1) : clamp(p.life / 8, 0.3, 1);
      const a = flick * fade;
      const sx = (f.length * k) / fm.len;
      const sy = (f.width * k) / fm.wid;
      _d.set(p.dx, p.dy, p.dz);
      if (f.align === 'velocity') {
        _q.setFromUnitVectors(_x, _d);
      } else {
        const spin = f.align === 'spin' ? p.age * f.spin : p.age * 0.03;
        _e.set(spin * 0.6, spin, spin * 0.3);
        _q.setFromEuler(_e);
      }
      _p.set(p.x, p.y, p.z);
      _s.set(sx, sy, sy);
      _m.compose(_p, _q, _s);
      const i = fm.n++;
      fm.shell.setMatrixAt(i, _m);
      fm.shell.setColorAt(i, _c.setHex(tint).multiplyScalar(0.95 * a));
      if (fm.body) {
        fm.body.setMatrixAt(i, _m);
        fm.body.setColorAt(i, _c.setRGB(1, 1, 1));
      }
      const cs = f.core > 0 ? f.core * (0.75 + 0.25 * a) : 0.0001;
      _s.set(sx * cs, sy * cs, sy * cs);
      _m.compose(_p, _q, _s);
      fm.core.setMatrixAt(i, _m);
      fm.core.setColorAt(i, _c.setRGB(1, 1, 1));
      if (this.haloN < CAP) {
        const h = Math.max(f.width, f.length * 0.5) * f.halo * k;
        _s.set(h, h, 1);
        _m.compose(_p, camera.quaternion, _s);
        this.halo.setMatrixAt(this.haloN, _m);
        this.halo.setColorAt(this.haloN, _c.setHex(tint).multiplyScalar(0.42 * a));
        this.haloN++;
      }
      if (f.trail > 0 && Math.random() < f.trail) {
        fx.burst(p.x - p.dx * 0.2, p.y - p.dy * 0.2, p.z - p.dz * 0.2, {
          n: 1,
          speed: 1.2,
          dir: [-p.dx, -p.dy, -p.dz],
          spread: 0.5,
          life: 0.3,
          size: Math.max(0.04, f.width * (f.trailScale ?? 0.2) * WORLD_PER_PX * 0.5),
          color: f.trailTint ?? tint,
          colorEnd: 0x101010,
          gravity: 0,
          drag: 0.5,
          jitter: 0.03,
          floor: false,
        });
      }
    }
    for (const f of this.fams.values()) {
      for (const im of [f.shell, f.core, f.body]) {
        if (!im) continue;
        im.count = f.n;
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
      }
    }
    this.halo.count = this.haloN;
    this.halo.instanceMatrix.needsUpdate = true;
    if (this.halo.instanceColor) this.halo.instanceColor.needsUpdate = true;
  }

  clear(): void {
    for (const f of this.fams.values()) {
      f.n = 0;
      f.shell.count = f.core.count = 0;
      if (f.body) f.body.count = 0;
    }
    this.halo.count = 0;
  }
}
