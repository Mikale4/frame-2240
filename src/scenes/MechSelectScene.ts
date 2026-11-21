import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../core/GameConfig';
import {
  DIFFICULTY_COLOURS,
  DIFFICULTY_COUNT,
  DIFFICULTY_NAMES,
  MODE_LABELS,
  session,
  matchScene,
} from '../core/Session';
import { InputManager } from '../input/InputManager';
import { bigTitle, smallText } from '../ui/Menu';
import { ROSTER } from '../data/mechs';
import { TAG_PAIRS } from '../data/tags';
import { ROLE_BRIEF } from '../data/droneRoles';
import { VoxelMechDemo } from '../voxel/VoxelMechDemo';
import { voxelStage } from '../voxel/VoxelStage';
import { sfx } from '../audio/Sfx';
import { HOLO_FILL, holoLevel, holoRuling, type HoloRuling } from '../ui/HoloPanel';
import { music } from '../audio/Music';

const FONT = 'ui-monospace, Consolas, monospace';
const COLS = 4;
/** Top of the right-hand detail column, clear of the two-row roster grid. */
const STATS_TOP = 292;
/** Baseline of the control hint. The detail block is floored above it. */
const HINT_Y = VIEW_H - 24;
/** Gap between the stats block and the weapon list below it. */
const STATS_GAP = 12;
/** The rival-skill modal, and the holographic ruling inside it. */
const PANEL_W = 300;
const PANEL_H = 104;

/**
 * Roster grid geometry, hoisted out of `buildGrid` so the portrait column can be
 * placed **relative to it** rather than at a fraction that happens to look close.
 *
 * The portrait was at `VIEW_W * 0.20`, which put its 232px panel at 76..308
 * against a grid starting at 312 — a 4px gap on one side and a 76px margin on
 * the other, and vertically it began 50px below the grid and ran 84px past it.
 * Every one of those numbers was a coincidence of two independent fractions.
 */
const CELL_W = 108;
const CELL_H = 104;
const PLATE_W = 92;
const PLATE_H = 76;
const GRID_X = VIEW_W / 2 - ((COLS - 1) * CELL_W) / 2 + 40;
const GRID_Y = VIEW_H * 0.22;
/** Outer edges of the grid's artwork, which the portrait column aligns against. */
const GRID_LEFT = GRID_X - PLATE_W / 2;
const GRID_TOP = GRID_Y - PLATE_H / 2;
/** The portrait panel, centred in the space left of the grid and topped to it. */
const PORTRAIT_SIZE = 232;
const PORTRAIT_X = GRID_LEFT / 2;
const PORTRAIT_Y = GRID_TOP + PORTRAIT_SIZE / 2;
/**
 * The demo sits low in its panel and small inside it.
 *
 * A mech is drawn from its chassis centre with legs hanging below, so centring
 * the rig in the box hangs the feet out of the bottom. The drop lifts the
 * *visual* mass to the middle; the scale keeps a 2490-hull siege walker inside
 * a 232px box without cropping its shoulders.
 */
