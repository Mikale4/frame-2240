import type { PilotId } from '../account/Accounts';
import { WalkModel, type Deck, type Ramp, type Wall, type Post } from './WorldModel';

/**
 * The Reach (NEW): one continuous world, every region a yard in the air,
 * joined by the Spans. Metres throughout, +y up.
 *
 * Cathedral Yard sits at the centre, the neutral plate every campaign's
 * sanctioned duels end up on. The home regions ring it at different altitudes,
 * each joined to it by a span — a catwalk with tram ramps where the heights
 * differ — so any region can be walked to from any other through the middle.
 *
 * Names marked NEW in `docs/CAMPAIGN_PLAN.md` await the owner's approval.
 * This file is pure data plus the walkable geometry derived from it; the voxel
 * look is built from the same specs by `world/RegionBuilder.ts`.
 */

export type RegionStyle = 'cathedral' | 'concord' | 'free' | 'ironwake' | 'gate' | 'emberline' | 'ashfall' | 'survey';

export interface Building {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  h: number;
  kind: 'hangar' | 'block' | 'tower' | 'kiosk';
}

export interface Spot {
  x: number;
  z: number;
  facing?: number;
}

export interface RegionSpec {
  id: string;
  name: string;
  /** Who holds it, as the HUD says it. */
  holder: string;
  style: RegionStyle;
  /** Centre of the main deck, world metres. */
  cx: number;
  cz: number;
  /** Altitude of the main deck. */
  y: number;
  /** Main deck size. */
  w: number;
  d: number;
  /** The pilot whose campaign starts here, if any. */
  home?: PilotId[];
  /** Where a pilot arriving here stands, region-local. */
  spawn: Spot;
  /** The pad the home pilot's frame is parked on, region-local. */
  pad: Spot;
  /** Raised platforms, region-local, each with a ramp up from the main deck. */
  raised: { x0: number; z0: number; x1: number; z1: number; h: number; rampSide: 'n' | 's' | 'e' | 'w' }[];
  buildings: Building[];
  /** Places people stand, by role. */
  people: Record<string, Spot>;
}

