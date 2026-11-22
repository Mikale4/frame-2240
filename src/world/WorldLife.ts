import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Grid, glow, litMat, shade, voxelObject } from '../voxel/VoxelKit';
import { VoxelMech } from '../voxel/VoxelMech';
import { MECHS } from '../data/mechs';
import { CrowdSim, type CrowdAgent } from '../campaign/Crowd';
import { REGIONS, SPANS, regionById, spanGeometry, type RegionSpec } from '../campaign/Regions';
import type { WalkModel } from '../campaign/WorldModel';
import { animateFigure, extraLook, gesture, pilotFigure, setFigureShadows, type PilotFigure } from '../voxel/PilotFigure';
import { PALETTES } from './RegionBuilder';

/** People are drawn within this distance of the pilot, and dropped beyond the second. */
const SHOW = 75;
const DROP = 90;
/** Beyond this, people are posed every third frame: nobody can tell at that size. */
const NEAR = 40;
/** Only the nearest people cast shadows. */
const SHADOW = 26;
/**
 * Trams run on an overhead rail above the spans' catwalks: the car's floor is
 * this far over the walkway, clear of everyone walking under it.
 */
export const TRAM_LIFT = 4.2;
/** The rail's underside over the walkway, metres. */
const RAIL_Y = TRAM_LIFT + 3.75;

interface Vehicle {
  obj: THREE.Group;
  region: string;
  /** Route, world metres: back and forth between two clear points. */
  a: { x: number; z: number };
  b: { x: number; z: number };
  y: number;
  t: number;
  dir: 1 | -1;
  speed: number;
  wait: number;
  len: number;
  x: number;
  z: number;
}

export interface Tram {
  obj: THREE.Group;
  span: number;
  /** The route: points along the span's catwalk, world metres. */
  path: { x: number; y: number; z: number }[];
  /** Total length, metres. */
  length: number;
  /** Distance along the path, metres. */
  s: number;
  dir: 1 | -1;
  wait: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  /** Carrying the pilot: the scene drives it, the timetable leaves it alone. */
  held: boolean;
}

interface SkyCraft {
  obj: THREE.Object3D;
  mech?: VoxelMech;
  cx: number;
  cz: number;
  r: number;
  y: number;
  w: number;
  a: number;
}

const _v = new THREE.Vector3();

// ----------------------------------------------------------------- models

function crawlerModel(col: number): THREE.Group {
  const g = new Grid();
  g.jit = 0.03;
  // 0.5 m voxels: a 3.5 m cargo crawler with a cab, a bed and treads.
  g.box(-3, 0, -2, 3, 0, 1, 0x1c1f24);
  g.box(-3, 1, -2, 3, 1, 1, (x) => (x % 2 ? 0x2a2e33 : 0x1c1f24));
  g.box(-3, 2, -2, 1, 3, 1, col);
  g.box(-3, 4, -2, 1, 4, 1, shade(col, 1.15));
  g.box(2, 2, -2, 3, 4, 1, shade(col, 0.85));
  g.box(3, 3, -1, 3, 4, 0, glow(0x9fd4ff));
  g.set(3, 2, -2, glow(0xfff1c0)).set(3, 2, 1, glow(0xfff1c0));
  g.set(-3, 2, -2, glow(0xff3030)).set(-3, 2, 1, glow(0xff3030));
  g.box(2, 5, -1, 2, 5, -1, glow(0xffb020));
  const o = voxelObject(g, 0.5);
  o.position.y = 0.25;
  return o;
}

function cartModel(col: number): THREE.Group {
  const g = new Grid();
  g.jit = 0.03;
  g.box(-2, 0, -1, 1, 0, 0, 0x1c1f24);
  g.box(-2, 1, -1, 1, 1, 0, col);
  g.box(0, 2, -1, 1, 3, 0, shade(col, 0.8));
  g.box(0, 4, -1, 1, 4, 0, shade(col, 1.2));
  g.set(1, 1, -1, glow(0xfff1c0)).set(1, 1, 0, glow(0xfff1c0));
  g.set(-2, 1, -1, glow(0xff3030)).set(-2, 1, 0, glow(0xff3030));
  const o = voxelObject(g, 0.5);
  o.position.y = 0.25;
  return o;
}

