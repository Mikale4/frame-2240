import Phaser from 'phaser';
import { DECK_Y, VIEW_H, VIEW_W } from '../core/GameConfig';
import { sfx } from '../audio/Sfx';
import { HOLO_FILL, holoLevel, holoRuling, type HoloRuling } from './HoloPanel';
import type { Gfx3D } from '../voxel/Gfx3D';
import { LESSONS, type KeyNames, type TutorialDirector } from '../tutorial/Tutorial';

const FONT = 'ui-monospace, Consolas, monospace';
/** The card's width and the margin it keeps from the bottom of the screen. */
const CARD_W = 680;
const MARGIN = 10;
const PAD = 14;

/**
 * The tutorial's lesson card, and the beacons it puts in the yard.
 *
 * A holographic plate along the bottom of the screen, the same treatment the
 * select screen's skill panel uses — this is the game talking to the pilot, and
 * it should look like the game's own hardware rather than a web page. It shows
 * one lesson at a time in the player's own keys, a bar for the goal, and a
 * CLEAR stamp when it is done.
 *
 * The battle camera keeps the band above it clear (`BattleView3D.reserveBottom`)
 * so the card never sits on top of the fight.
 */
export class TutorialPanel {
  readonly container: Phaser.GameObjects.Container;
  private readonly plate: Phaser.GameObjects.Rectangle;
  private readonly frame: Phaser.GameObjects.Rectangle;
  private ruling: HoloRuling;
  private readonly scene: Phaser.Scene;
  private readonly head: Phaser.GameObjects.Text;
  private readonly title: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;
  private readonly body: Phaser.GameObjects.Text;
  private readonly goal: Phaser.GameObjects.Text;
  private readonly count: Phaser.GameObjects.Text;
  private readonly bar: Phaser.GameObjects.Graphics;
  private readonly stamp: Phaser.GameObjects.Text;
  private shown = -1;
  private wasClearing = false;
  private wasDone = false;
  private t = 0;
  private barTop = 0;
  /** Height of the card as last laid out, for the camera's reserved band. */
  height = 120;

