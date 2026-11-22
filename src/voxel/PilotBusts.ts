import * as THREE from 'three';
import { Grid, glow, hash3, meshGrid, mixHex, shade } from './VoxelKit';

/**
 * The eight pilots, as live voxel busts.
 *
 * Post Parade's idea: each pilot is a small voxel figure from the chest up,
 * turned three-quarters to the camera, and *alive* — breathing, looking about,
 * glancing off now and then, blinking. They replace the painted pixel
 * portraits everywhere a portrait appears (banter boxes, the saturation cut-in,
 * the select screen, the Archive) by taking over the very texture keys those
 * screens already ask for, `pilot_<id>` and `pilot_<id>_thumb`.
 *
 * **Who is a woman and who is a man has to read at a glance** — four of each,
 * fixed by `docs/PILOT_PORTRAIT_SPEC.md`. The first cut did not manage it, and
 * the owner said so. Everything that now carries it:
 *
 * - **the face**, built on Post Parade's head (eight voxels wide, two-by-two
 *   eyes, no nose): a lash over her eye with a flick past the corner, colour in
 *   her cheeks and on her lips; a crease over his, heavy brows, a square jaw a
 *   row deeper, stubble where it fits;
 * - **the hair**: hers frames her face — side locks to the jaw or below;
 * - **the silhouette**: the bust is framed down to mid-chest, so her narrower
 *   shoulders, slim neck and figure under the suit show, against his broad
 *   shoulders, thick neck and flat chest.
 *
 * Head coordinates: x -4..3 across the face (+x is the pilot's left as we look
 * at them), y 0 (chin) .. 7 (crown), z -4 (back) .. 3 (the face).
 */

type HairStyle = 'bob' | 'cropped' | 'tied' | 'shaved' | 'shaggy' | 'braids' | 'mane' | 'straight';
type Mouth = 'smile' | 'smirk' | 'stern' | 'flat';
type Collar = 'open' | 'armour' | 'flight' | 'work' | 'scav' | 'circuit';

export interface Look {
  sex: 'f' | 'm';
  skin: number;
  hair: number;
  style: HairStyle;
  eyes: number;
  mouth: Mouth;
  suit: number;
  trim: number;
  /** Trim is light (running lights, piping) rather than paint. */
  trimGlow?: boolean;
  under: number;
  collar: Collar;
  /** Background glow behind the bust. */
  bg: number;
  headset?: boolean;
  scar?: boolean;
  /** Brows drawn down hard toward the nose. */
  frown?: boolean;
  monocle?: number;
  goggles?: number;
  beard?: number;
  stubble?: boolean;
  soot?: boolean;
  sensor?: number;
  earring?: number;
  pauldron?: number;
}

