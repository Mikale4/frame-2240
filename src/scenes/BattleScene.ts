import Phaser from 'phaser';
import { ARENA_H, ARENA_W, TICK_MS, VIEW_H, VIEW_W } from '../core/GameConfig';
import { session } from '../core/Session';
import { MatchSim } from '../combat/MatchSim';
import { MECHS } from '../data/mechs';
import { RivalAI } from '../ai/RivalAI';
import { Rng } from '../core/Rng';
import { InputManager } from '../input/InputManager';
import { MechRenderer } from '../render/MechRenderer';
import { Effects } from '../render/Effects';
import { Backdrop } from '../render/Backdrop';
import { TEX } from '../render/Textures';
import { Hud } from '../ui/Hud';
import { Menu, makeScrim, bigTitle, smallText } from '../ui/Menu';
import { DebugOverlay } from '../debug/DebugOverlay';
import { sfx } from '../audio/Sfx';
import { MatchPhase, ProjKind, emptyInput, type InputFrame } from '../combat/types';
import type { Combatant } from '../combat/Combatant';
import { clamp } from '../core/MathUtil';

/** Visual style per projectile kind. */
const PROJ_STYLE: Record<number, { tex: string; scale: number; yMul: number; trail: number }> = {
  [ProjKind.Bullet]: { tex: TEX.streak, scale: 0.34, yMul: 0.42, trail: 0.35 },
  [ProjKind.Heavy]: { tex: TEX.streak, scale: 0.72, yMul: 0.68, trail: 0.6 },
  [ProjKind.Beam]: { tex: TEX.streak, scale: 1.15, yMul: 0.5, trail: 0.9 },
  [ProjKind.Missile]: { tex: TEX.glow, scale: 0.3, yMul: 1, trail: 0.8 },
  [ProjKind.Melee]: { tex: TEX.glow, scale: 0.1, yMul: 1, trail: 0 },
};

/**
 * The playable match.
 *
 * The scene owns a fixed 60Hz accumulator that drives `MatchSim` (which knows
 * nothing about Phaser), then mirrors the resulting state onto renderers, the
 * HUD and the effect layer. Rendering never mutates simulation state.
 */
export class BattleScene extends Phaser.Scene {
  private sim!: MatchSim;
  private ai!: RivalAI;
  private playerAi?: RivalAI;
  private input$!: InputManager;
  private hud!: Hud;
  private debug!: DebugOverlay;
  private effects!: Effects;
  private backdrop!: Backdrop;
  private renderers: MechRenderer[] = [];
  private projSprites: Phaser.GameObjects.Image[] = [];

