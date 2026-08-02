import type { AttackDef } from './AttackData';
import type { SupporterDef } from '../mechs/MechDef';
import type { ProjectileSpawn, SimEvent } from './types';
import { wrapAngle } from '../core/MathUtil';
import { playstyleFor, type DroneDoctrine } from '../ai/Playstyles';
import type { SupporterRole } from '../mechs/MechDef';
import type { ProjFamilyId } from '../projectiles/families';
import { Rng } from '../core/Rng';
import { Element } from './Status';
import { BarrierResponse, ProjKind } from './types';

/**
 * The supporter drone.
 *
 * The 2005 reference gives the sub-weapon to a small companion machine rather
 * than to the chassis (`howto-en.html` element 2, "supporter - sub shoot"; the
 * state file `f-o.cns` is headed サポーター射撃, "supporter shooting"). The
 * chassis only gives the order — the shot leaves the drone.
 *
 * Design decisions, recorded here because the handoff asked for them explicitly:
 *
 * * **Always deployed.** There is no launch/recall button any more. The toggle
 *   was a standing decision nobody was making: measured, drones were dying with
 *   a 10th-percentile life of *two seconds* and a median of eight, so the
 *   "should it be out?" question answered itself in the opening exchange and the
 *   button spent the rest of the match dead. The drone is now a permanent part
 *   of the machine, and keeping it alive is the skill instead.
 * * **It flies itself.** Because it can no longer be pulled to safety, it has to
 *   find safety on its own — see `station()`. It keeps formation, drifts toward
 *   a firing position when that is safe, and breaks away from incoming fire.
 * * **Damageable, and rebuilt exactly once.** The reference draws only a charge
 *   gauge on its supporter and never a life bar, so the first pass made the
 *   drone invulnerable — but with a passive and free auto-fire attached, an
 *   invulnerable drone is a strictly-better button with no counterplay. Shooting
 *   one down now retires it into the chassis, where it rebuilds slowly and
 *   relaunches itself. **That happens once per match.** The second kill is
 *   permanent. One rebuild keeps the subsystem present in a fight it used to
 *   vanish from in the first five seconds; the hard cap keeps hunting it worth
 *   the attention, because the second kill really does end it.
 * * **Inherits nothing it should not.** It follows the owner's position, but it
 *   is not bound to it: it lags, overshoots slightly and catches up, so it reads
 *   as a machine flying in formation rather than a welded-on sprite.
 * * **Silent during frozen phases.** `MatchSim` feeds empty input during intro
 *   and KO, so no order can arrive; the drone keeps station regardless.
 *
 * Everything here is deterministic — no RNG, no wall-clock — so a replay and a
 * test see identical behaviour. That extends to the evasion: it reads the live
 * projectile list and does arithmetic on it, and never rolls a die.
 */

export const enum SupState {
  /** Keeping station, ready for an order. */
  Idle = 0,
  /** Order accepted, drone is bracing and slewing onto the target. */
  Windup = 1,
  /** Holding the firing pose after the shot has left. */
  Recover = 2,
}

/**
 * Where the drone is, as opposed to `SupState`, which is what it is doing with
 * its gun. Two small machines rather than one combined one: the firing cycle and
 * the deployment cycle run at completely different timescales and neither should
 * have to enumerate the other's states.
 */
export const enum DroneMode {
  /** Docked in the chassis. Invisible, untouchable, no passive. */
  Stowed = 0,
  /** Flying out to station. Already exposed, not yet contributing. */
  Deploying = 1,
  /** On station: passive live, firing on its own initiative. */
  Active = 2,
  /** Flying home. Still exposed, passive already gone. */
  Recalling = 3,
  /** Shot down for good. No passive, no gun, for the rest of the match. */
  Destroyed = 4,
  /**
   * Shot down the first time: limping home and reassembling itself.
   *
   * Visible, so the player can watch the repair they are waiting on, but **not**
   * hittable — it is already out of the fight and shooting a wreck should not
   * deny the rebuild. Relaunches itself at full hit points.
   */
  Rebuilding = 5,
}

/**
 * Ticks to reassemble a downed drone, and then how long the relaunch takes.
 *
 * Fifteen seconds of a match that now runs 180. Long enough that losing the
 * drone is a real and felt penalty — a quarter of a minute without your passive
 * — and short enough that the subsystem comes back while the fight it belongs to
 * is still going. A per-tick repair rate was the obvious alternative and is
 * worse: hit points were just scaled 3.5×, so any rate tuned against the old
 * pools would now take most of the match.
 */
export const REBUILD_TICKS = 900;

/** How many times a drone may come back. One, then the next kill is final. */
export const MAX_REBUILDS = 1;

/**
 * What the drone is doing with its position this tick.
 *
 * The 2005 reference's supporters do not merely trail their pilot — they work
 * with them, most visibly by crossing the screen so the target is caught between
 * the drone's fire and the mech's. These are this project's take on that: the
 * escort has a *plan* that reacts to what its owner is doing, and the doctrine
 * from the pilot's playstyle decides which plans it is willing to run.
 */
export const enum DroneTactic {
  /** Hold the authored formation. The resting state. */
  Escort = 0,
  /**
   * Cross to the far side of the target, so it sits between two firing lines.
   *
   * The signature move, and the one thing here that deliberately ignores the
   * leash — a pincer that stays 190 px from its owner is not a pincer. A target
   * caught between a mech and its escort cannot face both, and cannot retreat
   * from one without closing on the other.
   */
  Pincer = 1,
  /**
   * Interpose between a helpless owner and the threat.
   *
   * A pilot in hitstun or burnout cannot defend themselves and the drone is the
   * only thing that can act. It is worth far more as a body in the way for a
   * second than as a gun somewhere else.
   */
  Cover = 2,
  /**
   * Crowd a turtling target until it has to answer something.
   *
   * A held guard stops most of what a mech throws; it does not make the problem
   * of two attackers go away. Getting in close forces the choice.
   */
  Harass = 3,
  /** Hurt: break off, get back into formation, stop volunteering. */
  Regroup = 4,
}

export const DRONE_TACTIC_NAMES = ['ESCORT', 'PINCER', 'COVER', 'HARASS', 'REGROUP'];

// ---- movement AI tuning ----------------------------------------------------
// All in logical pixels, all displacements from the authored formation point.

/** How far a shot is noticed from. Roughly a third of the arena's height. */
const THREAT_RADIUS = 300;
/** How hard one closing shot at point-blank pushes the drone out of its lane. */
const EVADE_STRENGTH = 150;
/**
 * Forward lean toward a target the drone can actually reach.
 *
 * Deliberately well under the smallest `followBack` on the roster. The first cut
 * used 46 against a 64px follow-back and the drone ended up 18px behind its
 * owner — flying through the chassis sprite rather than escorting it.
 * `MIN_OWNER_GAP` is the hard floor; this is the number that keeps it from
 * having to do any work.
 */
