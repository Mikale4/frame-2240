import * as THREE from 'three';
import { Grid, glow, hash3, mixHex, shade, voxelObject } from '../voxel/VoxelKit';
import { REGIONS, SPANS, doorOf, regionWalk, spanGeometry, type Building, type RegionSpec, type RegionStyle } from '../campaign/Regions';
import type { Ramp } from '../campaign/WorldModel';

/**
 * Builds the Reach in voxels from the region specs.
 *
 * Every region is built from the same pieces — deck plates with seams and a
 * hazard lip, raised platforms with stepped ramps, four kinds of building,
 * railings, lamps, cargo — and told apart by its **palette** and its lights:
 * Concord's clean white and azure, Free Latitude's patched colours and warm
 * signs, Ironwake's ochre and hazard stripes, the Gatewatch's violet stone,
 * Emberline's crimson and charcoal, Ashfall's soot and ember. One metre voxels
 * for structure; finer half-metre ones for ramps and rails, where the eye is.
 *
 * The walkable geometry comes from `campaign/Regions.ts` too, so what you see
 * is what you can stand on.
 */

export interface Palette {
  deckA: number;
  deckB: number;
  seam: number;
  lip: number;
  trim: number;
  wall: number;
  wallDark: number;
  roof: number;
  window: number;
  lamp: number;
  accent: number;
  cargo: number[];
}

export const PALETTES: Record<RegionStyle, Palette> = {
  cathedral: { deckA: 0x4a525c, deckB: 0x434b55, seam: 0x262c34, lip: 0x56606c, trim: 0xc79a2e, wall: 0x56606c, wallDark: 0x323a45, roof: 0x3a424c, window: 0xffa346, lamp: 0xffa346, accent: 0xc79a2e, cargo: [0x3d5a73, 0x6b3b2e] },
  concord: { deckA: 0xc9d2dc, deckB: 0xbcc6d2, seam: 0x8a96a6, lip: 0xe8eef4, trim: 0x3d8cff, wall: 0xdde4ec, wallDark: 0x9aa6b6, roof: 0x7d8a9c, window: 0x9fd4ff, lamp: 0xcfe8ff, accent: 0x2a6fd8, cargo: [0x2a6fd8, 0xe8eef4, 0x9aa6b6] },
  free: { deckA: 0x5a5048, deckB: 0x524a44, seam: 0x2e2824, lip: 0x7a6a5a, trim: 0x3ee0ff, wall: 0x6a5e52, wallDark: 0x3e3630, roof: 0x8a4a3a, window: 0xffc070, lamp: 0xffb060, accent: 0xff5a8a, cargo: [0xc0582a, 0x2a8a8a, 0xd8b030, 0x8a3ab0, 0x3a7ad8] },
  ironwake: { deckA: 0x5c4c38, deckB: 0x544534, seam: 0x2c2218, lip: 0x8a6a3a, trim: 0xffb020, wall: 0x6e5a40, wallDark: 0x40321f, roof: 0x4a3a28, window: 0xffc060, lamp: 0xffa346, accent: 0xffb020, cargo: [0xa8721f, 0x5b4a2c, 0x6e4630] },
  gate: { deckA: 0x4c4658, deckB: 0x464052, seam: 0x26222e, lip: 0x6a6080, trim: 0xc89cff, wall: 0x5a5070, wallDark: 0x342e44, roof: 0x3c3450, window: 0xd8c0ff, lamp: 0xc8a8ff, accent: 0x7a48e0, cargo: [0x3c2a6c, 0x5a5070] },
  emberline: { deckA: 0x3a3436, deckB: 0x343032, seam: 0x1c1818, lip: 0x5a2a2c, trim: 0x36e2ea, wall: 0x4a2c2e, wallDark: 0x2a1a1c, roof: 0x781c22, window: 0xff8a6a, lamp: 0xff7a5a, accent: 0xb0202a, cargo: [0x781c22, 0x3a3436] },
  ashfall: { deckA: 0x46403c, deckB: 0x3e3936, seam: 0x1e1a18, lip: 0x5a4a3e, trim: 0xff7a2a, wall: 0x38302c, wallDark: 0x1e1a18, roof: 0x2a2220, window: 0xff9a3a, lamp: 0xff8a2a, accent: 0xe8641c, cargo: [0xbc4e1c, 0x2a2020, 0x9c5a28] },
  survey: { deckA: 0x4a5a5c, deckB: 0x445456, seam: 0x223032, lip: 0x6a8084, trim: 0xe8c23a, wall: 0x5a6e70, wallDark: 0x2e3c3e, roof: 0x1c6a68, window: 0xc8f0e0, lamp: 0xe8f4ff, accent: 0x1c6a68, cargo: [0x1c6a68, 0x5a6e70] },
};

