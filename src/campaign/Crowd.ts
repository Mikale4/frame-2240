import { Rng } from '../core/Rng';
import { REGIONS, doorOf, type RegionSpec, type RegionStyle } from './Regions';
import type { WalkModel } from './WorldModel';

/**
 * The people of the Reach going about their day.
 *
 * Every yard but Cathedral Yard (empty by canon) is populated by its own kind
 * of people: officers and cadets at Meridian, traders and dockhands at
 * Brightwake, seam cutters at Coldseam, recruits at Emberrest, sooted crews at
 * Cinder Berth. They stroll between the places a yard has — doors, stalls, the
 * walkway, the pad — stop in twos to talk, stand at a station and work, and
 * keep a step away from each other and from you. Talk to any of them and they
 * have something to say: slice of life, the season's news, what they think of
 * the pilot they are talking to.
 *
 * Pure TypeScript and seeded: no renderer, so `crowd.test.ts` can check that
 * everyone stays on walkable deck however long the day runs.
 */

export type CrowdMode = 'walk' | 'idle' | 'chat' | 'work';

export interface CrowdAgent {
  id: string;
  region: string;
  role: string;
  /** What the prompt and the dialogue box call them. */
  name: string;
  sex: 'f' | 'm';
  seed: number;
  suit: number;
  trim: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  facing: number;
  mode: CrowdMode;
  target: { x: number; z: number } | null;
  /** Seconds left in the current idle, chat or work. */
  wait: number;
  /** Seconds without progress toward the target; a stuck walker re-routes. */
  stuck: number;
  partner: string | null;
  /** Held by a conversation with the player. */
  held: boolean;
  /** Set on the tick a gesture should start, for the renderer. */
  gesture: 'talk' | 'work' | 'nod' | 'shrug' | 'look' | null;
  walkSpeed: number;
}

export interface RoleDef {
  role: string;
  name: string;
  weight: number;
  /** Chance the role is a woman. Roles are not gendered; this only varies a crowd. */
  f: number;
  suit: number[];
  trim: number;
  /** Prefers to stand and work rather than walk. */
  works?: boolean;
}