const SUPPORT_FORWARD = 26;
/** Most it will climb or drop to get level with what it is shooting at. */
const SUPPORT_RISE = 40;
/**
 * Closest the drone will station itself to its owner's centre.
 *
 * Applies after every other pull, evasion included: dodging a shot by hiding
 * inside your own mech is not a dodge, it is a rendering bug.
 */
const MIN_OWNER_GAP = 46;
/**
 * Closest any drone will station itself to the machine it is fighting.
 *
 * Applies after every play. Screening and harassing both want to crowd; neither
 * needs to occupy the same space as the target.
 */
const MIN_TARGET_GAP = 96;
/** A hazard drone keeps clear distance — see the note at the clamp. */
const HAZARD_TARGET_GAP = 230;
/**
 * Furthest the drone will stray from formation, however loud the arithmetic
 * above gets. This is the difference between an escort and a second fighter:
 * without it, a busy screen sends the drone across the arena and it stops
 * reading as part of its owner's machine.
 */
const LEASH = 190;
/**
 * How far past the target a pincer parks itself.
 *
 * Measured from the target, on the far side from the owner, so the two of them
 * bracket it. Comfortably outside a chassis so the drone is not sitting inside
 * whatever it is shooting at.
 */
const PINCER_BEYOND = 210;
/**
 * The leash a pincer is allowed, replacing the ordinary one.
 *
 * The whole play is crossing to the other side of the fight, so the escort
 * radius that keeps a drone in formation is exactly the thing that has to be
 * lifted. Still bounded — this is a manoeuvre, not a second fighter wandering
 * off — but bounded at arena scale rather than formation scale.
 */
const PINCER_LEASH = 1100;
/** Minimum owner-to-target gap worth crossing. Below this there is no far side. */
const PINCER_MIN_GAP = 320;
/** How far in front of a helpless owner the drone puts itself. */
const COVER_AHEAD = 96;
/** How close a harassing drone crowds its target. */
const HARASS_GAP = 120;
/** Life fraction below which the drone stops volunteering for anything. */
const REGROUP_LIFE = 0.35;

// ---- role tuning -----------------------------------------------------------

/**
 * Roles that also fire the owner's sub-weapon, drawing from the charge rack.
 *
 * **Most roles are additive, not replacements.** Measured: a role that costs a
 * drone its gun has to be worth more than the gun, and four of them were not —
 * the repair tether cost NOCTURNE 0.26 of a life bar, the decoy cost NULLTIDE
 * 0.31. Painting, projecting a silhouette or trailing a wire are things a drone
 * can do *while* shooting, so they do.
 *
 * The two exceptions are genuinely full-time jobs: a dome has to be held, and an
 * interceptor's cooldown is already spent picking shots out of the air.
 */
const SPENDS_CHARGES = new Set<SupporterRole>([
  'shooter',
  'designator',
  'decoy',
  'tether',
  'arcTether',
  'miner',
  'hazard',
]);
/**
 * `dome`: how much damage the shell absorbs before it fails, and how long it is
 * gone for afterwards.
 *
 * The pool is generous — a dome that popped to a single volley would not be
 * worth the drone standing where it has to stand — but the recovery is long
 * enough to be a real window. Breaking Tengku's bubble should feel like it has
 * bought something, and ten seconds without it is the something.
 */
export const DOME_MAX = 900;
export const DOME_RECOVER = 420;

/** `arcTether`: shortest span that counts as a wire rather than a formation gap. */
const ARC_MIN_SPAN = 150;
/** `decoy`: how often a new silhouette is thrown, how long it lasts, how far out. */
const DECOY_PERIOD = 150;
const DECOY_LIFE = 110;
// Far enough out that a fooled shot genuinely misses. At 130 the silhouette sat
// close enough to its owner that aiming at it still nearly aimed at them.
const DECOY_THROW = 300;
/** How fast the projection drifts. Near a mech's cruising speed, not its boost. */
const DECOY_SPEED = 2.6;
/** How often the projection fires, and how fast its harmless rounds travel. */
/**
 * How often the projection fires, and how likely each round is to stun.
 *
 * Rebalanced together, deliberately: the projection's job is to make ignoring it
 * expensive, and it did that with volume. Volume is the wrong lever — a stream
 * of harmless rounds from a silhouette is easy to read as harmless. Fewer shots
 * that each carry a real threat make the *decision* to ignore it the risky part,
 * which is what a decoy is for.
 */
const DECOY_FIRE_PERIOD = 28;
const DECOY_SHOT_SPEED = 13;
/**
 * Three in twenty, for one second.
 *
 * The decoy's rounds do no damage, so this is the entire reason to respect them
 * — and at one in twenty a decoy would usually throw its whole volley without
 * landing anything, which made ignoring it very nearly free.
 */
const DECOY_STUN_CHANCE = 0.3;
const DECOY_STUN_TICKS = 60;
/** `miner`: a cluster of large, long-lived charges rather than one small one. */
const MINE_PERIOD = 110;
const MINE_LIFE = 900;
const MINE_DAMAGE = 58;
/** Trigger radius. Wide enough that crossing the field is a decision. */
const MINE_RADIUS = 62;
/** Charges per drop, and how far apart they are seeded. */
const MINE_CLUSTER = 3;
const MINE_SPREAD = 74;
/** Drawn size. A mine has to look like something you would avoid. */
const MINE_DRAW = 3.4;
/**
 * `hazard`: a **trail**, not a field.
 *
 * EMBER lays small embers densely along its own path, so what you see is fire
 * streaming off the drone rather than craters being dropped. That is the whole
 * distinction from BULWARK's minefield — few and heavy against many and light —
 * and briefly blurring it by drawing hazards at 2.2x scale made the two roles
 * look like the same thing at different speeds.
 *
 * Individually almost harmless. The element is what does the work.
 */
const HAZARD_PERIOD = 8;
/**
 * How long an ember burns on the deck.
 *
 * Four and a half seconds rather than two and a half. A trail that vanishes as
 * fast as it is laid never reads as a trail — the tail end was gone before the
 * drone had finished drawing the head, so what you saw was a handful of sparks
 * following it around rather than a line of fire across the ground. Long enough
 * now that the path the escort took is still legible after it has moved on,
 * which is the whole point of area denial.
 */
const HAZARD_LIFE = 270;
const HAZARD_DAMAGE = 5;
const HAZARD_RADIUS = 16;
/**
 * Drawn size, and it is **not** 1.
 *
 * `visualScale` multiplies the *family's* own dimensions, so "natural size" for
 * `flame` is a 64px gout with a 2.2x halo — about 141px of glow, which is a
 * flamethrower, not an ember. Scaled to roughly a `pellet`'s 26px so the trail
 * is a line of sparks. The family is still right: it carries the ember burst and
 * the orange trail tint that make it read as fire rather than as gunfire.
 */
const HAZARD_DRAW = 0.4;
/**
 * Minimum movement per tick before another ember is laid.
 *
 * Fire trails *behind* something. A drone holding station would otherwise stack
 * the whole trail into one spot, which is neither the look nor a fair amount of
 * damage for standing still.
 */
