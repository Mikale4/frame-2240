import Phaser from 'phaser';
import * as THREE from 'three';
import { VIEW_H, VIEW_W } from '../core/GameConfig';
import { Difficulty, session } from '../core/Session';
import { MECHS } from '../data/mechs';
import { InputManager } from '../input/InputManager';
import { keyState } from '../input/KeyState';
import { accounts, type CampaignSave, type PilotId } from '../account/Accounts';
import { XP_CHAPTER } from '../account/unlocks';
import { Latch, ScriptRunner, ticks, type Script, type Waitable } from '../campaign/Script';
import type { ActorDef, AreaDef, ChapterDef, StoryApi } from '../campaign/Story';
import { chapterFor } from '../campaign/chapters';
import { REGIONS, buildReachWalk, homeOf, regionById, type RegionSpec } from '../campaign/Regions';
import type { WalkModel } from '../campaign/WorldModel';
import { CampaignView } from '../world/CampaignView';
import { FIGURE_VOXEL, animateFigure, extraLook, pilotFigure, type PilotFigure } from '../voxel/PilotFigure';
import { VoxelMech } from '../voxel/VoxelMech';
import { voxelStage } from '../voxel/VoxelStage';
import { DialogueBox } from '../ui/DialogueBox';
import { Menu, bigTitle, makeScrim, smallText, type MenuItem } from '../ui/Menu';
import { audioMenuItems } from '../ui/AudioOptions';
import { sfx } from '../audio/Sfx';
import { music } from '../audio/Music';

const FONT = 'ui-monospace, Consolas, monospace';
const WALK = 3.3;
const RUN = 6.2;
/** A frame at the Reach's human scale: HALCYON stands its canon 8.2 m. */
const FRAME_SCALE = 3.15;
const FIGURE_SCALE = FIGURE_VOXEL;
/** How close you stand to talk to someone, metres. */
const TALK_REACH = 3.0;

interface Actor {
  id: string;
  name: string;
  /** Bust texture for a pilot, null for an extra. */
  portrait: string | null;
  tint: number;
  fig: PilotFigure;
  pos: { x: number; y: number; z: number };
  vel: { x: number; z: number };
  facing: number;
  phase: number;
  target: { x: number; z: number; run: boolean; latch: Latch } | null;
  hidden: boolean;
}

/**
 * The campaign: a pilot on foot in the Reach.
 *
 * One scene for the whole open world. It reads the pad, walks the pilot
 * through the walk model (`campaign/WorldModel.ts`), streams regions in as
 * they come near, runs the chapter's scripts on the coroutine runner, and puts
 * the dialogue box, the prompts and the objective over it.
 *
 * **A sanctioned flight is the real fight.** The scene sleeps, the side-on
 * `Battle` or `Orbit` runs exactly as it does from the menu, and on the result
 * it wakes this scene and the script carries on from its `yield` — the FF7
 * game's battle hand-off, on one renderer.
 */
export class CampaignScene extends Phaser.Scene {
  private pilot!: PilotId;
  private save!: CampaignSave;
  private chapter: ChapterDef | null = null;
  private region!: RegionSpec;
  private walk!: WalkModel;
  private view!: CampaignView;
  private input$!: InputManager;
  private runner!: ScriptRunner;
  private dialog!: DialogueBox;
  private me!: Actor;
  private actors = new Map<string, Actor>();
  private frame: VoxelMech | null = null;
  private fired = new Set<string>();
  private objectiveText!: Phaser.GameObjects.Text;
  private regionText!: Phaser.GameObjects.Text;
  private promptText!: Phaser.GameObjects.Text;
  private captionText!: Phaser.GameObjects.Text;
  private toastText!: Phaser.GameObjects.Text;
  private curtain!: Phaser.GameObjects.Rectangle;
  private fadeTo = 0;
  private fadeRate = 0;
  private fadeLatch: Latch | null = null;
  private captionLatch: Latch | null = null;
  private captionLeft = 0;
  private toastLeft = 0;
  private battleLatch: Latch<'win' | 'lose'> | null = null;
  private paused = false;
  private pauseUi?: { menu: Menu; extra: Phaser.GameObjects.GameObject[] };
  private saveTimer = 0;
  private lastRegion = '';
  private t = 0;
  private dragX: number | null = null;
  private nearest: { kind: 'actor'; a: Actor } | { kind: 'area'; a: AreaDef } | null = null;

