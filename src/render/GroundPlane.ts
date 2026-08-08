import Phaser from 'phaser';
import { DECK_Y } from '../core/GameConfig';
import { depthScaleAt, depthSortAt } from '../core/Depth';
import type { Combatant } from '../combat/Combatant';

/**
 * The arena deck.
 *
 * The floor used to exist only in the simulation: machines stopped falling at an
 * invisible height while the "near" parallax strip slid around on its own,
 * screen-anchored, schedule. You could not tell where the ground was, and a
 * landed mech looked like it was hovering.
 *
 * This draws the deck where the deck actually is — one world-space surface at
 * `DECK_Y`, the same line `MatchSim` stands machines on — with:
 *
 * * a solid slab below the line, so "floor" is opaque rather than implied;
 * * a bright contact lip exactly on the line;
 * * receding plate seams that converge with the pseudo-3D depth scale, giving
 *   the deck a readable sense of running away from the camera;
 * * a soft contact shadow per machine that tightens as it descends, which is
 *   what actually tells a player how high they are.
 */
export class GroundPlane {
  private readonly shadows: Phaser.GameObjects.Graphics;

  /** Above this height a machine casts no visible shadow. */
  private static readonly SHADOW_FADE = 420;

  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.shadows];
  }

  /**
   * **There used to be a painted slab here and it is gone.**
   *
   * It filled from the deck line downward to guarantee the floor was opaque, so
   * that diving to the deck could never reveal sky through a gap beneath it.
   * That was a real hole: `arena_near`'s art stops 172 world pixels below the
   * contact line and the camera reaches 354.
   *
   * `arena_under` now draws that structure properly, and the slab measured as
   * contributing nothing — hiding it moved the rendered pixels beneath the deck
   * by at most 1 of 255. A fill that changes nothing is not insurance, it is
   * something to explain, so it went with the problem it was covering.
   *
   * If sky ever shows under the deck again, the fix is `arena_under`'s reach or
   * its alpha, not a rectangle over the top of it.
   */
  constructor(scene: Phaser.Scene) {
    // Shadows sit on the deck but under the machines.
    this.shadows = scene.add.graphics();
    this.shadows.setDepth(depthSortAt(DECK_Y, 12));
  }

  /**
   * Redraws the contact shadows.
   *
   * A shadow directly under a machine, shrinking and darkening as it descends,
   * is the cheapest and clearest altitude cue there is — far more readable than
   * trying to judge height against a parallax backdrop.
   */
  update(combatants: readonly Combatant[]): void {
    const g = this.shadows;
    g.clear();

    for (const c of combatants) {
      if (!c.alive) continue;
      const feet = c.y + c.def.rig.footOffset;
      const height = Math.max(0, DECK_Y - feet);
      if (height > GroundPlane.SHADOW_FADE) continue;

      const k = 1 - height / GroundPlane.SHADOW_FADE;
      const dz = depthScaleAt(DECK_Y);
      const rx = (c.def.rig.hurtRadius * 1.5) * (0.55 + k * 0.65) * dz;
      const ry = rx * 0.26;
      g.fillStyle(0x05060c, 0.10 + k * 0.42);
      g.fillEllipse(c.x, DECK_Y + 3, rx * 2, ry * 2);

      // Drone shadow too, so the escort is anchored to the world as well — but
      // only while it is actually out there. A stowed or destroyed drone casting
      // a shadow was the giveaway that it was still being simulated.
      const s = c.supporter;
      const sh = Math.max(0, DECK_Y - s.y);
      if (s.visible && sh <= GroundPlane.SHADOW_FADE) {
        const sk = 1 - sh / GroundPlane.SHADOW_FADE;
        const srx = c.def.supporter.radius * (0.5 + sk * 0.6) * dz;
        g.fillStyle(0x05060c, 0.07 + sk * 0.25);
        g.fillEllipse(s.x, DECK_Y + 3, srx * 2, srx * 0.5);
      }
    }
  }

  destroy(): void {
    this.shadows.destroy();
  }
}
