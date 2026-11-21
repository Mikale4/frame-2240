import Phaser from 'phaser';
import { BustRenderer, PILOT_LOOKS } from '../voxel/PilotBusts';

/**
 * Puts the live voxel busts behind the portrait texture keys.
 *
 * Every screen that shows a pilot asks Phaser for `pilot_<id>` (the 256 px
 * portrait) or `pilot_<id>_thumb` (the tighter crop) and sizes it with
 * `setDisplaySize`. This swaps each of those textures for a canvas texture the
 * bust renderer paints into, so the banter boxes, the saturation cut-in, the
 * select screen and the Archive all show the voxel pilot without knowing it.
 *
 * Only busts something is actually showing are redrawn — found each tick by
 * walking the active scenes' display lists — at about 24 frames a second,
 * which is what Post Parade runs its busts at and plenty for breathing and
 * blinking.
 */

/** Thumbnails are drawn bigger than the 96 px they replace: the cut-in shows one at ~130. */
const THUMB_PX = 160;
const PORTRAIT_PX = 256;
/** Twice the select screen's 92x76 plate. */
const CARD_W = 184;
const CARD_H = 152;
const FRAME_MS = 42;

let renderer: BustRenderer | null = null;
let last = 0;

function inUse(game: Phaser.Game): Set<string> {
  const keys = new Set<string>();
  const walk = (list: Phaser.GameObjects.GameObject[]): void => {
    for (const o of list) {
      const v = o as Phaser.GameObjects.Image & { list?: Phaser.GameObjects.GameObject[] };
      if (v.visible === false) continue;
      if (v.list) walk(v.list);
      const k = v.texture?.key;
      if (k && renderer?.has(k)) keys.add(k);
    }
  };
  for (const s of game.scene.getScenes(true)) walk(s.sys.displayList.list);
  return keys;
}

/**
 * Builds the busts and takes over the portrait keys. Call once, from the boot
 * scene's `create`, after the painted portraits have loaded — if WebGL cannot
 * give the busts a context, the painted art simply stays.
 */
export function installPilotBusts(scene: Phaser.Scene): boolean {
  if (renderer) return true;
  try {
    renderer = new BustRenderer();
  } catch (err) {
    console.warn('[busts] no WebGL for the pilot busts; keeping the painted portraits', err);
    return false;
  }
  const tex = scene.textures;
  for (const id of Object.keys(PILOT_LOOKS)) {
    for (const [key, w, h, tight] of [
      [`pilot_${id}`, PORTRAIT_PX, PORTRAIT_PX, false],
      [`pilot_${id}_thumb`, THUMB_PX, THUMB_PX, true],
      // The select screen's plate shape, so a bust fills it edge to edge.
      [`pilot_${id}_card`, CARD_W, CARD_H, true],
    ] as [string, number, number, boolean][]) {
      if (tex.exists(key)) tex.remove(key);
      const ct = tex.createCanvas(key, w, h);
      if (!ct) continue;
      renderer.add(key, id, { canvas: ct.canvas, context: ct.context, refresh: () => ct.refresh() }, tight);
    }
  }
  // Every bust gets one frame now, so nothing ever shows an empty texture.
  renderer.drawAll(performance.now());
  const game = scene.game;
  game.events.on(Phaser.Core.Events.PRE_RENDER, () => {
    const now = performance.now();
    if (now - last < FRAME_MS || document.hidden) return;
    last = now;
    for (const k of inUse(game)) renderer!.draw(k, now);
  });
  return true;
}