function tramModel(col: number): THREE.Group {
  const g = new Grid();
  g.jit = 0.03;
  // A 6 m car on a bogie: lit windows down both sides, lamps at each end.
  g.box(-6, 0, -2, 5, 0, 1, 0x1c1f24);
  g.box(-6, 1, -2, 5, 4, 1, (x, y) => (y === 3 && x > -6 && x < 5 && x % 2 === 0 ? glow(0xffe0a0) : col));
  g.box(-6, 5, -2, 5, 5, 1, shade(col, 1.15));
  g.box(5, 2, -1, 5, 3, 0, glow(0xfff1c0));
  g.box(-6, 2, -1, -6, 3, 0, glow(0xfff1c0));
  g.box(-1, 6, -1, 0, 6, 0, 0x2a2e33);
  const o = voxelObject(g, 0.5);
  o.position.y = 0.25;
  return o;
}

function shuttleModel(): THREE.Group {
  const g = new Grid();
  g.jit = 0.03;
  // An 8 m lighter: hull, cockpit glow, stubby wings, engine glow, nav lights.
  g.box(-8, -1, -1, 7, 1, 1, (x) => (x % 4 === 0 ? 0x5a626e : 0x7d8794));
  g.box(5, 0, -1, 7, 1, 1, glow(0x9fd4ff));
  g.box(-3, 0, -5, 1, 0, 4, 0x56606c);
  g.box(-9, -1, -1, -9, 1, 1, glow(0xffa346));
  g.set(-1, 0, -5, glow(0xff3030)).set(-1, 0, 4, glow(0x30ff60));
  return voxelObject(g, 0.5, { cast: false });
}

/**
 * The overhead rail along a tram's route, with pylons wherever the route is
 * out over the drop. One merged mesh per span.
 */
function railModel(path: { x: number; y: number; z: number }[], walk: WalkModel, col: number): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];
  const colour = new THREE.Color(col);
  const dark = new THREE.Color(shade(col, 0.55));
  const box = (w: number, h: number, l: number, at: THREE.Vector3, dir: THREE.Vector3, c: THREE.Color): void => {
    const g = new THREE.BoxGeometry(w, h, l);
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), dir, new THREE.Vector3(0, 1, 0));
    m.setPosition(at);
    g.applyMatrix4(m);
    const n = g.attributes.position.count;
    const cols = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) cols.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    parts.push(g);
  };
  // Straight runs: merge points while the direction holds.
  const runs: [number, number][] = [];
  let start = 0;
  for (let k = 2; k <= path.length; k++) {
    if (k === path.length) {
      runs.push([start, k - 1]);
      break;
    }
    const a = path[k - 2];
    const b = path[k - 1];
    const c = path[k];
    const d1 = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z).normalize();
    const d2 = new THREE.Vector3(c.x - b.x, c.y - b.y, c.z - b.z).normalize();
    if (d1.dot(d2) < 0.9995) {
      runs.push([start, k - 1]);
      start = k - 1;
    }
  }
  const up = new THREE.Vector3(0, 1, 0);
  let sincePylon = 999;
  for (const [i, j] of runs) {
    const a = path[i];
    const b = path[j];
    const A = new THREE.Vector3(a.x, a.y + RAIL_Y, a.z);
    const B = new THREE.Vector3(b.x, b.y + RAIL_Y, b.z);
    const len = A.distanceTo(B);
    if (len < 0.05) continue;
    const dir = B.clone().sub(A).normalize();
    // A little longer than the run so the joints close.
    box(0.7, 0.45, len + 0.6, A.clone().add(B).multiplyScalar(0.5).addScaledVector(up, 0.22), dir, colour);
    box(0.35, 0.25, len + 0.6, A.clone().add(B).multiplyScalar(0.5).addScaledVector(up, 0.58), dir, dark);
    // Pylons out over the drop, every 26 m, beside the walkway.
    const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
    for (let d = 0; d < len; d += 2) {
      sincePylon += 2;
      if (sincePylon < 26) continue;
      const P = A.clone().addScaledVector(dir, d);
      const foot = P.clone().addScaledVector(side, 3.4);
      const floor = P.y - RAIL_Y;
      if (walk.ground(foot.x, foot.z, floor + 0.6) !== null) continue;
      sincePylon = 0;
      const h = RAIL_Y + 14;
      box(0.6, h, 0.6, new THREE.Vector3(foot.x, P.y + 0.5 - h / 2, foot.z), dir, dark);
      box(3.6, 0.4, 0.5, P.clone().addScaledVector(side, 1.7).addScaledVector(up, 0.5), dir, dark);
    }
  }
  const geo = mergeGeometries(parts)!;
  for (const g of parts) g.dispose();
  const mesh = new THREE.Mesh(geo, litMat());
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

