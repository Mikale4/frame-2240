import Phaser from 'phaser';
import { GAME_SUBTITLE, GAME_TITLE, GAME_VERSION, VIEW_H, VIEW_W } from '../core/GameConfig';
import { DIFFICULTY_NAMES, MODE_LABELS, session, type MatchMode } from '../core/Session';
import { InputManager } from '../input/InputManager';
import { Menu, bigTitle, smallText } from '../ui/Menu';
import { BindingsPanel } from '../ui/BindingsPanel';
import { MECHS } from '../data/mechs';
import { sfx } from '../audio/Sfx';
import { PART_SCALE } from '../render/MechRenderer';

const MODES: MatchMode[] = ['vsCpu', 'aiVsAi', 'training'];

/** Title screen: mode, difficulty, controls, and a slow parade of both mechs. */
export class TitleScene extends Phaser.Scene {
  private input$!: InputManager;
  private menu!: Menu;
  private bindingsPanel?: BindingsPanel;
  private modeIdx = 0;
  private t = 0;
  private mechGroups: Phaser.GameObjects.Container[] = [];

  constructor() {
    super('Title');
  }

  create(): void {
    this.input$ = new InputManager(this);
    this.input$.reset();
    this.modeIdx = Math.max(0, MODES.indexOf(session.mode));
    // Field initialisers do not re-run on a scene restart, so clear this or
    // returning to the title would animate the previous visit's dead containers.
    this.mechGroups = [];
    this.t = 0;

    // ---- background ------------------------------------------------------
    const g = this.add.graphics();
    for (let i = 0; i < 40; i++) {
      const t = i / 39;
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(0x070a14),
        Phaser.Display.Color.ValueToColor(0x2a2038),
        100,
        Math.round(t * 100),
      );
      g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1);
      g.fillRect(0, (i * VIEW_H) / 40, VIEW_W, VIEW_H / 40 + 1);
    }
    const far = this.add.image(0, VIEW_H - 300, 'arena_far').setOrigin(0, 0);
    far.setTint(0x4a5878).setAlpha(0.65);
    const mid = this.add.image(-120, VIEW_H - 190, 'arena_mid').setOrigin(0, 0);
    mid.setTint(0x6d7c9c).setAlpha(0.5);

    // ---- mech showcase ---------------------------------------------------
    this.showcase('halcyon', VIEW_W * 0.17, VIEW_H * 0.50, 1);
    this.showcase('nocturne', VIEW_W * 0.84, VIEW_H * 0.50, -1);

    // ---- titles ----------------------------------------------------------
    bigTitle(this, GAME_TITLE, 74, 62, '#eaf2ff');
    const sub = bigTitle(this, GAME_SUBTITLE, 118, 30, '#ffd166');
    sub.setLetterSpacing(10);
    smallText(this, 'ORIGINAL AERIAL MECHA COMBAT', VIEW_W / 2, 146, 12, '#7d8ea8');

    // ---- menu ------------------------------------------------------------
    this.menu = new Menu(
      this,
      [
        {
          label: 'MODE',
          value: () => MODE_LABELS[MODES[this.modeIdx]],
          onSelect: () => {
            this.modeIdx = (this.modeIdx + 1) % MODES.length;
            session.mode = MODES[this.modeIdx];
          },
        },
        {
          label: 'RIVAL SKILL',
          value: () => `${session.difficulty}  ${DIFFICULTY_NAMES[session.difficulty]}`,
          onSelect: () => {
            session.difficulty = (session.difficulty % 8) + 1;
          },
        },
        { label: 'LAUNCH', onSelect: () => this.launch() },
        { label: 'CONTROLS', onSelect: () => this.toggleControls() },
        {
          label: 'AUDIO',
          value: () => (session.muted ? 'MUTED' : 'ON'),
          onSelect: () => {
            session.muted = !session.muted;
            sfx.setMuted(session.muted);
          },
        },
      ],
      VIEW_W / 2,
      VIEW_H - 158,
      { size: 20, gap: 30 },
    );

    smallText(
      this,
      'ARROWS / W S  select      ENTER or J  confirm',
      VIEW_W / 2,
      VIEW_H - 22,
      12,
      '#63748c',
    );
    smallText(this, `v${GAME_VERSION}`, VIEW_W - 12, VIEW_H - 10, 10, '#3f4c5e', [1, 1]);

    this.buildControls();
  }

  /** Builds a static assembled mech from its part sprites for the title art. */
  private showcase(mechId: string, x: number, y: number, facing: number): void {
    const def = MECHS[mechId];
    const root = this.add.container(x, y);
    root.scaleX = facing;
    root.setScale(facing * 1.45, 1.45);

    const nodes = new Map<string, Phaser.GameObjects.Container>();
    for (const part of def.rig.parts) {
      const c = this.add.container(part.x, part.y);
      const img = this.add.image(0, 0, `mech_${mechId}_${part.name}`);
      img.setScale(PART_SCALE);
      c.add(img);
      nodes.set(part.name, c);
    }
    for (const part of def.rig.parts) {
      const node = nodes.get(part.name)!;
      const parent = part.parent ? nodes.get(part.parent) : null;
      (parent ?? root).add(node);
    }
    for (const name of def.rig.drawOrder) {
      const n = nodes.get(name);
      if (n?.parentContainer) n.parentContainer.bringToTop(n);
    }

    // The showcase is a rest pose, so stow the melee weapon exactly as the
    // in-game rig does. Drawn together, the saber blade crosses straight
    // through the rifle.
    nodes.get('meleeWeapon')?.setVisible(false);

    root.setData('nodes', nodes);
    this.mechGroups.push(root);

    const label = this.add
      .text(x, y + 96, `${def.codeName}\n${def.name}`, {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: '15px',
        color: '#' + def.tint.primary.toString(16).padStart(6, '0'),
        align: 'center',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0)
      .setStroke('#070b12', 5);
    this.add
      .text(x, y + 136, `PWR ${'●'.repeat(def.statPower)}${'○'.repeat(5 - def.statPower)}\nSPD ${'●'.repeat(def.statSpeed)}${'○'.repeat(5 - def.statSpeed)}\nRNG ${'●'.repeat(def.statRange)}${'○'.repeat(5 - def.statRange)}`, {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: '11px',
        color: '#8fa3bd',
        align: 'center',
      })
      .setOrigin(0.5, 0)
      .setStroke('#070b12', 4);
    void label;
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

  private launch(): void {
    sfx.unlock();
    session.matchIndex++;
    this.scene.start('Battle');
  }

  override update(_time: number, delta: number): void {
    this.t += delta / 1000;
    const ui = this.input$.readUi();

    // Gentle hover so the showcase mechs feel alive.
    this.mechGroups.forEach((m, i) => {
      m.y += Math.sin(this.t * 1.5 + i * 1.7) * 0.16;
      m.rotation = Math.sin(this.t * 0.9 + i) * 0.02;
    });

    // While the rebinding panel is open it owns all input: it reads key edges
    // directly so that rebinding a menu key cannot also trigger the menu.
    if (this.bindingsPanel?.isOpen) {
      this.bindingsPanel.update(this.pad());
      return;
    }

    if (ui.up) this.menu.move(-1);
    if (ui.down) this.menu.move(1);
    if (ui.confirm) this.menu.confirm();
    this.menu.update();
  }
}
