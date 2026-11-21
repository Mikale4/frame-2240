import Phaser from 'phaser';
import { buildTitleDesign, type TitleDesignId } from './TitleDesigns';

/**
 * The title mark: two wordmark blocks on a shared diagonal.
 *
 * The name splits across two lines rather than running as one string, because a
 * single 15-character line is a bar and a bar is what made the title screen read
 * as empty. `F.R.A.M.E.` sits high and left, `2240` low and right, on a
 * descending axis — so the eye travels the diagonal instead of scanning a line.
 *
 * **The name is on the left because the title still has to be read.** Putting
 * the number on the left put it first in reading order, so the mark announced
 * itself as `2240 F.R.A.M.E.` however it was laid out. The diagonal survives the
 * swap; the reading order does not survive not making it.
 *
 * **Lettering only.** It used to carry a turning gear train and the listing
 * Stillwake Yard behind the lettering — painted, then briefly voxel — and the
 * owner had both removed (D181). The live fight behind the title is the
 * backdrop now.
 */
export class TitleMark {
  readonly container: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, x: number, y: number, design: TitleDesignId) {
    this.container = scene.add.container(x, y).setDepth(1200).setScrollFactor(0);
    buildTitleDesign(scene, design, this.container);
  }

  destroy(): void {
    this.container.destroy(true);
  }
}