const HAZARD_MIN_SPEED = 0.9;
/** Embers per burst, then a reload. Five and a second and a half. */
const HAZARD_BURST = 5;
const HAZARD_COOLDOWN = 90;

/** What the drone needs to know about one projectile in order to dodge it. */
export interface DroneThreat {
  x: number;
  y: number;
  vx: number;
  vy: number;
  team: number;
}

/**
 * How the drone's standing orders bend the numbers above.
 *
 * The doctrine comes from the pilot's playstyle (`ai/Playstyles.ts`), because a
 * permanently-deployed escort that flies itself is otherwise the one part of the
 * machine with no opinion. `forward` and `leash` scale the support lean;
 * `caution` scales the evasion; `offAxis` pushes the drone away from the line
 * between its owner and the target instead of along it.
 */
interface DoctrineTuning {
  forward: number;
  leash: number;
  caution: number;
  offAxis: number;
  /**
   * Life fraction below which the drone stops volunteering and goes home.
   *
   * Per doctrine rather than global because what a drone loses by retreating is
   * not the same for all of them. A shooter that falls back still shoots. A
   * drone whose output *is* a position loses everything, and `flank` is the
   * doctrine built entirely on holding one.
   */
  regroup: number;
  /**
   * The team-up plays this doctrine is willing to run, in priority order.
   *
   * `Escort` and `Regroup` are always available and are not listed — one is the
   * resting state and the other is self-preservation. What a doctrine chooses is
   * which *co-operative* plays its pilot's game actually wants.
   */
  plays: readonly DroneTactic[];
}

const DOCTRINES: Record<DroneDoctrine, DoctrineTuning> = {
  /** Balanced, and willing to run anything when the moment calls for it. */
  escort: {
    forward: 1,
    leash: 1,
    caution: 1,
    offAxis: 0,
    regroup: REGROUP_LIFE,
    plays: [DroneTactic.Cover, DroneTactic.Pincer, DroneTactic.Harass],
  },
  /**
   * Get in front and stay there.
   *
   * Leans a long way forward on a long leash and dodges *less*, which looks like
   * a mistake and is the entire point: every shot spent on the drone is one not
   * spent on a pilot who needs to hold still. VESPER cannot line up a shot while
   * being rushed, so his escort goes and does the being-rushed for him.
   */
  screen: {
    forward: 2.6,
    leash: 1.9,
    caution: 0.45,
    offAxis: 0,
    regroup: REGROUP_LIFE,
    // Harass first: a screen exists to be the thing being dealt with.
    plays: [DroneTactic.Harass, DroneTactic.Cover, DroneTactic.Pincer],
  },
  /** Work an angle. Off the owner-to-target line, and hard to pin. */
  flank: {
    forward: 1.5,
    leash: 1.5,
    caution: 1.35,
    offAxis: 78,
    // A flank drone that goes home is not a flank drone. Its whole output is the
    // angle it is holding, so it keeps holding it far longer than anything else.
    regroup: 0.15,
    // Angles are the whole doctrine, and a pincer is the strongest angle there
    // is — CIRRUS and NULLTIDE both want the target facing the wrong way.
    plays: [DroneTactic.Pincer, DroneTactic.Cover],
  },
  /** Stay tight, stay alive, keep the passive up. */
  shadow: {
    forward: 0.35,
    leash: 0.6,
    caution: 1.6,
    offAxis: 0,
    regroup: REGROUP_LIFE,
    // Never leaves. A shadow's value is the passive staying up, and crossing the
    // arena is how a drone stops existing.
    plays: [DroneTactic.Cover],
  },
};

/** The subset of the owner the drone needs. Keeps this file free of Combatant. */
export interface SupporterOwner {
  x: number;
  y: number;
  facing: number;
  alive: boolean;
  id: number;
  team: number;
  /**
   * Cannot act: hitstun, a saturation burnout, or a broken guard.
   *
   * Optional so a bare stand-in can still be handed to `step` in a test; a
   * missing value simply reads as "not helpless".
   */
  helpless?: boolean;
  /** Holding a guard. */
  guarding?: boolean;
  /** Inside a Shield saturation burst. */
  shieldActive?: boolean;
}



/**
 * Asks the owner for a volley.
 *
 * Returns the attack to fire — having already spent its charge — or null when
 * the machine cannot pay. The charge economy stays on the chassis, where the
 * HUD and the command inputs already read it; the drone only asks.
 */
export type VolleyRequest = () => AttackDef | null;

export class Supporter {
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  /** Direction the drone is pointing. */
  aim = 0;
  /** +1 / -1, derived from the aim, for sprite mirroring. */
  facing = 1;

  state: SupState = SupState.Idle;
  stateTicks = 0;
  cooldown = 0;

  /** Where the drone is in its deployment cycle. */
  mode: DroneMode = DroneMode.Active;
  /** Ticks spent in the current `mode`, for the deploy/recall transitions. */
  modeTicks = 0;
  life: number;
  /** Rebuilds remaining. Decremented when one is spent, never restored mid-match. */
  rebuildsLeft = MAX_REBUILDS;
  /** Copied from the owner at construction, so threat filtering needs no lookup. */
  readonly team: number;
  /**
   * Standing orders, taken from the pilot's playstyle.
   *
   * Resolved once at construction rather than looked up per tick: it cannot
   * change during a match, and a drone that re-derived its doctrine sixty times
   * a second would be paying for a question with one answer.
   */
  doctrine: DroneDoctrine = 'escort';
  /** The team-up play being run this tick, for the debug overlay and tests. */
  tactic: DroneTactic = DroneTactic.Escort;

  // ---- role state ----------------------------------------------------------
  /** Cadence counter for whichever role this drone runs. */
  private roleTimer = 0;
  /** `dome`: true while the bubble is up. `MatchSim` sweeps shots out of it. */
  domeActive = false;
  /**
   * `dome`: how much punishment the bubble has left.
   *
   * It used to erase every non-piercing shot that entered it for the whole match
   * at no cost but the drone's position — an unconditional wall with one answer,
   * and the answer was slow. Now the wall pays: each round it deletes takes that
   * round's damage off the shell, and a sustained volley will break it.
   */
  domeHp = DOME_MAX;
  /** `dome`: ticks until a broken shell finishes rebuilding itself. */
  domeDownTicks = 0;
  /**
   * `decoy`: the false machine — how long it has left, where it is, and where it
   * is going.
   *
   * It *moves*. A silhouette standing perfectly still is identifiable in about
   * half a second and then ignored for the rest of its life, which makes the
   * whole ability a marker rather than a deception. Drifting like a mech that is
   * holding station is what buys the doubt.
   */
  decoyTicks = 0;
  decoyX = 0;
  decoyY = 0;
  decoyVx = 0;
  decoyVy = 0;
  /** Heading the projection is currently drifting along, in radians. */
  private decoyHeading = 0;
  /** Which way the projection is facing, for the renderer. */
  decoyFacing = 1;
  /** Ticks until the projection fires again. */
  private decoyFireTimer = 0;
  /**
   * Where the projection's mounts are pointing.
   *
   * Lives in the simulation rather than the renderer because it decides where
   * the rounds actually go. A rig aiming somewhere its own shots do not come
   * from is the clearest tell a decoy can give.
   */
  decoyAim = 0;
  /** `arcTether`: true while the wire between drone and owner is live. */
  tetherLive = false;
  /** `arcTether`: ticks before the wire may bite again. */
  arcCooldown = 0;
  /** `interceptor`: ticks before the breaker pulse may fire again. */
  pulseCooldown = 0;
  /** `hazard`: embers laid in the current burst. */
  private hazardBurst = 0;

