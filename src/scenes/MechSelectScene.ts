import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../core/GameConfig';
import {
  DIFFICULTY_COLOURS,
  DIFFICULTY_COUNT,
  DIFFICULTY_NAMES,
  MODE_LABELS,
  session,
} from '../core/Session';
import { InputManager } from '../input/InputManager';
import { bigTitle, smallText } from '../ui/Menu';
import { ROSTER } from '../data/mechs';
import { sfx } from '../audio/Sfx';
import { music } from '../audio/Music';

const FONT = 'ui-monospace, Consolas, monospace';
const COLS = 4;
/** Top of the right-hand detail column, clear of the two-row roster grid. */
const STATS_TOP = 292;
/** Gap between the stats block and the weapon list below it. */
const STATS_GAP = 12;

/**
 * Roster select: pick your machine, then your rival.
 *
 * Two passes over the same grid rather than two screens, because the comparison
 * that matters — how these eight differ — is the same either way, and a second
 * layout would just be the first one again with a different title.
 *
 * Portrait art does not exist yet (docs/PILOT_PORTRAIT_SPEC.md); `BootScene`
 * generates a per-mech placeholder, so this screen is complete and navigable
 * now and the real portraits drop in by filename with no change here.
 */
export class MechSelectScene extends Phaser.Scene {
  private input$!: InputManager;
  private index = 0;
  /**
   * Machine, then that pilot's tier, for each side in turn.
   *
   * Skill sits here rather than in the main menu because it is a property of a
   * specific opponent, not a global setting — you decide who is fighting and how
   * hard *each of them* fights, in one continuous flow.
   *
   * Which stages run depends on the mode:
   *
   * - `vsCpu`    player → enemy → enemySkill
   * - `aiVsAi`   player → playerSkill → enemy → enemySkill
   * - `training` player → enemy            (the dummy never acts)
   *
   * The per-side tier is what `aiVsAi` exists for: one global dial could not
   * express an EXTREME rival dismantling an EASY one, which is the most
   * interesting thing that mode can show you.
   */
  private picking: 'player' | 'playerSkill' | 'enemy' | 'enemySkill' = 'player';
  private armAt = 0;
  private t = 0;

  private cells: Phaser.GameObjects.Container[] = [];
  private cursor!: Phaser.GameObjects.Rectangle;
  private portrait!: Phaser.GameObjects.Image;
  private heading!: Phaser.GameObjects.Text;
  private nameText!: Phaser.GameObjects.Text;
  private pilotText!: Phaser.GameObjects.Text;
  private blurbText!: Phaser.GameObjects.Text;
  private statsText!: Phaser.GameObjects.Text;
  private armsText!: Phaser.GameObjects.Text;
  private lockedText!: Phaser.GameObjects.Text;
  private skillPanel!: Phaser.GameObjects.Container;
  private skillText!: Phaser.GameObjects.Text;
  private skillHint!: Phaser.GameObjects.Text;

  constructor() {
    super('MechSelect');
  }

