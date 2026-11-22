import * as THREE from 'three';
import type { VoxelView } from '../voxel/VoxelStage';
import { skyDome } from '../voxel/VoxelKit';
import { REGIONS, SPANS, type RegionSpec } from '../campaign/Regions';
import type { WalkModel } from '../campaign/WorldModel';
import { buildRegion, buildRegionRamps, buildSpan } from './RegionBuilder';

/**
 * Regions nearer than this are built; further than `HIDE` they are hidden.
 * The whole Reach built is ~480k triangles in under 50 draw calls, so in
 * practice everything ends up built and visible: from any yard you can see
 * the others hanging in the haze, which is what makes it one world.
 */
const BUILD = 900;
const HIDE = 1400;

export interface CamTarget {
  x: number;
  y: number;
  z: number;
}

/**
 * The Reach on screen: sky, cloud deck, sun, the regions and spans, and a
 * third-person camera.
 *
 * Regions are **built as you approach** — one per frame at most, nearest
 * first — and hidden when far, the Chao Garden's streaming idea at region
 * grain rather than chunk grain (the Reach is platforms in the air, and a
 * platform is the natural unit). The haze does the rest: at 300 m everything
 * has already gone to sky.
 *
 * The camera is the Chao Garden's: an orbit behind the pilot that drifts back
 * behind them while they walk, can be turned by hand, and pulls in (and up)
 * in front of anything solid between it and them.
 */
export class CampaignView implements VoxelView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.1, 1400);
  readonly actors = new THREE.Group();
  private readonly regions = new Map<string, THREE.Group>();
  private readonly sun: THREE.DirectionalLight;
  private readonly look = new THREE.Vector3();
  private readonly eye = new THREE.Vector3();
  private init = false;
  /** Camera yaw around the target, radians; 0 looks along -z. */
  yaw = 0;
  pitch = 0.32;
  dist = 4.8;
  /** A scripted camera, during cutscenes. */
  scripted: { eye: THREE.Vector3; at: THREE.Vector3 } | null = null;

  constructor(private readonly walk: WalkModel) {
    const s = this.scene;
    s.background = new THREE.Color(0x0b1020);
    s.fog = new THREE.Fog(0x1a2232, 140, 760);
    s.add(skyDome(1200, 0x05080f, 0x2a3448, 0x3a2a24));
    s.add(new THREE.HemisphereLight(0xbcd0ff, 0x3a2a20, 0.6 * Math.PI));
    this.sun = new THREE.DirectionalLight(0xffe2c0, 0.62 * Math.PI);
    this.sun.position.set(60, 120, 40);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -45;
    sc.right = 45;
    sc.top = 45;
    sc.bottom = -45;
    sc.near = 1;
    sc.far = 320;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006;
    s.add(this.sun, this.sun.target);
    s.add(this.cloudDeck());
    for (let i = 0; i < SPANS.length; i++) s.add(buildSpan(i));
    s.add(this.actors);
  }

  /** A sea of cloud far below: the storm layer's top, lit warm from beneath. */
  private cloudDeck(): THREE.Mesh {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = '#2a2a34';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const r = 6 + Math.random() * 26;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      const warm = Math.random() < 0.3;
      grd.addColorStop(0, warm ? 'rgba(150,100,80,0.22)' : 'rgba(120,130,150,0.18)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(16, 16);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(4000, 4000),
      new THREE.MeshBasicMaterial({ map: tex, color: 0x9aa0b0 }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = -90;
    return m;
  }

  /** Builds at most one nearby region per call, and hides far ones. */
  stream(x: number, z: number, force = false): void {
    let best: RegionSpec | null = null;
    let bestD = Infinity;
    for (const r of REGIONS) {
      const d = Math.hypot(r.cx - x, r.cz - z) - Math.max(r.w, r.d) / 2;
      const built = this.regions.get(r.id);
      if (built) built.visible = d < HIDE;
      else if (d < BUILD && d < bestD) {
        best = r;
        bestD = d;
      }
    }
    if (best) {
      const g = new THREE.Group();
      g.add(buildRegion(best), buildRegionRamps(best));
      this.regions.set(best.id, g);
      this.scene.add(g);
      if (force) this.stream(x, z, true);
    }
  }

  /** Is this region built yet (for the arrival fade)? */
  built(id: string): boolean {
    return this.regions.has(id);
  }

  /** Is a world point inside something the camera should not sit behind? */
  private solid(x: number, y: number, z: number): boolean {
    for (const w of this.walk.walls) {
      if (x > w.x0 && x < w.x1 && y > w.y0 && y < w.y1 && z > w.z0 && z < w.z1) return true;
    }
    return false;
  }

  /**
   * Follows a target. `moving` lets the camera drift back behind the pilot's
   * heading, as the Chao Garden's did; standing still it stays where it was put.
   */
  follow(t: CamTarget, heading: number, moving: boolean, dt: number): void {
    const cam = this.camera;
    if (this.scripted) {
      const k = this.init ? 1 - Math.exp(-6 * dt) : 1;
      this.eye.lerp(this.scripted.eye, k);
      this.look.lerp(this.scripted.at, k);
      cam.position.copy(this.eye);
      cam.lookAt(this.look);
      this.init = true;
      this.updateSun(t);
      return;
    }
    if (moving) {
      // The yaw that puts the camera behind the heading.
      const behind = heading + Math.PI;
      let d = behind - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * Math.min(1, dt * 1.6);
    }
    const at = new THREE.Vector3(t.x, t.y + 1.05, t.z);
    const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    // Pull in in front of anything solid between the pilot and the lens.
    let dist = this.dist;
    for (let i = 1; i <= 20; i++) {
      const s = (i / 20) * this.dist;
      const p = at.clone().addScaledVector(dir, s);
      if (this.solid(p.x, p.y, p.z)) {
        dist = Math.max(1.2, s - 0.4);
        break;
      }
    }
    const want = at.clone().addScaledVector(dir, dist);
    const k = this.init ? 1 - Math.exp(-10 * dt) : 1;
    this.eye.lerp(want, k);
    this.look.lerp(at, this.init ? 1 - Math.exp(-14 * dt) : 1);
    this.init = true;
    cam.position.copy(this.eye);
    cam.lookAt(this.look);
    this.updateSun(t);
  }

  /** The shadow camera follows the pilot so shadows stay sharp where you are. */
  private updateSun(t: CamTarget): void {
    this.sun.position.set(t.x + 60, t.y + 120, t.z + 40);
    this.sun.target.position.set(t.x, t.y, t.z);
    this.sun.target.updateMatrixWorld();
  }

  /** Where a world point lands on the 960x540 interface, or null behind the lens. */
  project(p: CamTarget, out: { x: number; y: number }): boolean {
    const v = new THREE.Vector3(p.x, p.y, p.z).project(this.camera);
    if (v.z > 1 || v.z < -1) return false;
    out.x = (v.x * 0.5 + 0.5) * 960;
    out.y = (1 - (v.y * 0.5 + 0.5)) * 540;
    return true;
  }

  dispose(): void {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.regions.clear();
  }
}
