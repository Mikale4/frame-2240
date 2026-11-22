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
import type { ActorDef, AreaDef, ChapterDef, FrameDef, Mood, Sound, Spot3, StoryApi } from '../campaign/Story';
import { chapterFor } from '../campaign/chapters';
import { REGIONS, buildReachWalk, homeOf, regionById, type RegionSpec } from '../campaign/Regions';
import type { WalkModel } from '../campaign/WorldModel';
import { CampaignView } from '../world/CampaignView';
import { TRAM_LIFT, WorldLife, type Tram } from '../world/WorldLife';
import { barkFor, type CrowdAgent } from '../campaign/Crowd';
import { Room, doorNear, type InteriorSpec, type RoomPerson } from '../world/Interiors';
import { FIGURE_VOXEL, animateFigure, extraLook, gesture, pilotFigure, type PilotFigure } from '../voxel/PilotFigure';
import { VoxelMech } from '../voxel/VoxelMech';
import { VoxelFx } from '../voxel/VoxelFx';
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
  /** Where a script is walking them; `best` and `stuck` catch a walk that cannot arrive. */
  target: { x: number; z: number; run: boolean; latch: Latch; best?: number; stuck?: number; left?: number } | null;
  hidden: boolean;
}

/** A frame standing in the world, parked or mid-sortie. */
interface FrameRec {
  mech: VoxelMech;
  def: (typeof MECHS)[PilotId];
  x: number;
  y: number;
  z: number;
  /** The rig's yaw: 0 faces +x. */
  yaw: number;
  hidden: boolean;
  launch: { t: number; dust: number; latch: Latch } | null;
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
  /** Frames standing in the world: the pilot's own (`'frame'`) and the chapter's. */
  private frames = new Map<string, FrameRec>();
  private fx: VoxelFx | null = null;
  // The cutscene kit's screen furniture.
  private barTop!: Phaser.GameObjects.Rectangle;
  private barBottom!: Phaser.GameObjects.Rectangle;
  private barsOn = false;
  private card!: Phaser.GameObjects.Container;
  private cardLatch: Latch | null = null;
  /** Seconds a card holds by itself, or Infinity to wait for the player. */
  private cardLeft = 0;
  private cardAge = 0;
  private alarmLayer!: Phaser.GameObjects.Rectangle;
  private alarmOn = false;
  private alarmBeat = 0;
  private flashLayer!: Phaser.GameObjects.Rectangle;
  private shakeAmp = 0;
  private shakeLeft = 0;
  private shakeTotal = 0;
  private camTween: { from: [THREE.Vector3, THREE.Vector3]; to: [THREE.Vector3, THREE.Vector3]; t: number; dur: number; latch: Latch } | null = null;
  /** The pilot is drawn as a child just now. */
  private meYoung = false;
  /** Playing an earlier chapter again: progress is left as it was. */
  private replay = false;
  /** A chapter finished and another follows: the scene restarts into it once the script ends. */
  private nextPending = false;
  private nearest:
    | { kind: 'actor'; a: Actor }
    | { kind: 'area'; a: AreaDef }
    | { kind: 'person'; a: CrowdAgent }
    | { kind: 'tram'; a: { tram: Tram; end: 0 | 1; to: RegionSpec } }
    | { kind: 'door'; a: InteriorSpec }
    | { kind: 'roomPerson'; a: RoomPerson }
    | null = null;
  /** The room the pilot is in, or null outdoors. */
  private inside: Room | null = null;
  private readonly roomEye = new THREE.Vector3();
  private readonly roomAt = new THREE.Vector3();
  /** The Reach's own life: crowds, traffic, trams, the sky. */
  private life!: WorldLife;
  /** Confirm pressed this frame, for scripts that can be skipped. */
  private confirmNow = false;
  /** How many times each person has been spoken to, to vary what they say. */
  private talked = new Map<string, number>();

  constructor() {
    super('Campaign');
  }

