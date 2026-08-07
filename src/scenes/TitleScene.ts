import Phaser from 'phaser';
import { GAME_VERSION, VIEW_H, VIEW_W } from '../core/GameConfig';
import { InputManager } from '../input/InputManager';
import { smallText } from '../ui/Menu';
import { LOGO_STYLES } from '../ui/Logotype';
import { TitleMark } from '../ui/TitleMark';
import { sfx } from '../audio/Sfx';
import { music } from '../audio/Music';

/**
 * Attract screen: a vista, the title, and nothing to decide.
 *
 * Every option used to live here, which made the first thing a player saw a
 * settings form. The options now live in `MenuScene`; this screen exists to be
 * looked at, and any button moves on.
 *
 * **Two showcase mechs used to stand in the middle of it.** They were built to
 * give a flat backdrop something to look at. The backdrop is now the subject,
 * and two machines parked in front of it were competing with the thing they were
 * hired to decorate. The roster is introduced on the select screen, where the
 * player is choosing from it.
 */
export class TitleScene extends Phaser.Scene {
  private input$!: InputManager;
  private t = 0;
  private mark!: TitleMark;
  private prompt!: Phaser.GameObjects.Text;
  /** Blocks input for a beat so the button that returned here cannot re-enter. */
  private armAt = 0;

  constructor() {
    super('Title');
  }

  create(): void {
    this.input$ = new InputManager(this);
    this.input$.reset();
    this.t = 0;
    this.armAt = 0.25;

    // Boot reaches here without a gesture, so this normally sets the intent and
    // the first keypress is what actually starts it. Coming back from a match
    // there has been a gesture, and it starts immediately.
    music.play('title');

    // ---- background: the title's own vista --------------------------------
    //
    // Was CATHEDRAL YARD's arena layers, tinted and offset to find an empty
    // corner to put a logo on. That spent the game's only stage before the
    // player had seen it, and a dockyard interior is a cramped first impression
    // of a game about flight. This is a mountain summit above the cloud sea.
    //
    // **The five transparent layers were composed in one 1536x1024 frame**, so
    // they are drawn to a single shared rect and line up by construction rather
    // than by five hand-tuned offsets. The sky is 16:9 and covers exactly.
    const sky = this.add.image(0, 0, 'title_sky').setOrigin(0, 0);
    sky.setDisplaySize(VIEW_W, VIEW_W * (941 / 1672));

    // 3:2 art on a 16:9 screen: filling the width overflows the height by 100px.
    // Anchored to the bottom, because that is where the rock is and the surplus
    // is empty sky the opaque layer already covers.
    const layerH = VIEW_W * (1024 / 1536);
    for (const key of ['title_haze', 'title_peaks', 'title_sea', 'title_cliff_mid', 'title_cliff_fore']) {
      const img = this.add.image(0, VIEW_H - layerH, key).setOrigin(0, 0);
      img.setDisplaySize(VIEW_W, layerH);
    }

    // ---- titles ----------------------------------------------------------
    // **The initialism is not spelled out here, deliberately.** In the world
    // nobody expands it, so a title screen that does would be the one place the
    // game speaks out of character. It is in the README for anyone who wants it.
    this.mark = new TitleMark(this, VIEW_W / 2, 118, LOGO_STYLES.heraldic);
    smallText(this, 'ORIGINAL AERIAL MECHA COMBAT', VIEW_W / 2, 246, 12, '#7d8ea8');

    // ---- press start -----------------------------------------------------
    this.prompt = this.add
      .text(VIEW_W / 2, VIEW_H - 118, 'PRESS  START', {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: '26px',
        color: '#ffd166',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0.5)
      .setStroke('#070b12', 6)
      .setLetterSpacing(4)
      .setDepth(1200);

    smallText(this, 'ENTER  /  J  /  GAMEPAD', VIEW_W / 2, VIEW_H - 78, 12, '#63748c');
    smallText(this, `v${GAME_VERSION}`, VIEW_W - 12, VIEW_H - 10, 10, '#3f4c5e', [1, 1]);
  }

  override update(_time: number, delta: number): void {
    this.t += delta / 1000;
    this.mark.update(this.t);

    // Slow pulse rather than a hard blink: readable, and it never disappears at
    // the moment someone looks at it.
    this.prompt.setAlpha(0.55 + 0.45 * Math.sin(this.t * 3.4));

    if (this.t < this.armAt) return;
    const ui = this.input$.readUi();
    if (ui.confirm) {
      sfx.unlock();
      sfx.uiConfirm();
      this.scene.start('Menu');
    }
  }
}