/** Who lives on each kind of yard. */
const POP: Record<RegionStyle, { count: number; roles: RoleDef[] }> = {
  cathedral: { count: 0, roles: [] },
  concord: {
    count: 28,
    roles: [
      { role: 'officer', name: 'CONCORD OFFICER', weight: 4, f: 0.5, suit: [0x22447a, 0x2a4f88], trim: 0x3d8cff },
      { role: 'cadet', name: 'CADET', weight: 5, f: 0.5, suit: [0xdde4ec, 0xc9d2dc], trim: 0x3d8cff },
      { role: 'tech', name: 'VANTOR TECHNICIAN', weight: 4, f: 0.4, suit: [0x9aa6b6, 0x7d8a9c], trim: 0xffb020, works: true },
      { role: 'clerk', name: 'RECORDS CLERK', weight: 2, f: 0.6, suit: [0x3a4250], trim: 0xcfe8ff },
    ],
  },
  free: {
    count: 36,
    roles: [
      { role: 'trader', name: 'TRADER', weight: 5, f: 0.5, suit: [0x8a4a3a, 0x6a5e52, 0x3a7ad8], trim: 0xffc070, works: true },
      { role: 'dockhand', name: 'DOCKHAND', weight: 5, f: 0.4, suit: [0x5a5048, 0x2a8a8a], trim: 0x3ee0ff },
      { role: 'resident', name: 'RESIDENT', weight: 6, f: 0.55, suit: [0x8a3ab0, 0xc0582a, 0x3a4250, 0xd8b030], trim: 0xff5a8a },
      { role: 'mechanic', name: 'MECHANIC', weight: 3, f: 0.45, suit: [0x4a4a52], trim: 0xffc070, works: true },
      { role: 'kid', name: 'YARD KID', weight: 2, f: 0.5, suit: [0xc0582a, 0x2a8a8a], trim: 0xffffff },
    ],
  },
  ironwake: {
    count: 26,
    roles: [
      { role: 'cutter', name: 'SEAM CUTTER', weight: 6, f: 0.35, suit: [0xa8721f, 0x8a5e1a], trim: 0xffb020, works: true },
      { role: 'hauler', name: 'HAULER', weight: 4, f: 0.3, suit: [0x6e5a40], trim: 0xffb020 },
      { role: 'foreman', name: 'SHIFT FOREMAN', weight: 1, f: 0.4, suit: [0x5b4a2c], trim: 0xffd060 },
      { role: 'clerk', name: 'SHIFT CLERK', weight: 2, f: 0.6, suit: [0x40321f], trim: 0xffc060 },
    ],
  },
  gate: {
    count: 18,
    roles: [
      { role: 'watch', name: 'WATCH CREW', weight: 5, f: 0.4, suit: [0x3c2a6c, 0x5a5070], trim: 0xc89cff },
      { role: 'dockhand', name: 'DOCKHAND', weight: 4, f: 0.4, suit: [0x5a5070], trim: 0xc89cff, works: true },
      { role: 'resident', name: 'RESIDENT', weight: 3, f: 0.55, suit: [0x4c4658, 0x6a6080], trim: 0xd8c0ff },
    ],
  },
  emberline: {
    count: 28,
    roles: [
      { role: 'recruit', name: '7TH ASSAULT RECRUIT', weight: 7, f: 0.45, suit: [0x781c22, 0x5a1a1e], trim: 0x36e2ea },
      { role: 'officer', name: 'EMBERLINE OFFICER', weight: 3, f: 0.4, suit: [0x4a2c2e], trim: 0x36e2ea },
      { role: 'clerk', name: 'CLAIMS CLERK', weight: 2, f: 0.6, suit: [0x3a3436], trim: 0xff8a6a },
      { role: 'resident', name: 'RESIDENT', weight: 3, f: 0.5, suit: [0x5a2a2c, 0x3a3436], trim: 0xff7a5a },
    ],
  },
  ashfall: {
    count: 21,
    roles: [
      { role: 'crew', name: 'ASHFALL CREW', weight: 7, f: 0.5, suit: [0x5a3020, 0x4a2a1c, 0x2a2020], trim: 0xff9a3a },
      { role: 'broker', name: 'CONTRACT BROKER', weight: 2, f: 0.5, suit: [0x2a2020], trim: 0xff7a2a },
      { role: 'mechanic', name: 'MECHANIC', weight: 3, f: 0.4, suit: [0x38302c], trim: 0xff8a2a, works: true },
    ],
  },
  survey: {
    count: 3,
    roles: [{ role: 'surveyor', name: 'SURVEY HAND', weight: 1, f: 0.5, suit: [0x1c6a68], trim: 0xe8c23a, works: true }],
  },
};

/** The kinds of people who work on a yard of this style. */
export function rolesOf(style: RegionStyle): readonly RoleDef[] {
  return POP[style].roles;
}

/**
 * What people say. By yard, then by role, with `any` for everyone on that
 * yard. Matter-of-fact, British, nobody named who is not canon, and nothing
 * about what 2240 means.
 */
