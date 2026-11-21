import Phaser from 'phaser';
import * as THREE from 'three';
import { yard } from './BattleView3D';
import { voxelStage, type VoxelView } from './VoxelStage';

/**
 * The voxel yard as a menu backdrop: CATHEDRAL YARD on a slow camera drift
 * along the deck, behind whatever the screen draws over it.
 *
 * Replaces the painted arena layers the menu and results screens used as a
 * dimmed backing plate — the fight is in a voxel yard now, and the screens
 * either side of it should be in the same place.
 */
class YardBackdrop implements VoxelView {
  readonly scene: THREE.Scene;
  readonly camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 2400);
  private t: number;
  private readonly look = new THREE.Vector3();

  constructor(seed: number) {
    const y = yard();
    this.scene = y.scene;
    y.fx.clear();
    y.fx.beginFrame();
    y.projectiles.clear();
    this.t = seed;
    this.update(0);
  }

  update(dt: number): void {
    this.t += dt;
    const t = this.t;
    // Down the length of the deck and back, slowly, looking across the
    // fight plane at the gantry and the nave.
    const x = Math.sin(t * 0.045) * 26;
    this.look.set(x * 0.8, 9, -10);
    this.camera.position.set(x + Math.sin(t * 0.11) * 6, 14 + Math.sin(t * 0.07) * 3, 34);
    this.camera.lookAt(this.look);
    yard().arena.update(dt, this.look);
  }
}

/**
 * Puts the drifting yard behind `scene` until it shuts down. Anything the scene
 * draws opaque over the full screen will hide it; draw a scrim instead.
 */
export function attachYardBackdrop(scene: Phaser.Scene, seed = 0): void {
  const stage = voxelStage();
  const view = new YardBackdrop(seed);
  stage.setView(view);
  const tick = (_time: number, delta: number): void => {
    if (stage.active !== view) return;
    view.update(Math.min(delta, 100) / 1000);
    stage.render();
  };
  scene.events.on(Phaser.Scenes.Events.POST_UPDATE, tick);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off(Phaser.Scenes.Events.POST_UPDATE, tick);
    if (stage.active === view) stage.setView(null);
  });
}
