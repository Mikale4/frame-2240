import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../core/GameConfig';
import { BANTER_PRIORITY, type BanterTrigger } from '../data/banter';

const FONT = 'ui-monospace, Consolas, monospace';

/** Logical size of the delivered pilot thumbnails (see docs/PILOT_PORTRAIT_SPEC.md). */
const THUMB_SRC = 96;
/** Drawn size. Smaller than the source so the pixel art stays crisp. */
const THUMB = 64;
const PANEL_W = 300;
const PANEL_H = 74;
const MARGIN = 14;

/**
 * One pilot's speech box: portrait thumbnail, name, and a line.
 *
 * Two of these exist, pinned to the bottom corners — the player's on the left
 * under their own gauges, the rival's on the right under theirs — so a glance
 * tells you who is talking without reading the name.
 *
 * Deliberately dumb: it knows how to show a line and how to fade one out. What
 * is worth saying and when is `BattleScene`'s problem, and the line text itself
 * is data in `src/data/banter.ts`.
 */
export class BanterBox {
  private readonly root: Phaser.GameObjects.Container;
  private readonly panel: Phaser.GameObjects.Rectangle;
  private readonly edge: Phaser.GameObjects.Rectangle;
  private readonly portrait: Phaser.GameObjects.Image;
  private readonly nameText: Phaser.GameObjects.Text;
  private readonly lineText: Phaser.GameObjects.Text;

  /** Ticks of display left. Zero means the box is idle. */
  private hold = 0;
  /** Priority of whatever is on screen, so a KO cannot be stomped by a combo. */
  private priority = -1;
  /** Ticks before this side may speak again, so it never chatters. */
  private cooldown = 0;
  /** Slide-in progress, 0..1. */
  private slide = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly rightAligned: boolean,
    thumbKey: string,
    pilot: string,
    tint: number,
  ) {
    const x = rightAligned ? VIEW_W - MARGIN - PANEL_W : MARGIN;
    const y = VIEW_H - MARGIN - PANEL_H;

    this.root = scene.add.container(x, y);
    this.root.setDepth(1200);
    this.root.setScrollFactor(0);
    this.root.setAlpha(0);

    this.panel = scene.add
      .rectangle(0, 0, PANEL_W, PANEL_H, 0x080c15, 0.86)
      .setOrigin(0, 0)
      .setStrokeStyle(2, tint, 0.9);
    this.root.add(this.panel);

    // A thicker bar on the outer edge, so the two boxes read as belonging to
    // the corner they sit in rather than floating.
    this.edge = scene.add
      .rectangle(rightAligned ? PANEL_W - 3 : 0, 0, 3, PANEL_H, tint, 1)
      .setOrigin(0, 0);
    this.root.add(this.edge);

    const px = rightAligned ? PANEL_W - 8 - THUMB / 2 : 8 + THUMB / 2;
    this.portrait = scene.add.image(px, PANEL_H / 2, thumbKey);
    this.portrait.setDisplaySize(THUMB, THUMB);
    // The art is authored at 96px; scaling down is fine, scaling up is mush.
    this.portrait.setOrigin(0.5, 0.5);
    this.root.add(this.portrait);

    const textX = rightAligned ? PANEL_W - 8 - THUMB - 10 : 8 + THUMB + 10;
    const align = rightAligned ? 'right' : 'left';
    const originX = rightAligned ? 1 : 0;

    this.nameText = scene.add
      .text(textX, 10, pilot, {
        fontFamily: FONT,
        fontSize: '11px',
        color: '#' + tint.toString(16).padStart(6, '0'),
      })
      .setOrigin(originX, 0);
    this.root.add(this.nameText);

    this.lineText = scene.add
      .text(textX, 28, '', {
        fontFamily: FONT,
        fontSize: '13px',
        color: '#dfe8f6',
        align,
        wordWrap: { width: PANEL_W - THUMB - 26 },
      })
      .setOrigin(originX, 0);
    this.root.add(this.lineText);

    this.root.setVisible(false);
  }

  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.root];
  }

  /**
   * Offers a line to the box.
   *
   * Returns false when it is refused — still cooling down, or something more
   * important is already on screen. The caller does not need to care; refusing
   * silently is the whole point of a chatter budget.
   */
  say(text: string, trigger: BanterTrigger, holdTicks = 150): boolean {
    const pri = BANTER_PRIORITY[trigger] ?? 0;
    // An equal priority does not interrupt: a line always finishes against its
    // own kind, so a long combo does not produce a stutter of half-read lines.
    if (this.hold > 0 && pri <= this.priority) return false;
    if (this.hold <= 0 && this.cooldown > 0 && pri < BANTER_PRIORITY.hurt) return false;

    this.lineText.setText(text);
    this.hold = holdTicks;
    this.priority = pri;
    this.cooldown = 90;
    if (this.slide <= 0) this.slide = 0;
    this.root.setVisible(true);
    return true;
  }

  /** `dt` is in seconds. */
  update(dt: number): void {
    const f = dt * 60;
    if (this.cooldown > 0) this.cooldown -= f;

    if (this.hold > 0) {
      this.hold -= f;
      this.slide = Math.min(1, this.slide + f * 0.16);
    } else {
      this.slide = Math.max(0, this.slide - f * 0.12);
      if (this.slide <= 0) {
        this.priority = -1;
        this.root.setVisible(false);
        return;
      }
    }

    // Slides in from the outside edge and fades with the same curve, so the box
    // arrives rather than blinking into existence.
    const eased = this.slide * this.slide * (3 - 2 * this.slide);
    const off = (1 - eased) * 46 * (this.rightAligned ? 1 : -1);
    const x = this.rightAligned ? VIEW_W - MARGIN - PANEL_W : MARGIN;
    this.root.setX(x + off);
    this.root.setAlpha(eased);
  }

  /** Clears the box outright, for a rematch. */
  reset(): void {
    this.hold = 0;
    this.cooldown = 0;
    this.slide = 0;
    this.priority = -1;
    this.root.setAlpha(0);
    this.root.setVisible(false);
  }

  destroy(): void {
    this.root.destroy();
    void this.panel;
    void this.edge;
  }
}

export { THUMB_SRC };
