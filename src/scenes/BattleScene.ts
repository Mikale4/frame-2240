import Phaser from 'phaser';
import { ARENA_H, ARENA_W, TICK_MS, VIEW_H, VIEW_W } from '../core/GameConfig';
import { session } from '../core/Session';
import { MatchSim } from '../combat/MatchSim';
import { MECHS } from '../data/mechs';
import { RivalAI } from '../ai/RivalAI';
import { Rng } from '../core/Rng';
import { InputManager } from '../input/InputManager';
import { MechRenderer, PART_SCALE } from '../render/MechRenderer';
import { partTexture } from '../render/PartTexture';
import { Effects } from '../render/Effects';
import { Backdrop } from '../render/Backdrop';
import { GroundPlane } from '../render/GroundPlane';
import { TEX } from '../render/Textures';
import { Hud } from '../ui/Hud';
import { Menu, makeScrim, bigTitle, smallText } from '../ui/Menu';
import { DebugOverlay } from '../debug/DebugOverlay';
import { sfx } from '../audio/Sfx';
import { MatchPhase, ProjKind, SAT_MODE_NAMES, SatMode, emptyInput, type InputFrame } from '../combat/types';
import { ELEMENTS, type Element } from '../combat/Status';
import { DroneMode } from '../combat/Supporter';
import type { Combatant } from '../combat/Combatant';
import { clamp, wrapAngle } from '../core/MathUtil';
import { depthScaleAt, depthSortAt } from '../core/Depth';

/** Visual style per projectile kind. */
const PROJ_STYLE: Record<number, { tex: string; scale: number; yMul: number; trail: number }> = {
  [ProjKind.Bullet]: { tex: TEX.streak, scale: 0.34, yMul: 0.42, trail: 0.35 },
  [ProjKind.Heavy]: { tex: TEX.streak, scale: 0.72, yMul: 0.68, trail: 0.6 },
  [ProjKind.Beam]: { tex: TEX.streak, scale: 1.15, yMul: 0.5, trail: 0.9 },
  [ProjKind.Missile]: { tex: TEX.glow, scale: 0.3, yMul: 1, trail: 0.8 },
  [ProjKind.Melee]: { tex: TEX.glow, scale: 0.1, yMul: 1, trail: 0 },
};

/**
 * Beam-saber bloom geometry, in logical pixels along the blade from the
 * meleeWeapon pivot.
 *
 * From assets/sprites/mechs/manifest.json the melee weapon is 102 logical px
 * long with its pivot at the tile centre, which sits 10.5px behind the pommel:
 * hilt and emitter occupy the first ~25px and the lit blade runs from +15 out
 * to +91.5. The bloom is sized to that lit section and overshoots it slightly,
 * because fx_streak fades out at both ends.
 */