const V = 1;
const R = 0.5;

/** One region's static geometry: deck, platforms, buildings, rails, props. */
export function buildRegion(r: RegionSpec): THREE.Group {
  const P = PALETTES[r.style];
  const out = new THREE.Group();
  out.name = `region:${r.id}`;
  out.position.set(r.cx, r.y, r.cz);
  const g = new Grid();
  g.jit = 0.04;
  const hw = Math.round(r.w / 2);
  const hd = Math.round(r.d / 2);

  // ---- the main deck: plates in a checker of two shades, seams every 4 m ----
  for (let x = -hw; x < hw; x++) {
    for (let z = -hd; z < hd; z++) {
      const px = Math.floor((x + 400) / 4);
      const pz = Math.floor((z + 400) / 4);
      let c = (px + pz) % 2 ? P.deckA : P.deckB;
      const w = hash3(px, 3, pz);
      if (w > 0.86) c = shade(c, 0.9);
      if ((x + 400) % 4 === 0 || (z + 400) % 4 === 0) c = P.seam;
      g.set(x, -1, z, c);
    }
  }
  // The lip: a plated edge with a trim band, and the drop below it.
  for (let x = -hw; x < hw; x++) {
    for (const z of [-hd - 1, hd]) for (let y = -4; y <= -1; y++) g.set(x, y, z, y === -1 ? P.trim : y % 2 ? P.lip : shade(P.lip, 0.8));
  }
  for (let z = -hd; z < hd; z++) {
    for (const x of [-hw - 1, hw]) for (let y = -4; y <= -1; y++) g.set(x, y, z, y === -1 ? P.trim : y % 2 ? P.lip : shade(P.lip, 0.8));
  }
  // Support spars under the deck, dropping into the cloud.
  for (const [sx, sz] of [[-hw + 6, -hd + 6], [hw - 7, -hd + 6], [-hw + 6, hd - 7], [hw - 7, hd - 7]]) {
    g.box(sx, -40, sz, sx + 1, -5, sz + 1, P.wallDark);
  }

  // ---- raised platforms ------------------------------------------------
  for (const p of r.raised) {
    const x0 = Math.round(p.x0);
    const x1 = Math.round(p.x1) - 1;
    const z0 = Math.round(p.z0);
    const z1 = Math.round(p.z1) - 1;
    const top = Math.round(p.h) - 1;
    g.box(x0, 0, z0, x1, top - 1, z1, (_x, y) => (y % 3 === 2 ? P.wallDark : P.wall));
    g.box(x0, top, z0, x1, top, z1, (x, _y, z) => ((x + z) % 8 === 0 ? P.seam : (Math.floor(x / 4) + Math.floor(z / 4)) % 2 ? P.deckA : P.deckB));
    g.box(x0, top, z0, x1, top, z0, P.trim);
    g.box(x0, top, z1, x1, top, z1, P.trim);
  }

  // ---- buildings -------------------------------------------------------
  for (const b of r.buildings) building(g, b, P, r.style);

  // ---- a painted walkway round the deck, and lamps along it -------------
  const inset = 7;
  const lane = mixHex(P.trim, P.deckA, 0.55);
  const clear = (x: number, z: number): boolean =>
    !r.buildings.some((b) => x >= b.x0 - 1 && x <= b.x1 && z >= b.z0 - 1 && z <= b.z1) &&
    !r.raised.some((p) => x >= p.x0 - 1 && x <= p.x1 && z >= p.z0 - 1 && z <= p.z1);
  for (let x = -hw + inset; x <= hw - inset; x++) {
    for (const z of [-hd + inset, hd - inset]) {
      if (!clear(x, z)) continue;
      if ((x + 400) % 6 < 4) g.set(x, -1, z, lane);
      if ((x + 400) % 16 === 0) {
        g.box(x, 0, z, x, 5, z, P.wallDark);
        g.set(x, 6, z, glow(P.lamp));
      }
    }
  }
  for (let z = -hd + inset; z <= hd - inset; z++) {
    for (const x of [-hw + inset, hw - inset]) {
      if (!clear(x, z)) continue;
      if ((z + 400) % 6 < 4) g.set(x, -1, z, lane);
      if ((z + 400) % 16 === 0) {
        g.box(x, 0, z, x, 5, z, P.wallDark);
        g.set(x, 6, z, glow(P.lamp));
      }
    }
  }
  // Small crate stacks at the foot of each building.
  r.buildings.forEach((b, i) => {
    const x = Math.round(b.x1) + 1;
    const z = Math.round(b.z0) + 1;
    if (x + 2 > hw - 1 || !clear(x, z) || !clear(x + 2, z + 2)) return;
    const col = P.cargo[i % P.cargo.length];
    g.box(x, 0, z, x + 1, 1, z + 1, (xx, yy, zz) => ((xx + yy + zz) % 2 ? col : shade(col, 0.82)));
    if (i % 2 === 0) g.box(x, 2, z, x, 2, z, shade(col, 1.1));
  });

  // ---- cargo along the deck's sides, clear of the middle and the spans --
  let n = 0;
  for (let i = 0; i < 18 && n < 10; i++) {
    const side = i % 4;
    const t = hash3(i, 7, r.cx | 0) * 0.8 - 0.4;
    const x = side < 2 ? Math.round(t * r.w) : side === 2 ? -hw + 3 : hw - 9;
    const z = side < 2 ? (side === 0 ? -hd + 3 : hd - 6) : Math.round(t * r.d);
    if (Math.abs(x) < 14 && Math.abs(z) < 14) continue;
    if (r.buildings.some((b) => x + 6 > b.x0 - 2 && x < b.x1 + 2 && z + 3 > b.z0 - 2 && z < b.z1 + 2)) continue;
    if (r.raised.some((p) => x + 6 > p.x0 - 3 && x < p.x1 + 3 && z + 3 > p.z0 - 3 && z < p.z1 + 3)) continue;
    const col = P.cargo[i % P.cargo.length];
    const tall = hash3(i, 1, 2) > 0.5 ? 2 : 1;
    g.box(x, 0, z, x + 5, tall * 2 + 1, z + 2, (xx, yy) => (yy === tall * 2 + 1 ? shade(col, 1.15) : (xx - x) % 2 === 0 ? shade(col, 0.8) : col));
    n++;
  }

  // ---- the pad the home pilot's frame stands on ------------------------
  const pr = 4;
  for (let x = -pr - 1; x <= pr + 1; x++) {
    for (let z = -pr - 1; z <= pr + 1; z++) {
      const d = Math.hypot(x, z);
      if (d > pr + 1.2) continue;
      g.set(Math.round(r.pad.x) + x, -1, Math.round(r.pad.z) + z, d > pr ? (Math.floor((Math.atan2(z, x) + 4) * 3) % 2 ? P.trim : 0x1c1f24) : P.seam);
    }
  }

  // Voxels are centred on their grid points: lift by half a voxel so the deck's
  // top face is exactly where the walk model stands you.
  const body = voxelObject(g, V, { noBottom: false });
  body.position.y = V * 0.5;
  out.add(body);
  out.add(railsAndLamps(r, P));
  return out;
}

