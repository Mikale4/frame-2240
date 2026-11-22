/**
 * The walkable world, as data: what a pilot on foot can stand on and what
 * stops them.
 *
 * The Reach is platforms in the air, not terrain, so the model is built from
 * **decks** (flat walkable rectangles at a height), **ramps** (rectangles whose
 * height runs from one edge to the other — stairs, gangways, tram ramps) and
 * **walls** (solid boxes). That is enough for yards, catwalks and spans, and it
 * makes every question cheap and exact.
 *
 * Rules, from the owner's Chao Garden controller (`keeperTick`, `W.blocked`):
 *
 * - you step up anything under `STEP_UP`, and down anything under `STEP_DOWN`;
 *   higher than that is a wall, deeper is an edge;
 * - **nobody walks off a yard** — a step with no deck under it is refused, so
 *   the cloud deck is scenery, never a death;
 * - X and Z are tried separately, so you slide along a wall instead of sticking.
 *
 * World units are metres. Pure TypeScript: no Three, no Phaser.
 */

export interface Deck {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  y: number;
  /**
   * Height of the deck's underside. Omitted, a deck is the top of something
   * solid all the way down — a raised platform is a wall to the deck beside
   * it. Catwalks, bridges and upper levels you can walk beneath give theirs.
   */
  under?: number;
}

export interface Ramp {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Height at the low edge and at the high edge. */
  y0: number;
  y1: number;
  /** Which way the height runs: along +x or +z, from y0 to y1. */
  axis: 'x' | 'z';
}

export interface Wall {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
}

/** A circle that blocks — a person, a crate stack, a bollard. */
export interface Post {
  x: number;
  z: number;
  r: number;
}

export const STEP_UP = 0.55;
export const STEP_DOWN = 1.0;
/** How tall a person is, for wall tests. */
export const BODY_HEIGHT = 1.75;
export const BODY_RADIUS = 0.3;

const inRect = (x: number, z: number, r: { x0: number; z0: number; x1: number; z1: number }): boolean =>
  x >= Math.min(r.x0, r.x1) && x <= Math.max(r.x0, r.x1) && z >= Math.min(r.z0, r.z1) && z <= Math.max(r.z0, r.z1);

export function rampHeight(r: Ramp, x: number, z: number): number {
  const lo = r.axis === 'x' ? Math.min(r.x0, r.x1) : Math.min(r.z0, r.z1);
  const hi = r.axis === 'x' ? Math.max(r.x0, r.x1) : Math.max(r.z0, r.z1);
  const v = r.axis === 'x' ? x : z;
  const t = hi > lo ? (v - lo) / (hi - lo) : 0;
  return r.y0 + (r.y1 - r.y0) * Math.max(0, Math.min(1, t));
}

export class WalkModel {
  decks: Deck[] = [];
  ramps: Ramp[] = [];
  walls: Wall[] = [];
  posts: Post[] = [];

  add(m: { decks?: Deck[]; ramps?: Ramp[]; walls?: Wall[]; posts?: Post[] }): this {
    if (m.decks) this.decks.push(...m.decks);
    if (m.ramps) this.ramps.push(...m.ramps);
    if (m.walls) this.walls.push(...m.walls);
    if (m.posts) this.posts.push(...m.posts);
    return this;
  }

  /**
   * The surface to stand on at (x, z) for a pilot whose feet are at `feet`:
   * the highest surface no more than `STEP_UP` above them. Null if there is
   * nothing underfoot at all (an edge).
   */
  ground(x: number, z: number, feet: number): number | null {
    let best: number | null = null;
    const consider = (h: number): void => {
      if (h <= feet + STEP_UP + 1e-6 && (best === null || h > best)) best = h;
    };
    for (const d of this.decks) if (inRect(x, z, d)) consider(d.y);
    for (const r of this.ramps) if (inRect(x, z, r)) consider(rampHeight(r, x, z));
    return best;
  }

  /**
   * Everything solid at body height for a pilot standing at `feet`, as boxes in
   * plan: walls, and decks too high to step onto but low enough to walk into —
   * a raised platform is solid to the deck beside it, while a catwalk far
   * overhead is not.
   */
  private solids(feet: number): { x0: number; z0: number; x1: number; z1: number }[] {
    const out: { x0: number; z0: number; x1: number; z1: number }[] = [];
    const top = feet + BODY_HEIGHT;
    for (const w of this.walls) {
      if (top <= w.y0 || feet + STEP_UP >= w.y1) continue;
      out.push(w);
    }
    for (const d of this.decks) {
      const under = d.under ?? -Infinity;
      if (d.y > feet + STEP_UP && under < top) out.push(d);
    }
    return out;
  }