  private accumulator = 0;
  private paused = false;
  private pauseUi?: { scrim: Phaser.GameObjects.Rectangle; menu: Menu; extra: Phaser.GameObjects.GameObject[] };
  private shake = 0;
  private finished = false;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private worldObjects: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('Battle');
  }

  create(): void {
    this.finished = false;
    this.paused = false;
    this.accumulator = 0;

    const playerDef = MECHS[session.playerMech];
    const enemyDef = MECHS[session.enemyMech];

    this.sim = new MatchSim({
      playerDef,
      enemyDef,
      seed: session.seed(),
      introTicks: 96,
      roundTicks: session.mode === 'training' ? 99 * 60 * 10 : undefined,
    });

    const aiSeed = session.seed() ^ 0x9e3779b9;
    this.ai = new RivalAI(
      { level: session.mode === 'training' ? 2 : session.difficulty },
      new Rng(aiSeed),
    );
    if (session.mode === 'aiVsAi') {
      this.playerAi = new RivalAI({ level: session.difficulty }, new Rng(aiSeed ^ 0x2545f491));
    }

    this.input$ = new InputManager(this);
    this.input$.reset();

    this.backdrop = new Backdrop(this);
    this.effects = new Effects(this, 50);

    this.renderers = [
      new MechRenderer(this, playerDef, playerDef.id),
      new MechRenderer(this, enemyDef, enemyDef.id),
    ];
    this.renderers[0].setDepth(20);
    this.renderers[1].setDepth(21);

    // Projectile sprite pool.
    for (let i = 0; i < 320; i++) {
      const img = this.add.image(0, 0, TEX.streak);
      img.setBlendMode(Phaser.BlendModes.ADD);
      img.setVisible(false);
      img.setDepth(40);
      this.projSprites.push(img);
    }

    this.hud = new Hud(this, this.sim);
    this.debug = new DebugOverlay(this, this.sim, this.ai);

    this.cameras.main.setBounds(0, 0, ARENA_W, ARENA_H);
    this.cameras.main.setZoom(1);
    this.cameras.main.centerOn(ARENA_W / 2, ARENA_H / 2);

    // A second, unzoomed camera draws the HUD. Camera zoom scales everything it
    // renders, including scrollFactor-0 objects, so the HUD has to live on its
    // own camera or it drifts off-screen whenever the view zooms in.
    this.uiCam = this.cameras.add(0, 0, VIEW_W, VIEW_H);
    this.uiCam.setName('ui');
    this.uiCam.setScroll(0, 0);

    this.worldObjects = [
      ...this.backdrop.objects,
      ...this.renderers.map((r) => r.root),
      ...this.projSprites,
      this.effects.container,
      ...this.debug.worldObjects,
    ];
    const uiObjects = [this.hud.container, ...this.debug.uiObjects];
    this.cameras.main.ignore(uiObjects);
    this.uiCam.ignore(this.worldObjects);

    this.hud.banner('READY', 60);

    // Leaving the tab should not bank up a huge catch-up burst.
    this.game.events.on(Phaser.Core.Events.BLUR, this.onBlur, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.BLUR, this.onBlur, this);
    });
  }

  private onBlur(): void {
    this.accumulator = 0;
    if (!this.paused && !this.finished) this.openPause();
  }

  // ------------------------------------------------------------------- pause

  private openPause(): void {
    if (this.paused) return;
    this.paused = true;
    const scrim = makeScrim(this);
    const title = bigTitle(this, 'PAUSED', 140, 40, '#eaf2ff');
    const hint = smallText(
      this,
      'ESC resumes · debug overlays stay available with F1 / F2',
      VIEW_W / 2,
      VIEW_H - 40,
      12,
      '#63748c',
    );
    const menu = new Menu(
      this,
      [
        { label: 'RESUME', onSelect: () => this.closePause() },
        {
          label: 'AUDIO',
          value: () => (session.muted ? 'MUTED' : 'ON'),
          onSelect: () => {
            session.muted = !session.muted;
            sfx.setMuted(session.muted);
          },
        },
        { label: 'RESTART MATCH', onSelect: () => this.restart() },
        { label: 'QUIT TO TITLE', onSelect: () => this.toTitle() },
      ],
      VIEW_W / 2,
      230,
      { size: 22, gap: 36 },
    );
    // Pause chrome is UI: keep it off the zoomed world camera.
    this.cameras.main.ignore([scrim, title, hint, menu.container]);
    this.pauseUi = { scrim, menu, extra: [title, hint] };
  }

  private closePause(): void {
    this.paused = false;
    if (this.pauseUi) {
      this.pauseUi.scrim.destroy();
      this.pauseUi.menu.destroy();
      for (const e of this.pauseUi.extra) e.destroy();
      this.pauseUi = undefined;
    }
    this.accumulator = 0;
    this.input$.reset();
  }

  private restart(): void {
    session.matchIndex++;
    this.scene.restart();
  }

  private toTitle(): void {
    this.scene.start('Title');
  }

  // -------------------------------------------------------------------- loop

  override update(_time: number, delta: number): void {
    const dt = Math.min(delta, 100) / 1000;
    const ui = this.input$.readUi();

    if (ui.toggleDebug) this.debug.toggleText();
    if (ui.toggleHitboxes) this.debug.toggleHitboxes();

    if (this.paused) {
      if (ui.up) this.pauseUi?.menu.move(-1);
      if (ui.down) this.pauseUi?.menu.move(1);
      if (ui.confirm) this.pauseUi?.menu.confirm();
      if (ui.pause) this.closePause();
      this.pauseUi?.menu.update();
      return;
    }

    if (ui.pause && !this.finished) {
      this.openPause();
      return;
    }

    // ---- fixed-step simulation ------------------------------------------
    this.accumulator += Math.min(delta, 100);
    let steps = 0;
    while (this.accumulator >= TICK_MS && steps < 6) {
      this.accumulator -= TICK_MS;
      steps++;
      this.stepSim();
    }
    // If we are hopelessly behind, drop the backlog rather than stuttering.
    if (this.accumulator > TICK_MS * 6) this.accumulator = 0;

    this.render(dt);
  }

  private stepSim(): void {
    const s = this.sim;

    let playerInput: InputFrame;
    if (session.mode === 'aiVsAi' && this.playerAi) {
      playerInput = this.playerAi.think(s.player, s.enemy, s.activeProjectiles(), ARENA_W, ARENA_H);
    } else {
      playerInput = this.input$.read();
    }

    const enemyInput =
      session.mode === 'training' && s.enemy.life > 0 && this.trainingIdle()
        ? emptyInput()
        : this.ai.think(s.enemy, s.player, s.activeProjectiles(), ARENA_W, ARENA_H);

    const wasPhase = s.phase;
    s.step(playerInput, enemyInput);

    if (wasPhase === MatchPhase.Intro && s.phase === MatchPhase.Fight) {
      this.hud.banner('FIGHT', 70);
    }

    this.consumeEvents();

    if (s.phase === MatchPhase.Over && !this.finished) {
      this.finished = true;
      session.lastOutcome = s.outcome;
      session.lastTimeLeft = s.secondsLeft;
      session.lastPlayerLife = s.player.life;
      session.lastEnemyLife = s.enemy.life;
      this.time.delayedCall(280, () => this.scene.start('Results'));
    }
  }

  /** Training keeps the rival passive until the player lands the first hit. */
  private trainingIdle(): boolean {
    return this.sim.enemy.life >= this.sim.enemy.def.gauges.maxLife;
  }

  private consumeEvents(): void {
    const s = this.sim;
    for (const ev of s.events) {
      switch (ev.t) {
        case 'fire': {
          const owner = this.byId(ev.ownerId);
          const tint = owner?.def.tint.thruster ?? 0xffffff;
          this.effects.muzzle(ev.x, ev.y, ev.angle, ev.kind, tint);
          if (ev.kind === ProjKind.Beam) sfx.beam();
          else if (ev.kind === ProjKind.Heavy) sfx.shootHeavy();
          else if (ev.kind === ProjKind.Missile) sfx.missile();
          else if (ev.kind !== ProjKind.Melee) sfx.shootLight();
          this.shake = Math.max(this.shake, ev.kind === ProjKind.Beam ? 3.2 : ev.kind === ProjKind.Heavy ? 1.8 : 0.5);
          break;
        }
        case 'hit': {
          const victim = this.byId(ev.victimId);
          const tint = victim?.def.tint.accent ?? 0xffd166;
          this.effects.hit(ev.x, ev.y, ev.kind, tint);
          const heavy = ev.kind === ProjKind.Melee || ev.kind === ProjKind.Beam || ev.kind === ProjKind.Heavy;
          if (heavy) sfx.heavyHit();
          else sfx.hit();
          this.shake = Math.max(this.shake, heavy ? 6.5 : 2.4);
          const idx = ev.victimId === s.player.id ? 0 : 1;
          this.renderers[idx].flashHit();
          break;
        }
        case 'guard':
          this.effects.guard(ev.x, ev.y, 0xc08cff);
          sfx.guard();
          this.shake = Math.max(this.shake, 1.6);
          break;
        case 'absorb':
          this.effects.absorb(ev.x, ev.y, 0x7ce7ff);
          sfx.absorb();
          break;
        case 'barrier': {
          const c = this.byId(ev.id);
          this.effects.barrier(ev.x, ev.y, c?.def.barrier.radius ?? 46, 0x8fe6ff);
          sfx.barrier();
          break;
        }
        case 'guardBreak':
          this.effects.guardBreak(ev.x, ev.y);
          sfx.guardBreak();
          this.shake = Math.max(this.shake, 8);
          break;
        case 'dash': {
          const c = this.byId(ev.id);
          this.effects.dash(ev.x, ev.y, ev.angle, c?.def.tint.thruster ?? 0x74d6ff);
          sfx.dash();
          break;
        }
        case 'melee': {
          const c = this.byId(ev.id);
          this.effects.melee(ev.x, ev.y, ev.angle, ev.stage, c?.def.tint.accent ?? 0xffffff);
          sfx.melee(ev.stage);
          break;
        }
        case 'saturation': {
          const c = this.byId(ev.id);
          if (c) this.effects.saturation(c.x, c.y, c.def.tint.thruster);
          sfx.saturation();
          this.shake = Math.max(this.shake, 7);
          if (ev.id === s.player.id) this.hud.banner('SATURATION', 46);
          break;
        }
        case 'modeCycle':
          sfx.modeCycle();
          break;
        case 'explode':
          this.effects.explode(ev.x, ev.y, ev.big, 0xffa24a);
          sfx.explode(ev.big);
          this.shake = Math.max(this.shake, ev.big ? 16 : 5);
          break;
        case 'ko':
          sfx.ko();
          this.hud.banner('K.O.', 110);
          break;
      }
    }
  }

  private byId(id: number): Combatant | undefined {
    return this.sim.combatants.find((c) => c.id === id);
  }

  // ------------------------------------------------------------------ render

  private render(dt: number): void {
    const s = this.sim;

    // ---- camera ----------------------------------------------------------
    const p = s.player;
    const e = s.enemy;
    const midX = (p.x + e.x) / 2;
    const midY = (p.y + e.y) / 2;
    const dist = Math.hypot(e.x - p.x, e.y - p.y);
    // Pull back as the pilots separate, so both stay framed.
    const targetZoom = clamp(1.34 - dist / 2400, 0.74, 1.34);
    const cam = this.cameras.main;
    cam.setZoom(Phaser.Math.Linear(cam.zoom, targetZoom, 0.06));

    const focusX = Phaser.Math.Linear(cam.midPoint.x, midX + (p.vx + e.vx) * 4, 0.11);
    const focusY = Phaser.Math.Linear(cam.midPoint.y, midY + (p.vy + e.vy) * 3, 0.11);
    cam.centerOn(focusX, focusY);

    if (this.shake > 0.05) {
      cam.shake(90, this.shake * 0.0007, true);
      this.shake *= 0.72;
    }

    // ---- backdrop --------------------------------------------------------
    this.backdrop.update(cam, dt);

    // ---- mechs -----------------------------------------------------------
    for (let i = 0; i < s.combatants.length; i++) {
      const c = s.combatants[i];
      const r = this.renderers[i];
      r.sync(c, c.x, c.y, dt);

      // Thruster plumes trail behind the chassis, opposite the travel direction.
      if (c.alive && c.thrust > 0.08) {
        for (const name of ['leftThruster', 'rightThruster']) {
          const w = r.partWorld(name);
          if (!w) continue;
          const speed = Math.hypot(c.vx, c.vy);
          const ang = speed > 0.2 ? Math.atan2(c.vy, c.vx) + Math.PI : c.aim + Math.PI;
          this.effects.thruster(w.x, w.y, ang, c.thrust, c.def.tint.thruster);
        }
      }

      // Sustained barrier bubble and saturation aura.
      if (c.invuln > 0) {
        this.effects.barrierHold(c.x, c.y, c.def.barrier.radius, 0x8fe6ff);
      }
      if (c.satActive && Math.random() < 0.5) {
        this.effects.satAura(c.x, c.y, c.def.tint.thruster);
      }

      // Death explosions keep going while the KO plays out.
      if (!c.alive && Math.random() < 0.16) {
        this.effects.explode(
          c.x + (Math.random() - 0.5) * 60,
          c.y + (Math.random() - 0.5) * 60,
          false,
          c.def.tint.accent,
        );
      }
    }

    // ---- projectiles -----------------------------------------------------
    const live = this.sim.projectiles.items;
    let si = 0;
    for (const pr of live) {
      if (!pr.active) continue;
      if (si >= this.projSprites.length) break;
      const img = this.projSprites[si++];
      const style = PROJ_STYLE[pr.kind] ?? PROJ_STYLE[ProjKind.Bullet];
      const owner = this.byId(pr.ownerId);
      const tint = owner?.def.tint.thruster ?? 0xffffff;

      img.setVisible(true);
      img.setTexture(style.tex);
      img.setPosition(pr.x, pr.y);
      img.setRotation(pr.angle);
      const fade = pr.kind === ProjKind.Beam ? clamp(pr.life / 12, 0.15, 1) : 1;
      img.setScale(style.scale, style.scale * style.yMul);
      img.setAlpha(fade);
      img.setTint(tint);

      // Trails: missiles smoke, everything else leaves a brief streak.
      if (style.trail > 0 && Math.random() < style.trail) {
        this.effects.thruster(
          pr.prevX,
          pr.prevY,
          pr.angle + Math.PI,
          pr.kind === ProjKind.Missile ? 0.4 : 0.22,
          tint,
        );
      }
    }
    for (let i = si; i < this.projSprites.length; i++) this.projSprites[i].setVisible(false);

    // ---- overlays --------------------------------------------------------
    this.effects.update(dt);
    this.hud.update(dt);
    this.debug.update(dt * 1000, (x, y) => ({ x, y }));
  }
}