/** The ramps up to a region's raised platforms, in world space. */
export function buildRegionRamps(r: RegionSpec): THREE.Group {
  const out = new THREE.Group();
  const P = PALETTES[r.style];
  for (const rp of regionWalk(r).ramps) out.add(rampPlate(rp, P, false));
  return out;
}

function building(g: Grid, b: Building, P: Palette, style: RegionStyle): void {
  const x0 = Math.round(b.x0);
  const x1 = Math.round(b.x1) - 1;
  const z0 = Math.round(b.z0);
  const z1 = Math.round(b.z1) - 1;
  const h = Math.round(b.h);
  const win = glow(P.window);
  const lit = (x: number, y: number, z: number): boolean => hash3(x, y, z) > 0.45;
  if (b.kind === 'hangar') {
    g.box(x0, 0, z0, x1, h - 1, z1, (x, y, z) => (y % 4 === 3 ? P.wallDark : (x + z) % 6 === 0 ? shade(P.wall, 0.9) : P.wall));
    // An arched roof, and a lit door slot along the front.
    const span = x1 - x0;
    for (let x = x0; x <= x1; x++) {
      const t = (x - x0) / Math.max(1, span);
      const rise = Math.round(Math.sin(t * Math.PI) * Math.min(6, h * 0.35));
      g.box(x, h, z0, x, h + rise, z1, P.roof);
    }
    g.box(x0 + 3, 0, z1, x1 - 3, Math.max(2, h - 5), z1, (x, y) => (y === 0 ? P.trim : (x + y) % 2 ? shade(P.wallDark, 0.8) : P.wallDark));
    g.box(x0 + 3, Math.max(2, h - 4), z1, x1 - 3, Math.max(2, h - 4), z1, glow(P.lamp));
  } else if (b.kind === 'tower') {
    g.box(x0, 0, z0, x1, h - 1, z1, (x, y, z) => {
      const face = x === x0 || x === x1 || z === z0 || z === z1;
      if (face && y > 2 && y % 3 === 1 && (x + z) % 2 === 0) return lit(x, y, z) ? win : P.wallDark;
      return y % 6 === 0 ? P.wallDark : P.wall;
    });
    const cx = Math.round((x0 + x1) / 2);
    const cz = Math.round((z0 + z1) / 2);
    g.box(cx, h, cz, cx, h + 8, cz, P.wallDark);
    g.set(cx, h + 9, cz, glow(P.accent));
    g.box(x0, h, z0, x1, h, z1, P.roof);
  } else if (b.kind === 'block') {
    g.box(x0, 0, z0, x1, h - 1, z1, (x, y, z) => {
      const face = x === x0 || x === x1 || z === z0 || z === z1;
      if (face && y >= 1 && y % 3 === 1 && (x + z) % 3 !== 0) return lit(x, y, z) ? win : shade(P.window, 0.3);
      return y === h - 1 ? P.roof : P.wall;
    });
    // A band of the region's accent across the front, and plant on the roof.
    g.box(x0, 1, z1 + 1, x1, 1, z1 + 1, P.accent);
    g.box(x0 + 2, h, z0 + 2, x0 + 5, h + 2, z0 + 4, P.wallDark);
  } else {
    // Kiosk: a booth under an awning, with a lit sign.
    g.box(x0, 0, z0, x1, h - 2, z1, P.wall);
    g.box(x0 + 1, 1, z1, x1 - 1, h - 3, z1, (_x, y) => (y === 1 ? P.wallDark : glow(mixHex(P.window, 0xffffff, 0.2))));
    g.box(x0 - 1, h - 1, z0, x1 + 1, h - 1, z1 + 2, (x) => ((x - x0) % 2 ? P.accent : shade(P.accent, 0.7)));
    g.box(x0 + 1, h, z1, x1 - 1, h + 1, z1, glow(style === 'free' ? 0xff5a8a : P.lamp));
  }
  // The door, where the walk model puts its stand spot: dark, under a lit
  // lintel. Cathedral Yard's are sealed, and say so in red.
  const d = doorOf(b);
  const lintel = glow(style === 'cathedral' ? 0xff3a2a : P.lamp);
  if (d.face === 'w' || d.face === 'e') {
    const x = d.face === 'w' ? x0 : x1;
    const z = Math.round(d.z);
    g.box(x, 0, z - 1, x, 2, z, 0x14181e);
    g.box(x, 3, z - 1, x, 3, z, lintel);
  } else {
    const z = d.face === 'n' ? z0 : z1;
    const x = Math.round(d.x);
    g.box(x - 1, 0, z, x, 2, z, 0x14181e);
    g.box(x - 1, 3, z, x, 3, z, lintel);
  }
}