/** A tram stop: a lit sign on a pole, the pilot reads it from across the deck. */
function stopModel(col: number): THREE.Group {
  const g = new Grid();
  g.jit = 0.02;
  g.box(0, 0, 0, 0, 9, 0, 0x2a2e33);
  g.box(-1, 10, 0, 2, 12, 0, (x, y) => (y === 11 && x >= 0 && x <= 1 ? glow(0xfff1c0) : shade(col, 0.8)));
  g.set(-1, 13, 0, glow(col)).set(2, 13, 0, glow(col));
  return voxelObject(g, 0.25, { cast: false });
}

// ------------------------------------------------------------------ the life

/**
 * Everything that moves in the Reach that is not the story: the crowds, the
 * deck traffic, the trams along the spans, and the craft in the sky.
 */
export class WorldLife {
  readonly crowd: CrowdSim;
  readonly group = new THREE.Group();
  private readonly figures = new Map<string, PilotFigure>();
  readonly vehicles: Vehicle[] = [];
  readonly trams: Tram[] = [];
  private readonly sky: SkyCraft[] = [];
  private readonly shadowsOn = new Map<string, boolean>();

  constructor(
    private readonly walk: WalkModel,
    seed = 0x11fe,
  ) {
    this.crowd = new CrowdSim(walk, seed);
    this.buildVehicles();
    this.buildTrams();
    this.buildSky();
  }

  // ------------------------------------------------------------ vehicles

