import * as THREE from 'three';
import { VIEW_H } from '../core/GameConfig';
import { clamp } from '../core/MathUtil';
import { buildArena, type ArenaHandle } from './VoxelArena';
import { VoxelFx } from './VoxelFx';
import { VoxelProjectiles } from './VoxelProjectiles';
import { flushAllGfx } from './Gfx3D';
import type { VoxelView } from './VoxelStage';
import { PLAY_LEFT, PLAY_RIGHT, PLAY_TOP, WORLD_PER_PX, worldX, worldY } from './World';

/**
 * Camera framing, KNOCK//BACK's way.
 *
 * A perspective lens (40° vertical, the same as that game) up above the deck
 * and out in front of the fight plane, pitched down at it, following the
 * midpoint of everything that matters and pulling back as the fighters
 * separate. The distance is *solved* — both machines plus a margin must fit on
 * each axis — rather than fitted to a feeling, which is the lesson the 2D
 * camera's comment records.
 */
const FOV = 40;
/** How far the lens looks down at the plane. */
export const CAM_PITCH = 0.36;
/** Margins around each body, in sim px (the 2D camera's numbers). */
const MARGIN_X = 190;
const MARGIN_Y = 150;
const DIST_MIN = 11;
const DIST_MAX = 82;
/** Screen height across the top the HUD occupies; framing solves below it. */
const HUD_BAND = 168;

export interface Yard {
  scene: THREE.Scene;
  arena: ArenaHandle;
  camera: THREE.PerspectiveCamera;
  /** A black plane in front of the lens, for fading the fight alone. */
  curtain: THREE.Mesh;
  fx: VoxelFx;
  projectiles: VoxelProjectiles;
}

let YARD: Yard | null = null;

/**
 * The yard is built once per session and kept: a rematch should not rebuild a
 * drydock. The effect and projectile pools live with it for the same reason —
 * built per match, they leaked their geometry on every rematch.
 */
export function yard(): Yard {
  if (!YARD) {
    const scene = new THREE.Scene();
    const arena = buildArena(scene);
    const camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.1, 2400);
    const fx = new VoxelFx(scene, camera);
    const projectiles = new VoxelProjectiles(scene);
    // The curtain rides the camera, so the camera has to be in the scene graph
    // for it to draw.
    const curtain = new THREE.Mesh(
      new THREE.PlaneGeometry(50, 50),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false }),
    );
    curtain.position.set(0, 0, -1);
    curtain.renderOrder = 1e6;
    curtain.visible = false;
    camera.add(curtain);
    scene.add(camera);
    YARD = { scene, arena, camera, fx, projectiles, curtain };
  }
  return YARD;
}

export interface FramePoint {
  x: number;
  y: number;
}

export class BattleView3D implements VoxelView {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly arena: ArenaHandle;
  /** Everything this match added to the yard; removed on dispose. */
  readonly dyn = new THREE.Group();
  /** Layers inside `dyn`, in the order they matter. */
  readonly mechs = new THREE.Group();
  readonly overlays = new THREE.Group();
  readonly fx: VoxelFx;
  readonly projectiles: VoxelProjectiles;
  private readonly look = new THREE.Vector3(0, 8, 0);
  private dist = 40;
  private yaw = 0;
  private init = false;
  private time = 0;
  /** Seconds of attract-mode orbit; zero in a real match. */
  orbit = false;
  /**
   * Screen height along the bottom to keep clear, logical px: the tutorial's
   * lesson card lives there, and the fight must sit above it, not under it.
   */
  reserveBottom = 0;
  /** Closest the camera may come. The title's background fight stands well back. */
  minDist = DIST_MIN;

  constructor() {
    const y = yard();
    this.scene = y.scene;
    this.arena = y.arena;
    this.camera = y.camera;
    this.scene.add(this.dyn);
    this.dyn.add(this.mechs, this.overlays);
    this.fx = y.fx;
    this.projectiles = y.projectiles;
    this.fx.clear();
    this.fx.beginFrame();
    this.projectiles.clear();
  }