export const PILOT_LOOKS: Record<string, Look> = {
  // NAIA VESK — woman, early 30s. Short dark hair, azure flight suit with hot
  // orange trim, collar open, headset round her neck. Composed, a little arrogant.
  halcyon: {
    sex: 'f', skin: 0xf2c6a4, hair: 0x1d2333, style: 'bob', eyes: 0x3d9cff, mouth: 'smirk',
    suit: 0x22447a, trim: 0xff7a1c, under: 0x161a24, collar: 'open', bg: 0x2a6fd8, headset: true,
    earring: 0xff9a3a,
  },
  // HALDEN ROOK — man, late 40s. Cropped grey hair, scarred, deep crimson
  // armour with cyan piping. Older, unbothered, and nobody to joke with.
  nocturne: {
    sex: 'm', skin: 0xa87256, hair: 0x9a9aa0, style: 'cropped', eyes: 0x6a9cb4, mouth: 'stern',
    suit: 0x781c22, trim: 0x36e2ea, trimGlow: true, under: 0x18181c, collar: 'armour', bg: 0xb0202a,
    scar: true, stubble: true, frown: true,
  },
  // KESTREL DOYNE — man, late 20s. Long pale hair tied back, teal suit with
  // sulphur trim, a slim targeting monocle. Quiet, watchful.
  vesper: {
    sex: 'm', skin: 0xe0b092, hair: 0xe2ddd2, style: 'tied', eyes: 0xd09a3a, mouth: 'flat',
    suit: 0x1c6a68, trim: 0xe8c23a, under: 0x14201f, collar: 'flight', bg: 0x2aa49a,
    monocle: 0x8af07a,
  },
  // BRUNN OKONKWO — man, 50s. Shaved head, ochre work suit with amber hazard
  // striping, welding goggles pushed up on the forehead. Calm, immovable.
  terramoth: {
    sex: 'm', skin: 0x6e4630, hair: 0x2a1c16, style: 'shaved', eyes: 0x2a1c14, mouth: 'smile',
    suit: 0xa8721f, trim: 0xffb020, under: 0x2a1e14, collar: 'work', bg: 0xd08a20,
    goggles: 0xffa23a, stubble: true,
  },
  // MIRA HOLLOWAY — woman, early 20s. Messy light hair, silver-white suit with
  // cyan running lights. Young, quick, cheerful.
  cirrus: {
    sex: 'f', skin: 0xf0c09c, hair: 0xb8c2d6, style: 'shaggy', eyes: 0x1fa8e0, mouth: 'smile',
    suit: 0xe4e8ee, trim: 0x3ee0ff, trimGlow: true, under: 0x2a3038, collar: 'open', bg: 0x30c0e8,
    earring: 0x3ee0ff,
  },
  // SAAR TENGKU — man, 40s. Braided dark hair, beard, violet armour with a
  // pale lilac glow. Steady, patient.
  obelisk: {
    sex: 'm', skin: 0x9a684a, hair: 0x241c2c, style: 'braids', eyes: 0x8a6438, mouth: 'flat',
    suit: 0x3c2a6c, trim: 0xc89cff, trimGlow: true, under: 0x1a1428, collar: 'armour', bg: 0x7a48e0,
    beard: 0x221a22, earring: 0xb48cff,
  },
  // RASA VOLKOV — woman, mid 20s. Wild red-orange hair, scavenged orange gear,
  // one big pauldron, soot on her face, amber goggles. A lopsided smirk.
  pyre: {
    sex: 'f', skin: 0xe2a47c, hair: 0xe84c18, style: 'mane', eyes: 0xffa020, mouth: 'smirk',
    suit: 0xbc4e1c, trim: 0x2a2020, under: 0x281a16, collar: 'scav', bg: 0xe8641c,
    goggles: 0xffb43a, soot: true, pauldron: 0x9c5a28,
  },
  // IO SENNA — woman, 30s. Straight black hair with a blunt fringe, near-black
  // slate suit with cyan circuit tracing, a sensor band at one temple.
  nulltide: {
    sex: 'f', skin: 0xf4d2bc, hair: 0x15171e, style: 'straight', eyes: 0x4a8cc0, mouth: 'flat',
    suit: 0x1a2028, trim: 0x30e8ff, trimGlow: true, under: 0x0e1218, collar: 'circuit', bg: 0x1890c0,
    sensor: 0x40f0ff,
  },
};

const LASH = 0x14121a;
const BLUSH = 0xf0a494;

/** Post Parade's hair texture: a scatter of shadow and highlight voxels. */
function hairShade(H: number): (x: number, y: number, z: number) => number {
  const H2 = shade(H, 0.8);
  const HL = mixHex(H, 0xffffff, 0.16);
  return (x, y, z) =>
    ((x * 7 + z * 3 + y * 5) % 6 + 6) % 6 === 0 ? H2 : ((x + y * 2 + z) % 5 + 5) % 5 === 0 ? HL : H;
}

// ------------------------------------------------------------------- heads

