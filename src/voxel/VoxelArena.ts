import * as THREE from 'three';
import { Grid, glow, hash3, mixHex, shade, skyDome, voxelObject } from './VoxelKit';
import { PLAY_LEFT, PLAY_RIGHT, PLAY_TOP } from './World';

/**
 * CATHEDRAL YARD, in voxels.
 *
 * An abandoned high-altitude drydock: nobody holds it, the lights still run.
 * `docs/CATHEDRAL_YARD_CONTEXT.md` is the brief and this follows it — cold
 * blue-grey steel, rust, warm sodium lamps, cathedral-scale girders receding
 * into haze, cold void above and the warm storm layer below. Nothing collapsed,
 * nothing overgrown; intact, cold and unused.
 *
 * **Wide on purpose.** KNOCK//BACK's stages are rooms — four walls around a
 * small floor. This one is the opposite: the fight happens in a frame of
 * gantry girders on one deck of a yard that keeps going in every direction, so
 * the deck runs far past both ends of the playable span and far back behind it,
 * the nave columns repeat into the fog, and other yards hang in the haze.
 *
 * The playable rectangle is unchanged — the simulation still clamps machines to
 * it — and the gantry frame is what marks it: two boundary pylons standing just
 * outside each end, joined by a crossbeam above the ceiling, set back behind
 * the fight plane so they never cover a machine.
 */

// ----------------------------------------------------------------- palette

const STEEL = 0x56606c;
const STEEL_DARK = 0x323a45;
const STEEL_LIGHT = 0x7d8794;
const DECK_A = 0x4a525c;
const DECK_B = 0x434b55;
const SEAM = 0x262c34;
const RIVET = 0x6c7682;
const RUST = 0x6e4630;
const RUST_DARK = 0x4a2f22;
const HAZARD_Y = 0xc79a2e;
const HAZARD_K = 0x1c1f24;
const SODIUM = 0xffa346;
const SODIUM_HOT = 0xffd28a;
const COLD_LAMP = 0xbfe4ff;
const LANE = 0x3a4652;

/** World units per arena voxel. Mech voxels are 0.075; the yard is coarser. */
export const AV = 0.5;

export interface ArenaHandle {
  group: THREE.Group;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  /** Per-frame ambient motion: dust, lamp shimmer. */
  update(dt: number, focus: THREE.Vector3): void;
  dispose(): void;
}

/** A lattice girder column: four corner posts, rings and X-bracing. */
function girderColumn(
  g: Grid,
  x0: number,
  z0: number,
  w: number,
  d: number,
  y0: number,
  y1: number,
  col: number,
  brace = 8,
): void {
  const x1 = x0 + w - 1;
  const z1 = z0 + d - 1;
  const post = (x: number, z: number): void => {
    g.box(x, y0, z, x, y1, z, (_x, y) => (y % 13 === 0 ? shade(col, 1.18) : col));
  };
  post(x0, z0);
  post(x1, z0);
  post(x0, z1);
  post(x1, z1);
  for (let y = y0; y <= y1; y += brace) {
    g.box(x0, y, z0, x1, y, z0, shade(col, 0.9));
    g.box(x0, y, z1, x1, y, z1, shade(col, 0.9));
    g.box(x0, y, z0, x0, y, z1, shade(col, 0.9));
    g.box(x1, y, z0, x1, y, z1, shade(col, 0.9));
    const yn = Math.min(y1, y + brace);
    // X-bracing on the front and back faces, a single diagonal on the sides.
    g.line(x0, y, z1, x1, yn, z1, shade(col, 0.82));
    g.line(x1, y, z1, x0, yn, z1, shade(col, 0.82));
    g.line(x0, y, z0, x1, yn, z0, shade(col, 0.75));
    g.line(x0, y, z0, x0, yn, z1, shade(col, 0.78));
    g.line(x1, yn, z0, x1, y, z1, shade(col, 0.78));
  }
}