const BLADE_MID = 53;
const BLADE_GLOW_LEN = 88;
const BLADE_GLOW_THICK = 13;

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
  private ground!: GroundPlane;
  private renderers: MechRenderer[] = [];
  private projSprites: Phaser.GameObjects.Image[] = [];
  /** One beam-sword sprite per combatant, shown only while swinging. */
  private blades: Phaser.GameObjects.Image[] = [];
  /** One supporter drone sprite per combatant, plus its readiness ring. */
  private drones: Phaser.GameObjects.Image[] = [];
  private droneRings: Phaser.GameObjects.Graphics[] = [];

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
    this.shake = 0;
    // Phaser reuses the scene instance across restarts, so class-field
    // initialisers do NOT run again. Anything accumulated here must be reset
    // explicitly or a rematch would keep the previous match's destroyed
    // GameObjects alive in these collections.
    this.pauseUi = undefined;
    this.projSprites = [];
    this.blades = [];
    this.drones = [];
    this.droneRings = [];
    this.worldObjects = [];
    this.renderers = [];

    const playerDef = MECHS[session.playerMech];
    const enemyDef = MECHS[session.enemyMech];

    this.sim = new MatchSim({
      playerDef,
      enemyDef,
      seed: session.seed(),
      introTicks: 96,
      roundTicks: session.mode === 'training' ? 99 * 60 * 10 : undefined,
      dummy: session.mode === 'training',
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
    this.ground = new GroundPlane(this);
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

    for (let i = 0; i < 2; i++) {
      const blade = this.add.image(0, 0, TEX.streak);
      blade.setBlendMode(Phaser.BlendModes.ADD);
      blade.setOrigin(0.5, 0.5);
      blade.setVisible(false);
      this.blades.push(blade);
    }

    // Supporter drones. Drawn one layer under the mechs so a machine never
    // disappears behind its own escort.
    for (const def of [playerDef, enemyDef]) {
      const dt = partTexture(this, def.id, 'drone');
      const drone = this.add.image(0, 0, dt.key, dt.frame);
      drone.setOrigin(0.5, 0.5);
      drone.setScale(PART_SCALE);
      this.drones.push(drone);
      this.droneRings.push(this.add.graphics());
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
      ...this.ground.objects,
      ...this.renderers.map((r) => r.root),
      ...this.projSprites,
      ...this.blades,
      ...this.drones,
      ...this.droneRings,
      this.effects.container,
      ...this.debug.worldObjects,
    ];
    const uiObjects = [this.hud.container, ...this.debug.uiObjects];
    this.cameras.main.ignore(uiObjects);
    this.uiCam.ignore(this.worldObjects);

    this.hud.banner('READY', 60);
    sfx.matchReady();

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

    // In training the rival is a dummy: it never acts, no matter what you do to
    // it. Previously it woke up on the first hit, which is not a training mode.
    const enemyInput =
      session.mode === 'training'
        ? emptyInput()
        : this.ai.think(s.enemy, s.player, s.activeProjectiles(), ARENA_W, ARENA_H);

    const wasPhase = s.phase;
    s.step(playerInput, enemyInput);

    if (wasPhase === MatchPhase.Intro && s.phase === MatchPhase.Fight) {
      this.hud.banner('FIGHT', 70);
      sfx.matchFight();
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
          else if (ev.kind !== ProjKind.Melee) sfx.shootLight(owner?.def.id);
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
          sfx.melee(ev.stage, c?.def.meleeCue ?? 'blade');
          break;
        }
        case 'assist': {
          // The drone lights up and braces before the shot leaves it, so the
          // order reads as an order rather than as a shot from nowhere.
          const c = this.byId(ev.ownerId);
          this.effects.absorb(ev.x, ev.y, c?.def.tint.glow ?? 0x7ce7ff);
          // A drone firing on its own initiative happens every few seconds, so
          // it gets the quiet cue and no banner. Only a salvo the pilot demanded
          // is worth interrupting the screen for.
          if (ev.auto) {
            sfx.assistFire();
          } else {
            sfx.assist();
            if (ev.ownerId === s.player.id) this.hud.banner(c?.def.supporter.name ?? 'ASSIST', 34);
          }
          break;
        }
        case 'droneDeploy': {
          const c = this.byId(ev.ownerId);
          this.effects.dash(ev.x, ev.y, 0, c?.def.tint.thruster ?? 0x74d6ff);
          sfx.assist();
          if (ev.ownerId === s.player.id) {
            this.hud.banner(`${c?.def.supporter.name ?? 'DRONE'} DEPLOY`, 36);
          }
          break;
        }
        case 'droneRecall': {
          const c = this.byId(ev.ownerId);
          this.effects.guard(ev.x, ev.y, c?.def.tint.accent ?? 0x8494ad);
          sfx.droneRecall();
          if (ev.ownerId === s.player.id) {
            this.hud.banner(`${c?.def.supporter.name ?? 'DRONE'} RECALL`, 36);
          }
          break;
        }
        case 'droneHit': {
          const c = this.byId(ev.ownerId);
          this.effects.hit(ev.x, ev.y, ProjKind.Bullet, c?.def.tint.glow ?? 0xffd166);
          sfx.hit();
          break;
        }
        case 'droneDown': {
          const c = this.byId(ev.ownerId);
          // Losing a drone is permanent, so it is announced for both sides —
          // whoever shot it down has earned the news as much as its owner.
          this.hud.banner(`${c?.def.supporter.name ?? 'DRONE'} DOWN`, 60);
          this.shake = Math.max(this.shake, 6);
          break;
        }
        case 'status': {
          const d = ELEMENTS[ev.element as Element];
          if (d) {
            this.effects.saturation(ev.x, ev.y, d.tint);
            // Each element has its own cue; the name doubles as the cue suffix.
            sfx.status(d.name.toLowerCase());
            if (ev.victimId === s.enemy.id) this.hud.banner(d.name, 34);
          }
          break;
        }
        case 'assistDenied': {
          // Refusals have to be audible, or a dead button feels like a bug.
          this.effects.guard(ev.x, ev.y, 0x8494ad);
          sfx.assistDenied();
          break;
        }
        case 'saturation': {
          const c = this.byId(ev.id);
          if (c) {
            // Shield reads best in the mech's own glow, Shoot in its accent, and
            // Speed in its thruster colour — each borrows the palette entry the
            // player already associates with that part of the machine.
            const tint =
              ev.mode === SatMode.Shield
                ? c.def.tint.glow
                : ev.mode === SatMode.Shoot
                  ? c.def.tint.accent
                  : c.def.tint.thruster;
            this.effects.saturationBurst(c.x, c.y, ev.mode, tint, c.facing);
          }
          sfx.saturation();
          this.shake = Math.max(this.shake, 11);
          if (ev.id === s.player.id) {
            this.hud.banner(`${SAT_MODE_NAMES[ev.mode]} SATURATION`, 52);
          }
          break;
        }
        case 'satBurnout': {
          this.effects.satBurnout(ev.x, ev.y);
          sfx.satBurnout();
          this.shake = Math.max(this.shake, 5);
          if (ev.id === s.player.id) this.hud.banner('BURNOUT', 40);
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
        case 'takeoff': {
          const c = this.byId(ev.id);
          this.effects.dash(ev.x, ev.y + 24, Math.PI / 2, c?.def.tint.thruster ?? 0x74d6ff);
          sfx.takeoff();
          break;
        }
        case 'land': {
          const c = this.byId(ev.id);
          // Dust kicked sideways along the deck.
          for (const dir of [0, Math.PI]) {
            this.effects.thruster(ev.x, ev.y + 20, dir, 0.8, c?.def.tint.accent ?? 0xffd166);
          }
          this.effects.guard(ev.x, ev.y + 22, 0xbfa88a);
          sfx.land();
          this.shake = Math.max(this.shake, 2.4);
          break;
        }
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

  /**
   * Draws one supporter drone and its readiness ring.
   *
   * The ring is drawn on the drone rather than added as a sixth corner gauge,
   * which is what the 2005 reference did — its "sub shoot charge indicator" is a
   * bar sitting next to the supporter itself, not in the HUD (REFERENCE_AUDIT
   * 4c.1). Keeping it here also means the player's eye never has to leave the
   * fight to know whether the assist is up.
   */
  private drawDrone(i: number, c: Combatant): void {
    const sprite = this.drones[i];
    const ring = this.droneRings[i];
    const s = c.supporter;

    // The drone leaves with its machine, and a stowed or destroyed one is not on
    // screen at all — `visible` is the same predicate the simulation uses to
    // decide whether it can be shot, so what you see is exactly what you can hit.
    if (!c.alive || !s.visible) {
      sprite.setVisible(false);
      ring.setVisible(false);
      return;
    }

    const dz = depthScaleAt(s.y);
    sprite.setVisible(true);
    sprite.setPosition(s.x, s.y);
    // Modelled nose-along +x; mirror rather than spin past vertical so the
    // drone never flies upside down.
    sprite.setScale(PART_SCALE * dz * s.facing, PART_SCALE * dz);
    sprite.setRotation(s.facing > 0 ? s.aim : wrapAngle(Math.PI - s.aim));
    // A layer under the mechs, so an escort never hides its own machine.
    sprite.setDepth(depthSortAt(s.y, 18));

    // Thruster plume trailing the drone whenever it is working to keep up.
    const speed = Math.hypot(s.vx, s.vy);
    if (speed > 1.2 && Math.random() < 0.5) {
      const back = s.aim + Math.PI;
      this.effects.thruster(
        s.x + Math.cos(back) * 16 * dz,
        s.y + Math.sin(back) * 16 * dz,
        Math.atan2(s.vy, s.vx) + Math.PI,
        Math.min(1, speed / 8),
        c.def.tint.thruster,
      );
    }

    // Bars drawn on the drone itself.
    //
    // Bars rather than rings, and here rather than in the corner, because that is
    // what the reference did: its "sub shoot charge indicator" is a short bar
    // sitting beside the supporter. A ring read as noise around the chassis at
    // gameplay distance; a bar is the same shape as every other gauge the player
    // already knows.
    //
    // Two of them now that the drone can be destroyed. Hit points go on top, in
    // the same red-to-amber the chassis bar uses, because it is the one that
    // matters permanently — the charge bar below it refills, this one does not.
    // Two things gate a volley: the drone's own cooldown (fast) and the sub
    // charge economy (slow). The lower bar shows whichever the player is
    // actually waiting on, or it reads full while nothing happens.
    const ready = c.subCharges > 0 && s.ready;
    const frac = ready
      ? 1
      : c.subCharges > 0
        ? s.readyFraction
        : clamp(c.subRecharge / Math.max(1, c.def.subRechargeTicks), 0, 1);
    const w = 26 * dz;
    const h = 3 * dz;
    const hpY = s.y + 20 * dz;
    const by = hpY + h + 2 * dz;

    ring.setVisible(true);
    ring.setDepth(depthSortAt(s.y, 19));
    ring.clear();

    // Hit points.
    const life = s.lifeFraction;
    ring.fillStyle(0x0a0f18, 0.75);
    ring.fillRect(s.x - w / 2 - 1, hpY - 1, w + 2, h + 2);
    ring.fillStyle(0x39121a, 0.9);
    ring.fillRect(s.x - w / 2, hpY, w, h);
    ring.fillStyle(life > 0.5 ? 0x6fe08a : life > 0.25 ? 0xffc24a : 0xff5a4a, 0.95);
    ring.fillRect(s.x - w / 2, hpY, w * life, h);

    // Charge.
    ring.fillStyle(0x0a0f18, 0.75);
    ring.fillRect(s.x - w / 2 - 1, by - 1, w + 2, h + 2);
    if (ready) {
      ring.fillStyle(c.def.tint.glow, 0.95);
      ring.fillRect(s.x - w / 2, by, w, h);
    } else {
      ring.fillStyle(0x2b3346, 0.9);
      ring.fillRect(s.x - w / 2, by, w, h);
      ring.fillStyle(c.def.tint.accent, 0.95);
      ring.fillRect(s.x - w / 2, by, w * frac, h);
    }

    // Launching and recalling fade the drone, so a transit reads as a transit
    // rather than as the escort teleporting between two stations.
    const t = s.mode === DroneMode.Deploying || s.mode === DroneMode.Recalling;
    sprite.setAlpha(t ? 0.55 : 1);
    ring.setAlpha(t ? 0.55 : 1);
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
    this.ground.update(s.combatants);

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

      // ---- beam sword -----------------------------------------------
      // Melee is a sword, not the rifle. Stow the gun for the swing and extend
      // a blade from the weapon hand: it ignites through startup and is at full
      // length while the hit is live.
      // The saber is a real part; the additive sprite is only a bloom layered
      // over the modelled blade so it glows rather than being the blade itself.
      const bloom = this.blades[i];
      const drawn = c.alive && c.bladeTimer > 0;
      r.setPartVisible('meleeWeapon', drawn);
      r.setPartVisible('mainWeapon', !drawn);

      if (drawn) {
        // Anchor the bloom to the modelled weapon's own transform, not to the
        // aim vector: the part carries bank and any authored offset too, and
        // reading it back means the glow cannot drift off the blade again.
        const hand = r.partWorld('meleeWeapon');
        const ax = hand ? hand.angle : c.aim;
        const dz = hand ? hand.scale : depthScaleAt(c.y);
        const hx = hand ? hand.x : c.x;
        const hy = hand ? hand.y : c.y;

        const mid = BLADE_MID * dz;
        bloom.setVisible(true);
        bloom.setPosition(hx + Math.cos(ax) * mid, hy + Math.sin(ax) * mid);
        bloom.setRotation(ax);
        // fx_streak is 128x24; scale it to the lit section of the blade.
        bloom.setScale((BLADE_GLOW_LEN / 128) * dz, (BLADE_GLOW_THICK / 24) * dz);
        bloom.setTint(c.def.tint.glow);
        bloom.setAlpha(0.75);
        bloom.setDepth(depthSortAt(c.y, 31));
        if (Math.random() < 0.5) {
          const tpos = (Math.random() - 0.5) * BLADE_GLOW_LEN * dz;
          this.effects.thruster(
            bloom.x + Math.cos(ax) * tpos,
            bloom.y + Math.sin(ax) * tpos,
            ax + Math.PI / 2,
            0.3,
            c.def.tint.glow,
          );
        }
      } else {
        bloom.setVisible(false);
      }

      // ---- supporter drone -------------------------------------------
      this.drawDrone(i, c);

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
      // Shots take the same depth scale as the mechs so they sit in the world.
      const d = depthScaleAt(pr.y);
      img.setScale(style.scale * d, style.scale * style.yMul * d);
      img.setAlpha(fade);
      img.setTint(tint);
      img.setDepth(depthSortAt(pr.y, 40));

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
