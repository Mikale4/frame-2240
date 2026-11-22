import * as THREE from 'three';
import { Grid, glow, shade, voxelObject, type Paint } from '../voxel/VoxelKit';
import { VoxelMech } from '../voxel/VoxelMech';
import { MECHS } from '../data/mechs';
import { Rng } from '../core/Rng';
import { PALETTES, type Palette } from './RegionBuilder';
import { REGIONS, doorOf, type Building, type RegionSpec } from '../campaign/Regions';
import { WalkModel } from '../campaign/WorldModel';
import { rolesOf, type CrowdAgent, type RoleDef } from '../campaign/Crowd';
import { animateFigure, extraLook, gesture, pilotFigure, type Gesture, type PilotFigure } from '../voxel/PilotFigure';
import type { PilotId } from '../account/Accounts';

/**
 * Inside the buildings.
 *
 * Every building on a yard has a door, and behind it a furnished room: a frame
 * bay, a mess, an office, quarters, a control room or a shop, by what the
 * building is and who holds the yard. A room is built when you walk in and
 * dropped when you leave. It sits far below the Reach in its own walk model,
 * and the view hides the sky and the yards while you are in it, so the room
 * is a lit stage in the dark, seen from a fixed cutaway camera over its open
 * front wall — the FF7 game's rooms, in voxels.
 */

/** Where rooms are built: well under everything, past the fog. */
export const ROOM_Y = -600;
/** Room voxels are half a metre, like the yards' rails and lamps. */
const R = 0.5;

export type RoomKind = 'bay' | 'mess' | 'office' | 'quarters' | 'control' | 'shop';

interface RoomName {
  name: string;
  kind: RoomKind;
}

/** What each building is, by region and its index in the region's list. */
const ROOMS: Record<string, RoomName | 'sealed'> = {
  // Cathedral Yard is nobody's: its towers stay shut under the standing rules.
  'cathedral:0': 'sealed',
  'cathedral:1': 'sealed',
  'meridian:0': { name: 'RECORDS OFFICE', kind: 'office' },
  'meridian:1': { name: 'TRAFFIC CONTROL', kind: 'control' },
  'meridian:2': { name: 'VANTOR FRAME BAY', kind: 'bay' },
  'meridian:3': { name: 'CANTEEN COUNTER', kind: 'shop' },
  'brightwake:0': { name: 'THE LANTERN', kind: 'mess' },
  'brightwake:1': { name: 'PARTS STALL', kind: 'shop' },
  'brightwake:2': { name: 'REFIT SHED', kind: 'bay' },
  'brightwake:3': { name: 'DOCK LODGINGS', kind: 'quarters' },
  'coldseam:0': { name: 'CUTTER SHED', kind: 'bay' },
  'coldseam:1': { name: 'SHIFT OFFICE', kind: 'control' },
  'coldseam:2': { name: 'COLLIERY MESS', kind: 'mess' },
  'gatewatch:0': { name: 'NORTH WATCH', kind: 'control' },
  'gatewatch:1': { name: 'SOUTH WATCH', kind: 'control' },
  'gatewatch:2': { name: 'WATCH QUARTERS', kind: 'quarters' },
  'emberrest:0': { name: 'CLAIMS OFFICE', kind: 'office' },
  'emberrest:1': { name: 'FRAME HALL', kind: 'bay' },
  'emberrest:2': { name: 'SIGNAL TOWER', kind: 'control' },
  'cinder:0': { name: 'SALVAGE BAY', kind: 'bay' },
  'cinder:1': { name: "BROKER'S HUT", kind: 'shop' },
  'cinder:2': { name: 'CREW MESS', kind: 'mess' },
  'surveypost:0': { name: 'SURVEY HUT', kind: 'office' },
};

/** Room sizes, metres: width (x), depth (z), wall height. */
const SIZE: Record<RoomKind, [number, number, number]> = {
  bay: [26, 18, 12],
  mess: [18, 12, 4.5],
  office: [16, 12, 4.5],
  quarters: [16, 10, 4],
  control: [14, 14, 5],
  shop: [10, 8, 4],
};