/** A horizontal box truss along x. */
function trussX(g: Grid, xa: number, xb: number, y: number, z: number, h: number, d: number, col: number): void {
  if (xa > xb) [xa, xb] = [xb, xa];
  g.box(xa, y, z, xb, y, z, col);
  g.box(xa, y + h - 1, z, xb, y + h - 1, z, col);
  g.box(xa, y, z + d - 1, xb, y, z + d - 1, shade(col, 0.85));
  g.box(xa, y + h - 1, z + d - 1, xb, y + h - 1, z + d - 1, shade(col, 0.85));
  for (let x = xa; x < xb; x += h) {
    const xn = Math.min(xb, x + h - 1);
    g.line(x, y, z + d - 1, xn, y + h - 1, z + d - 1, shade(col, 0.8));
    g.line(x, y, z, xn, y + h - 1, z, shade(col, 0.72));
    g.box(x, y, z, x, y + h - 1, z, shade(col, 0.9));
    g.box(x, y, z + d - 1, x, y + h - 1, z + d - 1, shade(col, 0.9));
    g.box(x, y, z, x, y, z + d - 1, shade(col, 0.88));
    g.box(x, y + h - 1, z, x, y + h - 1, z + d - 1, shade(col, 0.88));
  }
}

/** A sodium lamp head with a little hood, centred at (x, y, z). */
function lamp(g: Grid, x: number, y: number, z: number, hot = SODIUM): void {
  g.box(x - 1, y + 1, z - 1, x + 1, y + 1, z + 1, STEEL_DARK);
  g.set(x, y, z, glow(hot));
  g.set(x, y - 1, z, glow(SODIUM_HOT));
}

/** The deck the fight stands on, plus its underside. */
function buildDeck(group: THREE.Group): void {
  const g = new Grid();
  g.jit = 0.035;
  const XA = -150;
  const XB = 149;
  const ZA = -80;
  const ZB = 36;
  const laneZ0 = -4;
  const laneZ1 = 3;
  for (let x = XA; x <= XB; x++) {
    for (let z = ZA; z <= ZB; z++) {
      const px = Math.floor((x + 400) / 8);
      const pz = Math.floor((z + 400) / 8);
      let c = (px + pz) % 2 ? DECK_A : DECK_B;
      // Weathering: plates darken and rust in drifts, never uniformly.
      const w = hash3(px, 7, pz);
      if (w > 0.82) c = mixHex(c, RUST, 0.35);
      else if (w < 0.1) c = shade(c, 0.88);
      if ((x + 400) % 8 === 0 || (z + 400) % 8 === 0) c = SEAM;
      else if (((x + 400) % 8 === 1 || (x + 400) % 8 === 7) && ((z + 400) % 8 === 1 || (z + 400) % 8 === 7)) c = RIVET;
      // The fight lane: a painted band under the plane where the machines are,
      // so a shadow on the deck says where along it the fight is.
      if (z >= laneZ0 && z <= laneZ1) {
        c = z === laneZ0 || z === laneZ1 ? mixHex(HAZARD_Y, SEAM, 0.25) : mixHex(c, LANE, 0.5);
      }
      // Hazard chevrons along the front lip.
      if (z >= ZB - 2) c = Math.floor((x - z + 400) / 3) % 2 ? HAZARD_Y : HAZARD_K;
      g.set(x, -1, z, c);
    }
  }
  // Floor grates: dark lattice squares with sodium spilling up through them.
  for (let i = 0; i < 26; i++) {
    const gx = Math.floor((hash3(i, 3, 11) - 0.5) * 36) * 8 + 1;
    const gz = (Math.floor(hash3(i, 5, 2) * 8) - 9) * 8 + 1;
    if (gz + 6 >= laneZ0 && gz <= laneZ1) continue;
    for (let x = gx; x < gx + 6; x++)
      for (let z = gz; z < gz + 6; z++) g.set(x, -1, z, (x + z) % 2 ? glow(0x6b3a14) : 0x1a1d22);
  }
  const deck = voxelObject(g, AV, { noBottom: true, cast: false });
  deck.position.y = AV * 0.5;
  group.add(deck);

  // The deck's edge: a deep plated lip with a truss under it, and the drop.
  const e = new Grid();
  e.jit = 0.05;
  for (let x = XA; x <= XB; x++) {
    for (let y = -10; y <= -2; y++) {
      const band = y === -2 || y === -10;
      let c = band ? STEEL_LIGHT : (Math.floor((x + 400) / 6) % 2 ? STEEL : STEEL_DARK);
      if (!band && hash3(x, y, 1) > 0.93) c = RUST;
      e.set(x, y, ZB, c);
    }
    if ((x + 400) % 24 === 0) {
      lamp(e, x, -12, ZB, SODIUM);
      e.box(x, -11, ZB, x, -11, ZB, STEEL_DARK);
    }
  }
  trussX(e, XA, XB, -24, ZB - 6, 12, 6, STEEL_DARK);
  // Side rails along the front, low enough to never hide a landed machine.
  for (let x = XA; x <= XB; x += 4) {
    e.box(x, 0, ZB - 1, x, 2, ZB - 1, STEEL);
  }
  e.box(XA, 3, ZB - 1, XB, 3, ZB - 1, STEEL_LIGHT);
  const edge = voxelObject(e, AV, { cast: true });
  edge.position.y = AV * 0.5;
  group.add(edge);
}

