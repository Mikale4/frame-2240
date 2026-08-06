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
 *   equipment operation. Heavy industrial exhaust: fat, slow, long-lived,
 *   billowing rather than streaming. It has mass.
 * * **FREE LATITUDE** — "assembled from salvage, copied patterns and recovered
 *   systems. **Individual machines differ substantially.**" That line is the
 *   profile: fast, thin, long ribbons, and *irregular by nature*. The jitter is
 *   high precisely so no two frames of it look alike — which is how one shared
 *   profile still honours a faction defined by nothing matching.
 * * **ASHFALL IRREGULARS** — a contract force that prices hull loss as a line
 *   item, flying scavenged kit. It burns: short, hot, chaotic, throwing embers.
 */

export interface ThrusterFx {
  /** Jets in the cone at rest, and at full burn. */
  jetsLow: number;
  jetsHigh: number;
  /** Cone half-angle in radians at rest, and the extra added at full burn. */
  spread: number;
  spreadHot: number;
  /** Exhaust velocity, base and the part that only arrives under load. */
  speed: number;
  speedHot: number;
  /** Streak length: base, linear term, and the late-ramping term. */
  len: number;
  lenPower: number;
  lenHot: number;
  /** Streak narrowness. Lower is thinner, and thin reads as fast. */
  thin: number;
  /** Particle lifetime, base and per unit of power. */
  life: number;
  lifePower: number;
  /** Opacity, base and the two ramps. */
  alpha: number;
  alphaPower: number;
  alphaHot: number;
  /** Air resistance. High drag billows; low drag streams. */
  drag: number;
  /** 0..1 randomness on angle, speed and size, per particle. */
  jitter: number;
  /** Embers thrown per emission at full burn. 0 for none. */
  embers: number;
  /** Power above which a white-hot core appears. 1 disables it. */
  whiteAt: number;
}

const CONCORD: ThrusterFx = {
  jetsLow: 1,
  jetsHigh: 2,
  spread: 0.10,
  spreadHot: 0.14,
  speed: 3.8,
  speedHot: 5.0,
  len: 0.18,
  lenPower: 0.20,
  lenHot: 0.42,
  thin: 0.24,
  life: 8,
  lifePower: 7,
  alpha: 0.15,
  alphaPower: 0.13,
  alphaHot: 0.32,
  drag: 0.95,
  jitter: 0.05,
  embers: 0,
  whiteAt: 0.72,
};

const EMBERLINE: ThrusterFx = {
  ...CONCORD,
  // The same engine with the tolerances gone.
  jetsHigh: 3,
  spread: 0.20,
  spreadHot: 0.30,
  speed: 3.4,
  speedHot: 4.2,
  life: 9,
  lifePower: 8,
  drag: 0.93,
  jitter: 0.34,
  embers: 2,
  whiteAt: 0.80,
};

const IRONWAKE: ThrusterFx = {
  jetsLow: 2,
  jetsHigh: 4,
  spread: 0.26,
  spreadHot: 0.34,
  // Slow and heavy: plant, not aircraft.
  speed: 2.4,
  speedHot: 3.0,
  len: 0.24,
  lenPower: 0.22,
  lenHot: 0.40,
  thin: 0.52,
  life: 13,
  lifePower: 11,
  alpha: 0.13,
  alphaPower: 0.11,
  alphaHot: 0.26,
  // High drag: it billows and hangs rather than streaming away.
  drag: 0.88,
  jitter: 0.18,
  embers: 1,
  whiteAt: 0.86,
};

const LATITUDE: ThrusterFx = {
  jetsLow: 1,
  jetsHigh: 3,
  spread: 0.08,
  spreadHot: 0.20,
  // Long, thin and quick. Thin is most of why it reads as fast.
  speed: 5.4,
  speedHot: 7.0,
  len: 0.22,
  lenPower: 0.26,
  lenHot: 0.52,
  thin: 0.17,
  life: 7,
  lifePower: 6,
  alpha: 0.15,
  alphaPower: 0.14,
  alphaHot: 0.34,
  drag: 0.965,
  // Deliberately the highest on the roster: nothing this faction flies matches.
  jitter: 0.42,
  embers: 0,
  whiteAt: 0.70,
};

const ASHFALL: ThrusterFx = {
  jetsLow: 2,
  jetsHigh: 5,
  spread: 0.30,
  spreadHot: 0.44,
  speed: 3.0,
  speedHot: 5.2,
  len: 0.20,
  lenPower: 0.18,
  lenHot: 0.46,
  thin: 0.44,
  life: 8,
  lifePower: 9,
  alpha: 0.16,
  alphaPower: 0.14,
  alphaHot: 0.34,
  drag: 0.90,
  jitter: 0.40,
  // It throws sparks. It is the only one that does so at any power.
  embers: 4,
  whiteAt: 0.66,
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
