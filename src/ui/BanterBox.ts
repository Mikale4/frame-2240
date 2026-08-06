import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../core/GameConfig';
import { BANTER_PRIORITY, type BanterTrigger } from '../data/banter';
import { HOLO_FILL, holoLevel, holoRuling, type HoloRuling } from './HoloPanel';

const FONT = 'ui-monospace, Consolas, monospace';

/** A face, a name and an accent — everything the plate shows about who is talking. */
export interface Speaker {
  /** Portrait texture key, `pilot_<mechId>_thumb`. */
  thumbKey: string;
  pilot: string;
  tint: number;
}

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
  private readonly ruling: HoloRuling;
  /** Seconds, for the ruling's drift. */
  private t = 0;
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
  /**
   * Who this box belongs to when nobody has borrowed it.
   *
   * A TAG/ASSIST partner speaks from their caller's corner rather than getting a
   * third box: the side of the screen is what says *whose* side the voice is on,
   * and that reading is worth more than a dedicated panel. The box is handed
   * back the moment the borrowed line clears.
   */
  private readonly home: Speaker;
  /** Whoever is currently on the plate. */
  private current: Speaker;

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

    // **A holographic plate, matching the rival-skill modal** — see
    // `src/ui/HoloPanel.ts` for what makes the look read as projected. The
    // border carries the pilot's accent, so a glance still says who is talking.
    this.panel = scene.add
      .rectangle(0, 0, PANEL_W, PANEL_H, HOLO_FILL, 0.5)
      .setOrigin(0, 0)
      .setStrokeStyle(2, tint, 0.9);
    this.root.add(this.panel);

    // **The frame is even on all four sides.**
    //
    // There used to be a 3px bar down the outer edge on top of the 2px stroke,
    // so one side was 5px and the other three were 2px. It was meant to seat
    // the box into its corner; on screen it just read as a border someone had
    // got wrong. The corner is already established by which side the box slides
    // in from and by the portrait's position, so the bar was buying nothing
    // that was not already paid for.
    this.ruling = holoRuling(scene, 2, 2, PANEL_W - 4, PANEL_H - 4);
    this.root.add(this.ruling.gfx);

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
    this.home = { thumbKey, pilot, tint };
    this.current = this.home;
  }

  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.root];
  }

  /**
   * Puts a face on the plate.
   *
   * Cheap enough to call per line: swapping a texture key and two colours costs
   * nothing, and doing it lazily on change would mean tracking a fourth piece of
   * state to save an assignment.
   */
  private wear(who: Speaker): void {
    if (who.thumbKey === this.current.thumbKey && who.pilot === this.current.pilot) return;
    this.current = who;
    this.portrait.setTexture(who.thumbKey);
    this.portrait.setDisplaySize(THUMB, THUMB);
    this.nameText.setText(who.pilot);
    this.nameText.setColor('#' + who.tint.toString(16).padStart(6, '0'));
    this.panel.setStrokeStyle(2, who.tint, 0.9);
  }

  /**
   * Offers a line to the box.
   *
   * Returns false when it is refused — still cooling down, or something more
   * important is already on screen. The caller does not need to care; refusing
   * silently is the whole point of a chatter budget.
   */
  say(text: string, trigger: BanterTrigger, holdTicks = 150, as?: Speaker): boolean {
    const pri = BANTER_PRIORITY[trigger] ?? 0;
    // An equal priority does not interrupt: a line always finishes against its
    // own kind, so a long combo does not produce a stutter of half-read lines.
    if (this.hold > 0 && pri <= this.priority) return false;
    if (this.hold <= 0 && this.cooldown > 0 && pri < BANTER_PRIORITY.hurt) return false;

    this.wear(as ?? this.home);
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
    this.t += dt;
    if (this.cooldown > 0) this.cooldown -= f;

    if (this.hold > 0) {
      this.hold -= f;
      this.slide = Math.min(1, this.slide + f * 0.16);
    } else {
      this.slide = Math.max(0, this.slide - f * 0.12);
      if (this.slide <= 0) {
        this.priority = -1;
        this.root.setVisible(false);
        // Handed back only once the borrowed line is fully gone, so the swap
        // never happens under a plate the player is still reading.
        this.wear(this.home);
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

    // The plate is lit; the frame is not. Same division as the skill modal.
    this.ruling.update(this.t);
    this.panel.setFillStyle(HOLO_FILL, 0.42 + 0.16 * holoLevel(this.t));
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
    // The container owns every child, the ruling's graphics included.
    this.root.destroy();
  }
}

export { THUMB_SRC };
