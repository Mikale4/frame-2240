import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../core/GameConfig';
import { Latch } from '../campaign/Script';
import { sfx } from '../audio/Sfx';

const FONT = 'ui-monospace, Consolas, monospace';
const W = 760;
const H = 128;
const CPS = 55;

interface Line {
  name: string;
  /** Bust texture key for a pilot, or null for anyone else. */
  portrait: string | null;
  tint: number;
  text: string;
  options?: string[];
  latch: Latch<number>;
}

/**
 * The campaign's dialogue box.
 *
 * A typewriter line under the speaker's name, with the speaker's live voxel
 * bust beside it when they are one of the eight (the approved portraits, the
 * same textures as the banter boxes and the select screen). Extras speak
 * without a portrait, as everyone did in the FF7 game. Confirm finishes the
 * line, then moves on; a question lists its answers and the arrows pick one.
 */
export class DialogueBox {
  readonly container: Phaser.GameObjects.Container;
  private readonly panel: Phaser.GameObjects.Rectangle;
  private readonly nameText: Phaser.GameObjects.Text;
  private readonly body: Phaser.GameObjects.Text;
  private readonly portrait: Phaser.GameObjects.Image;
  private readonly frame: Phaser.GameObjects.Rectangle;
  private readonly more: Phaser.GameObjects.Text;
  private readonly opts: Phaser.GameObjects.Text[] = [];
  private queue: Line[] = [];
  private cur: Line | null = null;
  private shown = 0;
  private choice = 0;
  private t = 0;

  constructor(private readonly scene: Phaser.Scene) {
    const x = VIEW_W / 2;
    const y = VIEW_H - H / 2 - 16;
    this.container = scene.add.container(0, 0).setDepth(1500).setVisible(false);
    this.panel = scene.add.rectangle(x, y, W, H, 0x081220, 0.9).setStrokeStyle(2, 0x2f4a6e, 1);
    this.frame = scene.add.rectangle(x - W / 2 + 70, y, 112, 112, 0x050a14, 1).setStrokeStyle(2, 0x2f4a6e, 1);
    this.portrait = scene.add.image(x - W / 2 + 70, y, '__WHITE').setDisplaySize(108, 108);
    this.nameText = scene.add
      .text(0, y - H / 2 + 12, '', { fontFamily: FONT, fontSize: '14px', color: '#ffd166', fontStyle: 'bold' })
      .setStroke('#070b12', 4);
    this.body = scene.add
      .text(0, y - H / 2 + 36, '', { fontFamily: FONT, fontSize: '16px', color: '#eaf2ff', wordWrap: { width: W - 180 }, lineSpacing: 4 })
      .setStroke('#070b12', 3);
    this.more = scene.add.text(x + W / 2 - 22, y + H / 2 - 20, '▼', { fontFamily: FONT, fontSize: '14px', color: '#ffd166' });
    this.container.add([this.panel, this.frame, this.portrait, this.nameText, this.body, this.more]);
    for (let i = 0; i < 4; i++) {
      const o = scene.add.text(0, 0, '', { fontFamily: FONT, fontSize: '15px', color: '#cfe2ff' }).setStroke('#070b12', 4);
      this.opts.push(o);
      this.container.add(o);
    }
  }

  get open(): boolean {
    return this.cur !== null;
  }

  /** Queues a line; the latch finishes when the player moves past it. */
  say(name: string, portrait: string | null, tint: number, text: string, options?: string[]): Latch<number> {
    const latch = new Latch<number>();
    this.queue.push({ name, portrait, tint, text, options, latch });
    if (!this.cur) this.next();
    return latch;
  }

  private next(): void {
    this.cur = this.queue.shift() ?? null;
    this.container.setVisible(!!this.cur);
    if (!this.cur) return;
    const c = this.cur;
    const has = !!c.portrait && this.scene.textures.exists(c.portrait);
    this.portrait.setVisible(has).setTexture(has ? c.portrait! : '__WHITE').setDisplaySize(108, 108);
    this.frame.setVisible(has).setStrokeStyle(2, has ? c.tint : 0x2f4a6e, 1);
    const left = VIEW_W / 2 - W / 2 + (has ? 140 : 24);
    this.nameText.setText(c.name).setX(left).setColor('#' + (c.tint || 0xffd166).toString(16).padStart(6, '0'));
    this.body.setX(left).setWordWrapWidth(W - (has ? 160 : 48));
    this.shown = 0;
    this.choice = 0;
    this.t = 0;
    this.layoutOptions();
  }

  private layoutOptions(): void {
    const c = this.cur;
    const n = c?.options?.length ?? 0;
    const y0 = VIEW_H - H - 30 - n * 24;
    this.opts.forEach((o, i) => {
      const on = i < n && this.shown >= (c?.text.length ?? 0);
      o.setVisible(on);
      if (!on || !c?.options) return;
      o.setText(`${i === this.choice ? '▸ ' : '  '}${c.options[i]}`)
        .setColor(i === this.choice ? '#ffd166' : '#cfe2ff')
        .setPosition(VIEW_W / 2 + W / 2 - 340, y0 + i * 24);
    });
    if (n) {
      // A backing for the answers, so they read over the world.
      this.opts[0].setBackgroundColor('');
    }
  }

  update(dt: number, ui: { confirm: boolean; up: boolean; down: boolean }): void {
    const c = this.cur;
    if (!c) return;
    this.t += dt;
    if (this.shown < c.text.length) {
      this.shown = Math.min(c.text.length, this.shown + dt * CPS);
      this.body.setText(c.text.slice(0, Math.floor(this.shown)));
      this.more.setVisible(false);
      if (ui.confirm) {
        this.shown = c.text.length;
        this.body.setText(c.text);
      }
      this.layoutOptions();
      return;
    }
    this.more.setVisible(!c.options && Math.floor(this.t * 2.5) % 2 === 0);
    if (c.options) {
      if (ui.up) {
        this.choice = (this.choice + c.options.length - 1) % c.options.length;
        sfx.uiMove();
      }
      if (ui.down) {
        this.choice = (this.choice + 1) % c.options.length;
        sfx.uiMove();
      }
      this.layoutOptions();
    }
    if (ui.confirm) {
      sfx.uiConfirm();
      c.latch.finish(this.choice);
      this.next();
    }
  }

  destroy(): void {
    this.container.destroy(true);
  }
}