/** The gantry frame: pylons just outside each end, a crossbeam over the ceiling. */
function buildGantry(group: THREE.Group): void {
  const g = new Grid();
  g.jit = 0.05;
  const left = Math.round(PLAY_LEFT / AV) - 9;
  const right = Math.round(PLAY_RIGHT / AV) + 2;
  const top = Math.round(PLAY_TOP / AV) + 4;
  const z0 = -16;
  for (const x0 of [left, right]) {
    girderColumn(g, x0, z0, 7, 7, 0, top + 8, STEEL, 9);
    // Base plinth and hazard collar.
    g.box(x0 - 2, 0, z0 - 2, x0 + 8, 2, z0 + 8, (x, _y, z) => ((x + z) % 4 < 2 ? HAZARD_Y : HAZARD_K));
    // Lamp string up the inner face.
    const lx = x0 === left ? x0 + 7 : x0 - 1;
    for (let y = 8; y < top; y += 9) lamp(g, lx, y, z0 + 3, y % 18 === 8 ? SODIUM : COLD_LAMP);
  }
  // The crossbeam: a deep truss joining them above the ceiling.
  trussX(g, left, right + 6, top, z0 - 1, 8, 9, STEEL_DARK);
  // Downlights under it.
  for (let x = left + 12; x < right; x += 14) {
    g.box(x - 1, top - 1, z0 + 2, x + 1, top - 1, z0 + 6, STEEL_DARK);
    g.box(x, top - 2, z0 + 3, x, top - 2, z0 + 5, glow(COLD_LAMP));
  }
  const obj = voxelObject(g, AV);
  obj.position.y = AV * 0.5;
  group.add(obj);
}

/**
 * The nave: rows of enormous girder columns receding into the haze.
 *
 * Built coarse on purpose. These stand 40-90 units behind the fight in fog, so
 * a voxel the size of a machine's head reads the same as a fine one and costs a
 * tenth of the triangles — the first, finer build of this row was 360k of the
 * scene's 615k on its own.
 */
function buildNave(group: THREE.Group): void {
  const NV = 1.2;
  // Near row, behind the deck.
  const g = new Grid();
  g.jit = 0.05;
  for (let i = -3; i <= 3; i++) {
    const x0 = Math.round((i * 29) / NV) - 3;
    girderColumn(g, x0, -40, 5, 5, -38, 64, STEEL_DARK, 7);
    // Rust bleeding down from the joints.
    for (let y = -30; y < 64; y += 14) g.box(x0, y - 2, -36, x0 + 4, y, -36, RUST_DARK);
    lamp(g, x0 + 2, 26 + (i & 1) * 8, -35, SODIUM);
  }
  // Arches between them, high overhead: the nave's vault.
  for (let i = -3; i < 3; i++) {
    const xa = Math.round((i * 29) / NV) + 2;
    const xb = Math.round(((i + 1) * 29) / NV) - 3;
    for (let x = xa; x <= xb; x++) {
      const t = (x - xa) / (xb - xa);
      const y = Math.round(50 + Math.sin(t * Math.PI) * 8);
      g.box(x, y, -40, x, y + 1, -36, STEEL_DARK);
    }
  }
  const near = voxelObject(g, NV, { cast: false });
  group.add(near);

  // Far row, coarser still and lost in fog.
  const f = new Grid();
  f.jit = 0.04;
  for (let i = -4; i <= 4; i++) {
    const x0 = i * 20 - 2;
    girderColumn(f, x0, -50, 4, 4, -30, 50, shade(STEEL_DARK, 0.9), 8);
    if (i % 2 === 0) lamp(f, x0 + 2, 18 + (i & 3) * 3, -45, SODIUM);
  }
  const far = voxelObject(f, 2.4, { cast: false });
  far.position.set(0, 0, -40);
  group.add(far);
}

