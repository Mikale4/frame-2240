import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../core/GameConfig';
import { SAT_MODE_NAMES } from '../combat/types';

const FONT = 'ui-monospace, Consolas, monospace';

/** Ticks the whole thing runs for, at 60Hz. About one and a quarter seconds. */
export const CUTSCENE_TICKS = 76;
/** Ticks spent sliding in, and sliding back out. The middle is the hold. */
const IN_TICKS = 14;
const OUT_TICKS = 16;

/** Drawn portrait size, and the plate behind it. */
const PORTRAIT = 216;
const PANEL = 240;

/**
 * The saturation activation cutscene.
 *
 * Saturation is the biggest commitment in the game — a full meter, a mode you
 * chose in advance, and a stun waiting at the far end. It used to open with a
 * ring of particles and a banner, which is the same weight the game gives a
 * dash. This stops the match for about a second and puts the pilot on screen
 * saying something, so spending the meter reads as an event rather than as a
 * status effect starting.
 *
 * **It genuinely freezes the simulation.** `BattleScene` stops stepping while
 * this runs, which is a real gameplay pause and is meant to be: both machines
 * hold, and neither side loses or gains a frame of advantage from it. That is
 * why it is short, and why nothing here can be interacted with.
 *
 * Everything is drawn on the UI camera at a fixed position, so the world camera
 * is free to push in behind it.
 */
export class SatCutscene {
  private readonly root: Phaser.GameObjects.Container;
  private readonly scrim: Phaser.GameObjects.Rectangle;
  private readonly barTop: Phaser.GameObjects.Rectangle;
  private readonly barBottom: Phaser.GameObjects.Rectangle;
  private readonly rays: Phaser.GameObjects.Image[] = [];
  private readonly portrait: Phaser.GameObjects.Image;
  private readonly portraitPanel: Phaser.GameObjects.Rectangle;
  private readonly portraitEdge: Phaser.GameObjects.Rectangle;
  private readonly modeText: Phaser.GameObjects.Text;
  private readonly subText: Phaser.GameObjects.Text;
  private readonly pilotText: Phaser.GameObjects.Text;
  private readonly lineText: Phaser.GameObjects.Text;

  private ticks = 0;
  /** +1 when the portrait comes from the left, -1 from the right. */
  private side = 1;

  constructor(scene: Phaser.Scene, rayTexture: string) {
    this.root = scene.add.container(0, 0);
    this.root.setDepth(1500);
    this.root.setScrollFactor(0);
    this.root.setVisible(false);

    this.scrim = scene.add
      .rectangle(0, 0, VIEW_W, VIEW_H, 0x04060c, 1)
      .setOrigin(0, 0);
    this.root.add(this.scrim);

    // Speed lines behind the portrait. Cheap, and they sell the push-in.
    for (let i = 0; i < 14; i++) {
      const ray = scene.add.image(0, 0, rayTexture);
      ray.setBlendMode(Phaser.BlendModes.ADD);
      ray.setOrigin(0.5, 0.5);
      this.rays.push(ray);
      this.root.add(ray);
    }

    // The same frame the corner banter boxes use, scaled up: dark plate, thin
    // tinted border, thicker bar on the outer edge. A translucent coloured
    // square was the first attempt and read as an unfinished placeholder —
    // reusing the established panel makes the cutscene look like part of the
    // same interface rather than a different screen.
    this.portraitPanel = scene.add
      .rectangle(0, VIEW_H / 2, PANEL, PANEL, 0x080c15, 0.86)
      .setOrigin(0.5, 0.5)
      .setStrokeStyle(2, 0xffffff, 0.9);
    this.root.add(this.portraitPanel);

    this.portraitEdge = scene.add
      .rectangle(0, VIEW_H / 2, 4, PANEL, 0xffffff, 1)
      .setOrigin(0.5, 0.5);
    this.root.add(this.portraitEdge);

    this.portrait = scene.add.image(0, VIEW_H / 2, '__missing');
    this.portrait.setOrigin(0.5, 0.5);
    this.root.add(this.portrait);

    this.modeText = scene.add
      .text(0, VIEW_H / 2 - 54, '', {
        fontFamily: FONT,
        fontSize: '38px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0.5)
      .setStroke('#04060c', 8);
    this.root.add(this.modeText);

    this.subText = scene.add
      .text(0, VIEW_H / 2 - 26, 'SATURATION', {
        fontFamily: FONT,
        fontSize: '13px',
        color: '#8fa3bf',
      })
      .setOrigin(0.5, 0.5)
      .setStroke('#04060c', 5);
    this.root.add(this.subText);

    this.pilotText = scene.add
      .text(0, VIEW_H / 2 - 6, '', { fontFamily: FONT, fontSize: '14px', color: '#c9d6ea' })
      .setOrigin(0.5, 0.5)
      .setStroke('#04060c', 5);
    this.root.add(this.pilotText);

    this.lineText = scene.add
      .text(0, VIEW_H / 2 + 22, '', {
        fontFamily: FONT,
        fontSize: '20px',
        color: '#ffffff',
        align: 'center',
        wordWrap: { width: 420 },
      })
      .setOrigin(0.5, 0.5)
      .setStroke('#04060c', 6);
    this.root.add(this.lineText);

    // Letterbox bars, drawn last so they sit over everything else.
    this.barTop = scene.add.rectangle(0, 0, VIEW_W, 64, 0x04060c, 1).setOrigin(0, 1);
    this.barBottom = scene.add.rectangle(0, VIEW_H, VIEW_W, 64, 0x04060c, 1).setOrigin(0, 0);
    this.root.add(this.barTop);
    this.root.add(this.barBottom);
  }

  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.root];
  }