/** Lines a room adds to what its people say, by kind. Matter-of-fact, British. */
export const ROOM_BARKS: Record<RoomKind, string[]> = {
  bay: [
    'Mind the gantry. It swings when the yard turns into the wind.',
    'Her left actuator runs hot. It has always run hot. We log it and fly her.',
    'Torque the plate to the figure on the card. Not to feel. To the card.',
    'Every frame that leaves this bay comes back with a story and a dent.',
    'Do not stand under anything that is hanging. Everything in here is hanging.',
  ],
  mess: [
    'Eat while it is hot. It will not be hot for long.',
    'Second shift has the long table. Sit at the short one.',
    'The bread came up on the morning convoy. It is nearly fresh.',
    'Nobody talks about work at this table. That is the only rule.',
    'If you are new, the tea is free. If you are not new, it still is.',
  ],
  office: [
    'If it is not filed, it did not happen.',
    'Your request is in the queue. The queue is long.',
    'Sign there, and there. Not there.',
    'We keep paper copies. Screens fail. Paper burns, but slower.',
  ],
  quarters: [
    'Bunk four is taken. So is bunk five.',
    'Lights out at the bell. Nobody listens to the bell.',
    'Mind your boots. Somebody is sleeping off a double shift.',
    'Write home. You will be glad you did, and so will they.',
  ],
  control: [
    'Traffic is light. That usually means something is coming.',
    'Every lane on that board is a promise somebody made.',
    'Do not touch that console. It is older than both of us.',
    'We call the lanes. Whether anyone listens is their business.',
  ],
  shop: [
    'Cash, credit or trade. Mostly trade.',
    'If it is on the shelf, it works. Probably.',
    'Seals, fuses, filters. Tell me what your frame needs.',
    'No refunds. There is nowhere to send it back to.',
  ],
};

export interface InteriorSpec {
  key: string;
  region: RegionSpec;
  index: number;
  building: Building;
  name: string;
  kind: RoomKind | 'sealed';
  /** Where you stand outside the door, world metres, and the way out faces. */
  door: { x: number; y: number; z: number; facing: number };
}

const FACING = { w: -Math.PI / 2, e: Math.PI / 2, n: Math.PI, s: 0 } as const;

let ALL: InteriorSpec[] | null = null;

/** Every building's interior, sealed or not. */
export function interiors(): InteriorSpec[] {
  if (ALL) return ALL;
  ALL = [];
  for (const r of REGIONS) {
    r.buildings.forEach((b, i) => {
      const key = `${r.id}:${i}`;
      const n = ROOMS[key] ?? { name: 'STORE ROOM', kind: 'shop' as const };
      const d = doorOf(b);
      ALL!.push({
        key,
        region: r,
        index: i,
        building: b,
        name: n === 'sealed' ? 'SEALED' : n.name,
        kind: n === 'sealed' ? 'sealed' : n.kind,
        door: { x: r.cx + d.sx, y: r.y, z: r.cz + d.sz, facing: FACING[d.face] },
      });
    });
  }
  return ALL;
}