  /** Is the straight line between two points clear deck the whole way? */
  private clear(r: RegionSpec, a: { x: number; z: number }, b: { x: number; z: number }, half: number): boolean {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 1.5);
    for (let i = 0; i <= n; i++) {
      const x = a.x + ((b.x - a.x) * i) / n;
      const z = a.z + ((b.z - a.z) * i) / n;
      if (this.walk.standAt(x, z, r.y, half) === null) return false;
    }
    return true;
  }

  private buildVehicles(): void {
    for (const r of REGIONS) {
      if (r.id === 'cathedral' || r.id === 'surveypost') continue;
      const P = PALETTES[r.style];
      // Candidate runs: across the open middle of the deck, both axes.
      const runs: [{ x: number; z: number }, { x: number; z: number }][] = [];
      for (const off of [-14, 12, -4]) {
        runs.push([
          { x: r.cx - r.w / 2 + 10, z: r.cz + off },
          { x: r.cx + r.w / 2 - 10, z: r.cz + off },
        ]);
        runs.push([
          { x: r.cx + off * 1.3, z: r.cz - r.d / 2 + 10 },
          { x: r.cx + off * 1.3, z: r.cz + r.d / 2 - 10 },
        ]);
      }
      let made = 0;
      for (const [a, b] of runs) {
        if (made >= 3) break;
        if (!this.clear(r, a, b, 1.6)) continue;
        const crawler = made % 2 === 0;
        const obj = crawler ? crawlerModel(P.cargo[made % P.cargo.length]) : cartModel(P.accent);
        this.group.add(obj);
        this.vehicles.push({
          obj,
          region: r.id,
          a,
          b,
          y: r.y,
          t: made * 0.37,
          dir: 1,
          speed: crawler ? 3.2 : 5.2,
          wait: 0,
          len: crawler ? 3.5 : 2,
          x: a.x,
          z: a.z,
        });
        made++;
      }
    }
  }

  private buildTrams(): void {
    SPANS.forEach((s, i) => {
      const g = spanGeometry(s);
      const A = regionById(s.from)!;
      const B = regionById(s.to)!;
      const xFirst = Math.abs(g.b.x - g.a.x) >= Math.abs(g.b.z - g.a.z);
      const corner = xFirst ? { x: g.b.x, z: g.a.z } : { x: g.a.x, z: g.b.z };
      // In from a stop a little inside each yard, along the catwalk, round the corner.
      const stopA = { x: g.a.x + (A.cx - g.a.x) * 0.06, z: g.a.z + (A.cz - g.a.z) * 0.06 };
      const stopB = { x: g.b.x + (B.cx - g.b.x) * 0.06, z: g.b.z + (B.cz - g.b.z) * 0.06 };
      const raw = [
        { x: stopA.x, z: stopA.z },
        { x: g.a.x, z: g.a.z },
        { x: corner.x, z: corner.z },
        { x: g.b.x, z: g.b.z },
        { x: stopB.x, z: stopB.z },
      ];
      // Densify, and take the height the walk model gives at each point.
      const path: { x: number; y: number; z: number }[] = [];
      let feet = A.y;
      for (let k = 0; k < raw.length - 1; k++) {
        const p = raw[k];
        const q = raw[k + 1];
        const n = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.z - p.z) / 2));
        for (let j = 0; j < n; j++) {
          const x = p.x + ((q.x - p.x) * j) / n;
          const z = p.z + ((q.z - p.z) * j) / n;
          feet = this.walk.ground(x, z, feet + 0.6) ?? feet;
          path.push({ x, y: feet, z });
        }
      }
      path.push({ x: stopB.x, y: B.y, z: stopB.z });
      let length = 0;
      for (let k = 1; k < path.length; k++) length += Math.hypot(path[k].x - path[k - 1].x, path[k].y - path[k - 1].y, path[k].z - path[k - 1].z);
      const obj = tramModel(PALETTES[A.style].accent);
      this.group.add(obj);
      this.group.add(railModel(path, this.walk, PALETTES[A.style].lip));
      // A stop at each end, a step to the side of where the car sets down.
      for (const [p, R] of [[path[0], A], [path[path.length - 1], B]] as const) {
        const q = p === path[0] ? path[1] : path[path.length - 2];
        const l = Math.hypot(q.x - p.x, q.z - p.z) || 1;
        const sx = p.x + (-(q.z - p.z) / l) * 3.2;
        const sz = p.z + ((q.x - p.x) / l) * 3.2;
        const st = stopModel(PALETTES[R.style].accent);
        st.position.set(sx, this.walk.ground(sx, sz, R.y + 0.6) ?? R.y, sz);
        this.group.add(st);
        this.walk.posts.push({ x: sx, z: sz, r: 0.25 });
      }
      this.trams.push({ obj, span: i, path, length, s: (i * 53) % length, dir: i % 2 ? 1 : -1, wait: 0, x: 0, y: 0, z: 0, heading: 0, held: false });
    });
  }

  private buildSky(): void {
    const ring = [
      { cx: 0, cz: 0, r: 260, y: 70, w: 0.04 },
      { cx: 0, cz: 0, r: 380, y: 95, w: -0.03 },
      { cx: 150, cz: -80, r: 170, y: 55, w: 0.05 },
      { cx: -160, cz: 120, r: 190, y: 62, w: -0.045 },
      { cx: 60, cz: 230, r: 150, y: 48, w: 0.05 },
      { cx: -200, cz: -200, r: 140, y: 80, w: 0.035 },
    ];
    ring.forEach((c, i) => {
      const obj = shuttleModel();
      this.group.add(obj);
      this.sky.push({ obj, ...c, a: i * 1.3 });
    });
    // Frames on patrol, in mobile form: the powers watching their lanes.
    const patrol: [string, number, number, number, number, number][] = [
      ['halcyon', 0, -330, 110, 60, 0.07],
      ['nocturne', -300, 190, 120, 70, -0.06],
      ['obelisk', 40, 340, 90, 52, 0.08],
    ];
    for (const [id, cx, cz, r, y, w] of patrol) {
      const m = new VoxelMech(MECHS[id]);
      m.root.scale.setScalar(3.15);
      this.group.add(m.root);
      this.sky.push({ obj: m.root, mech: m, cx, cz, r, y, w, a: cx * 0.01 });
    }
  }

  // --------------------------------------------------------------- update

  /** One frame. `me` is the pilot on foot; `dt` seconds; `t` the scene clock. */
  update(dt: number, t: number, me: { x: number; y: number; z: number }, frozen: boolean): void {
    // Yards whose centre is this close step; anyone further is past drawing range.
    if (!frozen) this.crowd.step(dt, me, 175, me);
    this.updateFigures(dt, t, me);
    this.updateVehicles(dt, me);
    this.updateTrams(dt);
    this.updateSky(dt, t);
    // People standing still and vehicles block the pilot.
    this.walk.moving.length = 0;
    for (const v of this.vehicles) this.walk.moving.push({ x: v.x, z: v.z, r: v.len * 0.55 });
    for (const a of this.crowd.agents) {
      if (a.mode !== 'walk' && Math.hypot(a.x - me.x, a.z - me.z) < 12) this.walk.moving.push({ x: a.x, z: a.z, r: 0.28 });
    }
  }

  private frameNo = 0;

  private updateFigures(dt: number, t: number, me: { x: number; z: number }): void {
    this.frameNo++;
    for (const a of this.crowd.agents) {
      const d = Math.hypot(a.x - me.x, a.z - me.z);
      let f = this.figures.get(a.id);
      if (!f && d < SHOW) {
        f = pilotFigure(a.sex === 'm' ? 'nocturne' : 'halcyon', undefined, extraLook(a.sex, a.seed, a.suit, a.trim));
        // A yard kid is a child: smaller all over.
        if (a.role === 'kid') f.root.scale.setScalar(0.72);
        this.figures.set(a.id, f);
        this.group.add(f.root);
        this.shadowsOn.set(a.id, true);
      } else if (f && d > DROP) {
        f.root.removeFromParent();
        this.figures.delete(a.id);
        continue;
      }
      if (!f) continue;
      const near = d < SHADOW;
      if (this.shadowsOn.get(a.id) !== near) {
        setFigureShadows(f, near);
        this.shadowsOn.set(a.id, near);
      }
      f.root.position.set(a.x, a.y, a.z);
      // Turn smoothly toward where they are facing.
      let dy = a.facing - f.root.rotation.y;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      f.root.rotation.y += dy * Math.min(1, dt * 8);
      if (a.gesture && !f.action) gesture(f, a.gesture);
      if (d < NEAR) animateFigure(f, a.mode === 'walk' ? Math.hypot(a.vx, a.vz) : 0, dt, t);
      else if ((this.frameNo + a.seed) % 3 === 0) animateFigure(f, a.mode === 'walk' ? Math.hypot(a.vx, a.vz) : 0, dt * 3, t);
    }
  }

  private updateVehicles(dt: number, me: { x: number; z: number }): void {
    for (const v of this.vehicles) {
      const len = Math.hypot(v.b.x - v.a.x, v.b.z - v.a.z);
      if (v.wait > 0) v.wait -= dt;
      else {
        // Yield to the pilot: stop if they are on the road just ahead.
        const fx = ((v.b.x - v.a.x) / len) * v.dir;
        const fz = ((v.b.z - v.a.z) / len) * v.dir;
        const ox = me.x - v.x;
        const oz = me.z - v.z;
        const ahead = ox * fx + oz * fz;
        const side = Math.abs(ox * fz - oz * fx);
        if (!(ahead > 0 && ahead < v.len + 3 && side < 2.2)) {
          v.t += (v.dir * v.speed * dt) / len;
          if (v.t >= 1 || v.t <= 0) {
            v.t = Math.max(0, Math.min(1, v.t));
            v.dir = v.dir > 0 ? -1 : 1;
            v.wait = 3 + (v.len % 3);
          }
        }
      }
      v.x = v.a.x + (v.b.x - v.a.x) * v.t;
      v.z = v.a.z + (v.b.z - v.a.z) * v.t;
      v.obj.position.set(v.x, v.y, v.z);
      const heading = Math.atan2(-(v.b.z - v.a.z) * v.dir, (v.b.x - v.a.x) * v.dir);
      v.obj.rotation.y = heading;
    }
  }

  /** Where along the path a distance falls; sets the tram's position and heading. */
  static place(tr: Tram): void {
    let s = Math.max(0, Math.min(tr.length, tr.s));
    for (let k = 1; k < tr.path.length; k++) {
      const p = tr.path[k - 1];
      const q = tr.path[k];
      const l = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
      if (s <= l || k === tr.path.length - 1) {
        const f = l > 0 ? Math.min(1, s / l) : 0;
        tr.x = p.x + (q.x - p.x) * f;
        tr.y = p.y + (q.y - p.y) * f;
        tr.z = p.z + (q.z - p.z) * f;
        tr.heading = Math.atan2(-(q.z - p.z) * tr.dir, (q.x - p.x) * tr.dir);
        return;
      }
      s -= l;
    }
  }

  private updateTrams(dt: number): void {
    for (const tr of this.trams) {
      if (tr.held) {
        WorldLife.place(tr);
        tr.obj.position.set(tr.x, tr.y + TRAM_LIFT, tr.z);
        tr.obj.rotation.y = tr.heading;
        continue;
      }
      if (tr.wait > 0) tr.wait -= dt;
      else {
        tr.s += tr.dir * 9 * dt;
        if (tr.s >= tr.length || tr.s <= 0) {
          tr.s = Math.max(0, Math.min(tr.length, tr.s));
          tr.dir = tr.dir > 0 ? -1 : 1;
          tr.wait = 8;
        }
      }
      WorldLife.place(tr);
      tr.obj.position.set(tr.x, tr.y + TRAM_LIFT, tr.z);
      tr.obj.rotation.y = tr.heading;
    }
  }

  private updateSky(dt: number, t: number): void {
    for (const c of this.sky) {
      c.a += c.w * dt;
      const x = c.cx + Math.cos(c.a) * c.r;
      const z = c.cz + Math.sin(c.a) * c.r;
      const y = c.y + Math.sin(c.a * 3) * 4;
      // Heading along the circle, the way it is turning.
      const yaw = Math.atan2(-Math.cos(c.a) * Math.sign(c.w), -Math.sin(c.a) * Math.sign(c.w));
      if (c.mech) {
        c.mech.pose3(
          {
            x, y, z, yaw, aim: 0, tilt: 0, roll: 0.25 * Math.sign(c.w), flourish: 0, mobile: 1, transforming: false,
            pitch: 0, thrust: 0.8, walkPhase: 0, stride: 0, legSwing: 0, swing: null, hitstop: false, bob: t, alive: true, satActive: false,
          },
          dt,
        );
        c.mech.root.scale.setScalar(3.15);
      } else {
        c.obj.position.set(x, y, z);
        c.obj.rotation.set(0, yaw, 0.18 * Math.sign(c.w));
      }
    }
  }

  /** The crowd agent nearest the pilot within reach, for the talk prompt. */
  nearestPerson(me: { x: number; z: number; facing: number }, reach: number): CrowdAgent | null {
    let best: CrowdAgent | null = null;
    let score = -Infinity;
    for (const a of this.crowd.agents) {
      const dx = a.x - me.x;
      const dz = a.z - me.z;
      const d = Math.hypot(dx, dz);
      if (d > reach || !this.figures.has(a.id)) continue;
      const s = 1 - d / reach + ((dx * Math.sin(me.facing) + dz * Math.cos(me.facing)) / (d || 1)) * 0.6;
      if (s > score) {
        score = s;
        best = a;
      }
    }
    return best;
  }

  /** The tram stop nearest the pilot within reach, and where it goes. */
  nearestStop(me: { x: number; z: number }, reach: number): { tram: Tram; end: 0 | 1; to: RegionSpec } | null {
    for (const tr of this.trams) {
      for (const end of [0, 1] as const) {
        const p = end === 0 ? tr.path[0] : tr.path[tr.path.length - 1];
        if (Math.hypot(p.x - me.x, p.z - me.z) < reach) {
          const s = SPANS[tr.span];
          return { tram: tr, end, to: regionById(end === 0 ? s.to : s.from)! };
        }
      }
    }
    return null;
  }

  figureOf(id: string): PilotFigure | undefined {
    return this.figures.get(id);
  }

  /** A world point a tram stop sits at, for markers. */
  stopPoint(tr: Tram, end: 0 | 1): THREE.Vector3 {
    const p = end === 0 ? tr.path[0] : tr.path[tr.path.length - 1];
    return _v.set(p.x, p.y, p.z);
  }

  dispose(): void {
    for (const c of this.sky) c.mech?.destroy();
    this.group.removeFromParent();
    this.figures.clear();
  }
}