/** Rails round the deck edges and lamps at the corners, in half-metre voxels. */
function railsAndLamps(r: RegionSpec, P: Palette): THREE.Group {
  const g = new Grid();
  g.jit = 0.03;
  const hw = Math.round(r.w / 2 / R);
  const hd = Math.round(r.d / 2 / R);
  // Gaps where spans land: rails stop short of them.
  const gaps = SPANS.filter((s) => s.from === r.id || s.to === r.id).map((s) => {
    const geo = spanGeometry(s);
    const e = s.from === r.id ? geo.a : geo.b;
    return { x: (e.x - r.cx) / R, z: (e.z - r.cz) / R, w: s.width / R + 4 };
  });
  const open = (x: number, z: number): boolean => gaps.some((q) => Math.abs(x - q.x) < q.w && Math.abs(z - q.z) < q.w);
  const post = (x: number, z: number): void => {
    if (open(x, z)) return;
    g.box(x, 0, z, x, 2, z, P.lip);
  };
  for (let x = -hw; x <= hw; x++) {
    for (const z of [-hd, hd]) {
      if (open(x, z)) continue;
      g.set(x, 2, z, P.wallDark);
      if (x % 6 === 0) post(x, z);
    }
  }
  for (let z = -hd; z <= hd; z++) {
    for (const x of [-hw, hw]) {
      if (open(x, z)) continue;
      g.set(x, 2, z, P.wallDark);
      if (z % 6 === 0) post(x, z);
    }
  }
  // Lamp posts at the corners and midpoints.
  const lamps = [[-hw + 2, -hd + 2], [hw - 2, -hd + 2], [-hw + 2, hd - 2], [hw - 2, hd - 2], [0, -hd + 2], [0, hd - 2]];
  for (const [x, z] of lamps) {
    if (open(x, z)) continue;
    g.box(x, 0, z, x, 9, z, P.wallDark);
    g.box(x - 1, 10, z - 1, x + 1, 10, z + 1, P.wallDark);
    g.box(x, 9, z, x, 9, z, glow(P.lamp));
  }
  const obj = voxelObject(g, R);
  obj.position.y = R * 0.5;
  return obj;
}

