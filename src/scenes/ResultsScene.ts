import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../core/GameConfig';
import { MODE_LABELS, session } from '../core/Session';
import { InputManager } from '../input/InputManager';
import { Menu, bigTitle, makeScrim, smallText } from '../ui/Menu';
import { MECHS } from '../data/mechs';

/** Post-match summary with rematch and return-to-title. */
export class ResultsScene extends Phaser.Scene {
  private input$!: InputManager;
  private menu!: Menu;

  constructor() {
    super('Results');
  }

  create(): void {
    this.input$ = new InputManager(this);
    this.input$.reset();

    // Reuse the arena art as a static, dimmed backing plate.
    const far = this.add.image(0, VIEW_H - 320, 'arena_far').setOrigin(0, 0);
    far.setTint(0x2b3550).setAlpha(0.8);
    const mid = this.add.image(-80, VIEW_H - 210, 'arena_mid').setOrigin(0, 0);
    mid.setTint(0x39435f).setAlpha(0.55);
    makeScrim(this, 0.6, 5);

    const p = MECHS[session.playerMech];
    const e = MECHS[session.enemyMech];

    const won = session.lastOutcome === 'playerWin';
    const draw = session.lastOutcome === 'draw';
    const headline = draw ? 'DRAW' : won ? 'MISSION COMPLETE' : 'MISSION FAILED';
    const colour = draw ? '#cfd8e8' : won ? '#8effc0' : '#ff8f9c';

    bigTitle(this, headline, 108, 44, colour);
    smallText(
      this,
      session.mode === 'aiVsAi'
        ? `${MODE_LABELS[session.mode]} · ${p.name} vs ${e.name}`
        : `${MODE_LABELS[session.mode]} · RIVAL SKILL ${session.difficulty}`,
      VIEW_W / 2,
      150,
      13,
      '#93a6c0',
    );

    const pLife = Math.max(0, Math.round(session.lastPlayerLife));
    const eLife = Math.max(0, Math.round(session.lastEnemyLife));
    const rows: Array<[string, string]> = [
      [`${p.codeName} ${p.name}`, `${pLife} / ${p.gauges.maxLife} LIFE`],
      [`${e.codeName} ${e.name}`, `${eLife} / ${e.gauges.maxLife} LIFE`],
      ['TIME REMAINING', `${session.lastTimeLeft}s`],
      ['RESULT', draw ? 'DRAW' : won ? 'VICTORY' : 'DEFEAT'],
    ];
    rows.forEach(([k, v], i) => {
      const y = 200 + i * 26;
      smallText(this, k, VIEW_W / 2 - 210, y, 14, '#a9bad6', [0, 0.5]);
      smallText(this, v, VIEW_W / 2 + 210, y, 14, '#ffd9a0', [1, 0.5]);
    });

    this.menu = new Menu(
      this,
      [
        { label: 'REMATCH', onSelect: () => this.rematch() },
        { label: 'RETURN TO TITLE', onSelect: () => this.scene.start('Title') },
      ],
      VIEW_W / 2,
      VIEW_H - 130,
      { size: 22, gap: 38 },
    );

    smallText(this, 'ARROWS select · ENTER confirm', VIEW_W / 2, VIEW_H - 34, 12, '#63748c');
  }

  private rematch(): void {
    session.matchIndex++;
    this.scene.start('Battle');
  }

  override update(): void {
    const ui = this.input$.readUi();
    if (ui.up) this.menu.move(-1);
    if (ui.down) this.menu.move(1);
    if (ui.confirm) this.menu.confirm();
    this.menu.update();
  }
}
