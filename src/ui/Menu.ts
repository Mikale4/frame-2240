import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../core/GameConfig';
import { sfx } from '../audio/Sfx';

const FONT = 'ui-monospace, Consolas, monospace';

export interface MenuItem {
  label: string;
  onSelect: () => void;
  /** Optional live value shown to the right (e.g. a toggle state). */
  value?: () => string;
}

/**
 * A small keyboard/gamepad driven vertical menu, used for the title screen,
 * the pause overlay and the results screen.
 */
export class Menu {
  private readonly root: Phaser.GameObjects.Container;
  private readonly texts: Phaser.GameObjects.Text[] = [];
  private index = 0;
  /** Guards against a scene shutdown racing a late input callback. */
  private destroyed = false;

  constructor(
    scene: Phaser.Scene,
    private readonly items: MenuItem[],
    x: number,
    y: number,
    opts: { size?: number; gap?: number; depth?: number } = {},
  ) {
    const size = opts.size ?? 22;
    const gap = opts.gap ?? 34;
    this.root = scene.add.container(0, 0);
    this.root.setDepth(opts.depth ?? 1200);
    this.root.setScrollFactor(0);

    items.forEach((item, i) => {
      const t = scene.add
        .text(x, y + i * gap, item.label, {
          fontFamily: FONT,
          fontSize: `${size}px`,
          color: '#cfe0f5',
        })
        .setOrigin(0.5, 0.5)
        .setStroke('#070b12', 5);
      this.texts.push(t);
      this.root.add(t);
    });

    // A scene shutdown destroys our Text objects without going through
    // destroy(), so mark ourselves dead on that event too. Otherwise a stale
    // reference to this menu would crash on the next refresh.
    const kill = () => {
      this.destroyed = true;
    };
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, kill);
    scene.events.once(Phaser.Scenes.Events.DESTROY, kill);

    this.refresh();
  }

  private refresh(): void {
    if (this.destroyed) return;
    this.texts.forEach((t, i) => {
      const sel = i === this.index;
      const item = this.items[i];
      const value = item.value ? `   ${item.value()}` : '';
      t.setText(`${sel ? '▸ ' : '  '}${item.label}${value}`);
      t.setColor(sel ? '#ffd166' : '#8fa3bd');
      t.setScale(sel ? 1.06 : 1);
    });
  }

  move(delta: number): void {
    if (this.destroyed) return;
    this.index = (this.index + delta + this.items.length) % this.items.length;
    sfx.uiMove();
    this.refresh();
  }

  confirm(): void {
    if (this.destroyed) return;
    sfx.uiConfirm();
    this.items[this.index].onSelect();
    this.refresh();
  }

  /** Re-reads any dynamic values (call after a toggle). */
  update(): void {
    this.refresh();
  }

  /** Exposed so a scene can route the menu to a specific camera. */
  get container(): Phaser.GameObjects.Container {
    return this.root;
  }

  setVisible(v: boolean): void {
    this.root.setVisible(v);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.root.destroy(true);
  }
}

/** Dimmed full-screen panel used behind the pause and results menus. */
export function makeScrim(
  scene: Phaser.Scene,
  alpha = 0.72,
  depth = 1150,
): Phaser.GameObjects.Rectangle {
  const r = scene.add
    .rectangle(0, 0, VIEW_W, VIEW_H, 0x05070d, alpha)
    .setOrigin(0, 0)
    .setDepth(depth)
    .setScrollFactor(0);
  return r;
}

export function bigTitle(
  scene: Phaser.Scene,
  text: string,
  y: number,
  size = 44,
  color = '#ffffff',
  depth = 1200,
): Phaser.GameObjects.Text {
  return scene.add
    .text(VIEW_W / 2, y, text, {
      fontFamily: FONT,
      fontSize: `${size}px`,
      color,
      fontStyle: 'bold',
    })
    .setOrigin(0.5, 0.5)
    .setStroke('#070b12', 7)
    .setDepth(depth)
    .setScrollFactor(0);
}

export function smallText(
  scene: Phaser.Scene,
  text: string,
  x: number,
  y: number,
  size = 13,
  color = '#93a6c0',
  origin: [number, number] = [0.5, 0.5],
  depth = 1200,
): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, color, align: 'center' })
    .setOrigin(origin[0], origin[1])
    .setStroke('#070b12', 4)
    .setDepth(depth)
    .setScrollFactor(0);
}