  /** The attack this drone was ordered to fire, held through the windup. */
  private pending: AttackDef | null = null;

  constructor(
    readonly def: SupporterDef,
    owner: SupporterOwner,
    /** Owning chassis id, used only to look up the pilot's drone doctrine. */
    mechId?: string,
    /**
     * The match generator, for the decoy's stun roll. Falls back to its own so a
     * `Supporter` built in isolation still works.
     */
    private readonly rng: Rng = new Rng(0x5eed0007 + owner.id),
  ) {
    this.life = def.maxLife;
    this.team = owner.team;
    this.doctrine = playstyleFor(mechId).droneDoctrine;
    this.x = owner.x - owner.facing * def.followBack;
    this.y = owner.y + def.followDown;
    this.aim = owner.facing > 0 ? 0 : Math.PI;
    this.facing = owner.facing;
  }

  // ------------------------------------------------------------------ queries

  /** Shot down, permanently. Rebuilding is *not* this. */
  get destroyed(): boolean {
    return this.mode === DroneMode.Destroyed;
  }

  /** Out of the chassis, and therefore something the opponent can shoot. */
  get hittable(): boolean {
    return (
      this.mode === DroneMode.Deploying ||
      this.mode === DroneMode.Active ||
      this.mode === DroneMode.Recalling
    );
  }

  /**
   * Drawn this tick.
   *
   * A superset of `hittable`: a rebuilding drone is on screen, limping alongside
   * its owner with its bar refilling, but cannot be shot again. Watching the
   * repair is most of what makes the wait readable rather than just a missing
   * passive.
   */
  get visible(): boolean {
    return this.hittable || this.mode === DroneMode.Rebuilding;
  }

  /** Reassembling itself after its first death. */
  get rebuilding(): boolean {
    return this.mode === DroneMode.Rebuilding;
  }

  /** 0..1 through the rebuild, for the progress ring drawn while it waits. */
  get rebuildFraction(): number {
    if (this.mode !== DroneMode.Rebuilding) return 0;
    return Math.max(0, Math.min(1, this.modeTicks / REBUILD_TICKS));
  }

  /**
   * On station: the passive is live and the drone will fire on its own.
   *
   * Note this is false through the whole launch, which is what makes deploying
   * mid-fight a commitment rather than a free instant.
   */
  get onStation(): boolean {
    return this.mode === DroneMode.Active;
  }

  /** True when the assist button would recall rather than deploy. */
  get outbound(): boolean {
    return this.mode === DroneMode.Deploying || this.mode === DroneMode.Active;
  }

  /** 0..1 hit points, for the bar drawn on the drone. */
  get lifeFraction(): number {
    return Math.max(0, Math.min(1, this.life / Math.max(1, this.def.maxLife)));
  }

  /** True when a firing order would be accepted right now. */
  get ready(): boolean {
    return this.onStation && this.state === SupState.Idle && this.cooldown <= 0;
  }

  /** 0..1, for the readiness bar drawn on the drone. */
  get readyFraction(): number {
    if (this.ready) return 1;
    if (!this.onStation) return 0;
    const total = Math.max(1, this.def.cooldown);
    return this.state === SupState.Idle ? 1 - this.cooldown / total : 0;
  }

  // -------------------------------------------------------------- deployment

  /**
   * Applies a hit.
   *
   * Returns 'down' on the blow that retires it into a rebuild, and 'destroyed'
   * on the one that ends it for the match. Callers that only care that it fell
   * out of the sky can test for either; the two are distinguished because they
   * deserve different cues — one is a setback, the other is final.
   *
   * Damage is scaled by the drone's own `defenceMul` rather than its owner's:
   * an armoured escort on a paper chassis is a deliberate design axis, and
   * borrowing the mech's defence would have collapsed it.
   */
  takeHit(damage: number): 'ignored' | 'hit' | 'down' | 'destroyed' {
    if (!this.hittable) return 'ignored';
    this.life -= damage * this.def.defenceMul;
    if (this.life > 0) return 'hit';

    this.life = 0;
    this.modeTicks = 0;
    this.cancel();
    this.vx = 0;
    this.vy = 0;
    if (this.rebuildsLeft > 0) {
      this.rebuildsLeft--;
      this.mode = DroneMode.Rebuilding;
      return 'down';
    }
    this.mode = DroneMode.Destroyed;
    return 'destroyed';
  }

  /** Accepts a firing order. False when the drone is busy, stowed or gone. */
  order(a: AttackDef): boolean {
    if (!this.ready) return false;
    this.pending = a;
    this.state = SupState.Windup;
    this.stateTicks = 0;
    return true;
  }

  /** Drops any order in flight. Used on KO, recall and a dummy reset. */
  cancel(): void {
    this.pending = null;
    this.state = SupState.Idle;
    this.stateTicks = 0;
  }

  // ---------------------------------------------------------------- stepping