  get active(): boolean {
    return this.ticks > 0;
  }

  /** 0..1 across the whole cutscene, for the caller's camera push. */
  get progress(): number {
    return this.active ? 1 - this.ticks / CUTSCENE_TICKS : 0;
  }

  /**
   * Starts the cutscene. `portraitKey` is the full 256px portrait, not the
   * thumbnail — this is the one place there is room for it.
   */
  play(opts: {
    portraitKey: string;
    pilot: string;
    mode: number;
    line: string | null;
    tint: number;
    /** Which half of the screen the activating mech is on, 0..1. */
    screenFrac: number;
    /** True when the meter was not full — the burst is a gamble. */
    partial?: boolean;
    /**
     * Overrides the big headline. Defaults to the saturation mode's name.
     *
     * The card is the only place in the game with room for a portrait and a
     * line, so anything that deserves that treatment reuses it rather than
     * growing a second one — LAST STAND is the first such thing.
     */
    label?: string;
    /** Overrides the small line under the headline. */
    sub?: string;
  }): void {
    this.ticks = CUTSCENE_TICKS;
    // The portrait enters from the same side as its machine, so the cutscene
    // never contradicts where the player was just looking.
    this.side = opts.screenFrac < 0.5 ? 1 : -1;

    if (this.portrait.scene.textures.exists(opts.portraitKey)) {
      this.portrait.setTexture(opts.portraitKey);
    }
    this.portrait.setDisplaySize(PORTRAIT, PORTRAIT);
    // Border and edge take the pilot's accent, exactly as their banter box does.
    this.portraitPanel.setStrokeStyle(2, opts.tint, 0.9);
    this.portraitEdge.setFillStyle(opts.tint, 1);

    this.modeText.setText(opts.label ?? `${SAT_MODE_NAMES[opts.mode] ?? 'SATURATION'}`);
    // A forced burst is labelled as one and goes red, so the cutscene never
    // implies the pilot got what they wanted.
    this.modeText.setColor(opts.partial ? '#ff6a4a' : '#' + opts.tint.toString(16).padStart(6, '0'));
    this.subText.setText(opts.sub ?? (opts.partial ? 'FORCED — OVERHEAT IMMINENT' : 'SATURATION'));
    this.subText.setColor(opts.partial ? '#ff9a7a' : '#8fa3bf');
    this.pilotText.setText(opts.pilot);
    this.lineText.setText(opts.line ?? '');

    for (const r of this.rays) r.setTint(opts.tint);

    this.root.setVisible(true);
    this.layout(0);
  }

  /** Advances one simulation tick. Returns true while it still owns the screen. */
  step(): boolean {
    if (this.ticks <= 0) return false;
    this.ticks--;
    const done = CUTSCENE_TICKS - this.ticks;

    // Envelope: slide in, hold, slide out.
    let k: number;
    if (done < IN_TICKS) k = done / IN_TICKS;
    else if (this.ticks < OUT_TICKS) k = this.ticks / OUT_TICKS;
    else k = 1;
    this.layout(Math.max(0, Math.min(1, k)));

    if (this.ticks <= 0) {
      this.root.setVisible(false);
      return false;
    }
    return true;
  }

  private layout(k: number): void {
    const eased = k * k * (3 - 2 * k);

    this.scrim.setAlpha(0.72 * eased);
    // Bars grow from the edges rather than fading, which reads as a shutter.
    this.barTop.setScale(1, eased);
    this.barBottom.setScale(1, eased);
    this.barTop.setY(64 * eased);
    this.barBottom.setY(VIEW_H - 64 * eased);

    // Portrait slides in from its own side and settles off-centre, leaving the
    // opposite half for the text.
    const restX = VIEW_W * (this.side > 0 ? 0.28 : 0.72);
    const fromX = restX - this.side * 260;
    const px = fromX + (restX - fromX) * eased;
    this.portrait.setX(px);
    this.portrait.setAlpha(eased);
    this.portraitPanel.setX(px);
    this.portraitPanel.setAlpha(eased);
    // The heavy bar sits on the screen-edge side, matching the corner boxes.
    this.portraitEdge.setX(px - this.side * (PANEL / 2 - 2));
    this.portraitEdge.setAlpha(eased);

    const textX = VIEW_W * (this.side > 0 ? 0.66 : 0.34);
    for (const t of [this.modeText, this.subText, this.pilotText, this.lineText]) {
      t.setX(textX);
      t.setAlpha(eased);
    }
    // The mode name arrives a beat late and overshoots, so it lands hard.
    this.modeText.setScale(1.25 - 0.25 * eased);

    for (let i = 0; i < this.rays.length; i++) {
      const ray = this.rays[i];
      const a = (i / this.rays.length) * Math.PI * 2;
      const spread = 90 + (1 - eased) * 260;
      ray.setPosition(px + Math.cos(a) * spread, VIEW_H / 2 + Math.sin(a) * spread * 0.6);
      ray.setRotation(a);
      ray.setScale(1.6 * eased, 0.09);
      ray.setAlpha(0.5 * eased);
    }
  }

  /** Cuts it short, for a rematch or a pause. */
  reset(): void {
    this.ticks = 0;
    this.root.setVisible(false);
  }

  destroy(): void {
    this.root.destroy();
  }
}
