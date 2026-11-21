import Phaser from 'phaser';
import { GAME_VERSION, VIEW_H, VIEW_W } from '../core/GameConfig';
import { InputManager } from '../input/InputManager';
import { smallText } from '../ui/Menu';
import { TitleMark } from '../ui/TitleMark';
import type { TitleDesignId } from '../ui/TitleDesigns';
import { sfx } from '../audio/Sfx';
import { music } from '../audio/Music';
import { session } from '../core/Session';
import { randomBackdrop } from './BackdropFight';

/**
 * Which candidate wordmark is on screen.
 *
 * Four lockups are being compared live rather than on a contact sheet, because
 * a mark that reads on black can vanish on a lit background — which is exactly
 * what happened to the first city artwork. Flip this to look at another.
 */
const TITLE_DESIGN: TitleDesignId = 'instrument';


/**
 * Fade length either side of the attract demo, in milliseconds.
 *
 * Long enough to read as a transition rather than a dropped frame, short enough
 * that it does not feel like a loading screen. The same figure is used on the
 * way back in `BattleScene`, so the two halves match.
 */
export const DEMO_FADE_MS = 700;

/**
 * Attract screen: a fight, the title, and nothing to decide.
 *
 * **The fight runs behind the title the whole time.** It used to be a separate
 * attract demo the title cut away to after ten idle seconds; it is now the
 * title's own backdrop — `BattleScene` launched underneath in backdrop mode, a
 * silent EXTREME CPU-vs-CPU fight between two random machines on the orbiting
 * demo camera, recycling to a new matchup after each knockout. Nothing about
 * it touches the session, so the machines a player last picked are untouched.
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
  private prompt!: Phaser.GameObjects.Text;
  /** Latches once the demo fade begins, so `update` cannot start it twice. */
  private leaving = false;
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
    this.leaving = false;
    // Fades in on every entry, not just when returning from a demo: arriving
    // from Boot and arriving from a match then look the same.
    this.cameras.main.fadeIn(DEMO_FADE_MS, 0, 0, 0);

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
    // The fight behind the title. Launched once and left running: coming back
    // from the menu finds it still going rather than restarting it.
    if (!this.scene.isActive('Battle')) this.scene.launch('Battle', { backdrop: randomBackdrop() });
    // Under this scene, so its fades between matchups never cover the title.
    this.scene.sendToBack('Battle');

    // A vignette rather than a sky: dark behind the wordmark and the prompt so
    // both read, thin across the middle so the fight is the backdrop.
    const g = this.add.graphics();
    for (let i = 0; i < 64; i++) {
      const t = i / 63;
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(0x0a0714),
        Phaser.Display.Color.ValueToColor(0x2a1c3f),
        100,
        Math.round(t * 100),
      );
      const top = 0.6 * Math.pow(Math.max(0, 1 - t / 0.5), 1.3);
      const bottom = 0.62 * Math.max(0, (t - 0.6) / 0.4);
      g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), Math.min(0.9, 0.22 + top + bottom));
      g.fillRect(0, (i * VIEW_H) / 64, VIEW_W, VIEW_H / 64 + 1);
    }

    new TitleMark(this, VIEW_W / 2, 150, TITLE_DESIGN);

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

    // Slow pulse rather than a hard blink: readable, and it never disappears at
    // the moment someone looks at it.
    this.prompt.setAlpha(0.55 + 0.45 * Math.sin(this.t * 3.4));

    if (this.t < this.armAt || this.leaving) return;
    const ui = this.input$.readUi();
    if (ui.confirm) {
      sfx.unlock();
      sfx.uiConfirm();
      this.leaving = true;
      this.scene.stop('Battle');
      this.scene.start('Menu');
    }
  }
}