/**
 * One walkable plate in half-metre voxels, world space: level (`yAt` constant)
 * or sloped. Rails along its long edges when `rails` is set.
 */
function plate(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  yAt: (x: number, z: number) => number,
  axis: 'x' | 'z',
  P: Palette,
  rails: boolean,
): THREE.Group {
  const g = new Grid();
  g.jit = 0.03;
  const gx0 = Math.floor(x0 / R);
  const gx1 = Math.ceil(x1 / R) - 1;
  const gz0 = Math.floor(z0 / R);
  const gz1 = Math.ceil(z1 / R) - 1;
  let k = 0;
  for (let gx = gx0; gx <= gx1; gx++) {
    for (let gz = gz0; gz <= gz1; gz++) {
      const wx = (gx + 0.5) * R;
      const wz = (gz + 0.5) * R;
      const gy = Math.round(yAt(wx, wz) / R) - 1;
      const edge = axis === 'x' ? gz === gz0 || gz === gz1 : gx === gx0 || gx === gx1;
      const along = axis === 'x' ? gx : gz;
      g.set(gx, gy, gz, edge ? P.trim : along % 4 === 0 ? P.seam : (along >> 2) % 2 ? P.deckA : P.deckB);
      g.set(gx, gy - 1, gz, P.wallDark);
      if (edge && rails) {
        g.set(gx, gy + 2, gz, P.wallDark);
        if (along % 6 === 0) g.box(gx, gy + 1, gz, gx, gy + 1, gz, P.lip);
        // A hanging support every so often.
        if (along % 24 === 0 && k++ % 2 === 0) g.box(gx, gy - 14, gz, gx, gy - 2, gz, P.wallDark);
      }
    }
  }
  const obj = voxelObject(g, R);
  obj.position.y = R * 0.5;
  return obj;
}

function rampPlate(rp: Ramp, P: Palette, rails: boolean): THREE.Group {
  const lo = rp.axis === 'x' ? Math.min(rp.x0, rp.x1) : Math.min(rp.z0, rp.z1);
  const hi = rp.axis === 'x' ? Math.max(rp.x0, rp.x1) : Math.max(rp.z0, rp.z1);
  const yAt = (x: number, z: number): number => {
    const v = rp.axis === 'x' ? x : z;
    return rp.y0 + (rp.y1 - rp.y0) * Math.max(0, Math.min(1, (v - lo) / Math.max(1e-6, hi - lo)));
  };
  return plate(Math.min(rp.x0, rp.x1), Math.min(rp.z0, rp.z1), Math.max(rp.x0, rp.x1), Math.max(rp.z0, rp.z1), yAt, rp.axis, P, rails);
}

/** A span: catwalk plates with rails and hanging supports, half-metre voxels. */
export function buildSpan(i: number): THREE.Group {
  const s = SPANS[i];
  const geo = spanGeometry(s);
  const P = PALETTES[REGIONS.find((r) => r.id === s.from)?.style ?? 'cathedral'];
  const out = new THREE.Group();
  out.name = `span:${s.from}-${s.to}`;
  for (const d of geo.decks) {
    const ax = Math.abs(d.x1 - d.x0) > Math.abs(d.z1 - d.z0) ? 'x' : 'z';
    out.add(plate(Math.min(d.x0, d.x1), Math.min(d.z0, d.z1), Math.max(d.x0, d.x1), Math.max(d.z0, d.z1), () => d.y, ax, P, true));
  }
  for (const rp of geo.ramps) out.add(rampPlate(rp, P, true));
  return out;
}
