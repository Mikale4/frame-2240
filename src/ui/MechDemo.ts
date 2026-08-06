import Phaser from 'phaser';
import { ActState } from '../combat/types';
import { MechRenderer, type MechPoseSource } from '../render/MechRenderer';
import { Effects } from '../render/Effects';
import type { MechDef } from '../mechs/MechDef';
import { ARENA_H } from '../core/GameConfig';

/**
 * A machine demonstrating itself, for the select screen.
 *
 * Replaces the static pilot portrait: instead of a face, the panel shows the
 * *machine*, hovering and periodically running a manoeuvre — boosting, firing,
 * swinging, cycling its saturation mode — like a loop of gun-camera footage
 * playing on a spec sheet. Which is the thing a player actually wants to know
 * when choosing between eight of them.
 *
 * **It drives `MechRenderer` through `MechPoseSource` rather than running a
 * simulation.** The renderer already knows how to bank a chassis, track an aim,
 * dangle legs, light thrusters, drive a melee arc and flicker an energy blade —
 * every one of those is a function of the pose fields, so a synthetic pose gets
 * all of it for free and costs nothing. A headless `MatchSim` would also work
 * and would cost a full combat step per frame per panel, to produce a fight
 * nobody is watching.
 *
 * **No melee beat.** The panel deliberately shows movement and gunnery only. A
 * swing needs a target to be legible — read at 232 px with nothing to hit, the
 * authored arc reads as the machine flailing rather than as a strike. It is a
 * one-line restore in `ROTATION` if that ever stops being true; the arc helpers
 * in `Combatant` are still exported.
 */

/** One thing the machine can be caught doing. */
type Beat = 'idle' | 'boost' | 'fire' | 'dash' | 'saturate';

/**
 * The order is deliberate rather than random.
 *
 * A true shuffle produces runs — three idles together, or the same manoeuvre
 * twice — and on a panel this small a repeat reads as the animation being
 * stuck. This is a fixed rotation with `idle` between the loud beats, so the
 * machine always returns to rest and every manoeuvre starts from the same
 * silhouette. The *entry point* is seeded per chassis, so eight panels on one
 * screen are not marching in step.
 */
const ROTATION: readonly Beat[] = [
  'idle',
  'boost',
  'idle',
  'fire',
  'idle',
  'dash',
  'idle',
  'fire',
  'idle',
  'saturate',
];

/** Seconds each beat runs for. */
const DURATION: Record<Beat, number> = {
  idle: 1.9,
  boost: 1.6,
  fire: 1.3,
  dash: 1.1,
  saturate: 1.7,
};

export class MechDemo {
  private readonly renderer: MechRenderer;
  private readonly holder: Phaser.GameObjects.Container;
  /**
   * The demo's own particle system.
   *
   * Thruster plumes are emitted by `BattleScene`, not by `MechRenderer`, so a
   * rig drawn anywhere else has working thruster *parts* — they splay and
   * gimbal under load — and no exhaust at all. The panel gets a small pool of
   * its own, parented into the holder so the plumes move and clip with the
   * machine rather than floating across the menu behind it.
   */
  private readonly effects: Effects;
  private readonly tint: number;
  /** Chassis scale, so a big machine gets a big plume. */
  private readonly size: number;
  /** Scratch for world -> holder-local conversion. */
  private readonly scratch = new Phaser.Math.Vector2();
  private readonly pose: MechPoseSource;
  private beat = 0;
  private beatT = 0;
  /** Free-running clock, for the hover bob and aim sway. */
  private t = 0;
  private readonly x: number;
  private readonly y: number;

