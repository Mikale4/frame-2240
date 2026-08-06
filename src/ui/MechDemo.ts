import Phaser from 'phaser';
import { ActState } from '../combat/types';
import { MechRenderer, type MechPoseSource } from '../render/MechRenderer';
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

    // Stagger the rotation per chassis so a screen of these is not in lockstep.
    // A cheap string hash rather than the rng, because this must be identical
    // every time the screen opens — a demo that starts somewhere new each visit
    // reads as a glitch, not as variety.
    let h = 0;
    for (let i = 0; i < def.id.length; i++) h = (h * 31 + def.id.charCodeAt(i)) | 0;
    this.beat = Math.abs(h) % ROTATION.length;
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
  }

  destroy(): void {
    this.renderer.destroy();
    this.holder.destroy();
  }
}