  /**
   * Frames the fight.
   *
   * `pts` are sim positions that must stay in shot; `lead` is a sim-space
   * velocity lead. `shake` is the scene's shake amount, in the 2D camera's units.
   */
  frame(pts: readonly FramePoint[], leadX: number, leadY: number, shake: number, dt: number): void {
    this.time += dt;
    const cam = this.camera;
    const tanV = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const tanH = tanV * cam.aspect;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    // World-space bounds with margins. Sim y is down, so its min is the top.
    const L = worldX(minX - MARGIN_X);
    const R = worldX(maxX + MARGIN_X);
    const T = worldY(minY - MARGIN_Y);
    // The full margin below too: a machine's legs hang well under its core.
    const B = worldY(maxY + MARGIN_Y);
    const halfW = (R - L) / 2;
    const halfH = (T - B) / 2;
    const usable = (VIEW_H - HUD_BAND - this.reserveBottom) / VIEW_H;
    const cosP = Math.cos(CAM_PITCH);
    const wantDist = clamp(Math.max(halfW / tanH, (halfH * cosP) / (tanV * usable)), this.minDist, DIST_MAX);

    // Lead, then clamp so neither body leaves the frame.
    const midX = (L + R) / 2;
    const midY = (T + B) / 2;
    const visHalfW = wantDist * tanH;
    let cx = midX + leadX * 4 * WORLD_PER_PX;
    cx = clamp(cx, R - visHalfW, L + visHalfW);
    let cy = midY + leadY * 3 * WORLD_PER_PX;
    const visHalfH = (wantDist * tanV * usable) / cosP;
    cy = clamp(cy, T - visHalfH, B + visHalfH);
    // Never frame much past the yard's ends or below the deck.
    cx = clamp(cx, PLAY_LEFT - 6, PLAY_RIGHT + 6);
    cy = clamp(cy, 1.2, PLAY_TOP);
    // Push the view up by half the HUD band, so the action sits in the clear
    // area beneath the gauges rather than behind them.
    const hudShift = (((HUD_BAND - this.reserveBottom) / 2 / (VIEW_H / 2)) * wantDist * tanV) / cosP;

    const k = this.init ? 1 - Math.exp(-4.2 * dt) : 1;
    this.init = true;
    this.look.x += (cx - this.look.x) * k;
    this.look.y += (cy + hudShift - this.look.y) * k;
    this.dist += (wantDist - this.dist) * k;

    this.yaw = this.orbit ? Math.sin(this.time * 0.11) * 0.42 : this.yaw * (1 - k);
    const pitch = CAM_PITCH + (this.orbit ? Math.sin(this.time * 0.07) * 0.06 : 0);
    const dir = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(this.yaw) * Math.cos(pitch),
    );
    cam.position.copy(this.look).addScaledVector(dir, this.dist);
    cam.position.y = Math.max(1.5, cam.position.y);
    cam.lookAt(this.look);
    if (shake > 0.05) {
      const s = shake * 0.012 * (this.dist / 30);
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
    }
    this.arena.update(dt, this.look);
  }

  /** Call once per frame after every layer has been posed. */
  prepare(): void {
    flushAllGfx();
  }

  /**
   * 0..1 black over this view's picture only, drawn in the voxel scene itself.
   * The title's background fight fades between matchups with this rather than
   * a Phaser camera fade, which draws over everything beneath the title.
   */
  get fade(): number {
    return (yard().curtain.material as THREE.MeshBasicMaterial).opacity;
  }

  set fade(v: number) {
    const c = yard().curtain;
    (c.material as THREE.MeshBasicMaterial).opacity = Math.max(0, Math.min(1, v));
    c.visible = v > 0.001;
  }

  dispose(): void {
    this.fade = 0;
    this.fx.clear();
    this.fx.beginFrame();
    this.projectiles.clear();
    this.dyn.removeFromParent();
  }
}
