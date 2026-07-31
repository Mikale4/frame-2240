import type Phaser from 'phaser';

/**
 * Resolves a mech part to a texture key, and a frame name when one is needed.
 *
 * Parts used to be 112 individual textures. They are now packed one atlas per
 * chassis (`tools/pack_atlases.py`), which cuts the request count and lets
 * Phaser batch a whole mech from a single texture bind instead of up to
 * fourteen.
 *
 * Both forms stay supported on purpose: a chassis with no exported art gets
 * generated placeholder textures under the flat `mech_<id>_<part>` keys, and
 * that path must keep working so the game still runs from a bare checkout.
 * Callers ask here rather than assuming either layout.
 */
export interface PartTextureRef {
  key: string;
  /** Undefined for a standalone texture; the part name for an atlas frame. */
  frame?: string;
}

export function partTexture(
  scene: Phaser.Scene,
  mechId: string,
  partName: string,
): PartTextureRef {
  const atlas = `mech_${mechId}`;
  if (scene.textures.exists(atlas)) {
    const tex = scene.textures.get(atlas);
    if (tex.has(partName)) return { key: atlas, frame: partName };
  }
  return { key: `mech_${mechId}_${partName}` };
}
