import Phaser from 'phaser';
import { GAME_TITLE, VIEW_H, VIEW_W } from './core/GameConfig';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { MenuScene } from './scenes/MenuScene';
import { MechSelectScene } from './scenes/MechSelectScene';
import { BattleScene } from './scenes/BattleScene';
import { OrbitScene } from './scenes/OrbitScene';
import { ResultsScene } from './scenes/ResultsScene';
import { ArchiveScene } from './scenes/ArchiveScene';
import { sfx } from './audio/Sfx';
import { music } from './audio/Music';
import { voxelStage } from './voxel/VoxelStage';
import { session } from './core/Session';

/** Shows a fatal boot/runtime error on the page instead of failing silently. */
function showFatal(message: string): void {
  const el = document.getElementById('boot-error');
  if (!el) return;
  el.style.display = 'block';
  el.textContent = `${GAME_TITLE} failed to start.\n\n${message}`;
}

window.addEventListener('error', (e) => {
  showFatal(`${e.message}\n\n${e.error?.stack ?? ''}`);
});
window.addEventListener('unhandledrejection', (e) => {
  showFatal(String((e as PromiseRejectionEvent).reason));
});

// Browsers require a gesture before audio may start. The soundtrack asks for
// the title track before anyone has necessarily pressed anything, so it holds
// the cue and starts it here.
const unlock = () => {
  sfx.unlock();
  music.unlock();
  window.removeEventListener('pointerdown', unlock);
  window.removeEventListener('keydown', unlock);
};
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);

try {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game-root',
    width: VIEW_W,
    height: VIEW_H,
    backgroundColor: '#05070d',
    // **Transparent**, so the voxel layer underneath shows through. Phaser draws
    // the interface; `src/voxel/VoxelStage.ts` draws the world beneath it. Every
    // screen without a 3D view still sits on the page's own #05070d.
    transparent: true,
    pixelArt: false,
    roundPixels: true,
    // Gamepad support is opt-in in Phaser; the input layer tolerates its absence.
    input: { gamepad: true, keyboard: true },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    render: {
      antialias: true,
      powerPreference: 'high-performance',
    },
    scene: [BootScene, TitleScene, MenuScene, MechSelectScene, BattleScene, OrbitScene, ResultsScene, ArchiveScene],
  });

  // Debug handle: lets the browser console (and automated checks) inspect the
  // live game without reaching into the bundle.
  (window as unknown as { __BSR__: Phaser.Game }).__BSR__ = game;

  // The voxel layer tracks Phaser's letterboxed canvas, pixel for pixel.
  game.events.once(Phaser.Core.Events.READY, () => voxelStage().follow(game.canvas));
  // Same idea for the 3D layer: the stage, its renderer and the active view.
  (window as unknown as { __BSR_VOXEL__: unknown }).__BSR_VOXEL__ = voxelStage();
  (window as unknown as { __BSR_SESSION__: unknown }).__BSR_SESSION__ = session;
} catch (err) {
  showFatal(err instanceof Error ? `${err.message}\n\n${err.stack ?? ''}` : String(err));
}