export function head(L: Look): Grid {
  const g = new Grid();
  g.jit = 0.025;
  const S = L.skin;
  const SD = shade(S, 0.86);
  const f = L.sex === 'f';
  g.box(-4, 0, -4, 3, 7, 3, S);
  if (f) {
    // A narrower, softer chin: the jaw's corners come off.
    g.set(-4, 0, 3, null).set(3, 0, 3, null).set(-4, 0, 2, null).set(3, 0, 2, null);
  } else {
    // A square jaw a row deeper, shadowed under the cheekbones.
    g.box(-3, -1, -3, 2, -1, 3, S);
    g.set(-4, 0, 3, SD).set(3, 0, 3, SD).set(-4, 1, 3, SD).set(3, 1, 3, SD);
  }
  g.box(-5, 3, -1, -5, 4, 0, SD);
  g.box(4, 3, -1, 4, 4, 0, SD);

  // Eyes, two by two: a lid over the iris and a glint by it — the lid a lash
  // for her, a crease for him.
  for (const [xo, xi] of [[-3, -2], [2, 1]]) {
    g.set(xo, 3, 3, L.eyes);
    g.set(xi, 3, 3, mixHex(L.eyes, 0xffffff, 0.5));
    g.set(xo, 4, 3, f ? LASH : mixHex(L.eyes, LASH, 0.6));
    g.set(xi, 4, 3, f ? mixHex(L.eyes, LASH, 0.55) : SD);
  }
  if (f) {
    // Colour in her cheeks, and a flick of lash past each outer corner.
    g.set(-3, 2, 3, BLUSH).set(2, 2, 3, BLUSH);
    g.set(-4, 4, 3, LASH).set(3, 4, 3, LASH).set(-4, 5, 3, LASH).set(3, 5, 3, LASH);
  } else {
    const brow = L.style === 'shaved' ? shade(S, 0.5) : shade(L.hair, 0.75);
    if (L.frown) {
      // Drawn down hard toward the nose and over the eyes: a man who has
      // stopped expecting anything good from the next five minutes.
      g.set(-3, 5, 3, brow).set(-2, 5, 3, brow).set(2, 5, 3, brow).set(1, 5, 3, brow);
      g.set(-2, 4, 3, brow).set(1, 4, 3, brow);
      g.set(-1, 4, 3, SD).set(0, 4, 3, SD);
      g.set(-3, 4, 3, shade(L.eyes, 0.5)).set(2, 4, 3, shade(L.eyes, 0.5));
    } else {
      g.box(-3, 5, 3, -2, 5, 3, brow);
      g.box(1, 5, 3, 2, 5, 3, brow);
    }
  }

  // Mouth. Hers has colour; his is a line.
  const lip = f ? mixHex(S, 0xc8505a, 0.5) : shade(S, 0.68);
  switch (L.mouth) {
    case 'smile':
      g.set(-1, 1, 3, lip).set(0, 1, 3, lip).set(-2, 2, 3, lip).set(1, 2, 3, lip);
      if (f) g.set(-3, 2, 3, BLUSH).set(2, 2, 3, BLUSH);
      break;
    case 'smirk':
      g.set(-1, 1, 3, lip).set(0, 1, 3, lip).set(1, 2, 3, lip);
      break;
    case 'stern':
      // Pulled down at both corners.
      g.set(-1, 1, 3, shade(S, 0.6)).set(0, 1, 3, shade(S, 0.6));
      g.set(-2, 0, 3, shade(S, 0.66)).set(1, 0, 3, shade(S, 0.66));
      break;
    case 'flat':
      g.set(-1, 1, 3, lip).set(0, 1, 3, lip);
      break;
  }

  if (L.stubble) {
    const st = mixHex(S, 0x1a1412, 0.24);
    for (let x = -3; x <= 2; x++) if (g.get(x, 0, 3) === S) g.set(x, 0, 3, st);
    for (let x = -3; x <= 2; x++) g.set(x, -1, 3, st);
  }
  if (L.scar) {
    // Down through his left brow and across the cheek.
    const sc = mixHex(S, 0xf0b0a8, 0.6);
    g.set(2, 6, 3, sc).set(2, 2, 3, sc).set(3, 2, 3, sc);
  }
  if (L.soot) {
    const so = mixHex(S, 0x2a1a16, 0.5);
    g.set(-4, 2, 3, so).set(3, 1, 3, so).set(-2, 6, 3, so);
  }
  if (L.beard !== undefined) {
    const b = L.beard;
    g.box(-3, -1, 1, 2, -1, 3, b);
    g.box(-4, 0, 0, 3, 0, 3, b);
    g.box(-4, 1, 0, -4, 2, 3, b);
    g.box(3, 1, 0, 3, 2, 3, b);
    g.set(-2, 1, 3, b).set(1, 1, 3, b);
    g.set(-1, 2, 3, b).set(0, 2, 3, b);
    g.set(-1, 1, 3, shade(S, 0.68)).set(0, 1, 3, shade(S, 0.68));
    g.box(-2, -2, 2, 1, -2, 3, b);
  }
  if (L.monocle !== undefined) {
    // Over his right eye (our left): a frame round a lit lens, the arm back to
    // the ear. Kept as first built — the owner liked it as it was.
    const fr = 0x2a2e34;
    g.box(-4, 2, 4, -1, 2, 4, fr);
    g.box(-4, 5, 4, -1, 5, 4, fr);
    g.box(-4, 3, 4, -4, 4, 4, fr);
    g.box(-1, 3, 4, -1, 4, 4, fr);
    g.box(-3, 3, 4, -2, 4, 4, glow(L.monocle));
    g.box(-5, 4, 1, -5, 4, 3, fr);
  }
  if (L.goggles !== undefined) {
    // Pushed up on the forehead: a strap round the head, two lenses.
    const strap = 0x3a2a20;
    for (let x = -5; x <= 4; x++)
      for (let z = -5; z <= 4; z++) {
        const rim = x === -5 || x === 4 || z === -5 || z === 4;
        if (rim && !((x === -5 || x === 4) && (z === -5 || z === 4))) g.set(x, 6, z, strap);
      }
    for (const x0 of [-3, 1]) {
      g.set(x0, 6, 4, glow(L.goggles)).set(x0 + 1, 6, 4, glow(L.goggles));
      g.set(x0, 7, 4, 0x4a3a2c).set(x0 + 1, 7, 4, 0x4a3a2c);
    }
  }
  return g;
}