  create(data: { pilot?: PilotId; replay?: number }): void {
    const store = accounts();
    this.pilot = data?.pilot ?? store.user?.starter ?? 'halcyon';
    this.save = store.campaign(this.pilot);
    // A campaign begun before the prologues existed, and not yet under way,
    // starts at the prologue.
    const pro = chapterFor(this.pilot, 0);
    if (pro && this.save.chapter === 1 && !this.save.done.includes(pro.id) && !Object.keys(this.save.flags).some((k) => k.startsWith(`${this.pilot}-1:`))) {
      this.save.chapter = 0;
      this.save.updated = 0;
    }
    this.replay = data?.replay !== undefined;
    this.nextPending = false;
    this.chapter = chapterFor(this.pilot, this.replay ? data.replay! : this.save.chapter);
    if (this.replay && this.chapter) {
      // A replay starts the chapter clean.
      for (const k of Object.keys(this.save.flags)) if (k.startsWith(`${this.chapter.id}:`)) delete this.save.flags[k];
    }
    this.region = regionById(this.chapter?.region ?? homeOf(this.pilot).id) ?? REGIONS[0];
    this.walk = buildReachWalk();
    this.view = new CampaignView(this.walk);
    this.life = new WorldLife(this.walk);
    this.view.scene.add(this.life.group);
    this.talked = new Map();
    this.inside = null;
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
    const resume = !this.replay && this.save.region && regionById(this.save.region) && this.save.updated > 0;
    const startRegion = resume ? regionById(this.save.region)! : this.region;
    const sx = resume ? this.save.x : this.region.cx + (this.chapter?.start.x ?? this.region.spawn.x);
    const sz = resume ? this.save.z : this.region.cz + (this.chapter?.start.z ?? this.region.spawn.z);
    const sy = this.walk.ground(sx, sz, startRegion.y + 0.5) ?? startRegion.y;
    this.me = this.makeActor('me', MECHS[this.pilot].pilot, this.pilot, { x: sx, y: sy, z: sz }, resume ? this.save.facing : this.chapter?.start.facing ?? 0);
    this.view.yaw = this.me.facing + Math.PI;
    this.view.stream(sx, sz, true);
    this.meYoung = !!this.chapter?.young;
    if (this.meYoung) {
      // A child: smaller, and the adult's portrait would be wrong in the box.
      this.me.fig.root.scale.multiplyScalar(0.72);
      this.me.portrait = null;
    }

    // The pilot's own frame, parked on their home pad, unless this is before they had one.
    this.frames = new Map();
    this.fx = new VoxelFx(this.view.scene, this.view.camera);
    const home = homeOf(this.pilot);
    if (!this.chapter?.noFrame) {
      const fr = new VoxelMech(MECHS[this.pilot]);
      fr.root.scale.setScalar(FRAME_SCALE);
      this.view.actors.add(fr.root);
      this.frames.set('frame', { mech: fr, def: MECHS[this.pilot], x: home.cx + home.pad.x, y: home.y, z: home.cz + home.pad.z, yaw: Math.PI / 2, hidden: false, launch: null });
    }
    for (const f of this.chapter?.frames ?? []) this.addFrame(f);
    this.poseFrames(0);

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
    this.buildKit();
    smallText(this, 'ARROWS move · SPACE run · Z / ENTER talk · Q / E or drag: camera · ESC menu', VIEW_W / 2, VIEW_H - 10, 10, '#63748c', [0.5, 1]).setDepth(1400);
    this.setObjective(this.chapter ? this.save.objective || this.chapter.objective : 'Explore the Reach. The next chapter is not written yet.');

    music.duck(false);
    music.play(this.track(this.chapter?.music ?? 'calm'));

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
      for (const f of this.frames.values()) f.mech.destroy();
      this.frames.clear();
      this.fx?.group.removeFromParent();
      this.fx = null;
      sfx.stopLoops();
      this.inside?.dispose();
      this.inside = null;
      this.life.dispose();
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
    if (def?.young) fig.root.scale.multiplyScalar(0.72);
    if (def?.sitting) fig.sitting = true;
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

  /** One of the chapter's frames, region-local, standing where the chapter puts it. */
  private addFrame(d: FrameDef): void {
    const r = this.region;
    const x = r.cx + d.x;
    const z = r.cz + d.z;
    const y = this.walk.ground(x, z, r.y + 0.5) ?? r.y;
    const def = MECHS[d.mech];
    const mech = new VoxelMech(def);
    mech.root.scale.setScalar(FRAME_SCALE);
    this.view.actors.add(mech.root);
    // `facing` is the walking world's (0 is +z); the rig's yaw has 0 along +x.
    this.frames.set(d.id, { mech, def, x, y, z, yaw: (d.facing ?? 0) - Math.PI / 2, hidden: !!d.hidden, launch: null });
    this.walk.add({ posts: [{ x, z, r: 2.4 }] });
  }

  /** Poses every frame: parked, or in the middle of a sortie. */
  private poseFrames(dt: number): void {
    for (const f of this.frames.values()) {
      if (f.hidden) {
        f.mech.root.visible = false;
        continue;
      }
      const lift = f.def.rig.footOffset * f.def.rig.scale * (1 / 40) * FRAME_SCALE;
      let { x, y, z } = f;
      let thrust = 0;
      let mobile = 0;
      let transforming = false;
      let pitch = 0;
      const L = f.launch;
      if (L) {
        L.t += dt;
        // Lift off on the thrusters, then away and up, folding into flight.
        const t = L.t;
        const fx = Math.cos(f.yaw);
        const fz = -Math.sin(f.yaw);
        const rise = t < 1.2 ? 1.6 * (t / 1.2) ** 2 : 1.6 + 9 * (t - 1.2) + 6 * (t - 1.2) ** 2;
        const out = t < 1.2 ? 0 : 6 * (t - 1.2) ** 2 + 4 * (t - 1.2);
        x = f.x + fx * out;
        z = f.z + fz * out;
        y = f.y + rise;
        thrust = Math.min(1, t / 0.6);
        mobile = Math.max(0, Math.min(1, (t - 1.3) / 0.8));
        transforming = t > 1.3 && t < 2.1;
        pitch = -0.25 * mobile;
        L.dust -= dt;
        if (L.dust <= 0 && t < 1.6 && this.fx) {
          L.dust = 0.08;
          this.fx.burst(f.x, f.y + 0.3, f.z, { n: 10, speed: 6, life: 0.7, size: 0.5, sizeEnd: 0.2, color: [0x8a8f98, 0x5a626e], gravity: -0.5, drag: 1.2, spread: 1, dir: [0, 0.2, 0], lit: true });
          this.fx.burst(x, y + 0.5, z, { n: 6, speed: 3, life: 0.25, size: 0.35, sizeEnd: 0.05, color: [0xfff1c0, 0xffb020, 0x9fd4ff], dir: [0, -1, 0], spread: 0.4 });
        }
        // The camera holds low on the pad, then looks up after it.
        const side = { x: -fz, z: fx };
        const eye = new THREE.Vector3(f.x + side.x * 15 - fx * 6, f.y + 2.4, f.z + side.z * 15 - fz * 6);
        const at = new THREE.Vector3(x, y + 4.5, z);
        this.view.scripted = { eye, at };
        if (t > 3.6) {
          f.hidden = true;
          f.launch = null;
          L.latch.finish();
          f.mech.root.visible = false;
          continue;
        }
      }
      f.mech.root.visible = true;
      f.mech.pose3(
        {
          x, y: y + lift, z, yaw: f.yaw, aim: -0.15, tilt: 0, roll: 0, flourish: 0, mobile, transforming,
          pitch, thrust, walkPhase: 0, stride: 0, legSwing: 0, swing: null, hitstop: false, bob: this.t * 0.6, alive: true, satActive: false,
        },
        dt || 1 / 60,
      );
      // pose3 positions the root; keep the scale it was given.
      f.mech.root.scale.setScalar(FRAME_SCALE);
    }
  }

  // ------------------------------------------------------------ cutscene kit

  /** The track for a mood. */
  private track(m: Mood): string {
    const t: Record<Mood, string> = {
      calm: 'archive',
      tension: 'select',
      danger: 'battle_danger',
      sorrow: 'results_lose',
      hope: 'results_win',
      theme: `theme_${this.pilot}`,
      yard: 'stage_cathedral_yard',
      training: 'training',
      title: 'title',
    };
    return t[m];
  }

  /** Bars, cards, the alarm light and the flash: built once, hidden until asked for. */
  private buildKit(): void {
    this.barTop = this.add.rectangle(VIEW_W / 2, 0, VIEW_W, 1, 0x000000, 1).setOrigin(0.5, 0).setDepth(1500);
    this.barBottom = this.add.rectangle(VIEW_W / 2, VIEW_H, VIEW_W, 1, 0x000000, 1).setOrigin(0.5, 1).setDepth(1500);
    this.barTop.height = this.barBottom.height = 0;
    this.barsOn = false;
    this.alarmLayer = this.add.rectangle(VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H, 0xff1a10, 1).setDepth(1450).setAlpha(0);
    this.alarmLayer.setBlendMode(Phaser.BlendModes.ADD);
    this.alarmOn = false;
    this.flashLayer = this.add.rectangle(VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H, 0xffffff, 1).setDepth(1560).setAlpha(0);
    this.card = this.add.container(0, 0).setDepth(1580).setAlpha(0);
    this.cardLatch = null;
    this.shakeAmp = this.shakeLeft = 0;
    this.camTween = null;
  }

  /** Puts a card up: a title card, the narrator, or the "next time" preview. */
  private showCard(kind: 'title' | 'narrate' | 'next', a: string, b: string | string[], seconds: number): Latch {
    this.card.removeAll(true);
    const W = VIEW_W;
    const H = VIEW_H;
    if (kind === 'title') {
      // The show's episode card: black, a rule, the number small and the title large.
      this.card.add(this.add.rectangle(W / 2, H / 2, W, H, 0x04060a, 0.94));
      this.card.add(this.add.rectangle(W / 2, H / 2 + 6, 520, 2, 0xffd166, 1));
      this.card.add(this.add.text(W / 2 - 260, H / 2 - 64, a, { fontFamily: FONT, fontSize: '16px', color: '#ffd166' }).setLetterSpacing(6));
      this.card.add(
        this.add
          .text(W / 2, H / 2 - 22, b as string, { fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '40px', color: '#f4f6fa', fontStyle: 'bold', align: 'center', wordWrap: { width: 760 } })
          .setOrigin(0.5)
          .setLetterSpacing(2),
      );
      this.card.add(this.add.text(W / 2 + 260, H / 2 + 18, MECHS[this.pilot].pilot, { fontFamily: FONT, fontSize: '12px', color: '#8fa0b8' }).setOrigin(1, 0).setLetterSpacing(4));
    } else if (kind === 'narrate') {
      this.card.add(this.add.rectangle(W / 2, H / 2 + 150, W, 92, 0x000000, 0.55));
      this.card.add(
        this.add
          .text(W / 2, H / 2 + 150, a, { fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '19px', color: '#e8eef6', fontStyle: 'italic', align: 'center', wordWrap: { width: 760 } })
          .setOrigin(0.5)
          .setStroke('#000000', 4),
      );
    } else {
      const lines = b as string[];
      this.card.add(this.add.rectangle(W / 2, H / 2, W, H, 0x0a1426, 0.96));
      this.card.add(this.add.rectangle(W / 2, 92, W - 160, 2, 0x3d8cff, 1));
      this.card.add(this.add.text(80, 52, 'NEXT TIME', { fontFamily: FONT, fontSize: '24px', color: '#9fd4ff', fontStyle: 'bold' }).setLetterSpacing(8));
      this.card.add(
        this.add
          .text(W / 2, H / 2 - 20, lines.join('\n\n'), { fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '18px', color: '#dfe8f4', align: 'center', wordWrap: { width: 720 }, lineSpacing: 4 })
          .setOrigin(0.5),
      );
      this.card.add(this.add.text(W / 2, H - 112, a, { fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '30px', color: '#ffffff', fontStyle: 'bold', align: 'center' }).setOrigin(0.5).setLetterSpacing(2));
      this.card.add(this.add.text(W - 80, H - 50, 'Z  CONTINUE', { fontFamily: FONT, fontSize: '12px', color: '#63748c' }).setOrigin(1, 0.5));
    }
    const l = new Latch();
    this.cardLatch?.finish();
    this.cardLatch = l;
    this.cardLeft = seconds;
    this.cardAge = 0;
    return l;
  }

  /** Cards, bars, alarm, flash and shake, once a frame. */
  private updateKit(dt: number, confirm: boolean): void {
    // Cards fade in, hold (or wait for the player), and fade out.
    if (this.cardLatch) {
      this.cardAge += dt;
      this.card.setAlpha(Math.min(1, this.cardAge / 0.35));
      const timed = this.cardLeft !== Infinity && this.cardAge >= this.cardLeft;
      if (timed || (this.cardLeft === Infinity && confirm && this.cardAge > 0.4)) {
        const l = this.cardLatch;
        this.cardLatch = null;
        l.finish();
        if (!timed) sfx.uiConfirm();
      }
    } else if (this.card.alpha > 0) {
      this.card.setAlpha(Math.max(0, this.card.alpha - dt * 3));
      if (this.card.alpha === 0) this.card.removeAll(true);
    }
    const want = this.barsOn ? 56 : 0;
    const h = this.barTop.height + (want - this.barTop.height) * Math.min(1, dt * 6);
    this.barTop.height = this.barBottom.height = Math.abs(h - want) < 0.5 ? want : h;
    this.barTop.setSize(VIEW_W, this.barTop.height);
    this.barBottom.setSize(VIEW_W, this.barBottom.height);
    const hud = this.barsOn ? 0 : 1;
    this.regionText.setAlpha(hud);
    this.objectiveText.setAlpha(hud);
    if (this.alarmOn) {
      this.alarmBeat -= dt;
      this.alarmLayer.setAlpha(0.1 + 0.1 * Math.sin(this.t * 7));
      if (this.alarmBeat <= 0) {
        this.alarmBeat = 1.4;
        sfx.klaxon();
      }
    } else if (this.alarmLayer.alpha > 0) this.alarmLayer.setAlpha(Math.max(0, this.alarmLayer.alpha - dt));
    if (this.flashLayer.alpha > 0) this.flashLayer.setAlpha(Math.max(0, this.flashLayer.alpha - dt * 2.4));
  }

  /** Region-local spot to world. */
  private at3(p: Spot3): THREE.Vector3 {
    return new THREE.Vector3(this.region.cx + p.x, this.region.y + p.y, this.region.cz + p.z);
  }

  private boom(x: number, y: number, z: number, size: number): void {
    const fx = this.fx;
    if (!fx) return;
    const k = 2.5 * size;
    fx.star(x, y, z, 3 * k, 0xfff1c0, 0.25);
    fx.ring(x, y, z, 0.4 * k, 3.2 * k, 0xffb066, 0.45, 0.8);
    fx.burst(x, y, z, { n: Math.round(28 * size), speed: 7 * k, life: 0.8, size: 0.16 * k, sizeEnd: 0.05 * k, color: [0xffffff, 0xffd166, 0xff8a3a], colorEnd: 0x5a1a08, gravity: 3, drag: 0.7 });
    fx.burst(x, y, z, { n: Math.round(14 * size), speed: 4 * k, life: 1.4, size: 0.22 * k, sizeEnd: 0.08 * k, color: [0x3a3a40, 0x5a5a60], gravity: -0.6, drag: 1.4, lit: true });
    sfx.explode(size >= 1);
    this.shakeAmp = Math.max(this.shakeAmp, 0.12 * size);
    this.shakeLeft = this.shakeTotal = Math.max(this.shakeLeft, 0.6);
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
    const title = this.chapter ? `${this.chapter.number === 0 ? 'PROLOGUE' : `CHAPTER ${this.chapter.number}`} · ${this.chapter.title}` : 'THE REACH';
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
        self.frameShot(a.pos, a.facing, b?.pos);
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

      letterbox: (on) => {
        self.barsOn = on;
      },
      titleCard: (episode, title, seconds = 3.4) => self.showCard('title', episode, title, seconds),
      narrate: (text) => self.showCard('narrate', text, '', Infinity),
      nextTime: (lines, title) => self.showCard('next', title, lines, Infinity),
      cam: (eye, at, cut = false) => {
        self.camTween = null;
        self.view.scripted = { eye: self.at3(eye), at: self.at3(at) };
        if (cut) self.view.snap();
      },
      pan: (from, to, seconds) => {
        const l = new Latch();
        self.camTween?.latch.finish();
        self.camTween = { from: [self.at3(from[0]), self.at3(from[1])], to: [self.at3(to[0]), self.at3(to[1])], t: 0, dur: Math.max(0.05, seconds), latch: l };
        return l;
      },
      gesture: (id, kind, seconds) => {
        const a = self.actor(id);
        if (a) gesture(a.fig, kind, seconds);
      },
      sit: (id, on) => {
        const a = self.actor(id);
        if (a) a.fig.sitting = on;
      },
      place: (id, x, z, facing) => {
        const a = self.actor(id);
        if (!a) return;
        const p = local(x, z);
        a.pos.x = p.x;
        a.pos.z = p.z;
        a.pos.y = self.walk.ground(p.x, p.z, self.region.y + 0.5) ?? self.region.y;
        a.vel.x = a.vel.z = 0;
        a.target?.latch.finish();
        a.target = null;
        if (facing !== undefined) a.facing = facing;
      },
      music: (mood) => music.play(mood ? self.track(mood) : null),
      sound: (name: Sound) => {
        const play: Record<Sound, () => void> = {
          alarm: () => sfx.klaxon(),
          boom: () => sfx.explode(false),
          bigboom: () => sfx.explode(true),
          hit: () => sfx.heavyHit(),
          launch: () => sfx.sortie(),
          land: () => sfx.land(),
          step: () => sfx.footstep(),
          beep: () => sfx.uiConfirm(),
          door: () => sfx.uiMove(),
        };
        play[name]();
      },
      shake: (strength, seconds) => {
        self.shakeAmp = strength;
        self.shakeLeft = self.shakeTotal = Math.max(0.05, seconds);
      },
      alarm: (on) => {
        self.alarmOn = on;
        self.alarmBeat = 0;
      },
      boom: (x, z, y = 2, size = 1) => {
        const p = local(x, z);
        self.boom(p.x, self.region.y + y, p.z, size);
      },
      flash: () => {
        self.flashLayer.setAlpha(1);
      },
      launch: (id = 'frame') => {
        const l = new Latch();
        const f = self.frames.get(id);
        if (!f || f.hidden) {
          l.finish();
          return l;
        }
        f.launch = { t: 0, dust: 0, latch: l };
        sfx.sortie();
        self.shakeAmp = 0.08;
        self.shakeLeft = self.shakeTotal = 2.2;
        return l;
      },
      young: (id, on) => {
        const a = self.actor(id);
        if (!a) return;
        const k = on ? 0.72 : 1;
        a.fig.root.scale.setScalar(k);
        if (a === self.me) a.portrait = on ? null : `pilot_${self.pilot}`;
        if (a === self.me) self.meYoung = on;
      },
      showFrame: (id, visible) => {
        const f = self.frames.get(id);
        if (f) {
          f.hidden = !visible;
          f.launch = null;
        }
      },
    };
  }

