import { describe, expect, it } from 'vitest';
import { MatchSim } from '../combat/MatchSim';
import { RivalAI } from '../ai/RivalAI';
import { Rng } from '../core/Rng';
import { Difficulty } from '../core/Session';
import { ARENA_H, ARENA_W } from '../core/GameConfig';
import { MatchPhase } from '../combat/types';
import { HALCYON, NOCTURNE } from '../data/mechs';
import { VESPER, NULLTIDE } from '../data/rosterExtra';
import { Btn, emptyInput, type InputFrame, type SimEvent } from '../combat/types';
import {
  TAG_ARRIVE_MAX,
  TAG_ARRIVE_MIN,
  TAG_COOLDOWN,
  TAG_LATE_MAX,
  TAG_LATE_MIN,
  TAG_LEAVE_TICKS,
  TAG_OPEN_HOLD,
  TAG_REPLY_GAP,
  TAG_REPLY_HOLD,
  TAG_STAY,
  TAG_USES,
  TagState,
} from '../combat/TagPartner';

/**
 * TAG/ASSIST behaviour. `tags.test.ts` covers the pairing and dialogue data;
 * this covers the mechanic — the button, the clock, the limits and the body.
 *
 * Two of these are inherited. "Driven from an ordinary InputFrame" and "presses
 * on the edge only" were written for the drone volley this button used to order
 * and moved here with the button, because they are guarantees about *the
 * control* rather than about what it happened to be wired to.
 */

const W = 2400;
const H = 1200;

function sim(seed = 99): MatchSim {
  return new MatchSim({
    playerDef: HALCYON,
    enemyDef: NOCTURNE,
    // Each machine's first listed partner.
    playerTagDef: VESPER,
    enemyTagDef: NULLTIDE,
    seed,
    introTicks: 2,
    arenaW: W,
    arenaH: H,
  });
}

/** Exactly what InputManager builds when the bound key goes down. */
const TAP: InputFrame = { ...emptyInput(), held: 1 << Btn.Sub, pressed: 1 << Btn.Sub };
const HOLD: InputFrame = { ...emptyInput(), held: 1 << Btn.Sub, pressed: 0 };

function toFight(s: MatchSim, ticks = 6): void {
  for (let i = 0; i < ticks; i++) s.step(emptyInput(), emptyInput());
}

function evs<T extends SimEvent['t']>(s: MatchSim, t: T): Extract<SimEvent, { t: T }>[] {
  return s.events.filter((e): e is Extract<SimEvent, { t: T }> => e.t === t);
}

/** Steps until the player's partner is on stage. Throws rather than hanging. */
function untilPresent(s: MatchSim): void {
  for (let i = 0; i < TAG_LATE_MAX + 60; i++) {
    s.step(emptyInput(), emptyInput());
    if (s.tags[0].state === TagState.Present) return;
  }
  throw new Error('partner never arrived');
}

describe('tag call — the button', () => {
  it('is driven from an ordinary InputFrame, with no private path', () => {
    const s = sim();
    toFight(s);
    s.step(TAP, emptyInput());
    expect(evs(s, 'tagCall').filter((e) => e.ownerId === 0)).toHaveLength(1);
    expect(s.tags[0].state).toBe(TagState.Inbound);
  });

  it('calls on the pressed edge only, never while the button is held', () => {
    const s = sim();
    toFight(s);
    s.step(TAP, emptyInput());
    let calls = evs(s, 'tagCall').length;
    // Held well past a whole visit and most of a cooldown, so a stuck button
    // has every chance to sneak a second call through once the first has left.
    for (let i = 0; i < 900; i++) {
      s.step(HOLD, emptyInput());
      calls += evs(s, 'tagCall').length;
    }
    expect(calls).toBe(1);
  });

  it('is honoured while the chassis is mid-attack', () => {
    // The whole reason the press is read at the top of `step`: a pilot pinned
    // inside an action is exactly who needs to call for help. Routed through
    // `tryStartAction` this press would be dropped without a sound.
    const s = sim();
    toFight(s);
    // Put the chassis into a real action through the real input path, rather
    // than reaching past the private `begin`.
    s.step({ ...emptyInput(), held: 1 << Btn.Main, pressed: 1 << Btn.Main }, emptyInput());
    expect(s.player.attack).toBeTruthy();
    s.step(TAP, emptyInput());
    expect(s.player.attack, 'still mid-action when the call was made').toBeTruthy();
    expect(evs(s, 'tagCall').filter((e) => e.ownerId === 0)).toHaveLength(1);
  });

  it('spends nothing from the drone charge rack', () => {
    const s = sim();
    toFight(s);
    const before = s.player.subCharges;
    s.step(TAP, emptyInput());
    expect(s.player.subCharges).toBe(before);
  });

  it('belongs to both sides equally', () => {
    const s = sim();
    toFight(s);
    s.step(emptyInput(), TAP);
    expect(evs(s, 'tagCall').filter((e) => e.ownerId === 1)).toHaveLength(1);
    expect(s.tags[1].state).toBe(TagState.Inbound);
  });
});