/** The door nearest (x, z) within reach, if any. */
export function doorNear(x: number, z: number, reach: number): InteriorSpec | null {
  let best: InteriorSpec | null = null;
  let bd = reach;
  for (const s of interiors()) {
    const d = Math.hypot(s.door.x - x, s.door.z - z);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return best;
}

function hashKey(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export interface RoomPerson {
  agent: CrowdAgent;
  fig: PilotFigure;
  /** What they do with their hands while they are not talking to you. */
  habit: Gesture;
  next: number;
}

/**
 * One furnished room, live. Coordinates: the room's floor centre is (0,
 * ROOM_Y, 0) in the world; the door is on the +z wall, nearest the camera.
 */
export class Room {
  readonly group = new THREE.Group();
  readonly walk = new WalkModel();
  readonly people: RoomPerson[] = [];
  readonly w: number;
  readonly d: number;
  readonly h: number;
  readonly kind: RoomKind;
  private readonly g = new Grid();
  private readonly P: Palette;
  private readonly rng: Rng;
  private mech: VoxelMech | null = null;
  /** The frame's lift onto the pad, metres. */
  private mechLift = 0;
  private roles: readonly RoleDef[];
  private body: THREE.Group | null = null;

  constructor(
    readonly spec: InteriorSpec,
    avoid: PilotId,
  ) {
    this.kind = spec.kind === 'sealed' ? 'shop' : spec.kind;
    [this.w, this.d, this.h] = SIZE[this.kind];
    this.P = PALETTES[spec.region.style];
    this.rng = new Rng(hashKey(spec.key));
    this.roles = rolesOf(spec.region.style).filter((r) => r.role !== 'kid');
    this.g.jit = 0.025;
    this.shell();
    switch (this.kind) {
      case 'bay':
        this.bay(avoid);
        break;
      case 'mess':
        this.mess();
        break;
      case 'office':
        this.office();
        break;
      case 'quarters':
        this.quarters();
        break;
      case 'control':
        this.control();
        break;
      case 'shop':
        this.shop();
        break;
    }
    const body = voxelObject(this.g, R, { cast: true });
    // Voxels are centred on grid points: shift by half a voxel so cell i spans
    // i*R..(i+1)*R and the floor's top is y = 0.
    body.position.set(R / 2, ROOM_Y + R / 2, R / 2);
    for (const o of body.children) (o as THREE.Mesh).castShadow = false;
    this.group.add(body);
    this.body = body;
  }

  // ------------------------------------------------------------ building

  /** Voxel index of the cell starting at `m` metres. */
  private M(m: number): number {
    return Math.round(m / R);
  }

  /** A box of voxels, metres, upper bounds exclusive. */
  private vox(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, paint: Paint): void {
    const M = (m: number): number => this.M(m);
    this.g.box(M(x0), M(y0), M(z0), M(x1) - 1, M(y1) - 1, M(z1) - 1, paint);
  }

  /** Voxels plus a collision box, metres. */
  private solid(x0: number, z0: number, x1: number, z1: number, h: number, paint: Paint, y0 = 0): void {
    this.vox(x0, y0, z0, x1, y0 + h, z1, paint);
    this.walk.add({ walls: [{ x0, z0, x1, z1, y0: ROOM_Y + y0 - 0.1, y1: ROOM_Y + y0 + Math.max(h, 1.9) }] });
  }

  private shell(): void {
    const { w, d, h, P } = this;
    const hw = w / 2;
    const hd = d / 2;
    // Floor: metre tiles in the yard's two deck tones, seamed.
    this.vox(-hw, -0.5, -hd, hw, 0, hd, (x, _y, z) => {
      if (x % 4 === 0 || z % 4 === 0) return P.seam;
      return ((x >> 2) + (z >> 2)) % 2 ? P.deckA : P.deckB;
    });
    // The step out through the door.
    this.vox(-1, -0.5, hd, 1, 0, hd + 1.5, P.seam);
    this.vox(-1, -0.5, hd + 1, 1, 0, hd + 1.5, glow(P.trim));
    const wallPaint: Paint = (x, y, z) => {
      if (y === 0) return P.trim;
      if (y === this.M(h) - 1) return P.wallDark;
      return (x + z) % 8 === 0 ? shade(P.wall, 0.88) : y % 6 === 5 ? shade(P.wall, 0.94) : P.wall;
    };
    // Back and side walls, full height; the front is cut down for the camera.
    this.vox(-hw - 0.5, 0, -hd - 0.5, hw + 0.5, h, -hd, wallPaint);
    this.vox(-hw - 0.5, 0, -hd, -hw, h, hd + 0.5, wallPaint);
    this.vox(hw, 0, -hd, hw + 0.5, h, hd + 0.5, wallPaint);
    this.vox(-hw, 0, hd, -1.5, 1, hd + 0.5, wallPaint);
    this.vox(1.5, 0, hd, hw, 1, hd + 0.5, wallPaint);
    // The doorway: two lit posts no higher than the cut-down wall, so the
    // camera over it never loses you.
    this.vox(-1.5, 0, hd, -1, 1.5, hd + 0.5, P.wallDark);
    this.vox(1, 0, hd, 1.5, 1.5, hd + 0.5, P.wallDark);
    this.vox(-1.5, 1.5, hd, -1, 2, hd + 0.5, glow(P.lamp));
    this.vox(1, 1.5, hd, 1.5, 2, hd + 0.5, glow(P.lamp));
    // Strip lights along the tops of the walls.
    this.vox(-hw, h - 0.5, -hd, hw, h, -hd + 0.5, glow(P.lamp));
    this.vox(-hw, h - 0.5, -hd, -hw + 0.5, h, hd, glow(P.lamp));
    this.vox(hw - 0.5, h - 0.5, -hd, hw, h, hd, glow(P.lamp));

    const Y = ROOM_Y;
    this.walk.add({
      decks: [
        { x0: -hw, z0: -hd, x1: hw, z1: hd, y: Y },
        { x0: -1, z0: hd - 0.2, x1: 1, z1: hd + 1.5, y: Y },
      ],
      walls: [
        { x0: -hw - 1, z0: -hd - 1, x1: hw + 1, z1: -hd, y0: Y - 1, y1: Y + h },
        { x0: -hw - 1, z0: -hd, x1: -hw, z1: hd + 1, y0: Y - 1, y1: Y + h },
        { x0: hw, z0: -hd, x1: hw + 1, z1: hd + 1, y0: Y - 1, y1: Y + h },
        { x0: -hw, z0: hd, x1: -1, z1: hd + 1, y0: Y - 1, y1: Y + 2 },
        { x0: 1, z0: hd, x1: hw, z1: hd + 1, y0: Y - 1, y1: Y + 2 },
      ],
    });
  }

  /** A screen on the back wall: a framed glow panel with a few lines on it. */
  private wallScreen(x0: number, x1: number, y0: number, y1: number, col: number): void {
    const z = -this.d / 2;
    this.vox(x0 - 0.5, y0 - 0.5, z, x1 + 0.5, y1 + 0.5, z + 0.5, this.P.wallDark);
    this.vox(x0, y0, z + 0.5, x1, y1, z + 1, (x, y) => ((x * 7 + y * 3) % 11 === 0 ? glow(0xffffff) : y % 3 === 0 ? glow(shade(col, 1.2)) : glow(shade(col, 0.55))));
  }

  private table(x: number, z: number, w: number, d: number): void {
    const P = this.P;
    this.solid(x - w / 2, z - d / 2, x + w / 2, z + d / 2, 0.5, 0x2a2e33);
    this.vox(x - w / 2, 0.5, z - d / 2, x + w / 2, 1, z + d / 2, shade(P.wallDark, 1.3));
  }

  private bench(x: number, z: number, len: number): void {
    this.vox(x - len / 2, 0, z - 0.25, x + len / 2, 0.5, z + 0.25, (xx) => (xx % 2 ? 0x2a2e33 : shade(this.P.lip, 0.8)));
    this.walk.add({ walls: [{ x0: x - len / 2, z0: z - 0.25, x1: x + len / 2, z1: z + 0.25, y0: ROOM_Y - 0.1, y1: ROOM_Y + 0.5 }] });
  }

  private crate(x: number, z: number, s: number, col: number): void {
    this.solid(x - s / 2, z - s / 2, x + s / 2, z + s / 2, s, (xx, y, zz) => ((xx + y + zz) % 3 === 0 ? shade(col, 0.75) : col));
  }

  /** A desk with a lit screen on its far edge, facing `dir` (+1: screen at -z). */
  private console(x: number, z: number, w: number, col: number, dir: 1 | -1 = 1): void {
    this.solid(x - w / 2, z - 0.4, x + w / 2, z + 0.4, 1, (_x, y) => (y === 1 ? shade(this.P.wallDark, 1.2) : 0x22262c));
    const zs = dir > 0 ? z - 0.4 : z;
    this.vox(x - w / 2 + 0.5, 1, zs, x + w / 2 - 0.5, 1.5, zs + 0.5, glow(col));
  }

  private shelf(x0: number, z0: number, x1: number, z1: number, h: number): void {
    const cols = this.P.cargo;
    this.solid(x0, z0, x1, z1, h, (x, y, z) => (y % 2 === 0 ? 0x2a2e33 : cols[Math.abs(x * 3 + z * 5 + y) % cols.length]));
  }

  // ---------------------------------------------------------------- people

  private person(x: number, z: number, facing: number, pose: 'sit' | 'stand', habit: Gesture, role?: RoleDef): void {
    const r = role ?? this.roles[this.rng.int(this.roles.length)];
    if (!r) return;
    const seed = Math.floor(this.rng.next() * 100000);
    const sex: 'f' | 'm' = this.rng.next() < r.f ? 'f' : 'm';
    const suit = r.suit[seed % r.suit.length];
    const agent: CrowdAgent = {
      id: `${this.spec.key}:p${this.people.length}`,
      region: this.spec.region.id,
      role: r.role,
      name: r.name,
      sex,
      seed,
      suit,
      trim: r.trim,
      x,
      y: ROOM_Y,
      z,
      vx: 0,
      vz: 0,
      facing,
      mode: 'idle',
      target: null,
      wait: 0,
      stuck: 0,
      partner: null,
      held: false,
      gesture: null,
      walkSpeed: 0,
    };
    const fig = pilotFigure(sex === 'm' ? 'nocturne' : 'halcyon', undefined, extraLook(sex, seed, suit, r.trim));
    fig.sitting = pose === 'sit';
    fig.root.position.set(x, ROOM_Y, z);
    fig.root.rotation.y = facing;
    this.group.add(fig.root);
    if (pose === 'stand') this.walk.add({ posts: [{ x, z, r: 0.3 }] });
    this.people.push({ agent, fig, habit, next: 0.5 + this.rng.next() * 3 });
  }

  /** A role from this yard by name, or any. */
  private role(...names: string[]): RoleDef | undefined {
    for (const n of names) {
      const r = this.roles.find((q) => q.role === n);
      if (r) return r;
    }
    return undefined;
  }

  // ----------------------------------------------------------------- rooms

  private bay(avoid: PilotId): void {
    const { w, d, P } = this;
    const hw = w / 2;
    const hd = d / 2;
    const fz = -hd + 5;
    // The pad, in hazard stripes.
    this.vox(-4, 0, fz - 4, 4, 0.5, fz + 4, (x, _y, z) => (Math.abs(x) >= 7 || Math.abs(z - this.M(fz)) >= 7 ? ((x + z) % 4 < 2 ? 0xffb020 : 0x1c1f24) : P.seam));
    // The gantry either side, with a walkway across at the frame's shoulder.
    for (const sx of [-6, 5.5]) {
      this.solid(sx, fz - 3, sx + 0.5, fz - 2.5, 10, P.wallDark);
      this.solid(sx, fz + 2.5, sx + 0.5, fz + 3, 10, P.wallDark);
      this.vox(sx - 0.5, 7, fz - 3, sx + 1, 7.5, fz + 3, (_x, _y, z) => (z % 2 ? 0xffb020 : P.wallDark));
    }
    this.vox(-6, 9.5, fz - 3, 6, 10, fz - 2.5, P.wallDark);
    this.vox(-6, 9.5, fz + 2.5, 6, 10, fz + 3, P.wallDark);
    this.vox(-2, 9, fz - 0.5, 2, 9.5, fz + 0.5, glow(0xfff1c0));
    // A frame in for refit: the yard's own, or a sister unit if it is yours.
    const pick = (this.spec.region.home ?? []).find((p) => p !== avoid) ?? (['obelisk', 'terramoth', 'cirrus'] as PilotId[]).find((p) => p !== avoid)!;
    const def = MECHS[pick];
    const m = new VoxelMech(def);
    this.mech = m;
    // Feet on the pad: the rig's foot offset, as the parked frame outside has it.
    this.mechLift = def.rig.footOffset * def.rig.scale * (1 / 40) * 3.15;
    this.group.add(m.root);
    this.walk.add({ posts: [{ x: 0, z: fz, r: 2.6 }] });
    this.posemech(0);
    // Benches along the side walls, crates, a parts cart.
    this.solid(-hw, -2, -hw + 1, 3, 1, (_x, y) => (y === 1 ? 0x5a626e : 0x2a2e33));
    this.solid(hw - 1, -2, hw, 3, 1, (_x, y) => (y === 1 ? 0x5a626e : 0x2a2e33));
    this.vox(-hw, 1, -1, -hw + 1, 1.5, 0, glow(0x9fd4ff));
    this.crate(-hw + 2, hd - 3, 1.5, P.cargo[0]);
    this.crate(-hw + 2, hd - 4.6, 1.5, P.cargo[1 % P.cargo.length]);
    this.crate(-hw + 3.6, hd - 3, 1.5, P.cargo[2 % P.cargo.length]);
    this.crate(hw - 2.5, hd - 3.5, 2, P.cargo[0]);
    this.solid(hw - 6, 4, hw - 4, 5, 0.9, (x) => (x % 2 ? 0x2a2e33 : P.accent));
    const mech = this.role('mechanic', 'tech', 'cutter', 'dockhand', 'crewA') ?? undefined;
    this.person(-hw + 1.6, 0.5, -Math.PI / 2, 'stand', 'work', mech);
    this.person(hw - 1.6, -0.5, Math.PI / 2, 'stand', 'work', mech);
    this.person(2.5, fz + 4.2, Math.PI, 'stand', 'look', mech);
    this.person(-3, 3, 0.6, 'stand', 'talk');
    this.person(-2, 3.8, 0.6 + Math.PI, 'stand', 'nod');
  }

  private posemech(t: number): void {
    const m = this.mech;
    if (!m) return;
    m.pose3(
      {
        x: 0, y: ROOM_Y + this.mechLift, z: -this.d / 2 + 5, yaw: -Math.PI / 2, aim: -0.25, tilt: 0, roll: 0, flourish: 0, mobile: 0, transforming: false,
        pitch: 0, thrust: 0, walkPhase: 0, stride: 0, legSwing: 0, swing: null, hitstop: false, bob: t * 0.3, alive: true, satActive: false,
      },
      1 / 60,
    );
    m.root.scale.setScalar(3.15);
  }

  private mess(): void {
    const { w, d, P } = this;
    const hd = d / 2;
    // The serving counter along the back, a server behind it.
    this.solid(-6, -hd + 1.5, 6, -hd + 2.3, 1, (x, y) => (y === 1 ? shade(P.lip, 1.1) : x % 3 ? P.wallDark : P.accent));
    this.vox(-5.5, 1, -hd + 1.5, 5.5, 1.5, -hd + 2, (x) => (x % 3 === 0 ? glow(0xffd8a0) : 0x8a8f98));
    this.wallScreen(-w / 2 + 2, -w / 2 + 5, 2, 3.5, P.window);
    this.person(-2, -hd + 0.8, 0, 'stand', 'work', this.role('trader', 'resident', 'clerk', 'dockhand'));
    this.person(2.5, -hd + 0.8, 0, 'stand', 'work', this.role('trader', 'resident', 'clerk', 'dockhand'));
    // Six tables with benches either side, people at about half the seats.
    for (const tz of [0, 3.6]) {
      for (const tx of [-5.5, 0, 5.5]) {
        this.table(tx, tz, 3, 1);
        this.bench(tx, tz - 1, 3);
        this.bench(tx, tz + 1, 3);
        for (const side of [-1, 1]) {
          for (const sx of [-0.9, 0.9]) {
            if (this.rng.next() < 0.45) {
              this.person(tx + sx, tz + side * 1.0, side < 0 ? 0 : Math.PI, 'sit', this.rng.next() < 0.6 ? 'talk' : 'look');
            }
          }
        }
      }
    }
    this.person(-7, 5, 0.4, 'stand', 'cross');
  }

  private office(): void {
    const { w, d, P } = this;
    const hd = d / 2;
    this.wallScreen(-3, 3, 1.5, 3.5, P.window);
    for (const cz of [-1.5, 2]) {
      for (const cx of [-4.5, 0, 4.5]) {
        this.console(cx, cz, 2, P.window);
        if (this.rng.next() < 0.75) this.person(cx, cz + 0.95, Math.PI, 'sit', 'work', this.role('clerk', 'officer', 'foreman', 'claims', 'surveyor'));
      }
    }
    this.shelf(-w / 2, -hd + 1, -w / 2 + 0.8, hd - 3, 2.5);
    this.shelf(w / 2 - 0.8, -hd + 1, w / 2, hd - 3, 2.5);
    this.person(-1.5, -hd + 1.8, 0.3, 'stand', 'cross', this.role('officer', 'foreman', 'watch', 'recruit'));
    this.person(1.2, -hd + 2.0, -0.6 + Math.PI * 0.9, 'stand', 'talk');
  }

  private quarters(): void {
    const { w, d, P } = this;
    const hw = w / 2;
    const hd = d / 2;
    // Bunks along the back wall, lockers down the sides.
    for (let i = 0; i < 5; i++) {
      const x = -hw + 1.5 + i * 3;
      this.solid(x, -hd, x + 2.2, -hd + 1.1, 0.5, 0x2a2e33);
      this.vox(x, 0.5, -hd, x + 2.2, 0.75, -hd + 1.1, P.cargo[i % P.cargo.length]);
      this.vox(x, 0.75, -hd, x + 0.5, 1.0, -hd + 1.1, 0xd8dde4);
      this.vox(x, 1.6, -hd, x + 2.2, 1.8, -hd + 1.1, 0x2a2e33);
      this.vox(x, 1.8, -hd, x + 2.2, 2.0, -hd + 1.1, P.cargo[(i + 1) % P.cargo.length]);
      this.vox(x, 0, -hd, x + 0.25, 2.0, -hd + 0.25, 0x1c1f24);
      this.vox(x + 2, 0, -hd, x + 2.2, 2.0, -hd + 0.25, 0x1c1f24);
    }
    for (let z = -hd + 2.5; z < hd - 2; z += 1.2) {
      this.solid(-hw, z, -hw + 0.7, z + 1, 2.2, (_x, y) => (y === 6 ? 0x8a8f98 : shade(P.wallDark, 1.25)));
      this.solid(hw - 0.7, z, hw, z + 1, 2.2, (_x, y) => (y === 6 ? 0x8a8f98 : shade(P.wallDark, 1.25)));
    }
    this.table(0, 1.5, 2, 1.2);
    this.bench(0, 0.45, 2);
    this.bench(0, 2.55, 2);
    this.person(-0.5, 0.45, 0, 'sit', 'talk');
    this.person(0.6, 2.55, Math.PI, 'sit', 'nod');
    this.person(-hw + 1.4, 0.5, -Math.PI / 2, 'stand', 'work');
    this.person(3, -hd + 1.9, 0.2, 'sit', 'slump');
  }

  private control(): void {
    const { w, d, P } = this;
    const hw = w / 2;
    const hd = d / 2;
    // A window band across the back: night, and the lights of traffic in it.
    this.vox(-hw + 1, 1.5, -hd, hw - 1, 4, -hd + 0.5, (x, y) => (hashKeyN(x, y) > 0.975 ? glow(0xfff1c0) : hashKeyN(x, y) > 0.94 ? glow(0x4a5a88) : glow(0x0c1426)));
    // Consoles along the window, and down both sides.
    for (const cx of [-4, 0, 4]) {
      this.console(cx, -hd + 1.4, 3, P.trim);
      this.person(cx + (this.rng.next() - 0.5), -hd + 2.35, Math.PI, 'sit', 'work', this.role('watch', 'officer', 'clerk', 'foreman', 'broker'));
    }
    for (const sz of [-1, 2.5]) {
      // Side desks, screens upright along the wall edge.
      this.solid(-hw, sz - 1, -hw + 1, sz + 1, 1, 0x22262c);
      this.vox(-hw, 1, sz - 0.5, -hw + 0.5, 1.5, sz + 0.5, glow(P.window));
      this.solid(hw - 1, sz - 1, hw, sz + 1, 1, 0x22262c);
      this.vox(hw - 0.5, 1, sz - 0.5, hw, 1.5, sz + 0.5, glow(P.window));
    }
    this.person(-hw + 1.8, -1, -Math.PI / 2, 'sit', 'work');
    // The plot table: the lanes, lit from inside.
    this.solid(-1.5, 1.5, 1.5, 3.5, 0.9, 0x1c1f24);
    this.vox(-1.5, 0.9, 1.5, 1.5, 1.0, 3.5, (x, _y, z) => ((x + z) % 3 === 0 ? glow(P.trim) : glow(shade(P.accent, 0.5))));
    this.person(0.4, 4.2, Math.PI, 'stand', 'point', this.role('officer', 'foreman', 'watch', 'broker'));
  }

  private shop(): void {
    const { w, d, P } = this;
    const hw = w / 2;
    const hd = d / 2;
    this.solid(-3, -1.2, 3, -0.4, 1, (x, y) => (y === 1 ? shade(P.lip, 1.1) : x % 2 ? P.wallDark : P.accent));
    this.vox(-2.5, 1, -1.2, -1, 1.5, -0.6, glow(0xffd8a0));
    this.shelf(-hw, -hd, hw, -hd + 0.8, 2.5);
    this.shelf(-hw, -hd + 0.8, -hw + 0.8, 0, 2);
    this.crate(hw - 1.2, hd - 1.8, 1, P.cargo[0]);
    this.crate(hw - 1.2, hd - 3, 1, P.cargo[1 % P.cargo.length]);
    this.person(0.5, -2.3, 0, 'stand', 'work', this.role('trader', 'broker', 'clerk', 'surveyor', 'tech'));
    if (this.spec.kind !== 'sealed') this.person(-1.2, 0.8, Math.PI + 0.3, 'stand', 'look');
  }

  // ----------------------------------------------------------------- live

  /** Where you stand on walking in, and which way you face. */
  entry(): { x: number; y: number; z: number; facing: number } {
    return { x: 0, y: ROOM_Y, z: this.d / 2 - 1.2, facing: Math.PI };
  }

  /** Past this z (world), you have stepped back out through the door. */
  get exitZ(): number {
    return this.d / 2 + 0.6;
  }

  /** The fixed cutaway camera: over the open front wall, sliding with you. */
  camera(me: { x: number; z: number }, eye: THREE.Vector3, at: THREE.Vector3): void {
    const big = this.kind === 'bay';
    const back = big ? 12 : 5;
    const up = big ? 12 : 6.5;
    const ex = Math.max(-this.w * 0.3, Math.min(this.w * 0.3, me.x * 0.6));
    // Further in, the camera leans in after you.
    const lean = Math.max(0, this.d / 2 - me.z) * 0.25;
    eye.set(ex, ROOM_Y + up, this.d / 2 + back - lean);
    at.set(me.x * 0.85, ROOM_Y + (big ? 3 : 0.9), me.z * 0.75 - (big ? 2.5 : 1.2));
  }

  update(dt: number, t: number): void {
    for (const p of this.people) {
      p.next -= dt;
      if (p.next <= 0 && !p.agent.held) {
        const g = p.habit === 'talk' && this.rng.next() < 0.3 ? 'nod' : p.habit;
        gesture(p.fig, g);
        p.next = (g === 'work' ? 4 : 2) + this.rng.next() * 4;
      }
      p.fig.root.rotation.y = p.agent.facing;
      animateFigure(p.fig, 0, dt, t);
    }
    this.posemech(t);
  }

  /** The person nearest `me` within reach, for the talk prompt. */
  nearestPerson(me: { x: number; z: number; facing: number }, reach: number): RoomPerson | null {
    let best: RoomPerson | null = null;
    let score = -Infinity;
    for (const p of this.people) {
      const dx = p.agent.x - me.x;
      const dz = p.agent.z - me.z;
      const dd = Math.hypot(dx, dz);
      if (dd > reach) continue;
      const s = 1 - dd / reach + ((dx * Math.sin(me.facing) + dz * Math.cos(me.facing)) / (dd || 1)) * 0.6;
      if (s > score) {
        score = s;
        best = p;
      }
    }
    return best;
  }

  /** Something to say: the room's own lines, by turns with the yard's. */
  line(p: RoomPerson, n: number): string {
    const pool = ROOM_BARKS[this.kind];
    return pool[(p.agent.seed + n) % pool.length];
  }

  dispose(): void {
    this.mech?.destroy();
    this.group.removeFromParent();
    // Figures and frames share cached geometry: only the room's own voxels are freed.
    this.body?.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
  }
}

/** A stable 0..1 hash of two integers, for the window band's lights. */
function hashKeyN(x: number, y: number): number {
  let h = Math.imul(x * 374761393 + y * 668265263, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
