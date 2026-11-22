import * as THREE from 'three';
import { Grid, glow, meshGrid, mixHex, shade } from './VoxelKit';
import { PILOT_LOOKS, hair, head, type Look } from './PilotBusts';

/**
 * A person on foot: built the way the owner's **Post Parade** builds its
 * people, jointed the way **Zenless Voxel** joints its fighters.
 *
 * The first figure here was the portrait bust given legs, and the owner said
 * so: it was built at the bust's chest width and read as a block. Post
 * Parade's figure (`race/voxel.js`, `buildTrainer*`) is small and clean — an
 * eight-voxel head on a **six-wide, six-tall torso**, a ten-voxel shoulder
 * span, **two-by-two limbs**, 26 voxels to the crown at 0.067 m a voxel
 * (1.74 m), one merged mesh per part, no colour jitter. Sex reads from the
 * face, the hair and the clothes, never from a wider body.
 *
 * **The head is the bust's head**, voxel for voxel: Post Parade's head is the
 * one the approved busts were built on, so the faces the owner signed off on
 * walk around unchanged.
 *
 * The joints are Zenless Voxel's (`models-base.js`, `anim.js`): hips →
 * thighs → shins and hips → torso → head / upper arms → forearms, limbs cut
 * straight across with the joint row centred on its pivot so a knee or an
 * elbow closes on the inside of the bend; the hip rows sit buried in the
 * pelvis so the hip never shows a seam. The walk is Zenless's too — the stance
 * leg sweeps back at an even ground speed and the stride is tied to distance
 * covered, so planted feet stay planted.
 *
 * Coordinates below are **voxel rows above the soles**, Post Parade's
 * convention: row r fills r..r+1 (the kit meshes with a half-voxel offset to
 * match). +z is the front, +x is the figure's own left.
 */

/** Post Parade's trainer scale: 26 voxels = 1.74 m. */
export const FIGURE_VOXEL = 0.067;
const HIP = 8.5;
const KNEE = 4.5;
const WAIST = 11;
const NECK = 18;
const SHOULDER = 17;
const ELBOW = 13.5;
const LEG_LEN = HIP * FIGURE_VOXEL;

export interface PilotFigure {
  root: THREE.Group;
  /** Scaled by `FIGURE_VOXEL`; the whole body hangs off it. */
  rig: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  foreL: THREE.Group;
  foreR: THREE.Group;
  thighL: THREE.Group;
  thighR: THREE.Group;
  shinL: THREE.Group;
  shinR: THREE.Group;
  /** Metres from the soles to the crown. */
  height: number;
  look: Look;
  /** Gait phase, radians; advanced by distance walked. */
  phase: number;
  seed: number;
}

const MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
const GLOW_M = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });

/** One part's mesh, Post Parade's corner convention (row r fills r..r+1). */
function meshOf(g: Grid): THREE.Group {
  const out = new THREE.Group();
  const m = meshGrid(g, 1, { offset: [0.5, 0.5, 0.5], jitter: 0 });
  if (m.lit) {
    const mesh = new THREE.Mesh(m.lit, MAT);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    out.add(mesh);
  }
  if (m.glow) out.add(new THREE.Mesh(m.glow, GLOW_M));
  return out;
}

/** A joint: a group at `pivot` (absolute rows) inside a parent at `parentPivot`. */
function joint(parent: THREE.Object3D, pivot: [number, number, number], parentPivot: [number, number, number]): THREE.Group {
  const j = new THREE.Group();
  j.position.set(pivot[0] - parentPivot[0], pivot[1] - parentPivot[1], pivot[2] - parentPivot[2]);
  parent.add(j);
  return j;
}

/** Hangs a part's mesh (built in absolute rows) off its joint. */
function hang(j: THREE.Group, g: Grid, pivot: [number, number, number], shiftX = 0): void {
  const m = meshOf(g);
  m.position.set(-pivot[0] + shiftX, -pivot[1], -pivot[2]);
  j.add(m);
}

const plain = (): Grid => {
  const g = new Grid();
  g.jit = 0;
  return g;
};

// ------------------------------------------------------------------- parts

