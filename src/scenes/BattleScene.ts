import Phaser from 'phaser';
import { ARENA_H, ARENA_W, TICK_MS, VIEW_H, VIEW_W } from '../core/GameConfig';
import { Difficulty, session } from '../core/Session';
import { ARC_TETHER_WIDTH, MatchSim, segmentHitsCircle } from '../combat/MatchSim';
import { MECHS } from '../data/mechs';
import { RivalAI } from '../ai/RivalAI';
import { Rng } from '../core/Rng';
import { InputManager } from '../input/InputManager';
import { MechRenderer, PART_SCALE, type MechPoseSource } from '../render/MechRenderer';
import { partTexture } from '../render/PartTexture';
import { Effects } from '../render/Effects';
import { Backdrop } from '../render/Backdrop';
import { GroundPlane } from '../render/GroundPlane';
import { TEX } from '../render/Textures';
import { ProjectileLayer } from '../render/ProjectileLayer';
import { createProjectileTextures } from '../render/ProjTextures';
import { Hud } from '../ui/Hud';
import { BanterBox } from '../ui/BanterBox';
import { SatCutscene } from '../ui/SatCutscene';
import { pickConversation } from '../data/matchups';
import { pickBanter, type BanterTrigger } from '../data/banter';
import { Menu, makeScrim, bigTitle, smallText, type MenuItem } from '../ui/Menu';
import { audioMenuItems } from '../ui/AudioOptions';
import { commandHeading, commandRows, trainingMenuItems } from '../ui/TrainingOptions';
import { dummyInput } from '../combat/TrainingDummy';
import { DebugOverlay } from '../debug/DebugOverlay';
import { sfx } from '../audio/Sfx';
import { music } from '../audio/Music';
import { DANGER_LIFE_FRACTION, pickBattleCue } from '../audio/MusicBank';
import { MatchPhase, ProjKind, SAT_MODE_NAMES, SatMode, type InputFrame } from '../combat/types';
import { ELEMENTS, type Element } from '../combat/Status';
import { DOME_MAX, DroneMode, DECOY_COUNT } from '../combat/Supporter';
import type { Combatant } from '../combat/Combatant';
import { clamp, wrapAngle } from '../core/MathUtil';
import { depthScaleAt, depthSortAt } from '../core/Depth';


/**
 * Camera framing.
 *
 * `CAM_ZOOM_MIN` is low enough to fit the **whole arena** — 2400x1200 against a
 * 960x540 viewport needs 0.34 horizontally and 0.36 vertically once the margins
 * are counted — so there is no separation at which a pilot can be pushed off
 * screen. That was the bug: the old floor of 0.74 could frame about half the
 * arena's width and simply lost whoever was furthest out.
 */
const CAM_ZOOM_MIN = 0.34;
const CAM_ZOOM_MAX = 1.34;
/** Clearance kept around each pilot when solving the zoom, in world px. */
const CAM_MARGIN_X = 190;
const CAM_MARGIN_Y = 150;
/** Clearance kept around each pilot when clamping the focus point. */
const CAM_EDGE = 96;
/**
 * Screen height across the top that the HUD occupies.
 *
 * Framing solves against the band *below* this rather than the whole viewport,
 * and the view is then pushed down by half of it. Without that, a pilot at the
 * top of the arena is technically on screen and practically invisible behind
 * their own life bar — which is the other half of "barely being seen".
 */