export const BARKS: Record<RegionStyle, Record<string, string[]>> = {
  cathedral: { any: [] },
  concord: {
    any: [
      'Reliability first. They paint it over every hangar door in Meridian, and then they repaint it.',
      'The board posted three cases to Cathedral Yard this week. Three. Someone is pushing.',
      'Fourth bell is certification. Fifth bell is everyone pretending they passed.',
      'The wind comes up off the storm layer at night. You can taste the grit on the rail.',
    ],
    officer: [
      'Logbook first, opinions second. That is the doctrine and I did not write it.',
      'Emberline filed another claim this morning. One of the thirteen, they say. They always say.',
      'If you are waiting for a pursuit order on that EW frame, bring a chair.',
    ],
    cadet: [
      'I failed the cold-start drill twice. Third time is the mark, my instructor says. My instructor says a lot.',
      'Vesk does not sign anything she has not flown herself. Everyone knows. Everyone still tries.',
      'They say the Archive has entries nobody below a certain grade is allowed to read.',
      'My mother wanted me in the records office. I wanted to fly. We are both disappointed.',
    ],
    tech: [
      'The deferred list is longer than the fixed list. It is always longer.',
      'Vantor want their successor frames flown, not sent back with notes. They keep getting notes.',
      'Torque that and do not tell me it is fine. Fine is how things fall out of the sky.',
    ],
    clerk: ['Every flight leaves paper. Every paper leaves a clerk. Here I am.', 'Docking returns say "authorised visitor". Enforcement notices say "pirate". Same crew.'],
  },
  free: {
    any: [
      'Concord calls us pirates on a Monday and visitors on a Tuesday. Depends which form they are filling in.',
      'If it floats, someone at Brightwake has bought it. If it does not, someone has bought the bits.',
      'Market deck is loud tonight. Means the convoys came in.',
    ],
    trader: [
      'Reactor cores, cold, no questions. Warm ones cost more, and you answer questions.',
      'Dagger revision, printed copy, free. Holloway would not let anyone charge for it. Annoying.',
      'Spare thrust nozzles. Three wrecks went into this stall and none of them are coming back for it.',
    ],
    dockhand: [
      'The end berth has been quiet a while. Nobody asks. That is how the end berth likes it.',
      'Somebody saw an EW frame on the outer spars. Somebody always sees an EW frame.',
      'Twelve hours on the cranes, and the cranes are the easy part.',
    ],
    resident: [
      'Forty-three years above the cloud and we still argue about who gets the warm side of the deck.',
      'My sister flies salvage. I keep a lamp in the window. That is the whole arrangement.',
      'The tea here is terrible. I have drunk it every day for twenty years.',
      'Rations came in short again. They always come in short when the board is busy.',
    ],
    mechanic: [
      'She came in with three holes in the hull and asked if it would fly. It flew. I am not proud of that.',
      'You can tell a Free Latitude frame by the welds. None of them match. All of them hold.',
    ],
    kid: [
      'When I am old enough I am building a frame. Out of what? Out of whatever is lying about.',
      'Mira Holloway built her first one at seventeen. I have six years. Plenty.',
    ],
  },
  ironwake: {
    any: [
      'Seam is singing today. That is a good sound until the day it is not.',
      'Third convoy lost this season. They will put the walkers back on the lane, you watch.',
      'The raft does not care what day it is. Neither do we, after twelve hours.',
    ],
    cutter: [
      'Cut slow and the seam forgives you. Cut fast and it remembers.',
      'Okonkwo turned down a commission again. Third time. Says the seam pays better in ways that matter.',
      'Ironwake has no position on the Descent. The rest of us have plenty of positions on it, after a shift.',
    ],
    hauler: ['Ore goes up, rations come down, and in between someone tries to seize it all.', 'Pattern 3 walkers. Older than my father. Still the best thing on the deck.'],
    foreman: ['A collapse is worse than any fight. A fight ends.', 'Shift change at the bell. Anyone late carries the next load by hand.'],
    clerk: ['Ore by the tonne, losses by the convoy, and the board by the season. That is the ledger.'],
  },
  gate: {
    any: [
      'Route is closed. Has been for twenty years. Ask the man with the braids if you want it open.',
      'Kettle, Bram, Ossory. Three gates, one route, one watch.',
    ],
    watch: [
      'He never chases. Says if they turn back, the job is done. Twenty years, the job has been done.',
      'Eleven braids. Every one of them a docking somebody wanted and did not get.',
    ],
    dockhand: ['Not much docks here. That is rather the point of a gate.', 'I logged the GD-09 as door equipment once. He told me to leave it.'],
    resident: ['Quiet yard. People come for the quiet and leave because of it.'],
  },
  emberline: {
    any: [
      'Nine yards held. Thirteen claimed. The arithmetic is the whole argument.',
      'The settlement is incomplete. It says so on the wall of the claims office, in paint.',
    ],
    recruit: [
      'Rook made me run the range four times. Said the clock does not shoot back.',
      'He has never told us what happened at the end of his Concord years. Nobody asks twice.',
      'We fly rebuilds. Thirty AV-13s came over in the reparations and every one of them has been opened up since.',
      'He brought a frame home once that anyone else would have left. That is all anyone knows, and all he will say.',
    ],
    officer: ['Impossible to impress, they say about him. They are right. It is the best thing about the 7th.', 'Uncertified rebuilds. Concord says it like an insult. We say it like a job.'],
    clerk: ['The claims office opens at dawn and does not close until somebody wins.', 'Every claim to the thirteen goes through this desk, and this desk is tired.'],
    resident: ['My grandmother remembers when this yard was under review. She says the review never ended. It just stopped writing back.'],
  },
  ashfall: {
    any: [
      'Every risk has a price. You just have not heard yours yet.',
      'We work for all four powers. Makes holidays awkward.',
    ],
    crew: [
      'Soot is part of the uniform. Volkov started it. Now the inspectors think we are all on fire.',
      'Four hulls written off and she still comes back smirking. Nobody else gets to smirk at the broker.',
      'Within terms. That is what the board says about everything we do. Within terms.',
    ],
    broker: ['Two envelopes, one desk. It is a good week when they do not overlap.', 'I price the risk. I do not price the regret. That is extra.'],
    mechanic: ['Patch it, paint it black, call it an upgrade.', 'Nothing in this berth has its original parts. Including me.'],
  },
  survey: {
    any: ['Four kilometres of spar in every direction and nothing to look at but weather.'],
    surveyor: ['He finds four firing positions before anyone finds him. I find the kettle. We all have our gifts.'],
  },
};

