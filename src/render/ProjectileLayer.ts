import Phaser from 'phaser';
import { PROJ_FAMILIES } from '../projectiles/families';
import { PROJ_CELL_SPAN, PROJ_HALO_FRAME, PROJ_TEX, coreFrame, shellFrame } from './ProjTextures';
import { depthScaleAt, depthSortAt } from '../core/Depth';
import { ProjKind } from '../combat/types';
import { clamp } from '../core/MathUtil';
import type { Projectile } from '../projectiles/Projectile';
import type { Effects } from './Effects';

/**
 * Draws live projectiles.
 *
 * Every shot is **three** additive sprites rather than one, which is the whole
 * reason this exists as its own class:
 *
 * 1. `halo`  — a soft bloom, tinted, stretched to the shot's proportions.
 * 2. `shell` — the family silhouette, tinted with the pilot's colour.
 * 3. `core`  — the same silhouette, smaller, left white.
 *
 * A hot white centre inside a saturated coloured shell is the single most
 * recognisable property of the reference's projectiles, and of the Touhou
 * bullets the user pointed at as the same idiom. It cannot be produced by one
 * tinted sprite: Phaser's tint is a multiply, so tinting a white texture crimson
 * makes *all* of it crimson, core included. Drawing the core as its own
 * untinted layer over an additive shell is what puts the white back.
 *
 * The other half of the look is the flicker. The reference alternates each
 * projectile frame between two additive strengths (`A` and `A1`), a 60 Hz
 * shimmer. Ours is driven off the projectile's *age in ticks* rather than the
 * render frame, so it stays 60 Hz on a 144 Hz display.
 */
export class ProjectileLayer {
  private readonly halos: Phaser.GameObjects.Image[] = [];
  private readonly shells: Phaser.GameObjects.Image[] = [];
  private readonly cores: Phaser.GameObjects.Image[] = [];

  constructor(scene: Phaser.Scene, capacity = 160) {
    const make = (frame: string): Phaser.GameObjects.Image => {
      const img = scene.add.image(0, 0, PROJ_TEX, frame);
      img.setBlendMode(Phaser.BlendModes.ADD);
      img.setOrigin(0.5, 0.5);
      img.setVisible(false);
      return img;
    };
    for (let i = 0; i < capacity; i++) {
      this.halos.push(make(PROJ_HALO_FRAME));
      this.shells.push(make(shellFrame('pellet')));
      this.cores.push(make(coreFrame('pellet')));
    }
  }

  /** Everything this layer owns, for the scene's world-camera object list. */
  get objects(): Phaser.GameObjects.GameObject[] {
    return [...this.halos, ...this.shells, ...this.cores];
  }

  /**
   * Positions one sprite per layer for every live shot, and sheds trails.
   *
   * `tintOf` resolves the owner's colour: the reference gives a pilot one colour
   * across their entire output, weapons included, and so do we.
   */
  draw(projectiles: readonly Projectile[], tintOf: (ownerId: number) => number, effects: Effects): void {
    let n = 0;

    for (const p of projectiles) {
      if (!p.active) continue;
      if (n >= this.shells.length) break;

      const halo = this.halos[n];
      const shell = this.shells[n];
      const core = this.cores[n];
      n++;

      const d = depthScaleAt(p.y);
      const depth = depthSortAt(p.y, 40);

      // Melee is a hit volume travelling with the swing, not a shot. It keeps
      // the faint dot it always had — the blade sprite and the slash arc are
      // what the player actually reads — and skips the rest of this.
      if (p.kind === ProjKind.Melee) {
        halo.setVisible(true).setPosition(p.x, p.y).setFrame(PROJ_HALO_FRAME);
        halo.setScale(0.09 * d).setRotation(0).setTint(tintOf(p.ownerId)).setAlpha(0.55);
        halo.setDepth(depth);
        shell.setVisible(false);
        core.setVisible(false);
        continue;
      }

      const f = PROJ_FAMILIES[p.family];
      const tint = tintOf(p.ownerId);
      const long = Math.max(f.length, f.width);
      const base = (long / PROJ_CELL_SPAN) * p.visualScale * d;

      const rotation =
        f.align === 'velocity' ? p.angle : f.align === 'spin' ? p.age * f.spin : 0;

      // The 60 Hz additive flicker, and a short fade-out so a shot expiring
      // mid-air does not simply vanish.
      const flick = 1 - f.flicker * (p.age & 1);
      const fade =
        p.kind === ProjKind.Beam ? clamp(p.life / 12, 0.15, 1) : clamp(p.life / 8, 0.3, 1);
      const a = flick * fade;

      // The bloom follows the silhouette's proportions, with a floor on the
      // short axis: a circular glow around a hairline needle reads as a bug.
      const haloX = ((f.length * f.halo) / PROJ_CELL_SPAN) * p.visualScale * d;
      const haloY = ((Math.max(f.width, f.length * 0.22) * f.halo) / PROJ_CELL_SPAN) * p.visualScale * d;
      halo.setVisible(true).setPosition(p.x, p.y).setFrame(PROJ_HALO_FRAME);
      halo.setScale(haloX, haloY).setRotation(rotation).setTint(tint).setAlpha(0.42 * a);
      halo.setDepth(depth);

      shell.setVisible(true).setPosition(p.x, p.y).setFrame(shellFrame(p.family));
      shell.setScale(base).setRotation(rotation).setTint(tint).setAlpha(0.95 * a);
      shell.setDepth(depth + 0.001);

      if (f.core > 0) {
        core.setVisible(true).setPosition(p.x, p.y).setFrame(coreFrame(p.family));
        core.setScale(base).setRotation(rotation).setTint(0xffffff).setAlpha(0.95 * a);
        core.setDepth(depth + 0.002);
      } else {
        core.setVisible(false);
      }

      // Trails come off the previous position, so a fast shot lays them along
      // the gap it just crossed rather than stacking them on its own nose.
      if (f.trail > 0 && Math.random() < f.trail) {
        effects.projTrail(p.prevX, p.prevY, p.angle, p.family, tint);
      }
    }

    for (let i = n; i < this.shells.length; i++) {
      this.halos[i].setVisible(false);
      this.shells[i].setVisible(false);
      this.cores[i].setVisible(false);
    }
  }

  clear(): void {
    for (let i = 0; i < this.shells.length; i++) {
      this.halos[i].setVisible(false);
      this.shells[i].setVisible(false);
      this.cores[i].setVisible(false);
    }
  }
}