  /**
   * Advances one tick.
   *
   * Called from `MatchSim` after both combatants have moved, so the drone chases
   * this tick's owner position rather than last tick's. `fire` is a callback so
   * the shot goes through the owner's own firing path and inherits its
   * saturation scaling — there is exactly one place that builds a projectile.
   */
  step(
    owner: SupporterOwner,
    target: SupporterOwner | null,
    spawns: ProjectileSpawn[],
    events: SimEvent[],
    fire: (a: AttackDef, x: number, y: number, angle: number, spawns: ProjectileSpawn[], events: SimEvent[]) => void,
    requestVolley?: VolleyRequest,
    threats: DroneThreat[] = [],
  ): void {
    const d = this.def;

    if (this.destroyed) return;

    if (this.cooldown > 0) this.cooldown--;

    // A downed owner cannot be assisted, and its drone powers down with it
    // rather than continuing to fly formation on a wreck.
    if (!owner.alive) {
      if (this.mode !== DroneMode.Stowed) {
        this.mode = DroneMode.Stowed;
        this.modeTicks = 0;
      }
      this.cancel();
    }

    this.stepMode(owner);
    this.follow(owner, target, threats);
    this.slew(owner, target);

    // The shell rebuilds on its own clock, whatever else the drone is doing —
    // including while the drone itself is being rebuilt, so a downed escort does
    // not come back with a broken bubble on top of everything else.
    if (this.domeDownTicks > 0) {
      this.domeDownTicks--;
      if (this.domeDownTicks === 0) this.domeHp = DOME_MAX;
    }

    // A rebuilding drone is a passenger: no gun, no passive, no orders.
    //
    // Every latched role flag has to be cleared here, not just some of them.
    // `stepRole` is what normally re-derives them each tick and it does not run
    // on this path, so anything left set stays set for the whole rebuild.
    // `tetherLive` was missed: `MatchSim` never noticed because its own gate is
    // `onStation`, but the renderer read the flag directly and drew WARDEN's
    // repair beam — and WISP's live wire — running from a wreck.
    if (this.mode === DroneMode.Rebuilding) {
      this.roleTimer = 0;
      this.domeActive = false;
      this.tetherLive = false;
      this.decoyTicks = 0;
      return;
    }

    this.stepRole(owner, target, spawns, events);

    switch (this.state) {
      case SupState.Windup:
        this.stateTicks++;
        if (this.stateTicks >= d.windup) {
          const a = this.pending;
          this.pending = null;
          if (a && owner.alive) {
            const mx = this.x + Math.cos(this.aim) * d.muzzleForward;
            const my = this.y + Math.sin(this.aim) * d.muzzleForward;
            fire(a, mx, my, this.aim, spawns, events);
          }
          this.state = SupState.Recover;
          this.stateTicks = 0;
        }
        break;

      case SupState.Recover:
        this.stateTicks++;
        if (this.stateTicks >= d.recover) {
          this.state = SupState.Idle;
          this.stateTicks = 0;
          this.cooldown = d.cooldown;
        }
        break;

      default:
        // Idle and on station: the drone picks its own moment. Gated on the
        // owner's charges — `requestVolley` spends one or refuses — so
        // auto-fire is a use of the same economy the player already watches,
        // not a second free weapon bolted alongside it.
        //
        // Only the shooting roles go through the charge rack. A dome, a repair
        // tether or a decoy is not a volley and must not compete for ammunition
        // its owner is also spending on the sub-weapon button.
        if (this.ready && requestVolley && this.wantsToFire(owner, target)) {
          if (SPENDS_CHARGES.has(d.role)) {
            const a = requestVolley();
            if (a) this.order(a);
          }
        }
        break;
    }
  }


  /**
   * The drone's own verb, run once per tick.
   *
   * Everything here is deliberately *not* a volley: it costs no sub-charge, does
   * not go through `order`, and does not compete with the sub-weapon button. A
   * shooter's behaviour still lives in the ordinary firing cycle; these are the
   * seven other things a supporter can be.
   *
   * Deterministic throughout — cadence comes from a counter, never a die.
   */
  private stepRole(
    owner: SupporterOwner,
    target: SupporterOwner | null,
    spawns: ProjectileSpawn[],
    events: SimEvent[],
  ): void {
    const d = this.def;
    this.domeActive = false;
    this.tetherLive = false;
    if (this.roleTimer > 0) this.roleTimer--;
    if (this.decoyTicks > 0) this.decoyTicks--;

    if (this.decoyTicks > 0) this.stepDecoy(owner, target, spawns, events);

    if (!this.onStation || !owner.alive) return;
    const live = target && target.alive;
    const reach = live ? Math.hypot(target!.x - this.x, target!.y - this.y) : Infinity;

    switch (d.role) {
      case 'dome':
        // Up while on station **and** while the shell has anything left. Its
        // cost used to be only that the drone has to *be* there; now it is also
        // that the shell is consumable, so pressure is an answer as well as
        // position.
        this.domeActive = this.domeDownTicks <= 0 && this.domeHp > 0;
        break;

      case 'tether':
        // Barrier fast, hull slow. This used to be barrier and *only* barrier,
        // on the reasoning that a drone able to undo damage makes killing it
        // mandatory rather than rewarding; that was overruled by design, and
        // `TETHER_LIFE_RATE` in `MatchSim` carries the trickle and the note on
        // why it is as small as it is.
        this.tetherLive = true;
        break;

      case 'arcTether':
        // The wire is live whenever the drone is far enough from its owner for
        // there to be a wire. `MatchSim` does the segment test.
        this.tetherLive = Math.hypot(this.x - owner.x, this.y - owner.y) > ARC_MIN_SPAN;
        break;

      case 'decoy':
        // Re-projected on a cadence rather than held, so it flickers between
        // positions and cannot simply be learned once and ignored.
        if (this.roleTimer <= 0 && live && reach <= d.fireRange) {
          this.roleTimer = DECOY_PERIOD;
          this.decoyTicks = DECOY_LIFE;
          /**
           * Thrown *across* the fight rather than away from it.
           *
           * The first cut pushed it straight out along the owner-to-drone line,
           * which put the silhouette wherever the escort happened to be —
           * frequently below the floor line and outside the camera, which frames
           * on the two machines. A decoy nobody can see is not a decoy, it is a
           * bug report. Offsetting perpendicular to the line between the two
           * pilots keeps it inside the frame the fight is being watched in, and
           * makes a fooled shot swing *sideways*, which is a clean miss rather
           * than a near one.
           */
          const lx = target!.x - owner.x;
          const ly = target!.y - owner.y;
          const ll = Math.hypot(lx, ly) || 1;
          const side = this.y >= owner.y ? 1 : -1;
          this.decoyX = this.x + (-ly / ll) * DECOY_THROW * side;
          this.decoyY = this.y + (lx / ll) * DECOY_THROW * side;
          // Launched drifting back toward the fight, so its first movement is
          // the movement a real pilot would be making.
          this.decoyHeading = Math.atan2(ly, lx);
          this.decoyFacing = lx >= 0 ? 1 : -1;
          this.decoyAim = Math.atan2(target!.y - this.decoyY, target!.x - this.decoyX);
          events.push({ t: 'assist', x: this.decoyX, y: this.decoyY, angle: this.aim, ownerId: owner.id, auto: true });
        }
        break;

      case 'miner':
        /**
         * A minefield, not a mine.
         *
         * The first cut dropped one charge with a 26px trigger every 96 ticks,
         * which was both too rare and too small to ever be walked into — and
         * read as a worse version of the burning ground. A siege walker
         * *fortifies*: three charges in a spread, each with a trigger wide
         * enough to matter, that then sit there for fifteen seconds. Slower to
         * lay than a hazard trail and far harder to ignore.
         */
        if (this.roleTimer <= 0 && live && reach <= d.fireRange) {
          this.roleTimer = MINE_PERIOD;
          for (let i = 0; i < MINE_CLUSTER; i++) {
            const ang = (i / MINE_CLUSTER) * Math.PI * 2 + this.aim;
            spawns.push(
              this.areaSpawn(
                owner,
                MINE_LIFE,
                MINE_DAMAGE,
                MINE_RADIUS,
                Element.None,
                'ring',
                MINE_DRAW,
                Math.cos(ang) * MINE_SPREAD,
                Math.sin(ang) * MINE_SPREAD,
                true,
              ),
            );
          }
          events.push({ t: 'fire', x: this.x, y: this.y, angle: this.aim, kind: ProjKind.Heavy, ownerId: owner.id });
        }
        break;

      case 'hazard':
        // Dropped underneath itself as it moves, so the trail is a record of
        // where the drone has been rather than an aimed attack.
        if (
          this.roleTimer <= 0 &&
          live &&
          reach <= d.fireRange &&
          Math.hypot(this.vx, this.vy) >= HAZARD_MIN_SPEED
        ) {
          // Five, then stop and reload. Uncapped, the drone simply held the fire
          // button: a continuous trail laid *into* a mech is a stunlock, because
          // every ember carries hitstun and they arrive faster than the victim
          // recovers. The cap is what turns it from a beam into a burst.
          this.hazardBurst++;
          this.roleTimer =
            this.hazardBurst >= HAZARD_BURST ? HAZARD_COOLDOWN : HAZARD_PERIOD;
          if (this.hazardBurst >= HAZARD_BURST) this.hazardBurst = 0;
          spawns.push(
            this.areaSpawn(
              owner,
              HAZARD_LIFE,
              HAZARD_DAMAGE,
              HAZARD_RADIUS,
              Element.Incendiary,
              'flame',
              HAZARD_DRAW,
            ),
          );
          events.push({ t: 'fire', x: this.x, y: this.y, angle: this.aim, kind: ProjKind.Bullet, ownerId: owner.id });
        }
        break;

      case 'designator':
      case 'interceptor':
      case 'shooter':
      default:
        // `designator` and `interceptor` both need the whole projectile field to
        // do their job, so `MatchSim` drives them; `shooter` runs through the
        // ordinary firing cycle above.
        break;
    }
  }