// The demo's framing — one camera distance for every chassis, so relative size
// stays honest — now lives in `src/voxel/VoxelMechDemo.ts`.

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
   * - `vsCpu`    player → playerTag → enemy → enemyTag → enemySkill
   * - `aiVsAi`   player → playerTag → playerSkill → enemy → enemyTag → enemySkill
   * - `training` player → enemy   (the dummy never acts, and calls nobody)
   *
   * **A partner is picked immediately after the machine that calls them**, and
   * before that side's tier, because the choice *depends* on the machine —
   * `TAG_PAIRS` offers two per chassis and they change entirely when the chassis
   * does. Committing a mech therefore also re-derives its partner (`resetTag`),
   * so a stale id from a previous pass can never reach a match.
   *
   * The per-side tier is what `aiVsAi` exists for: one global dial could not
   * express an EXTREME rival dismantling an EASY one, which is the most
   * interesting thing that mode can show you.
   */
  private picking:
    | 'player'
    | 'playerTag'
    | 'playerSkill'
    | 'enemy'
    | 'enemyTag'
    | 'enemySkill' = 'player';
  private armAt = 0;
  private t = 0;

  private cells: Phaser.GameObjects.Container[] = [];
  private cursor!: Phaser.GameObjects.Rectangle;
  private demo: VoxelMechDemo | null = null;
  private demoId = '';
  /** Invisible rect keeping the panel's geometry readable at a glance. */
  private heading!: Phaser.GameObjects.Text;
  private nameText!: Phaser.GameObjects.Text;
  private pilotText!: Phaser.GameObjects.Text;
  private blurbText!: Phaser.GameObjects.Text;
  private statsText!: Phaser.GameObjects.Text;
  private armsText!: Phaser.GameObjects.Text;
  private droneText!: Phaser.GameObjects.Text;
  private lockedText!: Phaser.GameObjects.Text;
  private skillPanel!: Phaser.GameObjects.Container;
  private skillText!: Phaser.GameObjects.Text;
  private skillHint!: Phaser.GameObjects.Text;
  private skillBg!: Phaser.GameObjects.Rectangle;
  private ruling!: HoloRuling;

  constructor() {
    super('MechSelect');
  }

  create(): void {
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      const stage = voxelStage();
      if (this.demo && stage.active === this.demo) stage.setView(null);
      this.demo?.dispose();
      this.demo = null;
    });
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
    // Opaque everywhere **except a window over the machine panel**: the voxel
    // layer draws the machine underneath this canvas, and a background filled
    // across that rectangle buried it completely.
    const g = this.add.graphics();
    const holeL = PORTRAIT_X - PORTRAIT_SIZE / 2;
    const holeR = PORTRAIT_X + PORTRAIT_SIZE / 2;
    const holeT = PORTRAIT_Y - PORTRAIT_SIZE / 2;
    const holeB = PORTRAIT_Y + PORTRAIT_SIZE / 2;
    for (let i = 0; i < 40; i++) {
      const t = i / 39;
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(0x05080f),
        Phaser.Display.Color.ValueToColor(0x181a2c),
        100,
        Math.round(t * 100),
      );
      g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1);
      const y0 = (i * VIEW_H) / 40;
      const y1 = y0 + VIEW_H / 40 + 1;
      if (y1 <= holeT || y0 >= holeB) {
        g.fillRect(0, y0, VIEW_W, y1 - y0);
        continue;
      }
      g.fillRect(0, y0, holeL, y1 - y0);
      g.fillRect(holeR, y0, VIEW_W - holeR, y1 - y0);
      if (y0 < holeT) g.fillRect(holeL, y0, holeR - holeL, holeT - y0);
      if (y1 > holeB) g.fillRect(holeL, holeB, holeR - holeL, y1 - holeB);
    }

    this.heading = bigTitle(this, 'SELECT YOUR MECH', 44, 26, '#eaf2ff');

    // ---- portrait and detail panel --------------------------------------
    // Centred in the band to the left of the grid, and its top aligned with the
    // grid's top, so the two columns start on the same line and the panel has
    // equal air either side of it.
    const px = PORTRAIT_X;
    const py = PORTRAIT_Y;
    // Border only: the machine is drawn by the voxel layer *underneath* this
    // canvas, so anything filled here would cover it.
    this.add
      .rectangle(px, py, PORTRAIT_SIZE, PORTRAIT_SIZE)
      .setFillStyle(0, 0)
      .setStrokeStyle(2, 0x2b3550)
      .setDepth(130);
    // **The machine, not the pilot's face.**
    //
    // This panel used to show a static portrait. A player choosing between
    // eight machines wants to know what the *machine* does, and eight faces
    // cannot tell them apart the way eight silhouettes can — TERRAMOTH's bulk
    // against CIRRUS's frame is the whole decision, and it is invisible in a
    // bust. The demo hovers and runs a manoeuvre every couple of seconds; see
    // `src/ui/MechDemo.ts`.
    //
    // The pilot is still here — name, faction and blurb sit under the panel,
    // and the thumbnails still carry the face during battle banter.
    // **The machine hangs in the yard itself**: the voxel CATHEDRAL YARD,
    // seen through a camera clipped to this panel (see VoxelMechDemo). The 2D
    // backing plate of arena art this used to need is gone.
    this.rebuildDemo();

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
    // **Wider than it was, because the column was the constraint.**
    //
    // At 0.62 the block had 351px to wrap into, and the drone lines are whole
    // sentences — so they wrapped two and three deep, the block grew past the
    // 216px between the grid and the control hint, and adding the role text
    // tipped it into the stats above. Starting at 0.36 puts it clear of the
    // portrait panel (which ends at 308) and clear of the grid above it, and
    // nearly doubles the wrap width, so those sentences take one line each.
    const sx = VIEW_W * 0.36;
    this.statsText = this.add
      .text(sx, STATS_TOP, '', { fontFamily: FONT, fontSize: '13px', color: '#cfe0f5', lineSpacing: 3 })
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
        wordWrap: { width: 288 },
      })
      .setOrigin(0, 0)
      .setStroke('#070b12', 4);

    /**
     * The drone gets its own column beside the weapons, not more rows below.
     *
     * Stacked, the two blocks needed 177px in a 123px gap between the stats and
     * the control hint, and no amount of shaving font sizes closes 54px. Side by
     * side each is about five lines, and the width freed up by moving the whole
     * column left is what pays for it.
     */
    this.droneText = this.add
      .text(sx + 300, STATS_TOP + 90, '', {
        fontFamily: FONT,
        fontSize: '10px',
        color: '#7d8ea8',
        lineSpacing: 3,
        wordWrap: { width: VIEW_W - sx - 314 },
      })
      .setOrigin(0, 0)
      .setStroke('#070b12', 4);

    // ---- roster grid -----------------------------------------------------
    this.buildGrid();

    /**
     * Sized to the portrait plate, not to the cell.
     *
     * It was 96x96 sitting 2px high, against a plate of 92x76 — so it hung 8px
     * below the artwork and cut straight through the machine's name underneath.
     * A selection box that overlaps the label reads as a misaligned box rather
     * than as a highlight. 96x80 centred on the plate leaves an even 2px of
     * margin all the way round.
     */
    this.cursor = this.add
      .rectangle(0, 0, 96, 80, 0x000000, 0)
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
    // **Opaque, and behind it a scrim.**
    //
    // This was 0.94, on the reasoning that 6 % pass-through is invisible. It is
    // not: the panel sits directly over the mech grid and the stat block, and
    // 6 % of bright cyan labels on a near-black fill still reads. On screen the
    // roster names and the POWER/SPEED rows were legible *through* the panel,
    // which made the game's one modal look broken.
    //
    // The scrim is the other half. A modal that merely covers the middle of a
    // busy screen still competes with everything around it; dimming the rest is
    // what makes it read as a question being asked. It is the first child, so
    // it draws under the panel, and it lives inside the container so it shows
    // and hides with it — the container sits at the view centre, which is why a
    // full-view rect at local (0, 0) lines up exactly.
    const scrim = this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x03060c, 0.72);
    // Semi-transparent, which it can be *because* of the scrim. The original
    // 0.94 fill failed over a bright, busy screen; over a dimmed one a lighter
    // fill reads as a projected panel rather than a pasted box, and there is no
    // legible detail left underneath to bleed through.
    //
    // The fill is a **holographic teal**, not near-black. A dark box reads as a
    // hole cut in the screen; a lit one reads as something being *projected*
    // over it, which is what this panel is — the same claim the energy blades
    // and the baton's discharge make, in the same colour family.
    const panelBg = this.add
      .rectangle(0, 0, PANEL_W, PANEL_H, HOLO_FILL, 0.5)
      .setStrokeStyle(3, 0xffd166);
    this.skillBg = panelBg;
    // Scanlines, redrawn each frame so they can drift. Drawing rather than
    // masking a static sprite is what keeps them inside the panel for free:
    // the loop simply never emits a line outside the interior.
    this.ruling = holoRuling(this, -PANEL_W / 2 + 3, -PANEL_H / 2 + 3, PANEL_W - 6, PANEL_H - 6);
    // The caption sits above the value it names, and it is a *label*, not a
    // control hint: the footer along the bottom of the screen already says what
    // the arrows and ENTER do, so repeating it inside the modal was noise in
    // the one place the player should be reading a single number.
    this.skillHint = this.add
      .text(0, -32, 'CPU DIFFICULTY', {
        fontFamily: FONT,
        fontSize: '11px',
        color: '#8fa3bd',
        align: 'center',
      })
      .setOrigin(0.5);
    this.skillHint.setLetterSpacing(2);
    this.skillText = this.add
      .text(0, 8, '', { fontFamily: FONT, fontSize: '26px', color: '#ffd166', fontStyle: 'bold', align: 'center' })
      .setOrigin(0.5);
    this.skillPanel.add([scrim, panelBg, this.ruling.gfx, this.skillText, this.skillHint]);

    smallText(
      this,
      'ARROWS  move      ENTER or J  confirm      ESC  back',
      VIEW_W / 2,
      HINT_Y,
      12,
      '#63748c',
    );

    this.refresh();
  }

  /** Two rows of four, each cell a portrait thumbnail over the mech's name. */
  private buildGrid(): void {
    ROSTER.forEach((def, i) => {
      const cx = GRID_X + (i % COLS) * CELL_W;
      const cy = GRID_Y + Math.floor(i / COLS) * CELL_H;
      const cell = this.add.container(cx, cy);

      const plate = this.add.rectangle(0, 0, PLATE_W, PLATE_H, def.tint.secondary, 0.55);
      // The pilot's live voxel bust fills the whole plate, edge to edge; the
      // plate's frame is drawn over it so the edge stays crisp.
      const thumb = this.add.image(0, 0, `pilot_${def.id}_card`).setDisplaySize(PLATE_W, PLATE_H);
      const frame = this.add
        .rectangle(0, 0, PLATE_W, PLATE_H)
        .setStrokeStyle(2, def.tint.primary)
        .setFillStyle(0, 0);
      // Clear of the selection box, which frames the 76px plate at +/-40. At 44
      // the label's own stroked height ran back up under the box's bottom edge.
      const label = this.add
        .text(0, 49, def.name, { fontFamily: FONT, fontSize: '11px', color: '#cfe0f5' })
        .setOrigin(0.5)
        .setStroke('#070b12', 4);

      cell.add([plate, thumb, frame, label]);
      cell.setData('pos', { x: cx, y: cy });
      this.cells.push(cell);
    });
  }

  private refresh(): void {
    const def = ROSTER[this.index];
    const role = ROLE_BRIEF[def.supporter.role];
    const pos = this.cells[this.index].getData('pos') as { x: number; y: number };
    // Centred on the plate, which is centred on the cell — no offset.
    this.cursor.setPosition(pos.x, pos.y);

    if (this.demoId !== def.id) this.rebuildDemo();
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
      ].join('\n'),
    );
    /**
     * The drone, in **both** halves.
     *
     * This screen printed the passive alone, which meant the thing that actually
     * distinguishes eight otherwise similar escorts — the *role* — was
     * documented nowhere in the game. A player could learn that WISP refills
     * boost at double rate and still have no idea it strings a live wire across
     * the arena that deals damage to anything caught on it.
     */
    /**
     * On a partner stage this panel describes **the call, not the escort**.
     *
     * A partner arrives without their drone, so printing that drone's role and
     * passive here would be advertising something the match will never deliver
     * — the exact "documented but not true" fault this project keeps paying
     * for. What a player needs at this moment is the shape of the mechanic:
     * how many calls, how long a wait, and how long they stay.
     */
    this.droneText.setText(
      this.onTag
        ? [
            `${def.pilot} answers.`,
            '',
            'Arrives in 1-3s, sometimes 4-7s.',
            'Fights for 4s, then leaves.',
            'Cannot be killed. Brings no drone.',
            '',
            'Two calls a match, 30s apart.',
          ].join('\n')
        : [
            `DRONE  ${def.supporter.name}  ${def.supporter.maxLife} HP`,
            role.name,
            role.text,
            '',
            `${def.supporter.passive.name} (while deployed)`,
            def.supporter.passive.text,
          ].join('\n'),
    );
    /**
     * Positioned after the text is set, so the block is measured rather than
     * assumed — and floored so it can never reach the control hint.
     *
     * The natural position is directly under the stats. That was already close
     * to the hint at the bottom of the screen, and the drone lines wrap to two
     * or three rows depending on the machine, so the longest ones ran straight
     * through it: the hint appeared *inside* the drone description rather than
     * below it. Adding the role text made a near-miss into a collision.
     *
     * Taking the higher of the two positions keeps the measured layout whenever
     * it fits and slides the block up only for the machines that need it.
     */
    const wanted = this.statsText.y + this.statsText.height + STATS_GAP;
    const tallest = Math.max(this.armsText.height, this.droneText.height);
    const ceiling = HINT_Y - 14 - tallest;
    const top = Math.min(wanted, ceiling);
    this.armsText.setY(top);
    this.droneText.setY(top);

    // Dim whichever machine is already committed, so the second pass reads as a
    // different choice rather than a repeat of the first.
    //
    // On a partner stage the rule is inverted and much stronger: **only the two
    // legal machines are lit at all.** Six dimmed cells say "these are not on
    // offer" far better than a cursor that silently refuses to travel, and the
    // pair being visibly short is the point — an assist is who this pilot knows,
    // not who is available.
    const choices = this.onTag ? this.tagChoices : null;
    this.cells.forEach((cell, i) => {
      if (choices) {
        cell.setAlpha(choices.includes(i) ? 1 : 0.18);
        return;
      }
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
        : this.picking === 'playerTag'
          ? duel
            ? 'CPU 1 ASSIST'
            : 'SELECT YOUR ASSIST'
          : this.picking === 'playerSkill'
            ? 'CPU 1 SKILL'
            : this.picking === 'enemy'
              ? duel
                ? 'SELECT CPU 2'
                : 'SELECT YOUR RIVAL'
              : this.picking === 'enemyTag'
                ? duel
                  ? 'CPU 2 ASSIST'
                  : 'RIVAL ASSIST'
                : duel
                  ? 'CPU 2 SKILL'
                  : 'RIVAL SKILL',
    );

    const mine = ROSTER.find((m) => m.id === session.playerMech)?.name ?? '';
    const theirs = ROSTER.find((m) => m.id === session.enemyMech)?.name ?? '';
    const mineTier = DIFFICULTY_NAMES[session.playerDifficulty];
    this.lockedText.setText(
      this.picking === 'playerTag'
        ? `${duel ? 'CPU 1' : 'YOUR MECH'}:  ${mine}   —   WHO ANSWERS THE CALL?`
        : this.picking === 'enemyTag'
          ? `${duel ? 'CPU 2' : 'RIVAL'}:  ${theirs}   —   WHO ANSWERS THE CALL?`
          : this.picking === 'playerSkill'
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
      this.cursor.setVisible(false);
    } else {
      this.cursor.setVisible(true);
    }
  }

  /**
   * Swaps the demo to whichever machine the cursor is on.
   *
   * Torn down and rebuilt rather than retargeted because `MechRenderer` builds
   * its container tree from a specific `MechDef.rig` in its constructor —
   * eight chassis do not share a part list, and NULLTIDE alone carries a
   * `meleeArc` node nobody else has.
   */
  private rebuildDemo(): void {
    const def = ROSTER[this.index] ?? ROSTER[0];
    this.demo?.dispose();
    this.demoId = def.id;
    const inner = PORTRAIT_SIZE - 4;
    this.demo = new VoxelMechDemo(def, {
      x: PORTRAIT_X - inner / 2,
      y: PORTRAIT_Y - inner / 2,
      w: inner,
      h: inner,
    });
    voxelStage().setView(this.demo);
  }

  /** True while a TAG/ASSIST partner is being chosen for either side. */
  private get onTag(): boolean {
    return this.picking === 'playerTag' || this.picking === 'enemyTag';
  }

  /**
   * The two roster indices this side may choose between.
   *
   * Derived from `TAG_PAIRS` rather than from anything on this screen, so the
   * menu can only ever offer a pairing that has dialogue written for it.
   */
  private get tagChoices(): number[] {
    const mech = this.picking === 'playerTag' ? session.playerMech : session.enemyMech;
    return (TAG_PAIRS[mech] ?? []).map((id) => ROSTER.findIndex((m) => m.id === id)).filter((i) => i >= 0);
  }

  /**
   * Whether either side picks a partner at all.
   *
   * **Not in training.** The dummy never acts, and a partner flying in to shoot
   * at a practice rig is neither useful nor what the room is for —
   * `BattleScene` refuses to build one there, so offering the choice would be
   * offering something the match then ignores.
   */
  private get pickTag(): boolean {
    return session.assists && session.mode !== 'training';
  }

  /** Whichever partner the side being edited currently holds. */
  private get chosenTag(): string {
    return this.picking === 'playerTag' ? session.playerTag : session.enemyTag;
  }

  /**
   * Forces a side's partner to be legal for the machine it is flying.
   *
   * Called the moment a chassis is committed. Changing your mech has to change
   * your partner — HALCYON's two are not NOCTURNE's — and leaving a stale id in
   * the session would put an unwritten pairing one keypress away.
   */
  private resetTag(side: 'player' | 'enemy'): void {
    const mech = side === 'player' ? session.playerMech : session.enemyMech;
    const pair = TAG_PAIRS[mech];
    if (!pair) return;
    const held = side === 'player' ? session.playerTag : session.enemyTag;
    const next = pair.includes(held) ? held : pair[0];
    if (side === 'player') session.playerTag = next;
    else session.enemyTag = next;
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
    if (this.onTag) {
      // Two cells, and they are not adjacent in the grid — so any direction
      // steps between them rather than moving by row and column. A cursor that
      // could land on an illegal machine would have to refuse the press, and a
      // control that refuses is worse than one that only offers what is legal.
      const choices = this.tagChoices;
      if (choices.length < 2) return;
      const step = dx + dy;
      if (step === 0) return;
      const at = Math.max(0, choices.indexOf(this.index));
      this.index = choices[(at + (step > 0 ? 1 : choices.length - 1)) % choices.length];
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
      // The partner has to follow the machine, not the other way round.
      this.resetTag('player');
      if (this.pickTag) {
        this.toTag('playerTag');
        return;
      }
      if (this.pickPlayerSkill) {
        this.picking = 'playerSkill';
        this.refresh();
        return;
      }
      this.toEnemy();
      return;
    }

    if (this.picking === 'playerTag') {
      session.playerTag = ROSTER[this.index].id;
      if (this.pickPlayerSkill) {
        this.picking = 'playerSkill';
        this.index = Math.max(0, ROSTER.findIndex((m) => m.id === session.playerMech));
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
      this.resetTag('enemy');
      if (this.pickTag) {
        this.toTag('enemyTag');
        return;
      }
      if (this.pickEnemySkill) {
        this.picking = 'enemySkill';
        this.refresh();
        return;
      }
      this.start();
      return;
    }

    if (this.picking === 'enemyTag') {
      session.enemyTag = ROSTER[this.index].id;
      if (this.pickEnemySkill) {
        this.picking = 'enemySkill';
        this.index = Math.max(0, ROSTER.findIndex((m) => m.id === session.enemyMech));
        this.refresh();
        return;
      }
      this.start();
      return;
    }

    this.start();
  }

  /** Opens a partner stage with the cursor already on the held choice. */
  private toTag(stage: 'playerTag' | 'enemyTag'): void {
    this.picking = stage;
    const choices = this.tagChoices;
    const held = ROSTER.findIndex((m) => m.id === this.chosenTag);
    this.index = choices.includes(held) ? held : (choices[0] ?? 0);
    this.refresh();
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
    this.scene.start(matchScene(session.mode));
  }

  private back(): void {
    sfx.uiBack();

    if (this.picking === 'enemySkill') {
      // Back to whichever stage actually preceded this one.
      if (this.pickTag) {
        this.toTag('enemyTag');
        return;
      }
      this.picking = 'enemy';
      this.index = Math.max(0, ROSTER.findIndex((m) => m.id === session.enemyMech));
      this.refresh();
      return;
    }

    if (this.picking === 'enemyTag') {
      this.picking = 'enemy';
      this.index = Math.max(0, ROSTER.findIndex((m) => m.id === session.enemyMech));
      this.refresh();
      return;
    }

    if (this.picking === 'enemy') {
      if (this.pickPlayerSkill) {
        this.picking = 'playerSkill';
        this.index = Math.max(0, ROSTER.findIndex((m) => m.id === session.playerMech));
        this.refresh();
        return;
      }
      if (this.pickTag) {
        this.toTag('playerTag');
        return;
      }
      this.picking = 'player';
      this.index = Math.max(0, ROSTER.findIndex((m) => m.id === session.playerMech));
      this.refresh();
      return;
    }

    if (this.picking === 'playerSkill') {
      if (this.pickTag) {
        this.toTag('playerTag');
        return;
      }
      this.picking = 'player';
      this.index = Math.max(0, ROSTER.findIndex((m) => m.id === session.playerMech));
      this.refresh();
      return;
    }

    if (this.picking === 'playerTag') {
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

    this.demo?.update(delta / 1000);
    if (this.demo && voxelStage().active === this.demo) voxelStage().render();

    // The skill panel flickers like the projected hardware everywhere else in
    // this game does. `flickerLevel` is the same stepped table the energy
    // blades run on (D140, transcribed from the reference's own `.air` data) —
    // a lamp is lit or it is not, and the jump is the effect. A sine here would
    // read as a gentle fade and would not match a single other lit thing on
    // screen. The panel keeps a high floor so the number stays readable at the
    // dimmest step; it is a flicker, not a blink you have to wait out.
    if (this.skillPanel.visible) {
      const lvl = holoLevel(this.t);
      // **The frame does not flicker.** It is the one part of this that is not
      // being projected — it is the border of the control itself, and blinking
      // it made the whole panel look like it was failing rather than lit.
      // Only what is *inside* the frame is holographic.
      this.skillBg.setFillStyle(HOLO_FILL, 0.42 + 0.16 * lvl);
      this.skillText.setAlpha(0.82 + 0.18 * lvl);
      this.skillHint.setAlpha(0.6 + 0.4 * lvl);
      this.ruling.update(this.t);
    }

    const ui = this.input$.readUi();
    if (ui.left) this.move(-1, 0);
    if (ui.right) this.move(1, 0);
    if (ui.up) this.move(0, -1);
    if (ui.down) this.move(0, 1);
    if (ui.confirm) this.confirm();
    if (ui.cancel) this.back();
  }
}
