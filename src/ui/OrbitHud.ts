import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../core/GameConfig';
import { SAT_MODE_NAMES } from '../combat/types';
import { getBindings, keyLabel, type ActionId } from '../input/Bindings';
import { OrbitAct, type OrbitFighter, type OrbitSim } from '../orbit/OrbitSim';

const FONT = 'ui-monospace, Consolas, monospace';

interface Bar {
  fill: Phaser.GameObjects.Rectangle;
  ghost: Phaser.GameObjects.Rectangle;
  width: number;
  shown: number;
}

const hex = (c: number): string => '#' + c.toString(16).padStart(6, '0');

/**
 * FREE ORBIT's interface.
 *
 * The side-on HUD's layout and vocabulary — the same bars in the same colours
 * in the same corners, so a pilot who knows one reads the other — plus what a
 * third-person fight needs that a side-on one does not: a **lock reticle** on
 * the rival wherever the lens puts it, an arrow at the screen edge when it is
 * behind you, the range in metres with a cue when the sword will reach, and a
 * form readout, since the mobile form is a state you need to know you are in.
 */
export class OrbitHud {
  readonly container: Phaser.GameObjects.Container;
  private readonly bars = new Map<string, Bar>();
  private readonly timer: Phaser.GameObjects.Text;
  private readonly banner: Phaser.GameObjects.Text;
  private readonly forms: Phaser.GameObjects.Text[] = [];
  private readonly modes: Phaser.GameObjects.Text[] = [];
  private readonly pips: Phaser.GameObjects.Rectangle[][] = [[], []];
  private readonly reticle: Phaser.GameObjects.Graphics;
  private readonly range: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;
  private readonly combo: Phaser.GameObjects.Text;
  private bannerTime = 0;
  private readonly tag: Phaser.GameObjects.Text;
  /** A watched match has nobody to show the controls to. */
  private hintOff = false;
  private hintTime = 0;
  private spin = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    sim: OrbitSim,
    names: [string, string] = ['', ''],
  ) {
    this.container = scene.add.container(0, 0).setDepth(1000).setScrollFactor(0);
    this.reticle = scene.add.graphics();
    this.container.add(this.reticle);
    for (let side = 0; side < 2; side++) {
      const f = sim.fighters[side];
      const right = side === 1;
      const x = right ? VIEW_W - 18 : 18;
      const n = scene.add
        .text(x, 12, right ? `${f.def.name}  ${f.def.codeName}` : `${f.def.codeName}  ${f.def.name}`, {
          fontFamily: FONT,
          fontSize: '16px',
          color: hex(f.def.tint.primary),
          fontStyle: 'bold',
        })
        .setOrigin(right ? 1 : 0, 0)
        .setStroke('#0a0e18', 5);
      const p = scene.add
        .text(x, 30, names[side] || `PILOT ${f.def.pilot}`, { fontFamily: FONT, fontSize: '10px', color: '#a9bad6' })
        .setOrigin(right ? 1 : 0, 0)
        .setStroke('#0a0e18', 4);
      this.container.add([n, p]);
      const k = right ? 'e' : 'p';
      this.bar(`${k}_life`, x, 50, 300, 13, right ? 0xff5f6d : 0x36e07f, right, 'LIFE');
      this.bar(`${k}_boost`, x, 68, 230, 7, 0x4fc7ff, right, 'BST');
      this.bar(`${k}_barrier`, x, 79, 230, 7, 0xc08cff, right, 'BAR');
      this.bar(`${k}_energy`, x, 90, 230, 7, 0xffc857, right, 'NRG');
      this.bar(`${k}_sat`, x, 104, 300, 9, 0xff7ad9, right, 'SAT');
      for (let i = 0; i < f.def.subCharges; i++) {
        const px = right ? x - 14 - i * 18 : x + i * 18;
        const r = scene.add.rectangle(px, 119, 14, 6, 0x63f2c8, 1).setOrigin(0, 0);
        r.setStrokeStyle(1, 0x1d3a34, 1);
        this.pips[side].push(r);
        this.container.add(r);
      }
      const form = scene.add
        .text(x, 134, '', { fontFamily: FONT, fontSize: '13px', color: '#9fe0ff', fontStyle: 'bold' })
        .setOrigin(right ? 1 : 0, 0)
        .setStroke('#0a0e18', 4);
      const mode = scene.add
        .text(x, 152, '', { fontFamily: FONT, fontSize: '12px', color: '#ffb0ea' })
        .setOrigin(right ? 1 : 0, 0)
        .setStroke('#0a0e18', 4);
      this.forms.push(form);
      this.modes.push(mode);
      this.container.add([form, mode]);
    }
    this.timer = scene.add
      .text(VIEW_W / 2, 20, '180', { fontFamily: FONT, fontSize: '40px', color: '#eaf2ff', fontStyle: 'bold' })
      .setOrigin(0.5, 0)
      .setStroke('#0a0e18', 6);
    const tag = (this.tag = scene.add
      .text(VIEW_W / 2, 66, 'FREE ORBIT', { fontFamily: FONT, fontSize: '11px', color: '#8fe9ff' })
      .setOrigin(0.5, 0)
      .setStroke('#0a0e18', 4));
    this.combo = scene.add
      .text(VIEW_W / 2, 84, '', { fontFamily: FONT, fontSize: '20px', color: '#ffd166', fontStyle: 'bold' })
      .setOrigin(0.5, 0)
      .setStroke('#0a0e18', 5);
    this.range = scene.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '11px', color: '#ffd166' })
      .setOrigin(0.5, 0)
      .setStroke('#0a0e18', 4);
    this.banner = scene.add
      .text(VIEW_W / 2, 210, '', { fontFamily: FONT, fontSize: '46px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setStroke('#0a0e18', 8);
    this.hint = scene.add
      .text(VIEW_W / 2, VIEW_H - 14, OrbitHud.controlsLine(), {
        fontFamily: FONT,
        fontSize: '11px',
        color: '#cfe2ff',
        align: 'center',
        wordWrap: { width: VIEW_W - 60 },
      })
      .setOrigin(0.5, 1)
      .setStroke('#0a0e18', 4);
    this.container.add([this.timer, tag, this.combo, this.range, this.banner, this.hint]);
  }

  /** The controls, from the live bindings. */
  static controlsLine(): string {
    const b = getBindings();
    const k = (a: ActionId): string => {
      const code = b[a].keys[0];
      return code ? keyLabel(code) : '?';
    };
    return (
      `${k('up')}/${k('down')} CLOSE · BACK   ${k('left')}/${k('right')} CIRCLE   ` +
      `${k('boost')} BOOST · DASH · HOLD ALONE TO CLIMB   ${k('flightToggle')} TRANSFORM\n` +
      `${k('main')} FIRE   ${k('heavy')} HEAVY (+${k('down')} LANCE)   ${k('melee')} SWORD   ` +
      `${k('sub')} SALVO   ${k('barrier')} GUARD · TAP BURST   ${k('saturation')} SATURATION   ${k('modeCycle')} MODE`
    );
  }

  private bar(key: string, x: number, y: number, width: number, height: number, color: number, right: boolean, label: string): void {
    const ox = right ? x - width : x;
    const bg = this.scene.add.rectangle(ox, y, width, height, 0x0c1220, 0.85).setOrigin(0, 0);
    bg.setStrokeStyle(1, 0x2b3a54, 1);
    const ghost = this.scene.add.rectangle(right ? x : ox, y, width, height, 0xffffff, 0.28).setOrigin(right ? 1 : 0, 0);
    const fill = this.scene.add.rectangle(right ? x : ox, y, width, height, color, 1).setOrigin(right ? 1 : 0, 0);
    const lbl = this.scene.add
      .text(right ? ox - 6 : x + width + 6, y + height / 2, label, { fontFamily: FONT, fontSize: '9px', color: '#7f92ad' })
      .setOrigin(right ? 1 : 0, 0.5);
    this.container.add([bg, ghost, fill, lbl]);
    this.bars.set(key, { fill, ghost, width, shown: 1 });
  }

  private setBar(key: string, frac: number, dt: number): void {
    const b = this.bars.get(key);
    if (!b) return;
    const f = Math.max(0, Math.min(1, frac));
    b.fill.width = b.width * f;
    // The white ghost trails the real value down, so a hit reads as a chunk.
    b.shown = f > b.shown ? f : b.shown + (f - b.shown) * Math.min(1, dt * 3);
    b.ghost.width = b.width * b.shown;
  }

  showBanner(text: string, seconds = 1.2, color = '#ffffff'): void {
    this.banner.setText(text).setColor(color).setAlpha(1).setScale(1.25);
    this.bannerTime = seconds;
  }

  update(sim: OrbitSim, target: { x: number; y: number } | null, onScreen: boolean, dist: number, inReach: boolean, dt: number): void {
    this.spin += dt;
    for (let side = 0; side < 2; side++) {
      const f = sim.fighters[side];
      const k = side === 1 ? 'e' : 'p';
      const g = f.def.gauges;
      this.setBar(`${k}_life`, f.life / g.maxLife, dt);
      this.setBar(`${k}_boost`, f.boost / f.def.flight.maxBoost, dt);
      this.setBar(`${k}_barrier`, f.barrier / g.maxBarrier, dt);
      this.setBar(`${k}_energy`, f.energy / g.maxEnergy, dt);
      this.setBar(`${k}_sat`, f.sat / g.maxSaturation, dt);
      const sat = this.bars.get(`${k}_sat`);
      if (sat) sat.fill.setFillStyle(f.satActive ? 0xffd166 : f.sat >= g.maxSaturation ? 0xffffff : 0xff7ad9, 1);
      const pips = this.pips[side];
      for (let i = 0; i < pips.length; i++) pips[i].setFillStyle(i < f.subCharges ? 0x63f2c8 : 0x24303f, 1);
      this.forms[side].setText(OrbitHud.formLabel(f)).setColor(f.form === 'mobile' ? '#ffd166' : '#9fe0ff');
      this.modes[side].setText(f.satActive ? `SATURATION: ${SAT_MODE_NAMES[f.satMode]}` : `SAT MODE: ${SAT_MODE_NAMES[f.satMode]}`);
    }
    this.timer.setText(sim.endless ? '∞' : String(sim.secondsLeft));
    this.timer.setColor(sim.secondsLeft <= 10 ? '#ff6a7a' : '#eaf2ff');
    const foe = sim.fighters[1];
    this.combo.setText(foe.combo >= 2 ? `${foe.combo} HIT` : sim.player.combo >= 2 ? `${sim.player.combo} HIT` : '');
    this.combo.setColor(foe.combo >= 2 ? '#ffd166' : '#ff8a8a');

    // ---- lock reticle -------------------------------------------------
    const g = this.reticle;
    g.clear();
    this.range.setVisible(false);
    if (target && sim.phase !== 'over') {
      const col = inReach ? 0xff5f6d : 0xffd166;
      if (onScreen) {
        const r = 22 + Math.sin(this.spin * 6) * 2;
        g.lineStyle(2, col, 0.95);
        for (let i = 0; i < 4; i++) {
          const a = this.spin * 1.2 + (i * Math.PI) / 2;
          const cx = target.x + Math.cos(a) * r;
          const cy = target.y + Math.sin(a) * r;
          g.beginPath();
          g.arc(target.x, target.y, r, a - 0.35, a + 0.35);
          g.strokePath();
          g.fillStyle(col, 0.95);
          g.fillCircle(cx, cy, 1.6);
        }
        g.lineStyle(1, col, 0.6);
        g.strokeCircle(target.x, target.y, 4);
        this.range
          .setVisible(true)
          .setPosition(target.x, target.y + r + 6)
          .setText(inReach ? `${Math.round(dist * 10)}m  SWORD RANGE` : `${Math.round(dist * 10)}m`)
          .setColor(inReach ? '#ff8a8a' : '#ffd166');
      } else {
        // Behind or off the edge: an arrow on the border pointing at them.
        const cx = VIEW_W / 2;
        const cy = VIEW_H / 2;
        const a = Math.atan2(target.y - cy, target.x - cx);
        const ex = cx + Math.cos(a) * (VIEW_W / 2 - 40);
        const ey = cy + Math.sin(a) * (VIEW_H / 2 - 40);
        g.fillStyle(col, 0.9);
        g.beginPath();
        g.moveTo(ex + Math.cos(a) * 16, ey + Math.sin(a) * 16);
        g.lineTo(ex + Math.cos(a + 2.5) * 12, ey + Math.sin(a + 2.5) * 12);
        g.lineTo(ex + Math.cos(a - 2.5) * 12, ey + Math.sin(a - 2.5) * 12);
        g.closePath();
        g.fillPath();
      }
    }

    // ---- banner and hint ----------------------------------------------
    if (this.bannerTime > 0) {
      this.bannerTime -= dt;
      this.banner.setScale(1 + Math.max(0, this.banner.scale - 1) * 0.85);
      if (this.bannerTime < 0.3) this.banner.setAlpha(Math.max(0, this.bannerTime / 0.3));
    } else {
      this.banner.setAlpha(0);
    }
    this.hintTime += dt;
    // The control line stays for the opening, then gets out of the way.
    this.hint.setAlpha(this.hintTime < 12 ? 1 : Math.max(0.0, 1 - (this.hintTime - 12) / 1.5));
  }

  static formLabel(f: OrbitFighter): string {
    if (f.act === OrbitAct.Down) return 'DOWN';
    if (f.transformTicks > 0) return f.form === 'mech' ? 'TRANSFORMING ▸ MOBILE' : 'TRANSFORMING ▸ MECH';
    if (f.act === OrbitAct.Knockdown) return 'KNOCKED DOWN';
    if (f.act === OrbitAct.GuardBreak) return 'GUARD BROKEN';
    return f.form === 'mobile' ? 'FORM: MOBILE' : 'FORM: MECH';
  }

  /** Brings the control line back, e.g. after unpausing. */
  showHint(): void {
    this.hintTime = 0;
    this.hint.setVisible(!this.hintOff);
  }

  /** Hides it, e.g. under the pause menu, which prints its own. */
  hideHint(): void {
    this.hint.setVisible(false);
  }

  /** The line under the clock: the mode being fought. */
  setTag(text: string): void {
    this.tag.setText(text);
  }

  /** For CPU vs CPU: no control line at all. */
  spectating(): void {
    this.hintOff = true;
    this.hint.setVisible(false);
  }

  destroy(): void {
    this.container.destroy(true);
  }
}
