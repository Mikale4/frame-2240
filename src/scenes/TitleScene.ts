import Phaser from 'phaser';
import { GAME_VERSION, VIEW_H, VIEW_W } from '../core/GameConfig';
import { InputManager } from '../input/InputManager';
import { smallText } from '../ui/Menu';
import { LOGO_STYLES } from '../ui/Logotype';
import { TitleMark } from '../ui/TitleMark';
import { MECHS } from '../data/mechs';
import { sfx } from '../audio/Sfx';
import { music } from '../audio/Music';
import { PART_SCALE } from '../render/MechRenderer';
import { partTexture } from '../render/PartTexture';

/**
 * Attract screen: title art, a slow parade of mechs, and nothing to decide.
 *
 * Every option used to live here, which made the first thing a player saw a
 * settings form. The options now live in `MenuScene`; this screen exists to be
 * looked at, and any button moves on.
 */
export class TitleScene extends Phaser.Scene {
  private input$!: InputManager;
  private t = 0;
  private mark!: TitleMark;
  private mechGroups: Phaser.GameObjects.Container[] = [];
  private prompt!: Phaser.GameObjects.Text;
  /** Blocks input for a beat so the button that returned here cannot re-enter. */
  private armAt = 0;

  constructor() {
    super('Title');
  }

  create(): void {
    this.input$ = new InputManager(this);
    this.input$.reset();
    // Field initialisers do not re-run on a scene restart, so clear this or
    // returning to the title would animate the previous visit's dead containers.
    this.mechGroups = [];
    this.t = 0;
    this.armAt = 0.25;

    // Boot reaches here without a gesture, so this normally sets the intent and
    // the first keypress is what actually starts it. Coming back from a match
    // there has been a gesture, and it starts immediately.
    music.play('title');

    // ---- background: the title's own vista --------------------------------
    //
    // Was CATHEDRAL YARD's arena layers, tinted and offset to find an empty
    // corner to put a logo on. That spent the game's only stage before the
    // player had seen it, and a dockyard interior is a cramped first impression
    // of a game about flight. This is a mountain summit above the cloud sea.
    //
    // **The five transparent layers were composed in one 1536x1024 frame**, so
    // they are drawn to a single shared rect and line up by construction rather
    // than by five hand-tuned offsets. The sky is 16:9 and covers exactly.
    const sky = this.add.image(0, 0, 'title_sky').setOrigin(0, 0);
    sky.setDisplaySize(VIEW_W, VIEW_W * (941 / 1672));

    // 3:2 art on a 16:9 screen: filling the width overflows the height by 100px.
    // Anchored to the bottom, because that is where the rock is and the surplus
    // is empty sky the opaque layer already covers.
    const layerH = VIEW_W * (1024 / 1536);
    for (const key of ['title_haze', 'title_peaks', 'title_sea', 'title_cliff_mid', 'title_cliff_fore']) {
      const img = this.add.image(0, VIEW_H - layerH, key).setOrigin(0, 0);
      img.setDisplaySize(VIEW_W, layerH);
    }

    // ---- mech showcase ---------------------------------------------------
    this.showcase('halcyon', VIEW_W * 0.17, VIEW_H * 0.52, 1);
    this.showcase('nocturne', VIEW_W * 0.84, VIEW_H * 0.52, -1);

    // ---- titles ----------------------------------------------------------
    // **The initialism is not spelled out here, deliberately.** In the world
    // nobody expands it, so a title screen that does would be the one place the
    // game speaks out of character. It is in the README for anyone who wants it.
    this.mark = new TitleMark(this, VIEW_W / 2, 118, LOGO_STYLES.heraldic);
    smallText(this, 'ORIGINAL AERIAL MECHA COMBAT', VIEW_W / 2, 246, 12, '#7d8ea8');

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

  /** Builds a static assembled mech from its part sprites for the title art. */
  private showcase(mechId: string, x: number, y: number, facing: number): void {
    const def = MECHS[mechId];
    const root = this.add.container(x, y);
    root.scaleX = facing;
    root.setScale(facing * 1.45, 1.45);

    const nodes = new Map<string, Phaser.GameObjects.Container>();
    for (const part of def.rig.parts) {
      const c = this.add.container(part.x, part.y);
      const tex = partTexture(this, mechId, part.name);
      const img = this.add.image(0, 0, tex.key, tex.frame);
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

    this.add
      .text(x, y + 96, `${def.codeName}\n${def.name}`, {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: '15px',
        color: '#' + def.tint.primary.toString(16).padStart(6, '0'),
        align: 'center',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0)
      .setStroke('#070b12', 5);
  }

  override update(_time: number, delta: number): void {
    this.t += delta / 1000;
    this.mark.update(this.t);

    // Gentle hover so the showcase mechs feel alive.
    this.mechGroups.forEach((m, i) => {
      m.y += Math.sin(this.t * 1.5 + i * 1.7) * 0.16;
      m.rotation = Math.sin(this.t * 0.9 + i) * 0.02;
    });

    // Slow pulse rather than a hard blink: readable, and it never disappears at
    // the moment someone looks at it.
    this.prompt.setAlpha(0.55 + 0.45 * Math.sin(this.t * 3.4));

    if (this.t < this.armAt) return;
    const ui = this.input$.readUi();
    if (ui.confirm) {
      sfx.unlock();
      sfx.uiConfirm();
      this.scene.start('Menu');
    }
  }
}