/** The regions. Positions are on a ring around Cathedral Yard. */
export const REGIONS: RegionSpec[] = [
  {
    id: 'cathedral',
    name: 'CATHEDRAL YARD',
    holder: 'NO POWER — STANDING RULES',
    style: 'cathedral',
    cx: 0, cz: 0, y: 0, w: 150, d: 110,
    spawn: { x: 0, z: 40, facing: Math.PI },
    pad: { x: 0, z: 0 },
    raised: [],
    buildings: [
      { x0: -70, z0: -50, x1: -62, z1: -42, h: 38, kind: 'tower' },
      { x0: 62, z0: -50, x1: 70, z1: -42, h: 38, kind: 'tower' },
    ],
    people: {},
  },
  {
    id: 'meridian',
    name: 'MERIDIAN',
    holder: 'CONCORD SKYWARD',
    style: 'concord',
    cx: 0, cz: -330, y: 24, w: 120, d: 90,
    home: ['halcyon', 'vesper'],
    spawn: { x: -20, z: 20, facing: 0 },
    pad: { x: 24, z: -10 },
    raised: [{ x0: -56, z0: -42, x1: -20, z1: -18, h: 4, rampSide: 's' }],
    buildings: [
      { x0: -58, z0: -44, x1: -22, z1: -30, h: 16, kind: 'block' },
      { x0: 40, z0: -44, x1: 58, z1: -26, h: 30, kind: 'tower' },
      { x0: 6, z0: -44, x1: 38, z1: -24, h: 14, kind: 'hangar' },
      { x0: -10, z0: 24, x1: -2, z1: 30, h: 4, kind: 'kiosk' },
    ],
    // Every spot is on the main deck: someone on a raised platform cannot be
    // placed from the deck below.
    people: { officer: { x: -6, z: 18 }, cadet: { x: 18, z: 4 }, archivist: { x: -38, z: -3 } },
  },
  {
    id: 'brightwake',
    name: 'BRIGHTWAKE',
    holder: 'FREE LATITUDE',
    style: 'free',
    cx: 300, cz: -170, y: 8, w: 110, d: 100,
    home: ['cirrus', 'nulltide'],
    spawn: { x: -30, z: 10, facing: -Math.PI / 2 },
    pad: { x: 22, z: 28 },
    raised: [{ x0: 10, z0: -46, x1: 48, z1: -20, h: 3, rampSide: 'w' }],
    buildings: [
      { x0: -52, z0: -48, x1: -30, z1: -34, h: 10, kind: 'block' },
      { x0: -26, z0: -48, x1: -10, z1: -36, h: 7, kind: 'kiosk' },
      { x0: 30, z0: -18, x1: 52, z1: 4, h: 18, kind: 'hangar' },
      { x0: -52, z0: 30, x1: -36, z1: 48, h: 12, kind: 'block' },
    ],
    people: { steward: { x: -18, z: 4 }, trader: { x: -20, z: -30 }, mechanic: { x: 14, z: 22 } },
  },
  {
    id: 'coldseam',
    name: 'COLDSEAM',
    holder: 'IRONWAKE COLLIERY',
    style: 'ironwake',
    cx: 330, cz: 150, y: -22, w: 130, d: 90,
    home: ['terramoth'],
    spawn: { x: -40, z: -10, facing: Math.PI / 2 },
    pad: { x: 30, z: 16 },
    raised: [{ x0: -60, z0: 20, x1: -20, z1: 44, h: 5, rampSide: 'n' }],
    buildings: [
      { x0: -64, z0: -44, x1: -30, z1: -26, h: 14, kind: 'hangar' },
      { x0: 40, z0: -44, x1: 64, z1: -20, h: 22, kind: 'tower' },
      { x0: -10, z0: -44, x1: 20, z1: -32, h: 9, kind: 'block' },
    ],
    people: { foreman: { x: -26, z: -6 }, cutter: { x: 8, z: 2 }, clerk: { x: -4, z: -28 } },
  },
  {
    id: 'gatewatch',
    name: 'GATEWATCH · KETTLE GATE',
    holder: 'IRONWAKE COLLIERY',
    style: 'gate',
    cx: 40, cz: 340, y: 14, w: 120, d: 80,
    home: ['obelisk'],
    spawn: { x: 0, z: -24, facing: 0 },
    pad: { x: -30, z: 10 },
    raised: [{ x0: 20, z0: 12, x1: 56, z1: 38, h: 6, rampSide: 'w' }],
    buildings: [
      { x0: -58, z0: 26, x1: -44, z1: 38, h: 24, kind: 'tower' },
      { x0: 44, z0: -38, x1: 58, z1: -26, h: 24, kind: 'tower' },
      { x0: -20, z0: 28, x1: 14, z1: 38, h: 11, kind: 'block' },
    ],
    people: { watch: { x: 8, z: -14 }, dockhand: { x: -14, z: 12 } },
  },
  {
    id: 'emberrest',
    name: 'EMBERREST',
    holder: 'EMBERLINE PACT',
    style: 'emberline',
    cx: -300, cz: 190, y: 30, w: 120, d: 100,
    home: ['nocturne'],
    spawn: { x: 30, z: -20, facing: Math.PI },
    pad: { x: -26, z: -20 },
    raised: [{ x0: -20, z0: 14, x1: 20, z1: 46, h: 2, rampSide: 'n' }],
    buildings: [
      { x0: -58, z0: 20, x1: -26, z1: 48, h: 12, kind: 'block' },
      // Clear of the span's landing on the east edge.
      { x0: 30, z0: 24, x1: 58, z1: 46, h: 15, kind: 'hangar' },
      { x0: -58, z0: -48, x1: -44, z1: -34, h: 26, kind: 'tower' },
    ],
    people: { recruitA: { x: -8, z: 6 }, recruitB: { x: 8, z: 6 }, claims: { x: -40, z: 14 } },
  },
  {
    id: 'cinder',
    name: 'CINDER BERTH',
    holder: 'ASHFALL IRREGULARS',
    style: 'ashfall',
    cx: -330, cz: -150, y: -12, w: 100, d: 80,
    home: ['pyre'],
    spawn: { x: 26, z: 10, facing: -Math.PI / 2 },
    pad: { x: -20, z: 18 },
    raised: [{ x0: -46, z0: -36, x1: -10, z1: -14, h: 3, rampSide: 'e' }],
    buildings: [
      { x0: 10, z0: -38, x1: 46, z1: -24, h: 9, kind: 'hangar' },
      { x0: -46, z0: 24, x1: -30, z1: 38, h: 8, kind: 'kiosk' },
      { x0: 26, z0: 24, x1: 46, z1: 38, h: 13, kind: 'block' },
    ],
    people: { broker: { x: 6, z: -12 }, crewA: { x: -8, z: 6 }, crewB: { x: 12, z: 16 } },
  },
  {
    id: 'surveypost',
    name: 'THE SPANS · SURVEY POST 4',
    holder: 'CONCORD SKYWARD (DETACHED)',
    style: 'survey',
    cx: -150, cz: -260, y: 46, w: 50, d: 40,
    home: [],
    spawn: { x: 0, z: 8, facing: 0 },
    pad: { x: -12, z: -6 },
    raised: [],
    // West side: the span to Meridian lands on the east edge.
    buildings: [{ x0: -24, z0: 6, x1: -10, z1: 18, h: 6, kind: 'kiosk' }],
    people: { relief: { x: 10, z: 4 } },
  },
];