  constructor(scene: Phaser.Scene, def: MechDef, x: number, y: number, scale = 1) {
    // **Local origin, because `sync` owns the renderer's transform.**
    //
    // `MechRenderer.sync` sets the root's position, scale *and* depth every
    // frame — the scale from `depthScaleAt(pose.y)`, which is the arena's
    // pseudo-3D and not something a UI panel wants a say in. So the renderer is
    // parented to a holder that this class owns, and driven at the holder's
    // origin. Setting the root's scale directly would be silently reverted on
    // the next frame, which is exactly what happened first.
    this.x = 0;
    this.y = 0;
    this.holder = scene.add.container(x, y);
    this.holder.setScale(scale);
    this.renderer = new MechRenderer(scene, def, def.id);
    this.holder.add(this.renderer.root);
    // Small pool: two nozzles on one machine, not a battlefield.
    this.effects = new Effects(scene, 0, 200);
    // **Under the rig**, so the plume emerges from behind the nozzle rather
    // than being painted across the chassis. Same reasoning as the battle
    // scene's separate exhaust layer.
    this.holder.addAt(this.effects.root, 0);
    this.tint = def.tint.thruster;
    this.size = def.rig.scale;

    this.pose = {
      alive: true,
      act: ActState.Free,
      // Mid-arena: `depthScaleAt` is a ramp over arena height, so this parks
      // the pseudo-3D at its midpoint and leaves `scale` the only dial.
      y: ARENA_H / 2,
      facing: 1,
      aim: 0,
      bank: 0,
      bobPhase: 0,
      spin: 0,
      reach: 0,
      grip: 0,
      weaponSpin: 0,
      lean: 0,
      lift: 0,
      thrust: 0,
      swinging: false,
      hitstop: 0,
      satActive: false,
      walkPhase: 0,
      stride: 0,
      legSwing: [0, 0],
      status: {} as MechPoseSource['status'],
    };

    // **Centred on its own silhouette, per chassis.**
    //
    // The rig's origin is `core`, which is nowhere near the middle of what you
    // actually see — the weapon arm reaches out one side, the legs hang below,
    // and every chassis is a different shape. Placing the origin at the panel
    // centre therefore leaves each machine offset by a different amount, and
    // PYRE — the tallest silhouette on the roster — hung out of the box
    // entirely. A hand-tuned nudge fixes exactly one of the eight.
    //
    // So: pose it once, measure what is visible, and shift the holder by
    // whatever it takes to put that centre on the point we were given.
    this.update(0);
    const b = this.visibleBounds();
    if (b) {
      this.holder.x += x - (b.L + b.R) / 2;
      this.holder.y += y - (b.T + b.B) / 2;
    }

    // Stagger the rotation per chassis so a screen of these is not in lockstep.
    // A cheap string hash rather than the rng, because this must be identical
    // every time the screen opens — a demo that starts somewhere new each visit
    // reads as a glitch, not as variety.
    let h = 0;
    for (let i = 0; i < def.id.length; i++) h = (h * 31 + def.id.charCodeAt(i)) | 0;
    this.beat = Math.abs(h) % ROTATION.length;
  }

  /**
   * World-space bounds of everything currently drawn, ignoring hidden parts.
   *
   * `Container.getBounds` counts invisible children, and the rig keeps the
   * melee weapon and its energy layer hidden for the whole demo — on some
   * chassis that is the single widest thing in the tree, so the built-in
   * measurement is badly wrong here.
   */
  private visibleBounds(): { L: number; R: number; T: number; B: number } | null {
    let L = Infinity;
    let R = -Infinity;
    let T = Infinity;
    let B = -Infinity;
    const walk = (c: Phaser.GameObjects.Container): void => {
      for (const ch of c.list) {
        const asC = ch as Phaser.GameObjects.Container;
        if (Array.isArray(asC.list)) {
          walk(asC);
          continue;
        }
        const img = ch as Phaser.GameObjects.Image;
        if (!img.visible || typeof img.getBounds !== 'function') continue;
        const r = img.getBounds();
        if (r.width < 1) continue;
        L = Math.min(L, r.x);
        R = Math.max(R, r.right);
        T = Math.min(T, r.y);
        B = Math.max(B, r.bottom);
      }
    };
    walk(this.renderer.root);
    return L === Infinity ? null : { L, R, T, B };
  }

