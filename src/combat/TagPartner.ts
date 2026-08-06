/**
 * TAG/ASSIST: the second pilot, and the clock they run on.
 *
 * A match is one machine against one machine. Pressing `Btn.Sub` calls a second
 * pilot — one of the two that chassis knows, see `src/data/tags.ts` — who
 * crosses in from off-stage, fights for four seconds and leaves.
 *
 * **Named `tag`, not `assist`, deliberately.** `assist` already means the
 * drone's volley in this codebase (`orderAssist`, `assistDenied`, the `assist`
 * event), and `Bindings.ts` already records that the name drifted once and was
 * left alone because renaming it reaches the audio cue keys. A third meaning on
 * the same word would be worse than an unfamiliar one.
 *
 * Three rules make this a decision rather than a free hit:
 *
 * * **Two calls a match.** Not a resource that regenerates — a thing you have
 *   twice and then do not have.
 * * **Thirty seconds between them**, which is a third of the round cap, so the
 *   second call is a genuinely separate decision from the first.
 * * **They are not instant.** Help is one to three seconds away, and one call in
 *   five is four to seven. That gap is the whole texture of the mechanic: you
 *   are committing to a situation you cannot fully predict, and the late roll is
 *   announced the moment you press so the gap can be played around rather than
 *   merely suffered.
 *
 * The partner **cannot be killed** — no life bar is drawn and no KO can be
 * scored on them — but they are otherwise an ordinary combatant: they take
 * hitstun, stagger, knockback and every status effect in the game. Being
 * unkillable is not the same as being untouchable, and a partner frozen solid or
 * knocked into a wall for their whole four seconds has been neutralised.
 *
 * They arrive **without their escort**. One extra chassis is already a large
 * amount of new output; one extra chassis plus a drone is a different game.
 */
import type { MechDef } from '../mechs/MechDef';
import type { Rng } from '../core/Rng';
import { Combatant } from './Combatant';
import { Team } from './types';

/** Where a side's partner is in their cycle. */
export const enum TagState {
  /** Nobody called, or the last one has left. */
  Idle = 0,
  /** Called, still crossing. `timer` counts down to arrival. */
  Inbound = 1,
  /** On stage and fighting. `timer` counts down to departure. */
  Present = 2,
  /**
   * Their four seconds are up and they are flying out.
   *
   * A separate state rather than deleting the body on the last tick, because a
   * partner who vanishes mid-air has not left — they have been switched off.
   * They still exist here, still move under the ordinary flight model, and are
   * only removed once they are clear of the frame.
   */
  Leaving = 3,
}

/** Calls per match. Hard limit; nothing refunds one. */
export const TAG_USES = 2;
/** Ticks between calls — 30 s at 60 Hz, a third of the round cap. */
export const TAG_COOLDOWN = 1800;
/** Ticks on stage — 4 s. */
export const TAG_STAY = 240;

/**
 * Arrival-dialogue timing. Presentation values, but they live here because they
 * are only meaningful against `TAG_STAY` — an exchange that outlasts the visit
 * is an exchange nobody hears the end of. `tagpartner.test.ts` pins the two
 * relationships that matter; both were got wrong first.
 */
/** Ticks between the partner's arrival line and their caller's answer. */
export const TAG_REPLY_GAP = 80;
/**
 * How long the *opening* line holds the plate.
 *
 * **Must be under `TAG_REPLY_GAP`.** `BanterBox` refuses a line of equal or
 * lower priority while one is still held, so an opener that outlasts the gap
 * eats its own answer — which it did, silently, and the exchange played as a
 * single line every time. Clearing first means the answer lands in an empty box
 * and is accepted by the ordinary rules rather than needing an exception.
 */
export const TAG_OPEN_HOLD = 72;
/** The closing line has nothing after it, so it may sit as long as any banter. */
export const TAG_REPLY_HOLD = 140;
/** Normal arrival window, in ticks: 1–3 s. */
export const TAG_ARRIVE_MIN = 60;
export const TAG_ARRIVE_MAX = 180;
/** Late arrival window, in ticks: 4–7 s. */
export const TAG_LATE_MIN = 240;
export const TAG_LATE_MAX = 420;
/** Share of calls that come in late. */
export const TAG_LATE_CHANCE = 0.2;
/**
 * How far outside the arena edge they start.
 *
 * `clampToArena` snaps anything past the boundary straight back in on its first
 * step, so a partner spawned genuinely off-stage would simply appear at the edge
 * with no motion. They start *at* the edge instead, carrying the inbound speed
 * below — the boost-in is real movement rather than a fake entrance, and it
 * survives the clamp because it never fights it.
 */
export const TAG_ENTRY_SPEED = 26;
/**
 * How far behind their caller a partner begins the approach.
 *
 * Wider than the camera's half-view at the zoom a two-machine fight settles at
 * (~560 px), so the entrance starts outside the shot. `BattleScene` deliberately
 * leaves an arriving partner out of the camera's framing list, which is what
 * lets this read as an approach rather than an appearance.
 */
export const TAG_ENTRY_STANDOFF = 820;
/**
 * Ticks spent flying back out, and how hard they push to do it.
 *
 * 1.5 s is enough to clear the frame at the zoom a two-machine fight sits at,
 * and it is deliberately *not* gated on actually crossing the arena boundary —
 * a partner wedged in a corner by knockback would never satisfy that test and
 * would hang around forever. The clock is the authority; the motion is the
 * presentation of it.
 */
export const TAG_LEAVE_TICKS = 90;
export const TAG_EXIT_SPEED = 30;

