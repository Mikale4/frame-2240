import { GLOW, Grid } from './VoxelKit';

/**
 * Voxelized chassis data, as written by `tools/blender/voxelize_mechs.py`.
 *
 * One file per machine in `assets/voxels/<id>.json`. Each part's voxels are
 * packed as int8 quads `(x, y, z, colour)` in base64, in game axes, relative to
 * the part's pivot — so a part's grid can be dropped straight onto the rig node
 * `MechDef.rig` already places at that pivot.
 */
export interface VoxelPartJson {
  n: number;
  bounds: [number, number, number, number, number, number] | null;
  /**
   * Pivot relative to the core in logical px: x forward, y down, z toward the
   * camera. Absent on painted energy, which shares its hilt's pivot.
   */
  origin?: [number, number, number];
  v: string;
}

export interface VoxelMechJson {
  id: string;
  /** Logical pixels per voxel. */
  voxelPx: number;
  palette: [number, number][];
  parts: Record<string, VoxelPartJson>;
}

const RAW = new Map<string, VoxelMechJson>();
const GRIDS = new Map<string, Map<string, Grid>>();

/** Hands a loaded file to the registry. BootScene does this after its preload. */
export function registerVoxelMech(json: VoxelMechJson): void {
  RAW.set(json.id, json);
  GRIDS.delete(json.id);
}

export function hasVoxelMech(id: string): boolean {
  return RAW.has(id);
}

export function voxelMechJson(id: string): VoxelMechJson | undefined {
  return RAW.get(id);
}

function decodeBase64(b64: string): Uint8Array {
  if (typeof atob === 'function') {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  // Node (tests).
  const B = (globalThis as unknown as { Buffer?: { from(s: string, e: string): Uint8Array } }).Buffer;
  if (!B) throw new Error('no base64 decoder available');
  return new Uint8Array(B.from(b64, 'base64'));
}

/** Decodes one part into a Grid. Colours keep the glow flag. */
export function decodePart(json: VoxelMechJson, part: VoxelPartJson): Grid {
  const g = new Grid();
  g.jit = 0.05;
  const bytes = decodeBase64(part.v);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let o = 0; o + 3 < bytes.length; o += 4) {
    const x = view.getInt8(o);
    const y = view.getInt8(o + 1);
    const z = view.getInt8(o + 2);
    const ci = view.getUint8(o + 3);
    const pal = json.palette[ci];
    if (!pal) continue;
    g.set(x, y, z, pal[1] ? (pal[0] & 0xffffff) | GLOW : pal[0] & 0xffffff);
  }
  return g;
}

/** Every part of a machine as grids, decoded once and cached. */
export function voxelMechGrids(id: string): Map<string, Grid> | null {
  const cached = GRIDS.get(id);
  if (cached) return cached;
  const json = RAW.get(id);
  if (!json) return null;
  const out = new Map<string, Grid>();
  for (const [name, part] of Object.entries(json.parts)) out.set(name, decodePart(json, part));
  GRIDS.set(id, out);
  return out;
}
