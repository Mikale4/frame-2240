import * as THREE from 'three';

/**
 * Something the stage can draw: a scene, the camera to see it through, and a
 * per-frame hook.
 */
export interface VoxelView {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Called with the CSS aspect ratio whenever it changes. */
  resize?(aspect: number): void;
  /** Optional sub-viewports (the select screen's turntables), in logical px. */
  insets?: VoxelInset[];
}

/** A second scene drawn into a rectangle of the screen, over the main one. */
export interface VoxelInset {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Rectangle in Phaser logical pixels (960x540 space), y down. */
  x: number;
  y: number;
  w: number;
  h: number;
  visible: boolean;
}

/** Display quality, the KNOCK//BACK ladder. */
export type VoxelQuality = 'high' | 'medium' | 'low';
const QUALITY: Record<VoxelQuality, { pr: number; shadows: boolean; soft: boolean }> = {
  high: { pr: 2, shadows: true, soft: true },
  medium: { pr: 1.25, shadows: true, soft: false },
  low: { pr: 1, shadows: false, soft: false },
};

/**
 * The three-dimensional half of the screen.
 *
 * **Two canvases, one picture.** Phaser still owns the interface — the HUD,
 * banter, menus, the saturation cutscene, every screen that is not a fight —
 * and its canvas is now transparent. This canvas sits exactly underneath it,
 * pixel-matched to Phaser's letterboxed rectangle, and draws the voxel world.
 * Everything Phaser draws lands on top, which is where an interface belongs.
 *
 * The alternative was rebuilding every screen in Three.js, which would have
 * replaced several thousand lines of working, tested interface to change how
 * the *fight* looks. The fight is the only thing that needed a third dimension.
 *
 * One renderer for the whole session: WebGL contexts are a scarce resource and
 * building one per match leaks them on every rematch.
 */
export class VoxelStage {
  readonly renderer: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  private view: VoxelView | null = null;
  private target: HTMLCanvasElement | null = null;
  private lastRect = { x: -1, y: -1, w: -1, h: -1 };
  private quality: VoxelQuality = 'high';
  /** 0..1 black over the 3D layer, for fades the HUD camera cannot reach. */
  fade = 0;

  constructor() {
    // The other voxel games run Three.js the classic way: colours used as
    // painted, no linear-light round trip. That is the look being matched, and
    // the per-face shades and AO table in VoxelKit are tuned for it.
    THREE.ColorManagement.enabled = false;
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'voxel-layer';
    Object.assign(this.canvas.style, {
      position: 'fixed',
      left: '0px',
      top: '0px',
      width: '0px',
      height: '0px',
      zIndex: '0',
      display: 'none',
      pointerEvents: 'none',
      imageRendering: 'auto',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.prepend(this.canvas);
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setClearColor(0x05070d, 1);
    this.renderer.autoClear = false;
    this.setQuality(this.quality);
  }

  /** Follows this canvas's on-screen rectangle (Phaser's, letterboxed). */
  follow(target: HTMLCanvasElement): void {
    this.target = target;
    // Phaser's canvas has to stack above this one.
    target.style.position = 'relative';
    target.style.zIndex = '1';
  }

  setQuality(q: VoxelQuality): void {
    this.quality = q;
    const Q = QUALITY[q];
    this.renderer.shadowMap.enabled = Q.shadows;
    this.renderer.shadowMap.type = Q.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.renderer.shadowMap.needsUpdate = true;
    this.lastRect.w = -1;
  }

  getQuality(): VoxelQuality {
    return this.quality;
  }

  get active(): VoxelView | null {
    return this.view;
  }

  /** Shows a view, or hides the layer with `null`. */
  setView(v: VoxelView | null): void {
    this.view = v;
    this.canvas.style.display = v ? 'block' : 'none';
    this.lastRect.w = -1;
    if (v) this.syncRect();
  }

  private syncRect(): void {
    const t = this.target;
    if (!t) return;
    const r = t.getBoundingClientRect();
    const L = this.lastRect;
    if (r.width < 1 || r.height < 1) return;
    if (r.left === L.x && r.top === L.y && r.width === L.w && r.height === L.h) return;
    L.x = r.left;
    L.y = r.top;
    L.w = r.width;
    L.h = r.height;
    this.canvas.style.left = `${r.left}px`;
    this.canvas.style.top = `${r.top}px`;
    this.canvas.style.width = `${r.width}px`;
    this.canvas.style.height = `${r.height}px`;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY[this.quality].pr));
    this.renderer.setSize(r.width, r.height, false);
    const v = this.view;
    if (v) {
      v.camera.aspect = r.width / r.height;
      v.camera.updateProjectionMatrix();
      v.resize?.(v.camera.aspect);
    }
  }

  /** Draws the current view. Call once per frame, after the view has updated. */
  render(): void {
    const v = this.view;
    if (!v) return;
    this.syncRect();
    const R = this.renderer;
    const size = R.getSize(new THREE.Vector2());
    R.setScissorTest(false);
    R.setViewport(0, 0, size.x, size.y);
    // Re-asserted every frame: drawing a scene with a background colour leaves
    // that colour behind as the clear colour, which turned every screen blue.
    R.setClearColor(0x05070d, 1);
    R.clear(true, true, true);
    R.render(v.scene, v.camera);
    if (v.insets) {
      const sx = size.x / 960;
      const sy = size.y / 540;
      for (const ins of v.insets) {
        if (!ins.visible) continue;
        const x = ins.x * sx;
        const w = ins.w * sx;
        const h = ins.h * sy;
        const y = size.y - (ins.y + ins.h) * sy;
        R.setViewport(x, y, w, h);
        R.setScissor(x, y, w, h);
        R.setScissorTest(true);
        R.clearDepth();
        ins.camera.aspect = w / Math.max(1, h);
        ins.camera.updateProjectionMatrix();
        R.render(ins.scene, ins.camera);
      }
      R.setScissorTest(false);
      R.setViewport(0, 0, size.x, size.y);
    }
    this.canvas.style.filter = this.fade > 0.001 ? `brightness(${(1 - this.fade).toFixed(3)})` : '';
  }
}

let STAGE: VoxelStage | null = null;

/** The session's stage, created on first use. */
export function voxelStage(): VoxelStage {
  if (!STAGE) STAGE = new VoxelStage();
  return STAGE;
}