// Doyne starts at the survey post; the span from Meridian runs through it.
REGIONS.find((r) => r.id === 'surveypost')!.home = ['vesper'];
REGIONS.find((r) => r.id === 'meridian')!.home = ['halcyon'];

export const regionById = (id: string): RegionSpec | undefined => REGIONS.find((r) => r.id === id);

/** Every pilot's home region: where their campaign opens. */
export function homeOf(pilot: PilotId): RegionSpec {
  return REGIONS.find((r) => r.home?.includes(pilot)) ?? REGIONS[0];
}

/** A region-local spot in world metres. */
export const worldOf = (r: RegionSpec, s: Spot): { x: number; y: number; z: number } => ({ x: r.cx + s.x, y: r.y, z: r.cz + s.z });

export interface SpanSpec {
  from: string;
  to: string;
  /** Catwalk width, metres. */
  width: number;
}

/** Spans: every home region to Cathedral Yard, and the survey post on Meridian's. */
export const SPANS: SpanSpec[] = [
  { from: 'meridian', to: 'cathedral', width: 5 },
  { from: 'brightwake', to: 'cathedral', width: 5 },
  { from: 'coldseam', to: 'cathedral', width: 5 },
  { from: 'gatewatch', to: 'cathedral', width: 5 },
  { from: 'emberrest', to: 'cathedral', width: 5 },
  { from: 'cinder', to: 'cathedral', width: 5 },
  { from: 'surveypost', to: 'meridian', width: 4 },
];

/** Where a straight line from a region's centre toward a point leaves its main deck. */
export function edgeToward(r: RegionSpec, tx: number, tz: number): { x: number; z: number } {
  const dx = tx - r.cx;
  const dz = tz - r.cz;
  const sx = dx === 0 ? Infinity : r.w / 2 / Math.abs(dx);
  const sz = dz === 0 ? Infinity : r.d / 2 / Math.abs(dz);
  const s = Math.min(sx, sz);
  return { x: r.cx + dx * s, z: r.cz + dz * s };
}

export interface SpanGeometry {
  spec: SpanSpec;
  /** Ends, world metres, at each region's deck edge. */
  a: { x: number; y: number; z: number };
  b: { x: number; y: number; z: number };
  /** The walkable pieces: level runs and the ramp between them. */
  decks: Deck[];
  ramps: Ramp[];
}

/**
 * A span as walkable geometry. Spans run along whichever axis their ends are
 * further apart in, as a dog-leg of axis-aligned catwalks — the walk model's
 * rectangles are axis-aligned, and a dog-leg reads as engineering anyway. The
 * height difference is taken up by one long ramp in the middle of the run.
 */
export function spanGeometry(s: SpanSpec): SpanGeometry {
  const A = regionById(s.from)!;
  const B = regionById(s.to)!;
  const ea = edgeToward(A, B.cx, B.cz);
  const eb = edgeToward(B, A.cx, A.cz);
  const a = { x: ea.x, y: A.y, z: ea.z };
  const b = { x: eb.x, y: B.y, z: eb.z };
  const hw = s.width / 2;
  const decks: Deck[] = [];
  const ramps: Ramp[] = [];
  const under = (y: number): number => y - 0.6;
  // Leg 1 along the longer axis from A to the corner, leg 2 along the other to B.
  const xFirst = Math.abs(b.x - a.x) >= Math.abs(b.z - a.z);
  const corner = xFirst ? { x: b.x, z: a.z } : { x: a.x, z: b.z };
  // Overlap a little into each region so the joint has no gap.
  const ov = 1.5;
  const legLen = xFirst ? Math.abs(corner.x - a.x) : Math.abs(corner.z - a.z);
  const dir = xFirst ? Math.sign(corner.x - a.x) || 1 : Math.sign(corner.z - a.z) || 1;
  const rampLen = Math.min(legLen * 0.6, Math.max(8, Math.abs(b.y - a.y) * 3.2));
  const r0 = (legLen - rampLen) / 2;
  const r1 = r0 + rampLen;
  const along = (t: number): number => (xFirst ? a.x : a.z) + dir * t;
  const pushRun = (t0: number, t1: number, y: number): void => {
    if (t1 - t0 < 0.01) return;
    const u0 = along(t0);
    const u1 = along(t1);
    if (xFirst) decks.push({ x0: Math.min(u0, u1), x1: Math.max(u0, u1), z0: a.z - hw, z1: a.z + hw, y, under: under(y) });
    else decks.push({ z0: Math.min(u0, u1), z1: Math.max(u0, u1), x0: a.x - hw, x1: a.x + hw, y, under: under(y) });
  };
  pushRun(-ov, r0, a.y);
  if (Math.abs(b.y - a.y) > 0.01) {
    const u0 = along(r0);
    const u1 = along(r1);
    const lowFirst = (dir > 0) === (a.y <= b.y);
    const lo = Math.min(u0, u1);
    const hi = Math.max(u0, u1);
    const yLo = lowFirst ? Math.min(a.y, b.y) : Math.min(a.y, b.y);
    void yLo;
    // `y0` is at the low coordinate end, `y1` at the high one.
    const yAtLo = dir > 0 ? a.y : b.y;
    const yAtHi = dir > 0 ? b.y : a.y;
    if (xFirst) ramps.push({ x0: lo, x1: hi, z0: a.z - hw, z1: a.z + hw, y0: yAtLo, y1: yAtHi, axis: 'x' });
    else ramps.push({ z0: lo, z1: hi, x0: a.x - hw, x1: a.x + hw, y0: yAtLo, y1: yAtHi, axis: 'z' });
  } else {
    pushRun(r0, r1, a.y);
  }
  pushRun(r1, legLen + hw, b.y);
  // Leg 2, at B's height, from the corner to B's edge.
  const len2 = xFirst ? Math.abs(b.z - corner.z) : Math.abs(b.x - corner.x);
  if (len2 > 0.01) {
    const d2 = xFirst ? Math.sign(b.z - corner.z) : Math.sign(b.x - corner.x);
    const c0 = (xFirst ? corner.z : corner.x) - d2 * hw;
    const c1 = (xFirst ? b.z : b.x) + d2 * ov;
    if (xFirst) decks.push({ x0: corner.x - hw, x1: corner.x + hw, z0: Math.min(c0, c1), z1: Math.max(c0, c1), y: b.y, under: under(b.y) });
    else decks.push({ z0: corner.z - hw, z1: corner.z + hw, x0: Math.min(c0, c1), x1: Math.max(c0, c1), y: b.y, under: under(b.y) });
  }
  return { spec: s, a, b, decks, ramps };
}