  constructor() {
    super('Campaign');
  }

  create(data: { pilot?: PilotId }): void {
    const store = accounts();
    this.pilot = data?.pilot ?? store.user?.starter ?? 'halcyon';
    this.save = store.campaign(this.pilot);
    this.chapter = chapterFor(this.pilot, this.save.chapter);
    this.region = regionById(this.chapter?.region ?? homeOf(this.pilot).id) ?? REGIONS[0];
    this.walk = buildReachWalk();
    this.view = new CampaignView(this.walk);
    this.input$ = new InputManager(this);
    this.input$.reset();
    this.runner = new ScriptRunner();
    this.actors = new Map();
    this.fired = new Set(Object.keys(this.save.flags).filter((k) => k.startsWith('area:')).map((k) => k.slice(5)));
    this.paused = false;
    this.pauseUi = undefined;
    this.battleLatch = null;
    this.t = 0;
    voxelStage().setView(this.view);

    // ---- the pilot ---------------------------------------------------------
    const resume = this.save.region && regionById(this.save.region) && this.save.updated > 0;
    const startRegion = resume ? regionById(this.save.region)! : this.region;
    const sx = resume ? this.save.x : this.region.cx + (this.chapter?.start.x ?? this.region.spawn.x);
    const sz = resume ? this.save.z : this.region.cz + (this.chapter?.start.z ?? this.region.spawn.z);
    const sy = this.walk.ground(sx, sz, startRegion.y + 0.5) ?? startRegion.y;
    this.me = this.makeActor('me', MECHS[this.pilot].pilot, this.pilot, { x: sx, y: sy, z: sz }, resume ? this.save.facing : this.chapter?.start.facing ?? 0);
    this.view.yaw = this.me.facing + Math.PI;
    this.view.stream(sx, sz, true);

    // The pilot's own frame, parked on their home pad.
    const home = homeOf(this.pilot);
    const fr = new VoxelMech(MECHS[this.pilot]);
    fr.root.scale.setScalar(FRAME_SCALE);
    this.frame = fr;
    this.view.actors.add(fr.root);
    this.poseFrame(home);

    // ---- the chapter's people --------------------------------------------
    if (this.chapter) {
      for (const d of this.chapter.actors) this.addChapterActor(d);
    }

    // ---- interface ---------------------------------------------------------
    this.regionText = this.add.text(18, 14, '', { fontFamily: FONT, fontSize: '15px', color: '#eaf2ff', fontStyle: 'bold' }).setStroke('#070b12', 5).setDepth(1400);
    this.objectiveText = this.add
      .text(VIEW_W - 18, 14, '', { fontFamily: FONT, fontSize: '13px', color: '#ffd166', align: 'right', wordWrap: { width: 380 } })
      .setOrigin(1, 0)
      .setStroke('#070b12', 5)
      .setDepth(1400);
    this.promptText = this.add.text(VIEW_W / 2, VIEW_H - 40, '', { fontFamily: FONT, fontSize: '15px', color: '#eaf2ff' }).setOrigin(0.5).setStroke('#070b12', 5).setDepth(1400);
    this.captionText = this.add
      .text(VIEW_W / 2, VIEW_H / 2 - 40, '', { fontFamily: FONT, fontSize: '22px', color: '#eaf2ff', align: 'center' })
      .setOrigin(0.5)
      .setStroke('#070b12', 6)
      .setLetterSpacing(3)
      .setDepth(1600)
      .setAlpha(0);
    this.toastText = this.add.text(VIEW_W / 2, 92, '', { fontFamily: FONT, fontSize: '16px', color: '#ffd166', fontStyle: 'bold' }).setOrigin(0.5).setStroke('#070b12', 5).setDepth(1600).setAlpha(0);
    this.curtain = this.add.rectangle(VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H, 0x000000, 1).setDepth(1550).setAlpha(0);
    this.dialog = new DialogueBox(this);
    smallText(this, 'ARROWS move · SPACE run · Z / ENTER talk · Q / E or drag: camera · ESC menu', VIEW_W / 2, VIEW_H - 10, 10, '#63748c', [0.5, 1]).setDepth(1400);
    this.setObjective(this.chapter ? this.save.objective || this.chapter.objective : 'Explore the Reach. The next chapter is not written yet.');

    music.duck(false);
    music.play('archive');

    // Mouse look: drag to turn the camera (pointer capture, no pointer lock).
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.dragX = p.x;
    });
    this.input.on('pointerup', () => {
      this.dragX = null;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.dragX === null || !p.isDown) return;
      this.view.yaw -= (p.x - this.dragX) * 0.008;
      this.dragX = p.x;
    });

    this.events.on(Phaser.Scenes.Events.WAKE, () => this.onWake());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.persist();
      this.runner.stop();
      this.frame?.destroy();
      this.view.dispose();
      const st = voxelStage();
      if (st.active === this.view) st.setView(null);
      this.events.off(Phaser.Scenes.Events.WAKE);
    });

    // The chapter opens with its intro, once.
    if (this.chapter?.intro && !this.flag('intro_done')) {
      const ch = this.chapter;
      const api = this.api();
      const self = this;
      this.runner.run(
        (function* (): Script {
          yield ch.intro!(api);
          self.setFlag('intro_done', true);
        })(),
      );
    } else {
      this.curtain.setAlpha(1);
      this.fade(false, 0.8);
    }
    (window as unknown as { __BSR_CAMPAIGN__?: CampaignScene }).__BSR_CAMPAIGN__ = this;
  }

  // ------------------------------------------------------------------ actors

  private makeActor(id: string, name: string, look: PilotId | null, pos: { x: number; y: number; z: number }, facing: number, def?: ActorDef): Actor {
    const fig =
      look === null && def
        ? pilotFigure(def.sex === 'm' ? 'nocturne' : 'halcyon', FIGURE_SCALE, extraLook(def.sex ?? 'f', def.seed ?? 1, def.suit, def.trim))
        : pilotFigure(look ?? 'halcyon', FIGURE_SCALE, def?.suit ? { suit: def.suit, trim: def.trim ?? MECHS[look!].tint.accent } : undefined);
    this.view.actors.add(fig.root);
    const a: Actor = {
      id,
      name,
      portrait: look ? `pilot_${look}` : null,
      tint: look ? MECHS[look].tint.primary : 0xffd166,
      fig,
      pos: { ...pos },
      vel: { x: 0, z: 0 },
      facing,
      phase: 0,
      target: null,
      hidden: !!def?.hidden,
    };
    fig.root.visible = !a.hidden;
    if (id !== 'me') this.actors.set(id, a);
    return a;
  }

  private addChapterActor(d: ActorDef): void {
    const r = this.region;
    const x = r.cx + d.x;
    const z = r.cz + d.z;
    const y = this.walk.ground(x, z, r.y + 0.5) ?? r.y;
    this.makeActor(d.id, d.name, d.look === 'extra' ? null : d.look, { x, y, z }, d.facing ?? 0, d);
  }

  private actor(id: string): Actor | undefined {
    return id === 'me' ? this.me : this.actors.get(id);
  }

  private poseFrame(home: RegionSpec): void {
    const f = this.frame;
    if (!f) return;
    const x = home.cx + home.pad.x;
    const z = home.cz + home.pad.z;
    const def = MECHS[this.pilot];
    const h = def.rig.footOffset * def.rig.scale * (1 / 40) * FRAME_SCALE;
    f.pose3(
      {
        x, y: home.y + h, z, yaw: Math.PI / 2, aim: -0.15, tilt: 0, roll: 0, flourish: 0, mobile: 0, transforming: false,
        pitch: 0, thrust: 0, walkPhase: 0, stride: 0, legSwing: 0, swing: null, hitstop: false, bob: this.t * 0.6, alive: true, satActive: false,
      },
      1 / 60,
    );
    // pose3 positions the root; keep the scale it was given.
    f.root.scale.setScalar(FRAME_SCALE);
  }

  // -------------------------------------------------------------- story api

  private flag(name: string): boolean {
    return !!this.save.flags[`${this.chapter?.id ?? 'free'}:${name}`];
  }

  private setFlag(name: string, on: boolean): void {
    this.save.flags[`${this.chapter?.id ?? 'free'}:${name}`] = on;
    this.persist();
  }

  private setObjective(text: string): void {
    const title = this.chapter ? `CHAPTER ${this.chapter.number} · ${this.chapter.title}` : 'THE REACH';
    this.objectiveText.setText(`${title}\n${text}`);
    this.save.objective = text;
    this.objectiveNow = text;
  }

  private objectiveNow = '';

  private toast(text: string): void {
    this.toastText.setText(text).setAlpha(1);
    this.toastLeft = 3;
  }

  private fade(out: boolean, seconds: number): Latch {
    const l = new Latch();
    this.fadeTo = out ? 1 : 0;
    this.fadeRate = seconds <= 0 ? Infinity : 1 / seconds;
    this.fadeLatch?.finish();
    this.fadeLatch = l;
    if (seconds <= 0) {
      this.curtain.setAlpha(this.fadeTo);
      l.finish();
      this.fadeLatch = null;
    }
    return l;
  }

  private api(): StoryApi {
    const self = this;
    const local = (x: number, z: number) => ({ x: self.region.cx + x, z: self.region.cz + z });
    return {
      me: this.pilot,
      say: (who, text) => {
        const a = self.actor(who);
        return self.dialog.say(a?.name ?? who.toUpperCase(), a?.portrait ?? null, a?.tint ?? 0xffd166, text);
      },
      ask: (who, text, options) => {
        const a = self.actor(who);
        return self.dialog.say(a?.name ?? who.toUpperCase(), a?.portrait ?? null, a?.tint ?? 0xffd166, text, options);
      },
      caption: (text, seconds = 2.4) => {
        const l = new Latch();
        self.captionLatch?.finish();
        self.captionLatch = l;
        self.captionText.setText(text);
        self.captionLeft = seconds;
        return l;
      },
      objective: (text) => {
        self.setObjective(text);
        self.toast(`OBJECTIVE · ${text}`);
      },
      walk: (id, x, z, run = false) => {
        const a = self.actor(id);
        const l = new Latch();
        if (!a) {
          l.finish();
          return l;
        }
        a.target = { ...local(x, z), run, latch: l };
        return l;
      },
      face: (id, target) => {
        const a = self.actor(id);
        const b = self.actor(target);
        if (a && b) a.facing = Math.atan2(b.pos.x - a.pos.x, b.pos.z - a.pos.z);
      },
      shot: (aId, bId) => {
        const a = self.actor(aId);
        let b = bId ? self.actor(bId) : undefined;
        if (!a) return;
        // A pair too far apart to frame together: hold on the first alone.
        if (b && Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z) > 8) b = undefined;
        if (b) {
          a.facing = Math.atan2(b.pos.x - a.pos.x, b.pos.z - a.pos.z);
          b.facing = Math.atan2(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
        }
        const m = b ? { x: (a.pos.x + b.pos.x) / 2, y: (a.pos.y + b.pos.y) / 2, z: (a.pos.z + b.pos.z) / 2 } : a.pos;
        const dx = b ? b.pos.x - a.pos.x : Math.sin(a.facing);
        const dz = b ? b.pos.z - a.pos.z : Math.cos(a.facing);
        const l = Math.hypot(dx, dz) || 1;
        // Side-on to the pair, a little toward the player's shoulder.
        const px = -dz / l;
        const pz = dx / l;
        const dist = Math.max(3.4, l * 1.4 + 1.6);
        self.view.scripted = {
          eye: new THREE.Vector3(m.x + px * dist - (dx / l) * 0.8, m.y + 1.7, m.z + pz * dist - (dz / l) * 0.8),
          at: new THREE.Vector3(m.x, m.y + 1.35, m.z),
        };
      },
      release: () => {
        self.view.scripted = null;
      },
      fade: (out, seconds = 0.6) => self.fade(out, seconds),
      wait: (seconds) => ticks(seconds * 60),
      show: (id, visible) => {
        const a = self.actor(id);
        if (a) {
          a.hidden = !visible;
          a.fig.root.visible = visible;
        }
      },
      battle: (o) => self.startBattle(o.foe, o.difficulty ?? Difficulty.Normal, o.mode ?? 'versus'),
      flag: (n) => self.flag(n),
      set: (n, on = true) => self.setFlag(n, on),
      unlock: (p) => {
        if (accounts().unlock(p, 'story')) self.toast(`NEW PILOT UNLOCKED · ${MECHS[p].pilot}`);
      },
      complete: () => self.completeChapter(),
    };
  }

  private completeChapter(): void {
    const ch = this.chapter;
    if (!ch) return;
    const store = accounts();
    if (!this.save.done.includes(ch.id)) this.save.done.push(ch.id);
    for (const p of ch.features ?? []) store.unlock(p, 'story');
    store.addXp(XP_CHAPTER);
    this.save.chapter = ch.number + 1;
    this.save.objective = '';
    this.persist();
    this.toast(`CHAPTER ${ch.number} COMPLETE · +${XP_CHAPTER} XP`);
    // The world stays open: the next chapter, or free roam until it is written.
    this.chapter = chapterFor(this.pilot, this.save.chapter);
    this.setObjective(this.chapter ? this.chapter.objective : 'Explore the Reach. The next chapter is not written yet.');
  }

  private startBattle(foe: PilotId, difficulty: Difficulty, mode: 'versus' | 'orbit'): Waitable<'win' | 'lose'> {
    const l = new Latch<'win' | 'lose'>();
    this.battleLatch = l;
    this.persist();
    session.campaignFight = { result: null };
    session.mode = mode === 'orbit' ? 'orbit' : 'vsCpu';
    session.playerMech = this.pilot;
    session.enemyMech = foe;
    session.enemyDifficulty = difficulty;
    session.demo = false;
    session.matchIndex++;
    this.time.delayedCall(50, () => {
      this.scene.sleep();
      this.scene.launch(mode === 'orbit' ? 'Orbit' : 'Battle');
    });
    return l;
  }

  /** Back from a sanctioned flight: the world again, and the script resumes. */
  private onWake(): void {
    voxelStage().setView(this.view);
    this.input$.reset();
    music.duck(false);
    music.play('archive');
    const r = session.campaignFight?.result ?? 'lose';
    session.campaignFight = null;
    const l = this.battleLatch;
    this.battleLatch = null;
    l?.finish(r);
  }

  // ------------------------------------------------------------------- loop

  override update(_time: number, delta: number): void {
    const dt = Math.min(delta, 100) / 1000;
    this.t += dt;
    const ui = this.input$.readUi();
    if (this.paused) {
      if (ui.up) this.pauseUi?.menu.move(-1);
      if (ui.down) this.pauseUi?.menu.move(1);
      if (ui.left) this.pauseUi?.menu.adjust(-1);
      if (ui.right) this.pauseUi?.menu.adjust(1);
      if (ui.confirm) this.pauseUi?.menu.confirm();
      else if (ui.pause || ui.cancel) this.closePause();
      this.pauseUi?.menu.update();
      this.render3d(dt, false);
      return;
    }
    // Enter is bound to both confirm and pause; here it talks, and Esc (or the
    // pad's Start) opens the menu.
    const menuKey = (ui.pause && !ui.confirm) || ui.cancel;
    if (menuKey && !this.dialog.open && !this.runner.busy) {
      this.openPause();
      return;
    }

    // Dialogue owns confirm while it is up.
    this.dialog.update(dt, ui);
    this.runner.tick();
    for (const e of this.runner.errors.splice(0)) console.error('[campaign] script error', e);

    const input = this.input$.read();
    const free = !this.runner.busy && !this.dialog.open;
    let moving = false;
    if (free) {
      // Camera-relative movement: up walks away from the lens.
      const fx = -Math.sin(this.view.yaw);
      const fz = -Math.cos(this.view.yaw);
      const rx = -fz;
      const rz = fx;
      let wx = fx * -input.dy + rx * input.dx;
      let wz = fz * -input.dy + rz * input.dx;
      const l = Math.hypot(wx, wz);
      const run = (input.held & (1 << 3)) !== 0;
      if (l > 0.01) {
        wx /= l;
        wz /= l;
        moving = true;
      }
      const speed = moving ? (run ? RUN : WALK) : 0;
      const k = Math.min(1, dt * 10);
      this.me.vel.x += (wx * speed - this.me.vel.x) * k;
      this.me.vel.z += (wz * speed - this.me.vel.z) * k;
      if (keyState.isDown('KeyQ')) this.view.yaw += dt * 2.2;
      if (keyState.isDown('KeyE')) this.view.yaw -= dt * 2.2;
      if (ui.confirm) this.interact();
    } else {
      this.me.vel.x *= 0.8;
      this.me.vel.z *= 0.8;
    }
    this.stepActor(this.me, dt);
    for (const a of this.actors.values()) this.stepActor(a, dt);
    this.checkAreas();
    this.updateInterface(dt, free);

    this.saveTimer += dt;
    if (this.saveTimer > 5) {
      this.saveTimer = 0;
      this.persist();
    }
    this.render3d(dt, moving);
  }

  private stepActor(a: Actor, dt: number): void {
    if (a.target) {
      const dx = a.target.x - a.pos.x;
      const dz = a.target.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.3) {
        a.vel.x = 0;
        a.vel.z = 0;
        const l = a.target.latch;
        a.target = null;
        l.finish();
      } else {
        const s = a.target.run ? RUN : WALK;
        a.vel.x = (dx / d) * s;
        a.vel.z = (dz / d) * s;
      }
    }
    const sp = Math.hypot(a.vel.x, a.vel.z);
    if (sp > 0.05) {
      const next = this.walk.move(a.pos, a.vel.x * dt, a.vel.z * dt);
      a.pos.x = next.x;
      a.pos.z = next.z;
      a.pos.y = next.y;
      const want = Math.atan2(a.vel.x, a.vel.z);
      let d = want - a.facing;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      a.facing += d * Math.min(1, dt * 12);
    }
    a.fig.root.position.set(a.pos.x, a.pos.y, a.pos.z);
    a.fig.root.rotation.y = a.facing;
    animateFigure(a.fig, sp, dt, this.t);
  }

  /** The best thing in reach: people first, then usable spots. */
  private findNearest(): typeof this.nearest {
    const me = this.me.pos;
    const fx = Math.sin(this.me.facing);
    const fz = Math.cos(this.me.facing);
    let best: typeof this.nearest = null;
    let bestScore = -Infinity;
    for (const a of this.actors.values()) {
      if (a.hidden || !this.chapter?.talk[a.id]) continue;
      const dx = a.pos.x - me.x;
      const dz = a.pos.z - me.z;
      const d = Math.hypot(dx, dz);
      if (d > TALK_REACH) continue;
      const score = 1 - d / TALK_REACH + ((dx * fx + dz * fz) / (d || 1)) * 0.6;
      if (score > bestScore) {
        bestScore = score;
        best = { kind: 'actor', a };
      }
    }
    if (!best && this.chapter) {
      for (const ar of this.chapter.areas ?? []) {
        if (!ar.prompt || (ar.when && !this.flag(ar.when))) continue;
        const x = this.region.cx + ar.x;
        const z = this.region.cz + ar.z;
        if (Math.hypot(x - me.x, z - me.z) < ar.r) best = { kind: 'area', a: ar };
      }
    }
    return best;
  }

  private interact(): void {
    const n = this.findNearest();
    if (!n || !this.chapter) return;
    const api = this.api();
    if (n.kind === 'actor') {
      const a = n.a;
      a.facing = Math.atan2(this.me.pos.x - a.pos.x, this.me.pos.z - a.pos.z);
      this.me.facing = Math.atan2(a.pos.x - this.me.pos.x, a.pos.z - this.me.pos.z);
      this.runner.run(this.chapter.talk[a.id](api));
    } else {
      this.runner.run(n.a.run(api));
    }
  }

  /** Walk-in areas (no prompt) fire when the pilot steps into them. */
  private checkAreas(): void {
    if (!this.chapter || this.runner.busy) return;
    for (const ar of this.chapter.areas ?? []) {
      if (ar.prompt || (ar.when && !this.flag(ar.when))) continue;
      if (!ar.repeat && this.fired.has(ar.id)) continue;
      const x = this.region.cx + ar.x;
      const z = this.region.cz + ar.z;
      if (Math.hypot(x - this.me.pos.x, z - this.me.pos.z) > ar.r) continue;
      this.fired.add(ar.id);
      this.save.flags[`area:${ar.id}`] = true;
      this.runner.run(ar.run(this.api()));
      return;
    }
  }

  private regionAt(x: number, z: number): RegionSpec | null {
    for (const r of REGIONS) {
      if (Math.abs(x - r.cx) <= r.w / 2 + 2 && Math.abs(z - r.cz) <= r.d / 2 + 2) return r;
    }
    return null;
  }

  private updateInterface(dt: number, free: boolean): void {
    const r = this.regionAt(this.me.pos.x, this.me.pos.z);
    const label = r ? `${r.name}\n${r.holder}` : 'THE SPANS';
    if (label !== this.lastRegion) {
      this.lastRegion = label;
      this.regionText.setText(label);
      if (r && this.t > 1) this.toast(r.name);
    }
    this.nearest = free ? this.findNearest() : null;
    const n = this.nearest;
    this.promptText.setText(n ? `Z  ${n.kind === 'actor' ? `TALK · ${n.a.name}` : n.a.prompt}` : '');

    if (this.captionLeft > 0) {
      this.captionLeft -= dt;
      const total = 0.5;
      this.captionText.setAlpha(Math.min(1, this.captionLeft / total, 1));
      if (this.captionLeft <= 0) {
        this.captionText.setAlpha(0);
        this.captionLatch?.finish();
        this.captionLatch = null;
      }
    }
    if (this.toastLeft > 0) {
      this.toastLeft -= dt;
      this.toastText.setAlpha(Math.min(1, this.toastLeft));
    }
    if (this.fadeRate > 0) {
      const a = this.curtain.alpha;
      const next = a < this.fadeTo ? Math.min(this.fadeTo, a + dt * this.fadeRate) : Math.max(this.fadeTo, a - dt * this.fadeRate);
      this.curtain.setAlpha(next);
      if (next === this.fadeTo) {
        this.fadeRate = 0;
        this.fadeLatch?.finish();
        this.fadeLatch = null;
      }
    }
  }

  private render3d(dt: number, moving: boolean): void {
    this.view.stream(this.me.pos.x, this.me.pos.z);
    this.poseFrame(homeOf(this.pilot));
    const heading = Math.atan2(this.me.vel.x, this.me.vel.z);
    this.view.follow(this.me.pos, heading, moving, dt);
    const st = voxelStage();
    if (st.active === this.view) st.render();
  }

  private persist(): void {
    if (!this.me) return;
    const r = this.regionAt(this.me.pos.x, this.me.pos.z) ?? this.region;
    this.save.region = r.id;
    this.save.x = this.me.pos.x;
    this.save.z = this.me.pos.z;
    this.save.facing = this.me.facing;
    this.save.updated = Date.now();
    accounts().save();
  }

  // ------------------------------------------------------------------ pause

  private openPause(): void {
    this.paused = true;
    music.duck(true);
    const scrim = makeScrim(this);
    const title = bigTitle(this, 'CAMPAIGN', 120, 40, '#eaf2ff');
    const sub = smallText(this, `${MECHS[this.pilot].pilot} · ${this.objectiveNow}`, VIEW_W / 2, 160, 12, '#8fe9ff');
    const rows: MenuItem[] = [
      { label: 'RESUME', onSelect: () => this.closePause() },
      ...audioMenuItems(),
      {
        label: 'SAVE AND QUIT',
        onSelect: () => {
          this.persist();
          this.scene.start('Menu');
        },
      },
    ];
    const menu = new Menu(this, rows, VIEW_W / 2, 230, { size: 22, gap: 36, maxVisible: 6 });
    this.pauseUi = { menu, extra: [scrim, title, sub] };
    sfx.uiConfirm();
  }

  private closePause(): void {
    this.paused = false;
    music.duck(false);
    if (this.pauseUi) {
      this.pauseUi.menu.destroy();
      for (const e of this.pauseUi.extra) e.destroy();
      this.pauseUi = undefined;
    }
    this.input$.reset();
  }
}