const CAM_HUD_BAND = 168;

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
  private thrusterFx!: Effects;
  private backdrop!: Backdrop;
  private ground!: GroundPlane;
  private renderers: MechRenderer[] = [];
  private projLayer!: ProjectileLayer;
  /** One beam-sword sprite per combatant, shown only while swinging. */
  private blades: Phaser.GameObjects.Image[] = [];
  /**
   * Per side: hold the melee weapon drawn, on purpose, indefinitely.
   *
   * Presentation only, and deliberately kept here rather than on `Combatant` —
   * a field the simulation cannot see is a field the simulation cannot be
   * changed by. Index 0 is the player; nothing toggles index 1 today.
   */
  private weaponHeld: boolean[] = [false, false];
  /** One supporter drone sprite per combatant, plus its readiness ring. */
  private drones: Phaser.GameObjects.Image[] = [];
  private droneRings: Phaser.GameObjects.Graphics[] = [];
  /**
   * The `arcTether` wire, one per side.
   *
   * Drawn *under* the drones and mechs so it reads as something strung between
   * them rather than laid over the top. Until this existed the ability was
   * completely invisible: a live cable that deals 34 a hit and whose entire skill
   * is where you stand, with no line to stand relative to.
   */
  private droneTethers: Phaser.GameObjects.Graphics[] = [];
  /**
   * AEGIS's dome, one per side.
   *
   * The bubble erases every non-piercing shot within `roleValue` px of the
   * drone, and it too was drawn nowhere: a 150 px wall deciding whether a whole
   * volley arrives, with nothing on screen to say it was there. The **rim** is
   * the load-bearing part — `MatchSim` cuts at exactly that radius, so the edge
   * is drawn crisply and at exactly that radius. A player has to be able to see
   * where the wall stops.
   */
  private droneDomes: Phaser.GameObjects.Graphics[] = [];
  /**
   * Verlet rope points for WARDEN's feed cable, one array per side.
   *
   * **Render-only.** `MatchSim` does not know this exists and must not: the
   * tether's effect has no geometry at all — it adds barrier while the drone is
   * on station, from wherever it happens to be. The straight line was accurate
   * and lifeless. A cable that hangs, lags behind the drone and swings when the
   * machine moves says "physical line between two bodies" in a way a segment
   * never will, and costs the simulation nothing.
   *
   * Deliberately *not* applied to WISP's arc: that one is a weapon, drawn taut
   * and crackling, and the two escorts read better for being different objects.
   */
  private tetherRope: { x: number; y: number; px: number; py: number }[][] = [];
  /**
   * Recent dome impacts per side: which way the rim was struck, and how much
   * flare is left. A shield that swallows a salvo without reacting reads as
   * scenery rather than as the thing that just saved its owner.
   */
  private domeHits: { ang: number; life: number }[][] = [];
  /**
   * ARBITER's paint, one per side, drawn on the machine **wearing** it.
   *
   * Indexed by the victim, because that is where `paintedTicks` lives and where
   * the mark belongs: being painted multiplies incoming damage, so the machine
   * carrying it is the one that needs to know. The line home is drawn too — a
   * debuff with no visible author teaches nobody to shoot the drone.
   */
  private paintMarks: Phaser.GameObjects.Graphics[] = [];
  /**
   * The sniper stance's sight line, one per side.
   *
   * Built for every mech and left empty on the seven that have no stance — the
   * same trade the dome and the paint reticle already make, and cheaper than
   * branching the render path on a chassis.
   */
  private sniperMarks: Phaser.GameObjects.Graphics[] = [];
  /** LAST STAND aura, one per side. Empty on the seven that never trigger it. */
  private lastStandAuras: Phaser.GameObjects.Graphics[] = [];
  /** OVERDRIVE aura, one per side. Also draws the post-burnout blade flare. */
  private overdriveAuras: Phaser.GameObjects.Graphics[] = [];
  /** One per side; only a `decoy` drone ever shows its own. */
  private decoyGhosts: MechRenderer[] = [];
  /** Animation state per projection, keyed by `combatantId * DECOY_COUNT + slot`. */
  private decoyAnim: Record<number, { bobPhase: number; bank: number }> = {};

  /** Pilot speech boxes, indexed the same way as `combatants`. */
  private banter: BanterBox[] = [];
  /** Deterministic source for line choice, so a replayed match says the same things. */
  private banterRng!: Rng;
  /** Once-only banter triggers already spent, keyed `<combatantId>:<trigger>`. */
  private banterFired = new Set<string>();
  /**
   * Lines waiting their turn.
   *
   * A matchup conversation is a sequence, not a burst: showing both halves at
   * once is not a conversation, it is two people talking over each other. The
   * queue releases one line at a time and waits for it to be readable.
   */
  private banterQueue: { id: number; line: string; trigger: BanterTrigger }[] = [];
  private banterDelay = 0;
  private cutscene!: SatCutscene;

  /** Whichever of the three candidates won this match's roll. */
  private battleCue: string | null = null;
  /**
   * True once either pilot has dropped under a quarter life and `battle_danger`
   * has taken over.
   *
   * One-way within a match. Life only ever goes down in this game, so a flip
   * back could only come from the threshold being straddled by rounding — and
   * a soundtrack that switches back and forth across one hit is worse than one
   * that commits.
   */
  private danger = false;
  /** Mirrors whatever is currently asking the soundtrack to step aside. */
  private musicDucked = false;

  private accumulator = 0;
  private paused = false;
  private pauseUi?: { scrim: Phaser.GameObjects.Rectangle; menu: Menu; extra: Phaser.GameObjects.GameObject[] };
  /** Command-reference overlay, up only while the pause menu is also up. */
  private commandsUi?: Phaser.GameObjects.GameObject[];
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
    this.commandsUi = undefined;
    this.banter = [];
    this.banterQueue = [];
    this.banterDelay = 0;
    this.blades = [];
    this.drones = [];
    this.droneRings = [];
    this.droneTethers = [];
    this.droneDomes = [];
    this.domeHits = [];
    this.tetherRope = [];
    this.paintMarks = [];
    this.sniperMarks = [];
    this.lastStandAuras = [];
    this.overdriveAuras = [];
    this.decoyGhosts = [];
    this.decoyAnim = {};
    this.worldObjects = [];
    this.renderers = [];
    this.weaponHeld = [false, false];

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

    // Training's switches survive a restart, so a rig set up once stays set up
    // across rematches. Health is re-asserted here rather than only on selection
    // because a fresh match starts everyone at full.
    this.applyTraining();
    if (session.mode === 'training') this.setTrainingHealth(session.training.health);

    // Each side runs its own tier. In `aiVsAi` that is the whole point of the
    // mode — an EXTREME rival taking apart an EASY one is a different thing to
    // watch than two of the same. Training's rival never acts, so its tier is
    // irrelevant and simply takes the floor.
    const aiSeed = session.seed() ^ 0x9e3779b9;
    this.ai = new RivalAI(
      {
        difficulty:
          session.mode === 'training'
            ? (session.training.p2Difficulty as Difficulty)
            : session.enemyDifficulty,
      },
      new Rng(aiSeed),
    );
    if (session.mode === 'aiVsAi') {
      this.playerAi = new RivalAI(
        { difficulty: session.playerDifficulty },
        new Rng(aiSeed ^ 0x2545f491),
      );
    }

    // ---- soundtrack ------------------------------------------------------
    // Three candidates — both pilots' themes and the stage's — one per match,
    // re-rolled on a rematch.
    //
    // `Math.random`, deliberately, and not `this.sim`'s generator: the match is
    // seeded and `match.test.ts` asserts a bit-identical replay, so taking a
    // number out of that stream to choose music would change the fight itself.
    this.danger = false;
    this.musicDucked = false;
    music.duck(false);
    this.battleCue = pickBattleCue(
      {
        mode: session.mode,
        playerMech: session.playerMech,
        enemyMech: session.enemyMech,
        arena: session.arena,
      },
      Math.random,
    );
    // Idempotent, so a rematch that re-rolls the same track never restarts it.
    music.play(this.battleCue);

    this.input$ = new InputManager(this);
    this.input$.reset();

    this.backdrop = new Backdrop(this);
    this.ground = new GroundPlane(this);
    this.effects = new Effects(this, 50);
    // **Exhaust belongs behind the machine.** One shared layer at depth 50 put
    // plumes over the chassis, so they read as painted on rather than as coming
    // out of a nozzle. Impacts and explosions still want to be in front, so
    // this is a second pool underneath the mechs (20/21) rather than a move.
    // Three jets per nozzle at full burn, two nozzles, two machines.
    this.thrusterFx = new Effects(this, 15, 420);

    this.renderers = [
      new MechRenderer(this, playerDef, playerDef.id),
      new MechRenderer(this, enemyDef, enemyDef.id),
    ];
    this.renderers[0].setDepth(20);
    this.renderers[1].setDepth(21);

    // Projectiles. Three additive layers per shot — see ProjectileLayer.
    createProjectileTextures(this);
    this.projLayer = new ProjectileLayer(this);

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
      // Under the drone and the mechs: a wire is behind the things it joins.
      this.droneTethers.push(this.add.graphics());
      // Built for every mech and left empty on the six that raise no dome and
      // paint nobody, which is cheaper than branching the render path on a role
      // — the same trade the decoy ghost below already makes.
      //
      // **Additive**, like the blades, the projectile layer and every effect in
      // `Effects`. Drawn in NORMAL blend these read as circles someone drew on
      // the screen; drawn additively they read as light, which is what every
      // other energy effect in this game already is. It is the single largest
      // difference between the two, far more than any alpha.
      const dome = this.add.graphics();
      dome.setBlendMode(Phaser.BlendModes.ADD);
      this.droneDomes.push(dome);
      this.domeHits.push([]);
      this.tetherRope.push([]);
      const paint = this.add.graphics();
      paint.setBlendMode(Phaser.BlendModes.ADD);
      this.paintMarks.push(paint);
      const sniper = this.add.graphics();
      sniper.setBlendMode(Phaser.BlendModes.ADD);
      this.sniperMarks.push(sniper);
      const stand = this.add.graphics();
      stand.setBlendMode(Phaser.BlendModes.ADD);
      this.lastStandAuras.push(stand);
      const over = this.add.graphics();
      over.setBlendMode(Phaser.BlendModes.ADD);
      this.overdriveAuras.push(over);
      this.droneRings.push(this.add.graphics());

      /**
       * The decoy silhouette, for a `decoy` drone.
       *
       * A ghost of the **whole chassis**, assembled from the same rig the real
       * machine is drawn from — the first cut used the `core` part alone and was
       * a floating torso, which fools nobody and looks like a missing asset. It
       * has to be recognisably NULLTIDE at a glance or the deception has nothing
       * to trade on.
       *
       * Built for every mech and left invisible on the seven that never project
       * one, which is cheaper than branching the render path on a role.
       */
      // One per projection, since NULLTIDE now puts two on the field at once.
      // Flattened per side into a fixed-stride array: side `i` owns
      // `[i * DECOY_COUNT, i * DECOY_COUNT + DECOY_COUNT)`.
      for (let k = 0; k < DECOY_COUNT; k++) this.decoyGhosts.push(this.buildDecoyRenderer(def));
    }

    this.hud = new Hud(this, this.sim);

    // Pilot banter. The boxes sit in the bottom corners, on the same side as
    // their owner's gauges, so who is speaking is legible without reading.
    this.banterFired = new Set();
    this.banterRng = new Rng(aiSeed ^ 0x51ed2701);
    this.banter = [
      new BanterBox(this, false, `pilot_${playerDef.id}_thumb`, playerDef.pilot, playerDef.tint.accent),
      new BanterBox(this, true, `pilot_${enemyDef.id}_thumb`, enemyDef.pilot, enemyDef.tint.accent),
    ];

    this.cutscene = new SatCutscene(this, TEX.streak);

    this.debug = new DebugOverlay(this, this.sim, this.ai);

    // **No bounds.** Phaser clamps scroll to the camera bounds, and once the
    // zoom drops below ~0.45 the view is taller and wider than the arena — so
    // the clamp silently overrode the framing and shoved a pilot back under the
    // HUD however carefully the centre had been solved. The framing clamp in
    // `render()` is what keeps the pair on screen, and it does not need help.
    this.cameras.main.removeBounds();
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
      ...this.projLayer.objects,
      ...this.blades,
      ...this.droneTethers,
      ...this.droneDomes,
      ...this.drones,
      ...this.droneRings,
      ...this.paintMarks,
      // **Required, not optional.** Anything drawn in world space that is not in
      // this list is rendered by the UI camera as well — at zoom 1 and unscrolled
      // — so it appears a second time, larger and somewhere else entirely. The
      // sniper brackets shipped without it and read as a stray empty target box
      // floating in the middle of the arena. `docs/TESTING_PROTOCOL.md` §4.7
      // records this trap; it caught the next person anyway.
      ...this.sniperMarks,
      // Same rule as every other world-space Graphics: in this list or the UI
      // camera draws a second copy of it somewhere else. See D107.
      ...this.lastStandAuras,
      ...this.overdriveAuras,
      ...this.decoyGhosts.map((r) => r.root),
      this.effects.container,
      this.thrusterFx.container,
      ...this.debug.worldObjects,
    ];
    const uiObjects = [
      this.hud.container,
      ...this.banter.flatMap((b) => b.objects),
      ...this.cutscene.objects,
      ...this.debug.uiObjects,
    ];
    this.cameras.main.ignore(uiObjects);
    this.uiCam.ignore(this.worldObjects);

    this.hud.banner('READY', 60);
    sfx.matchReady();

    // Losing focus should not bank up a huge catch-up burst. See `onBlur` for
    // why only one mode also pauses.
    this.game.events.on(Phaser.Core.Events.BLUR, this.onBlur, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.BLUR, this.onBlur, this);
    });
  }

  /**
   * The window lost focus — clicking another application, or another tab.
   *
   * **Only `vsCpu` auto-pauses.** The pause exists to stop a human being shot
   * while they are not looking at the screen, and that is the only mode where a
   * human is holding a stick: `aiVsAi` has nobody to protect, and in `training`
   * the rival is a dummy that never acts, so there is nothing to be protected
   * *from*. Pausing those two was pure obstruction — a match left running to be
   * watched, or a rig left running while its pilot does something else, stopped
   * dead and put a menu over itself the moment the window went to the back.
   *
   * The accumulator reset is unconditional and is the part that always mattered:
   * without it the first frame back tries to pay off every tick owed since the
   * window went away, in one burst.
   */
  private onBlur(): void {
    this.accumulator = 0;
    if (session.mode !== 'vsCpu') return;
    if (!this.paused && !this.finished) this.openPause();
  }

  // ------------------------------------------------------------------- pause

  private openPause(): void {
    if (this.paused) return;
    this.paused = true;
    const training = session.mode === 'training';
    const scrim = makeScrim(this);
    const title = bigTitle(this, training ? 'TRAINING' : 'PAUSED', 140, 40, '#eaf2ff');
    const hint = smallText(
      this,
      training
        ? 'ESC resumes · LEFT / RIGHT change a setting · F1 / F2 debug overlays'
        : 'ESC resumes · LEFT / RIGHT adjust volume · F1 / F2 debug overlays',
      VIEW_W / 2,
      VIEW_H - 40,
      12,
      '#63748c',
    );
    // Training swaps the volume rows for the rig switches. The audio sliders are
    // still reachable from the title screen; what a player opens *this* menu for
    // in training is the drill, not the mix.
    const options = training ? this.trainingRows() : audioMenuItems();
    const rows: MenuItem[] = [
      { label: 'RESUME', onSelect: () => this.closePause() },
      ...options,
      { label: 'RESTART MATCH', onSelect: () => this.restart() },
      { label: 'MECH SELECT', onSelect: () => this.toMechSelect() },
      { label: 'QUIT TO TITLE', onSelect: () => this.toTitle() },
    ];
    // Training runs much longer than the ordinary menu, which walked the last
    // entry into the footer hint. Tighten and lift first; past what fits, let
    // the menu scroll — it already draws arrows when there is more either way.
    const tall = rows.length > 7;
    const menu = new Menu(this, rows, VIEW_W / 2, tall ? 190 : 230, {
      size: 22,
      gap: tall ? 30 : 36,
      maxVisible: 9,
    });
    // Pause chrome is UI: keep it off the zoomed world camera.
    this.cameras.main.ignore([scrim, title, hint, menu.container]);
    this.pauseUi = { scrim, menu, extra: [title, hint] };
  }

  // ---------------------------------------------------------------- training

  /**
   * Pushes every training switch at the live simulation.
   *
   * Called once on `create` and again whenever a row changes, so the menu never
   * has to remember which of its settings are already applied. Health is the
   * exception and is applied only on selection — re-asserting it here would undo
   * every hit the player had taken since, which is the opposite of a drill.
   */
  private applyTraining(): void {
    if (session.mode !== 'training') return;
    this.sim.dronesEnabled = session.training.drones;
    for (const c of this.sim.combatants) c.satFree = session.training.infiniteSat;
  }

  /**
   * Rebuilds the rival brain after PLAYER 2's tier changed.
   *
   * `RivalAI` takes its profile at construction — the tier gates whole traits
   * rather than scaling a dial, so there is nothing to mutate. Rebuilding also
   * discards whatever plan the old brain was committed to, which is the right
   * behaviour: an EXTREME plan half-executed by a NORMAL rival is neither.
   */
  private applyP2(): void {
    if (session.mode !== 'training') return;
    this.ai = new RivalAI(
      { difficulty: session.training.p2Difficulty as Difficulty },
      new Rng((session.seed() ^ 0x9e3779b9) + session.training.p2Difficulty),
    );
  }

  private setTrainingHealth(frac: number): void {
    const c = this.sim.combatants[0];
    if (!c) return;
    c.life = Math.max(1, Math.round(c.def.gauges.maxLife * frac));
  }

  private trainingRows(): MenuItem[] {
    return trainingMenuItems({
      applyDrones: () => this.applyTraining(),
      applySat: () => this.applyTraining(),
      applyHealth: (frac) => this.setTrainingHealth(frac),
      applyP2: () => this.applyP2(),
      openCommands: () => this.openCommands(),
      resume: () => this.closePause(),
    });
  }

  /**
   * The command reference, drawn over the paused match.
   *
   * Replaces the menu rather than layering on it: the pause overlay already owns
   * up/down/confirm, and two things reading the same edges is how a menu ends up
   * moving two rows per press. The menu is hidden, not destroyed, so returning
   * lands on the row the player left.
   */
  private openCommands(): void {
    if (!this.pauseUi || this.commandsUi) return;
    // The heading and the footer hint go with the menu. Hiding only the rows
    // left 'TRAINING' printed straight through 'COMMAND LIST' and two different
    // hints stacked at the bottom.
    this.setPauseChromeVisible(false);
    const objs: Phaser.GameObjects.GameObject[] = [];
    const heading = bigTitle(this, 'COMMAND LIST', 96, 30, '#eaf2ff');
    objs.push(heading);

    // Both training slots: the dummy's list is what you are practising against.
    const ids = [session.playerMech, session.enemyMech];
    let y = 150;
    for (const id of ids) {
      objs.push(smallText(this, commandHeading(id), VIEW_W / 2, y, 15, '#ffd166'));
      y += 26;
      const rows = commandRows(id);
      if (!rows.length) {
        objs.push(smallText(this, 'no command motions', VIEW_W / 2, y, 12, '#63748c'));
        y += 24;
      }
      for (const r of rows) {
        objs.push(smallText(this, r.motion, VIEW_W / 2 - 120, y, 13, '#cfe0f5', [1, 0.5]));
        objs.push(smallText(this, r.attack, VIEW_W / 2 - 96, y, 13, '#8fa3bd', [0, 0.5]));
        y += 22;
      }
      y += 14;
    }
    objs.push(
      smallText(
        this,
        'Directions are relative to the way you are facing.  ESC returns.',
        VIEW_W / 2,
        VIEW_H - 62,
        12,
        '#63748c',
      ),
    );
    this.cameras.main.ignore(objs);
    this.commandsUi = objs;
  }

  private closeCommands(): void {
    if (!this.commandsUi) return;
    for (const o of this.commandsUi) o.destroy();
    this.commandsUi = undefined;
    this.setPauseChromeVisible(true);
  }

  /** The pause menu and its heading and hint, shown or hidden as one thing. */
  private setPauseChromeVisible(v: boolean): void {
    if (!this.pauseUi) return;
    this.pauseUi.menu.setVisible(v);
    for (const e of this.pauseUi.extra) (e as Phaser.GameObjects.Text).setVisible(v);
  }

  private closePause(): void {
    this.closeCommands();
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

  /**
   * Back to the roster, keeping the mode.
   *
   * `MechSelect` reads `session.mode`, which nobody has touched since the menu
   * set it, so this lands on the right screen for all three modes without a
   * branch — `aiVsAi` still gets both skill dials, `training` still gets none.
   *
   * No `matchIndex++` here: `MechSelect.start()` already bumps it, so picking
   * the same two machines again still gets a fresh seed rather than replaying
   * the identical fight.
   */
  private toMechSelect(): void {
    this.scene.start('MechSelect');
  }

  private toTitle(): void {
    this.scene.start('Title');
  }

  // -------------------------------------------------------------------- loop

  override update(_time: number, delta: number): void {
    const dt = Math.min(delta, 100) / 1000;
    const ui = this.input$.readUi();

    // The soundtrack steps aside for anything that wants to be heard over it:
    // the saturation cutscene's spoken line, and the pause menu. Mirrored here
    // rather than at each call site so the two cannot fight over it — and above
    // the pause early-return, or unpausing would never lift the duck.
    const wantDuck = this.paused || this.cutscene.active;
    if (wantDuck !== this.musicDucked) {
      this.musicDucked = wantDuck;
      music.duck(wantDuck);
    }

    if (ui.toggleDebug) this.debug.toggleText();
    if (ui.toggleHitboxes) this.debug.toggleHitboxes();
    // Player slot only. Sits with the debug toggles because it is the same class
    // of thing — a view state read from a UI edge, never from `InputFrame`.
    if (ui.weaponDraw) this.weaponHeld[0] = !this.weaponHeld[0];

    if (this.paused) {
      // The command list owns the overlay while it is up: it consumes pause and
      // confirm to step back to the menu, so neither reaches the rows beneath
      // and Escape does not skip straight out of the pause screen.
      if (this.commandsUi) {
        if (ui.pause || ui.cancel || ui.confirm) this.closeCommands();
        return;
      }
      if (ui.up) this.pauseUi?.menu.move(-1);
      if (ui.down) this.pauseUi?.menu.move(1);
      if (ui.left) this.pauseUi?.menu.adjust(-1);
      if (ui.right) this.pauseUi?.menu.adjust(1);
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
    // The saturation cutscene genuinely stops the match: it consumes ticks that
    // would otherwise have gone to `stepSim`, so neither pilot gains or loses a
    // frame of advantage from it.
    this.accumulator += Math.min(delta, 100);
    let steps = 0;
    while (this.accumulator >= TICK_MS && steps < 6) {
      this.accumulator -= TICK_MS;
      steps++;
      if (this.cutscene.active) this.cutscene.step();
      else this.stepSim();
    }
    // If we are hopelessly behind, drop the backlog rather than stuttering.
    if (this.accumulator > TICK_MS * 6) this.accumulator = 0;

    this.checkDanger();
    this.render(dt);
  }

  /**
   * Hands the soundtrack over to `battle_danger` when either pilot drops under a
   * quarter life.
   *
   * Deliberately shared rather than per-pilot: eight danger variants would mean
   * twenty-three tracks each heard rarely, where one escalation cutting across
   * whoever's theme is playing reads as the game itself changing gear.
   *
   * Not in training. Nothing there can hurt the player, so the only way to reach
   * the threshold is by working the dummy down — and swapping the low-fatigue
   * practice track for a last-stand one because you shot a target is nonsense.
   */
  private checkDanger(): void {
    if (this.danger || this.battleCue === null || session.mode === 'training') return;
    const s = this.sim;
    const low = (c: Combatant): boolean =>
      c.life / c.def.gauges.maxLife < DANGER_LIFE_FRACTION && c.life > 0;
    if (!low(s.player) && !low(s.enemy)) return;
    this.danger = true;
    music.play('battle_danger', 1.2);
  }

  private stepSim(): void {
    const s = this.sim;

    let playerInput: InputFrame;
    if (session.mode === 'aiVsAi' && this.playerAi) {
      playerInput = this.playerAi.think(s.player, s.enemy, s.activeProjectiles(), ARENA_W, ARENA_H);
    } else {
      playerInput = this.input$.read();
    }

    // In training the rival never acts on its own — it woke up on the first hit
    // once, which is not a training mode. It is a dummy running whatever script
    // the pause menu set, unless the slot has been handed to a real CPU.
    let enemyInput: InputFrame;
    if (session.mode === 'training') {
      enemyInput =
        session.training.p2 === 'cpu'
          ? this.ai.think(s.enemy, s.player, s.activeProjectiles(), ARENA_W, ARENA_H)
          : dummyInput(session.training, s.tick, s.enemy.facing);
    } else {
      enemyInput = this.ai.think(s.enemy, s.player, s.activeProjectiles(), ARENA_W, ARENA_H);
    }

    const wasPhase = s.phase;
    const wasDowns = s.playerDowns;
    s.step(playerInput, enemyInput);

    // A revive hands back a full bar, which would quietly undo a rig set to 25 %
    // — and 25 % is chosen precisely to sit inside desperation, so silently
    // restoring it turns the drill into a different one. Re-assert it on the way
    // back up, not every tick: doing it continuously would erase every hit taken.
    if (session.mode === 'training' && s.playerDowns > wasDowns) {
      this.setTrainingHealth(session.training.health);
    }

    if (wasPhase === MatchPhase.Intro && s.phase === MatchPhase.Fight) {
      this.hud.banner('FIGHT', 70);
      sfx.matchFight();
      this.openConversation();
    }

    this.consumeEvents();
    this.checkBanterState();
    this.drainBanterQueue();

    if (s.phase === MatchPhase.Over && !this.finished) {
      this.finished = true;
      session.lastOutcome = s.outcome;
      session.lastTimeLeft = s.secondsLeft;
      session.lastPlayerLife = s.player.life;
      session.lastEnemyLife = s.enemy.life;
      this.time.delayedCall(280, () => this.scene.start('Results'));
    }
  }

  /**
   * Offers a line to one pilot's box.
   *
   * `once` triggers fire at most a single time per match — nobody needs to be
   * told twice that they are hurt. The roll comes from the scene's own seeded
   * generator rather than `Math.random`, so the same match plays back with the
   * same dialogue.
   */
  private speak(id: number, trigger: BanterTrigger, once = false): void {
    const box = this.banter[id];
    if (!box) return;
    const key = `${id}:${trigger}`;
    if (once) {
      if (this.banterFired.has(key)) return;
      this.banterFired.add(key);
    }
    const c = this.byId(id);
    if (!c) return;
    const line = pickBanter(c.def.id, trigger, this.banterRng.next());
    if (line) box.say(line, trigger);
  }

  /**
   * Queues the pair's opening exchange.
   *
   * Falls back to each pilot's own generic `intro` line when a pair has no
   * written conversation, so adding a ninth chassis never produces a silent
   * round while its 36 new matchups are being written.
   */
  private openConversation(): void {
    const s = this.sim;
    const convo = pickConversation(s.player.def.id, s.enemy.def.id, this.banterRng.next());
    if (!convo) {
      for (const c of s.combatants) this.queueLine(c.id, 'intro');
      return;
    }
    for (const ex of convo) {
      // A mirror match has both speakers on the same mech id, so the exchange
      // has to alternate by position in the conversation rather than by lookup.
      const spoken = this.banterQueue.filter((q) => q.trigger === 'intro').length;
      const isMirror = s.player.def.id === s.enemy.def.id;
      const id = isMirror
        ? (spoken % 2 === 0 ? s.player.id : s.enemy.id)
        : (ex.who === s.player.def.id ? s.player.id : s.enemy.id);
      this.banterQueue.push({ id, line: ex.line, trigger: 'intro' });
    }
  }

  /** Queues a pilot's own generic line for a trigger. */
  private queueLine(id: number, trigger: BanterTrigger): void {
    const c = this.byId(id);
    if (!c) return;
    const line = pickBanter(c.def.id, trigger, this.banterRng.next());
    if (line) this.banterQueue.push({ id, line, trigger });
  }

  /**
   * Releases one queued line at a time.
   *
   * The gap is longer than the box's own fade, so a reply lands after its cue
   * has cleared rather than on top of it — a conversation you can follow beats
   * one that arrives all at once.
   */
  private drainBanterQueue(): void {
    if (this.banterDelay > 0) {
      this.banterDelay--;
      return;
    }
    const next = this.banterQueue.shift();
    if (!next) return;
    const box = this.banter[next.id];
    if (box) box.say(next.line, next.trigger, 165);
    this.banterDelay = 190;
  }

  /**
   * Banter triggered by *state* rather than by an event.
   *
   * Life thresholds and combo counts have no event of their own, and inventing
   * one in the simulation for the sake of a speech bubble would put a
   * presentation concern into `MatchSim`. Polling here keeps the sim clean.
   */
  private checkBanterState(): void {
    const s = this.sim;
    if (s.phase !== MatchPhase.Fight) return;

    for (const c of s.combatants) {
      if (!c.alive) continue;
      if (c.life / c.def.gauges.maxLife < 0.33) this.speak(c.id, 'hurt', true);
      // A combo is spoken by whoever is *landing* it, not the victim.
      const combo = s.combo.get(c.id) ?? 0;
      if (combo >= 4) this.speak(s.opponentOf(c).id, 'combo');
    }
  }

  private consumeEvents(): void {
    const s = this.sim;
    for (const ev of s.events) {
      switch (ev.t) {
        case 'fire': {
          const owner = this.byId(ev.ownerId);
          const tint = owner?.def.tint.thruster ?? 0xffffff;
          if (ev.family) this.effects.muzzleFor(ev.x, ev.y, ev.angle, ev.family, tint);
          else this.effects.muzzle(ev.x, ev.y, ev.angle, ev.kind, tint);
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
          if (ev.family) {
            // Scaled by the damage dealt, so a flechette and a breach lance do
            // not come apart in the same shower.
            this.effects.impactFor(ev.x, ev.y, ev.family, tint, clamp(ev.damage / 70, 0.6, 2));
          } else {
            this.effects.hit(ev.x, ev.y, ev.kind, tint);
          }
          const heavy = ev.kind === ProjKind.Melee || ev.kind === ProjKind.Beam || ev.kind === ProjKind.Heavy;
          if (heavy) sfx.heavyHit();
          else sfx.hit();
          this.speak(ev.ownerId, 'firstHit', true);
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
        case 'absorb': {
          this.effects.absorb(ev.x, ev.y, 0x7ce7ff);
          sfx.absorb();
          // Flare the dome's rim where the round actually met it. `absorb` is
          // also raised by the interceptor and by a barrier, so this is gated on
          // the role rather than on the event: only a dome has a rim to light.
          const di = this.sim.combatants.findIndex((o) => o.id === ev.victimId);
          if (di >= 0 && this.sim.combatants[di].def.supporter.role === 'dome') {
            const ds = this.sim.combatants[di].supporter;
            const hits = this.domeHits[di];
            hits.push({ ang: Math.atan2(ev.y - ds.y, ev.x - ds.x), life: 1 });
            // A wide salvo lands a dozen rounds in a handful of ticks; keeping
            // the last few is enough to read as a shield under fire.
            if (hits.length > 8) hits.shift();
          }
          break;
        }
        case 'domeBreak': {
          // The shell coming apart. Loud on purpose: it is a window opening, and
          // whoever spent a volley making it happen should be in no doubt.
          const c = this.byId(ev.id);
          const tint = c?.def.tint.glow ?? 0xbdf0ff;
          this.effects.barrier(ev.x, ev.y, 170, tint);
          this.effects.guardBreak(ev.x, ev.y);
          this.effects.explode(ev.x, ev.y, false, tint);
          this.shake = Math.max(this.shake, 5);
          sfx.guardBreak();
          if (c) this.hud.banner(`${c.def.supporter.name} DOWN`, 34);
          break;
        }
        case 'breaker': {
          /**
           * SIGHTLINE's breaker pulse.
           *
           * The *shove* is the mechanic, so the visual is a wave leaving the
           * machine rather than a flash on it — a wide ring pushed out past
           * where both bodies end up, plus the guard-break shards, because what
           * the opponent just lost is their chain.
           */
          const c = this.byId(ev.id);
          const tint = c?.def.tint.glow ?? 0x7ff5e6;
          this.effects.barrier(ev.x, ev.y, 190, tint);
          this.effects.barrier(ev.x, ev.y, 120, 0xffffff);
          this.effects.guardBreak(ev.x, ev.y);
          this.shake = Math.max(this.shake, 5.5);
          sfx.guardBreak();
          if (c) this.hud.banner('BREAKER', 30);
          break;
        }
        case 'barrier': {
          const c = this.byId(ev.id);
          this.effects.barrier(ev.x, ev.y, c?.def.barrier.radius ?? 46, 0x8fe6ff);
          sfx.barrier();
          break;
        }
        case 'meleeRepel': {
          const d = this.byId(ev.id);
          this.effects.barrier(ev.x, ev.y, d?.def.barrier.radius ?? 46, 0x9fe6ff);
          this.effects.guardBreak(ev.x, ev.y);
          sfx.guardBreak();
          this.shake = Math.max(this.shake, 12);
          if (ev.id === s.player.id) this.hud.banner('REPEL', 50);
          break;
        }
        case 'guardBreak':
          this.speak(ev.id, 'guardBroken');
          this.effects.guardBreak(ev.x, ev.y);
          sfx.guardBreak();
          this.shake = Math.max(this.shake, 8);
          break;
        case 'dash': {
          const c = this.byId(ev.id);
          this.effects.dash(ev.x, ev.y, ev.angle, c?.def.tint.thruster ?? 0x74d6ff, c?.def.rig.scale ?? 1);
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
          this.effects.dash(ev.x, ev.y, 0, c?.def.tint.thruster ?? 0x74d6ff, c?.def.rig.scale ?? 1);
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
        case 'overdrive': {
          /**
           * The reactor dump. All three modes at once, announced as such.
           *
           * Given the full card because it is the loudest thing this machine can
           * do and the last decision it gets to make — after this the kit is on
           * a ten-second fuse.
           */
          const c = this.byId(ev.id);
          this.shake = Math.max(this.shake, 10);
          sfx.saturation();
          sfx.beam();
          if (c) {
            // One burst per mode, fanned in time, so it reads as three things
            // firing at once rather than one bigger flash.
            for (const mode of [SatMode.Shield, SatMode.Shoot, SatMode.Speed]) {
              this.effects.saturationBurst(c.x, c.y, mode, c.def.tint.accent, c.facing);
            }
            this.cutscene.play({
              portraitKey: `pilot_${c.def.id}`,
              pilot: c.def.pilot,
              mode: SatMode.Speed,
              line: pickBanter(c.def.id, 'overdrive', this.banterRng.next()),
              tint: c.def.tint.accent,
              screenFrac: c.x / ARENA_W,
              label: 'OVERDRIVE',
              sub: 'ALL SYSTEMS — TEN SECONDS',
            });
          }
          this.hud.banner('OVERDRIVE', 110);
          break;
        }

        case 'overdriveSpent': {
          /**
           * The burnout, and the scene the whole passive is built toward.
           *
           * Deliberately *not* a smaller version of the opening card. The first
           * is a machine switching everything on; this is a machine losing
           * everything it just spent — thrusters and both guns destroyed — and
           * the pilot answering with the only thing left. So it gets the harder
           * shake, the burnout cue rather than the saturation one, and its own
           * headline.
           */
          const c = this.byId(ev.id);
          this.shake = Math.max(this.shake, 14);
          sfx.satBurnout();
          sfx.guardBreak();
          if (c) {
            this.effects.guardBreak(c.x, c.y);
            this.effects.explode(c.x, c.y, true, c.def.tint.accent);
            // The blade lights: the energy goes somewhere, and it goes there.
            this.effects.melee(c.x, c.y, c.aim, 2, c.def.tint.glow);
            this.cutscene.play({
              portraitKey: `pilot_${c.def.id}`,
              pilot: c.def.pilot,
              mode: SatMode.Speed,
              line: pickBanter(c.def.id, 'overdriveSpent', this.banterRng.next()),
              tint: 0xff5c5c,
              screenFrac: c.x / ARENA_W,
              label: 'BURNOUT',
              sub: 'THRUSTERS AND GUNS DESTROYED — BLADE ONLY',
            });
          }
          this.hud.banner('BLADE ONLY', 130);
          break;
        }

        case 'lastStand': {
          /**
           * The moment the passive exists for, given the full treatment.
           *
           * A once-a-match refusal to die that went past in a single frame would
           * be indistinguishable from a rounding error on the life bar — the
           * player has to *know* the kill was taken away from them, and the
           * pilot has to know they are still standing. So: a hard freeze of the
           * screen, the pilot's own cutscene card, a banner, and a burst at the
           * chassis.
           */
          const c = this.byId(ev.id);
          this.shake = Math.max(this.shake, 9);
          sfx.guardBreak();
          sfx.saturation();
          if (c) {
            this.effects.saturationBurst(c.x, c.y, SatMode.Shield, c.def.tint.accent, c.facing);
            this.effects.guardBreak(c.x, c.y);
            this.cutscene.play({
              portraitKey: `pilot_${c.def.id}`,
              pilot: c.def.pilot,
              mode: SatMode.Shield,
              line: pickBanter(c.def.id, 'lastStand', this.banterRng.next()),
              tint: c.def.tint.accent,
              screenFrac: c.x / ARENA_W,
              label: 'LAST STAND',
              sub: 'REFUSING TERMINATION',
            });
          }
          this.hud.banner('LAST STAND', 110);
          break;
        }

        case 'lastStandEnd': {
          // The clock running out is when the opponent's next hit starts
          // mattering again, so it gets its own beat rather than silently
          // lapsing.
          this.hud.banner('EXPOSED', 70);
          sfx.satBurnout();
          break;
        }

        case 'decoyPop': {
          /**
           * A projection shot out of the air.
           *
           * Given a real report rather than letting it silently blink out: the
           * whole value of the counterplay is that a player learns they *can*
           * shoot the fake, and a silhouette that vanishes with no feedback
           * teaches nothing. The burst is already queued by the sim as a small
           * `explode`; this adds the sound and a brief flash at the same point.
           */
          sfx.absorb();
          const owner = this.byId(ev.ownerId);
          this.effects.absorb(ev.x, ev.y, owner?.def.tint.glow ?? 0x9be7ff);
          this.shake = Math.max(this.shake, 1.2);
          break;
        }

        case 'droneDown': {
          // Two lines, one loss: the owner mourns it, the shooter gloats. They
          // are different boxes, so both can land.
          this.speak(ev.ownerId, 'droneLost');
          const shooter = s.combatants.find((x) => x.id !== ev.ownerId);
          if (shooter) this.speak(shooter.id, 'droneKill');
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
          // The line goes in the cutscene, which has room for it, rather than
          // into the corner box where it would be buried under the flash.
          if (c) {
            this.cutscene.play({
              portraitKey: `pilot_${c.def.id}`,
              pilot: c.def.pilot,
              mode: ev.mode,
              // A forced burst gets the desperate variant, so the cutscene
               // itself tells you the pilot gambled rather than committed.
              line: pickBanter(
                c.def.id,
                ev.partial ? 'saturationEarly' : 'saturation',
                this.banterRng.next(),
              ),
              partial: ev.partial === true,
              tint: c.def.tint.accent,
              screenFrac: c.x / ARENA_W,
            });
          }
          this.shake = Math.max(this.shake, 11);
          if (ev.id === s.player.id) {
            this.hud.banner(`${SAT_MODE_NAMES[ev.mode]} SATURATION`, 52);
          }
          break;
        }
        case 'satBurnout': {
          this.speak(ev.id, 'burnout');
          this.effects.satBurnout(ev.x, ev.y);
          sfx.satBurnout();
          // An overheat is a real punish, not a stumble: it hits harder on
          // screen so the player connects the damage to the gamble.
          this.shake = Math.max(this.shake, ev.overheat ? 13 : 5);
          if (ev.overheat) this.effects.explode(ev.x, ev.y, false, 0xff7a3a);
          if (ev.id === s.player.id) {
            this.hud.banner(ev.overheat ? 'OVERHEAT' : 'BURNOUT', ev.overheat ? 64 : 40);
          }
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
        case 'ko': {
          sfx.ko();
          this.hud.banner('K.O.', 110);
          this.speak(ev.id, 'lose');
          const victor = s.combatants.find((x) => x.id !== ev.id);
          if (victor) this.speak(victor.id, 'win');
          break;
        }
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
  /**
   * A second `MechRenderer` per side, used only for a decoy projection.
   *
   * **The real renderer, not a static copy.** An earlier pass assembled the rig
   * by hand into a still container, and it gave the projection away instantly:
   * the genuine machine banks into its turns, its thrusters flare, its limbs
   * settle. A silhouette that holds one pose next to one that does all of that
   * is not a decoy, it is a cardboard cutout. Driving the same renderer with a
   * synthesised state means the projection animates by construction and cannot
   * drift out of step when the real rig gains a behaviour.
   */
  private buildDecoyRenderer(def: (typeof MECHS)[string]): MechRenderer {
    const r = new MechRenderer(this, def, def.id);
    r.setDepth(17);
    return r;
  }

  /**
   * The state a decoy renderer is driven with.
   *
   * Presentation only — the simulation owns the projection's position, heading
   * and lifetime; everything here is the animation read off them. Deliberately
   * duck-typed against the fields `MechRenderer.sync` actually reads rather than
   * faking a whole `Combatant`.
   */
  /**
   * A drawable stand-in for one of NULLTIDE's projections.
   *
   * **Returns `MechPoseSource`, not `Combatant`.** It used to end in
   * `as unknown as Combatant`, which silenced the compiler on a hand-built copy
   * of a growing object — and the copy duly fell behind. `legSwing` was added to
   * the renderer's pose in D123, this object did not gain it, and the game
   * crashed on the first decoy of the first NULLTIDE match while every test
   * stayed green. The narrow interface is what makes that a build error.
   */
  private decoyState(c: Combatant, slot: number, dt: number): MechPoseSource {
    const dec = c.supporter.decoys[slot];
    // Keyed per projection, so the two do not share a bob phase and read as one
    // object drawn twice.
    const key = c.id * DECOY_COUNT + slot;
    const st = (this.decoyAnim[key] ??= { bobPhase: slot * 1.7, bank: 0 });
    st.bobPhase += dt * 2.4;
    // Bank into the drift, the way the flight model banks a real chassis.
    const wantBank = clamp(dec.vx * 0.055, -0.38, 0.38) * (dec.facing < 0 ? -1 : 1);
    st.bank += (wantBank - st.bank) * 0.12;

    return {
      alive: true,
      act: 0,
      // A decoy never swings, so it never grips — but the field is required by
      // `MechPoseSource` on purpose (§8i): the compiler catching this is exactly
      // what the structural contract is for.
      grip: 0,
      weaponSpin: 0,
      lean: 0,
      lift: 0,
      y: dec.y,
      // Straight from the simulation, so the mounts point exactly where the
      // projection's rounds actually leave from. A rig aiming somewhere its own
      // shots do not come from is the clearest tell there is.
      aim: dec.aim,
      bank: st.bank,
      bobPhase: st.bobPhase,
      facing: dec.facing,
      hitstop: 0,
      reach: 0,
      spin: 0,
      swinging: false,
      satActive: false,
      status: c.status,
      stride: 0,
      walkPhase: 0,
      // The projection copies the machine it is imitating, legs included. Zeros
      // would hang them dead straight while the original's swing — and a
      // silhouette that does not move like the thing it is pretending to be is
      // the tell the whole ability exists to avoid.
      legSwing: c.legSwing,
      // Always under thrust: it is flying, so the plumes are lit. A projection
      // with dead thrusters reads as a wreck.
      thrust: 0.55 + Math.sin(st.bobPhase * 1.7) * 0.12,
    };
  }

  private drawDrone(i: number, c: Combatant, dt: number): void {
    const sprite = this.drones[i];
    const ring = this.droneRings[i];
    const s = c.supporter;

    // ---- decoy ------------------------------------------------------------
    for (let k = 0; k < DECOY_COUNT; k++) {
      const ghost = this.decoyGhosts[i * DECOY_COUNT + k];
      if (!ghost) continue;
      const dec = s.decoys[k];
      const showing = c.alive && dec.ticks > 0 && c.def.supporter.role === 'decoy';
      ghost.setVisible(showing);
      if (!showing) continue;
      ghost.sync(this.decoyState(c, k, 1 / 60), dec.x, dec.y, 1 / 60);
      // Solid for almost all of its life, dissolving only at the very end —
      // that flicker is the tell, and it arrives too late to help much.
      const life = dec.ticks / 110;
      ghost.setAlpha(life > 0.2 ? 1 : life * 5);
    }

    // ---- dome -------------------------------------------------------------
    /**
     * AEGIS's bubble, drawn at exactly the radius `MatchSim` cuts at.
     *
     * The shared number is the point. `roleValue` decides which shots stop
     * existing, so the rim a player sees is the rim their volley dies on — the
     * ability is entirely about where the drone is standing, and it was
     * previously drawn nowhere at all.
     *
     * Three layers, in order of how much each is doing: a fill so faint it only
     * tints what is inside, a rim heavy enough to locate at a glance, and
     * meridians that turn so the thing reads as a shell rather than as a range
     * circle on a map.
     */
    const dome = this.droneDomes[i];
    if (dome) {
      dome.clear();
      const hits = this.domeHits[i];
      for (const h of hits) h.life -= dt * 3.6;
      while (hits.length && hits[0].life <= 0) hits.shift();

      const up = c.alive && s.onStation && c.def.supporter.role === 'dome' && s.domeActive;
      if (up) {
        const r = c.def.supporter.roleValue ?? 140;
        const glow = c.def.tint.glow ?? 0xbdf0ff;
        const accent = c.def.tint.accent ?? 0x4ad6ff;
        const t = this.sim.tick;
        /**
         * **A shell that is failing has to look like it.**
         *
         * The dome is consumable now, and a player deciding whether to keep
         * pushing needs that written on the screen rather than inferred from
         * whether shots are still vanishing. Integrity drives the whole thing:
         * the surface thins, the rim dims, and under a third it stutters — the
         * seams drop out for a beat on a cadence taken off the tick, so a shell
         * about to go reads as unstable rather than merely dimmer.
         */
        const integrity = clamp(s.domeHp / DOME_MAX, 0, 1);
        const failing = integrity < 0.34;
        const flicker = failing && Math.sin(t * 0.55) < -0.25 ? 0.35 : 1;
        const solidity = (0.35 + 0.65 * integrity) * flicker;
        // Above the deck, below the mechs. The fight happens inside this shell
        // and a bubble drawn over the top of both machines would bury it.
        dome.setDepth(19.5);

        /**
         * A **closed shell**, not a cage — and the simulation is what settles
         * that. `stepDroneRoles` erases every non-piercing shot anywhere inside
         * `roleValue`; there are no gaps to thread. Drawing a lattice of bright
         * bars with empty space between them would be describing an ability the
         * game does not have.
         *
         * So the surface has to be *there*. Three things put it there, and the
         * order matters:
         *
         * 1. **Fresnel falloff** — concentric shells brightening toward the rim.
         *    This is the one doing the real work. A sphere seen from outside
         *    shows more of itself at the edge, where the line of sight runs
         *    along the surface, and almost none through the middle. A flat fill
         *    is what made the first cut look like a drawn circle.
         * 2. **A hard rim** at exactly the radius `MatchSim` cuts at, so the
         *    boundary a player judges their approach against is the boundary
         *    their rounds die on.
         * 3. **Seams** — meridians *and* latitudes, turning together. Meridians
         *    alone are ambiguous: they are equally a globe and a birdcage. The
         *    latitude rings are what force one reading, because a horizontal
         *    ring squashed by perspective only makes sense on a solid of
         *    revolution.
         */
        // The weight here is what decides cage-versus-shell, and it is bounded
        // hard on both sides. Too faint and the seams dominate and the thing
        // reads as a birdcage, which is a lie about an ability with no gaps in
        // it. Too heavy — 14 shells at 0.16 and a 0.06 fill were tried — and the
        // additive interior washes the machine standing inside its own dome into
        // a white silhouette, which costs more legibility than the surface buys.
        // These numbers are the ones that were looked at and kept.
        const SHELLS = 9;
        for (let k = 0; k < SHELLS; k++) {
          const f = k / (SHELLS - 1);
          // Pow 2.6 keeps the middle nearly clear and stacks the light into the
          // last fifth of the radius, which is where a real shell would show.
          dome.lineStyle(4 + f * 7, accent, (0.012 + 0.075 * Math.pow(f, 2.6)) * solidity);
          dome.strokeCircle(s.x, s.y, r * (0.46 + 0.54 * f));
        }
        // Faint interior tint, so the volume is enclosed rather than a ring
        // floating in front of the arena.
        dome.fillStyle(accent, 0.035 * solidity);
        dome.fillCircle(s.x, s.y, r);

        // The rim itself. Breathing slowly, because a shield holding is not a
        // static object.
        const pulse = Math.sin(t * 0.06);
        dome.lineStyle(9, accent, (0.2 + pulse * 0.05) * solidity);
        dome.strokeCircle(s.x, s.y, r);
        dome.lineStyle(2.5, glow, (0.85 + pulse * 0.15) * solidity);
        dome.strokeCircle(s.x, s.y, r);

        // ---- seams, all on one rotation ------------------------------------
        const spin = t * 0.008;
        // Longitude: ellipses collapsing and reopening on |cos| as they swing
        // round the far side.
        dome.lineStyle(1.5, glow, 0.22 * solidity);
        for (let k = 0; k < 6; k++) {
          const a = spin + (k * Math.PI) / 6;
          dome.strokeEllipse(s.x, s.y, Math.abs(Math.cos(a)) * r * 2, r * 2);
        }
        // Latitude: horizontal rings, each at the height and width its own
        // circle of latitude projects to, squashed by a fixed viewing tilt.
        // These are what make it a sphere rather than a cylinder of bars.
        const TILT = 0.3;
        for (const lat of [-0.95, -0.62, -0.3, 0, 0.3, 0.62, 0.95]) {
          const cw = Math.cos(lat) * r;
          dome.lineStyle(1.5, glow, (lat === 0 ? 0.26 : 0.18) * solidity);
          dome.strokeEllipse(s.x, s.y - Math.sin(lat) * r, cw * 2, cw * 2 * TILT);
        }

        // A specular cap up and to the left, where this arena's key light is.
        // Small, offset, and the last cue that the thing has a near side.
        dome.fillStyle(0xffffff, 0.05 * solidity);
        dome.fillEllipse(s.x - r * 0.34, s.y - r * 0.4, r * 0.5, r * 0.34);

        // ---- impacts --------------------------------------------------------
        // A patch of surface lighting up where the round met it, spreading and
        // dimming. Two arcs at slightly different radii so the flare has skin
        // depth rather than sitting on a single hairline.
        for (const h of hits) {
          const f = Math.max(0, Math.min(1, h.life));
          const span = 0.12 + 0.3 * f;
          dome.lineStyle(4 + f * 9, glow, f * 0.5);
          dome.beginPath();
          dome.arc(s.x, s.y, r * 0.985, h.ang - span, h.ang + span);
          dome.strokePath();
          dome.lineStyle(2 + f * 3, 0xffffff, f * 0.9);
          dome.beginPath();
          dome.arc(s.x, s.y, r, h.ang - span * 0.6, h.ang + span * 0.6);
          dome.strokePath();
        }
      }
    }

    // ---- arc tether -------------------------------------------------------
    /**
     * The live wire, drawn at exactly the width the hit test uses.
     *
     * `ARC_TETHER_WIDTH` is shared with `MatchSim`, so the cable a player sees
     * lying across a mech is the cable that connects with it — the ability is
     * entirely about where you stand, and it was previously drawn nowhere at all.
     *
     * Two states worth telling apart: **slack**, when the drone is far enough out
     * for the wire to exist but nothing is on it, and **hot**, when it is actually
     * cutting someone. Hot is brighter, thicker and sparks along its length,
     * because that is the moment the play worked.
     */
    const tether = this.droneTethers[i];
    if (tether) {
      tether.clear();
      // `onStation`, not `visible`. `visible` is true through a rebuild, and
      // `MatchSim.stepDroneRoles` gates every role on `onStation` — so drawing
      // on the looser predicate puts a wire on screen during the one window
      // where it provably does nothing.
      const live = c.alive && s.onStation && c.def.supporter.role === 'arcTether' && s.tetherLive;
      if (live) {
        const foe = this.sim.combatants.find((o) => o.team !== c.team && o.alive);
        const hot =
          !!foe &&
          segmentHitsCircle(s.x, s.y, c.x, c.y, foe.x, foe.y, foe.def.rig.hurtRadius + ARC_TETHER_WIDTH);
        const glow = c.def.tint.glow ?? 0xbdf0ff;
        const accent = c.def.tint.accent ?? 0x4ad6ff;
        const t = this.sim.tick;
        // Outer bloom, then the core. Both follow the same span.
        tether.lineStyle(hot ? ARC_TETHER_WIDTH * 2 : ARC_TETHER_WIDTH, accent, hot ? 0.34 : 0.16);
        tether.lineBetween(s.x, s.y, c.x, c.y);
        tether.lineStyle(hot ? 4 : 2, glow, hot ? 1 : 0.6);
        tether.lineBetween(s.x, s.y, c.x, c.y);
        // A cable under load is not a straight bright line; it crackles. Sampled
        // off the tick so it is deterministic and a replay looks the same.
        if (hot) {
          const dx = c.x - s.x;
          const dy = c.y - s.y;
          const len = Math.hypot(dx, dy) || 1;
          const nx = -dy / len;
          const ny = dx / len;
          tether.lineStyle(2, 0xffffff, 0.85);
          tether.beginPath();
          tether.moveTo(s.x, s.y);
          for (let k = 1; k < 8; k++) {
            const f = k / 8;
            const j = Math.sin(t * 0.9 + k * 2.3) * ARC_TETHER_WIDTH * 0.75;
            tether.lineTo(s.x + dx * f + nx * j, s.y + dy * f + ny * j);
          }
          tether.lineTo(c.x, c.y);
          tether.strokePath();
        }
      }

      /**
       * WARDEN's repair beam, on the same graphics because a mech has exactly
       * one drone role and the two can never be strung at once.
       *
       * Deliberately a different language from the arc above: that one is a
       * weapon and crackles, this is a feed and flows. The charges travel
       * **toward the machine**, because the direction carries the whole message
       * — the beam is giving barrier, not draining it.
       *
       * It drops to standby once the barrier is capped. `MatchSim` still adds
       * and clamps there, so a beam running at full strength would be claiming
       * work that is not happening — exactly the class of lie this whole change
       * is meant to remove.
       */
      const feeding = c.alive && s.onStation && c.def.supporter.role === 'tether' && s.tetherLive;
      const rope = this.tetherRope[i];
      if (!feeding) {
        // Dropped, so the next hookup re-seeds straight instead of snapping in
        // from wherever the cable was hanging when the drone last went down.
        rope.length = 0;
      } else {
        const glow = c.def.tint.glow ?? 0xbdf0ff;
        const accent = c.def.tint.accent ?? 0x8fe6ff;
        const t = this.sim.tick;
        // Standby means "nothing left to give", so it now needs *both* gauges
        // topped. Checking barrier alone would dim the cable during the exact
        // stretch it is trickling hull back — which is the lie the standby state
        // exists to prevent. In practice this means the beam is bright for most
        // of a match, because hull does not come back on its own.
        const full =
          c.barrier >= c.def.gauges.maxBarrier - 0.001 && c.life >= c.def.gauges.maxLife - 0.001;
        const a = full ? 0.3 : 1;

        /**
         * A hanging cable, integrated rather than drawn.
         *
         * Verlet: each point remembers where it was, so its velocity is implicit
         * and the constraint pass is just "put the beads back a rest-length
         * apart". Ends pinned to the drone and the machine, everything between
         * left to fall and catch up — which is what produces the lag when the
         * drone breaks station and the swing when it stops.
         *
         * Fixed-step on purpose. Verlet with a variable `dt` changes its own
         * stiffness frame to frame and can throw the rope; the loop is 60 Hz and
         * this is presentation, so a fixed tick is both stabler and cheaper than
         * making it correct under a varying one.
         */
        const N = 18;
        const span = Math.hypot(c.x - s.x, c.y - s.y);
        if (rope.length !== N) {
          rope.length = 0;
          for (let k = 0; k < N; k++) {
            const f = k / (N - 1);
            const x = s.x + (c.x - s.x) * f;
            const y = s.y + (c.y - s.y) * f;
            rope.push({ x, y, px: x, py: y });
          }
        }

        const GRAVITY = 0.5;
        const DRAG = 0.93;
        for (let k = 1; k < N - 1; k++) {
          const p = rope[k];
          const vx = (p.x - p.px) * DRAG;
          const vy = (p.y - p.py) * DRAG;
          p.px = p.x;
          p.py = p.y;
          p.x += vx;
          p.y += vy + GRAVITY;
        }
        // Slack just over 1 so the cable hangs slightly rather than hanging
        // dead straight — enough to read as rope, not enough to droop into the
        // arena floor at the spans an escort actually holds.
        const rest = (span / (N - 1)) * 1.05;
        for (let pass = 0; pass < 8; pass++) {
          rope[0].x = s.x;
          rope[0].y = s.y;
          rope[N - 1].x = c.x;
          rope[N - 1].y = c.y;
          for (let k = 0; k < N - 1; k++) {
            const p0 = rope[k];
            const p1 = rope[k + 1];
            let dx = p1.x - p0.x;
            let dy = p1.y - p0.y;
            const d = Math.hypot(dx, dy) || 1;
            const push = ((d - rest) / d) * 0.5;
            dx *= push;
            dy *= push;
            if (k !== 0) {
              p0.x += dx;
              p0.y += dy;
            }
            if (k + 1 !== N - 1) {
              p1.x -= dx;
              p1.y -= dy;
            }
          }
        }

        const strokeRope = (width: number, colour: number, alpha: number): void => {
          tether.lineStyle(width, colour, alpha);
          tether.beginPath();
          tether.moveTo(rope[0].x, rope[0].y);
          for (let k = 1; k < N; k++) tether.lineTo(rope[k].x, rope[k].y);
          tether.strokePath();
        };
        strokeRope(9, accent, 0.16 * a);
        strokeRope(3, glow, 0.6 * a);

        if (!full) {
          // Three charges running the cable toward the machine. Walked along the
          // *rope* rather than along the straight span, so they ride the sag
          // instead of cutting the corner it makes.
          for (let k = 0; k < 3; k++) {
            const f = (t * 0.014 + k / 3) % 1;
            const at = f * (N - 1);
            const lo = Math.min(N - 2, Math.floor(at));
            const frac = at - lo;
            const x = rope[lo].x + (rope[lo + 1].x - rope[lo].x) * frac;
            const y = rope[lo].y + (rope[lo + 1].y - rope[lo].y) * frac;
            const p = Math.sin(f * Math.PI);
            tether.fillStyle(0xffffff, 0.45 + p * 0.5);
            tether.fillCircle(x, y, 2.4 + p * 2.6);
          }
        }
      }
    }

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

  /**
   * ARBITER's paint, drawn on the machine wearing it.
   *
   * `paintedTicks` multiplies every hit the painted machine takes by
   * `DESIGNATOR_DAMAGE`, and it was the last of the three roles that were pure
   * state and therefore invisible: HALCYON's whole kit turned on a debuff with
   * no mark, no source and no way to learn that shooting the drone turns it off.
   *
   * Drawn **over** the mech, unlike the dome and the tethers. A reticle behind
   * the machine it is locked onto is not a reticle.
   */
  /**
   * The sniper stance, drawn as what it actually is: a firing line.
   *
   * A HUD readout tells a player the stance is up; it does not tell them what
   * that *means* to the machine in front of them. The sight line does — it
   * points where the shot is going, it reaches across the arena the way the
   * round does, and it says "this thing is not moving" without a word of UI.
   *
   * Three parts, all additive so they read as light rather than as drawn-on
   * shapes, which is the lesson `droneDomes` already records:
   *
   * * A long thin beam along the aim, brightest at the muzzle and fading out —
   *   the reach.
   * * A pulse travelling down it, so the line reads as charged rather than as a
   *   static decoration.
   * * A pair of brackets clamped on the chassis, which is the "planted" tell.
   *
   * Deliberately in the sniper's *own* accent colour, unlike the paint reticle:
   * this is something the machine is doing, not something being done to it.
   */
  /**
   * The LAST STAND aura: a machine held together by refusal.
   *
   * Three rings on different phases rather than one, so it reads as something
   * straining rather than something glowing, plus a countdown arc that visibly
   * closes — the whole passive is a clock, and a clock the opponent cannot see
   * is one they cannot play around. The last two seconds go red and speed up,
   * because that is when killing this machine becomes possible again.
   */
  /**
   * OVERDRIVE's aura, drawn on the same layer as LAST STAND's.
   *
   * Three rings, one per mode, in the three saturation colours — the visual has
   * to say *all three at once*, which no single-colour glow can. They counter-
   * rotate so the thing reads as a reactor being overrun rather than a shield.
   *
   * After burnout the aura does not stop; it changes. The rings collapse to a
   * single dim red one and a blade flare on the aim axis, because the machine is
   * still transformed — it has simply spent everything into the sword.
   */
  private drawOverdrive(i: number, c: Combatant): void {
    const g = this.overdriveAuras[i];
    if (!g) return;
    g.clear();
    if (!c.alive) return;
    const t = this.sim.tick;
    const r = c.def.barrier.radius;

    if (c.overdriveActive) {
      const total = c.def.overdrive?.ticks ?? 1;
      const left = c.overdriveTicks / total;
      const modeTints = [0x9fe0ff, 0xffd166, 0xff9ae0];
      g.setDepth(40);
      for (let k = 0; k < 3; k++) {
        const dir = k % 2 === 0 ? 1 : -1;
        const spin = t * 0.05 * dir + k * 2.1;
        const radius = r * (1.3 + k * 0.3) + Math.sin(t * 0.18 + k) * 7;
        g.lineStyle(3 - k * 0.5, modeTints[k], 0.62 - k * 0.1);
        // Broken rings, so the counter-rotation is visible.
        for (let seg = 0; seg < 3; seg++) {
          const a0 = spin + (seg * Math.PI * 2) / 3;
          g.beginPath();
          g.arc(c.x, c.y, radius, a0, a0 + 1.5, false);
          g.strokePath();
        }
      }
      // The fuse, closing.
      g.lineStyle(4, 0xffffff, 0.85);
      g.beginPath();
      g.arc(c.x, c.y, r * 2.2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left, false);
      g.strokePath();
      return;
    }

    if (c.overdriveSpent) {
      g.setDepth(40);
      const pulse = 0.5 + 0.5 * Math.sin(t * 0.09);
      g.lineStyle(1.5, 0xff5c5c, 0.18 + pulse * 0.12);
      g.strokeCircle(c.x, c.y, r * 1.35);
      // Everything that is left, pointed where the sword is.
      const cos = Math.cos(c.aim);
      const sin = Math.sin(c.aim);
      g.lineStyle(3, c.def.tint.glow, 0.35 + pulse * 0.4);
      g.beginPath();
      g.moveTo(c.x + cos * r * 0.7, c.y + sin * r * 0.7);
      g.lineTo(c.x + cos * (r * 0.7 + 46 + pulse * 12), c.y + sin * (r * 0.7 + 46 + pulse * 12));
      g.strokePath();
    }
  }

  private drawLastStand(i: number, c: Combatant): void {
    const g = this.lastStandAuras[i];
    if (!g) return;
    g.clear();
    if (!c.alive || !c.lastStandActive) return;

    const total = c.def.lastStand?.ticks ?? 1;
    const left = c.lastStandTicks / total;
    const t = this.sim.tick;
    // Runs out red: the reprieve ending is the opponent's window reopening.
    const dying = left < 0.2;
    const tint = dying ? 0xff4a4a : c.def.tint.accent;
    const rate = dying ? 0.34 : 0.16;
    const r = c.def.barrier.radius;
    g.setDepth(40);

    for (let k = 0; k < 3; k++) {
      const phase = t * rate + k * 2.1;
      const pulse = 0.5 + 0.5 * Math.sin(phase);
      const radius = r * (1.25 + k * 0.28) + pulse * 9;
      g.lineStyle(2.5 - k * 0.6, tint, (0.5 - k * 0.13) * (0.55 + pulse * 0.45));
      g.strokeCircle(c.x, c.y, radius);
    }

    // The clock, drawn as an arc that closes anticlockwise from the top.
    g.lineStyle(3.5, tint, 0.9);
    g.beginPath();
    g.arc(c.x, c.y, r * 2.05, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left, false);
    g.strokePath();
  }

  private drawSniper(i: number, c: Combatant): void {
    const g = this.sniperMarks[i];
    if (!g) return;
    g.clear();
    if (!c.alive || !c.sniperActive) return;

    const tint = c.def.tint.accent;
    const t = this.sim.tick;
    // The last second visibly decays, so a player can see the clock running out
    // on the screen rather than only in the corner.
    const fade = Math.min(1, c.sniperTicks / 60);
    const cos = Math.cos(c.aim);
    const sin = Math.sin(c.aim);
    const mx = c.x + cos * 46;
    const my = c.y + sin * 46;
    // Far enough to cross the arena from anywhere in it; the shot itself
    // outranges the space, so the line should promise that.
    const reach = 2600;
    g.setDepth(41);

    // The line, in two passes: a wide soft glow under a narrow bright core.
    g.lineStyle(5, tint, 0.1 * fade);
    g.beginPath();
    g.moveTo(mx, my);
    g.lineTo(mx + cos * reach, my + sin * reach);
    g.strokePath();
    g.lineStyle(1.25, tint, 0.42 * fade);
    g.beginPath();
    g.moveTo(mx, my);
    g.lineTo(mx + cos * reach, my + sin * reach);
    g.strokePath();

    // A charge pulse running out along the line, on a 40-tick cycle.
    const travel = ((t % 40) / 40) * 620;
    const px = mx + cos * travel;
    const py = my + sin * travel;
    g.fillStyle(tint, 0.5 * fade);
    g.fillCircle(px, py, 4.5);

    // Brackets on the chassis: the "planted" tell. Sized off `barrier.radius`
    // for the same reason the paint reticle is — a hit circle is much smaller
    // than the picture of a mech and a mark keyed to it draws underneath the art.
    const r = c.def.barrier.radius * 1.45;
    const arm = r * 0.5;
    g.lineStyle(2, tint, 0.55 * fade);
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        g.beginPath();
        g.moveTo(c.x + sx * r, c.y + sy * r - sy * arm);
        g.lineTo(c.x + sx * r, c.y + sy * r);
        g.lineTo(c.x + sx * r - sx * arm, c.y + sy * r);
        g.strokePath();
      }
    }
  }

  private drawPaint(i: number, c: Combatant): void {
    const g = this.paintMarks[i];
    if (!g) return;
    g.clear();
    if (!c.alive || c.paintedTicks <= 0) return;

    // The mark is in the *painter's* colour: it is something being done to this
    // machine, not something it is doing.
    const painter = this.sim.combatants.find((o) => o.team !== c.team);
    const tint = painter?.def.tint.accent ?? 0xff6a4a;
    const t = this.sim.tick;
    // The paint lapses on its own once the drone loses sight, which is what
    // makes killing the escort worth doing — so the last third of it visibly
    // decays rather than snapping off.
    const fade = Math.min(1, c.paintedTicks / 15);
    /**
     * Sized off `barrier.radius`, not `rig.hurtRadius`.
     *
     * The first cut used `hurtRadius + 16` and the mark was invisible on every
     * machine — measured at 52 px on TERRAMOTH against a silhouette roughly 85 px
     * to the corner, so the whole reticle was drawn *underneath* the artwork. A
     * hit circle is not a picture of a mech; it is much smaller than one.
     *
     * `barrier.radius` is the project's existing per-chassis "circle that fits
     * this machine" number — hand-tuned from 40 on CIRRUS to 56 on TERRAMOTH —
     * so keying off it scales with the frame for free. The 1.8 puts the reticle
     * clearly outside both the silhouette and the barrier bubble itself.
     */
    const r = c.def.barrier.radius * 1.8;
    g.setDepth(41);

    // Four brackets and no closed ring anywhere. A circle around a mech already
    // means barrier in this game, and a targeting mark that can be mistaken for
    // a defensive one is worse than no mark.
    g.lineStyle(2.5, tint, 0.9 * fade);
    for (let k = 0; k < 4; k++) {
      const a0 = -t * 0.02 + (k * Math.PI) / 2;
      g.beginPath();
      g.arc(c.x, c.y, r, a0 - 0.3, a0 + 0.3);
      g.strokePath();
    }
    // Ticks reaching inward from each bracket, breathing in and out — the lock
    // tightening. Radial rather than concentric, so there is nothing here that
    // could be read as a bubble.
    const pull = 0.5 + 0.5 * Math.sin(t * 0.12);
    g.lineStyle(1.5, 0xffffff, (0.3 + pull * 0.45) * fade);
    for (let k = 0; k < 4; k++) {
      const a0 = -t * 0.02 + (k * Math.PI) / 2;
      const ca = Math.cos(a0);
      const sa = Math.sin(a0);
      const inner = r * (0.66 - pull * 0.08);
      g.lineBetween(c.x + ca * r * 0.94, c.y + sa * r * 0.94, c.x + ca * inner, c.y + sa * inner);
    }

    // The line home. A debuff with no visible author teaches nobody which
    // machine to shoot, and the answer here is always "the drone".
    //
    // Drawn at alpha 0.2 first time out, which was a repeat of the mistake this
    // whole change exists to fix: the command buffer proved the line was there
    // and nothing on screen showed it. It is a sight-line, so it stays thin —
    // but it has to actually arrive.
    // The mark itself outlives the drone by design — paint lapses over its own
    // 45 ticks, which is what makes killing the escort pay. The *line* does not:
    // it is drawn only while the drone is on station and actually refreshing
    // the paint, so the mark visibly loses its source before it fades.
    const ps = painter?.supporter;
    if (painter?.alive && ps?.onStation && painter.def.supporter.role === 'designator') {
      g.lineStyle(3, tint, 0.16 * fade);
      g.lineBetween(ps.x, ps.y, c.x, c.y);
      g.lineStyle(1, tint, 0.62 * fade);
      g.lineBetween(ps.x, ps.y, c.x, c.y);
    }
  }

  // ------------------------------------------------------------------ render

  private render(dt: number): void {
    const s = this.sim;

    // ---- camera ----------------------------------------------------------
    const p = s.player;
    const e = s.enemy;
    const cam = this.cameras.main;

    // ---- zoom: solve for the framing rather than guess at it ---------------
    //
    // This used to be `1.34 - dist / 2400` clamped at 0.74, which is a curve
    // fitted to a feeling rather than to the viewport. It framed the common case
    // and lost pilots at the edges: separation was measured as a single hypot,
    // so a purely vertical split barely zoomed out at all, and the 0.74 floor
    // could not fit the arena's width however far apart the two got.
    //
    // Now it computes the zoom that actually fits both machines plus a margin,
    // on each axis independently, and takes the tighter of the two.
    /**
     * Everything the frame has to contain.
     *
     * The two pilots, plus any live decoy projection — a decoy is drawn as a
     * full chassis and is meant to be mistaken for one, so a decoy outside the
     * frame is not a subtle deception, it is an ability that appears not to
     * work. It was: thrown 300px across the fight, it landed below the visible
     * band perhaps half the time and simply could not be seen.
     */
    const pts: Array<{ x: number; y: number }> = [p, e];
    for (const c of s.combatants) {
      const sup = c.supporter;
      if (!c.alive || c.def.supporter.role !== 'decoy') continue;
      // Every live projection, so the camera keeps both in frame — a silhouette
      // outside the visible band is not a deception, it is a missing feature.
      for (const dec of sup.decoys) {
        if (dec.ticks > 0) pts.push({ x: dec.x, y: dec.y });
      }
    }
    const minX = Math.min(...pts.map((q) => q.x));
    const maxX = Math.max(...pts.map((q) => q.x));
    const minY = Math.min(...pts.map((q) => q.y));
    const maxY = Math.max(...pts.map((q) => q.y));

    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    const spanX = maxX - minX + CAM_MARGIN_X * 2;
    const spanY = maxY - minY + CAM_MARGIN_Y * 2;
    // Solved against the clear band under the HUD, not the whole viewport.
    const usableH = VIEW_H - CAM_HUD_BAND;
    const fit = Math.min(VIEW_W / spanX, usableH / spanY);
    const targetZoom = clamp(fit, CAM_ZOOM_MIN, CAM_ZOOM_MAX);
    cam.setZoom(Phaser.Math.Linear(cam.zoom, targetZoom, 0.06));

    // ---- focus: lead the action, but never at the cost of framing ---------
    //
    // The velocity lead is what makes the camera feel like it is following a
    // fight rather than tracking a midpoint, but on its own it could shove a
    // pilot out of frame — a fast mech pulled the view off its own opponent.
    // So the lead is applied first and then clamped to the window in which both
    // machines are still visible.
    const half = (v: number) => v / (2 * cam.zoom);
    const halfW = half(VIEW_W);
    const halfH = half(usableH);

    const bound = (lo: number, hi: number, want: number, mid: number, halfSpan: number): number => {
      // Furthest the centre may sit and still keep both inside, per side.
      const min = hi - halfSpan;
      const max = lo + halfSpan;
      // When they cannot both fit — only reachable at the zoom floor — hold the
      // midpoint, so the pair stays centred and neither is favoured.
      if (min > max) return mid;
      return clamp(want, min, max);
    };

    // The camera centre sits *above* the focus by half the reserved band, which
    // pushes the world down into the clear area. The smoothing has to run in
    // un-shifted space: `cam.midPoint.y` already carries last frame's shift, so
    // lerping against it and shifting again compounds every frame and walks the
    // view off the bottom of the arena. Undo it, lerp, re-apply.
    const hudShift = CAM_HUD_BAND / (2 * cam.zoom);
    const wantX = midX + (p.vx + e.vx) * 4;
    const wantY = midY + (p.vy + e.vy) * 3;
    const focusX = Phaser.Math.Linear(
      cam.midPoint.x,
      bound(minX - CAM_EDGE, maxX + CAM_EDGE, wantX, midX, halfW),
      0.11,
    );
    const focusY = Phaser.Math.Linear(
      cam.midPoint.y + hudShift,
      bound(minY - CAM_EDGE, maxY + CAM_EDGE, wantY, midY, halfH),
      0.11,
    );
    cam.centerOn(focusX, focusY - hudShift);

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
          // `rig.scale` spans 0.82 (CIRRUS) to 1.29 (TERRAMOTH); without it a
          // fixed plume looks 57 % smaller against the biggest machine.
          this.thrusterFx.thruster(w.x, w.y, ang, c.thrust, c.def.tint.thruster, c.def.rig.scale);
        }
      }

      // ---- beam sword -----------------------------------------------
      // Melee is a sword, not the rifle. Stow the gun for the swing and extend
      // a blade from the weapon hand: it ignites through startup and is at full
      // length while the hit is live.
      // The saber is a real part; the additive sprite is only a bloom layered
      // over the modelled blade so it glows rather than being the blade itself.
      const bloom = this.blades[i];
      const swinging = c.alive && c.bladeTimer > 0;
      // **`weaponHeld` is cosmetic and nothing else.** It lets a pilot keep the
      // blade out while flying and shooting normally; it is a scene field fed by
      // a UI edge, so it never reaches `InputFrame`, `Combatant` or `MatchSim`
      // and cannot alter a fight. Melee still runs entirely off `bladeTimer`.
      const drawn = c.alive && (swinging || this.weaponHeld[i]);
      r.setPartVisible('meleeWeapon', drawn);
      // The projected blade is a separate part on the same pivot, so it shows
      // and hides with the hardware it is emitted from. Chassis without one —
      // NOCTURNE's claw, TERRAMOTH's pile, OBELISK's shield — have no such node
      // and `setPartVisible` is a no-op for them.
      r.setPartVisible('meleeEnergy', drawn);
      // NULLTIDE's baton discharge, on the same rule: it is drawn over the rod,
      // so it appears and disappears with it. A no-op for the other seven.
      r.setPartVisible('meleeArc', drawn);
      // **One weapon in the hand at a time.** This first stowed the gun for a
      // swing only, so that firing while the blade was held out did not come
      // from an empty hand. Looked at on screen that trade is the wrong way
      // round: `mainWeapon` and `meleeWeapon` hang off the same arm a few pixels
      // apart, so carrying both reads as one clashing object rather than as a
      // pilot holding two things. The gun goes away whenever the blade is out.
      r.setPartVisible('mainWeapon', !drawn);

      // Bloom on the *swing* only. The projected blade carries its own halo and
      // pulse, so a held blade already glows; adding the streak on top of a
      // stationary weapon reads as a permanent flare rather than a strike.
      //
      // **And only for machines that project a blade at all.** This is beam
      // geometry — an 88 logical px streak laid 53 px out along the weapon axis,
      // measured off HALCYON's saber — and it was being drawn for all eight.
      // On OBELISK that put a glowing sword through the face of a tower shield;
      // NOCTURNE's claw and TERRAMOTH's pile driver had the same thing. Those
      // three carry no `meleeEnergy` part precisely because they project
      // nothing, so that is the question to ask.
      if (swinging && r.hasPart('meleeEnergy')) {
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
      this.drawDrone(i, c, dt);
      this.drawPaint(i, c);
      this.drawSniper(i, c);
      this.drawLastStand(i, c);
      this.drawOverdrive(i, c);

      // WARDEN's repair, on the machine receiving it.
      //
      // Gated on exactly the condition `MatchSim` heals under — drone on
      // station, tether live, and hull actually below maximum — so the motes are
      // present when and only when hull is coming back. Emitting them off the
      // tether alone would show a repair during the stretch the machine is
      // already full, which is the same lie the standby cable exists to avoid.
      if (
        c.alive &&
        c.def.supporter.role === 'tether' &&
        c.supporter.onStation &&
        c.supporter.tetherLive &&
        c.life < c.def.gauges.maxLife &&
        Math.random() < 0.4
      ) {
        this.effects.repairMote(c.x, c.y, c.def.barrier.radius);
      }

      // Sustained barrier bubble and saturation aura.
      if (c.invuln > 0) {
        this.effects.barrierHold(c.x, c.y, c.def.barrier.radius, 0x8fe6ff);
      }
      if (c.satActive && Math.random() < 0.5) {
        this.effects.satAura(c.x, c.y, c.def.tint.thruster);
      }
      // A burnt-out machine visibly sheds sparks for the whole stun, so being
      // helpless looks like damage rather than like standing still.
      if (c.alive && c.satBurnout > 0) {
        this.effects.stunSparks(
          c.x,
          c.y,
          c.def.rig.hurtRadius,
          c.def.tint.glow,
          // An overheat runs past the ordinary burnout's length; while it is
          // still going the machine throws noticeably more.
          c.satBurnout > 60 ? 1.8 : 1,
        );
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
    this.projLayer.draw(
      this.sim.projectiles.items,
      (ownerId: number) => this.byId(ownerId)?.def.tint.thruster ?? 0xffffff,
      this.effects,
    );

    // ---- overlays --------------------------------------------------------
    this.effects.update(dt);
    this.thrusterFx.update(dt);
    this.hud.update(dt);
    for (const b of this.banter) b.update(dt);
    this.debug.update(dt * 1000, (x, y) => ({ x, y }));
  }
}
