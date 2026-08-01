import Phaser from 'phaser';
import { ARENA_H, ARENA_W, TICK_MS, VIEW_H, VIEW_W } from '../core/GameConfig';
import { Difficulty, session } from '../core/Session';
import { ARC_TETHER_WIDTH, MatchSim, segmentHitsCircle } from '../combat/MatchSim';
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
import { ProjectileLayer } from '../render/ProjectileLayer';
import { createProjectileTextures } from '../render/ProjTextures';
import { Hud } from '../ui/Hud';
import { BanterBox } from '../ui/BanterBox';
import { SatCutscene } from '../ui/SatCutscene';
import { pickConversation } from '../data/matchups';
import { pickBanter, type BanterTrigger } from '../data/banter';
import { Menu, makeScrim, bigTitle, smallText } from '../ui/Menu';
import { audioMenuItems } from '../ui/AudioOptions';
import { DebugOverlay } from '../debug/DebugOverlay';
import { sfx } from '../audio/Sfx';
import { music } from '../audio/Music';
import { DANGER_LIFE_FRACTION, pickBattleCue } from '../audio/MusicBank';
import { MatchPhase, ProjKind, SAT_MODE_NAMES, SatMode, emptyInput, type InputFrame } from '../combat/types';
import { ELEMENTS, type Element } from '../combat/Status';
import { DroneMode } from '../combat/Supporter';
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
  private backdrop!: Backdrop;
  private ground!: GroundPlane;
  private renderers: MechRenderer[] = [];
  private projLayer!: ProjectileLayer;
  /** One beam-sword sprite per combatant, shown only while swinging. */
  private blades: Phaser.GameObjects.Image[] = [];
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
  /** One per side; only a `decoy` drone ever shows its own. */
  private decoyGhosts: MechRenderer[] = [];
  /** Per-side animation state for the decoy, keyed by combatant id. */
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
    this.banter = [];
    this.banterQueue = [];
    this.banterDelay = 0;
    this.blades = [];
    this.drones = [];
    this.droneRings = [];
    this.droneTethers = [];
    this.decoyGhosts = [];
    this.decoyAnim = {};
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

    // Each side runs its own tier. In `aiVsAi` that is the whole point of the
    // mode — an EXTREME rival taking apart an EASY one is a different thing to
    // watch than two of the same. Training's rival never acts, so its tier is
    // irrelevant and simply takes the floor.
    const aiSeed = session.seed() ^ 0x9e3779b9;
    this.ai = new RivalAI(
      { difficulty: session.mode === 'training' ? Difficulty.Easy : session.enemyDifficulty },
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
      this.decoyGhosts.push(this.buildDecoyRenderer(def));
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
      ...this.drones,
      ...this.droneRings,
      ...this.decoyGhosts.map((r) => r.root),
      this.effects.container,
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
      'ESC resumes · LEFT / RIGHT adjust volume · F1 / F2 debug overlays',
      VIEW_W / 2,
      VIEW_H - 40,
      12,
      '#63748c',
    );
    const menu = new Menu(
      this,
      [
        { label: 'RESUME', onSelect: () => this.closePause() },
        ...audioMenuItems(),
        { label: 'RESTART MATCH', onSelect: () => this.restart() },
        { label: 'MECH SELECT', onSelect: () => this.toMechSelect() },
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

    if (this.paused) {
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
  private decoyState(c: Combatant, dt: number): Combatant {
    const s = c.supporter;
    const st = (this.decoyAnim[c.id] ??= { bobPhase: 0, bank: 0 });
    st.bobPhase += dt * 2.4;
    // Bank into the drift, the way the flight model banks a real chassis.
    const wantBank = clamp(s.decoyVx * 0.055, -0.38, 0.38) * (s.decoyFacing < 0 ? -1 : 1);
    st.bank += (wantBank - st.bank) * 0.12;

    return {
      alive: true,
      act: 0,
      y: s.decoyY,
      // Straight from the simulation, so the mounts point exactly where the
      // projection's rounds actually leave from. A rig aiming somewhere its own
      // shots do not come from is the clearest tell there is.
      aim: s.decoyAim,
      bank: st.bank,
      bobPhase: st.bobPhase,
      facing: s.decoyFacing,
      hitstop: 0,
      reach: 0,
      spin: 0,
      swinging: false,
      satActive: false,
      status: c.status,
      stride: 0,
      walkPhase: 0,
      // Always under thrust: it is flying, so the plumes are lit. A projection
      // with dead thrusters reads as a wreck.
      thrust: 0.55 + Math.sin(st.bobPhase * 1.7) * 0.12,
    } as unknown as Combatant;
  }

  private drawDrone(i: number, c: Combatant): void {
    const sprite = this.drones[i];
    const ring = this.droneRings[i];
    const s = c.supporter;

    // ---- decoy ------------------------------------------------------------
    const ghost = this.decoyGhosts[i];
    if (ghost) {
      const showing = c.alive && s.decoyTicks > 0 && c.def.supporter.role === 'decoy';
      ghost.setVisible(showing);
      if (showing) {
        ghost.sync(this.decoyState(c, 1 / 60), s.decoyX, s.decoyY, 1 / 60);
        // Solid for almost all of its life, dissolving only at the very end —
        // that flicker is the tell, and it arrives too late to help much.
        const life = s.decoyTicks / 110;
        ghost.setAlpha(life > 0.2 ? 1 : life * 5);
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
      const live = c.alive && s.visible && c.def.supporter.role === 'arcTether' && s.tetherLive;
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
      if (c.alive && sup.decoyTicks > 0 && c.def.supporter.role === 'decoy') {
        pts.push({ x: sup.decoyX, y: sup.decoyY });
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
    this.hud.update(dt);
    for (const b of this.banter) b.update(dt);
    this.debug.update(dt * 1000, (x, y) => ({ x, y }));
  }
}
