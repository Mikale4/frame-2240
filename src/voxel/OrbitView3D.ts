import * as THREE from 'three';
import type { ArenaHandle } from './VoxelArena';
import type { VoxelFx } from './VoxelFx';
import type { VoxelProjectiles } from './VoxelProjectiles';
import type { VoxelView } from './VoxelStage';
import { yard } from './BattleView3D';

/** The side-on camera's lens, restored when FREE ORBIT hands the yard back. */
const SIDE_FOV = 40;
/** A third-person lens: wide enough to keep a rival in frame at sword range. */
const CHASE_FOV = 58;

export interface CamPoint {
  x: number;
  y: number;
  z: number;
}

/**
 * FREE ORBIT's camera: the yard, seen from over the pilot's shoulder.
 *
 * The same yard the side-on fight uses — built once per session and shared
 * (see `yard()`), which is why this class borrows the scene, the arena, the
 * effect and shot pools and the camera itself rather than building any of them.
 * Only the lens and the framing differ:
 *
 * - **Mech form** is a lock-on camera, the 3D mecha-fighter standard. It sits
 *   behind the player on the line from the rival, a little above, and looks
 *   past the player toward the rival, so "forward" on the stick always means
 *   "at them" on screen.
 * - **Mobile form** is a chase camera behind the nose, because a craft that
 *   banks and pitches is flown from behind its tail.
 *
 * The two blend with the transformation, so the lens swings round as the
 * machine folds up rather than cutting.
 */
export class OrbitView3D implements VoxelView {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly arena: ArenaHandle;
  readonly dyn = new THREE.Group();
  readonly mechs = new THREE.Group();
  readonly fx: VoxelFx;
  readonly projectiles: VoxelProjectiles;
  private readonly pos = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private init = false;
  private side = 1;
  private readonly lockDir = { x: 1, z: 0 };