/** What the caller needs to know to draw and voice a call. */
export interface TagCall {
  /** Ticks until they arrive, at the moment of the press. */
  delay: number;
  /** True when this call rolled the late window. */
  late: boolean;
  /** Which of the five written exchanges this call uses, 0..1. */
  roll: number;
}

/**
 * One side's partner slot.
 *
 * Owns the clock and the body; owns no rendering and no dialogue. `MatchSim`
 * drives it, `BattleScene` reads it.
 */
export class TagSlot {
  state: TagState = TagState.Idle;
  usesLeft = TAG_USES;
  /** Ticks until another call is allowed. */
  cooldown = 0;
  /** Inbound: ticks to arrival. Present: ticks to departure. */
  timer = 0;
  /** The fighting body, only while `Present`. */
  body: Combatant | null = null;
  /** The pending call's roll, so arrival dialogue matches the press. */
  private pending: TagCall | null = null;

  constructor(
    /** The partner's chassis, or null when this side has no partner at all. */
    readonly def: MechDef | null,
    readonly team: Team,
    /** Combatant id for the body. Distinct from 0 and 1, which are the pilots. */
    readonly bodyId: number,
  ) {}

  /** True when a press right now would be accepted. */
  get ready(): boolean {
    return (
      this.def !== null && this.state === TagState.Idle && this.usesLeft > 0 && this.cooldown <= 0
    );
  }

  /**
   * Answers the button.
   *
   * Rolls the arrival window immediately rather than on arrival, because the
   * late line is spoken at press time — the player is told help is slow while
   * there is still time to do something about it. Returns null when the press is
   * refused, so the caller can play a denial cue instead of a promise.
   */
  call(rng: Rng): TagCall | null {
    if (!this.ready) return null;
    const late = rng.next() < TAG_LATE_CHANCE;
    const [lo, hi] = late ? [TAG_LATE_MIN, TAG_LATE_MAX] : [TAG_ARRIVE_MIN, TAG_ARRIVE_MAX];
    const call: TagCall = {
      delay: lo + Math.floor(rng.next() * (hi - lo + 1)),
      late,
      roll: rng.next(),
    };
    this.usesLeft--;
    this.cooldown = TAG_COOLDOWN;
    this.state = TagState.Inbound;
    this.timer = call.delay;
    this.pending = call;
    return call;
  }

  /**
   * Advances the clock by one tick.
   *
   * Returns `'arrive'` on the tick the body should enter play and `'leave'` on
   * the tick it should be taken out, so `MatchSim` owns the one place the
   * combatant list is edited. Everything else returns null.
   *
   * The cooldown runs down **alongside** the inbound and present states rather
   * than starting when they end. Thirty seconds is already long enough that
   * stacking the four-second visit on top of it would put the second call out of
   * reach in most fights.
   */
  step(owner: Combatant, arenaW: number, rng: Rng): 'arrive' | 'leave' | 'gone' | null {
    if (this.cooldown > 0) this.cooldown--;

    switch (this.state) {
      case TagState.Inbound:
        this.timer--;
        if (this.timer <= 0) {
          this.state = TagState.Present;
          this.timer = TAG_STAY;
          this.spawn(owner, arenaW, rng);
          return 'arrive';
        }
        return null;

      case TagState.Present:
        this.timer--;
        if (this.timer <= 0) {
          this.state = TagState.Leaving;
          this.timer = TAG_LEAVE_TICKS;
          return 'leave';
        }
        return null;

      case TagState.Leaving:
        this.timer--;
        if (this.timer <= 0) {
          this.state = TagState.Idle;
          this.body = null;
          this.pending = null;
          return 'gone';
        }
        return null;

      default:
        return null;
    }
  }

  /** The roll for the call currently inbound or present, for dialogue lookup. */
  get callRoll(): number {
    return this.pending?.roll ?? 0;
  }

  /**
   * Puts the body at the near edge, already moving.
   *
   * Enters from **whichever side of the arena their caller is nearer**, so the
   * partner crosses toward the fight rather than through it, and faces the way
   * they are travelling.
   */
  private spawn(owner: Combatant, arenaW: number, rng: Rng): void {
    if (!this.def) return;
    const fromLeft = owner.x < arenaW * 0.5;
    const radius = this.def.rig.hurtRadius;
    /**
     * Well behind their caller, not at the nearest wall.
     *
     * The first cut put them on the arena edge, which is only *far away* when
     * the fight happens to be in the middle — a pilot pinned against the left
     * wall got a partner materialising a body-length behind them. `TAG_ENTRY_
     * STANDOFF` is wider than the camera's half-width at the zoom a two-machine
     * fight sits at, so the approach begins outside the shot and they fly into
     * it. Clamped into the arena because `clampToArena` would otherwise snap
     * them back on their first step and undo the whole thing.
     */
    const x = Math.min(
      arenaW - radius,
      Math.max(radius, owner.x + (fromLeft ? -TAG_ENTRY_STANDOFF : TAG_ENTRY_STANDOFF)),
    );
    const body = new Combatant({
      id: this.bodyId,
      team: this.team,
      def: this.def,
      x,
      y: owner.y,
      facing: fromLeft ? 1 : -1,
      // The match generator, so a partner's own rolls stay inside the replay.
      rng,
    });
    // Unkillable, and the escort stays home.
    body.deathless = true;
    body.supporter.stow();
    // The entrance is a real boost, carried into the flight model rather than
    // drawn on top of it.
    body.vx = fromLeft ? TAG_ENTRY_SPEED : -TAG_ENTRY_SPEED;
    body.groundY = owner.groundY;
    this.body = body;
  }
}
