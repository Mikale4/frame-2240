import Phaser from 'phaser';
import { attachYardBackdrop } from '../voxel/YardBackdrop';
import { GAME_TITLE, VIEW_H, VIEW_W } from '../core/GameConfig';
import { MODE_LABELS, session, type MatchMode } from '../core/Session';
import { InputManager } from '../input/InputManager';
import { Menu, bigTitle, smallText } from '../ui/Menu';
import { BindingsPanel } from '../ui/BindingsPanel';
import { audioMenuItems } from '../ui/AudioOptions';
import { sfx } from '../audio/Sfx';
import { music } from '../audio/Music';

/**
 * The main menu, reached from the title's Press Start.
 *
 * The list scrolls rather than being sized to fit, so entries can be added as
 * the game grows without the menu having to be re-laid-out each time.
 */
export class MenuScene extends Phaser.Scene {
  private input$!: InputManager;
  private menu!: Menu;
  private settingsMenu!: Menu;
  private subtitle!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  /** Which list is on screen. Settings is a page, not a popup. */
  private page: 'main' | 'settings' = 'main';
  private bindingsPanel?: BindingsPanel;
  private t = 0;
  private armAt = 0;

  constructor() {
    super('Menu');
  }

  create(): void {
    this.input$ = new InputManager(this);
    this.input$.reset();
    this.t = 0;
    // The same press that left the title would otherwise land here too.
    this.armAt = 0.18;
    // Field initialisers do not re-run on a scene restart.
    this.page = 'main';

    // Also covers the controls and audio panels, which live on this scene.
    music.play('menu');

    // ---- background ------------------------------------------------------
    const g = this.add.graphics();
    for (let i = 0; i < 40; i++) {
      const t = i / 39;
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(0x060910),
        Phaser.Display.Color.ValueToColor(0x1d1930),
        100,
        Math.round(t * 100),
      );
      // Translucent now: the voxel yard drifts underneath (see below), and
      // this gradient is its scrim rather than the whole background.
      g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 0.86 - t * 0.2);
      g.fillRect(0, (i * VIEW_H) / 40, VIEW_W, VIEW_H / 40 + 1);
    }
    attachYardBackdrop(this);

    bigTitle(this, GAME_TITLE, 62, 34, '#eaf2ff');
    this.subtitle = smallText(this, 'MAIN MENU', VIEW_W / 2, 96, 13, '#7d8ea8');

    // ---- menus -----------------------------------------------------------
    // What to play, and nothing else. Which machines fight and how good the
    // rival is are match settings, and they belong on the select screen where
    // you can see the roster — picking a fighter from a text menu is not how
    // this genre works.
    //
    // Everything that is not a mode lives one level down under SETTINGS. A flat
    // list that mixed "start a fight" with "set the music volume" made the two
    // look like equivalent choices, which they are not.
    this.menu = new Menu(
      this,
      [
        {
          label: 'CAMPAIGN',
          disabled: true,
          disabledNote: 'COMING SOON',
          onSelect: () => {},
        },
        // First of the live modes, because it is where a new pilot should go.
        // Straight into the course: it always teaches on the same machine, so
        // there is nothing to choose on the roster screen.
        { label: MODE_LABELS.tutorial, onSelect: () => this.startTutorial() },
        { label: MODE_LABELS.vsCpu, onSelect: () => this.pick('vsCpu') },
        // The three-dimensional mode, beside the match it is a version of.
        { label: MODE_LABELS.orbit, onSelect: () => this.pick('orbit') },
        { label: MODE_LABELS.aiVsAi, onSelect: () => this.pick('aiVsAi') },
        { label: MODE_LABELS.training, onSelect: () => this.pick('training') },
        /**
         * A match rule, so it sits with the modes rather than under SETTINGS.
         *
         * Turning it off does not tune anything — it removes a mechanic and
         * the two partner stages from mech select, and a straight 1v1 is a
         * reasonable thing to ask for. Placed after the modes because it
         * qualifies them: you choose what kind of fight, then whether anyone
         * else is allowed in it.
         *
         * **Disabled for now**, the same way CAMPAIGN is: the mechanic is built
         * and measured but set aside, and a row that is visibly deferred is a
         * better account of that than a row that quietly vanished. The handlers
         * stay wired because `Menu` refuses a disabled row at both entry points
         * — `confirm` and `adjust` — so nothing here can fire, and re-enabling
         * is deleting one flag rather than reconstructing the row. The other
         * half of the switch is `assists` in `Session.ts`, which is `false`;
         * this flag alone would leave the mechanic on and merely unreachable.
         */
        {
          label: 'TAG/ASSIST',
          disabled: true,
          disabledNote: 'COMING SOON',
          value: () => (session.assists ? 'ON' : 'OFF'),
          onSelect: () => this.toggleAssists(),
          onAdjust: () => this.toggleAssists(),
        },
        // The story lives here rather than behind CAMPAIGN, so it is readable
        // before the campaign that will use it exists.
        { label: 'ARCHIVE', onSelect: () => this.openArchive() },
        { label: 'SETTINGS', onSelect: () => this.openSettings() },
        { label: 'BACK TO TITLE', onSelect: () => this.back() },
      ],
      VIEW_W / 2,
      VIEW_H / 2 - 54,
      { size: 22, gap: 36, maxVisible: 7 },
    );

    this.settingsMenu = new Menu(
      this,
      [
        { label: 'CONTROLS', onSelect: () => this.toggleControls() },
        ...audioMenuItems(),
        { label: 'BACK', onSelect: () => this.closeSettings() },
      ],
      VIEW_W / 2,
      VIEW_H / 2 - 34,
      { size: 22, gap: 40, maxVisible: 4 },
    );
    this.settingsMenu.setVisible(false);

    this.hint = smallText(
      this,
      '',
      VIEW_W / 2,
      VIEW_H - 26,
      12,
      '#63748c',
    );

    this.buildControls();
    this.refreshChrome();
  }

  /** Which list is live. Kept explicit so `update` has one place to branch. */
  private get active(): Menu {
    return this.page === 'settings' ? this.settingsMenu : this.menu;
  }

  private openArchive(): void {
    this.scene.start('Archive');
  }

  private openSettings(): void {
    this.page = 'settings';
    this.refreshChrome();
  }

  private closeSettings(): void {
    this.page = 'main';
    this.bindingsPanel?.setVisible(false);
    this.refreshChrome();
  }

  /** Title, hint line and which list is on screen, for the current page. */
  private refreshChrome(): void {
    const settings = this.page === 'settings';
    this.subtitle.setText(settings ? 'SETTINGS' : 'MAIN MENU');
    this.menu.setVisible(!settings);
    this.settingsMenu.setVisible(settings);
    this.hint.setText(
      settings
        ? 'ARROWS / W S  select      LEFT RIGHT  adjust      ENTER  confirm      ESC  back'
        : 'ARROWS / W S  select      ENTER or J  confirm      ESC  back',
    );
  }

  private buildControls(): void {
    this.bindingsPanel = new BindingsPanel(this, () => {
      this.bindingsPanel?.setVisible(false);
    });
    this.bindingsPanel.setVisible(false);
  }

  private toggleControls(): void {
    if (!this.bindingsPanel) return;
    this.bindingsPanel.setVisible(!this.bindingsPanel.isOpen);
  }

  /** First connected pad, guarded; the bindings panel captures pad buttons too. */
  private pad(): Phaser.Input.Gamepad.Gamepad | null {
    try {
      const gp = this.input.gamepad;
      if (!gp || gp.total === 0) return null;
      const p = gp.pad1 ?? gp.getPad(0) ?? null;
      return p && p.connected ? p : null;
    } catch {
      return null;
    }
  }

  /** Flips the match rule. Confirm and left/right both do it, so it cannot be missed. */
  private toggleAssists(): void {
    session.assists = !session.assists;
    sfx.uiMove();
  }

  private startTutorial(): void {
    sfx.unlock();
    session.mode = 'tutorial';
    session.demo = false;
    session.matchIndex++;
    this.scene.start('Battle');
  }

  /** Choosing a mode goes straight to the roster, as a fighting game would. */
  private pick(mode: MatchMode): void {
    sfx.unlock();
    session.mode = mode;
    this.scene.start('MechSelect');
  }

  private back(): void {
    sfx.uiBack();
    this.scene.start('Title');
  }

  override update(_time: number, delta: number): void {
    this.t += delta / 1000;

    // While the rebinding panel is open it owns all input: it reads key edges
    // directly so that rebinding a menu key cannot also trigger the menu.
    if (this.bindingsPanel?.isOpen) {
      this.bindingsPanel.update(this.pad());
      return;
    }

    if (this.t < this.armAt) return;
    const menu = this.active;
    const ui = this.input$.readUi();
    if (ui.up) menu.move(-1);
    if (ui.down) menu.move(1);
    // Only the volume rows consume these; every other row ignores them.
    if (ui.left) menu.adjust(-1);
    if (ui.right) menu.adjust(1);
    if (ui.confirm) menu.confirm();
    // Cancel backs out one level rather than always leaving the scene.
    if (ui.cancel) {
      if (this.page === 'settings') {
        sfx.uiBack();
        this.closeSettings();
      } else {
        this.back();
      }
    }
    menu.update();
  }
}