  /** The holder, for depth and placement. Not the renderer's own root. */
  get root(): Phaser.GameObjects.Container {
    return this.holder;
  }

  update(dt: number): void {
    this.t += dt;
    this.beatT += dt;
    const beat = ROTATION[this.beat];
    if (this.beatT >= DURATION[beat]) {
      this.beatT = 0;
      this.beat = (this.beat + 1) % ROTATION.length;
    }
    // Progress through the current beat, 0..1.
    const u = Math.min(1, this.beatT / DURATION[ROTATION[this.beat]]);

    const p = this.pose;
    // Reset the per-beat fields every frame, so a beat only has to set what it
    // uses and cannot leak a pose into the next one.
    p.act = ActState.Free;
    p.swinging = false;
    p.satActive = false;
    p.spin = 0;
    p.reach = 0;
    p.grip = 0;
    p.weaponSpin = 0;
    p.lean = 0;
    p.lift = 0;
    p.hitstop = 0;

    // Always hovering: the bob and a slow aim sway run under every beat, so the
    // machine is never actually still.
    p.bobPhase = this.t * 2.2;
    p.legSwing = [Math.sin(this.t * 1.7) * 0.10, Math.sin(this.t * 1.7 + 0.7) * 0.07];

    switch (ROTATION[this.beat]) {
      case 'idle':
        p.aim = Math.sin(this.t * 0.8) * 0.14;
        p.bank = Math.sin(this.t * 0.6) * 0.05;
        p.thrust = 0.18 + 0.06 * Math.sin(this.t * 1.9);
        break;

      case 'boost': {
        // Leans into the burn and rolls out of it.
        const ramp = Math.sin(u * Math.PI);
        p.aim = -0.18 * ramp;
        p.bank = -0.34 * ramp;
        p.thrust = 0.35 + 0.65 * ramp;
        break;
      }

      case 'fire': {
        // Three shots, with the arms tracking across as it fires.
        const shot = Math.floor(u * 3);
        const within = u * 3 - shot;
        p.act = within < 0.35 ? ActState.Attack : ActState.Free;
        p.aim = -0.22 + 0.44 * u;
        p.bank = 0.06 * Math.sin(u * Math.PI * 3);
        p.thrust = 0.22;
        // A kick on each shot, which the renderer turns into a rig jitter.
        p.hitstop = within < 0.12 ? 2 : 0;
        break;
      }

      case 'dash': {
        // A hard, short burst: full thrust, deep roll, snapping back at the end.
        const kick = u < 0.3 ? u / 0.3 : 1 - (u - 0.3) / 0.7;
        p.aim = 0.12;
        p.bank = 0.46 * kick;
        p.thrust = 0.4 + 0.6 * kick;
        break;
      }

      case 'saturate':
        // Lit, hanging still, arms wide — the pose the mode deserves.
        p.satActive = true;
        p.aim = Math.sin(this.t * 0.7) * 0.1;
        p.bank = 0;
        p.thrust = 0.45 + 0.2 * Math.sin(this.t * 5.1);
        break;
    }

    this.renderer.sync(p, this.x, this.y, dt);

    // Exhaust, from the nozzles themselves. `partWorld` is in world space and
    // the pool lives inside the holder, so each point comes back through the
    // holder's inverse transform.
    if (p.thrust > 0.08) {
      const m = this.holder.getWorldTransformMatrix();
      // Opposite the way the machine is pointing: it has no velocity to trail.
      const ang = p.aim + Math.PI;
      for (const name of ['leftThruster', 'rightThruster']) {
        const w = this.renderer.partWorld(name);
        if (!w) continue;
        m.applyInverse(w.x, w.y, this.scratch);
        this.effects.thruster(this.scratch.x, this.scratch.y, ang, p.thrust, this.tint, this.size);
      }
    }
    this.effects.update(dt);
  }

  destroy(): void {
    this.renderer.destroy();
    // Destroys the effects layer too: it is a child of the holder.
    this.holder.destroy();
  }
}
