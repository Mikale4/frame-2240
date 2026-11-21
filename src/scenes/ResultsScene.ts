import Phaser from 'phaser';
import { attachYardBackdrop } from '../voxel/YardBackdrop';
import { VIEW_H, VIEW_W } from '../core/GameConfig';
import { DIFFICULTY_NAMES, MODE_LABELS, matchScene, session } from '../core/Session';
import { InputManager } from '../input/InputManager';
import { Menu, bigTitle, makeScrim, smallText } from '../ui/Menu';
import { MECHS } from '../data/mechs';
import { music } from '../audio/Music';

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

    // The voxel yard the fight was in, drifting behind a scrim.
    attachYardBackdrop(this, 40);
    makeScrim(this, 0.6, 5);

    const p = MECHS[session.playerMech];
    const e = MECHS[session.enemyMech];

    const won = session.lastOutcome === 'playerWin';
    const draw = session.lastOutcome === 'draw';
    const headline = draw ? 'DRAW' : won ? 'MISSION COMPLETE' : 'MISSION FAILED';
    const colour = draw ? '#cfd8e8' : won ? '#8effc0' : '#ff8f9c';

    // A draw shares the defeat track: reflective suits it far better than a
    // fanfare, and it is too uncommon an outcome to be worth its own generation.
    music.play(won ? 'results_win' : 'results_lose');

    bigTitle(this, headline, 108, 44, colour);
    smallText(
      this,
      // Both tiers are named in CPU-vs-CPU, since which one won is the result.
      session.mode === 'aiVsAi'
        ? `${MODE_LABELS[session.mode]} · ${p.name} [${DIFFICULTY_NAMES[session.playerDifficulty]}]` +
          ` vs ${e.name} [${DIFFICULTY_NAMES[session.enemyDifficulty]}]`
        : session.mode === 'training'
          ? MODE_LABELS[session.mode]
          : `${MODE_LABELS[session.mode]} · ${DIFFICULTY_NAMES[session.enemyDifficulty]}`,
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
        // Widening scope, top to bottom: same fight again, different fight,
        // done fighting. Losing a matchup and wanting a different machine is the
        // commonest thing to want here, and it used to cost a trip through the
        // title screen and the whole menu to say so.
        { label: 'MECH SELECT', onSelect: () => this.scene.start('MechSelect') },
        { label: 'RETURN TO TITLE', onSelect: () => this.scene.start('Title') },
      ],
      VIEW_W / 2,
      // Raised by one gap's worth now the list is three long, so the last row
      // does not sit on top of the hint line at VIEW_H - 34. Keeps the block's
      // centre where two rows put it.
      VIEW_H - 150,
      { size: 22, gap: 38 },
    );

    smallText(this, 'ARROWS select · ENTER confirm', VIEW_W / 2, VIEW_H - 34, 12, '#63748c');
  }

  private rematch(): void {
    session.matchIndex++;
    this.scene.start(matchScene(session.mode));
  }

  override update(): void {
    const ui = this.input$.readUi();
    if (ui.up) this.menu.move(-1);
    if (ui.down) this.menu.move(1);
    if (ui.confirm) this.menu.confirm();
    this.menu.update();
  }
}