/** Hair, painted into the head grid so AO ties it to the skull. */
export function hair(g: Grid, L: Look): void {
  const hs = hairShade(L.hair);
  const base = (): void => {
    g.box(-4, 7, -4, 3, 7, 3, hs);
    g.box(-4, 0, -4, 3, 7, -3, hs);
    g.box(-4, 4, -4, -4, 7, 1, hs);
    g.box(3, 4, -4, 3, 7, 1, hs);
  };
  const fringe = (gap: number, y = 6): void => {
    for (let x = -4; x <= 3; x++) if (x !== gap) g.set(x, y, 3, hs(x, y, 3));
  };
  /** Her side locks: hair falling past the cheeks to `low`, framing the face. */
  const locks = (low: number): void => {
    for (const x of [-4, 3]) for (let y = low; y <= 5; y++) g.set(x, y, 3, hs(x, y, 3));
    g.box(-5, low, -3, -5, 6, 2, hs);
    g.box(4, low, -3, 4, 6, 2, hs);
  };
  switch (L.style) {
    case 'bob': {
      // Short, dark, a fringe swept to one side and a bob to the jaw.
      base();
      fringe(99);
      for (const x of [-4, -3, -2]) g.set(x, 5, 3, hs(x, 5, 3));
      g.box(-4, 8, -3, 2, 8, 1, hs);
      locks(-1);
      g.box(-4, -2, -4, 3, -1, -2, hs);
      g.box(-5, -1, -3, -5, -1, 1, hs);
      g.box(4, -1, -3, 4, -1, 1, hs);
      break;
    }
    case 'cropped': {
      // Clipped close, the hairline high, sides shaved.
      g.box(-4, 7, -4, 3, 7, 3, hs);
      g.box(-4, 3, -4, 3, 7, -4, hs);
      g.box(-4, 6, -3, -4, 7, 2, hs);
      g.box(3, 6, -3, 3, 7, 2, hs);
      g.box(-3, 8, -3, 2, 8, 1, hs);
      break;
    }
    case 'tied': {
      // Long, pale, swept back and tied: the forehead clear, the tail behind.
      base();
      g.box(-4, 8, -4, 3, 8, 2, hs);
      g.set(-4, 6, 3, hs(-4, 6, 3)).set(3, 6, 3, hs(3, 6, 3)).set(2, 6, 3, hs(2, 6, 3));
      g.box(-1, 4, -6, 0, 7, -5, hs);
      for (let y = -9; y < 4; y++) g.set(-1, y, -6, hs(-1, y, -6)).set(0, y, -6, hs(0, y, -6));
      g.box(-2, 3, -6, 1, 3, -5, 0x2a2e34);
      break;
    }
    case 'shaved':
      g.set(-1, 7, 1, mixHex(L.skin, 0xffffff, 0.18)).set(0, 7, 0, mixHex(L.skin, 0xffffff, 0.1));
      break;
    case 'shaggy': {
      // Messy and light: tufts on the crown and at the temples, locks to the
      // chin — and the forehead and eyes kept clear. Silver with real shadow
      // in it, because white hair on pale skin with tufts across the eyes was
      // a face nobody could read.
      base();
      fringe(-1);
      g.set(-4, 5, 3, hs(-4, 5, 3)).set(3, 5, 3, hs(3, 5, 3)).set(2, 5, 3, hs(2, 5, 3));
      locks(0);
      g.set(3, 6, 4, glow(0x3ee0ff)).set(3, 7, 4, glow(0x3ee0ff));
      g.box(-4, -2, -5, 3, -1, -3, hs);
      for (let x = -4; x <= 3; x++) for (let z = -4; z <= 2; z++) if ((x * 3 + z) % 4) g.set(x, 8, z, hs(x, 8, z));
      for (const [x, z] of [[-3, -2], [1, 0], [-1, 1], [2, -3], [3, 1], [-4, 0]]) g.set(x, 9, z, hs(x, 9, z));
      break;
    }
    case 'braids': {
      // Pulled back tight; braids down the back and over one shoulder.
      g.box(-4, 7, -4, 3, 8, 2, hs);
      g.box(-4, 6, 3, 3, 6, 3, hs);
      g.box(-4, 2, -4, 3, 7, -4, hs);
      g.box(-4, 5, -3, -4, 7, 1, hs);
      g.box(3, 5, -3, 3, 7, 1, hs);
      const hi = shade(L.hair, 1.35);
      for (const x of [-4, -2, 0, 2]) for (let y = -9; y < 3; y++) g.set(x, y, -5, (y + x) & 1 ? hs(x, y, -5) : hi);
      for (let y = -6; y < 3; y++) g.set(4, y, -1, y & 1 ? hs(4, y, -1) : hi);
      break;
    }
    case 'mane': {
      // A mane, not a haircut: one mass round the skull with the face cut out
      // of it, spikes thrown up and out, a braid past one ear.
      g.ell(-0.5, 5.5, -0.5, 6, 4.5, 6, (x, y, z) => {
        if (z >= 2 && y <= 5 && x >= -4 && x <= 3) return -1;
        if (y < -1) return -1;
        return hs(x, y, z);
      });
      fringe(99, 6);
      for (const x of [-4, -2, 2, 3]) g.set(x, 5, 3, hs(x, 5, 3));
      for (const x of [-4, 3]) for (let y = 0; y <= 4; y++) g.set(x, y, 3, hs(x, y, 3));
      for (let i = 0; i < 14; i++) {
        const a = hash3(i, 4, 4) * Math.PI * 2;
        const y0 = 7 + Math.floor(hash3(i, 6, 4) * 3);
        for (let k = 0; k < 2 + (i % 3); k++) {
          const r = 5 + k;
          g.set(Math.round(Math.cos(a) * r - 0.5), y0 + k, Math.round(Math.sin(a) * r - 0.5), hs(i, k, 1));
        }
      }
      for (let y = -7; y < 1; y++) g.set(5, y, 1, y & 1 ? hs(5, y, 1) : shade(L.hair, 0.75));
      break;
    }
    case 'straight': {
      // Straight black hair, a blunt fringe right down to the brows, long
      // sides framing her face to the collar.
      base();
      fringe(99, 6);
      fringe(99, 5);
      g.box(-4, 8, -4, 3, 8, 2, hs);
      locks(-5);
      g.box(-5, -6, -4, -5, 7, 3, hs);
      g.box(4, -6, -4, 4, 7, 3, hs);
      g.box(-4, -7, -5, 3, 0, -4, hs);
      break;
    }
  }
  if (L.sensor !== undefined) {
    // A thin band across one temple with a lit pickup by the eye.
    const band = 0x2a3038;
    g.box(5, 3, -2, 5, 6, 2, band);
    g.set(5, 4, 3, glow(L.sensor));
    g.set(4, 3, 4, band).set(3, 3, 4, glow(L.sensor));
  }
  if (L.earring !== undefined) {
    // Hers in both ears; his in one.
    g.set(-6, 2, 0, glow(L.earring));
    if (L.sex === 'f') g.set(5, 2, 0, glow(L.earring));
  }
}