/** Pelvis, rows 8..10: the seat of the suit and a belt. */
function pelvis(L: Look): Grid {
  const g = plain();
  const SD = shade(L.suit, 0.82);
  g.box(-3, 8, -2, 2, 9, 1, SD);
  g.box(-3, 10, -2, 2, 10, 1, mixHex(L.under, 0x000000, 0.1));
  // A buckle in the trim, front and centre.
  g.set(-1, 10, 1, L.trimGlow ? glow(L.trim) : L.trim).set(0, 10, 1, L.trimGlow ? glow(L.trim) : L.trim);
  return g;
}

/** Torso, rows 11..16, the neck at 17, and a hidden waist core in row 10. */
function torso(L: Look): Grid {
  const g = plain();
  const S = L.suit;
  const SD = shade(S, 0.8);
  const SL = mixHex(S, 0xffffff, 0.12);
  const T = L.trimGlow ? glow(L.trim) : L.trim;
  const skin = L.skin;
  g.box(-2, 10, -1, 1, 10, 0, SD);
  g.box(-3, 11, -2, 2, 16, 1, S);
  g.box(-3, 11, -2, 2, 11, 1, mixHex(L.under, S, 0.4));
  g.box(-1, 17, -1, 0, 17, 0, shade(skin, 0.92));
  switch (L.collar) {
    case 'open':
      // Collar open at the throat, piping down both sides of the front.
      g.set(-1, 16, 1, skin).set(0, 16, 1, skin).set(-1, 15, 1, shade(skin, 0.92)).set(0, 15, 1, shade(skin, 0.92));
      g.box(-3, 12, 1, -3, 15, 1, T);
      g.box(2, 12, 1, 2, 15, 1, T);
      g.set(-2, 16, 1, SL).set(1, 16, 1, SL);
      break;
    case 'armour':
      // A raised armoured collar over the neck, shoulder plates and a band of light.
      g.box(-2, 17, -2, 1, 17, 1, SD);
      g.set(-1, 17, 1, shade(skin, 0.9)).set(0, 17, 1, shade(skin, 0.9));
      g.box(-3, 16, -2, -3, 16, 1, SL);
      g.box(2, 16, -2, 2, 16, 1, SL);
      g.box(-3, 14, 1, 2, 14, 1, T);
      g.box(-3, 12, 1, 2, 12, 1, SD);
      break;
    case 'flight':
      // A zip down the front, harness straps either side.
      g.box(-1, 11, 1, -1, 16, 1, T);
      g.box(-3, 11, 1, -3, 16, 1, SD);
      g.box(2, 11, 1, 2, 16, 1, SD);
      g.set(0, 16, 1, S);
      break;
    case 'work':
      // Hazard striping across the shoulders, a dark chest pocket.
      for (let x = -3; x <= 2; x++) g.set(x, 16, 1, (x & 1) === 0 ? L.trim : 0x1c1814).set(x, 16, -2, (x & 1) === 0 ? L.trim : 0x1c1814);
      g.box(0, 13, 1, 1, 14, 1, SD);
      g.box(-3, 11, 1, -3, 15, 1, SD);
      break;
    case 'scav':
      // A choker with an amber stone; patched panels.
      g.box(-1, 17, -1, 0, 17, 0, L.trim);
      g.set(0, 17, 0, glow(0xffb43a));
      g.set(-1, 16, 1, skin).set(0, 16, 1, skin);
      g.box(-3, 12, 1, -2, 13, 1, SD);
      g.set(1, 14, 1, mixHex(S, 0x2a2020, 0.5));
      break;
    case 'circuit':
      // Glowing traces on the slate.
      for (const [x0, y0, x1, y1] of [[-2, 11, -2, 14], [-2, 14, 1, 14], [1, 14, 1, 16], [-3, 12, -3, 12], [2, 11, 2, 13]] as const) {
        g.box(x0, y0, 1, x1, y1, 1, T);
      }
      break;
  }
  if (L.headset) {
    // Worn round the neck: two cups and the band behind.
    g.set(-2, 17, 0, 0x24272e).set(1, 17, 0, 0x24272e).set(-2, 17, -1, 0x24272e).set(1, 17, -1, 0x24272e);
  }
  return g;
}