  /**
   * Flies the projection.
   *
   * Deliberately not a straight line and not a fixed point. It wanders on a
   * slowly-turning heading with a little bob on top, which is close enough to a
   * mech holding station that it has to be *checked* rather than dismissed —
   * and that check is the whole cost the ability imposes.
   *
   * Deterministic: the turn comes off the projection's own age, so a replay
   * reproduces its path exactly.
   */
  private stepDecoy(
    owner: SupporterOwner,
    target: SupporterOwner | null,
    spawns: ProjectileSpawn[],
    events: SimEvent[],
  ): void {
    const age = DECOY_LIFE - this.decoyTicks;
    // A slow S-curve rather than a random walk, so it never doubles back in a
    // way no pilot would.
    this.decoyHeading += Math.sin(age * 0.045) * 0.028;
    this.decoyVx = Math.cos(this.decoyHeading) * DECOY_SPEED;
    this.decoyVy = Math.sin(this.decoyHeading) * DECOY_SPEED + Math.sin(age * 0.11) * 0.55;
    this.decoyX += this.decoyVx;
    this.decoyY += this.decoyVy;
    if (Math.abs(this.decoyVx) > 0.05) this.decoyFacing = this.decoyVx >= 0 ? 1 : -1;

    /**
     * **It shoots.**
     *
     * A silhouette that drifts and never fires is read as a decoy the first time
     * anyone watches it for a second. Firing is what makes it cost attention:
     * the shots look exactly like Io's, they arrive from a plausible angle, and
     * answering them is a decision.
     *
     * They do no damage at all. Their only bite is a one-in-twenty chance of a
     * one-second stun, which is enough that ignoring the projection is not free
     * and far too little to make the ability a damage source. Rolled at spawn
     * out of the match RNG, so a replay reproduces it.
     */
    if (!target || !target.alive) return;
    // Slewed at the drone's own turret rate rather than snapped, exactly as a
    // real chassis leads its mounts round.
    const want = Math.atan2(target.y - this.decoyY, target.x - this.decoyX);
    const delta = wrapAngle(want - this.decoyAim);
    const rate = this.def.turretRate;
    this.decoyAim = wrapAngle(this.decoyAim + Math.max(-rate, Math.min(rate, delta)));

    if (this.decoyFireTimer-- > 0) return;
    this.decoyFireTimer = DECOY_FIRE_PERIOD;
    const ang = this.decoyAim;
    const stun = this.rng.chance(DECOY_STUN_CHANCE);
    spawns.push({
      x: this.decoyX + Math.cos(ang) * 26,
      y: this.decoyY + Math.sin(ang) * 26,
      vx: Math.cos(ang) * DECOY_SHOT_SPEED,
      vy: Math.sin(ang) * DECOY_SHOT_SPEED,
      damage: 0,
      guardDamage: 0,
      life: 46,
      radius: 9,
      ownerId: owner.id,
      team: this.team,
      kind: ProjKind.Bullet,
      barrier: BarrierResponse.Absorb,
      hitstop: 0,
      hitstun: stun ? DECOY_STUN_TICKS : 0,
      knockback: 0,
      homing: 0,
      pierceCount: 0,
      element: Element.None,
      family: 'bolt',
      decoyShot: true,
    });
    events.push({
      t: 'fire',
      x: this.decoyX,
      y: this.decoyY,
      angle: ang,
      kind: ProjKind.Bullet,
      ownerId: owner.id,
      family: 'bolt',
    });
  }

  /** A stationary area effect dropped at the drone's feet: mines, burning ground. */
  private areaSpawn(
    owner: SupporterOwner,
    life: number,
    damage: number,
    radius: number,
    element: Element,
    family: ProjFamilyId,
    visualScale: number,
    offX = 0,
    offY = 0,
    intercepts = false,
  ): ProjectileSpawn {
    return {
      x: this.x + offX,
      y: this.y + offY,
      // Not quite zero: a genuinely motionless projectile is a special case in
      // several places that expect a heading, and this reads as a slow drift.
      vx: 0.001,
      vy: 0.001,
      damage,
      guardDamage: damage * 0.4,
      life,
      radius,
      ownerId: owner.id,
      team: this.team,
      kind: ProjKind.Heavy,
      barrier: BarrierResponse.Absorb,
      hitstop: 5,
      hitstun: 10,
      knockback: 3,
      homing: 0,
      pierceCount: 0,
      element,
      // Without these a dropped charge inherits `pellet` — the smallest shot in
      // the game — so a mine and a patch of burning ground drew as the same
      // three-pixel dot as a rifle round, and as each other.
      family,
      visualScale,
      intercepts,
    };
  }

  /** True when there is something worth spending a charge on. */
  private wantsToFire(owner: SupporterOwner, target: SupporterOwner | null): boolean {
    if (!owner.alive || !target || !target.alive) return false;
    return Math.hypot(target.x - this.x, target.y - this.y) <= this.def.fireRange;
  }