/** Two empty drydock cradles and a gantry crane, back of the deck. */
function buildCradles(group: THREE.Group): void {
  const g = new Grid();
  g.jit = 0.06;
  const cradle = (cx: number, cz: number, span: number): void => {
    // Base rails.
    g.box(cx - span, 0, cz - 3, cx + span, 2, cz + 3, STEEL_DARK);
    g.box(cx - span, 3, cz - 2, cx + span, 3, cz + 2, HAZARD_K);
    // The arms: tall U-shaped cradle ribs, rusted at the bottom.
    for (const s of [-1, 1]) {
      const ax = cx + s * span;
      for (let y = 0; y < 30; y++) {
        const lean = Math.round(Math.max(0, y - 14) * 0.35) * -s;
        const c = y < 6 ? RUST : y % 7 === 0 ? STEEL_LIGHT : STEEL;
        g.box(ax + lean - 1, y, cz - 2, ax + lean + 1, y, cz + 2, c);
      }
      lamp(g, ax - s * 4, 30, cz, SODIUM);
    }
    // Ribs between them.
    for (let dz = -2; dz <= 2; dz += 4) {
      for (let x = cx - span + 2; x <= cx + span - 2; x++) {
        const t = (x - cx) / span;
        const y = Math.round(4 + t * t * 10);
        g.box(x, y, cz + dz, x, y + 1, cz + dz, STEEL);
      }
    }
  };
  cradle(-74, -46, 20);
  cradle(70, -54, 24);

  // Gantry crane straddling the back of the deck.
  const cz = -66;
  for (const x of [-120, 118]) {
    girderColumn(g, x, cz - 3, 6, 6, 0, 82, STEEL, 8);
  }
  trussX(g, -122, 126, 82, cz - 4, 9, 8, STEEL_DARK);
  // The trolley, parked at one end with its hook run up.
  g.box(-100, 77, cz - 3, -88, 81, cz + 3, shade(HAZARD_Y, 0.7));
  for (let y = 70; y < 77; y++) g.set(-94, y, cz, STEEL_DARK);
  g.box(-96, 66, cz - 2, -92, 70, cz + 2, shade(HAZARD_Y, 0.6));
  lamp(g, -94, 75, cz + 4, SODIUM);

  // Containers and stacked plate stock for scale.
  const stack = (x: number, z: number, w: number, h: number, d: number, col: number): void => {
    g.box(x, 0, z, x + w - 1, h - 1, z + d - 1, (xx, yy) =>
      yy === h - 1 ? shade(col, 1.15) : (xx - x) % 4 === 0 ? shade(col, 0.82) : col,
    );
  };
  stack(-128, -30, 14, 8, 8, 0x3d5a73);
  stack(-126, -30, 10, 6, 8, 0x6b3b2e);
  stack(-140, -44, 8, 14, 8, 0x40525f);
  stack(112, -28, 16, 8, 8, 0x5b4a2c);
  stack(126, -40, 10, 12, 8, 0x3d5a73);
  stack(-34, -72, 18, 6, 6, 0x4b3a33);
  stack(40, -74, 12, 10, 8, 0x40525f);

  // Lamp posts along the back of the deck.
  for (let x = -140; x <= 140; x += 28) {
    g.box(x, 0, -78, x, 14, -78, STEEL_DARK);
    g.box(x, 14, -78, x + 2, 14, -78, STEEL_DARK);
    lamp(g, x + 2, 13, -78, SODIUM);
  }
  const obj = voxelObject(g, AV);
  obj.position.y = AV * 0.5;
  group.add(obj);
}