/** Upper arm, rows 14..16 at x ±[3,5]. `side` +1 is the figure's left. */
function upperArm(L: Look, side: 1 | -1): Grid {
  const g = plain();
  const x0 = side > 0 ? 3 : -5;
  g.box(x0, 14, -1, x0 + 1, 16, 0, L.suit);
  if (L.collar === 'armour') g.box(x0, 16, -1, x0 + 1, 16, 0, mixHex(L.suit, 0xffffff, 0.12));
  // The one big mismatched pauldron, on one shoulder only.
  if (L.pauldron && side > 0) {
    const P = L.pauldron;
    g.box(x0 - 1, 15, -2, x0 + 2, 17, 1, (x, y) => (y === 17 ? shade(P, 1.12) : (x + y) % 3 ? P : shade(P, 0.75)));
  }
  return g;
}

/** Forearm, rows 11..13: sleeve, cuff, hand. Joint row 13 sits on the elbow. */
function foreArm(L: Look, side: 1 | -1): Grid {
  const g = plain();
  const x0 = side > 0 ? 3 : -5;
  const gloved = L.collar === 'armour' || L.collar === 'work' || L.collar === 'scav';
  g.box(x0, 13, -1, x0 + 1, 13, 0, L.suit);
  g.box(x0, 12, -1, x0 + 1, 12, 0, L.trimGlow ? glow(L.trim) : L.trim);
  g.box(x0, 11, -1, x0 + 1, 11, 0, gloved ? mixHex(L.under, 0x202020, 0.3) : L.skin);
  return g;
}

/** Thigh, rows 5..8 (row 8 buried in the pelvis). */
function thigh(L: Look, side: 1 | -1): Grid {
  const g = plain();
  const x0 = side > 0 ? 0 : -2;
  const legCol = L.collar === 'flight' || L.collar === 'open' || L.collar === 'circuit' ? L.suit : shade(L.suit, 0.88);
  g.box(x0, 5, -1, x0 + 1, 8, 0, legCol);
  return g;
}

/** Shin, rows 0..4: the knee row, the shin, boots and a toe. */
function shin(L: Look, side: 1 | -1): Grid {
  const g = plain();
  const x0 = side > 0 ? 0 : -2;
  const boot = mixHex(L.under, 0x000000, 0.25);
  const legCol = L.collar === 'flight' || L.collar === 'open' || L.collar === 'circuit' ? L.suit : shade(L.suit, 0.88);
  g.box(x0, 3, -1, x0 + 1, 4, 0, legCol);
  // A knee plate in the trim, so a stride reads.
  g.box(x0, 4, 0, x0 + 1, 4, 0, L.trimGlow ? glow(L.trim) : L.trim);
  g.box(x0, 1, -1, x0 + 1, 2, 0, boot);
  g.box(x0, 0, -1, x0 + 1, 0, 0, shade(boot, 0.8));
  g.box(x0, 0, 1, x0 + 1, 0, 1, shade(boot, 0.8));
  return g;
}

// ------------------------------------------------------------------- extras

const EXTRA_SKIN = [0xf2c6a4, 0xe0b092, 0xc8946e, 0xa87256, 0x8a5a40, 0x6e4630, 0xf4d2bc];
const EXTRA_HAIR = [0x1d1a18, 0x3a2a1c, 0x6a4a2c, 0xb8a080, 0x8a8a90, 0x2a2a34, 0x5a2a1a];
const EXTRA_EYES = [0x3d6a8c, 0x4a3a2a, 0x2a5a3a, 0x6a5a3a, 0x3a3a44];
const STYLES_F = ['bob', 'tied', 'straight', 'braids'] as const;
const STYLES_M = ['cropped', 'shaved', 'shaggy', 'cropped'] as const;

/**
 * A face for someone who is not one of the eight: crews, stewards, brokers.
 * Varied by `seed`, and kept plain — no monocles, goggles, scars or sensors,
 * the marks that make a pilot recognisable — so an extra is never mistaken for
 * a pilot at a glance.
 */
