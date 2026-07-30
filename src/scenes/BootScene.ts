import Phaser from 'phaser';
import { MECHS } from '../data/mechs';
import { createEffectTextures, createPixel } from '../render/Textures';
import { VIEW_H, VIEW_W } from '../core/GameConfig';

/**
 * Loads mech part sprites and arena layers, builds the procedural effect
 * textures, then hands off to the title screen.
 *
 * Missing files are tolerated: a placeholder is substituted and the console
 * lists what failed, so the game still boots if an art export was skipped.
 */
export class BootScene extends Phaser.Scene {
  private failed: string[] = [];

  constructor() {
    super('Boot');
  }

  preload(): void {
    const bar = this.add.graphics();
    const label = this.add
      .text(VIEW_W / 2, VIEW_H / 2 + 34, 'LOADING', {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: '14px',
        color: '#8fa3bd',
      })
      .setOrigin(0.5);

    this.load.on('progress', (p: number) => {
      bar.clear();
      bar.fillStyle(0x1a2233, 1);
      bar.fillRect(VIEW_W / 2 - 160, VIEW_H / 2, 320, 8);
      bar.fillStyle(0x4fc7ff, 1);
      bar.fillRect(VIEW_W / 2 - 160, VIEW_H / 2, 320 * p, 8);
    });
    this.load.on('complete', () => {
      bar.destroy();
      label.destroy();
    });
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      this.failed.push(file.key);
    });

    // Mech parts: assets/sprites/mechs/<mech>_<part>.png (publicDir is assets/).
    for (const def of Object.values(MECHS)) {
      for (const part of def.rig.parts) {
        this.load.image(`mech_${def.id}_${part.name}`, `sprites/mechs/${def.id}_${part.name}.png`);
      }
    }

    // Arena parallax layers.
    for (const layer of ['far', 'mid', 'near']) {
      this.load.image(`arena_${layer}`, `arenas/arena_${layer}.png`);
    }
  }

  create(): void {
    createEffectTextures(this);
    createPixel(this);

    if (this.failed.length > 0) {
      console.warn(
        `[Boot] ${this.failed.length} asset(s) failed to load; substituting placeholders:`,
        this.failed,
      );
      // Make a visible magenta placeholder so a missing export is obvious
      // rather than silently invisible.
      const key = '__missing';
      if (!this.textures.exists(key)) {
        const c = this.textures.createCanvas(key, 64, 64);
        if (c) {
          const ctx = c.getContext();
          ctx.fillStyle = '#ff00aa';
          ctx.fillRect(0, 0, 64, 64);
          ctx.fillStyle = '#220011';
          ctx.fillRect(0, 0, 32, 32);
          ctx.fillRect(32, 32, 32, 32);
          c.refresh();
        }
      }
      for (const k of this.failed) {
        if (!this.textures.exists(k)) {
          this.textures.addImage(k, this.textures.get(key).getSourceImage() as HTMLImageElement);
        }
      }
    }

    this.scene.start('Title');
  }
}