  /** Pushes a circle out of every solid box and post; returns the new centre. */
  private pushOut(x: number, z: number, feet: number, radius: number): [number, number] {
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const b of this.solids(feet)) {
        const bx0 = Math.min(b.x0, b.x1);
        const bx1 = Math.max(b.x0, b.x1);
        const bz0 = Math.min(b.z0, b.z1);
        const bz1 = Math.max(b.z0, b.z1);
        const cx = Math.max(bx0, Math.min(x, bx1));
        const cz = Math.max(bz0, Math.min(z, bz1));
        let dx = x - cx;
        let dz = z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        if (d2 < 1e-12) {
          // Centre inside the box: out through the nearest face.
          const pen = [x - bx0, bx1 - x, z - bz0, bz1 - z];
          const k = pen.indexOf(Math.min(...pen));
          if (k === 0) x = bx0 - radius;
          else if (k === 1) x = bx1 + radius;
          else if (k === 2) z = bz0 - radius;
          else z = bz1 + radius;
        } else {
          const d = Math.sqrt(d2);
          dx /= d;
          dz /= d;
          x = cx + dx * (radius + 1e-4);
          z = cz + dz * (radius + 1e-4);
        }
        moved = true;
      }
      for (const p of this.posts) {
        let dx = x - p.x;
        let dz = z - p.z;
        const d = Math.hypot(dx, dz);
        const min = radius + p.r;
        if (d >= min) continue;
        if (d < 1e-6) {
          dx = 1;
          dz = 0;
        } else {
          dx /= d;
          dz /= d;
        }
        x = p.x + dx * (min + 1e-4);
        z = p.z + dz * (min + 1e-4);
        moved = true;
      }
      if (!moved) break;
    }
    return [x, z];
  }

  /** Is a body standing on `feet` at (x, z) inside something solid? */
  blocked(x: number, z: number, feet: number, radius = BODY_RADIUS): boolean {
    const [px, pz] = this.pushOut(x, z, feet, radius);
    return Math.abs(px - x) > 1e-3 || Math.abs(pz - z) > 1e-3;
  }

  /**
   * The footing at (x, z) coming from feet height `feet`: the new feet height,
   * or null if there is no ground, it is too high, or it drops too far. The
   * body needs a deck under its centre and under each side, so it cannot hang
   * half off an edge.
   */
  private footing(x: number, z: number, feet: number, radius: number): number | null {
    const g = this.ground(x, z, feet);
    if (g === null || g < feet - STEP_DOWN) return null;
    const k = radius * 0.7;
    for (const [ox, oz] of [[k, 0], [-k, 0], [0, k], [0, -k]] as const) {
      const h = this.ground(x + ox, z + oz, feet);
      if (h === null || h < g - STEP_DOWN) return null;
    }
    return g;
  }

  /** Can a body stand at (x, z)? Returns the feet height, or null. */
  standAt(x: number, z: number, feet: number, radius = BODY_RADIUS): number | null {
    if (this.blocked(x, z, feet, radius)) return null;
    return this.footing(x, z, feet, radius);
  }

  /**
   * Moves a body by (dx, dz). Walls and posts push it out, so it slides along
   * them and round their corners; edges and ledges refuse the step, trying
   * each axis on its own so it slides along those too. Long moves are broken
   * into short steps so nothing is tunnelled through.
   */
  move(pos: { x: number; y: number; z: number }, dx: number, dz: number, radius = BODY_RADIUS): { x: number; y: number; z: number } {
    const out = { ...pos };
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (radius * 0.5)));
    const sx = dx / steps;
    const sz = dz / steps;
    const attempt = (mx: number, mz: number): boolean => {
      const [nx, nz] = this.pushOut(out.x + mx, out.z + mz, out.y, radius);
      const g = this.footing(nx, nz, out.y, radius);
      if (g === null) return false;
      // Settle against whatever is solid at the new height too.
      const [fx, fz] = this.pushOut(nx, nz, g, radius);
      if (this.footing(fx, fz, g, radius) === null) return false;
      out.x = fx;
      out.z = fz;
      out.y = g;
      return true;
    };
    for (let i = 0; i < steps; i++) {
      if (attempt(sx, sz)) continue;
      attempt(sx, 0);
      attempt(0, sz);
    }
    return out;
  }
}
