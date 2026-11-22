import Phaser from 'phaser';
import * as THREE from 'three';
import { TICK_MS, VIEW_H, VIEW_W } from '../core/GameConfig';
import { DIFFICULTY_COUNT, DIFFICULTY_NAMES, Difficulty, modeLabel, session, type MatchMode } from '../core/Session';
import { HEALTH_STEPS } from '../core/TrainingSettings';
import { MECHS } from '../data/mechs';
import { InputManager } from '../input/InputManager';
import {
  OBSTACLES,
  OrbitAct,
  OrbitSim,
  PX,
  TRANSFORM_TICKS,
  hurtRadius,
  type OrbitEvent,
  type OrbitFighter,
} from '../orbit/OrbitSim';
import { OrbitAI } from '../orbit/OrbitAI';
import { accounts } from '../account/Accounts';
import { recordMatch } from '../account/unlocks';
import { OrbitView3D } from '../voxel/OrbitView3D';
import { VoxelMech, type SwingPose } from '../voxel/VoxelMech';
import type { Shot3 } from '../voxel/VoxelProjectiles';
import { voxelStage } from '../voxel/VoxelStage';
import { OrbitHud } from '../ui/OrbitHud';
import { Menu, bigTitle, makeScrim, smallText, type MenuItem } from '../ui/Menu';
import { audioMenuItems } from '../ui/AudioOptions';
import { sfx } from '../audio/Sfx';
import { music } from '../audio/Music';
import { pickBattleCue } from '../audio/MusicBank';
import { thrusterFxFor } from '../render/ThrusterProfiles';
import {
  swingArcAngle,
  swingGrip,
  swingLean,
  swingLift,
  swingReach,
  swingWeaponSpin,
} from '../combat/Combatant';
import { ProjKind, SAT_MODE_NAMES } from '../combat/types';

const smooth = (t: number): number => t * t * (3 - 2 * t);

/**
 * FREE ORBIT — the fight in three dimensions.
 *
 * A third-person lock-on mecha fighter in the CATHEDRAL YARD: the deck, the
 * gantry and the air over all of it, fought from over the pilot's shoulder. The
 * rules live in `orbit/OrbitSim.ts` and the rival in `orbit/OrbitAI.ts`; this
 * scene only reads the pad, steps the simulation at the game's fixed 60 Hz, and
 * draws what happened — the same voxel machines, effects and sounds the side-on
 * fight uses, posed in a volume instead of on a plane.
 */
export class OrbitScene extends Phaser.Scene {
  private sim!: OrbitSim;
  private ai!: OrbitAI;
  private input$!: InputManager;
  private view!: OrbitView3D;
  private hud!: OrbitHud;
  private mechs: VoxelMech[] = [];
  /** Displayed transformation blend per side, eased toward the simulation's. */
  private blend = [0, 0];
  private accumulator = 0;
  private shake = 0;
  private paused = false;
  private finished = false;
  private fought = false;
  private pauseUi?: { scrim: Phaser.GameObjects.GameObject; menu: Menu; extra: Phaser.GameObjects.GameObject[] };
  private readonly nozzle = new THREE.Vector3();
  private readonly plumeDir = new THREE.Vector3();
  private readonly shots: Shot3[] = [];
  private readonly screen = { x: 0, y: 0 };
  /** The lens: over the shoulder, or a broadcast angle (debug and inspection). */
  camMode: 'chase' | 'spectate' | 'inspect' = 'chase';
  /** The inspection lens: a turntable around the player. */
  inspect = { yaw: 1.2, dist: 6, lift: 1.2 };
  /** Debug: the rival stands still, for inspecting poses. */
  rivalIdle = false;
  /** The mode being fought: the session's, or VERSUS for a campaign flight. */
  private mode: MatchMode = 'vsCpu';
  /** CPU vs CPU only: the brain flying the player's slot. */
  private playerAi: OrbitAI | null = null;

  constructor() {
    super('Orbit');
  }