/** Other yards, hanging in the haze miles off. Silhouettes and a few lights. */
function buildDistantYards(group: THREE.Group): void {
  const g = new Grid();
  g.jit = 0.03;
  const yard = (cx: number, cz: number, w: number, h: number, seed: number): void => {
    const dark = 0x1d232c;
    for (let k = 0; k < 6; k++) {
      const x0 = cx + Math.round((hash3(seed, k, 1) - 0.5) * w);
      const tw = 2 + Math.floor(hash3(seed, k, 2) * 4);
      const th = Math.round(h * (0.5 + hash3(seed, k, 3) * 0.6));
      g.box(x0, -h, cz, x0 + tw, th, cz + tw, dark);
      if (hash3(seed, k, 4) > 0.4) g.set(x0 + 1, th - 2, cz + tw + 1, glow(SODIUM));
    }
    g.box(cx - w / 2, Math.round(h * 0.3), cz + 1, cx + w / 2, Math.round(h * 0.3) + 1, cz + 2, dark);
    g.box(cx - w / 3, Math.round(h * 0.55), cz + 1, cx + w / 4, Math.round(h * 0.55), cz + 2, dark);
    for (let k = 0; k < 8; k++) {
      const lx = cx + Math.round((hash3(seed, k, 9) - 0.5) * w);
      g.set(lx, Math.round(h * 0.3) + 2, cz + 3, glow(k % 3 ? SODIUM : COLD_LAMP));
    }
  };
  yard(-60, -10, 40, 30, 1);
  yard(10, -16, 28, 22, 2);
  yard(70, -8, 50, 34, 3);
  yard(-120, -14, 30, 18, 4);
  yard(130, -12, 34, 26, 5);
  const obj = voxelObject(g, 3.2, { cast: false, receive: false });
  obj.position.set(0, -20, -320);
  group.add(obj);
}

/** The storm layer far below: a warm, glowing floor of cloud. */
function buildStormLayer(group: THREE.Group): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(1600, 1600, 1, 1);
  const tex = radialTexture(['rgba(150,82,38,1)', 'rgba(92,52,30,1)', 'rgba(30,22,24,1)']);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, fog: true }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(0, -140, -200);
  group.add(m);
  return m;
}

function radialTexture(stops: string[]): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d')!;
  const gr = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  stops.forEach((s, i) => gr.addColorStop(i / (stops.length - 1), s));
  x.fillStyle = gr;
  x.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  return t;
}

let GLOW_TEX: THREE.CanvasTexture | null = null;
/** A soft round light blob, shared by every lamp halo and dust mote. */
export function glowTexture(): THREE.CanvasTexture {
  if (GLOW_TEX) return GLOW_TEX;
  GLOW_TEX = radialTexture(['rgba(255,255,255,1)', 'rgba(255,255,255,0.35)', 'rgba(255,255,255,0)']);
  return GLOW_TEX;
}

/** Halos around the brightest lamps, so sodium light reads as light in the haze. */
function buildHalos(group: THREE.Group): void {
  const mat = new THREE.SpriteMaterial({
    map: glowTexture(),
    color: SODIUM,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    opacity: 0.35,
    fog: true,
  });
  const spots: [number, number, number, number][] = [];
  for (let x = -140; x <= 140; x += 28) spots.push([(x + 2) * AV, 13 * AV, -78 * AV, 2.2]);
  for (let i = -3; i <= 3; i++) {
    const x0 = Math.round((i * 29) / 1.2) - 3;
    spots.push([(x0 + 2) * 1.2, (26 + (i & 1) * 8) * 1.2, -35 * 1.2 + 0.6, 5]);
  }
  spots.push([-74 * AV - 8, 30 * AV, -46 * AV, 3], [-74 * AV + 8, 30 * AV, -46 * AV, 3]);
  spots.push([70 * AV - 10, 30 * AV, -54 * AV, 3], [70 * AV + 10, 30 * AV, -54 * AV, 3]);
  for (const [x, y, z, s] of spots) {
    const sp = new THREE.Sprite(mat);
    sp.position.set(x, y, z);
    sp.scale.setScalar(s);
    group.add(sp);
  }
}

