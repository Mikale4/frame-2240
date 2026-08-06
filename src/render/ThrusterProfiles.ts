/**
 * How each builder's thrusters burn.
 *
 * **Keyed on faction, not on chassis.** Five powers build these machines and
 * each builds them their own way, so exhaust is a *manufacturer* signature —
 * HALCYON and VESPER are both Concord AV airframes and should burn identically,
 * while TERRAMOTH and OBELISK are both Ironwake plant and should burn like it.
 * Colour and size are already per-machine (`tint.thruster`, `rig.scale`); this
 * is the behaviour underneath them.
 *
 * Every profile is drawn from what the Archive already says about its builder:
 *
 * * **CONCORD SKYWARD** — "committee designs subjected to extended trials,
 *   broad standardisation and revisions intended to remove unusual behaviour
 *   before issue." The cleanest burn on the roster: tight, narrow, even, and
 *   completely regular. Nothing about a Concord frame is interesting on purpose.
 * * **EMBERLINE PACT** — Concord airframes "rebuilt to Pact standards and
 *   returned to service without Concord certification." So: the Concord profile
 *   with the tolerances gone. Same bones, wider spread, uneven timing, and it
 *   sputters. NOCTURNE should look like a good engine somebody fixed in a shed.
 * * **IRONWAKE COLLIERY** — excavation walkers with guns bolted on, filed under
 *   equipment operation. Heavy industrial exhaust: fewer, fatter, shorter
 *   columns rather than quills. It has mass.
 * * **FREE LATITUDE** — "assembled from salvage, copied patterns and recovered
 *   systems. **Individual machines differ substantially.**" That line is the
 *   profile: the longest, thinnest fan on the roster and *irregular by nature*.
 *   The jitter is high precisely so no two frames of it look alike — which is
 *   how one shared profile still honours a faction defined by nothing matching.
 * * **ASHFALL IRREGULARS** — a contract force that prices hull loss as a line
 *   item, flying scavenged kit. It burns: short, hot, chaotic, throwing embers.
 */

/**
 * ---------------------------------------------------------------------------
 * What a rocket booster looks like, and the two wrong turns before this one.
 * ---------------------------------------------------------------------------
 *
 * Mecha exhaust — Gundam and everything downstream of it — is a **coherent
 * tapering cone**: widest where it leaves the engine bell, narrowing to a point
 * behind, with a shorter white-hot core inside it and a round bloom at the
 * mouth. It flickers in *length and brightness*; the silhouette stays stable.
 * That coherence is the whole read. Anything that changes shape every frame
 * stops being a flame.
 *
 * Two earlier passes got this wrong in different directions:
 *
 * 1. **A particle spray.** One to four soft blobs per nozzle, flying off with
 *    velocity and drag, shrinking to nothing. That is smoke, not thrust.
 * 2. **A fan of rays.** Read off the parallel streaks in the 2005 screenshots —
 *    but those streaks are the *speed-line trail* running beside the machine,
 *    not the flame. Built as the exhaust itself, with per-ray random angle,
 *    length and alpha, it composited into visual noise rather than a plume.
 *
 * So these fields describe **layered cones**: an outer flame in the machine's
 * colour, a hot core inside it, a bloom at the mouth. Per-faction character is
 * proportion and flicker — how long, how wide, how steady — not randomness.
 */
