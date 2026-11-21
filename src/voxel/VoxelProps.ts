import * as THREE from 'three';
import { glowMat, litMat, meshGrid, type MeshedGrid } from './VoxelKit';
import { voxelMechGrids, voxelMechJson } from './VoxelMechData';
import { glowTexture } from './VoxelArena';
import { WORLD_PER_PX, worldX, worldY } from './World';

const DRONE_GEOM = new Map<string, MeshedGrid | null>();
const _d = new THREE.Vector3();
const _x = new THREE.Vector3(1, 0, 0);
let QUAD: THREE.PlaneGeometry | null = null;

/**
 * A supporter drone, voxelized from the same Blender object its sprite came
 * from. Modelled nose-along +x; it mirrors rather than flying upside down, the
 * rule the sprite followed.
 */
export class VoxelDrone {
  readonly root = new THREE.Group();
  private readonly mirror = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly mat: THREE.MeshLambertMaterial;
  private readonly glow: THREE.MeshBasicMaterial;
  private bob = Math.random() * 6;

  constructor(parent: THREE.Object3D, mechId: string) {
    parent.add(this.root);
    this.root.add(this.mirror);
    this.mirror.add(this.body);
    this.mat = litMat().clone();
    this.glow = glowMat().clone();
    let geo = DRONE_GEOM.get(mechId);
    if (geo === undefined) {
      const g = voxelMechGrids(mechId)?.get('drone');
      geo = g ? meshGrid(g, voxelMechJson(mechId)?.voxelPx ?? 3) : null;
      DRONE_GEOM.set(mechId, geo);
    }
    if (geo?.lit) {
      const m = new THREE.Mesh(geo.lit, this.mat);
      m.castShadow = true;
      this.body.add(m);
    }
    if (geo?.glow) this.body.add(new THREE.Mesh(geo.glow, this.glow));
    // Drones are small; the sprite drew them at the chassis scale.
    this.body.scale.setScalar(WORLD_PER_PX);
  }

  /** Position (sim px), facing and aim (sim radians). */
  setPose(x: number, y: number, facing: number, aim: number, dt: number): void {
    this.bob += dt * 3;
    this.root.position.set(worldX(x), worldY(y) + Math.sin(this.bob) * 0.04, 0.35);
    this.mirror.scale.x = facing >= 0 ? 1 : -1;
    this.mirror.rotation.y = facing >= 0 ? -0.35 : 0.35;
    const local = facing >= 0 ? aim : Math.PI - aim;
    this.body.rotation.z = -local;
  }

  setVisible(v: boolean): void {
    this.root.visible = v;
  }

  setAlpha(a: number): void {
    const fading = a < 0.999;
    for (const m of [this.mat, this.glow]) {
      if (m.transparent !== fading) {
        m.transparent = fading;
        m.needsUpdate = true;
      }
      m.opacity = a;
    }
  }

  destroy(): void {
    this.root.removeFromParent();
    this.mat.dispose();
    this.glow.dispose();
  }
}

/**
 * An additive streak of light in the fight plane: the beam blade's bloom.
 * Same setters as the Phaser image it replaces.
 */
export class Bloom3D {
  readonly mesh: THREE.Mesh;
  private readonly mat: THREE.MeshBasicMaterial;
  private x = 0;
  private y = 0;

  constructor(parent: THREE.Object3D) {
    this.mat = new THREE.MeshBasicMaterial({
      map: glowTexture(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    if (!QUAD) QUAD = new THREE.PlaneGeometry(1, 1);
    this.mesh = new THREE.Mesh(QUAD, this.mat);
    this.mesh.renderOrder = 24;
    this.mesh.visible = false;
    parent.add(this.mesh);
  }

  setVisible(v: boolean): this {
    this.mesh.visible = v;
    return this;
  }

  setPosition(x: number, y: number): this {
    this.x = x;
    this.y = y;
    this.mesh.position.set(worldX(x), worldY(y), 0.45);
    return this;
  }

  /** Sim radians. */
  setRotation(r: number): this {
    this.mesh.rotation.z = -r;
    return this;
  }

  /** Lays the streak between two world points, `thick` logical px wide. */
  setSpan(a: THREE.Vector3, b: THREE.Vector3, thick: number): this {
    const d = _d.subVectors(b, a);
    const len = d.length() || 1e-4;
    this.mesh.position.addVectors(a, b).multiplyScalar(0.5);
    this.mesh.quaternion.setFromUnitVectors(_x, d.multiplyScalar(1 / len));
    this.mesh.scale.set(len, thick * WORLD_PER_PX * 2.2, 1);
    return this;
  }

  /** Length and thickness in logical px (the sprite's 128x24 streak, pre-scaled). */
  setSize(len: number, thick: number): this {
    this.mesh.scale.set(len * WORLD_PER_PX, thick * WORLD_PER_PX * 2.2, 1);
    return this;
  }

  setTint(c: number): this {
    this.mat.color.setHex(c);
    return this;
  }

  setAlpha(a: number): this {
    this.mat.opacity = a;
    return this;
  }

  get px(): number {
    return this.x;
  }

  get py(): number {
    return this.y;
  }

  destroy(): void {
    this.mesh.removeFromParent();
    this.mat.dispose();
  }
}