  create(): void {
    const playerDef = MECHS[session.playerMech] ?? MECHS.halcyon;
    const enemyDef = MECHS[session.enemyMech] ?? MECHS.nocturne;
    const seed = session.seed();
    // A campaign flight is always a straight versus fight.
    this.mode = session.campaignFight ? 'vsCpu' : session.mode;
    const training = this.mode === 'training';
    this.sim = new OrbitSim({ playerDef, enemyDef, seed, endless: training });
    this.ai = new OrbitAI(
      1,
      training ? (session.training.p2Difficulty as Difficulty) : session.enemyDifficulty,
      this.sim.enemy,
      seed ^ 0x5a5a,
    );
    // CPU vs CPU: the player's slot is flown by its own rival brain.
    this.playerAi = this.mode === 'aiVsAi' ? new OrbitAI(0, session.playerDifficulty, this.sim.player, seed ^ 0x2545) : null;
    if (training) this.sim.player.life = this.sim.player.def.gauges.maxLife * session.training.health;
    this.blend = [0, 0];
    this.accumulator = 0;
    this.shake = 0;
    this.paused = false;
    this.finished = false;
    this.fought = false;
    this.pauseUi = undefined;
    // Phaser keeps one instance per scene key and only re-runs `create`, so
    // field initialisers do not reset a restarted match.
    // CPU vs CPU is watched, not flown: a broadcast angle on both machines.
    this.camMode = this.mode === 'aiVsAi' ? 'spectate' : 'chase';
    this.rivalIdle = false;

    this.input$ = new InputManager(this);
    this.input$.reset();

    this.view = new OrbitView3D();
    this.view.solid = (x, y, z) =>
      OBSTACLES.some(
        (b) => x > b.min.x - 0.4 && x < b.max.x + 0.4 && y > b.min.y - 0.4 && y < b.max.y + 0.4 && z > b.min.z - 0.4 && z < b.max.z + 0.4,
      );
    voxelStage().setView(this.view);
    this.mechs = [new VoxelMech(playerDef), new VoxelMech(enemyDef)];
    for (const m of this.mechs) this.view.mechs.add(m.root);

    this.hud = new OrbitHud(this, this.sim);
    this.hud.setTag(modeLabel(this.mode, true));
    if (this.playerAi) this.hud.spectating();
    this.hud.showBanner('READY', 1.4, '#9fe0ff');
    sfx.matchReady();

    music.duck(false);
    music.play(
      pickBattleCue(
        { mode: session.mode, playerMech: session.playerMech, enemyMech: session.enemyMech, arena: session.arena },
        Math.random,
      ),
    );

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const m of this.mechs) m.destroy();
      this.mechs = [];
      this.view.dispose();
      const stage = voxelStage();
      if (stage.active === this.view) stage.setView(null);
      this.hud.destroy();
      music.duck(false);
    });
    this.game.events.on(Phaser.Core.Events.BLUR, this.onBlur, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off(Phaser.Core.Events.BLUR, this.onBlur, this));

    // Debug handle, as the side-on fight has one.
    (window as unknown as { __BSR_ORBIT__?: OrbitScene }).__BSR_ORBIT__ = this;
  }

  /** The window went to the back: stop the fight rather than lose it. */
  private onBlur(): void {
    this.accumulator = 0;
    if (!this.finished && !this.paused) this.openPause();
  }

  // ------------------------------------------------------------------ loop

  override update(_time: number, delta: number): void {
    const dt = Math.min(delta, 100) / 1000;
    const ui = this.input$.readUi();
    if (this.paused) {
      if (ui.up) this.pauseUi?.menu.move(-1);
      if (ui.down) this.pauseUi?.menu.move(1);
      if (ui.left) this.pauseUi?.menu.adjust(-1);
      if (ui.right) this.pauseUi?.menu.adjust(1);
      if (ui.confirm) this.pauseUi?.menu.confirm();
      if (ui.pause) this.closePause();
      this.pauseUi?.menu.update();
    } else {
      if (ui.pause && !this.finished) {
        this.openPause();
      } else {
        this.accumulator += Math.min(delta, 100);
        let steps = 0;
        while (this.accumulator >= TICK_MS && steps < 6) {
          this.accumulator -= TICK_MS;
          steps++;
          this.tick();
        }
      }
    }
    this.draw(dt);
    const stage = voxelStage();
    if (stage.active === this.view) stage.render();
  }

  private tick(): void {
    const s = this.sim;
    const p0 = this.finished ? NONE : this.playerAi ? this.playerAi.think(s) : this.input$.read();
    const dummy = this.mode === 'training' && session.training.p2 === 'dummy';
    const p1 = this.rivalIdle || dummy ? NONE : this.ai.think(s);
    const before = s.phase;
    s.step(p0, p1);
    if (this.mode === 'training') this.trainingRules();
    if (before === 'intro' && s.phase === 'fight' && !this.fought) {
      this.fought = true;
      this.hud.showBanner('FIGHT', 0.9, '#ffd166');
      sfx.matchFight();
    }
    for (const e of s.events) this.onEvent(e);
    if (s.phase === 'over' && !this.finished) {
      this.finished = true;
      const ko = s.fighters.some((f) => f.life <= 0);
      const text =
        s.outcome === 'draw' ? 'DRAW' : ko ? 'K.O.' : 'TIME';
      this.hud.showBanner(text, 2.2, s.outcome === 'playerWin' ? '#9fe0ff' : s.outcome === 'enemyWin' ? '#ff6a7a' : '#ffffff');
      session.lastOutcome = s.outcome;
      session.lastAward = recordMatch(accounts(), session.mode, session.enemyMech, session.enemyDifficulty, s.outcome);
      session.lastTimeLeft = s.secondsLeft;
      session.lastPlayerLife = Math.max(0, s.player.life);
      session.lastEnemyLife = Math.max(0, s.enemy.life);
      if (session.campaignFight) {
        session.campaignFight.result = s.outcome === 'playerWin' ? 'win' : 'lose';
        this.time.delayedCall(2600, () => {
          this.scene.wake('Campaign');
          this.scene.stop();
        });
      } else this.time.delayedCall(2600, () => this.scene.start('Results'));
    }
  }

  /**
   * Training's rules, after every tick: nobody is knocked out (a machine at
   * zero is refilled), and Saturation stays charged if the switch says so.
   */
  private trainingRules(): void {
    for (const f of this.sim.fighters) {
      if (f.life <= 0) {
        f.life = f.def.gauges.maxLife;
        this.hud.showBanner(f.id === 0 ? 'RESET' : 'DOWN · RESET', 0.8, '#9fe0ff');
      }
    }
    if (session.training.infiniteSat) {
      const p = this.sim.player;
      if (!p.satActive) p.sat = p.def.gauges.maxSaturation;
    }
  }

  /** Training: both machines back to their marks, full gauges. */
  private resetPositions(): void {
    session.matchIndex++;
    this.scene.restart();
  }

  // --------------------------------------------------------------- events

  private tintOf(id: number): number {
    return this.sim.fighters[id]?.def.tint.glow ?? 0xffffff;
  }

  private onEvent(e: OrbitEvent): void {
    const fx = this.view.fx;
    switch (e.t) {
      case 'fire': {
        const k = e.kind === ProjKind.Heavy || e.kind === ProjKind.Beam ? 1.6 : 1;
        fx.muzzle3(e.pos.x, e.pos.y, e.pos.z, [e.dir.x, e.dir.y, e.dir.z], this.tintOf(e.owner), k);
        if (e.kind === ProjKind.Heavy) sfx.shootHeavy();
        else if (e.kind === ProjKind.Beam) sfx.beam();
        else if (e.kind === ProjKind.Missile) sfx.missile();
        else sfx.shootLight(this.sim.fighters[e.owner].def.id);
        break;
      }
      case 'hit': {
        const big = e.kind === ProjKind.Melee || e.kind === ProjKind.Heavy || e.kind === ProjKind.Beam;
        fx.impact3(e.pos.x, e.pos.y, e.pos.z, this.tintOf(e.owner), big ? 1.6 : 1);
        this.mechs[e.victim]?.flashHit();
        if (big) sfx.heavyHit();
        else sfx.hit();
        this.shake = Math.max(this.shake, big ? 9 : 4) * (e.victim === 0 ? 1.4 : 1);
        break;
      }
      case 'guard':
        fx.ring(e.pos.x, e.pos.y, e.pos.z, 0.6, 1.5, this.sim.fighters[e.victim].def.tint.glow, 0.22);
        fx.star(e.pos.x, e.pos.y, e.pos.z, 1.1, this.sim.fighters[e.victim].def.tint.glow, 0.12);
        sfx.guard();
        break;
      case 'absorb':
        fx.ring(e.pos.x, e.pos.y, e.pos.z, 0.2, 0.8, this.tintOf(e.victim), 0.2);
        sfx.absorb();
        break;
      case 'burst': {
        const t = this.tintOf(e.id);
        fx.ring(e.pos.x, e.pos.y, e.pos.z, 0.8, 2.4, t, 0.32, 0.95);
        fx.ring(e.pos.x, e.pos.y, e.pos.z, 0.4, 1.6, 0xffffff, 0.2, 0.6);
        fx.star(e.pos.x, e.pos.y, e.pos.z, 2.6, t, 0.18);
        fx.burst(e.pos.x, e.pos.y, e.pos.z, { n: 14, speed: 7, life: 0.35, size: 0.07, color: [t, 0xffffff], gravity: 0, drag: 0.6 });
        sfx.barrier();
        break;
      }
      case 'guardBreak':
        fx.star(e.pos.x, e.pos.y, e.pos.z, 3.4, 0xffffff, 0.22);
        fx.ring(e.pos.x, e.pos.y, e.pos.z, 0.4, 3.2, 0xffe08a, 0.4);
        fx.burst(e.pos.x, e.pos.y, e.pos.z, { n: 26, speed: 12, life: 0.6, size: 0.12, color: [0xffe08a, 0xffffff, 0xc08cff], gravity: 18 });
        sfx.guardBreak();
        if (e.id === 1) this.hud.showBanner('GUARD BREAK', 0.9, '#ffe08a');
        break;
      case 'repel':
        fx.ring(e.pos.x, e.pos.y, e.pos.z, 0.5, 3, this.tintOf(e.id), 0.35);
        sfx.guard();
        if (e.id === 0) this.hud.showBanner('REPEL', 0.8, '#9fe0ff');
        break;
      case 'dash':
        fx.ring(e.pos.x, e.pos.y, e.pos.z, 0.3, 1.6, this.sim.fighters[e.id].def.tint.thruster, 0.25, 0.7);
        fx.burst(e.pos.x, e.pos.y, e.pos.z, {
          n: 14,
          speed: 10,
          dir: [-e.dir.x, -e.dir.y, -e.dir.z],
          spread: 0.35,
          life: 0.3,
          size: 0.08,
          color: [0xffffff, this.sim.fighters[e.id].def.tint.thruster],
          gravity: 0,
          drag: 0.5,
        });
        sfx.dash();
        break;
      case 'melee': {
        const f = this.sim.fighters[e.id];
        const yaw = f.yaw;
        const ahead = 1.2;
        const x = e.pos.x + e.dir.x * ahead;
        const y = e.pos.y + e.dir.y * ahead + 0.3;
        const z = e.pos.z + e.dir.z * ahead;
        const a = (e.stage % 2 === 0 ? -0.6 : 0.6) + (e.stage * 0.9);
        fx.slash3(x, y, z, yaw, a, 1.1 + e.stage * 0.12, f.def.tint.glow, 0.17);
        fx.slash3(x, y, z, yaw, a, 0.95 + e.stage * 0.1, 0xffffff, 0.11);
        sfx.melee(e.stage, f.def.meleeCue ?? 'blade');
        break;
      }
      case 'salvo':
        sfx.missile();
        break;
      case 'saturation': {
        const f = this.sim.fighters[e.id];
        const t = f.def.tint.thruster;
        fx.star(f.pos.x, f.pos.y, f.pos.z, 5, 0xffffff, 0.3);
        fx.ring(f.pos.x, f.pos.y, f.pos.z, 0.6, 6, t, 0.55);
        fx.burst(f.pos.x, f.pos.y, f.pos.z, { n: 40, speed: 12, spread: 1.1, life: 0.7, size: 0.1, color: [t, 0xffffff], gravity: 1 });
        sfx.saturation();
        this.hud.showBanner(`${e.id === 0 ? '' : 'RIVAL '}SATURATION · ${SAT_MODE_NAMES[e.mode]}`, 1.1, e.id === 0 ? '#ffd166' : '#ff8a8a');
        break;
      }
      case 'burnout':
        fx.burst(e.pos.x, e.pos.y, e.pos.z, { n: 16, speed: 9, life: 0.5, size: 0.07, color: [0xff7a2a, 0xffd166, 0xffffff], gravity: 14 });
        sfx.satBurnout();
        break;
      case 'modeCycle':
        if (e.id === 0) sfx.modeCycle();
        break;
      case 'transform': {
        const f = this.sim.fighters[e.id];
        fx.ring(e.pos.x, e.pos.y, e.pos.z, 0.6, 2.6, f.def.tint.glow, 0.35, 0.8);
        fx.burst(e.pos.x, e.pos.y, e.pos.z, { n: 18, speed: 6, life: 0.4, size: 0.07, color: [f.def.tint.glow, 0xffffff], gravity: 0, drag: 0.6 });
        sfx.meleeIgnite();
        break;
      }
      case 'transformed': {
        const f = this.sim.fighters[e.id];
        fx.star(e.pos.x, e.pos.y, e.pos.z, 1.8, f.def.tint.glow, 0.14);
        if (e.form === 'mobile') sfx.takeoff();
        break;
      }
      case 'land':
        if (e.id === 0) sfx.land();
        break;
      case 'knockdown':
        fx.star(e.pos.x, e.pos.y, e.pos.z, 2.6, 0xffffff, 0.2);
        fx.ring(e.pos.x, e.pos.y, e.pos.z, 0.4, 2.6, 0xffd166, 0.3);
        sfx.heavyHit();
        this.shake = Math.max(this.shake, 10);
        break;
      case 'ko': {
        const f = this.sim.fighters[e.id];
        fx.star(e.pos.x, e.pos.y, e.pos.z, 5.4, 0xfff1c0, 0.2);
        fx.ring(e.pos.x, e.pos.y, e.pos.z, 0.4, 5.4, 0xffb066, 0.4, 0.8);
        fx.burst(e.pos.x, e.pos.y, e.pos.z, { n: 46, speed: 14, life: 0.7, size: 0.16, sizeEnd: 0.05, color: [0xffffff, 0xffd166, 0xff8a3a, f.def.tint.glow], colorEnd: 0x5a1a08, gravity: 3, drag: 0.7 });
        fx.burst(e.pos.x, e.pos.y, e.pos.z, { n: 20, speed: 3, dir: [0, 1, 0], spread: 0.9, life: 1.6, size: 0.4, sizeEnd: 0.8, color: [0x2a2c30, 0x3d3f45, 0x1c1d20], lit: true, gravity: -2.5, drag: 0.5, floor: false });
        sfx.explode(true);
        sfx.ko();
        this.shake = 16;
        break;
      }
      default:
        break;
    }
  }

  // ----------------------------------------------------------------- draw

  /** The swing pose of a running sword sequence, side-on convention. */
  private swingOf(f: OrbitFighter): SwingPose | null {
    const ml = f.ml;
    if (!ml) return null;
    const arc = f.def.meleeLock.arc;
    const p = f.def.meleeLock;
    const at = (t: number, i: number): SwingPose => ({
      spin: swingArcAngle(arc, t, i),
      weaponSpin: swingWeaponSpin(arc, t, i),
      lean: swingLean(arc, t, i),
      reach: swingReach(arc, t, i),
      lift: swingLift(arc, t, i),
      grip: swingGrip(arc, t),
    });
    if (ml.phase === 'close') {
      const r = Math.min(1, ml.timer / 8);
      const s = at(0, ml.hitIndex);
      return { spin: s.spin * r, weaponSpin: s.weaponSpin * r, lean: s.lean * r, reach: s.reach * r, lift: s.lift * r, grip: s.grip * r };
    }
    if (ml.phase === 'gap') {
      const g = Math.min(1, ml.timer / Math.max(1, p.gap));
      const a = at(1, ml.hitIndex);
      const b = at(0, ml.hitIndex + 1);
      const l = (u: number, v: number): number => u + (v - u) * g;
      return { spin: l(a.spin, b.spin), weaponSpin: l(a.weaponSpin, b.weaponSpin), lean: l(a.lean, b.lean), reach: l(a.reach, b.reach), lift: l(a.lift, b.lift), grip: Math.max(a.grip, b.grip) };
    }
    return at(ml.hitTimer / Math.max(1, p.swing), ml.hitIndex);
  }

  /** The transformation's progress toward mobile form, 0..1. */
  private mobileTarget(f: OrbitFighter): number {
    if (f.transformTicks > 0) {
      const t = 1 - f.transformTicks / TRANSFORM_TICKS;
      return f.form === 'mech' ? t : 1 - t;
    }
    return f.form === 'mobile' ? 1 : 0;
  }

  private draw(dt: number): void {
    const s = this.sim;
    const view = this.view;
    view.fx.beginFrame();
    const me = s.player;
    const foe = s.enemy;

    for (let i = 0; i < 2; i++) {
      const f = s.fighters[i];
      const other = s.fighters[1 - i];
      const m = this.mechs[i];
      const want = this.mobileTarget(f);
      // Eased toward the simulation so a knock out of mobile form is a snap
      // back, not a teleport; a transformation already moves at its own rate.
      this.blend[i] += (want - this.blend[i]) * (f.transformTicks > 0 ? 1 : Math.min(1, dt * 14));
      const b = this.blend[i];
      const fwd = { x: Math.cos(f.yaw), z: -Math.sin(f.yaw) };
      const along = f.vel.x * fwd.x + f.vel.z * fwd.z;
      const hz = Math.hypot(f.vel.x, f.vel.z);
      const dx = other.pos.x - f.pos.x;
      const dz = other.pos.z - f.pos.z;
      const aim = Math.atan2(other.pos.y - f.pos.y, Math.max(0.5, Math.hypot(dx, dz)));
      const transforming = f.transformTicks > 0;
      const prog = transforming ? 1 - f.transformTicks / TRANSFORM_TICKS : 0;
      const knocked = f.act === OrbitAct.Knockdown;
      m.pose3(
        {
          x: f.pos.x,
          y: f.pos.y,
          z: f.pos.z,
          yaw: f.yaw,
          aim: Math.max(-1.2, Math.min(1.2, aim)),
          tilt: Math.max(-0.35, Math.min(0.5, along * 2.4)) + (knocked ? -0.9 : 0),
          roll: f.bank * (0.6 + b * 0.6),
          flourish: transforming ? Math.PI * 2 * smooth(prog) : knocked ? (s.tick * 0.25) % (Math.PI * 2) : 0,
          mobile: b,
          transforming,
          pitch: f.pitch,
          thrust: f.thrust,
          walkPhase: f.walk,
          stride: f.grounded ? Math.min(1, hz * 7) : 0,
          legSwing: f.grounded ? 0 : Math.max(-0.5, Math.min(0.5, -along * 2)) + Math.sin(f.bob * 2) * 0.05,
          swing: this.swingOf(f),
          hitstop: f.hitstop > 0,
          bob: f.bob * 3,
          alive: f.act !== OrbitAct.Down,
          satActive: f.satActive,
        },
        dt,
      );
      // One weapon in the hand at a time, as in the side-on fight.
      const sword = f.ml !== null && b < 0.5;
      m.setPartVisible('meleeWeapon', sword);
      m.setPartVisible('meleeEnergy', sword);
      m.setPartVisible('meleeArc', sword);
      m.setPartVisible('mainWeapon', !sword);

      // Plumes: aft in mobile form, against travel (or down) as a mech.
      if (f.act !== OrbitAct.Down && f.thrust > 0.08) {
        if (b > 0.5) {
          const c = Math.cos(f.pitch);
          this.plumeDir.set(-Math.cos(f.yaw) * c, -Math.sin(f.pitch), Math.sin(f.yaw) * c);
        } else if (hz > 0.04) {
          this.plumeDir.set(-f.vel.x, -Math.max(0.02, f.vel.y) - 0.04, -f.vel.z);
        } else {
          this.plumeDir.set(-fwd.x * 0.3, -1, -fwd.z * 0.3);
        }
        for (const name of ['leftThruster', 'rightThruster']) {
          const w = m.partWorld3(name, this.nozzle);
          if (!w) continue;
          // Smaller as a craft: the engines sit at the stern, nearest the chase
          // lens, and full-size plumes there fill the screen.
          const size = f.def.rig.scale * (b > 0.5 ? 0.6 : 1);
          view.fx.plume3(w, this.plumeDir, f.thrust, f.def.tint.thruster, size, thrusterFxFor(f.def.faction));
        }
      }
      // Guard shell, and a saturation shimmer.
      if (f.guarding) view.fx.shell3(f.pos.x, f.pos.y, f.pos.z, hurtRadius(f) * 1.5, f.def.tint.glow);
      if (f.satActive && Math.random() < 0.5) {
        const a = Math.random() * Math.PI * 2;
        view.fx.burst(f.pos.x + Math.cos(a) * 0.9, f.pos.y - 0.3, f.pos.z + Math.sin(a) * 0.9, {
          n: 1, speed: 1.6, dir: [0, 1, 0], spread: 0.2, life: 0.6, size: 0.07,
          color: [f.def.tint.thruster, 0xffffff], gravity: -1.5, drag: 0.3, floor: false,
        });
      }
      // Knocked-down machines trail smoke.
      if (knocked && Math.random() < 0.6) {
        view.fx.burst(f.pos.x, f.pos.y, f.pos.z, {
          n: 1, speed: 1, dir: [0, 1, 0], spread: 0.4, life: 0.8, size: 0.18, sizeEnd: 0.35,
          color: [0x2a2c30, 0x3d3f45], lit: true, gravity: -2, drag: 0.5, floor: false,
        });
      }
    }

    // ---- shots ----------------------------------------------------------
    this.shots.length = 0;
    for (const p of s.projectiles) {
      if (!p.active) continue;
      const l = Math.hypot(p.vel.x, p.vel.y, p.vel.z) || 1;
      this.shots.push({
        x: p.pos.x,
        y: p.pos.y,
        z: p.pos.z,
        dx: p.vel.x / l,
        dy: p.vel.y / l,
        dz: p.vel.z / l,
        family: p.family,
        kind: p.kind,
        visualScale: p.visualScale,
        age: p.age,
        life: p.life,
        owner: p.owner,
      });
    }
    view.projectiles.draw3(this.shots, (o) => this.tintOf(o), view.camera, view.fx);

    // ---- camera -------------------------------------------------------------
    const b0 = this.blend[0];
    const nose = OrbitSim.nose(me);
    const height = me.def.rig.chassisHeight * me.def.rig.scale * PX * 0.5;
    if (this.camMode === 'spectate') view.spectate(me.pos, foe.pos, this.shake, dt);
    else if (this.camMode === 'inspect') view.inspect(me.pos, this.inspect.yaw, this.inspect.dist, this.inspect.lift, dt);
    else view.chase(me.pos, foe.pos, b0, nose, height, this.shake, dt);
    if (this.shake > 0.05) this.shake *= Math.exp(-dt * 9);
    view.fx.update(dt);

    // ---- HUD ----------------------------------------------------------------
    const aimAt = { x: foe.pos.x, y: foe.pos.y + 0.2, z: foe.pos.z };
    const on = view.project(aimAt, this.screen);
    const inFrame = on && this.screen.x > 10 && this.screen.x < VIEW_W - 10 && this.screen.y > 10 && this.screen.y < VIEW_H - 10;
    const dist = Math.hypot(foe.pos.x - me.pos.x, foe.pos.y - me.pos.y, foe.pos.z - me.pos.z);
    const reach = me.def.meleeLock.acquireRange * PX;
    if (!on) {
      // Behind the lens: mirror the projection so the arrow points the right way.
      this.screen.x = VIEW_W - this.screen.x;
      this.screen.y = VIEW_H - this.screen.y;
    }
    this.hud.update(s, this.screen, inFrame, dist, dist <= reach && me.form === 'mech', dt);
  }

  // ---------------------------------------------------------------- pause

  private openPause(): void {
    if (this.paused) return;
    this.paused = true;
    music.duck(true);
    this.hud.hideHint();
    const scrim = makeScrim(this);
    const training = this.mode === 'training';
    const title = bigTitle(this, training ? 'TRAINING' : 'PAUSED', 120, 40, '#eaf2ff');
    const sub = smallText(this, modeLabel(this.mode, true), VIEW_W / 2, 160, 13, '#8fe9ff');
    const keys = smallText(this, OrbitHud.controlsLine(), VIEW_W / 2, VIEW_H - 74, 11, '#a9bad6');
    const hint = smallText(this, 'ESC resumes · LEFT / RIGHT adjust volume', VIEW_W / 2, VIEW_H - 30, 12, '#63748c');
    const T = session.training;
    const trainingRows: MenuItem[] = [
      {
        label: 'RIVAL',
        value: () => (T.p2 === 'dummy' ? 'DUMMY' : 'CPU'),
        onSelect: () => (T.p2 = T.p2 === 'dummy' ? 'cpu' : 'dummy'),
        onAdjust: () => (T.p2 = T.p2 === 'dummy' ? 'cpu' : 'dummy'),
      },
      {
        label: 'RIVAL SKILL',
        value: () => DIFFICULTY_NAMES[T.p2Difficulty],
        onAdjust: (d: number) => {
          T.p2Difficulty = (T.p2Difficulty + (d > 0 ? 1 : DIFFICULTY_COUNT - 1)) % DIFFICULTY_COUNT;
          this.ai = new OrbitAI(1, T.p2Difficulty as Difficulty, this.sim.enemy, session.seed() ^ 0x5a5a);
        },
        onSelect: () => {
          T.p2Difficulty = (T.p2Difficulty + 1) % DIFFICULTY_COUNT;
          this.ai = new OrbitAI(1, T.p2Difficulty as Difficulty, this.sim.enemy, session.seed() ^ 0x5a5a);
        },
      },
      {
        label: 'INFINITE SATURATION',
        value: () => (T.infiniteSat ? 'ON' : 'OFF'),
        onSelect: () => (T.infiniteSat = !T.infiniteSat),
        onAdjust: () => (T.infiniteSat = !T.infiniteSat),
      },
      {
        label: 'YOUR HEALTH',
        value: () => `${Math.round(T.health * 100)}%`,
        onAdjust: (d: number) => {
          const i = HEALTH_STEPS.indexOf(T.health);
          T.health = HEALTH_STEPS[(Math.max(0, i) + (d > 0 ? 1 : HEALTH_STEPS.length - 1)) % HEALTH_STEPS.length];
          this.sim.player.life = this.sim.player.def.gauges.maxLife * T.health;
        },
        onSelect: () => {
          const i = HEALTH_STEPS.indexOf(T.health);
          T.health = HEALTH_STEPS[(Math.max(0, i) + 1) % HEALTH_STEPS.length];
          this.sim.player.life = this.sim.player.def.gauges.maxLife * T.health;
        },
      },
      { label: 'RESET POSITIONS', onSelect: () => this.resetPositions() },
    ];
    const rows: MenuItem[] = [
      { label: 'RESUME', onSelect: () => this.closePause() },
      ...(training ? trainingRows : []),
      ...audioMenuItems(),
      {
        label: 'RESTART MATCH',
        onSelect: () => {
          session.matchIndex++;
          this.scene.restart();
        },
      },
      { label: 'MECH SELECT', onSelect: () => this.scene.start('MechSelect') },
      { label: 'QUIT TO TITLE', onSelect: () => this.scene.start('Title') },
    ];
    const menu = new Menu(this, rows, VIEW_W / 2, training ? 196 : 210, { size: 22, gap: training ? 30 : 34, maxVisible: 8 });
    this.pauseUi = { scrim, menu, extra: [title, sub, keys, hint] };
  }

  private closePause(): void {
    this.paused = false;
    music.duck(false);
    if (this.pauseUi) {
      this.pauseUi.scrim.destroy();
      this.pauseUi.menu.destroy();
      for (const e of this.pauseUi.extra) e.destroy();
      this.pauseUi = undefined;
    }
    this.accumulator = 0;
    this.input$.reset();
    this.hud.showHint();
  }
}

const NONE = { dx: 0, dy: 0, held: 0, pressed: 0, aimX: null, aimY: null };