export function extraLook(sex: 'f' | 'm', seed: number, suit?: number, trim?: number): Partial<Look> {
  const pick = <T,>(a: readonly T[], k: number): T => a[Math.abs(Math.floor(seed * 7 + k * 13)) % a.length];
  return {
    sex,
    skin: pick(EXTRA_SKIN, 1),
    hair: pick(EXTRA_HAIR, 2),
    style: sex === 'f' ? pick(STYLES_F, 3) : pick(STYLES_M, 3),
    eyes: pick(EXTRA_EYES, 4),
    mouth: (['flat', 'smile', 'flat', 'smirk'] as const)[seed % 4],
    suit: suit ?? 0x3a4250,
    trim: trim ?? 0x8a96a6,
    trimGlow: false,
    under: 0x181a20,
    collar: sex === 'f' ? 'open' : 'work',
    headset: false,
    scar: false,
    frown: false,
    monocle: undefined,
    goggles: undefined,
    beard: sex === 'm' && seed % 3 === 0 ? pick(EXTRA_HAIR, 2) : undefined,
    stubble: sex === 'm' && seed % 3 === 1,
    soot: false,
    sensor: undefined,
    earring: undefined,
    pauldron: undefined,
  };
}

// --------------------------------------------------------------------- rig

/**
 * Builds a person on foot. `id` is the mech id the pilot belongs to
 * (`halcyon`, `nocturne` ...), the key `PILOT_LOOKS` uses.
 */
export function pilotFigure(id: string, scale = FIGURE_VOXEL, override?: Partial<Look>): PilotFigure {
  const base = PILOT_LOOKS[id] ?? PILOT_LOOKS.halcyon;
  const L: Look = { ...base, ...(override ?? {}) };
  const root = new THREE.Group();
  const rig = new THREE.Group();
  rig.scale.setScalar(scale);
  root.add(rig);
  const O: [number, number, number] = [0, 0, 0];

  const hipsP: [number, number, number] = [0, HIP, 0];
  const hips = joint(rig, hipsP, O);
  hang(hips, pelvis(L), hipsP);

  const thP = (s: 1 | -1): [number, number, number] => [s * 1.05, HIP, 0];
  const shP = (s: 1 | -1): [number, number, number] => [s * 1.05, KNEE, 0];
  const thighL = joint(hips, thP(1), hipsP);
  const thighR = joint(hips, thP(-1), hipsP);
  hang(thighL, thigh(L, 1), thP(1), 0.05);
  hang(thighR, thigh(L, -1), thP(-1), -0.05);
  const shinL = joint(thighL, shP(1), thP(1));
  const shinR = joint(thighR, shP(-1), thP(-1));
  hang(shinL, shin(L, 1), shP(1), 0.05);
  hang(shinR, shin(L, -1), shP(-1), -0.05);

  const toP: [number, number, number] = [0, WAIST, 0];
  const torsoJ = joint(hips, toP, hipsP);
  hang(torsoJ, torso(L), toP);

  // The bust's own head: chin row 0 sits on the neck pivot.
  const hdP: [number, number, number] = [0, NECK, 0];
  const headJ = joint(torsoJ, hdP, toP);
  const hg = head(L);
  hair(hg, L);
  hg.jit = 0;
  headJ.add(meshOf(hg));

  const shoP = (s: 1 | -1): [number, number, number] => [s * 4, SHOULDER, 0];
  const elbP = (s: 1 | -1): [number, number, number] => [s * 4, ELBOW, 0];
  const armL = joint(torsoJ, shoP(1), toP);
  const armR = joint(torsoJ, shoP(-1), toP);
  hang(armL, upperArm(L, 1), shoP(1));
  hang(armR, upperArm(L, -1), shoP(-1));
  const foreL = joint(armL, elbP(1), shoP(1));
  const foreR = joint(armR, elbP(-1), shoP(-1));
  hang(foreL, foreArm(L, 1), elbP(1));
  hang(foreR, foreArm(L, -1), elbP(-1));

  return {
    root,
    rig,
    hips,
    torso: torsoJ,
    head: headJ,
    armL,
    armR,
    foreL,
    foreR,
    thighL,
    thighR,
    shinL,
    shinR,
    height: 26 * scale,
    look: L,
    phase: 0,
    seed: (id.length * 1.7 + (L.skin % 97)) % 6.28,
  };
}

