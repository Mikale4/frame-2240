import Phaser from 'phaser';
import { GAME_VERSION, VIEW_H, VIEW_W } from '../core/GameConfig';
import { InputManager } from '../input/InputManager';
import { smallText } from '../ui/Menu';
import { TitleMark } from '../ui/TitleMark';
import type { TitleDesignId } from '../ui/TitleDesigns';
import { sfx } from '../audio/Sfx';
import { music } from '../audio/Music';
import { Difficulty, session } from '../core/Session';
import { ROSTER } from '../data/mechs';

/**
 * Which candidate wordmark is on screen.
 *
 * Four lockups are being compared live rather than on a contact sheet, because
 * a mark that reads on black can vanish on a lit background — which is exactly
 * what happened to the first city artwork. Flip this to look at another.
 */
const TITLE_DESIGN: TitleDesignId = 'instrument';

/**
 * Seconds of no input before the attract demo starts.
 *
 * Long enough that a player who arrived deliberately gets to look at the title
 * and press start, short enough that an abandoned screen does not sit still.
 */
const IDLE_BEFORE_DEMO_S = 8;

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
    // Cleared on the way *in* as well as on the way out. If a demo ever dies
    // without running its exit — a reload mid-demo, a thrown error — the flag
    // would otherwise survive and strip the HUD off the next real match.
    session.demo = false;

    // Boot reaches here without a gesture, so this normally sets the intent and
    // the first keypress is what actually starts it. Coming back from a match
    // there has been a gesture, and it starts immediately.
    music.play('title');

    // ---- background: twilight, standing in ------------------------------
    //
    // **Deliberately temporary.** The painted yard-deck layers are still in
    // `assets/ui/` and briefed in `docs/TITLE_STAGE_ART_BRIEF.md`; they are not
    // drawn because the backdrop is undecided and a lit sky makes it impossible
    // to judge a hairline wordmark. `BootScene` no longer loads them — restoring
    // is that flag plus the layer loop, both in git.
    //
    // A flat fill would band on a gradient this dark, so it is drawn as strips
    // fine enough that the steps fall below one 8-bit level.
    const g = this.add.graphics();
    for (let i = 0; i < 64; i++) {
      const t = i / 63;
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(0x0a0714),
        Phaser.Display.Color.ValueToColor(0x2a1c3f),
        100,
        Math.round(t * 100),
      );
      g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1);
      g.fillRect(0, (i * VIEW_H) / 64, VIEW_W, VIEW_H / 64 + 1);
    }

    // ---- titles ----------------------------------------------------------
    // **The initialism is not spelled out here, deliberately.** In the world
    // nobody expands it, so a title screen that does would be the one place the
    // game speaks out of character. It is in the README for anyone who wants it.
    this.mark = new TitleMark(this, VIEW_W / 2, 150, TITLE_DESIGN);

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
      return;
    }
    if (this.t >= IDLE_BEFORE_DEMO_S) this.startDemo();
  }

  /**
   * Starts an attract demo: two random machines, both CPU, no interface.
   *
   * **A real match**, not a scripted set piece — same simulation, same AI, same
   * arena. `EXTREME` on both sides because it is the tier that plays
   * differently rather than merely better, and because it produces the longest
   * fights, so fifteen seconds lands mid-exchange instead of on a knockout.
   *
   * `matchIndex` is bumped here because nothing else will: the demo skips
   * `MechSelect`, which is normally what advances the seed, so without this
   * every demo of the same pairing would replay the identical fight.
   */
  private startDemo(): void {
    const ids = ROSTER.map((m) => m.id);
    const a = Math.floor(Math.random() * ids.length);
    // Offset rather than re-rolled, so the two are distinct without a loop that
    // can in principle spin.
    const b = (a + 1 + Math.floor(Math.random() * (ids.length - 1))) % ids.length;
    session.playerMech = ids[a];
    session.enemyMech = ids[b];
    session.mode = 'aiVsAi';
    session.playerDifficulty = Difficulty.Extreme;
    session.enemyDifficulty = Difficulty.Extreme;
    session.matchIndex++;
    session.demo = true;
    this.scene.start('Battle');
  }
}
