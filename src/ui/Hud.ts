import Phaser from 'phaser';
import type { Combatant } from '../combat/Combatant';
import type { MatchSim } from '../combat/MatchSim';
import { SAT_MODE_NAMES, SatMode } from '../combat/types';
import { VIEW_W } from '../core/GameConfig';
import { clamp01 } from '../core/MathUtil';

interface Bar {
  bg: Phaser.GameObjects.Rectangle;
  /** Slow-draining ghost behind the fill, so damage reads clearly. */
  ghost: Phaser.GameObjects.Rectangle;
  fill: Phaser.GameObjects.Rectangle;
  label?: Phaser.GameObjects.Text;
  width: number;
  ghostValue: number;
  rightAligned: boolean;
  x: number;
}

const FONT = 'ui-monospace, Consolas, monospace';

/**
 * Match HUD: life, boost, barrier, weapon energy and saturation for both
 * pilots, plus round timer, combo counter and the selected saturation mode.
 */
export class Hud {
  private readonly root: Phaser.GameObjects.Container;
  private readonly bars = new Map<string, Bar>();
  private readonly timerText: Phaser.GameObjects.Text;
  private readonly satModeText: Phaser.GameObjects.Text;
  private readonly comboText: Phaser.GameObjects.Text;
  private readonly bannerText: Phaser.GameObjects.Text;
  private readonly lockText: Phaser.GameObjects.Text;
  private readonly subPips: Phaser.GameObjects.Rectangle[][] = [[], []];
  private comboHold = 0;
  private bannerHold = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly sim: MatchSim,
  ) {
    this.root = scene.add.container(0, 0);
    this.root.setDepth(1000);
    this.root.setScrollFactor(0);

    const p = sim.player;
    const e = sim.enemy;

    // ---- player block (top-left) ----------------------------------------
    // Bars start below the two nameplate lines so nothing overlaps.
    this.nameplate(18, 12, `${p.def.codeName}  ${p.def.name}`, p.def.pilot, p.def.tint.primary, false);
    this.bar('p_life', 18, 50, 300, 13, 0x36e07f, false, 'LIFE');
    this.bar('p_boost', 18, 68, 230, 7, 0x4fc7ff, false, 'BST');
    this.bar('p_barrier', 18, 79, 230, 7, 0xc08cff, false, 'BAR');
    this.bar('p_energy', 18, 90, 230, 7, 0xffc857, false, 'NRG');
    this.bar('p_sat', 18, 104, 300, 9, 0xff7ad9, false, 'SAT');

    // ---- enemy block (top-right) ----------------------------------------
    this.nameplate(VIEW_W - 18, 12, `${e.def.name}  ${e.def.codeName}`, e.def.pilot, e.def.tint.primary, true);
    this.bar('e_life', VIEW_W - 18, 50, 300, 13, 0xff5f6d, true, 'LIFE');
    this.bar('e_boost', VIEW_W - 18, 68, 230, 7, 0x4fc7ff, true, 'BST');
    this.bar('e_barrier', VIEW_W - 18, 79, 230, 7, 0xc08cff, true, 'BAR');
    this.bar('e_energy', VIEW_W - 18, 90, 230, 7, 0xffc857, true, 'NRG');
    this.bar('e_sat', VIEW_W - 18, 104, 300, 9, 0xff7ad9, true, 'SAT');

    // ---- sub-weapon charge pips -----------------------------------------
    this.makePips(0, 18, 119, false, p.def.subCharges);
    this.makePips(1, VIEW_W - 18, 119, true, e.def.subCharges);

    // ---- centre readouts -------------------------------------------------
    this.timerText = scene.add
      .text(VIEW_W / 2, 20, '99', {
        fontFamily: FONT,
        fontSize: '40px',
        color: '#eaf2ff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0)
      .setStroke('#0a0e18', 6);
    this.root.add(this.timerText);

    this.satModeText = scene.add
      .text(18, 136, 'SAT MODE: SHIELD', {
        fontFamily: FONT,
        fontSize: '13px',
        color: '#ffb0ea',
      })
      .setOrigin(0, 0)
      .setStroke('#0a0e18', 4);
    this.root.add(this.satModeText);

    this.lockText = scene.add
      .text(18, 154, 'LOCK: ON', {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#9fe0ff',
      })
      .setOrigin(0, 0)
      .setStroke('#0a0e18', 4);
    this.root.add(this.lockText);

    this.comboText = scene.add
      .text(VIEW_W / 2, 74, '', {
        fontFamily: FONT,
        fontSize: '22px',
        color: '#ffd166',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0)
      .setStroke('#0a0e18', 5);
    this.root.add(this.comboText);

    this.bannerText = scene.add
      .text(VIEW_W / 2, 200, '', {
        fontFamily: FONT,
        fontSize: '46px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0.5)
      .setStroke('#0a0e18', 8);
    this.root.add(this.bannerText);
  }

  private nameplate(
    x: number,
    y: number,
    name: string,
    pilot: string,
    tint: number,
    right: boolean,
  ): void {
    const n = this.scene.add
      .text(x, y, name, {
        fontFamily: FONT,
        fontSize: '16px',
        color: '#' + tint.toString(16).padStart(6, '0'),
        fontStyle: 'bold',
      })
      .setOrigin(right ? 1 : 0, 0)
      .setStroke('#0a0e18', 5);
    const p = this.scene.add
      .text(x, y + 18, `PILOT ${pilot}`, {
        fontFamily: FONT,
        fontSize: '10px',
        color: '#a9bad6',
      })
      .setOrigin(right ? 1 : 0, 0)
      .setStroke('#0a0e18', 4);
    this.root.add([n, p]);
  }

  private bar(
    key: string,
    x: number,
    y: number,
    width: number,
    height: number,
    color: number,
    right: boolean,
    label: string,
  ): void {
    const ox = right ? x - width : x;
    const bg = this.scene.add.rectangle(ox, y, width, height, 0x0c1220, 0.85).setOrigin(0, 0);
    bg.setStrokeStyle(1, 0x2b3a54, 1);
    const ghost = this.scene.add
      .rectangle(right ? x : ox, y, width, height, 0xffffff, 0.28)
      .setOrigin(right ? 1 : 0, 0);
    const fill = this.scene.add
      .rectangle(right ? x : ox, y, width, height, color, 1)
      .setOrigin(right ? 1 : 0, 0);

    const lbl = this.scene.add
      .text(right ? ox - 6 : x + width + 6, y + height / 2, label, {
        fontFamily: FONT,
        fontSize: '9px',
        color: '#7f92ad',
      })
      .setOrigin(right ? 1 : 0, 0.5);

    this.root.add([bg, ghost, fill, lbl]);
    this.bars.set(key, {
      bg,
      ghost,
      fill,
      label: lbl,
      width,
      ghostValue: 1,
      rightAligned: right,
      x,
    });
  }

  private makePips(side: number, x: number, y: number, right: boolean, count: number): void {
    const w = 22;
    const gap = 4;
    for (let i = 0; i < count; i++) {
      const px = right ? x - i * (w + gap) - w : x + i * (w + gap);
      const r = this.scene.add.rectangle(px, y, w, 6, 0x63f2c8, 1).setOrigin(0, 0);
      r.setStrokeStyle(1, 0x1d3a34, 1);
      this.root.add(r);
      this.subPips[side].push(r);
    }
  }

  private setBar(key: string, frac: number, dt: number): void {
    const b = this.bars.get(key);
    if (!b) return;
    const f = clamp01(frac);
    b.fill.width = Math.max(0, b.width * f);
    // Ghost chases the fill downward slowly to show the chunk just lost.
    if (f > b.ghostValue) b.ghostValue = f;
    else b.ghostValue = Math.max(f, b.ghostValue - dt * 0.55);
    b.ghost.width = Math.max(0, b.width * b.ghostValue);
  }

  /** Shows a large centred banner (FIGHT / K.O. / TIME UP) for `ticks` frames. */
  banner(text: string, hold = 90): void {
    this.bannerText.setText(text);
    this.bannerText.setAlpha(1);
    this.bannerHold = hold;
  }

  update(dt: number): void {
    const s = this.sim;
    const p = s.player;
    const e = s.enemy;

    this.gaugesFor('p', p, dt);
    this.gaugesFor('e', e, dt);

    // Training runs on an effectively unlimited clock; a 3-digit countdown there
    // is just noise, so show a dash instead.
    const unlimited = s.secondsLeft > 199;
    this.timerText.setText(unlimited ? '--' : String(s.secondsLeft).padStart(2, '0'));
    this.timerText.setColor(!unlimited && s.secondsLeft <= 10 ? '#ff6a6a' : '#eaf2ff');

    const modeName = SAT_MODE_NAMES[p.satMode];
    this.satModeText.setText(
      p.satActive ? `SAT ACTIVE: ${modeName}` : `SAT MODE: ${modeName}  [Q]`,
    );
    this.satModeText.setColor(
      p.satActive
        ? p.satMode === SatMode.Shield
          ? '#9fe0ff'
          : p.satMode === SatMode.Shoot
            ? '#ffd166'
            : '#ff9ae0'
        : p.sat >= p.def.gauges.maxSaturation
          ? '#ffffff'
          : '#8f7ea8',
    );

    this.lockText.setText(
      `${p.flying ? 'FLIGHT: ON' : p.grounded ? 'FLIGHT: OFF (LANDED)' : 'FLIGHT: OFF'}`,
    );
    this.lockText.setColor(p.flying ? '#9fe0ff' : '#8effc0');

    // Sub-weapon pips.
    //
    // A destroyed drone leaves them dark for the rest of the match, whatever the
    // charge counter says: the ammunition is irrelevant once the thing that
    // carries it has been shot down, and a lit pip would promise a volley that
    // will never come.
    for (let side = 0; side < 2; side++) {
      const c = side === 0 ? p : e;
      const pips = this.subPips[side];
      const gone = c.supporter.destroyed;
      for (let i = 0; i < pips.length; i++) {
        const ready = !gone && i < c.subCharges;
        pips[i].setFillStyle(ready ? 0x63f2c8 : gone ? 0x3a1d20 : 0x24303f, 1);
      }
    }

    // Combo readout, driven by the sim's per-victim counter.
    const enemyCombo = s.combo.get(e.id) ?? 0;
    if (enemyCombo >= 2) {
      this.comboText.setText(`${enemyCombo}  HIT`);
      this.comboText.setAlpha(1);
      this.comboHold = 50;
    } else if (this.comboHold > 0) {
      this.comboHold -= dt * 60;
      this.comboText.setAlpha(Math.max(0, this.comboHold / 50));
    } else {
      this.comboText.setText('');
    }

    if (this.bannerHold > 0) {
      this.bannerHold -= dt * 60;
      const t = this.bannerHold;
      this.bannerText.setAlpha(Math.min(1, t / 26));
      this.bannerText.setScale(1 + Math.max(0, (26 - Math.min(26, t)) * 0.004));
      if (this.bannerHold <= 0) this.bannerText.setText('');
    }
  }

  private gaugesFor(prefix: string, c: Combatant, dt: number): void {
    const g = c.def.gauges;
    this.setBar(`${prefix}_life`, c.life / g.maxLife, dt);
    this.setBar(`${prefix}_boost`, c.boost / c.def.flight.maxBoost, dt);
    this.setBar(`${prefix}_barrier`, c.barrier / g.maxBarrier, dt);
    this.setBar(`${prefix}_energy`, c.energy / g.maxEnergy, dt);
    this.setBar(`${prefix}_sat`, c.sat / g.maxSaturation, dt);

    // Flash the saturation bar when it is full and ready to spend.
    const sat = this.bars.get(`${prefix}_sat`);
    if (sat) {
      const full = c.sat >= g.maxSaturation && !c.satActive;
      sat.fill.setFillStyle(full ? 0xffffff : c.satActive ? 0xffd166 : 0xff7ad9, 1);
    }
    // Grey the barrier bar out during guard-break stun.
    const bar = this.bars.get(`${prefix}_barrier`);
    if (bar) bar.fill.setFillStyle(c.guardBreakStun > 0 ? 0x8a3a3a : 0xc08cff, 1);
  }

  /** Exposed so the scene can assign the HUD to its zoom-immune UI camera. */
  get container(): Phaser.GameObjects.Container {
    return this.root;
  }

  setVisible(v: boolean): void {
    this.root.setVisible(v);
  }

  destroy(): void {
    this.root.destroy(true);
  }
}