// --------------------------------------------------------------- animation

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Zenless Voxel's gait: how far each leg swings, and how long it stands. */
export function gait(speed: number): { amp: number; duty: number; run: number } {
  const run = clamp((speed - 1.6) / 2.6, 0, 1);
  return { amp: clamp(0.3 + 0.17 * speed, 0.42, 1.06), duty: 0.62 - 0.22 * run, run };
}

/**
 * The thigh's swing at a point `u` (0..1) of the cycle: in stance the foot
 * sweeps back at an even ground speed (linear in sin θ); in swing it comes
 * forward on a smoothstep.
 */
export function legAngle(u: number, G: { amp: number; duty: number }): number {
  const X = Math.sin(G.amp);
  if (u < G.duty) return Math.asin(clamp(X - (2 * X * u) / G.duty, -1, 1));
  const k = (u - G.duty) / (1 - G.duty);
  return Math.asin(clamp(-X + 2 * X * k * k * (3 - 2 * k), -1, 1));
}

/** Eases a joint's x/y/z rotation toward a target at `rate` per second. */
function ease(o: THREE.Object3D, x: number, y: number, z: number, k: number): void {
  o.rotation.x += (x - o.rotation.x) * k;
  o.rotation.y += (y - o.rotation.y) * k;
  o.rotation.z += (z - o.rotation.z) * k;
}

/**
 * Poses a figure for one frame. `speed` is ground speed in m/s; the gait phase
 * advances by distance covered so the feet do not slide. `t` is seconds, for
 * breathing and the idle look-about.
 */
export function animateFigure(f: PilotFigure, speed: number, dt: number, t: number): void {
  const G = gait(speed);
  const moving = speed > 0.15;
  if (moving) f.phase += (speed * dt * Math.PI * G.duty) / (Math.sin(G.amp) * LEG_LEN);
  else f.phase = 0;
  const u = ((f.phase / (Math.PI * 2)) % 1 + 1) % 1;
  const run = G.run;
  const w = moving ? 0.6 + 0.4 * run : 0;
  const thL = moving ? legAngle(u, G) : 0;
  const thR = moving ? legAngle((u + 0.5) % 1, G) : 0;
  const armGain = 0.55 + 0.3 * run;

  const kBody = 1 - Math.exp(-(moving ? 24 : 12) * dt);
  const kLeg = 1 - Math.exp(-(moving ? 60 : 12) * dt);

  // Legs: the thigh swings, the knee bends behind (more when running).
  const knee = (th: number): number => clamp(th > 0 ? th * 0.85 : -th * (run > 0.5 ? 1.6 : 0.6), 0, 2.4);
  ease(f.thighL, -thL, 0, 0.02, kLeg);
  ease(f.thighR, -thR, 0, -0.02, kLeg);
  ease(f.shinL, knee(thL), 0, 0, kLeg);
  ease(f.shinR, knee(thR), 0, 0, kLeg);

  // Arms swing against the legs; elbows bend forward, more at a run.
  const armX = (th: number): number => lerp(-0.04, th * armGain - 0.05 - 0.25 * run, w);
  const aL = armX(thL);
  const aR = armX(thR);
  ease(f.armL, aL, 0, 0.1, kBody);
  ease(f.armR, aR, 0, -0.1, kBody);
  const elbow = (a: number): number => (moving ? 0.55 + Math.max(0, -a) * 0.5 : 0.2 + Math.max(0, -a) * 0.6);
  ease(f.foreL, -clamp(elbow(aL), 0, 2.3), 0, 0, kBody);
  ease(f.foreR, -clamp(elbow(aR), 0, 2.3), 0, 0, kBody);

  // The body leans into a run; the head levels against it; breathing at rest.
  const breathe = Math.sin(t * 2.6 + f.seed);
  ease(f.torso, lerp(0.02, 0.03 + 0.17 * run, w) + breathe * 0.02 * (1 - w), 0, 0, kBody);
  ease(f.head, -0.1 * run * w, moving ? 0 : Math.sin(t * 0.7 + f.seed) * 0.12, 0, kBody);

  // Hips bob over each step; a breath's rise at rest. Metres, so in rig units.
  const bob = moving ? Math.abs(Math.cos(f.phase)) * (0.025 + 0.035 * run) : breathe * 0.012;
  f.hips.position.y = HIP + bob / FIGURE_VOXEL;
}