const SEPARATION = 0.9;

export function barkFor(style: RegionStyle, role: string, seed: number): string {
  const pool = [...(BARKS[style][role] ?? []), ...(BARKS[style].any ?? [])];
  return pool.length ? pool[Math.abs(seed) % pool.length] : '';
}

/** Places worth walking to on a region, region-local: doors, stalls, lane, pad. */
export function navPoints(r: RegionSpec): { x: number; z: number; work: boolean }[] {
  const pts: { x: number; z: number; work: boolean }[] = [];
  for (const b of r.buildings) {
    const d = doorOf(b);
    pts.push({ x: d.sx, z: d.sz, work: b.kind === 'kiosk' || b.kind === 'hangar' });
  }
  const hw = r.w / 2 - 9;
  const hd = r.d / 2 - 9;
  for (let i = 0; i < 10; i++) {
    const t = i / 10;
    pts.push({ x: -hw + 2 * hw * t, z: -hd, work: false }, { x: -hw + 2 * hw * t, z: hd, work: false });
    pts.push({ x: -hw, z: -hd + 2 * hd * t, work: false }, { x: hw, z: -hd + 2 * hd * t, work: false });
  }
  pts.push({ x: r.pad.x + 5.5, z: r.pad.z, work: true }, { x: r.pad.x - 5.5, z: r.pad.z, work: true });
  for (let i = 0; i < 6; i++) pts.push({ x: (i - 2.5) * 6, z: (i % 2 ? -1 : 1) * 6, work: false });
  return pts;
}

export class CrowdSim {
  readonly agents: CrowdAgent[] = [];
  private readonly rng: Rng;
  private readonly nav = new Map<string, { x: number; z: number; work: boolean }[]>();

  constructor(
    private readonly walk: WalkModel,
    seed = 0x5eed,
  ) {
    this.rng = new Rng(seed);
    for (const r of REGIONS) this.populate(r);
  }

  private populate(r: RegionSpec): void {
    const P = POP[r.style];
    if (!P.count) return;
    // Only spots a person can actually stand on.
    const nav = navPoints(r).filter((p) => this.walk.standAt(r.cx + p.x, r.cz + p.z, r.y, 0.3) !== null);
    this.nav.set(r.id, nav);
    if (!nav.length) return;
    const total = P.roles.reduce((a, b) => a + b.weight, 0);
    for (let i = 0; i < P.count; i++) {
      let pick = this.rng.next() * total;
      const role = P.roles.find((d) => (pick -= d.weight) < 0) ?? P.roles[0];
      const p = nav[Math.floor(this.rng.next() * nav.length)];
      const jx = (this.rng.next() - 0.5) * 4;
      const jz = (this.rng.next() - 0.5) * 4;
      let x = r.cx + p.x + jx;
      let z = r.cz + p.z + jz;
      if (this.walk.standAt(x, z, r.y, 0.3) === null) {
        x = r.cx + p.x;
        z = r.cz + p.z;
      }
      const seed = Math.floor(this.rng.next() * 100000);
      this.agents.push({
        id: `${r.id}:${i}`,
        region: r.id,
        role: role.role,
        name: role.name,
        sex: this.rng.next() < role.f ? 'f' : 'm',
        seed,
        suit: role.suit[seed % role.suit.length],
        trim: role.trim,
        x,
        y: r.y,
        z,
        vx: 0,
        vz: 0,
        facing: this.rng.next() * Math.PI * 2,
        mode: role.works && p.work ? 'work' : 'idle',
        target: null,
        wait: 2 + this.rng.next() * 8,
        stuck: 0,
        partner: null,
        held: false,
        gesture: null,
        walkSpeed: (role.role === 'kid' ? 1.9 : 1.15) + this.rng.next() * 0.45,
      });
    }
  }