describe('tag call — the limits', () => {
  it('allows exactly two calls a match, and refuses the rest', () => {
    const s = sim();
    toFight(s);
    let honoured = 0;
    let refused = 0;
    for (let i = 0; i < TAG_COOLDOWN * 3; i++) {
      const wasReady = s.tags[0].ready;
      const press = i % 400 === 0;
      s.step(press ? TAP : emptyInput(), emptyInput());
      if (press) {
        if (wasReady) honoured++;
        else refused++;
      }
    }
    expect(honoured).toBe(TAG_USES);
    expect(refused).toBeGreaterThan(0);
    expect(s.tags[0].usesLeft).toBe(0);
  });

  it('holds a cooldown between calls', () => {
    const s = sim();
    toFight(s);
    s.step(TAP, emptyInput());
    expect(s.tags[0].cooldown).toBeGreaterThan(TAG_COOLDOWN - 4);
    const uses = s.tags[0].usesLeft;
    s.step(TAP, emptyInput());
    expect(s.tags[0].usesLeft).toBe(uses);
  });

  it('does not leave a refused press queued to fire itself later', () => {
    const s = sim();
    toFight(s);
    s.step(TAP, emptyInput());
    s.step(TAP, emptyInput());
    expect(s.player.tagRequested).toBe(false);
  });
});

describe('tag call — arrival timing', () => {
  it('arrives inside the normal window, or inside the late one', () => {
    let normals = 0;
    let lates = 0;
    for (let seed = 0; seed < 40; seed++) {
      const s = sim(seed * 7919 + 3);
      toFight(s);
      s.step(TAP, emptyInput());
      const call = evs(s, 'tagCall')[0];
      // One tick of the delay is spent on the tick the call was made.
      const delay = s.tags[0].timer + 1;
      if (call.late) {
        lates++;
        expect(delay).toBeGreaterThanOrEqual(TAG_LATE_MIN);
        expect(delay).toBeLessThanOrEqual(TAG_LATE_MAX);
      } else {
        normals++;
        expect(delay).toBeGreaterThanOrEqual(TAG_ARRIVE_MIN);
        expect(delay).toBeLessThanOrEqual(TAG_ARRIVE_MAX);
      }
    }
    // Both branches have to be reachable; the split is the generator's business.
    expect(normals).toBeGreaterThan(0);
    expect(lates).toBeGreaterThan(0);
  });

  it('announces lateness at the press, not at the arrival', () => {
    // The flag rides `tagCall`, which is raised on the tick the button went
    // down. That is what lets the scene speak the line while it still matters.
    for (let seed = 0; seed < 40; seed++) {
      const s = sim(seed * 7919 + 3);
      toFight(s);
      s.step(TAP, emptyInput());
      if (evs(s, 'tagCall')[0].late) {
        expect(s.tags[0].state).toBe(TagState.Inbound);
        expect(s.tags[0].body).toBeNull();
        return;
      }
    }
    throw new Error('no late roll in 40 seeds');
  });
});