  constructor(
    scene: Phaser.Scene,
    private readonly director: TutorialDirector,
    private readonly keys: KeyNames,
    private readonly beacons: Gfx3D,
  ) {
    this.scene = scene;
    this.container = scene.add.container(0, 0).setDepth(900);
    this.plate = scene.add.rectangle(VIEW_W / 2, 0, CARD_W, 100, HOLO_FILL, 0.78).setOrigin(0.5, 0);
    this.frame = scene.add
      .rectangle(VIEW_W / 2, 0, CARD_W, 100)
      .setOrigin(0.5, 0)
      .setFillStyle(0, 0)
      .setStrokeStyle(2, 0x8fe9ff, 0.85);
    this.ruling = holoRuling(scene, 0, 0, 1, 1);
    const left = VIEW_W / 2 - CARD_W / 2 + PAD;
    const right = VIEW_W / 2 + CARD_W / 2 - PAD;
    this.head = scene.add.text(left, 0, '', { fontFamily: FONT, fontSize: '11px', color: '#8fe9ff' });
    this.hint = scene.add
      .text(right, 0, '', { fontFamily: FONT, fontSize: '11px', color: '#7d8ea8' })
      .setOrigin(1, 0);
    this.title = scene.add
      .text(left, 0, '', { fontFamily: FONT, fontSize: '19px', color: '#eaf2ff', fontStyle: 'bold' })
      .setStroke('#06121c', 3);
    this.body = scene.add.text(left, 0, '', {
      fontFamily: FONT,
      fontSize: '12px',
      color: '#cfe0f5',
      lineSpacing: 3,
      wordWrap: { width: CARD_W - PAD * 2 },
    });
    this.goal = scene.add.text(left, 0, '', {
      fontFamily: FONT,
      fontSize: '12px',
      color: '#ffd166',
      fontStyle: 'bold',
      wordWrap: { width: CARD_W - PAD * 2 - 70 },
    });
    this.count = scene.add
      .text(right, 0, '', { fontFamily: FONT, fontSize: '12px', color: '#ffd166', fontStyle: 'bold' })
      .setOrigin(1, 0);
    this.bar = scene.add.graphics();
    this.stamp = scene.add
      .text(VIEW_W / 2, 0, 'CLEAR', { fontFamily: FONT, fontSize: '40px', color: '#8effc0', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setStroke('#04140c', 6)
      .setVisible(false);
    this.container.add([
      this.plate,
      this.ruling.gfx,
      this.frame,
      this.head,
      this.hint,
      this.title,
      this.body,
      this.goal,
      this.count,
      this.bar,
      this.stamp,
    ]);
    this.layout();
  }

  /** Re-flows the card for the current lesson, bottom-anchored. */
  private layout(): void {
    const d = this.director;
    const k = this.keys;
    const L = d.lesson;
    if (d.done) {
      const n = d.cleared.size;
      this.head.setText(`COURSE COMPLETE · ${n} OF ${LESSONS.length} LESSONS CLEARED`);
      this.title.setText('YOU ARE CLEARED TO FLY');
      this.body.setText(
        'You have flown, braked, boosted and dashed, shot and swung, worked your drone, guarded, burst, ' +
          'repelled and spent Saturation. VERSUS CPU is the real thing; TRAINING drills any one of these.',
      );
      this.goal.setText(`Press ${k.main} to return to the main menu.`);
      this.hint.setText('');
    } else {
      this.head.setText(`${L.section} · LESSON ${d.index + 1} OF ${LESSONS.length}`);
      this.title.setText(L.title);
      this.body.setText(L.text(k));
      this.goal.setText(L.goal(k));
      this.hint.setText(`${k.pause} LESSON MENU`);
    }
    // Lay out top-down at y = 0, then slide the whole card to the bottom.
    let y = PAD - 2;
    this.head.setY(y);
    this.hint.setY(y);
    y += 15;
    this.title.setY(y);
    y += 25;
    this.body.setY(y);
    y += this.body.height + 6;
    this.goal.setY(y);
    this.count.setY(y);
    y += this.goal.height + 6;
    this.barTop = y;
    y += 6 + PAD - 2;
    this.height = y;
    const top = VIEW_H - MARGIN - y;
    for (const o of [this.head, this.hint, this.title, this.body, this.goal, this.count]) o.y += top;
    this.barTop += top;
    this.plate.setY(top).setSize(CARD_W, y);
    this.frame.setY(top).setSize(CARD_W, y);
    this.plate.setDisplaySize(CARD_W, y);
    this.frame.setDisplaySize(CARD_W, y);
    // Over the card's top edge, so it does not land on the lesson text.
    this.stamp.setY(top - 6);
    // The scanlines are drawn in absolute coordinates for one box, so a card
    // that changes height gets a fresh set rather than a stretched one.
    const old = this.ruling.gfx;
    this.ruling = holoRuling(this.scene, VIEW_W / 2 - CARD_W / 2 + 2, top + 2, CARD_W - 4, y - 4);
    this.container.addAt(this.ruling.gfx, this.container.getIndex(old));
    old.destroy();
  }

  update(dt: number): void {
    this.t += dt;
    const d = this.director;
    if (d.done !== this.wasDone || (!d.done && d.index !== this.shown)) {
      this.shown = d.index;
      this.wasDone = d.done;
      this.layout();
      this.stamp.setVisible(false);
      if (d.done) sfx.matchFight();
    }

    this.ruling.update(this.t);
    this.frame.setStrokeStyle(2, 0x8fe9ff, 0.6 + 0.3 * holoLevel(this.t));

    // Progress.
    const L = d.lesson;
    const frac = d.done ? 1 : d.fraction;
    this.count.setText(d.done ? '' : L.need > 6 ? `${Math.round(frac * 100)}%` : `${d.progress} / ${L.need}`);
    const left = VIEW_W / 2 - CARD_W / 2 + PAD;
    const w = CARD_W - PAD * 2;
    this.bar.clear();
    this.bar.fillStyle(0x06121c, 0.9);
    this.bar.fillRect(left, this.barTop, w, 6);
    this.bar.fillStyle(d.clearing > 0 || d.done ? 0x8effc0 : 0xffd166, 1);
    this.bar.fillRect(left, this.barTop, w * frac, 6);

    // The CLEAR stamp lands big and settles.
    const clearing = d.clearing > 0;
    if (clearing && !this.wasClearing) {
      sfx.uiConfirm();
      this.stamp.setVisible(true);
    }
    this.wasClearing = clearing;
    if (clearing) {
      const p = 1 - d.clearing / 84;
      const s = p < 0.15 ? 1.6 - p * 4 : 1;
      this.stamp.setScale(s);
      this.stamp.setAlpha(p > 0.8 ? (1 - p) * 5 : 1);
    } else if (!d.done) {
      this.stamp.setVisible(false);
    }

    // Beacons in the yard: a pulsing ring with a light pillar down to the deck.
    const b = this.beacons;
    b.clear();
    for (const m of d.markers()) {
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 5);
      b.lineStyle(3, 0xffd166, 0.5 + 0.4 * pulse);
      b.strokeCircle(m.x, m.y, m.r);
      b.lineStyle(2, 0xfff1c0, 0.35);
      b.strokeCircle(m.x, m.y, m.r * (0.55 + 0.15 * pulse));
      b.lineStyle(6, 0xffd166, 0.12);
      b.lineBetween(m.x, m.y + m.r, m.x, DECK_Y);
      b.fillStyle(0xffd166, 0.08);
      b.fillCircle(m.x, m.y, m.r);
    }
  }

  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.container];
  }

  destroy(): void {
    this.container.destroy(true);
  }
}