// ------------------------------------------------------------------ bodies

export function body(L: Look): Grid {
  const g = new Grid();
  g.jit = 0.035;
  const f = L.sex === 'f';
  const S = L.suit;
  const SD = shade(S, 0.8);
  const SL = mixHex(S, 0xffffff, 0.12);
  const T = L.trimGlow ? glow(L.trim) : L.trim;
  // His shoulders are a third wider than hers.
  const half = f ? 6 : 8;
  const top = -3;
  g.box(-half, -13, -3, half - 1, top, 2, S);
  for (const x of [-half, half - 1]) for (let z = -3; z <= 2; z++) g.set(x, top, z, null);
  g.box(-half - 1, -13, -2, -half - 1, top - 2, 1, SD);
  g.box(half, -13, -2, half, top - 2, 1, SD);
  const sk = shade(L.skin, 0.9);
  if (f) g.box(-1, top + 1, -1, 0, -1, 0, sk);
  else g.box(-2, top + 1, -2, 1, -1, 1, sk);

  if (f) {
    // Her figure under the suit: two rounded forms and the shadow beneath.
    // Shaded in the suit's own colour: a pale highlight read as pocket patches.
    const hi = mixHex(S, 0xffffff, 0.09);
    const lo = shade(S, 0.66);
    for (const x0 of [-4, 0]) {
      g.box(x0, -9, 3, x0 + 3, -6, 3, S);
      g.box(x0 + 1, -8, 4, x0 + 2, -7, 4, S);
      g.set(x0 + 1, -7, 4, hi).set(x0 + 2, -7, 4, hi);
      g.set(x0, -6, 3, null).set(x0 + 3, -6, 3, null);
      g.box(x0, -10, 3, x0 + 3, -10, 3, lo);
    }
  } else {
    // A flat, broad chest: one plate edge across it.
    g.box(-half + 2, -6, 3, half - 3, -6, 3, SD);
  }

  switch (L.collar) {
    case 'open': {
      // Collar standing up, open at the throat — no further than the throat.
      for (let y = -5; y <= top; y++) {
        const w = y + 6;
        g.box(-w, y, 2, w - 1, y, 2, sk);
      }
      g.box(-3, top, 1, -2, top + 1, 2, T);
      g.box(1, top, 1, 2, top + 1, 2, T);
      g.box(-half + 1, -12, 3, -half + 1, top - 1, 3, T);
      g.box(half - 2, -12, 3, half - 2, top - 1, 3, T);
      break;
    }
    case 'armour': {
      // A high armoured collar, layered plates, piping. The collar stops below
      // the jaw and its piping runs along its foot: lit at jaw height it read
      // as a glowing mask across the mouth.
      g.box(-3, top, -3, 2, -2, 2, SD);
      g.cut(-2, top, -2, 1, -2, 1);
      g.box(-2, top, -2, 1, -2, 1, sk);
      g.box(-4, top, 3, 3, top, 3, T);
      g.box(-half + 1, -5, 3, half - 2, -4, 3, SL);
      g.box(-half + 1, -10, 3, half - 2, -9, 3, SD);
      g.box(-half + 2, -7, 3, half - 3, -7, 3, T);
      break;
    }
    case 'flight': {
      g.box(-3, top, -2, 2, top + 1, 2, S);
      g.box(-1, -13, 3, -1, top, 3, T);
      g.box(-3, top + 1, 3, 2, top + 1, 3, T);
      g.box(-half + 1, -13, 3, -half + 2, top, 3, 0x2a2e33);
      g.box(half - 3, -13, 3, half - 2, top, 3, 0x2a2e33);
      g.box(-half + 1, -9, 4, -half + 2, -8, 4, 0x8a9098);
      g.box(half - 3, -9, 4, half - 2, -8, 4, 0x8a9098);
      break;
    }
    case 'work': {
      g.box(-4, top, -3, 3, top + 1, 2, SD);
      g.cut(-2, top, -2, 1, top + 1, 1);
      g.box(-2, top, -2, 1, top + 1, 1, sk);
      for (let x = 0; x < 3; x++)
        for (let z = -3; z <= 2; z++) {
          g.set(-half + 1 + x, top, z, (x + z) % 2 ? L.trim : 0x1c1814);
          g.set(half - 2 - x, top, z, (x + z) % 2 ? L.trim : 0x1c1814);
        }
      g.box(-5, -13, 3, -4, top - 1, 3, 0x3a2a1c);
      g.box(3, -13, 3, 4, top - 1, 3, 0x3a2a1c);
      g.box(-1, -13, 3, 0, -7, 3, mixHex(S, 0x000000, 0.3));
      break;
    }
    case 'scav': {
      g.box(-2, top, -2, 1, top, 2, L.trim); // choker
      g.set(0, top, 3, glow(0xffb43a));
      for (let y = -5; y < top; y++) {
        const w = y + 6;
        g.box(-w, y, 2, w - 1, y, 2, sk);
      }
      // The mismatched pauldron, big and round, on one shoulder only.
      const P = L.pauldron ?? 0x9c5a28;
      g.ell(-half, top - 1, -0.5, 3.5, 2.5, 3.5, (x, y) => (y >= top ? shade(P, 1.12) : (x + y) % 3 ? P : shade(P, 0.75)));
      g.box(half - 3, top - 1, -2, half - 1, top, 2, 0x3a2a24);
      g.box(-5, -13, 3, -5, -6, 3, 0x2a2020);
      break;
    }
    case 'circuit': {
      g.box(-3, top, -2, 2, top + 1, 2, S);
      g.cut(-1, top, -1, 0, top + 1, 0);
      g.box(-1, top, -1, 0, top + 1, 0, sk);
      const lines: [number, number, number, number][] = [
        [-1, -13, -1, -11], [-1, -11, -5, -11], [-5, -11, -5, top],
        [4, -13, 4, -11], [4, -11, 5, -11], [-2, top + 1, 1, top + 1],
      ];
      for (const [x0, y0, x1, y1] of lines) g.box(x0, y0, 3, x1, y1, 3, T);
      g.box(-half - 1, -7, 0, -half - 1, -7, 1, T);
      g.box(half, -7, 0, half, -7, 1, T);
      break;
    }
  }
  if (L.headset) {
    // Round her neck, not worn: two cups and the band behind.
    const cup = 0x24272e;
    g.box(-4, -2, -1, -3, -1, 1, cup);
    g.box(2, -2, -1, 3, -1, 1, cup);
    g.set(-4, -2, 2, L.trim).set(3, -2, 2, L.trim);
    g.box(-3, -1, -3, 2, -1, -2, cup);
  }
  return g;
}