  /** Advances the deploy/recall/stow cycle. */
  private stepMode(owner: SupporterOwner): void {
    const d = this.def;
    this.modeTicks++;

    switch (this.mode) {
      case DroneMode.Deploying:
        if (this.modeTicks >= d.deployTicks) {
          this.mode = DroneMode.Active;
          this.modeTicks = 0;
        }
        break;

      case DroneMode.Recalling:
        if (this.modeTicks >= d.recallTicks) {
          this.mode = DroneMode.Stowed;
          this.modeTicks = 0;
          // Snap onto the dock: it is invisible from here, and leaving stale
          // velocity would fling it across the arena on the next deploy.
          const dock = this.dock(owner);
          this.x = dock.x;
          this.y = dock.y;
          this.vx = 0;
          this.vy = 0;
        }
        break;

      case DroneMode.Rebuilding:
        // Life climbs linearly across the whole rebuild rather than by a
        // per-tick rate, so the bar is a progress meter for the wait and the
        // wait is the same length whatever the chassis's drone happens to have.
        this.life = d.maxLife * this.rebuildFraction;
        if (this.modeTicks >= REBUILD_TICKS) {
          this.life = d.maxLife;
          // Relaunches itself. There is no button to press any more, and a drone
          // that finished rebuilding and then sat in the backpack would be a
          // worse outcome than the permanent death this replaced.
          this.mode = DroneMode.Deploying;
          this.modeTicks = 0;
        }
        break;

      case DroneMode.Stowed:
        // Only reachable now with a downed owner; the drone powers down with the
        // wreck rather than flying formation on it.
        if (this.life < d.maxLife) this.life = Math.min(d.maxLife, this.life + d.repair);
        break;

      default:
        break;
    }
  }

  /** The docking point inside the chassis, where a stowed drone rests. */
  private dock(owner: SupporterOwner): { x: number; y: number } {
    return { x: owner.x - owner.facing * 12, y: owner.y - 4 };
  }

  /**
   * Where the drone wants to be this tick — the whole of its movement AI.
   *
   * Three pulls, summed, then leashed to the owner:
   *
   * 1. **Formation.** The authored rest offset, behind and below the chassis.
   *    This is the anchor; everything else is a displacement from it.
   * 2. **Support.** While it is healthy and the enemy is inside `fireRange`, it
   *    edges toward its own firing line — a little further forward, and level
   *    with the target rather than tucked under its owner's belly. It has a gun
   *    and a range limit, so hovering behind a wall of its owner's chassis makes
   *    it decorative.
   * 3. **Evasion.** Every hostile projectile inside `THREAT_RADIUS` pushes it
   *    away, weighted by how close it is and by whether the shot is actually
   *    coming at the drone rather than merely passing nearby. This is the whole
   *    reason it can survive without a recall button.
   *
   * The result is clamped to `LEASH` of the formation point, which is what makes
   * it read as an escort keeping up with its mech rather than a second fighter
   * wandering off to have its own war. Deterministic throughout.
   */
  /**
   * Which team-up play to run this tick.
   *
   * Strictly ordered rather than scored, and entirely deterministic: the drone
   * has no RNG and a replay has to reproduce its path exactly. Self-preservation
   * outranks everything, then a helpless owner, then the doctrine's own
   * preferences in the order its pilot would want them.
   */
  private chooseTactic(owner: SupporterOwner, target: SupporterOwner | null): DroneTactic {
    if (!this.onStation || !target || !target.alive || !owner.alive) return DroneTactic.Escort;
    // Hurt drones go home. A dead escort helps nobody, and it is one kill from
    // being gone for the match.
    if (this.lifeFraction < DOCTRINES[this.doctrine].regroup) return DroneTactic.Regroup;

    const plays = DOCTRINES[this.doctrine].plays;
    const gap = Math.hypot(target.x - owner.x, target.y - owner.y);

    // A pilot who cannot act is a pilot who needs a body in the way. This one is
    // ungated on range, because it is about the owner rather than the target.
    if (owner.helpless && plays.includes(DroneTactic.Cover)) return DroneTactic.Cover;

    /**
     * **The offensive plays need a fight to join.**
     *
     * Both of them are journeys, and a journey to somewhere the drone cannot
     * shoot from is just time spent out of formation. Gated on the target being
     * inside the drone's own `fireRange`, which also keeps it in formation
     * through the intro and any stretch where the two machines are simply not
     * engaged — without this the escorts set off across the arena on the first
     * tick of the match and never came back.
     */
    const reach = Math.hypot(target.x - this.x, target.y - this.y);
    if (reach > this.def.fireRange) return DroneTactic.Escort;

    // Someone hiding behind a guard has to be given a second problem.
    if ((target.guarding || target.shieldActive) && plays.includes(DroneTactic.Harass)) {
      return DroneTactic.Harass;
    }
    // Enough room between the two machines for a far side to exist.
    if (gap > PINCER_MIN_GAP && plays.includes(DroneTactic.Pincer)) return DroneTactic.Pincer;
    if (plays.includes(DroneTactic.Harass) && gap < PINCER_MIN_GAP) return DroneTactic.Harass;
    return DroneTactic.Escort;
  }