describe('tag partner — the body', () => {
  it('joins the combatant list on arrival and leaves it after four seconds', () => {
    const s = sim();
    toFight(s);
    expect(s.combatants.length).toBe(2);
    s.step(TAP, emptyInput());
    untilPresent(s);

    expect(s.combatants.length).toBe(3);
    const body = s.tags[0].body!;
    expect(body.def.id).toBe('vesper');
    expect(s.combatants).toContain(body);

    // Four seconds up: they start flying out, and are **still in the fight**.
    // A partner who vanishes on the last tick has not left, they have been
    // switched off — `Leaving` is what makes the exit a thing you can watch.
    for (let i = 0; i < TAG_STAY + 2; i++) s.step(emptyInput(), emptyInput());
    expect(s.tags[0].state).toBe(TagState.Leaving);
    expect(s.combatants).toContain(body);

    // Only once the departure clock is done are they actually gone.
    for (let i = 0; i < TAG_LEAVE_TICKS + 2; i++) s.step(emptyInput(), emptyInput());
    expect(s.tags[0].state).toBe(TagState.Idle);
    expect(s.combatants.length).toBe(2);
    expect(s.combatants).not.toContain(body);
  });

  it('cannot be killed, however much damage it takes', () => {
    const s = sim();
    toFight(s);
    s.step(TAP, emptyInput());
    untilPresent(s);
    const body = s.tags[0].body!;

    body.life = 0;
    expect(body.alive).toBe(true);
    s.step(emptyInput(), emptyInput());
    expect(body.life).toBe(body.def.gauges.maxLife);
    expect(body.alive).toBe(true);
  });

  it('still takes hitstun, because unkillable is not untouchable', () => {
    const s = sim();
    toFight(s);
    s.step(TAP, emptyInput());
    untilPresent(s);
    const body = s.tags[0].body!;

    body.interrupt(30);
    expect(body.hitstun).toBeGreaterThan(0);
  });

  it('arrives without its escort', () => {
    const s = sim();
    toFight(s);
    s.step(TAP, emptyInput());
    untilPresent(s);
    const body = s.tags[0].body!;
    for (let i = 0; i < 30; i++) s.step(emptyInput(), emptyInput());
    expect(body.supporter.onStation).toBe(false);
  });

  it('is aimed at the opponent, not at the pilot who called it', () => {
    // `opponentOf` was identity-based and would have handed a player-side
    // partner the player as its target. Team-based, it cannot.
    const s = sim();
    toFight(s);
    s.step(TAP, emptyInput());
    untilPresent(s);
    expect(s.opponentOf(s.tags[0].body!)).toBe(s.enemy);
    expect(s.opponentOf(s.player)).toBe(s.enemy);
    expect(s.opponentOf(s.enemy)).toBe(s.player);
  });

  it('never decides the match', () => {
    const s = sim();
    toFight(s);
    s.step(TAP, emptyInput());
    untilPresent(s);
    s.tags[0].body!.life = 0;
    s.step(emptyInput(), emptyInput());
    expect(s.outcome).toBe('none');
  });

  it('enters from the edge, already moving', () => {
    const s = sim();
    toFight(s);
    s.step(TAP, emptyInput());
    untilPresent(s);
    const body = s.tags[0].body!;
    // Placed at the near edge with real inbound speed rather than teleported
    // into the middle of the fight.
    expect(Math.abs(body.vx)).toBeGreaterThan(0);
    expect(Math.min(body.x, W - body.x)).toBeLessThan(W * 0.25);
  });
});

describe('tag partner — opting out', () => {
  it('does nothing at all when a side has no partner', () => {
    // Every pre-existing caller omits the defs, so the mechanic is off for them
    // and no measurement taken before this feature has moved underneath it.
    const s = new MatchSim({
      playerDef: HALCYON,
      enemyDef: NOCTURNE,
      seed: 5,
      introTicks: 2,
      arenaW: W,
      arenaH: H,
    });
    toFight(s);
    for (let i = 0; i < 400; i++) s.step(TAP, TAP);
    expect(s.combatants.length).toBe(2);
    expect(s.tags[0].state).toBe(TagState.Idle);
    expect(s.tags[0].ready).toBe(false);
  });
});

describe('tag arrival dialogue — timing', () => {
  /**
   * The invariant that broke, and broke silently.
   *
   * `BanterBox.say` refuses a line whose priority is equal to or below the one
   * currently held. Both halves of an arrival are `tagArrive`, so if the opener
   * is still holding the plate when its answer is due, the answer is dropped
   * without a sound and the exchange plays as one line. It did exactly that,
   * and nothing failed — the queue drained, no error was raised, and only
   * watching the screen showed the second half never arrived.
   */
  it('clears the opening line before its answer is due', () => {
    expect(TAG_OPEN_HOLD).toBeLessThan(TAG_REPLY_GAP);
  });

  /**
   * And the whole exchange has to fit inside the visit it belongs to. A partner
   * is on stage for `TAG_STAY`; a conversation still going after they have left
   * is a conversation about nobody. The first cut used the shared banter queue,
   * which releases one line per 190 ticks — two partners arriving together put
   * the last line three visits late.
   */
  it('finishes the exchange while the partner is still on stage', () => {
    expect(TAG_REPLY_GAP + TAG_REPLY_HOLD).toBeLessThanOrEqual(TAG_STAY);
  });
});