  /** Advances everyone in regions near `focus` (metres). Far yards keep still. */
  step(dt: number, focus: { x: number; z: number }, radius = 220, avoid?: { x: number; z: number }): void {
    const live = this.agents.filter((a) => {
      const r = REGIONS.find((q) => q.id === a.region)!;
      return Math.hypot(r.cx - focus.x, r.cz - focus.z) < radius;
    });
    for (const a of live) {
      a.gesture = null;
      if (a.held) {
        a.vx = 0;
        a.vz = 0;
        continue;
      }
      if (a.mode === 'walk' && a.target) {
        const dx = a.target.x - a.x;
        const dz = a.target.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.6) {
          this.arrive(a);
        } else {
          let vx = (dx / d) * a.walkSpeed;
          let vz = (dz / d) * a.walkSpeed;
          // Keep a step away from everyone else, and from the player.
          for (const b of live) {
            if (b === a || b.region !== a.region) continue;
            const ox = a.x - b.x;
            const oz = a.z - b.z;
            const od = Math.hypot(ox, oz);
            if (od > 0.01 && od < SEPARATION) {
              vx += (ox / od) * (SEPARATION - od) * 2.5;
              vz += (oz / od) * (SEPARATION - od) * 2.5;
            }
          }
          if (avoid) {
            const ox = a.x - avoid.x;
            const oz = a.z - avoid.z;
            const od = Math.hypot(ox, oz);
            if (od > 0.01 && od < 1.2) {
              vx += (ox / od) * (1.2 - od) * 3;
              vz += (oz / od) * (1.2 - od) * 3;
            }
          }
          const before = d;
          const next = this.walk.move({ x: a.x, y: a.y, z: a.z }, vx * dt, vz * dt);
          a.x = next.x;
          a.z = next.z;
          a.y = next.y;
          a.vx = vx;
          a.vz = vz;
          a.facing = Math.atan2(vx, vz);
          const after = Math.hypot(a.target.x - a.x, a.target.z - a.z);
          a.stuck = after > before - a.walkSpeed * dt * 0.25 ? a.stuck + dt : 0;
          if (a.stuck > 1.5) this.arrive(a);
        }
        continue;
      }
      a.vx = 0;
      a.vz = 0;
      a.wait -= dt;
      if (a.mode === 'chat' && this.rng.next() < dt * 0.6) a.gesture = this.rng.next() < 0.7 ? 'talk' : this.rng.next() < 0.5 ? 'nod' : 'shrug';
      if (a.mode === 'work' && this.rng.next() < dt * 0.3) a.gesture = 'work';
      if (a.mode === 'idle' && this.rng.next() < dt * 0.08) a.gesture = 'look';
      if (a.wait <= 0) this.depart(a, live);
    }
  }

  private arrive(a: CrowdAgent): void {
    a.target = null;
    a.stuck = 0;
    const roll = this.rng.next();
    a.mode = roll < 0.25 ? 'work' : 'idle';
    a.wait = a.mode === 'work' ? 6 + this.rng.next() * 10 : 2 + this.rng.next() * 6;
  }

  /** Done standing: pair up with someone idle nearby, or walk somewhere. */
  private depart(a: CrowdAgent, live: CrowdAgent[]): void {
    if (a.partner) {
      const p = this.agents.find((b) => b.id === a.partner);
      if (p) p.partner = null;
      a.partner = null;
    }
    if (this.rng.next() < 0.3) {
      const other = live.find(
        (b) => b !== a && !b.held && b.region === a.region && b.mode === 'idle' && !b.partner && Math.hypot(b.x - a.x, b.z - a.z) < 6,
      );
      if (other) {
        // Face each other and talk a while.
        a.mode = other.mode = 'chat';
        a.partner = other.id;
        other.partner = a.id;
        a.wait = other.wait = 10 + this.rng.next() * 14;
        a.facing = Math.atan2(other.x - a.x, other.z - a.z);
        other.facing = Math.atan2(a.x - other.x, a.z - other.z);
        return;
      }
    }
    const r = REGIONS.find((q) => q.id === a.region)!;
    const nav = this.nav.get(r.id) ?? [];
    if (!nav.length) return;
    const p = nav[Math.floor(this.rng.next() * nav.length)];
    a.mode = 'walk';
    a.target = { x: r.cx + p.x + (this.rng.next() - 0.5) * 2, z: r.cz + p.z + (this.rng.next() - 0.5) * 2 };
  }
}