  /**
   * A conversation shot: side-on to a pair, or on one person from where they
   * face. Shared by the story's `shot` and by a word with anyone in the crowd.
   */
  private frameShot(a: { x: number; y: number; z: number }, facing: number, b?: { x: number; y: number; z: number }): void {
    const m = b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 } : a;
    const dx = b ? b.x - a.x : Math.sin(facing);
    const dz = b ? b.z - a.z : Math.cos(facing);
    const l = Math.hypot(dx, dz) || 1;
    // Side-on to the pair, a little toward the player's shoulder.
    const px = -dz / l;
    const pz = dx / l;
    const dist = Math.max(3.4, l * 1.4 + 1.6);
    this.view.scripted = {
      eye: new THREE.Vector3(m.x + px * dist - (dx / l) * 0.8, m.y + 1.7, m.z + pz * dist - (dz / l) * 0.8),
      at: new THREE.Vector3(m.x, m.y + 1.35, m.z),
    };
  }

  private completeChapter(): void {
    const ch = this.chapter;
    if (!ch) return;
    const label = ch.number === 0 ? 'PROLOGUE' : `CHAPTER ${ch.number}`;
    if (this.replay) {
      // A replay changes nothing: back to where the campaign really is.
      this.toast(`${label} · REPLAY COMPLETE`);
      this.nextPending = true;
      return;
    }
    const store = accounts();
    const first = !this.save.done.includes(ch.id);
    if (first) this.save.done.push(ch.id);
    for (const p of ch.features ?? []) store.unlock(p, 'story');
    if (first) store.addXp(XP_CHAPTER);
    this.save.chapter = ch.number + 1;
    this.save.objective = '';
    this.toast(`${label} COMPLETE${first ? ` · +${XP_CHAPTER} XP` : ''}`);
    const next = chapterFor(this.pilot, this.save.chapter);
    if (next) {
      // The next episode opens where it opens, not where this one ended.
      this.save.updated = 0;
      this.save.region = '';
      accounts().save();
      this.nextPending = true;
      return;
    }
    this.persist();
    // The world stays open: free roam until the next chapter is written.
    this.chapter = null;
    this.setObjective('Explore the Reach. The next chapter is not written yet.');
  }

  private startBattle(foe: PilotId, difficulty: Difficulty, mode: 'versus' | 'orbit'): Waitable<'win' | 'lose'> {
    const l = new Latch<'win' | 'lose'>();
    this.battleLatch = l;
    this.persist();
    session.campaignFight = { result: null };
    // The campaign launches the scene itself: a straight versus fight, side-on
    // or in FREE ORBIT as the story asked.
    session.mode = 'vsCpu';
    session.freeOrbit = mode === 'orbit';
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
    music.play(this.track(this.chapter?.music ?? 'calm'));
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

    // Dialogue owns confirm while it is up; a card waiting for the player takes it otherwise.
    // A press that closes a line or a card, or ends a script, is spent: it
    // must not also open a door or a conversation on the same frame.
    const heldAtStart = this.runner.busy || this.dialog.open || !!this.cardLatch;
    this.confirmNow = ui.confirm;
    this.dialog.update(dt, ui);
    this.updateKit(dt, ui.confirm && !this.dialog.open);
    this.runner.tick();
    if (this.nextPending && !this.runner.busy) {
      this.nextPending = false;
      this.runner.run(this.toNextChapter());
    }
    for (const e of this.runner.errors.splice(0)) console.error('[campaign] script error', e);

    const input = this.input$.read();
    const free = !this.runner.busy && !this.dialog.open && !this.cardLatch;
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
      if (ui.confirm && !heldAtStart) this.interact();
    } else {
      this.me.vel.x *= 0.8;
      this.me.vel.z *= 0.8;
    }
    this.stepActor(this.me, dt);
    for (const a of this.actors.values()) this.stepActor(a, dt);
    // The crowd keeps walking through cutscenes; only the pause menu stops it.
    // Indoors the yard outside holds still, centred on the door you came in by.
    this.life.update(dt, this.t, this.inside ? this.inside.spec.door : this.me.pos, !!this.inside);
    if (this.inside) {
      this.inside.update(dt, this.t);
      if (free && this.me.pos.z > this.inside.exitZ) this.runner.run(this.leaveRoom());
    }
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
      // Someone or something in the way (a crowd, a cart): a cutscene must not
      // hang on it. Without progress for a second and a half, step to the mark.
      const t = a.target;
      // A time budget too, for a walk that creeps round something and never quite arrives.
      if (t.left === undefined) t.left = (d / (t.run ? RUN : WALK)) * 1.6 + 2;
      t.left -= dt;
      if (t.best === undefined || d < t.best - 0.05) {
        t.best = d;
        t.stuck = 0;
      } else t.stuck = (t.stuck ?? 0) + dt;
      if (t.left <= 0) t.stuck = 2;
      if ((t.stuck ?? 0) > 1.5) {
        a.pos.x = t.x;
        a.pos.z = t.z;
        a.pos.y = this.walk.ground(t.x, t.z, a.pos.y + 0.6) ?? a.pos.y;
      }
      if (d < 0.3 || (t.stuck ?? 0) > 1.5) {
        a.vel.x = 0;
        a.vel.z = 0;
        const l = t.latch;
        a.target = null;
        l.finish();
      } else {
        const s = (a.target.run ? RUN : WALK) * (a === this.me && this.meYoung ? 0.85 : 1);
        a.vel.x = (dx / d) * s;
        a.vel.z = (dz / d) * s;
      }
    }
    const sp = Math.hypot(a.vel.x, a.vel.z);
    if (sp > 0.05) {
      const walk = a === this.me && this.inside ? this.inside.walk : this.walk;
      const next = walk.move(a.pos, a.vel.x * dt, a.vel.z * dt);
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
    if (this.inside) {
      const p = this.inside.nearestPerson({ x: me.x, z: me.z, facing: this.me.facing }, TALK_REACH);
      return p ? { kind: 'roomPerson', a: p } : null;
    }
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
    if (!best) {
      const door = doorNear(me.x, me.z, 1.9);
      if (door) best = { kind: 'door', a: door };
    }
    if (!best) {
      const p = this.life.nearestPerson({ x: me.x, z: me.z, facing: this.me.facing }, TALK_REACH);
      if (p) best = { kind: 'person', a: p };
    }
    if (!best) {
      const st = this.life.nearestStop(me, 3.6);
      if (st) best = { kind: 'tram', a: st };
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
    if (!n) return;
    if (n.kind === 'person') {
      this.runner.run(this.talkTo(n.a, this.life.figureOf(n.a.id)));
      return;
    }
    if (n.kind === 'roomPerson' && this.inside) {
      const k = this.talked.get(n.a.agent.id) ?? 0;
      // A room's own lines by turns with the yard's.
      const line = k % 2 === 0 ? this.inside.line(n.a, k) : undefined;
      this.runner.run(this.talkTo(n.a.agent, n.a.fig, line));
      return;
    }
    if (n.kind === 'door') {
      if (n.a.kind === 'sealed') {
        const api = this.api();
        this.runner.run(
          (function* (): Script {
            yield api.caption('SEALED · THE STANDING RULES KEEP THIS DOOR SHUT', 2.2);
          })(),
        );
      } else this.runner.run(this.enterRoom(n.a));
      return;
    }
    if (n.kind === 'tram') {
      this.runner.run(this.rideTram(n.a.tram, n.a.end, n.a.to));
      return;
    }
    if (!this.chapter) return;
    const api = this.api();
    if (n.kind === 'actor') {
      const a = n.a;
      a.facing = Math.atan2(this.me.pos.x - a.pos.x, this.me.pos.z - a.pos.z);
      this.me.facing = Math.atan2(a.pos.x - this.me.pos.x, a.pos.z - this.me.pos.z);
      this.runner.run(this.chapter.talk[a.id](api));
    } else if (n.kind === 'area') {
      this.runner.run(n.a.run(api));
    }
  }

  /** A word with someone in the crowd: they stop, turn, and say their piece. */
  private *talkTo(p: CrowdAgent, f?: PilotFigure, line?: string): Script {
    const r = regionById(p.region) ?? this.region;
    const n = this.talked.get(p.id) ?? 0;
    this.talked.set(p.id, n + 1);
    p.held = true;
    p.facing = Math.atan2(this.me.pos.x - p.x, this.me.pos.z - p.z);
    this.me.facing = Math.atan2(p.x - this.me.pos.x, p.z - this.me.pos.z);
    // Seated people keep their seat: they do not swivel to face you.
    const seatFacing = f?.sitting ? f.root.rotation.y : null;
    if (seatFacing !== null) p.facing = seatFacing;
    if (f) gesture(f, 'talk', 3);
    this.frameShot(this.me.pos, this.me.facing, { x: p.x, y: p.y, z: p.z });
    try {
      yield this.dialog.say(p.name, null, 0xffd166, line ?? barkFor(r.style, p.role, p.seed + n * 7));
    } finally {
      p.held = false;
      // Indoors the room's camera takes over again on the next frame.
      if (!this.inside) this.view.scripted = null;
    }
  }

  /**
   * A tram ride: the pilot boards at a stop, the camera rides alongside the
   * car the length of the span, and they step off in the next yard. Confirm
   * skips to the far end.
   */
  private *rideTram(tr: Tram, end: 0 | 1, to: RegionSpec): Script {
    yield this.fade(true, 0.35);
    tr.held = true;
    tr.dir = end === 0 ? 1 : -1;
    tr.s = end === 0 ? 0 : tr.length;
    this.me.fig.root.visible = false;
    this.me.vel.x = this.me.vel.z = 0;
    this.toast(`TRAM · ${to.name}`);
    yield this.fade(false, 0.35);
    const step = 1 / 60;
    let speed = 0;
    while (end === 0 ? tr.s < tr.length : tr.s > 0) {
      if (this.confirmNow && speed > 2) break;
      // Pull away, cruise, and brake into the far stop.
      const left = end === 0 ? tr.length - tr.s : tr.s;
      speed = Math.min(speed + 9 * step, 24, Math.max(3, left * 0.9));
      tr.s += tr.dir * speed * step;
      WorldLife.place(tr);
      this.me.pos.x = tr.x;
      this.me.pos.z = tr.z;
      this.me.pos.y = tr.y;
      // Beside and a little behind the car, looking along the line.
      const hx = Math.cos(tr.heading);
      const hz = -Math.sin(tr.heading);
      const y = tr.y + TRAM_LIFT + 1.6;
      this.view.scripted = {
        eye: new THREE.Vector3(tr.x - hx * 9 - hz * 7, y + 2.2, tr.z - hz * 9 + hx * 7),
        at: new THREE.Vector3(tr.x + hx * 4, y, tr.z + hz * 4),
      };
      yield 1;
    }
    yield this.fade(true, 0.35);
    tr.s = end === 0 ? tr.length : 0;
    WorldLife.place(tr);
    // Off at the far stop, facing into the yard.
    const p = end === 0 ? tr.path[tr.path.length - 1] : tr.path[0];
    const x = p.x + Math.sign(to.cx - p.x) * Math.min(2.5, Math.abs(to.cx - p.x));
    const z = p.z + Math.sign(to.cz - p.z) * Math.min(2.5, Math.abs(to.cz - p.z));
    this.me.pos.x = x;
    this.me.pos.z = z;
    this.me.pos.y = this.walk.ground(x, z, to.y + 0.6) ?? to.y;
    this.me.facing = Math.atan2(to.cx - x, to.cz - z);
    this.view.yaw = this.me.facing + Math.PI;
    this.me.fig.root.visible = true;
    this.view.scripted = null;
    this.view.stream(x, z, true);
    tr.held = false;
    tr.wait = 6;
    this.persist();
    yield this.fade(false, 0.45);
  }

  /** Into the next episode: the scene starts again on it, from its own opening. */
  private *toNextChapter(): Script {
    yield this.fade(true, 0.8);
    this.alarmOn = false;
    sfx.stopLoops();
    this.persist();
    this.scene.restart({ pilot: this.pilot });
  }

  /** Through a door: the room is built, takes the stage, and you are inside it. */
  private *enterRoom(spec: InteriorSpec): Script {
    yield this.fade(true, 0.3);
    const room = new Room(spec, this.pilot);
    this.inside = room;
    this.view.enterRoom(room.group);
    const e = room.entry();
    this.me.pos.x = e.x;
    this.me.pos.y = e.y;
    this.me.pos.z = e.z;
    this.me.vel.x = this.me.vel.z = 0;
    this.me.facing = e.facing;
    this.roomCamera();
    this.view.snap();
    this.toast(spec.name);
    yield this.fade(false, 0.35);
  }

  /** Back out through the door, onto the yard where you went in. */
  private *leaveRoom(): Script {
    const room = this.inside;
    if (!room) return;
    yield this.fade(true, 0.3);
    this.view.leaveRoom(room.group);
    room.dispose();
    this.inside = null;
    const d = room.spec.door;
    this.me.pos.x = d.x;
    this.me.pos.z = d.z;
    this.me.pos.y = this.walk.ground(d.x, d.z, d.y + 0.6) ?? d.y;
    this.me.vel.x = this.me.vel.z = 0;
    this.me.facing = d.facing;
    this.view.yaw = d.facing + Math.PI;
    this.view.scripted = null;
    this.view.snap();
    this.view.stream(d.x, d.z, true);
    this.persist();
    yield this.fade(false, 0.35);
  }

  /** Indoors: the room's fixed camera, and "up" walks away from it. */
  private roomCamera(): void {
    if (!this.inside) return;
    this.inside.camera(this.me.pos, this.roomEye, this.roomAt);
    this.view.scripted = { eye: this.roomEye, at: this.roomAt };
    this.view.yaw = Math.atan2(this.roomEye.x - this.roomAt.x, this.roomEye.z - this.roomAt.z);
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
    const label = this.inside ? `${this.inside.spec.name}\n${this.inside.spec.region.name}` : r ? `${r.name}\n${r.holder}` : 'THE SPANS';
    if (label !== this.lastRegion) {
      this.lastRegion = label;
      this.regionText.setText(label);
      const named = this.inside ? this.inside.spec.name : r?.name;
      if (named && this.t > 1) this.toast(named);
    }
    this.nearest = free ? this.findNearest() : null;
    const n = this.nearest;
    const what = !n
      ? ''
      : n.kind === 'actor' || n.kind === 'person'
        ? `TALK · ${n.a.name}`
        : n.kind === 'roomPerson'
          ? `TALK · ${n.a.agent.name}`
          : n.kind === 'tram'
            ? `RIDE THE TRAM · ${n.a.to.name}`
            : n.kind === 'door'
              ? n.a.kind === 'sealed'
                ? 'SEALED · STANDING RULES'
                : `ENTER · ${n.a.name}`
              : n.a.prompt;
    this.promptText.setText(what ? `Z  ${what}` : '');

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
    if (this.inside && !this.runner.busy) this.roomCamera();
    this.view.stream(this.me.pos.x, this.me.pos.z);
    const ct = this.camTween;
    if (ct) {
      ct.t += dt;
      const k = Math.min(1, ct.t / ct.dur);
      const e = k * k * (3 - 2 * k);
      this.view.scripted = { eye: ct.from[0].clone().lerp(ct.to[0], e), at: ct.from[1].clone().lerp(ct.to[1], e) };
      this.view.snap();
      if (k >= 1) {
        this.camTween = null;
        ct.latch.finish();
      }
    }
    this.poseFrames(this.paused ? 0 : dt);
    this.fx?.update(dt);
    const heading = Math.atan2(this.me.vel.x, this.me.vel.z);
    this.view.follow(this.me.pos, heading, moving, dt);
    if (this.shakeLeft > 0) {
      this.shakeLeft = Math.max(0, this.shakeLeft - dt);
      const a = this.shakeAmp * (this.shakeLeft / this.shakeTotal);
      this.view.camera.position.x += (Math.random() - 0.5) * 2 * a;
      this.view.camera.position.y += (Math.random() - 0.5) * 2 * a;
      this.view.camera.position.z += (Math.random() - 0.5) * 2 * a;
    }
    const st = voxelStage();
    if (st.active === this.view) st.render();
  }

  private persist(): void {
    if (!this.me) return;
    // A replay is somewhere else in time: the real campaign stays where it was.
    if (this.replay) return;
    // Indoors, the save is the door you went in by: rooms are not kept.
    const at = this.inside ? this.inside.spec.door : { ...this.me.pos, facing: this.me.facing };
    const r = this.regionAt(at.x, at.z) ?? this.region;
    this.save.region = r.id;
    this.save.x = at.x;
    this.save.z = at.z;
    this.save.facing = at.facing;
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
    const pro = chapterFor(this.pilot, 0);
    const rows: MenuItem[] = [
      { label: 'RESUME', onSelect: () => this.closePause() },
      // Anyone past the prologue may watch it again: campaigns begun before the
      // prologues existed never played it, and are past it all the same.
      ...(pro && !this.replay && (this.save.done.includes(pro.id) || this.save.chapter >= 1)
        ? [
            {
              label: 'REPLAY PROLOGUE',
              onSelect: () => {
                this.persist();
                this.scene.restart({ pilot: this.pilot, replay: 0 });
              },
            },
          ]
        : []),
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
