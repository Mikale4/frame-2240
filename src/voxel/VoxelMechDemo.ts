import * as THREE from 'three';
import type { MechDef } from '../mechs/MechDef';
import { DemoPoser } from '../ui/MechDemo';
import { thrusterFxFor, type ThrusterFx } from '../render/ThrusterProfiles';
import { yard } from './BattleView3D';
import { VoxelMech } from './VoxelMech';
import type { VoxelInset, VoxelView } from './VoxelStage';
import { simX, simY } from './World';

/** Where in the yard the demo machine hangs: above the deck, in front of the gantry. */
const SPOT = new THREE.Vector3(0, 7.5, 3);
/**
 * One camera distance for every chassis, so TERRAMOTH looms and CIRRUS is
 * slight — the panel exists to show relative size, and per-machine framing
 * would erase it (the sprite demo's `DEMO_SCALE` note makes the same point).
 */
const DIST = 11.5;

/**
 * The select screen's machine preview, in voxels.
 *
 * The same choreography as the sprite demo (`DemoPoser` — idle, boost, fire,
 * dash, saturate), driving a `VoxelMech` hung in the real voxel yard and seen
 * through a camera clipped to the panel's rectangle. The yard is the session's
 * one cached yard: no fight is running on the select screen, so it is free.
 */
export class VoxelMechDemo implements VoxelView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 2400);
  readonly insets: VoxelInset[];
  private readonly mech: VoxelMech;
  private readonly poser: DemoPoser;
  private readonly fx: ThrusterFx;
  private readonly tint: number;
  private readonly size: number;
  private readonly cam = new THREE.PerspectiveCamera(30, 1, 0.1, 2400);
  private readonly nozzle = new THREE.Vector3();
  private t = 0;

  /** `rect` is the panel in Phaser logical pixels. */
  constructor(def: MechDef, rect: { x: number; y: number; w: number; h: number }) {
    const y = yard();
    this.mech = new VoxelMech(def);
    y.scene.add(this.mech.root);
    this.poser = new DemoPoser(def);
    this.fx = thrusterFxFor(def.faction);
    this.tint = def.tint.thruster;
    this.size = def.rig.scale;
    y.fx.clear();
    y.projectiles.clear();
    // The full-screen pass draws nothing: the page's own colour shows, as it
    // always did. Only the inset carries the yard.
    this.scene.background = null;
    this.insets = [{ scene: y.scene, camera: this.cam, ...rect, visible: true }];
    this.update(0);
  }

  update(dt: number): void {
    this.t += dt;
    const y = yard();
    const p = this.poser.update(dt);
    this.mech.sync(p, simX(SPOT.x), simY(SPOT.y), dt);
    y.fx.beginFrame();
    if (p.thrust > 0.08) {
      for (const name of ['leftThruster', 'rightThruster']) {
        const w = this.mech.partWorld3(name, this.nozzle);
        if (w) y.fx.thruster3(w, Math.PI - p.aim, p.thrust, this.tint, this.size, this.fx);
      }
    }
    y.fx.update(dt);
    // A slow drift round the machine, so it reads as a solid thing. It orbits
    // the machine's visual centre — a little ahead of and below the core
    // pivot, where the gun and the legs put the mass — not the pivot itself.
    const a = 0.2 + Math.sin(this.t * 0.25) * 0.24;
    const cx = SPOT.x + 0.35;
    const cy = SPOT.y - 0.55;
    this.cam.position.set(cx + Math.sin(a) * DIST, cy + 1.4, SPOT.z + Math.cos(a) * DIST);
    this.cam.lookAt(cx, cy, SPOT.z);
    y.arena.update(dt, SPOT);
  }

  dispose(): void {
    this.mech.destroy();
    const y = yard();
    y.fx.clear();
    y.fx.beginFrame();
  }
}