/** A region's own walkable geometry, world metres. */
export function regionWalk(r: RegionSpec): { decks: Deck[]; ramps: Ramp[]; walls: Wall[]; posts: Post[] } {
  const decks: Deck[] = [{ x0: r.cx - r.w / 2, z0: r.cz - r.d / 2, x1: r.cx + r.w / 2, z1: r.cz + r.d / 2, y: r.y }];
  const ramps: Ramp[] = [];
  const walls: Wall[] = [];
  for (const p of r.raised) {
    decks.push({ x0: r.cx + p.x0, z0: r.cz + p.z0, x1: r.cx + p.x1, z1: r.cz + p.z1, y: r.y + p.h });
    const len = Math.max(6, p.h * 3);
    const wid = 6;
    const mx = r.cx + (p.x0 + p.x1) / 2;
    const mz = r.cz + (p.z0 + p.z1) / 2;
    const y0 = r.y;
    const y1 = r.y + p.h;
    // The ramp runs out from the named side, rising toward the platform.
    if (p.rampSide === 's') ramps.push({ x0: mx - wid / 2, x1: mx + wid / 2, z0: r.cz + p.z1, z1: r.cz + p.z1 + len, y0: y1, y1: y0, axis: 'z' });
    if (p.rampSide === 'n') ramps.push({ x0: mx - wid / 2, x1: mx + wid / 2, z0: r.cz + p.z0 - len, z1: r.cz + p.z0, y0: y0, y1: y1, axis: 'z' });
    if (p.rampSide === 'e') ramps.push({ z0: mz - wid / 2, z1: mz + wid / 2, x0: r.cx + p.x1, x1: r.cx + p.x1 + len, y0: y1, y1: y0, axis: 'x' });
    if (p.rampSide === 'w') ramps.push({ z0: mz - wid / 2, z1: mz + wid / 2, x0: r.cx + p.x0 - len, x1: r.cx + p.x0, y0: y0, y1: y1, axis: 'x' });
  }
  for (const b of r.buildings) {
    walls.push({ x0: r.cx + b.x0, z0: r.cz + b.z0, x1: r.cx + b.x1, z1: r.cz + b.z1, y0: r.y - 1, y1: r.y + b.h });
  }
  // The parked frame's pad is a ring of bollards the pilot walks round.
  const posts: Post[] = [{ x: r.cx + r.pad.x, z: r.cz + r.pad.z, r: 2.4 }];
  return { decks, ramps, walls, posts };
}

/** The whole Reach as one walk model. */
export function buildReachWalk(): WalkModel {
  const w = new WalkModel();
  for (const r of REGIONS) w.add(regionWalk(r));
  for (const s of SPANS) {
    const g = spanGeometry(s);
    w.add({ decks: g.decks, ramps: g.ramps });
  }
  return w;
}