  private station(owner: SupporterOwner, target: SupporterOwner | null, threats: DroneThreat[]): { x: number; y: number } {
    const d = this.def;
    const doc = DOCTRINES[this.doctrine];
    const base = { x: owner.x - owner.facing * d.followBack, y: owner.y + d.followDown };

    this.tactic = this.chooseTactic(owner, target);

    let ox = 0;
    let oy = 0;
    // A pincer overrides the escort radius; every other play keeps it.
    let leash = LEASH * doc.leash;

    // ---- the team-up plays ----------------------------------------------
    if (target && target.alive) {
      const tx = target.x - owner.x;
      const ty = target.y - owner.y;
      const tl = Math.hypot(tx, ty) || 1;
      const ux = tx / tl;
      const uy = ty / tl;

      switch (this.tactic) {
        case DroneTactic.Pincer: {
          // Park beyond the target, on the line out from the owner, so the two
          // of them bracket it. Expressed as an offset from the formation point
          // because everything downstream is.
          leash = PINCER_LEASH;
          ox += tx + ux * PINCER_BEYOND - (base.x - owner.x);
          oy += ty + uy * PINCER_BEYOND - (base.y - owner.y);
          break;
        }
        case DroneTactic.Cover: {
          // Between the owner and whatever is hitting them.
          ox += ux * COVER_AHEAD - (base.x - owner.x);
          oy += uy * COVER_AHEAD - (base.y - owner.y);
          break;
        }
        case DroneTactic.Harass: {
          // Right up on the target, offset to the drone's current side so two
          // harassing escorts do not occupy the same point.
          const side = this.y >= target.y ? 1 : -1;
          ox += tx - ux * HARASS_GAP - (base.x - owner.x);
          oy += ty - uy * HARASS_GAP + side * 46 - (base.y - owner.y);
          leash = LEASH * Math.max(doc.leash, 2.4);
          break;
        }
        default:
          break;
      }
    }

    // ---- support (Escort only; the plays above set their own point) ------
    if (this.tactic === DroneTactic.Escort && this.onStation && target && target.alive) {
      const dist = Math.hypot(target.x - this.x, target.y - this.y);
      // Only when it can actually shoot, and only while it is healthy enough to
      // afford the exposure. A drone on its last few hit points falls back into
      // formation and stops volunteering — a screening doctrine included, since
      // a dead screen screens nothing.
      if (dist <= d.fireRange && this.lifeFraction > 0.4) {
        const dir = Math.sign(target.x - owner.x) || owner.facing;
        ox += dir * SUPPORT_FORWARD * doc.forward;
        // Rise or fall toward the target's line, but only part of the way: fully
        // matching its height puts the drone directly in the firing lane.
        oy += Math.max(-SUPPORT_RISE, Math.min(SUPPORT_RISE, (target.y - base.y) * 0.35));
        // A flanking drone deliberately leaves that lane, so it is not shooting
        // from the same angle its owner is — and is not in the way of it.
        if (doc.offAxis !== 0) {
          oy += target.y >= owner.y ? -doc.offAxis : doc.offAxis;
        }
      }
    }

    // ---- evasion --------------------------------------------------------
    if (this.hittable) {
      for (const t of threats) {
        if (t.team === this.team) continue;
        const dx = this.x - t.x;
        const dy = this.y - t.y;
        const dist = Math.hypot(dx, dy);
        if (dist > THREAT_RADIUS || dist < 0.001) continue;

        // Is it heading at us? A shot already past the drone is not a threat, and
        // treating it as one makes the drone flee its own safe space.
        //
        // `(dx, dy)` points from the shot to the drone, so a shot closing on the
        // drone has its velocity pointing the same way and the dot product is
        // positive. Getting this sign backwards makes the drone dodge everything
        // that has already missed and stand still for everything that has not.
        const speed = Math.hypot(t.vx, t.vy) || 1;
        const closing = (t.vx * dx + t.vy * dy) / (dist * speed);
        if (closing <= 0.1) continue;

        // Push perpendicular to the shot rather than directly away from it:
        // running from a projectile that is faster than you is how you get hit,
        // and stepping out of its lane is how you do not.
        const nx = -t.vy / speed;
        const ny = t.vx / speed;
        const side = nx * dx + ny * dy >= 0 ? 1 : -1;
        const weight = (1 - dist / THREAT_RADIUS) * closing;
        const care = doc.caution * (this.tactic === DroneTactic.Regroup ? 2 : 1);
        ox += nx * side * EVADE_STRENGTH * care * weight;
        oy += ny * side * EVADE_STRENGTH * care * weight;
      }
    }

    // ---- leash ----------------------------------------------------------
    const mag = Math.hypot(ox, oy);
    if (mag > leash) {
      ox = (ox / mag) * leash;
      oy = (oy / mag) * leash;
    }

    // ---- keep out of both chassis ---------------------------------------
    let px = base.x + ox;
    let py = base.y + oy;

    /**
     * **A drone may not attach itself to the mech it is fighting.**
     *
     * Every offensive play wants to be close, and nothing stopped them being
     * *touching*. EMBER was the case that showed it: a hazard trail laid from
     * inside an opponent is not area denial, it is a stunlock, because each
     * ember carries hitstun and they land faster than the victim recovers.
     *
     * A hazard drone is held further off than the rest — its whole job is to
     * make ground dangerous, which does not require standing on the target.
     */
    if (target && target.alive) {
      const gap = this.def.role === 'hazard' ? HAZARD_TARGET_GAP : MIN_TARGET_GAP;
      const tx = px - target.x;
      const ty = py - target.y;
      const td = Math.hypot(tx, ty);
      if (td < gap) {
        const ux = td > 0.001 ? tx / td : -Math.sign(target.x - owner.x) || -1;
        const uy = td > 0.001 ? ty / td : 0;
        px = target.x + ux * gap;
        py = target.y + uy * gap;
      }
    }
    const gx = px - owner.x;
    const gy = py - owner.y;
    const gap = Math.hypot(gx, gy);
    if (gap < MIN_OWNER_GAP) {
      // Straight back along the owner's facing when the two coincide exactly,
      // which is otherwise a divide by zero.
      const ux = gap > 0.001 ? gx / gap : -owner.facing;
      const uy = gap > 0.001 ? gy / gap : 0;
      px = owner.x + ux * MIN_OWNER_GAP;
      py = owner.y + uy * MIN_OWNER_GAP;
    }
    return { x: px, y: py };
  }

  /**
   * Springs toward wherever the drone currently belongs.
   *
   * The reference positioned its helper at a fixed offset scaled by the chassis
   * weight (`Parent,Pos X - 20 * Parent,fvar(11) * Parent,facing`); the spring
   * is this game's take on it, so the drone swings out through turns instead of
   * snapping to a fixed point. The same spring flies it out on a deploy, home on
   * a rebuild, and around incoming fire — only the target point moves.
   */
  private follow(owner: SupporterOwner, target: SupporterOwner | null, threats: DroneThreat[]): void {
    const d = this.def;
    const home =
      this.mode === DroneMode.Recalling ||
      this.mode === DroneMode.Stowed ||
      this.mode === DroneMode.Rebuilding
        ? this.dock(owner)
        : this.station(owner, target, threats);

    // Launch and recall are urgent: pull harder than station-keeping so the trip
    // actually finishes inside the authored window rather than easing forever.
    const transit = this.mode === DroneMode.Deploying || this.mode === DroneMode.Recalling;
    const accel = transit ? d.followAccel * 2.4 : d.followAccel;
    const cap = transit ? d.maxSpeed * 1.5 : d.maxSpeed;

    this.vx += (home.x - this.x) * accel;
    this.vy += (home.y - this.y) * accel;
    this.vx *= d.followDamp;
    this.vy *= d.followDamp;

    const speed = Math.hypot(this.vx, this.vy);
    if (speed > cap) {
      const k = cap / speed;
      this.vx *= k;
      this.vy *= k;
    }

    this.x += this.vx;
    this.y += this.vy;
  }

  /** Turns toward the target at a fixed rate, so the drone visibly leads its shot. */
  private slew(owner: SupporterOwner, target: SupporterOwner | null): void {
    const want =
      target && target.alive && this.onStation
        ? Math.atan2(target.y - this.y, target.x - this.x)
        : owner.facing > 0
          ? 0
          : Math.PI;

    const delta = wrapAngle(want - this.aim);
    const rate = this.def.turretRate;
    this.aim = wrapAngle(this.aim + Math.max(-rate, Math.min(rate, delta)));
    this.facing = Math.cos(this.aim) >= 0 ? 1 : -1;
  }

  /**
   * Puts the drone back on station, for a dummy respawn.
   *
   * Restores its hit points, undoes destruction and hands back the rebuild: a
   * training dummy that could permanently lose its drone would stop being a
   * dummy after one good run.
   */
  reset(owner: SupporterOwner): void {
    this.cancel();
    this.cooldown = 0;
    this.mode = DroneMode.Active;
    this.modeTicks = 0;
    this.life = this.def.maxLife;
    this.rebuildsLeft = MAX_REBUILDS;
    this.x = owner.x - owner.facing * this.def.followBack;
    this.y = owner.y + this.def.followDown;
    this.vx = 0;
    this.vy = 0;
    this.aim = owner.facing > 0 ? 0 : Math.PI;
    this.facing = owner.facing;
  }
}
