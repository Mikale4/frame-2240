import Phaser from 'phaser';
import { flickerLevel } from '../render/EnergyFlicker';

/**
 * The game's panel language: a projected holographic plate.
 *
 * Three surfaces were drawing their own version of the same idea — the rival
 * skill modal, the corner banter boxes, and the saturation cutscene, whose
 * comment already said it was "the same frame the corner banter boxes use,
 * scaled up". Three copies of a look is how a look stops being one, so it lives
 * here once.
 *
 * **What makes it read as projected rather than as a box:**
 *
 * * A **lit teal fill**, not near-black. A dark plate reads as a hole cut in
 *   the screen; a lit one reads as something laid over it.
 * * **Scanlines that drift**, plus one brighter sweep. Static lines are a
 *   texture; moving ones are a signal. The drift is the whole tell.
 * * **A steady frame.** The border does not flicker — it is the edge of the
 *   control itself, and blinking it makes the panel look like it is failing
 *   rather than lit. Only what is *inside* the frame is holographic.
 * * **A stepped flicker**, from `flickerLevel` — the same table the energy
 *   blades and the shock baton run on (D140, transcribed from the reference's
 *   own `.air` data). A sine reads as a fade and would match nothing else lit
 *   in this game.
 */

/** Fill colour of a holographic plate. */
export const HOLO_FILL = 0x0d3f5c;
/** Scanline colour, and the brighter sweep. */
const SCAN_RGB = 0x8fe9ff;
const SWEEP_RGB = 0xbdf3ff;
/** Pixels between scanlines. */
const SCAN_GAP = 4;
/** Scanline drift and sweep travel, in pixels per second. */
const SCAN_SPEED = 14;
const SWEEP_SPEED = 46;

export interface HoloRuling {
  /** Redraw for the current time, in seconds. */
  update(t: number): void;
  /** The graphics object, for adding to a container in the right draw order. */
  readonly gfx: Phaser.GameObjects.Graphics;
}

/**
 * Scanlines for a rectangle, in the coordinate space of whatever contains them.
 *
 * `left`/`top` are the interior's top-left, already inset for the frame. The
 * loop simply never emits a line outside that interior, which is what keeps the
 * ruling inside the plate without needing a mask.
 */
export function holoRuling(
  scene: Phaser.Scene,
  left: number,
  top: number,
  w: number,
  h: number,
): HoloRuling {
  const gfx = scene.add.graphics();
  return {
    gfx,
    update(t: number): void {
      const lvl = flickerLevel(Math.floor(t * 60));
      gfx.clear();
      const right = left + w;
      const bottom = top + h;
      const drift = (t * SCAN_SPEED) % SCAN_GAP;
      gfx.lineStyle(1, SCAN_RGB, 0.13 + 0.05 * lvl);
      for (let y = top - drift; y < bottom; y += SCAN_GAP) {
        if (y < top) continue;
        gfx.lineBetween(left, y, right, y);
      }
      // One brighter sweep, so the plate has a refresh rather than a hum.
      const sweep = top + ((t * SWEEP_SPEED) % h);
      gfx.lineStyle(2, SWEEP_RGB, 0.2);
      gfx.lineBetween(left, sweep, right, sweep);
    },
  };
}

/** The stepped brightness a holographic plate's *contents* ride on. */
export function holoLevel(t: number): number {
  return flickerLevel(Math.floor(t * 60));
}
