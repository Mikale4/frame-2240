import Phaser from 'phaser';
import { GAME_TITLE, VIEW_H, VIEW_W } from '../core/GameConfig';
import { InputManager } from '../input/InputManager';
import { Menu, bigTitle, smallText } from '../ui/Menu';
import { ARCHIVE_SECTIONS, type ArchiveEntry } from '../data/archive';
import { MECHS } from '../data/mechs';
import { sfx } from '../audio/Sfx';
import { music } from '../audio/Music';
import { musicAvailable } from '../audio/MusicBank';

const FONT = 'ui-monospace, Consolas, monospace';

/**
 * Height reserved at the bottom of a page for the hint line.
 *
 * Used by **both** the scroll extent and the body's clip rectangle, and it has
 * to stay that way: when only the scroll knew about it, the body still drew into
 * the band it was supposed to stop above.
 */
const BODY_BOTTOM_RESERVE = 40;

/**
 * The Archive: the game's story, readable outside a match.
 *
 * Three levels — section, entry, page — rather than one long scroll, because
 * eighteen entries in a single list is a wall and the split between *machines*
 * and *pilots* is itself part of the fiction: the same eight ids appear in both,
 * and reading a frame's history next to its pilot's is the point.
 *
 * Portraits are reused from the select screen for pilot entries, and nothing
 * here is generated: `data/archive.ts` is the whole content.
 */
export class ArchiveScene extends Phaser.Scene {
  private input$!: InputManager;
  private menu!: Menu;
  /** Which level is on screen. */
  private level: 'sections' | 'entries' | 'page' = 'sections';
  private sectionIndex = 0;
  private entryIndex = 0;

  private heading!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private portrait!: Phaser.GameObjects.Image;
  private pageTitle!: Phaser.GameObjects.Text;
  private pageSub!: Phaser.GameObjects.Text;
  private pageTag!: Phaser.GameObjects.Text;
  private pageBody!: Phaser.GameObjects.Text;
  /**
   * Clips the body to the readable band.
   *
   * A `Text` object draws its whole height wherever it is put, so scrolling a
   * long entry moved the text without ever stopping it being drawn — the last
   * paragraph of the longest entries rendered straight through the hint line at
   * the bottom of the frame and the two became unreadable on top of each other.
   * The scroll maths had always reserved this band; nothing enforced it.
   */
  private bodyMask!: Phaser.GameObjects.Graphics;
  private scroll = 0;
  /** Where the body starts, measured under the tagline rather than assumed. */
  private bodyTop = 192;
  private t = 0;
  private armAt = 0;

  constructor() {
    super('Archive');
  }