/** Dust drifting through the light, around wherever the fight is. */
function buildDust(group: THREE.Group): { pts: THREE.Points; vel: Float32Array } {
  const N = 420;
  const pos = new Float32Array(N * 3);
  const vel = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 90;
    pos[i * 3 + 1] = Math.random() * 40;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 50 - 6;
    vel[i * 3] = 0.25 + Math.random() * 0.4;
    vel[i * 3 + 1] = (Math.random() - 0.6) * 0.15;
    vel[i * 3 + 2] = (Math.random() - 0.5) * 0.1;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.16,
    map: glowTexture(),
    color: 0xd8c4a6,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  group.add(pts);
  return { pts, vel };
}

const SKY_TOP = 0x03050b;
const SKY_MID = 0x1b2230;
const SKY_LOW = 0x5a3a24;
const FOG = 0x1c222c;

/** Builds the whole yard into `scene`. */
export function buildArena(scene: THREE.Scene): ArenaHandle {
  const group = new THREE.Group();
  group.name = 'cathedral-yard';
  scene.add(group);
  scene.fog = new THREE.Fog(FOG, 70, 330);
  scene.background = new THREE.Color(SKY_MID);
  const sky = skyDome(900, SKY_TOP, SKY_MID, SKY_LOW);
  group.add(sky);

  // Cold key from above and in front, warm sodium fill rising from below.
  // Three's lights are physically scaled now, so KNOCK//BACK-style legacy
  // numbers are written here times pi. The totals are lower than that game's
  // daylight rooms on purpose: this is a night dock, and the machines' own
  // light armour is what keeps them readable against it.
  const hemi = new THREE.HemisphereLight(0x9fb2d0, 0x5a3a24, 0.55 * Math.PI);
  group.add(hemi);
  const sun = new THREE.DirectionalLight(0xdde8ff, 0.72 * Math.PI);
  sun.position.set(-14, 34, 26);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 120 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  group.add(sun);
  group.add(sun.target);
  // The sodium spill on the deck, from lamps the player can see.
  const warmL = new THREE.PointLight(SODIUM, 26, 60, 1.6);
  warmL.position.set(PLAY_LEFT - 2, 6, -6);
  const warmR = new THREE.PointLight(SODIUM, 26, 60, 1.6);
  warmR.position.set(PLAY_RIGHT + 2, 6, -6);
  group.add(warmL, warmR);

  buildDeck(group);
  buildGantry(group);
  buildNave(group);
  buildCradles(group);
  buildDistantYards(group);
  buildStormLayer(group);
  buildHalos(group);
  const dust = buildDust(group);

  let t = 0;
  return {
    group,
    sun,
    hemi,
    update(dt: number, focus: THREE.Vector3): void {
      t += dt;
      // The shadow box follows the fight, so a 48-unit map stays sharp on a
      // yard several hundred units wide.
      sun.target.position.set(focus.x, 0, 0);
      sun.position.set(focus.x - 14, 34, 26);
      const pos = dust.pts.geometry.attributes.position as THREE.BufferAttribute;
      const a = pos.array as Float32Array;
      for (let i = 0; i < a.length; i += 3) {
        a[i] += dust.vel[i] * dt;
        a[i + 1] += dust.vel[i + 1] * dt + Math.sin(t * 0.7 + i) * 0.002;
        a[i + 2] += dust.vel[i + 2] * dt;
        if (a[i] > focus.x + 50) a[i] -= 100;
        if (a[i] < focus.x - 50) a[i] += 100;
        if (a[i + 1] < -2) a[i + 1] += 40;
        if (a[i + 1] > 42) a[i + 1] -= 40;
      }
      pos.needsUpdate = true;
      warmL.intensity = 26 * (0.94 + Math.sin(t * 11.3) * 0.03 + Math.sin(t * 3.1) * 0.03);
      warmR.intensity = 26 * (0.94 + Math.sin(t * 9.7 + 1) * 0.03 + Math.sin(t * 2.3) * 0.03);
    },
    dispose(): void {
      scene.remove(group);
      scene.fog = null;
      group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
      });
    },
  };
}