// ------------------------------------------------------------------ figures

interface Figure {
  root: THREE.Group;
  chest: THREE.Group;
  head: THREE.Group;
  lids: THREE.Group;
  seed: number;
  look: number;
  blink: number;
  shut: number;
  again: number;
}

const MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
const GLOW_M = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });

function meshOf(g: Grid): THREE.Group {
  const out = new THREE.Group();
  const m = meshGrid(g, 1);
  if (m.lit) out.add(new THREE.Mesh(m.lit, MAT));
  if (m.glow) out.add(new THREE.Mesh(m.glow, GLOW_M));
  return out;
}

function figure(L: Look): Figure {
  const root = new THREE.Group();
  const chest = new THREE.Group();
  const headG = new THREE.Group();
  root.add(chest);
  chest.add(meshOf(body(L)));
  chest.add(headG);
  // The head pivots at the top of the neck; its grid's chin row sits at y = 0.
  headG.position.set(0, -0.5, 0);
  const hg = head(L);
  hair(hg, L);
  const hm = meshOf(hg);
  hm.position.set(0, 0.5, 0);
  headG.add(hm);
  // Eyelids, hidden until a blink: skin over each eye, a lash (hers) or a
  // crease (his) along its foot.
  const lids = new THREE.Group();
  const lidM = new THREE.MeshLambertMaterial({ color: shade(L.skin, 0.94) });
  const lashM = new THREE.MeshLambertMaterial({ color: L.sex === 'f' ? LASH : shade(L.skin, 0.62) });
  for (const x0 of [-3, 1]) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 0.12), lidM);
    plate.position.set(x0 + 0.5, 0.5 + 3.5, 3.58);
    const lash = new THREE.Mesh(new THREE.BoxGeometry(L.sex === 'f' ? 2.4 : 2, 0.35, 0.16), lashM);
    lash.position.set(x0 + 0.5, 0.5 + 2.7, 3.62);
    lids.add(plate, lash);
  }
  lids.visible = false;
  headG.add(lids);
  return {
    root,
    chest,
    head: headG,
    lids,
    seed: Math.random() * 100,
    look: 0,
    blink: performance.now() + 800 + Math.random() * 3000,
    shut: 0,
    again: 0,
  };
}