  constructor() {
    const y = yard();
    this.scene = y.scene;
    this.arena = y.arena;
    this.camera = y.camera;
    this.scene.add(this.dyn);
    this.dyn.add(this.mechs);
    this.fx = y.fx;
    this.projectiles = y.projectiles;
    this.fx.clear();
    this.fx.beginFrame();
    this.projectiles.clear();
    this.camera.fov = CHASE_FOV;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Over the player's shoulder.
   *
   * `mobile` is the transformation blend; `nose` the craft's heading.
   * `height` is the player's own height above its core, so a tall walker is
   * not framed from its knees.
   */
  chase(me: CamPoint, foe: CamPoint, mobile: number, nose: CamPoint, height: number, shake: number, dt: number): void {
    // Lock-on framing: behind the player, on the line from the rival.
    let fx = foe.x - me.x;
    let fz = foe.z - me.z;
    const flat = Math.hypot(fx, fz);
    // Straight overhead the line to the rival has no heading; keep the last.
    if (flat > 0.4) {
      this.lockDir.x = fx / flat;
      this.lockDir.z = fz / flat;
    }
    fx = this.lockDir.x;
    fz = this.lockDir.z;
    const dist = 6.2 + height * 1.2;
    const lift = 1.6 + height * 0.55;
    // Look past the player at the rival, biased toward the player so both are
    // in frame — further toward the rival when it is close above or below.
    const bias = Math.min(0.45, 3.5 / Math.max(3.5, flat || 1));
    const lockPos = new THREE.Vector3(me.x - fx * dist, me.y + lift, me.z - fz * dist);
    const lockLook = new THREE.Vector3(
      me.x + (foe.x - me.x) * bias,
      me.y + 0.6 + (foe.y - me.y) * Math.max(bias, 0.3),
      me.z + (foe.z - me.z) * bias,
    );
    // Chase framing: behind the nose.
    // Higher than the lock-on lens, looking down onto the craft's back: from
    // dead astern a prone frame is its own tail and plumes, and nothing else.
    const cd = dist * 0.85;
    const cPos = new THREE.Vector3(me.x - nose.x * cd, me.y - nose.y * cd + lift * 1.35, me.z - nose.z * cd);
    const cLook = new THREE.Vector3(me.x + nose.x * 7, me.y + nose.y * 7 + 0.2, me.z + nose.z * 7);
    const m = mobile * mobile * (3 - 2 * mobile);
    const wantPos = lockPos.lerp(cPos, m);
    const wantLook = lockLook.lerp(cLook, m);
    this.unblock(me, wantPos);
    this.apply(wantPos, wantLook, shake, dt, 7.5);
  }

  /**
   * A broadcast angle on two machines: side-on to the line between them, far
   * enough back to hold both. The title and CPU-vs-CPU views.
   */
  spectate(a: CamPoint, b: CamPoint, shake: number, dt: number): void {
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const mz = (a.z + b.z) / 2;
    let dx = b.x - a.x;
    let dz = b.z - a.z;
    const sep = Math.hypot(dx, dz, b.y - a.y);
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    // Perpendicular, on whichever side the lens is already — no flips.
    let px = -dz;
    let pz = dx;
    if (this.init) {
      const cur = (this.pos.x - mx) * px + (this.pos.z - mz) * pz;
      if (cur < 0) this.side = -1;
      else this.side = 1;
    }
    px *= this.side;
    pz *= this.side;
    const dist = Math.max(11, sep * 0.95 + 6);
    const pos = new THREE.Vector3(mx + px * dist, my + dist * 0.32 + 2, mz + pz * dist);
    const look = new THREE.Vector3(mx, my + 0.5, mz);
    this.apply(pos, look, shake, dt, 3.2);
  }

  /**
   * Solid structure the lens must not end up behind: given a world point,
   * whether it is inside something. Set by the scene; without it the camera
   * goes wherever the framing puts it.
   */
  solid: ((x: number, y: number, z: number) => boolean) | null = null;

  /**
   * Pulls the lens in along the line back from the player until nothing solid
   * stands between them. A pylon behind the pilot otherwise fills half the
   * screen, which is the one thing a third-person camera must never do.
   */
  private unblock(me: CamPoint, want: THREE.Vector3): void {
    if (!this.solid) return;
    const steps = 16;
    let free = 0;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = me.x + (want.x - me.x) * t;
      const y = me.y + 0.8 + (want.y - me.y - 0.8) * t;
      const z = me.z + (want.z - me.z) * t;
      if (this.solid(x, y, z)) break;
      free = t;
    }
    if (free >= 1) return;
    // Stop a little short of the hit, and never closer than an arm's length.
    const t = Math.max(0.18, free - 0.06);
    // And rise as it comes in, to look over the shoulder rather than into
    // the back of the pilot's own machine.
    want.set(
      me.x + (want.x - me.x) * t,
      me.y + 0.8 + (want.y - me.y - 0.8) * t + (1 - t) * 2.4,
      me.z + (want.z - me.z) * t,
    );
  }

  /** A turntable around one point: for inspecting a machine. */
  inspect(at: CamPoint, yaw: number, dist: number, lift: number, dt: number): void {
    const pos = new THREE.Vector3(at.x + Math.cos(yaw) * dist, at.y + lift, at.z - Math.sin(yaw) * dist);
    this.apply(pos, new THREE.Vector3(at.x, at.y, at.z), 0, dt, 40);
  }

  private apply(wantPos: THREE.Vector3, wantLook: THREE.Vector3, shake: number, dt: number, rate: number): void {
    // Never below the deck.
    wantPos.y = Math.max(0.9, wantPos.y);
    const k = this.init ? 1 - Math.exp(-rate * dt) : 1;
    this.init = true;
    this.pos.lerp(wantPos, k);
    this.look.lerp(wantLook, Math.min(1, k * 1.6));
    const cam = this.camera;
    cam.position.copy(this.pos);
    if (shake > 0.05) {
      const s = shake * 0.01;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      cam.position.z += (Math.random() - 0.5) * s;
    }
    cam.lookAt(this.look);
    this.arena.update(dt, this.look);
  }

  /** Where a world point lands on the 960x540 interface, or null behind the lens. */
  project(p: CamPoint, out: { x: number; y: number }): boolean {
    const v = new THREE.Vector3(p.x, p.y, p.z).project(this.camera);
    if (v.z > 1 || v.z < -1) return false;
    out.x = (v.x * 0.5 + 0.5) * 960;
    out.y = (1 - (v.y * 0.5 + 0.5)) * 540;
    return true;
  }

  dispose(): void {
    this.fx.clear();
    this.fx.beginFrame();
    this.projectiles.clear();
    this.dyn.removeFromParent();
    this.camera.fov = SIDE_FOV;
    this.camera.updateProjectionMatrix();
  }
}