describe('tag call — the rival does not mash it', () => {
  /**
   * A refused call raises `assistDenied`, and the scene turns that into a
   * sound. So a rival that presses through its own cooldown is not a wasted
   * branch — it is an audible defect, and it shipped as one: below the life
   * threshold with nothing left to spend, the rival pressed every 90 ticks for
   * the rest of the round. Measured across the roster at **2376 refusals
   * against 194 honoured calls**, roughly one denial cue every three seconds
   * of play per side.
   *
   * A player heard it before any test looked for it. The invariant that would
   * have caught it is this one: the rival may only press when the press can be
   * answered.
   */
  it('never presses TAG/ASSIST while the call cannot be honoured', () => {
    let presses = 0;
    for (let seed = 0; seed < 4; seed++) {
      const s = sim(seed * 613 + 11);
      const a = new RivalAI({ difficulty: Difficulty.Extreme }, new Rng(seed ^ 0x1111));
      const b = new RivalAI({ difficulty: Difficulty.Extreme }, new Rng(seed ^ 0x2222));
      for (let n = 0; n < 2400 && s.phase !== MatchPhase.Over; n++) {
        // Snapshot before `think`, which is what the brain actually reads.
        const readyP = s.player.tagReady;
        const readyE = s.enemy.tagReady;
        const inA = a.think(s.player, s.enemy, s.activeProjectiles(), ARENA_W, ARENA_H);
        const inB = b.think(s.enemy, s.player, s.activeProjectiles(), ARENA_W, ARENA_H);
        if (inA.pressed & (1 << Btn.Sub)) {
          presses++;
          expect(readyP, 'player-side rival pressed an unavailable call').toBe(true);
        }
        if (inB.pressed & (1 << Btn.Sub)) {
          presses++;
          expect(readyE, 'enemy-side rival pressed an unavailable call').toBe(true);
        }
        s.step(inA, inB);
      }
    }
    // The gate must not have simply switched the mechanic off.
    expect(presses, 'the rival never called at all').toBeGreaterThan(0);
  });
});

describe('tag partner — the exit', () => {
  it('flies out rather than blinking off, and is untouchable doing it', () => {
    const s = sim();
    toFight(s);
    s.step(TAP, emptyInput());
    untilPresent(s);
    const body = s.tags[0].body!;

    for (let i = 0; i < TAG_STAY + 2; i++) s.step(emptyInput(), emptyInput());
    expect(s.tags[0].state).toBe(TagState.Leaving);
    // Nothing can interfere with a departure that cannot be stopped anyway.
    expect(body.invulnerable).toBe(true);

    const startX = body.x;
    for (let i = 0; i < 40; i++) s.step(emptyInput(), emptyInput());
    // Under real thrust, through the ordinary flight model, away from centre.
    expect(Math.abs(body.x - startX)).toBeGreaterThan(20);
  });

  /**
   * They have to get *out*, not merely move.
   *
   * The first cut left the arena clamp on during the exit, so a partner flew
   * into the wall, stopped dead against it, and was deleted there — in full
   * view of a camera that had no reason to be looking anywhere else. Measured
   * in play: it stuck at x=26 and vanished on screen. `unbounded` is what lets
   * the departure finish off-stage where it belongs.
   */
  it('clears the arena entirely before it is removed', () => {
    const s = sim();
    toFight(s);
    s.step(TAP, emptyInput());
    untilPresent(s);
    const body = s.tags[0].body!;
    for (let i = 0; i < TAG_STAY + 2; i++) s.step(emptyInput(), emptyInput());
    expect(s.tags[0].state).toBe(TagState.Leaving);
    expect(body.unbounded).toBe(true);

    for (let i = 0; i < TAG_LEAVE_TICKS - 4; i++) s.step(emptyInput(), emptyInput());
    // Past a wall the clamp would otherwise have pinned them against.
    const out = body.x < 0 || body.x > W;
    expect(out, `partner ended at x=${Math.round(body.x)}, still inside 0..${W}`).toBe(true);
  });
});