function animate(f: Figure, now: number, turn: number): void {
  const t = now / 1000 + f.seed;
  f.root.rotation.y = turn;
  // Breathing: the chest rises a fraction and the head rides it.
  const br = Math.sin(t * 1.6);
  f.chest.position.y = br * 0.1;
  f.chest.scale.set(1 + br * 0.006, 1 + br * 0.008, 1 + br * 0.008);
  // Looking about: slow drifts, and now and then a glance off to one side.
  const off = Math.sin(t * 0.21) > 0.72 ? 0.42 : Math.sin(t * 0.17 + 2) > 0.8 ? -0.3 : 0;
  f.look += (off - f.look) * 0.12;
  f.head.rotation.y = -0.15 + Math.sin(t * 0.41) * 0.12 + Math.sin(t * 1.3) * 0.025 + f.look;
  f.head.rotation.x = Math.sin(t * 0.33 + 1) * 0.06 - 0.03;
  f.head.rotation.z = Math.sin(t * 0.27) * 0.035;
  // Blinking, every few seconds, now and then twice.
  if (now > f.blink) {
    f.shut = now + 110;
    f.again = Math.random() < 0.25 ? now + 260 : 0;
    f.blink = now + 2200 + Math.random() * 3800;
  }
  f.lids.visible = now < f.shut || (f.again > 0 && now > f.again && now < f.again + 110);
}

