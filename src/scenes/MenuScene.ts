import Phaser from 'phaser';
import { GAME_TITLE, VIEW_H, VIEW_W } from '../core/GameConfig';
import { MODE_LABELS, session, type MatchMode } from '../core/Session';
import { InputManager } from '../input/InputManager';
import { Menu, bigTitle, smallText } from '../ui/Menu';
import { BindingsPanel } from '../ui/BindingsPanel';
import { sfx } from '../audio/Sfx';

/**
 * The main menu, reached from the title's Press Start.
 *
 * The list scrolls rather than being sized to fit, so entries can be added as
 * the game grows without the menu having to be re-laid-out each time.
 */
export class MenuScene extends Phaser.Scene {
  private input$!: InputManager;
  private menu!: Menu;
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
      g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1);
      g.fillRect(0, (i * VIEW_H) / 40, VIEW_W, VIEW_H / 40 + 1);
    }
    const far = this.add.image(0, VIEW_H - 300, 'arena_far').setOrigin(0, 0);
    far.setTint(0x39445e).setAlpha(0.4);

    bigTitle(this, GAME_TITLE, 62, 34, '#eaf2ff');
    smallText(this, 'MAIN MENU', VIEW_W / 2, 96, 13, '#7d8ea8');

    // ---- menu ------------------------------------------------------------
    // Mode only. Which machines fight and how good the rival is are match
    // settings, and they belong on the select screen where you can see the
    // roster — picking a fighter from a text menu is not how this genre works.
    this.menu = new Menu(
      this,
      [
        { label: MODE_LABELS.vsCpu, onSelect: () => this.pick('vsCpu') },
        { label: MODE_LABELS.aiVsAi, onSelect: () => this.pick('aiVsAi') },
        { label: MODE_LABELS.training, onSelect: () => this.pick('training') },
        { label: 'CONTROLS', onSelect: () => this.toggleControls() },
        {
          label: 'AUDIO',
          value: () => (session.muted ? 'MUTED' : 'ON'),
          onSelect: () => {
            session.muted = !session.muted;
            sfx.setMuted(session.muted);
          },
        },
        { label: 'BACK TO TITLE', onSelect: () => this.back() },
      ],
      VIEW_W / 2,
      VIEW_H / 2 - 34,
      { size: 22, gap: 40, maxVisible: 5 },
    );

    smallText(
      this,
      'ARROWS / W S  select      ENTER or J  confirm      ESC  back',
      VIEW_W / 2,
      VIEW_H - 26,
      12,
      '#63748c',
    );

    this.buildControls();
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
    const ui = this.input$.readUi();
    if (ui.up) this.menu.move(-1);
    if (ui.down) this.menu.move(1);
    if (ui.confirm) this.menu.confirm();
    if (ui.cancel) this.back();
    this.menu.update();
  }
}
