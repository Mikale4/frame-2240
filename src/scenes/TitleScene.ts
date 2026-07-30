import Phaser from 'phaser';
import { GAME_SUBTITLE, GAME_TITLE, GAME_VERSION, VIEW_H, VIEW_W } from '../core/GameConfig';
import { DIFFICULTY_NAMES, MODE_LABELS, session, type MatchMode } from '../core/Session';
import { InputManager } from '../input/InputManager';
import { Menu, bigTitle, smallText } from '../ui/Menu';
import { MECHS } from '../data/mechs';
import { sfx } from '../audio/Sfx';
import { PART_SCALE } from '../render/MechRenderer';

const MODES: MatchMode[] = ['vsCpu', 'aiVsAi', 'training'];

/** Title screen: mode, difficulty, controls, and a slow parade of both mechs. */
export class TitleScene extends Phaser.Scene {
  private input$!: InputManager;
  private menu!: Menu;
  private controls?: Phaser.GameObjects.Container;
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
    const c = this.add.container(0, 0);
    c.setDepth(1300);
    const panel = this.add
      .rectangle(VIEW_W / 2, VIEW_H / 2, 720, 430, 0x070b14, 0.95)
      .setStrokeStyle(2, 0x3a4c66, 1);
    c.add(panel);
    c.add(bigTitle(this, 'CONTROLS', VIEW_H / 2 - 182, 26, '#ffd166', 1301));

    const rows: Array<[string, string]> = [
      ['MOVE (8-WAY FLIGHT)', 'W A S D  /  ARROWS  /  L-STICK'],
      ['MAIN GUN  (melee up close)', 'J  /  PAD A'],
      ['HEAVY SHOT', 'K  /  PAD X or Y'],
      ['SUB WEAPON (missiles)', 'L  /  PAD B'],
      ['BOOST (hold + dir)', 'SHIFT or SPACE  /  RB or RT'],
      ['DASH (tap + dir)', 'SHIFT or SPACE  /  RB or RT'],
      ['AIR BRAKE (hold, no dir)', 'SHIFT or SPACE  /  RB or RT'],
      ['BARRIER / GUARD (hold)', 'F  /  PAD LB or LT'],
      ['SATURATION  (full meter)', 'J + K  /  PAD A + X'],
      ['CYCLE SAT MODE', 'Q or TAB  /  PAD SELECT'],
      ['TOGGLE SOFT-LOCK', 'E  /  PAD R-STICK CLICK'],
      ['MANUAL AIM', 'RIGHT STICK'],
      ['SPREAD SHOT', 'DOWN, FORWARD + J'],
      ['LANCE BEAM', 'DOWN, BACK + K'],
      ['MISSILE SALVO', 'DOWN, FORWARD + L'],
      ['PAUSE', 'ESC or P  /  PAD START'],
      ['DEBUG TEXT / HITBOXES', 'F1  /  F2'],
    ];
    rows.forEach(([k, v], i) => {
      const y = VIEW_H / 2 - 148 + i * 19;
      c.add(smallText(this, k, VIEW_W / 2 - 330, y, 12, '#9fb4d0', [0, 0.5], 1301));
      c.add(smallText(this, v, VIEW_W / 2 + 330, y, 12, '#ffd9a0', [1, 0.5], 1301));
    });
    c.add(smallText(this, 'ESC / J to close', VIEW_W / 2, VIEW_H / 2 + 196, 12, '#63748c', [0.5, 0.5], 1301));

    c.setVisible(false);
    this.controls = c;
  }

  private toggleControls(): void {
    if (!this.controls) return;
    this.controls.setVisible(!this.controls.visible);
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

    if (this.controls?.visible) {
      if (ui.cancel || ui.confirm) {
        sfx.uiConfirm();
        this.controls.setVisible(false);
      }
      return;
    }

    if (ui.up) this.menu.move(-1);
    if (ui.down) this.menu.move(1);
    if (ui.confirm) this.menu.confirm();
    this.menu.update();
  }
}
