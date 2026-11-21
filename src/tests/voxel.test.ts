import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MECHS } from '../data/mechs';
import { ARENA_H, ARENA_W, DECK_Y } from '../core/GameConfig';
import { GLOW, Grid, glow, meshGrid } from '../voxel/VoxelKit';
import { decodePart, type VoxelMechJson } from '../voxel/VoxelMechData';
import { PLAY_LEFT, PLAY_RIGHT, simX, simY, worldX, worldY } from '../voxel/World';
import { Gfx3D } from '../voxel/Gfx3D';
import * as THREE from 'three';

/**
 * The voxel layer's contracts.
 *
 * The fight is unchanged — `MatchSim` still runs in its own plane — so what can
 * go wrong here is the *drawing* disagreeing with the simulation: a part
 * hung on the wrong pivot, a sim point mapped somewhere it is not, an overlay
 * drawn at a radius other than the one the hit test uses. Those are what these
 * pin down.
 */

const ROOT = process.cwd();
const VOX_DIR = path.join(ROOT, 'assets', 'voxels');
const load = (id: string): VoxelMechJson =>
  JSON.parse(fs.readFileSync(path.join(VOX_DIR, `${id}.json`), 'utf-8')) as VoxelMechJson;

/** Painted energy has no Blender object; it comes from a sprite when one exists. */
const PAINTED = new Set(['meleeEnergy', 'meleeArc']);

describe('voxelized roster', () => {
  const ids = Object.keys(MECHS);

  it('has a voxel file for every chassis', () => {
    for (const id of ids) expect(fs.existsSync(path.join(VOX_DIR, `${id}.json`)), id).toBe(true);
  });

  it('gives every rig part voxels, and every machine a drone', () => {
    for (const id of ids) {
      const json = load(id);
      for (const part of MECHS[id].rig.parts) {
        const p = json.parts[part.name];
        expect(p, `${id}.${part.name}`).toBeDefined();
        expect(p.n, `${id}.${part.name} is empty`).toBeGreaterThan(0);
      }
      expect(json.parts.drone?.n ?? 0, `${id}.drone`).toBeGreaterThan(20);
    }
  });

  it('hangs every part on the pivot MechDef.rig gives it', () => {
    // The voxel data records each part's pivot in Blender; the rig places it by
    // summing offsets up the parent chain. If these drift apart the voxel parts
    // assemble into a different machine from the one the sprites drew.
    for (const id of ids) {
      const rig = MECHS[id].rig;
      const byName = new Map(rig.parts.map((p) => [p.name, p]));
      const json = load(id);
      for (const part of rig.parts) {
        if (PAINTED.has(part.name)) continue;
        let x = 0;
        let y = 0;
        for (let p: typeof part | undefined = part; p; p = p.parent ? byName.get(p.parent) : undefined) {
          x += p.x;
          y += p.y;
        }
        const o = json.parts[part.name].origin!;
        expect(Math.abs(o[0] - x), `${id}.${part.name} x`).toBeLessThan(1.5);
        expect(Math.abs(o[1] - y), `${id}.${part.name} y`).toBeLessThan(1.5);
      }
    }
  });

  it('puts the near arm in front of the hull and the far arm behind it', () => {
    for (const id of ids) {
      const json = load(id);
      const near = json.parts.rightArm.origin![2];
      const far = json.parts.leftArm.origin![2];
      expect(near, `${id} near arm depth`).toBeGreaterThan(far);
    }
  });

  it('decodes to the advertised count, with glow flags from the palette', () => {
    const json = load('halcyon');
    for (const [name, part] of Object.entries(json.parts)) {
      const g = decodePart(json, part);
      expect(g.size, name).toBe(part.n);
    }
    const glowing = json.palette.filter((p) => p[1]).length;
    expect(glowing).toBeGreaterThan(0);
    let lit = 0;
    let lights = 0;
    decodePart(json, json.parts.core).each((_x, _y, _z, c) => {
      if (c & GLOW) lights++;
      else lit++;
    });
    expect(lit).toBeGreaterThan(lights);
  });
});

describe('sim plane <-> world', () => {
  it('round-trips', () => {
    for (const [x, y] of [[0, 0], [ARENA_W, ARENA_H], [731.5, 402.25]]) {
      expect(simX(worldX(x))).toBeCloseTo(x, 6);
      expect(simY(worldY(y))).toBeCloseTo(y, 6);
    }
  });

  it('stands the deck at y = 0 and centres the arena on x = 0', () => {
    expect(worldY(DECK_Y)).toBe(0);
    expect(worldX(ARENA_W / 2)).toBe(0);
    expect(PLAY_LEFT).toBe(-PLAY_RIGHT);
    // Sim y is down; world y is up.
    expect(worldY(DECK_Y - 100)).toBeGreaterThan(0);
  });
});

describe('mesher', () => {
  it('emits six faces for a lone voxel and hides shared faces', () => {
    const one = new Grid().set(0, 0, 0, 0x808080);
    const m1 = meshGrid(one, 1);
    expect(m1.lit!.index!.count / 6).toBe(6);
    const two = new Grid().set(0, 0, 0, 0x808080).set(1, 0, 0, 0x808080);
    const m2 = meshGrid(two, 1);
    expect(m2.lit!.index!.count / 6).toBe(10);
  });

  it('splits glowing voxels into their own unlit geometry', () => {
    const g = new Grid().set(0, 0, 0, 0x808080).set(0, 2, 0, glow(0x00ffff));
    const m = meshGrid(g, 1);
    expect(m.lit!.index!.count / 6).toBe(6);
    expect(m.glow!.index!.count / 6).toBe(6);
  });

  it('darkens a corner tucked against a neighbour (ambient occlusion)', () => {
    const g = new Grid().set(0, 0, 0, 0xffffff).set(1, 1, 0, 0xffffff);
    g.jit = 0;
    const m = meshGrid(g, 1);
    const col = m.lit!.getAttribute('color');
    let min = 1;
    let max = 0;
    for (let i = 0; i < col.count; i++) {
      min = Math.min(min, col.getX(i));
      max = Math.max(max, col.getX(i));
    }
    expect(min).toBeLessThan(max * 0.75);
  });
});

describe('Gfx3D overlay adapter', () => {
  it('draws a circle at exactly the sim radius, in the fight plane', () => {
    const g = new Gfx3D(new THREE.Group(), { z: 0.25 });
    g.lineStyle(0.001, 0xffffff, 1);
    g.strokeCircle(ARENA_W / 2, DECK_Y - 400, 150);
    g.flush();
    const pos = g.mesh.geometry.getAttribute('position');
    const cx = worldX(ARENA_W / 2);
    const cy = worldY(DECK_Y - 400);
    const r = worldX(ARENA_W / 2 + 150) - cx;
    const n = g.mesh.geometry.drawRange.count;
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      expect(Math.hypot(pos.getX(i) - cx, pos.getY(i) - cy)).toBeCloseTo(r, 2);
      expect(pos.getZ(i)).toBe(0.25);
    }
    g.destroy();
  });

  it('starts empty again after clear()', () => {
    const g = new Gfx3D(new THREE.Group());
    g.fillStyle(0xff0000, 1).fillRect(0, 0, 10, 10);
    g.flush();
    expect(g.mesh.geometry.drawRange.count).toBe(6);
    g.clear();
    g.flush();
    expect(g.mesh.geometry.drawRange.count).toBe(0);
    g.destroy();
  });
});
