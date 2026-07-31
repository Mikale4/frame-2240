import Phaser from 'phaser';
import type { MatchSim } from '../combat/MatchSim';
import type { Combatant } from '../combat/Combatant';
import type { RivalAI } from '../ai/RivalAI';
import { Phase, ProjKind, SAT_MODE_NAMES } from '../combat/types';
import { VIEW_H } from '../core/GameConfig';

const FONT = 'ui-monospace, Consolas, monospace';
const PHASE_NAMES = ['STARTUP', 'ACTIVE', 'RECOVERY'];
const ACT_NAMES = ['FREE', 'ATTACK', 'BARRIER', 'HITSTUN', 'GUARD', 'DOWNED', 'DEAD'];

/**
 * F1 toggles the text readout, F2 toggles hitbox/hurtbox drawing.
 *
 * Hitbox colours: green = hurtbox, red = live hit, yellow = startup (not yet
 * live), cyan = barrier bubble, magenta = projectile.
 */
export class DebugOverlay {
  private readonly text: Phaser.GameObjects.Text;
  private readonly gfx: Phaser.GameObjects.Graphics;
  showText = false;
  showHitboxes = false;

  private frameMs = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly sim: MatchSim,
    private readonly ai: RivalAI,
  ) {
    this.gfx = scene.add.graphics();
    this.gfx.setDepth(900);

    this.text = scene.add
      .text(14, VIEW_H - 14, '', {
        fontFamily: FONT,
        fontSize: '11px',
        color: '#b8ffd9',
        backgroundColor: 'rgba(4,8,14,0.72)',
        padding: { x: 8, y: 6 },
      })
      .setOrigin(0, 1)
      .setDepth(1100)
      .setScrollFactor(0);
    this.text.setVisible(false);
  }

  /** Screen-space objects, for the UI camera. */
  get uiObjects(): Phaser.GameObjects.GameObject[] {
    return [this.text];
  }

  /** World-space objects, for the main camera. */
  get worldObjects(): Phaser.GameObjects.GameObject[] {
    return [this.gfx];
  }

  toggleText(): void {
    this.showText = !this.showText;
    this.text.setVisible(this.showText);
  }

  toggleHitboxes(): void {
    this.showHitboxes = !this.showHitboxes;
    if (!this.showHitboxes) this.gfx.clear();
  }

  /** `toScreen` converts arena coordinates into screen space. */
  update(
    dtMs: number,
    toScreen: (x: number, y: number) => { x: number; y: number },
  ): void {
    this.frameMs = this.frameMs * 0.9 + dtMs * 0.1;

    if (this.showText) this.text.setText(this.buildText());
    if (this.showHitboxes) this.drawBoxes(toScreen);
  }

  private line(c: Combatant, tag: string): string {
    const a = c.attack;
    const atk = a
      ? `${a.label} ${PHASE_NAMES[c.phase]} ${c.attackTick}/${a.startup + a.active + a.recovery}`
      : '-';
    return [
      `${tag} ${c.def.codeName} ${ACT_NAMES[c.act]}`,
      `  pos ${c.x.toFixed(0)},${c.y.toFixed(0)}  vel ${c.vx.toFixed(2)},${c.vy.toFixed(2)} (${Math.hypot(c.vx, c.vy).toFixed(2)})`,
      `  life ${c.life.toFixed(0)}  nrg ${c.energy.toFixed(0)}  bst ${c.boost.toFixed(0)}  bar ${c.barrier.toFixed(0)}`,
      `  sat ${c.sat.toFixed(0)}/${c.def.gauges.maxSaturation} ${c.satActive ? `ACTIVE:${SAT_MODE_NAMES[c.satMode]} ${c.satTicks}t` : SAT_MODE_NAMES[c.satMode]}`,
      `  atk ${atk}`,
      `  aim ${((c.aim * 180) / Math.PI).toFixed(0)}deg bank ${((c.bank * 180) / Math.PI).toFixed(0)}deg face ${c.facing > 0 ? 'R' : 'L'}`,
      `  stop ${c.hitstop} stun ${c.hitstun} inv ${c.invuln} gbrk ${c.guardBreakStun}`,
      `  dash ${c.dashTicks}/${c.dashCooldown} melee ${c.meleeCount}${c.meleeHitConfirmed ? ' CONFIRM' : ''}${c.meleeChainQueued ? ' QUEUED' : ''}`,
      `  sub ${c.subCharges}/${c.def.subCharges}`,
      `  flight ${c.flying ? 'ON' : 'OFF'}${c.grounded ? ' GROUNDED' : ''} floor ${c.groundY.toFixed(0)}`,
    ].join('\n');
  }

  private buildText(): string {
    const s = this.sim;
    return [
      `BABEL SWORD: REIGNITION  debug  [F1 text] [F2 hitboxes]`,
      `frame ${this.frameMs.toFixed(2)}ms  tick ${s.tick}  phase ${s.phase}  time ${s.secondsLeft}s`,
      `projectiles ${s.projectiles.activeCount}  outcome ${s.outcome}`,
      this.line(s.player, 'P1'),
      this.line(s.enemy, 'CPU'),
      `AI tactic ${this.ai.tacticName}`,
    ].join('\n');
  }

  private drawBoxes(toScreen: (x: number, y: number) => { x: number; y: number }): void {
    const g = this.gfx;
    g.clear();

    for (const c of this.sim.combatants) {
      const p = toScreen(c.x, c.y);

      // Hurtbox.
      g.lineStyle(1.5, c.invuln > 0 ? 0x66ffff : 0x44ff88, 0.95);
      g.strokeCircle(p.x, p.y, c.def.rig.hurtRadius);

      // Barrier bubble.
      if (c.invuln > 0) {
        g.lineStyle(1, 0x66ffff, 0.6);
        g.strokeCircle(p.x, p.y, c.def.barrier.radius);
      }

      // Melee trigger range: dashed-looking ring showing where the main-gun
      // button switches to a sword swing.
      g.lineStyle(1, 0xffaa33, 0.28);
      g.strokeCircle(p.x, p.y, c.def.meleeRange);

      // Melee reach: yellow during startup, red while the hit is live.
      const a = c.attack;
      if (a && a.kind === ProjKind.Melee) {
        const live = c.phase === Phase.Active;
        g.lineStyle(2, live ? 0xff4466 : 0xffdd44, 0.9);
        const mx = p.x + Math.cos(c.aim) * a.muzzleForward;
        const my = p.y + Math.sin(c.aim) * a.muzzleForward;
        g.strokeCircle(mx, my, a.projRadius);
        g.lineBetween(p.x, p.y, mx, my);
      }

      // Arena floor.
      if (Number.isFinite(c.groundY)) {
        g.lineStyle(1, 0x88ffaa, c.grounded ? 0.6 : 0.22);
        const fy = toScreen(c.x, c.groundY).y;
        g.lineBetween(p.x - 220, fy, p.x + 220, fy);
      }

      // Aim ray.
      g.lineStyle(1, 0xffffff, 0.28);
      g.lineBetween(p.x, p.y, p.x + Math.cos(c.aim) * 90, p.y + Math.sin(c.aim) * 90);

      // Velocity vector.
      g.lineStyle(1.5, 0x88bbff, 0.7);
      g.lineBetween(p.x, p.y, p.x + c.vx * 8, p.y + c.vy * 8);

      // Guard state marker.
      if (c.guarding) {
        g.lineStyle(2, 0xc08cff, 0.8);
        g.strokeCircle(p.x, p.y, c.def.rig.hurtRadius + 7);
      }
    }

    // Projectiles, including their swept segment.
    for (const pr of this.sim.projectiles.items) {
      if (!pr.active) continue;
      const a = toScreen(pr.prevX, pr.prevY);
      const b = toScreen(pr.x, pr.y);
      g.lineStyle(1, 0xff66ff, 0.55);
      g.lineBetween(a.x, a.y, b.x, b.y);
      g.lineStyle(1.5, 0xff66ff, 0.95);
      g.strokeCircle(b.x, b.y, pr.radius);
    }
  }

  destroy(): void {
    this.gfx.destroy();
    this.text.destroy();
  }
}
