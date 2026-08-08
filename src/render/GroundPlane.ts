import Phaser from 'phaser';
import { ARENA_H, ARENA_W, DECK_Y } from '../core/GameConfig';
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
  private readonly deck: Phaser.GameObjects.Graphics;
  private readonly shadows: Phaser.GameObjects.Graphics;

  /**
   * Height of the drawn slab below the contact line.
   *
   * **Was 220 past the arena floor and that was not enough.** Driven to the
   * bottom of the arena with both machines low and far apart — the camera zooms
   * out to frame them — the view reaches 354 world pixels below the deck, so
   * the fill ran out and the parallax backdrop showed through underneath it.
   * That is the exact leak this slab exists to prevent, displaced lower down.
   *
   * Generous on purpose: it is a flat fill with no per-frame cost, and the
   * failure mode of being too short is sky under the floor.
   */
  private static readonly SLAB = ARENA_H - DECK_Y + 560;
  /** Above this height a machine casts no visible shadow. */
  private static readonly SHADOW_FADE = 420;

  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.deck, this.shadows];
  }

  constructor(scene: Phaser.Scene) {
    // Shadows sit on the deck but under the machines.
    this.shadows = scene.add.graphics();
    this.shadows.setDepth(depthSortAt(DECK_Y, 12));

    this.deck = scene.add.graphics();
    this.deck.setDepth(depthSortAt(DECK_Y, 10));
    this.paint();
  }

  /**
   * The deck is static world geometry, so it is painted once rather than every
   * frame — only the shadows move.
   *
   * `arena_near` supplies the deck's own surface and hazard lip; this layer sits
   * behind it and guarantees the floor is opaque all the way down, so diving to
   * the deck can never reveal sky through a gap under it.
   */
  private paint(): void {
    const g = this.deck;
    const y = DECK_Y;
    const slab = GroundPlane.SLAB;
    g.clear();

    // **This was a visible flat grey block.** `arena_near`'s deck art runs out
    // 172 world pixels below the contact line — its last opaque row is 920 of
    // 1024 — while this slab extends 250, so the bottom ~78px had nothing drawn
    // over them and showed the bare fill. Widening the art is the other fix and
    // needs a new asset; grading the fill is the one that also happens to be
    // correct, because what is under the deck is two kilometres of darkening
    // air, not a floor.
    //
    // The old ramp was seven bands at 0.06 alpha — about a third of a stop in
    // total, which is why it read as one colour. This runs the whole way from
    // the deck's own value down to near-black, in enough steps that the
    // banding falls below one 8-bit level.
    // **Void, not concrete.** 0x14161f is a light enough grey to read as a
    // surface, and a surface is exactly what is not down there — the deck hangs
    // over two kilometres of air. Starting near-black means that even with no
    // art over it this reads as depth rather than as an undrawn rectangle. It
    // is a backing for `arena_under`, not a substitute for it.
    const rows = 48;
    const top = Phaser.Display.Color.ValueToColor(0x090b12);
    const bottom = Phaser.Display.Color.ValueToColor(0x020306);
    for (let i = 0; i < rows; i++) {
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(
        top,
        bottom,
        rows - 1,
        i,
      );
      g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1);
      g.fillRect(-400, y + (i * slab) / rows, ARENA_W + 800, slab / rows + 1);
    }
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
    this.deck.destroy();
    this.shadows.destroy();
  }
}