export interface ThrusterFx {
  /** Outer flame length, as a scale on the 160px plume sprite: base and burn. */
  flameLen: number;
  flameLenHot: number;
  /** Outer flame width, relative to its own length. Fatter reads heavier. */
  flameWide: number;
  /**
   * Hot core, as a fraction of the outer flame.
   *
   * Always shorter and narrower — it is the luminous centre sitting *inside*
   * the flame, and a core that reaches the tail erases the taper it lives in.
   */
  coreLen: number;
  coreWide: number;
  /** Bloom size at the engine mouth, relative to flame width. */
  bloom: number;
  /** Opacity of the outer flame, base and burn ramp. */
  alpha: number;
  alphaHot: number;
  /**
   * Frame-to-frame length wobble, 0..1.
   *
   * **The only randomness that survives.** A flame pulses; it does not change
   * shape. This scales length and brightness a little each frame and touches
   * nothing else, which is what keeps the silhouette readable.
   */
  flicker: number;
  /**
   * Trailing wisps shed behind the plume at high burn. 0 for none.
   *
   * The speed lines the 2005 screenshots actually show — kept, but as what they
   * are: a trail *behind* a flame, not the flame.
   */
  wisps: number;
  /** Embers thrown per emission at full burn. 0 for none. */
  embers: number;
  /** Power above which the core burns white rather than tinted. 1 disables it. */
  whiteAt: number;
}

const CONCORD: ThrusterFx = {
  // Standardised and even. The tidiest burn on the roster: a clean bell, a
  // steady core, almost no wobble.
  flameLen: 0.348,
  flameLenHot: 0.59,
  flameWide: 0.405,
  coreLen: 0.52,
  coreWide: 0.44,
  bloom: 0.961,
  alpha: 0.52,
  alphaHot: 0.34,
  flicker: 0.08,
  wisps: 2,
  embers: 0,
  whiteAt: 0.341,
};

const EMBERLINE: ThrusterFx = {
  ...CONCORD,
  // The same engine with the tolerances gone: it surges, and it spits.
  flameLen: 0.325,
  flameLenHot: 0.55,
  flameWide: 0.475,
  flicker: 0.26,
  wisps: 2,
  embers: 2,
  whiteAt: 0.384,
};

const IRONWAKE: ThrusterFx = {
  // Excavation plant. A short, fat, heavy bell — it has mass, and mass does
  // not throw a needle.
  flameLen: 0.269,
  flameLenHot: 0.438,
  flameWide: 0.634,
  coreLen: 0.46,
  coreWide: 0.56,
  bloom: 1.209,
  alpha: 0.48,
  alphaHot: 0.30,
  flicker: 0.12,
  wisps: 1,
  embers: 1,
  whiteAt: 0.434,
};

const LATITUDE: ThrusterFx = {
  // Salvage, and "individual machines differ substantially". The longest and
  // narrowest plume, and the least steady — the flicker is the highest here so
  // no two seconds of it burn quite alike.
  flameLen: 0.415,
  flameLenHot: 0.742,
  flameWide: 0.299,
  coreLen: 0.58,
  coreWide: 0.40,
  bloom: 0.806,
  alpha: 0.54,
  alphaHot: 0.36,
  flicker: 0.30,
  wisps: 3,
  embers: 0,
  whiteAt: 0.31,
};

const ASHFALL: ThrusterFx = {
  // Scavenged kit, priced for replacement. Short, wide, hot and unstable, and
  // the only profile that throws sparks at any power.
  flameLen: 0.303,
  flameLenHot: 0.517,
  flameWide: 0.563,
  coreLen: 0.50,
  coreWide: 0.52,
  bloom: 1.116,
  alpha: 0.52,
  alphaHot: 0.36,
  flicker: 0.34,
  wisps: 2,
  embers: 4,
  whiteAt: 0.285,
};

const BY_FACTION: Record<string, ThrusterFx> = {
  'CONCORD SKYWARD': CONCORD,
  'EMBERLINE PACT': EMBERLINE,
  'IRONWAKE COLLIERY': IRONWAKE,
  'FREE LATITUDE': LATITUDE,
  'ASHFALL IRREGULARS': ASHFALL,
};

/**
 * The profile for a faction, falling back to the Concord one.
 *
 * Concord is the fallback rather than a neutral default because it *is* the
 * neutral design — the standardised committee airframe every other builder is
 * a deviation from.
 */
export function thrusterFxFor(faction: string): ThrusterFx {
  return BY_FACTION[faction] ?? CONCORD;
}