  create(): void {
    this.input$ = new InputManager(this);
    this.input$.reset();
    this.t = 0;
    this.armAt = 0.18;
    this.picking = 'player';
    this.index = Math.max(0, ROSTER.findIndex((m) => m.id === session.playerMech));
    this.cells = [];

    // Carries all four stages, skill panels included — the anticipation the
    // track is written around does not reset when the heading changes.
    music.play('select');

    // ---- background ------------------------------------------------------
    const g = this.add.graphics();
    for (let i = 0; i < 40; i++) {
      const t = i / 39;
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(0x05080f),
        Phaser.Display.Color.ValueToColor(0x181a2c),
        100,
        Math.round(t * 100),
      );
      g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1);
      g.fillRect(0, (i * VIEW_H) / 40, VIEW_W, VIEW_H / 40 + 1);
    }

    this.heading = bigTitle(this, 'SELECT YOUR MECH', 44, 26, '#eaf2ff');

    // ---- portrait and detail panel --------------------------------------
    const px = VIEW_W * 0.20;
    const py = VIEW_H * 0.46;
    this.add.rectangle(px, py, 232, 232, 0x0a0e18, 0.85).setStrokeStyle(2, 0x2b3550);
    this.portrait = this.add.image(px, py, `pilot_${ROSTER[0].id}`).setDisplaySize(224, 224);

    this.nameText = this.add
      .text(px, py + 132, '', { fontFamily: FONT, fontSize: '20px', color: '#ffd166', fontStyle: 'bold', align: 'center' })
      .setOrigin(0.5, 0)
      .setStroke('#070b12', 5);
    this.pilotText = this.add
      .text(px, py + 160, '', { fontFamily: FONT, fontSize: '12px', color: '#8fa3bd', align: 'center' })
      .setOrigin(0.5, 0)
      .setStroke('#070b12', 4);
    this.blurbText = this.add
      .text(px, py + 198, '', {
        fontFamily: FONT,
        fontSize: '11px',
        color: '#7d8ea8',
        align: 'center',
        wordWrap: { width: 250 },
      })
      .setOrigin(0.5, 0)
      .setStroke('#070b12', 4);

    // ---- stats -----------------------------------------------------------
    // The right column has ~213px between the grid and the control hint, which
    // is not enough for two generously spaced blocks at fixed positions — the
    // first version overlapped them. Stats are compressed to four lines and the
    // weapon list is placed relative to whatever the stats block measures, so
    // the layout holds even if a mech's numbers wrap differently.
    const sx = VIEW_W * 0.62;
    this.statsText = this.add
      .text(sx, STATS_TOP, '', { fontFamily: FONT, fontSize: '14px', color: '#cfe0f5', lineSpacing: 4 })
      .setOrigin(0, 0)
      .setStroke('#070b12', 4);
    this.armsText = this.add
      .text(sx, STATS_TOP + 90, '', {
        fontFamily: FONT,
        fontSize: '10px',
        color: '#7d8ea8',
        lineSpacing: 3,
        // Wrapped to the column, not left to run off the edge. The drone passive
        // line is the longest thing here and the only one whose length is not
        // bounded by a short weapon name, so without this it is silently clipped
        // mid-sentence at the right margin.
        wordWrap: { width: VIEW_W - sx - 14 },
      })
      .setOrigin(0, 0)
      .setStroke('#070b12', 4);

    // ---- roster grid -----------------------------------------------------
    this.buildGrid();

    this.cursor = this.add
      .rectangle(0, 0, 96, 96, 0x000000, 0)
      .setStrokeStyle(3, 0xffd166)
      .setDepth(900);

    // Sits under the heading, not at the bottom. Down there it shared a band
    // with the weapon list, whose width varies per mech — a status line must not
    // depend on the longest weapon name in the roster to avoid a collision.
    this.lockedText = this.add
      .text(VIEW_W / 2, 74, '', { fontFamily: FONT, fontSize: '13px', color: '#7fe0a0', align: 'center' })
      .setOrigin(0.5)
      .setStroke('#070b12', 4);

    // Rival skill, shown only on the final stage.
    this.skillPanel = this.add.container(VIEW_W / 2, VIEW_H * 0.50).setDepth(1000).setVisible(false);
    const panelBg = this.add
      .rectangle(0, 0, 460, 150, 0x05080f, 0.94)
      .setStrokeStyle(3, 0xffd166);
    this.skillText = this.add
      .text(0, -22, '', { fontFamily: FONT, fontSize: '26px', color: '#ffd166', fontStyle: 'bold', align: 'center' })
      .setOrigin(0.5);
    this.skillHint = this.add
      .text(0, 30, 'ARROWS  adjust        ENTER  FIGHT', {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#8fa3bd',
        align: 'center',
      })
      .setOrigin(0.5);
    this.skillPanel.add([panelBg, this.skillText, this.skillHint]);

    smallText(
      this,
      'ARROWS  move      ENTER or J  confirm      ESC  back',
      VIEW_W / 2,
      VIEW_H - 24,
      12,
      '#63748c',
    );

    this.refresh();
  }

  /** Two rows of four, each cell a portrait thumbnail over the mech's name. */
  private buildGrid(): void {
    const cellW = 108;
    const cellH = 104;
    const originX = VIEW_W / 2 - ((COLS - 1) * cellW) / 2 + 40;
    const originY = VIEW_H * 0.22;

    ROSTER.forEach((def, i) => {
      const cx = originX + (i % COLS) * cellW;
      const cy = originY + Math.floor(i / COLS) * cellH;
      const cell = this.add.container(cx, cy);

      const plate = this.add
        .rectangle(0, 0, 92, 76, def.tint.secondary, 0.55)
        .setStrokeStyle(2, def.tint.primary);
      const thumb = this.add.image(0, -4, `pilot_${def.id}_thumb`).setDisplaySize(60, 60);
      const label = this.add
        .text(0, 44, def.name, { fontFamily: FONT, fontSize: '11px', color: '#cfe0f5' })
        .setOrigin(0.5)
        .setStroke('#070b12', 4);

      cell.add([plate, thumb, label]);
      cell.setData('pos', { x: cx, y: cy });
      this.cells.push(cell);
    });
  }

  private refresh(): void {
    const def = ROSTER[this.index];
    const pos = this.cells[this.index].getData('pos') as { x: number; y: number };
    this.cursor.setPosition(pos.x, pos.y - 2);

    this.portrait.setTexture(`pilot_${def.id}`);
    this.nameText.setText(`${def.codeName}  ${def.name}`);
    this.nameText.setColor('#' + def.tint.accent.toString(16).padStart(6, '0'));
    this.pilotText.setText(`${def.pilot}\n${def.faction}`);
    this.blurbText.setText(def.blurb);

    const bar = (n: number) => '■'.repeat(n) + '□'.repeat(5 - n);
    this.statsText.setText(
      [
        `POWER   ${bar(def.statPower)}`,
        `SPEED   ${bar(def.statSpeed)}`,
        `RANGE   ${bar(def.statRange)}`,
        `LIFE ${def.gauges.maxLife}   BARRIER ${def.gauges.maxBarrier}`,
      ].join('\n'),
    );
    this.armsText.setText(
      [
        `MAIN    ${def.main.label}`,
        `HEAVY   ${def.heavy.label}`,
        `LANCE   ${def.lance.label}`,
        `SUB     ${def.sub.label}`,
        `MELEE   ${def.meleeLock.name}  (${def.meleeLock.hits} hits)`,
        // The drone's passive is the least discoverable thing in the kit — it
        // has no animation and no sound — so the select screen is the one place
        // it can be read before the match rather than inferred during one.
        `DRONE   ${def.supporter.name}  ${def.supporter.maxLife} HP`,
        `        ${def.supporter.passive.name} (while deployed)`,
        `        ${def.supporter.passive.text}`,
      ].join('\n'),
    );
    // Placed after the text is set, so the gap is measured rather than assumed.
    this.armsText.setY(this.statsText.y + this.statsText.height + STATS_GAP);

    // Dim whichever machine is already committed, so the second pass reads as a
    // different choice rather than a repeat of the first.
    this.cells.forEach((cell, i) => {
      const chosen =
        (this.picking === 'enemy' || this.picking === 'enemySkill') &&
        ROSTER[i].id === session.playerMech;
      cell.setAlpha(chosen ? 0.42 : 1);
    });

    // In CPU vs CPU neither machine is "yours", so the headings say which slot
    // is being filled rather than pretending one of them belongs to the player.
    const duel = session.mode === 'aiVsAi';
    this.heading.setText(
      this.picking === 'player'
        ? duel
          ? 'SELECT CPU 1'
          : 'SELECT YOUR MECH'
        : this.picking === 'playerSkill'
          ? 'CPU 1 SKILL'
          : this.picking === 'enemy'
            ? duel
              ? 'SELECT CPU 2'
              : 'SELECT YOUR RIVAL'
            : duel
              ? 'CPU 2 SKILL'
              : 'RIVAL SKILL',
    );

    const mine = ROSTER.find((m) => m.id === session.playerMech)?.name ?? '';
    const theirs = ROSTER.find((m) => m.id === session.enemyMech)?.name ?? '';
    const mineTier = DIFFICULTY_NAMES[session.playerDifficulty];
    this.lockedText.setText(
      this.picking === 'playerSkill'
        ? `${duel ? 'CPU 1' : 'YOUR MECH'}:  ${mine}`
        : this.picking === 'enemy'
          ? `${duel ? `CPU 1:  ${mine}  [${mineTier}]` : `YOUR MECH:  ${mine}`}`
          : this.picking === 'enemySkill'
            ? `${mine}${duel ? ` [${mineTier}]` : ''}   vs   ${theirs}      ${MODE_LABELS[session.mode]}`
            : '',
    );

    const onSkill = this.picking === 'playerSkill' || this.picking === 'enemySkill';
    this.skillPanel.setVisible(onSkill);
    if (onSkill) {
      const d = this.tier;
      // Four filled pips out of four, coloured by tier — the shape reads before
      // the word does, and four states are distinguishable at a glance where
      // eight stars were not.
      this.skillText.setText(`${'◆'.repeat(d + 1)}${'◇'.repeat(DIFFICULTY_COUNT - d - 1)}\n${DIFFICULTY_NAMES[d]}`);
      this.skillText.setColor(DIFFICULTY_COLOURS[d]);
      this.skillHint.setText(
        `ARROWS  adjust        ENTER  ${this.picking === 'enemySkill' ? 'FIGHT' : 'NEXT'}`,
      );
      this.cursor.setVisible(false);
    } else {
      this.cursor.setVisible(true);
    }
  }

  /** The tier the current stage is editing. */
  private get tier(): number {
    return this.picking === 'playerSkill' ? session.playerDifficulty : session.enemyDifficulty;
  }

  private setTier(v: number): void {
    if (this.picking === 'playerSkill') session.playerDifficulty = v;
    else session.enemyDifficulty = v;
  }

  /** Does the player slot need its own tier? Only when a CPU is holding it. */
  private get pickPlayerSkill(): boolean {
    return session.mode === 'aiVsAi';
  }

  /** Does the rival need a tier? Not in training, where it never acts. */
  private get pickEnemySkill(): boolean {
    return session.mode !== 'training';
  }

  private move(dx: number, dy: number): void {
    if (this.picking === 'playerSkill' || this.picking === 'enemySkill') {
      // On a skill stage the same keys tune the tier instead of moving a cursor.
      const step = dx + dy;
      if (step === 0) return;
      const next = this.tier + step;
      if (next < 0 || next >= DIFFICULTY_COUNT) return;
      this.setTier(next);
      sfx.uiMove();
      this.refresh();
      return;
    }
    const next = this.index + dx + dy * COLS;
    if (next < 0 || next >= ROSTER.length) return;
    this.index = next;
    sfx.uiMove();
    this.refresh();
  }

  private confirm(): void {
    sfx.uiConfirm();

    if (this.picking === 'player') {
      session.playerMech = ROSTER[this.index].id;
      if (this.pickPlayerSkill) {
        this.picking = 'playerSkill';
        this.refresh();
        return;
      }
      this.toEnemy();
      return;
    }

    if (this.picking === 'playerSkill') {
      this.toEnemy();
      return;
    }

    if (this.picking === 'enemy') {
      session.enemyMech = ROSTER[this.index].id;
      if (this.pickEnemySkill) {
        this.picking = 'enemySkill';
        this.refresh();
        return;
      }
      this.start();
      return;
    }

    this.start();
  }

  /** Move to the rival's machine, landing the cursor off the one just taken. */
  private toEnemy(): void {
    this.picking = 'enemy';
    this.index = Math.max(0, ROSTER.findIndex((m) => m.id === session.enemyMech));
    if (ROSTER[this.index].id === session.playerMech) {
      this.index = (this.index + 1) % ROSTER.length;
    }
    this.refresh();
  }

  /** Straight into the match, as a fighting game would. */
  private start(): void {
    sfx.unlock();
    session.matchIndex++;
    this.scene.start('Battle');
  }

  private back(): void {
    sfx.uiBack();

    if (this.picking === 'enemySkill') {
      this.picking = 'enemy';
      this.index = Math.max(0, ROSTER.findIndex((m) => m.id === session.enemyMech));
      this.refresh();
      return;
    }

    if (this.picking === 'enemy') {
      // Back to whichever stage actually preceded this one.
      this.picking = this.pickPlayerSkill ? 'playerSkill' : 'player';
      this.index = Math.max(0, ROSTER.findIndex((m) => m.id === session.playerMech));
      this.refresh();
      return;
    }

    if (this.picking === 'playerSkill') {
      this.picking = 'player';
      this.index = Math.max(0, ROSTER.findIndex((m) => m.id === session.playerMech));
      this.refresh();
      return;
    }

    this.scene.start('Menu');
  }

  override update(_time: number, delta: number): void {
    this.t += delta / 1000;
    if (this.t < this.armAt) return;

    // A slow pulse on the cursor, so the selection is findable at a glance.
    this.cursor.setAlpha(0.65 + 0.35 * Math.sin(this.t * 5));

    const ui = this.input$.readUi();
    if (ui.left) this.move(-1, 0);
    if (ui.right) this.move(1, 0);
    if (ui.up) this.move(0, -1);
    if (ui.down) this.move(0, 1);
    if (ui.confirm) this.confirm();
    if (ui.cancel) this.back();
  }
}