// ---------------------------------------------------------------- renderer

/** What a bust surface needs: a 2D canvas to paint into and a way to say it changed. */
export interface BustSurface {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  /** Re-upload after painting (Phaser's CanvasTexture.refresh). */
  refresh(): void;
}

interface Slot {
  look: Look;
  fig: Figure;
  tight: boolean;
  surface: BustSurface;
}

const RENDER = 256;

/**
 * One shared offscreen renderer draws every bust in turn and copies it into
 * that bust's own canvas — Post Parade's arrangement, because WebGL contexts
 * are scarce and sixteen of them would not be.
 */
export class BustRenderer {
  private readonly r: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly wide = new THREE.PerspectiveCamera(30, 1, 1, 200);
  private readonly tight = new THREE.PerspectiveCamera(30, 1, 1, 200);
  private readonly slots = new Map<string, Slot>();

  constructor() {
    THREE.ColorManagement.enabled = false;
    this.r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.r.setClearColor(0x000000, 0);
    this.r.setSize(RENDER, RENDER, false);
    this.r.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.scene.add(new THREE.HemisphereLight(0xdfe6f2, 0x4a3a34, 0.85 * Math.PI));
    const key = new THREE.DirectionalLight(0xfff4e8, 0.7 * Math.PI);
    key.position.set(-14, 18, 30);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fc8ff, 0.5 * Math.PI);
    rim.position.set(20, 8, -24);
    this.scene.add(rim);
    // Framed down to mid-chest on both crops, so the silhouette — shoulders,
    // neck, figure — says as much as the face does. Solved from the vertical
    // span to show, with room above the tallest hair (Rasa's).
    const frame = (cam: THREE.PerspectiveCamera, lo: number, hi: number, side: number): void => {
      const mid = (lo + hi) / 2;
      const dist = (hi - lo) / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
      cam.position.set(side, mid + dist * 0.05, dist);
      cam.lookAt(0, mid, 0);
    };
    frame(this.wide, -12.5, 11.5, 6);
    // The thumbnail is a tighter crop: head, shoulders and the top of the chest.
    frame(this.tight, -10, 10.5, 5);
  }

  /** Registers a surface for pilot `id`. `tight` frames the thumbnail crop. */
  add(key: string, id: string, surface: BustSurface, tight: boolean): void {
    const look = PILOT_LOOKS[id];
    if (!look) return;
    this.slots.set(key, { look, fig: figure(look), tight, surface });
  }

  has(key: string): boolean {
    return this.slots.has(key);
  }

  get keys(): string[] {
    return [...this.slots.keys()];
  }

  /** Draws one bust at time `now` into its surface. */
  draw(key: string, now: number): void {
    const s = this.slots.get(key);
    if (!s) return;
    animate(s.fig, now, 0.42);
    this.scene.add(s.fig.root);
    this.r.render(this.scene, s.tight ? this.tight : this.wide);
    this.scene.remove(s.fig.root);
    const { canvas, context: g } = s.surface;
    const W = canvas.width;
    const H = canvas.height;
    g.clearRect(0, 0, W, H);
    // The plate behind: the pilot's colour as a low glow on night blue, where
    // the painted portraits had their flat dark ground.
    const grad = g.createRadialGradient(W * 0.5, H * 0.42, W * 0.05, W * 0.5, H * 0.5, W * 0.72);
    const c = s.look.bg;
    grad.addColorStop(0, `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},0.55)`);
    grad.addColorStop(0.55, 'rgba(18,22,34,0.96)');
    grad.addColorStop(1, 'rgba(8,10,16,1)');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    // A surface that is not square is filled the way object-fit: cover would,
    // keeping the head toward the top — the select screen's plates are wider
    // than they are tall, and the bust has to fill them edge to edge.
    let sx = 0;
    let sy = 0;
    let sw = RENDER;
    let sh = RENDER;
    if (W > H) {
      sh = (RENDER * H) / W;
      sy = (RENDER - sh) * 0.3;
    } else if (H > W) {
      sw = (RENDER * W) / H;
      sx = (RENDER - sw) / 2;
    }
    g.drawImage(this.r.domElement, sx, sy, sw, sh, 0, 0, W, H);
    s.surface.refresh();
  }

  drawAll(now: number): void {
    for (const k of this.slots.keys()) this.draw(k, now);
  }
}