  create(): void {
    this.input$ = new InputManager(this);
    this.input$.reset();
    this.t = 0;
    this.armAt = 0.18;
    this.level = 'sections';
    this.sectionIndex = 0;
    this.entryIndex = 0;
    this.scroll = 0;

    /**
     * The Archive has its own theme — deliberately calm, and the one track that
     * leaves the soundtrack's J-rock house style, because this is the only screen
     * whose activity is reading rather than fighting.
     *
     * Until that file exists this falls back to `menu`, which is what the screen
     * played before the cue was written. Asking for it unconditionally would be
     * silence, not a fallback: `MusicPlayer` refuses any cue whose `present` flag
     * is false, precisely so a missing track is never requested. Written as a
     * fallback rather than a flag flip so that dropping the mp3 in and setting
     * `present` is the whole job — no third edit here.
     */
    music.play(musicAvailable('archive') ? 'archive' : 'menu');

    // ---- background ------------------------------------------------------
    const g = this.add.graphics();
    for (let i = 0; i < 40; i++) {
      const t = i / 39;
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(0x05070e),
        Phaser.Display.Color.ValueToColor(0x14182a),
        100,
        Math.round(t * 100),
      );
      g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1);
      g.fillRect(0, (i * VIEW_H) / 40, VIEW_W, VIEW_H / 40 + 1);
    }

    bigTitle(this, GAME_TITLE, 46, 26, '#eaf2ff');
    this.heading = smallText(this, 'ARCHIVE', VIEW_W / 2, 76, 14, '#7d8ea8');

    // ---- page furniture, hidden until a page is opened -------------------
    this.portrait = this.add.image(VIEW_W * 0.16, VIEW_H * 0.46, 'pilot_halcyon');
    this.portrait.setDisplaySize(196, 196).setVisible(false);

    const px = VIEW_W * 0.34;
    this.pageTitle = this.add
      .text(px, 108, '', { fontFamily: FONT, fontSize: '22px', color: '#ffd166', fontStyle: 'bold' })
      .setOrigin(0, 0)
      .setStroke('#070b12', 5)
      .setVisible(false);
    this.pageSub = this.add
      .text(px, 136, '', { fontFamily: FONT, fontSize: '11px', color: '#8fa3bd' })
      .setOrigin(0, 0)
      .setStroke('#070b12', 4)
      .setVisible(false);
    this.pageTag = this.add
      .text(px, 158, '', {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#9fe0ff',
        fontStyle: 'italic',
        wordWrap: { width: VIEW_W - px - 30 },
      })
      .setOrigin(0, 0)
      .setStroke('#070b12', 4)
      .setVisible(false);
    this.pageBody = this.add
      .text(px, 192, '', {
        fontFamily: FONT,
        fontSize: '11px',
        color: '#cfe0f5',
        lineSpacing: 5,
        wordWrap: { width: VIEW_W - px - 30 },
      })
      .setOrigin(0, 0)
      .setStroke('#070b12', 3)
      .setVisible(false);

    // Off the display list — it exists only to be a mask.
    this.bodyMask = this.make.graphics({ x: 0, y: 0 }, false);
    this.pageBody.setMask(this.bodyMask.createGeometryMask());
    this.applyBodyMask();

    this.hint = smallText(this, '', VIEW_W / 2, VIEW_H - 22, 11, '#63748c');

    this.buildMenu();
  }

  /** The list for the current level. Rebuilt on every level change. */
  private buildMenu(): void {
    this.menu?.destroy();
    if (this.level === 'sections') {
      this.menu = new Menu(
        this,
        [
          ...ARCHIVE_SECTIONS.map((s, i) => ({
            label: s.label,
            value: () => `${s.entries.length}`,
            onSelect: () => this.openSection(i),
          })),
          { label: 'BACK', onSelect: () => this.back() },
        ],
        VIEW_W / 2,
        VIEW_H / 2 - 40,
        { size: 22, gap: 42, maxVisible: 4 },
      );
    } else if (this.level === 'entries') {
      const section = ARCHIVE_SECTIONS[this.sectionIndex];
      this.menu = new Menu(
        this,
        [
          ...section.entries.map((e, i) => ({
            label: e.title,
            onSelect: () => this.openPage(i),
          })),
          { label: 'BACK', onSelect: () => this.back() },
        ],
        VIEW_W / 2,
        150,
        { size: 17, gap: 30, maxVisible: 9 },
      );
    }
    this.refreshChrome();
  }

  private openSection(i: number): void {
    this.sectionIndex = i;
    this.entryIndex = 0;
    this.level = 'entries';
    this.buildMenu();
  }

  private openPage(i: number): void {
    this.entryIndex = i;
    this.level = 'page';
    this.scroll = 0;
    this.menu?.destroy();
    this.renderPage();
    this.refreshChrome();
  }

  private get entry(): ArchiveEntry {
    return ARCHIVE_SECTIONS[this.sectionIndex].entries[this.entryIndex];
  }

  private renderPage(): void {
    const e = this.entry;
    this.pageTitle.setText(e.title);
    this.pageSub.setText(e.subtitle);
    this.pageTag.setText(e.tagline);
    // Blank line between paragraphs: the bodies are prose, and a wall of text at
    // 11px is the fastest way to make lore unread.
    this.pageBody.setText(e.body.join('\n\n'));

    // A pilot page shows the portrait; a machine or a world page does not, since
    // there is no art for either and a placeholder would be worse than a gap.
    const isPilot = ARCHIVE_SECTIONS[this.sectionIndex].id === 'pilots';
    const hasArt = isPilot && !!MECHS[e.id];
    this.portrait.setVisible(hasArt);
    if (hasArt) this.portrait.setTexture(`pilot_${e.id}`);
    // With no portrait the text takes the full width instead of leaving a hole.
    const px = hasArt ? VIEW_W * 0.34 : VIEW_W * 0.1;
    for (const o of [this.pageTitle, this.pageSub, this.pageTag, this.pageBody]) o.setX(px);
    const wrap = VIEW_W - px - 30;
    this.pageTag.setWordWrapWidth(wrap);
    this.pageBody.setWordWrapWidth(wrap);
    // Measured, not assumed: a tagline that wraps to two lines was landing on
    // top of the first paragraph.
    this.bodyTop = this.pageTag.y + this.pageTag.height + 14;
    this.pageBody.setY(this.bodyTop);
    this.applyBodyMask();
  }

  /** Re-cut the clip to the current body band. `bodyTop` moves per entry. */
  private applyBodyMask(): void {
    this.bodyMask
      .clear()
      .fillStyle(0xffffff)
      .fillRect(0, this.bodyTop, VIEW_W, VIEW_H - this.bodyTop - BODY_BOTTOM_RESERVE);
  }

  private refreshChrome(): void {
    const onPage = this.level === 'page';
    for (const o of [this.pageTitle, this.pageSub, this.pageTag, this.pageBody]) {
      o.setVisible(onPage);
    }
    if (!onPage) this.portrait.setVisible(false);

    this.heading.setText(
      this.level === 'sections'
        ? 'ARCHIVE'
        : `ARCHIVE  ·  ${ARCHIVE_SECTIONS[this.sectionIndex].label}`,
    );
    this.hint.setText(
      onPage
        ? 'UP / DOWN  scroll      ESC  back'
        : 'ARROWS  select      ENTER  open      ESC  back',
    );
  }

  private back(): void {
    sfx.uiBack();
    if (this.level === 'page') {
      this.level = 'entries';
      this.buildMenu();
      return;
    }
    if (this.level === 'entries') {
      this.level = 'sections';
      this.buildMenu();
      return;
    }
    this.scene.start('Menu');
  }

  override update(_time: number, delta: number): void {
    this.t += delta / 1000;
    if (this.t < this.armAt) return;
    const ui = this.input$.readUi();

    if (this.level === 'page') {
      // The longest bodies run past the frame, so a page scrolls rather than
      // shrinking the type until it cannot be read.
      const overflow = Math.max(
        0,
        this.pageBody.height - (VIEW_H - this.bodyTop - BODY_BOTTOM_RESERVE),
      );
      if (ui.down) this.scroll = Math.min(overflow, this.scroll + 34);
      if (ui.up) this.scroll = Math.max(0, this.scroll - 34);
      this.pageBody.setY(this.bodyTop - this.scroll);
      if (ui.cancel || ui.confirm) this.back();
      return;
    }

    if (ui.up) this.menu.move(-1);
    if (ui.down) this.menu.move(1);
    if (ui.confirm) this.menu.confirm();
    if (ui.cancel) this.back();
    this.menu.update();
  }
}
