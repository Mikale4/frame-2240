import Phaser from 'phaser';
import { GAME_VERSION, VIEW_H, VIEW_W } from '../core/GameConfig';
import { InputManager } from '../input/InputManager';
import { smallText } from '../ui/Menu';
import { LOGO_STYLES } from '../ui/Logotype';
import { TitleMark } from '../ui/TitleMark';
import { sfx } from '../audio/Sfx';
import { music } from '../audio/Music';

/**
 * The backdrop stack, furthest first, with an optional grading tint.
 *
 * All five layers are composed in one 1536x1024 frame, **including the opaque
 * sky**, so the whole set is drawn to one shared rect and registers by
 * construction rather than by five hand-tuned offsets.
 *
 * **Tint only — do not reach for `preFX` here.** A colour matrix and a small
 * blur read better on paper and cost a visible defect: once an object is put on
 * the FX pipeline Phaser keeps it there, `preFX.clear()` does not take it off,
 * and the extra pass misaligns these `setDisplaySize`-scaled layers just enough
 * to expose a band of the opaque sky along the bottom of the screen. Tint is a
 * vertex multiply with no render target and no such trap.
 *
 * **`title_yards` is missing.** The distant-yard layer came back empty — max
 * alpha 5 of 255, scattered as noise over the whole frame — and it is the layer
 * that gives the cloud sea scale and says the world is inhabited. It belongs
 * between the sea and the structure when it exists; `BootScene` gates it.
 */
const TITLE_LAYERS: readonly (readonly [string, number?])[] = [
  ['title_sky'],
  ['title_sea'],
  ['title_structure'],
  ['title_deck'],
];

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
    // The open edge of a yard's deck, above the cloud sea at dawn. It borrowed
    // CATHEDRAL YARD's arena layers first, which spent the game's only stage
    // before the player had seen it; then a mountain summit, which was a nature
    // scene fronting a game with no nature in it.
    //
    // 3:2 art on a 16:9 screen overflows the height by 100px, taken off the top,
    // which is empty sky the opaque layer covers anyway. See `TITLE_LAYERS`.
    const layerH = VIEW_W * (1024 / 1536);
    for (const [key, tint] of TITLE_LAYERS) {
      // **The deck does not quite reach the corners.** Its art runs to the last
      // row of the frame but covers only 92 % of the width there, and what shows
      // through the remaining 8 % is the opaque sky's warm horizon — a pink band
      // along the bottom of the screen, under a structure that should be
      // hanging over two kilometres of nothing. A dark plate immediately behind
      // the deck fills it with the void that belongs there. Measured, not
      // guessed: the gap is the corners, so the plate only has to be a strip.
      if (key === 'title_deck') {
        this.add
          .rectangle(0, VIEW_H - 74, VIEW_W, 74, 0x080b12)
          .setOrigin(0, 0);
      }
      const img = this.add.image(0, VIEW_H - layerH, key).setOrigin(0, 0);
      img.setDisplaySize(VIEW_W, layerH);
      if (tint) img.setTint(tint);
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
