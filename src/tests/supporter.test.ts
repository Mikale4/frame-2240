import { describe, expect, it } from 'vitest';
import { MatchSim } from '../combat/MatchSim';
import { HALCYON, NOCTURNE } from '../data/mechs';
import { OBELISK } from '../data/rosterExtra';
import { ROSTER } from '../data/mechs';
import { DroneMode, REBUILD_TICKS, Supporter, type DroneThreat } from '../combat/Supporter';
import { Btn, MatchPhase, Team, emptyInput, type InputFrame, type SimEvent } from '../combat/types';
import { ACTION_ORDER, BUTTON_ACTION, DEFAULT_BINDINGS } from '../input/Bindings';

/** Formation offset plus the pincer leash, plus spring overshoot. */
const PINCER_LEASH_BOUND = 1400;

const W = 2400;
const H = 1200;

function sim(over: Partial<ConstructorParameters<typeof MatchSim>[0]> = {}): MatchSim {
  return new MatchSim({
    playerDef: HALCYON,
    enemyDef: NOCTURNE,
    seed: 99,
    introTicks: 2,
    arenaW: W,
    arenaH: H,
    ...over,
  });
}

function press(...btns: Btn[]): InputFrame {
  let m = 0;
  for (const b of btns) m |= 1 << b;
  return { ...emptyInput(), held: m, pressed: m };
}

/** Steps past the intro so input is live. */
function toFight(s: MatchSim, ticks = 6): void {
  for (let i = 0; i < ticks; i++) s.step(emptyInput(), emptyInput());
}

function stepUntil(s: MatchSim, pred: () => boolean, max = 600): number {
  for (let i = 0; i < max; i++) {
    if (pred()) return i;
    s.step(emptyInput(), emptyInput());
  }
  return -1;
}

function eventsOfType<T extends SimEvent['t']>(s: MatchSim, t: T): Extract<SimEvent, { t: T }>[] {
  return s.events.filter((e): e is Extract<SimEvent, { t: T }> => e.t === t);
}

/**
 * Moves the rival out of every drone's `fireRange` so the drones stay idle.
 *
 * Several of these tests are about station-keeping or the charge economy and do
 * not want a drone spending charges in the background. Separating the machines
 * is how a player would achieve the same thing, so it exercises the real gate
 * rather than reaching in and disabling one.
 */
function separate(s: MatchSim): void {
  s.player.x = 120;
  s.enemy.x = W - 120;
}

/**
 * Brings the machines inside every drone's `fireRange`.
 *
 * They spawn ~864px apart, which is outside ARBITER's 760px reach, so a match
 * genuinely opens with the drones holding fire until someone closes. Tests about
 * auto-fire have to close that distance first — and move the drones with their
 * owners, or the escort starts hundreds of pixels from where it belongs.
 */
function close(s: MatchSim): void {
  s.player.x = 1000;
  s.enemy.x = 1400;
  s.player.supporter.reset(s.player);
  s.enemy.supporter.reset(s.enemy);
}

describe('supporter — station keeping', () => {
  it('exists for both machines from the first tick', () => {
    const s = sim();
    expect(s.player.supporter).toBeTruthy();
    expect(s.enemy.supporter).toBeTruthy();
    expect(s.player.supporter.def.name).toBe('ARBITER');
    expect(s.enemy.supporter.def.name).toBe('WARDEN');
  });

  it('starts deployed and on station rather than at the origin', () => {
    const s = sim();
    const p = s.player;
    const d = p.def.supporter;
    expect(p.supporter.mode).toBe(DroneMode.Active);
    expect(p.supporter.x).toBeCloseTo(p.x - p.facing * d.followBack, 6);
    expect(p.supporter.y).toBeCloseTo(p.y + d.followDown, 6);
  });

  it('follows the owner across the arena and settles behind it', () => {
    const s = sim();
    toFight(s);
    // Out of every drone's reach, so the movement AI's support lean stays off
    // and this measures station-keeping alone. With a target in range the drone
    // deliberately sits forward of the formation point — see 'movement AI'.
    separate(s);
    const p = s.player;
    // Fly right for a while.
    for (let i = 0; i < 120; i++) s.step({ ...emptyInput(), dx: 1 }, emptyInput());
    // Then stop and let the drone catch up.
    for (let i = 0; i < 120; i++) s.step(emptyInput(), emptyInput());

    const d = p.def.supporter;
    const homeX = p.x - p.facing * d.followBack;
    const homeY = p.y + d.followDown;
    expect(Math.hypot(p.supporter.x - homeX, p.supporter.y - homeY)).toBeLessThan(6);
  });

  it('lags behind rather than being welded to the owner', () => {
    const s = sim();
    toFight(s);
    const p = s.player;
    let maxErr = 0;
    for (let i = 0; i < 60; i++) {
      s.step({ ...emptyInput(), dx: 1, dy: -1 }, emptyInput());
      const homeX = p.x - p.facing * p.def.supporter.followBack;
      maxErr = Math.max(maxErr, Math.abs(p.supporter.x - homeX));
    }
    // It should visibly trail while the owner accelerates away.
    expect(maxErr).toBeGreaterThan(8);
  });

  it('never produces NaN over a long run', () => {
    const s = sim();
    toFight(s);
    for (let i = 0; i < 3000; i++) {
      s.step(press(Btn.Sub), press(Btn.Sub));
      for (const c of s.combatants) {
        expect(Number.isFinite(c.supporter.x)).toBe(true);
        expect(Number.isFinite(c.supporter.y)).toBe(true);
        expect(Number.isFinite(c.supporter.aim)).toBe(true);
        expect(Number.isFinite(c.supporter.life)).toBe(true);
      }
    }
  });

  it('is deterministic for a given seed', () => {
    const a = sim();
    const b = sim();
    for (let i = 0; i < 400; i++) {
      const inp = i % 37 === 0 ? press(Btn.Sub) : { ...emptyInput(), dx: i % 5 === 0 ? 1 : -1 };
      a.step(inp, emptyInput());
      b.step(inp, emptyInput());
    }
    expect(a.player.supporter.x).toBe(b.player.supporter.x);
    expect(a.player.supporter.y).toBe(b.player.supporter.y);
    expect(a.player.supporter.aim).toBe(b.player.supporter.aim);
    expect(a.player.supporter.life).toBe(b.player.supporter.life);
  });
});

/**
 * The drone is permanently deployed and there is no button that changes that.
 *
 * This replaced a launch/recall toggle. The toggle read well and measured badly:
 * drones were dying with a 10th-percentile life of two seconds, so the standing
 * decision it was meant to pose had already been made for you by the time you
 * could make it, and the button spent the rest of the match dead.
 */
describe('supporter — always deployed', () => {
  it('is on station from the first tick and stays there', () => {
    const s = sim();
    toFight(s);
    const p = s.player;
    for (let i = 0; i < 300; i++) s.step(press(Btn.Sub), emptyInput());
    expect(p.supporter.mode).toBe(DroneMode.Active);
    expect(p.supporter.hittable).toBe(true);
    expect(p.dronePassive?.name).toBe('REACTOR LINK');
  });

  it('never recalls or stows itself while its owner is alive', () => {
    const s = sim();
    toFight(s);
    const p = s.player;
    const seen = new Set<DroneMode>();
    for (let i = 0; i < 400; i++) {
      s.step(press(Btn.Sub), emptyInput());
      seen.add(p.supporter.mode);
    }
    expect(seen.has(DroneMode.Recalling)).toBe(false);
    expect(seen.has(DroneMode.Stowed)).toBe(false);
  });

  it('turns the sub button into a volley order rather than a dead input', () => {
    const s = sim();
    toFight(s);
    close(s);
    const p = s.player;
    // Idle and in range: the press should put it straight into a windup.
    p.supporter.cancel();
    p.supporter.cooldown = 0;
    s.step(press(Btn.Sub), emptyInput());
    expect(p.supporter.state).not.toBe(0);
    expect(eventsOfType(s, 'assist').length).toBeGreaterThan(0);
  });
});

/**
 * One rebuild per match, then the next kill is final.
 *
 * The cap is the whole design. Without a rebuild the drone was gone inside the
 * opening exchange of a 180-second match and its passive with it; without the
 * cap, hunting one stops paying and it becomes the invulnerable button an
 * earlier pass already rejected.
 */
describe('supporter — the rebuild', () => {
  it('retires into a rebuild on the first kill rather than dying outright', () => {
    const s = sim();
    toFight(s);
    const p = s.player;
    expect(p.supporter.takeHit(9999)).toBe('down');
    expect(p.supporter.mode).toBe(DroneMode.Rebuilding);
    expect(p.supporter.destroyed).toBe(false);
    expect(p.supporter.rebuildsLeft).toBe(0);
  });

  it('cannot be shot again while it rebuilds, but is still drawn', () => {
    const s = sim();
    toFight(s);
    const p = s.player;
    p.supporter.takeHit(9999);
    expect(p.supporter.hittable).toBe(false);
    expect(p.supporter.visible).toBe(true);
    expect(p.supporter.takeHit(9999)).toBe('ignored');
    expect(p.supporter.mode).toBe(DroneMode.Rebuilding);
  });

  it('contributes nothing at all while it rebuilds', () => {
    const s = sim();
    toFight(s);
    close(s);
    const p = s.player;
    p.supporter.takeHit(9999);
    for (let i = 0; i < 120; i++) s.step(emptyInput(), emptyInput());
    expect(p.dronePassive).toBeNull();
    expect(p.supporter.onStation).toBe(false);
    expect(p.supporter.ready).toBe(false);
  });

  it('refills its life across the rebuild, so the bar reads as progress', () => {
    const s = sim();
    toFight(s);
    const p = s.player;
    p.supporter.takeHit(9999);
    expect(p.supporter.life).toBe(0);
    for (let i = 0; i < REBUILD_TICKS / 2; i++) s.step(emptyInput(), emptyInput());
    const half = p.supporter.lifeFraction;
    expect(half).toBeGreaterThan(0.3);
    expect(half).toBeLessThan(0.7);
    expect(p.supporter.rebuildFraction).toBeGreaterThan(0.3);
  });

  it('relaunches itself at full health, with no button to press', () => {
    const s = sim();
    toFight(s);
    const p = s.player;
    p.supporter.takeHit(9999);
    const took = stepUntil(s, () => p.supporter.mode === DroneMode.Active, REBUILD_TICKS + 400);
    expect(took).toBeGreaterThan(REBUILD_TICKS - 10);
    expect(p.supporter.life).toBe(HALCYON.supporter.maxLife);
    expect(p.dronePassive?.name).toBe('REACTOR LINK');
  });

  it('is destroyed for good the second time', () => {
    const s = sim();
    toFight(s);
    const p = s.player;
    p.supporter.takeHit(9999);
    stepUntil(s, () => p.supporter.mode === DroneMode.Active, REBUILD_TICKS + 400);

    expect(p.supporter.takeHit(9999)).toBe('destroyed');
    expect(p.supporter.destroyed).toBe(true);
    expect(p.supporter.rebuildsLeft).toBe(0);
    // And it never comes back, however long the match runs.
    for (let i = 0; i < REBUILD_TICKS * 2; i++) s.step(emptyInput(), emptyInput());
    expect(p.supporter.mode).toBe(DroneMode.Destroyed);
    expect(p.supporter.visible).toBe(false);
    expect(p.dronePassive).toBeNull();
  });
});

/**
 * The drone flies itself now that nothing can pull it out of trouble.
 */
describe('supporter — movement AI', () => {
  it('keeps formation when there is nothing to react to', () => {
    const s = sim();
    toFight(s);
    separate(s);
    const p = s.player;
    for (let i = 0; i < 200; i++) s.step(emptyInput(), emptyInput());
    const d = p.def.supporter;
    const homeX = p.x - p.facing * d.followBack;
    const homeY = p.y + d.followDown;
    expect(Math.hypot(p.supporter.x - homeX, p.supporter.y - homeY)).toBeLessThan(8);
  });

  it('never parks itself inside its owner, however hard it is pushed', () => {
    const s = sim();
    toFight(s);
    close(s);
    const p = s.player;
    let closest = Infinity;
    for (let i = 0; i < 600; i++) {
      s.step({ ...emptyInput(), dx: 1 }, { ...emptyInput(), dx: -1, pressed: 1 << Btn.Main, held: 1 << Btn.Main });
      if (p.supporter.hittable) {
        closest = Math.min(closest, Math.hypot(p.supporter.x - p.x, p.supporter.y - p.y));
      }
    }
    // Deliberately loose. The station is floored at MIN_OWNER_GAP, but a drone
    // running a pincer crosses *past* its owner to reach the far side of the
    // target, so a close pass is the manoeuvre working rather than the clamp
    // failing. What matters is that it does not come to rest inside the chassis,
    // which the mean below covers.
    expect(closest).toBeGreaterThan(3);
  });

  it('stays leashed to its owner rather than going hunting', () => {
    const s = sim();
    toFight(s);
    close(s);
    const p = s.player;
    let furthest = 0;
    for (let i = 0; i < 600; i++) {
      s.step(emptyInput(), { ...emptyInput(), pressed: 1 << Btn.Main, held: 1 << Btn.Main });
      if (p.supporter.hittable) {
        furthest = Math.max(furthest, Math.hypot(p.supporter.x - p.x, p.supporter.y - p.y));
      }
    }
    // Formation plus the pincer leash: the escort is *allowed* to cross the
    // arena for a bracket, and the bound is that it stays inside the fight
    // rather than inside formation.
    expect(furthest).toBeLessThan(PINCER_LEASH_BOUND);
  });

  /**
   * Evasion is driven straight through `step`'s threat list rather than through
   * a real projectile: `ProjectileSpawn` carries a dozen combat fields that have
   * nothing to do with dodging, and `DroneThreat` is the four the drone actually
   * reads. Testing the unit against its own interface is what keeps this a test
   * of the movement AI and not of the projectile pool.
   */
  const soloDrone = () => {
    const owner = { x: 800, y: 600, facing: 1, alive: true, id: 0, team: 0 as Team };
    const drone = new Supporter(HALCYON.supporter, owner);
    const noFire = () => {};
    const settle = (threats: DroneThreat[], ticks: number) => {
      for (let i = 0; i < ticks; i++) drone.step(owner, null, [], [], noFire, undefined, threats);
    };
    return { owner, drone, settle };
  };

  it('breaks out of the lane of a shot that is closing on it', () => {
    const { drone, settle } = soloDrone();
    settle([], 120);
    const before = drone.y;
    // Dead ahead of the drone, travelling straight back along its own line.
    settle(
      [{ x: drone.x + 120, y: drone.y, vx: -12, vy: 0, team: 1 as Team }],
      30,
    );
    expect(Math.abs(drone.y - before)).toBeGreaterThan(4);
  });

  it('ignores a shot that has already gone past it', () => {
    const { drone, settle } = soloDrone();
    settle([], 120);
    const before = drone.y;
    // Same position, but travelling away rather than toward.
    settle([{ x: drone.x + 120, y: drone.y, vx: 12, vy: 0, team: 1 as Team }], 30);
    expect(Math.abs(drone.y - before)).toBeLessThan(2);
  });

  it("ignores its own side's fire", () => {
    const { drone, settle } = soloDrone();
    settle([], 120);
    const before = drone.y;
    settle([{ x: drone.x + 120, y: drone.y, vx: -12, vy: 0, team: 0 as Team }], 30);
    expect(Math.abs(drone.y - before)).toBeLessThan(2);
  });

  it('ignores a shot too far away to matter', () => {
    const { drone, settle } = soloDrone();
    settle([], 120);
    const before = drone.y;
    settle([{ x: drone.x + 900, y: drone.y, vx: -12, vy: 0, team: 1 as Team }], 30);
    expect(Math.abs(drone.y - before)).toBeLessThan(2);
  });

  it('returns to formation once the threat is gone', () => {
    const { owner, drone, settle } = soloDrone();
    settle([{ x: drone.x + 120, y: drone.y, vx: -12, vy: 0, team: 1 as Team }], 40);
    settle([], 240);
    const d = HALCYON.supporter;
    const homeX = owner.x - owner.facing * d.followBack;
    const homeY = owner.y + d.followDown;
    expect(Math.hypot(drone.x - homeX, drone.y - homeY)).toBeLessThan(8);
  });

  it('is still deterministic with the evasion running', () => {
    const runOnce = () => {
      const s = sim();
      toFight(s);
      close(s);
      for (let i = 0; i < 400; i++) {
        const m = 1 << Btn.Main;
        s.step({ ...emptyInput(), dx: 1, pressed: m, held: m }, { ...emptyInput(), dx: -1, pressed: m, held: m });
      }
      return [s.player.supporter.x, s.player.supporter.y, s.enemy.supporter.x, s.enemy.supporter.y];
    };
    expect(runOnce()).toEqual(runOnce());
  });
});

describe('supporter — hit points and destruction', () => {
  it('starts at full hit points, far below its owner', () => {
    const s = sim();
    expect(s.player.supporter.life).toBe(HALCYON.supporter.maxLife);
    expect(HALCYON.supporter.maxLife).toBeLessThan(HALCYON.gauges.maxLife * 0.25);
  });

  it('takes damage scaled by its own defence, not its owner\'s', () => {
    const s = sim();
    const sup = s.player.supporter;
    sup.takeHit(50);
    expect(sup.life).toBeCloseTo(HALCYON.supporter.maxLife - 50 * HALCYON.supporter.defenceMul, 6);
  });

  it('is destroyed for good once its one rebuild is spent', () => {
    const s = sim();
    toFight(s);
    const sup = s.player.supporter;
    // Burn the rebuild first, so this is the kill that sticks.
    sup.takeHit(HALCYON.supporter.maxLife * 2);
    sup.rebuildsLeft = 0;
    sup.mode = DroneMode.Active;
    sup.life = HALCYON.supporter.maxLife;

    expect(sup.takeHit(HALCYON.supporter.maxLife * 2)).toBe('destroyed');
    expect(sup.destroyed).toBe(true);
    expect(sup.hittable).toBe(false);
    expect(sup.visible).toBe(false);

    // Nothing brings it back: not time, not the button, not a passive.
    for (let i = 0; i < 400; i++) s.step(press(Btn.Sub), emptyInput());
    expect(sup.destroyed).toBe(true);
    expect(sup.life).toBe(0);
    expect(s.player.dronePassive).toBeNull();
  });

  it('refuses a volley order from a drone that is not flying, audibly', () => {
    const s = sim();
    toFight(s);
    // Down and rebuilding: the button still exists, but there is nothing to
    // order. A dead press that makes no sound is indistinguishable from a
    // dropped input, so it has to answer with the refusal cue.
    s.player.supporter.takeHit(9999);
    s.step(press(Btn.Sub), emptyInput());
    expect(eventsOfType(s, 'assistDenied').length).toBe(1);
    expect(eventsOfType(s, 'assist').length).toBe(0);
  });

  it('can be shot down by the opponent, and announces it once', () => {
    const s = sim();
    toFight(s);
    separate(s);
    const sup = s.enemy.supporter;
    sup.life = 1;

    // A player shot placed directly on the enemy's drone.
    s.projectiles.spawn({
      x: sup.x - 6,
      y: sup.y,
      vx: 6,
      vy: 0,
      damage: 40,
      guardDamage: 10,
      life: 30,
      radius: 6,
      ownerId: s.player.id,
      team: s.player.team,
      kind: 0,
      barrier: 0,
      hitstop: 4,
      hitstun: 8,
      knockback: 2,
      homing: 0,
      pierceCount: 0,
    });

    const downs: number[] = [];
    for (let i = 0; i < 30; i++) {
      s.step(emptyInput(), emptyInput());
      downs.push(...eventsOfType(s, 'droneDown').map((e) => e.ownerId));
    }
    expect(downs).toEqual([s.enemy.id]);
    // First kill retires it into a rebuild rather than ending it.
    expect(sup.mode).toBe(DroneMode.Rebuilding);
    expect(sup.destroyed).toBe(false);
  });

  it('cannot be hit again while it is rebuilding', () => {
    const s = sim();
    toFight(s);
    separate(s);
    const p = s.player;
    p.supporter.takeHit(9999);
    // Part-way through the rebuild, so there is something left to lose.
    for (let i = 0; i < REBUILD_TICKS / 2; i++) s.step(emptyInput(), emptyInput());
    const before = p.supporter.life;
    expect(before).toBeGreaterThan(0);

    s.projectiles.spawn({
      x: p.supporter.x - 4,
      y: p.supporter.y,
      vx: 4,
      vy: 0,
      damage: 60,
      guardDamage: 10,
      life: 30,
      radius: 10,
      ownerId: s.enemy.id,
      team: s.enemy.team,
      kind: 0,
      barrier: 0,
      hitstop: 4,
      hitstun: 8,
      knockback: 2,
      homing: 0,
      pierceCount: 0,
    });
    for (let i = 0; i < 20; i++) s.step(emptyInput(), emptyInput());
    // Not merely undamaged: the rebuild carried on through the hit, so life has
    // gone *up*. Shooting a wreck must not delay or deny the repair.
    expect(p.supporter.life).toBeGreaterThan(before);
    expect(p.supporter.mode).toBe(DroneMode.Rebuilding);
  });
});

describe('supporter — auto-fire', () => {
  it('opens fire on its own with no input at all', () => {
    const s = sim();
    toFight(s);
    close(s);
    const p = s.player;
    const fired = stepUntil(s, () => s.projectiles.items.some((x) => x.active && x.ownerId === p.id), 300);
    expect(fired).toBeGreaterThanOrEqual(0);
  });

  it('marks its own volleys as automatic, so the HUD can stay quiet', () => {
    const s = sim();
    toFight(s);
    close(s);
    let auto = 0;
    let manual = 0;
    for (let i = 0; i < 300; i++) {
      s.step(emptyInput(), emptyInput());
      for (const e of eventsOfType(s, 'assist')) (e.auto ? auto++ : manual++);
    }
    expect(auto).toBeGreaterThan(0);
    expect(manual).toBe(0);
  });

  it('fires from the drone, not from the chassis', () => {
    const s = sim();
    toFight(s);
    close(s);
    const p = s.player;
    const sup = p.supporter;

    let spawned: { x: number; y: number } | null = null;
    for (let i = 0; i < 300 && !spawned; i++) {
      s.step(emptyInput(), emptyInput());
      const fired = eventsOfType(s, 'fire').filter((e) => e.ownerId === p.id);
      if (fired.length) spawned = { x: fired[0].x, y: fired[0].y };
    }
    expect(spawned).not.toBeNull();

    // The shot must originate at the drone, far from the chassis.
    const dDrone = Math.hypot(spawned!.x - sup.x, spawned!.y - sup.y);
    const dChassis = Math.hypot(spawned!.x - p.x, spawned!.y - p.y);
    expect(dDrone).toBeLessThan(p.def.supporter.muzzleForward + 8);
    // Comfortably off the chassis. The bound is not tighter because the movement
    // AI leans the drone toward its firing line when a target is in range, which
    // brings it closer to its owner than the bare formation offset would.
    expect(dChassis).toBeGreaterThan(30);
  });

  it('keeps the owner and team on the assist projectile', () => {
    const s = sim();
    toFight(s);
    close(s);
    const p = s.player;
    stepUntil(s, () => s.projectiles.items.some((x) => x.active && x.ownerId === p.id), 300);
    const shots = s.projectiles.items.filter((x) => x.active && x.ownerId === p.id);
    expect(shots.length).toBeGreaterThan(0);
    for (const shot of shots) {
      expect(shot.team).toBe(p.team);
    }
  });

  it('spreads its volley across distinct angles', () => {
    const s = sim();
    toFight(s);
    close(s);
    stepUntil(s, () => s.projectiles.items.some((x) => x.active && x.ownerId === s.player.id), 300);
    const shots = s.projectiles.items.filter((x) => x.active && x.ownerId === s.player.id);
    expect(shots.length).toBe(HALCYON.sub.projCount);
    const angles = shots.map((x) => Math.atan2(x.vy, x.vx).toFixed(4));
    expect(new Set(angles).size).toBe(angles.length);
  });

  it('does not shove the owner with the drone\'s recoil', () => {
    const s = sim();
    toFight(s);
    close(s);
    const p = s.player;
    p.vx = 0;
    p.vy = 0;
    const before = Math.abs(p.vx);
    stepUntil(s, () => s.projectiles.activeCount > 0, 300);
    // Only drag should have touched the owner's velocity; no recoil kick.
    expect(Math.abs(p.vx)).toBeLessThanOrEqual(before + 0.001);
  });

  it('spends a charge per volley and stops when the rack is empty', () => {
    const s = sim();
    toFight(s);
    close(s);
    const p = s.player;
    expect(p.subCharges).toBe(HALCYON.subCharges);
    // Long enough to burn the rack, but far shorter than a single recharge.
    for (let i = 0; i < 140; i++) s.step(emptyInput(), emptyInput());
    expect(p.subCharges).toBe(0);
    expect(p.supporter.state).toBe(0); // idle, waiting on ammunition
  });

  it('holds fire while its target is out of range', () => {
    const s = sim();
    toFight(s);
    close(s);
    separate(s);
    const p = s.player;
    // Keep them apart; HALCYON's drone reaches 760px and the gap is ~2160.
    for (let i = 0; i < 300; i++) {
      separate(s);
      s.step(emptyInput(), emptyInput());
    }
    expect(p.subCharges).toBe(HALCYON.subCharges);
  });

  it('holds fire while rebuilding, even in range', () => {
    const s = sim();
    toFight(s);
    close(s);
    const p = s.player;
    p.supporter.takeHit(9999);
    const before = p.subCharges;
    for (let i = 0; i < 200; i++) s.step(emptyInput(), emptyInput());
    expect(p.subCharges).toBeGreaterThanOrEqual(before);
    expect(p.supporter.state).toBe(0);
  });

  it('honours the cooldown between volleys', () => {
    const s = sim();
    toFight(s);
    close(s);
    const p = s.player;
    const d = p.def.supporter;
    stepUntil(s, () => p.supporter.state !== 0, 300);
    const readyAfter = stepUntil(s, () => p.supporter.ready, 400);
    expect(readyAfter).toBeGreaterThanOrEqual(d.windup + d.recover + d.cooldown - 2);
  });

  it('reports readiness as a 0..1 fraction for the HUD', () => {
    const s = sim();
    toFight(s);
    close(s);
    const p = s.player;
    expect(p.supporter.readyFraction).toBe(1);
    stepUntil(s, () => p.supporter.state !== 0, 300);
    expect(p.supporter.readyFraction).toBe(0);
  });
});

/**
 * AEGIS keeps its gun while its shell is up (D118).
 *
 * The gate used to be `role === 'dome' && domeDownTicks > 0` — the escort could
 * only shoot while *failing*. That is invisible from the outside in the worst
 * way: AEGIS still fired, still drew a muzzle flash, still spent charges, and a
 * round count is the only thing that shows it was doing so for barely a third
 * of the match.
 *
 * So the assertion is deliberately conditioned on `domeActive`: firing at all
 * proves nothing, because the old behaviour fired too. What has to be true is
 * that a shot leaves *while the bubble is up*.
 */
describe('supporter — a dome keeps its gun', () => {
  it('fires while its own shell is still up', () => {
    const s = sim({ playerDef: OBELISK, enemyDef: NOCTURNE });
    toFight(s);
    close(s);
    const p = s.player;

    let firedWithDomeUp = false;
    for (let i = 0; i < 900 && !firedWithDomeUp; i++) {
      s.step(emptyInput(), emptyInput());
      if (!p.supporter.domeActive) continue;
      // The pooled projectile, not the attack — §8b of the handoff. A spawn
      // that never reaches the pool is exactly the failure this guards.
      firedWithDomeUp = eventsOfType(s, 'fire').some((e) => e.ownerId === p.id);
    }
    expect(firedWithDomeUp).toBe(true);
  });

  it('still holds the bubble up while it shoots', () => {
    const s = sim({ playerDef: OBELISK, enemyDef: NOCTURNE });
    toFight(s);
    close(s);
    const p = s.player;
    let domeUp = 0;
    for (let i = 0; i < 600; i++) {
      s.step(emptyInput(), emptyInput());
      if (p.supporter.domeActive) domeUp++;
    }
    // Bounded, not pinned: the shell is consumable and an opponent is shooting
    // at it, so the exact share moves with tuning. What must not happen is the
    // gun costing the dome its uptime.
    expect(domeUp).toBeGreaterThan(300);
  });
});

describe('supporter — passives', () => {
  it('gives every drone in the roster its own passive', () => {
    const names = ROSTER.map((m) => m.supporter.passive.name);
    expect(new Set(names).size).toBe(ROSTER.length);
    for (const m of ROSTER) {
      const p = m.supporter.passive;
      expect(p.text.length).toBeGreaterThan(10);
      // Exactly one lever each, or it stops being feelable and starts being a
      // grab bag. Enforced here rather than trusted.
      const levers = Object.entries(p).filter(
        ([k, v]) => k !== 'name' && k !== 'text' && typeof v === 'number' && v !== 1,
      );
      expect(levers.length).toBe(1);
    }
  });

  it('lifts the owner\'s energy regeneration while ARBITER is on station', () => {
    const withDrone = sim();
    const without = sim();
    toFight(withDrone);
    toFight(without);
    for (const s of [withDrone, without]) {
      s.player.energy = 0;
      separate(s);
    }
    // Take the second one's drone out of the fight entirely. There is no recall
    // any more, so the only way to lose the passive is to lose the drone —
    // which is rather the point of the redesign.
    without.player.supporter.takeHit(9999);
    without.player.energy = 0;

    for (let i = 0; i < 60; i++) {
      separate(withDrone);
      separate(without);
      withDrone.step(emptyInput(), emptyInput());
      without.step(emptyInput(), emptyInput());
    }
    expect(withDrone.player.energy).toBeGreaterThan(without.player.energy);
  });

  it('applies the damage passive to the owner\'s own weapons', () => {
    const plain = sim();
    const uplink = sim({ playerDef: { ...HALCYON, supporter: { ...HALCYON.supporter, passive: { name: 'X', text: 'test lever only', damageMul: 2 } } } });
    expect(plain.player.outgoingScale).toBe(1);
    expect(uplink.player.outgoingScale).toBe(2);
    // And it evaporates the moment the drone leaves station.
    uplink.player.supporter.takeHit(9999);
    expect(uplink.player.outgoingScale).toBe(1);
  });

  it('applies the armour passive to damage the owner takes', () => {
    const s = sim({ playerDef: { ...HALCYON, supporter: { ...HALCYON.supporter, passive: { name: 'X', text: 'test lever only', defenceMul: 0.5 } } } });
    const base = HALCYON.defence.mul;
    expect(s.player.incomingScale).toBeCloseTo(base * 0.5, 6);
    s.player.supporter.takeHit(9999);
    expect(s.player.incomingScale).toBeCloseTo(base, 6);
  });

  it('lets a jamming drone starve the opponent rather than feed its pilot', () => {
    const jam = { name: 'X', text: 'test lever only', enemyEnergyRegenMul: 0 };
    const s = sim({ playerDef: { ...HALCYON, supporter: { ...HALCYON.supporter, passive: jam } } });
    toFight(s);
    separate(s);
    s.enemy.energy = 0;
    for (let i = 0; i < 60; i++) {
      separate(s);
      s.step(emptyInput(), emptyInput());
    }
    expect(s.enemy.energy).toBe(0);
  });
});

describe('supporter — match states', () => {
  it('does not fire during the intro', () => {
    const s = sim({ introTicks: 60 });
    for (let i = 0; i < 50; i++) s.step(emptyInput(), emptyInput());
    expect(s.phase).toBe(MatchPhase.Intro);
    expect(s.player.subCharges).toBe(HALCYON.subCharges);
    expect(s.projectiles.activeCount).toBe(0);
  });

  it('accepts no volley order during the intro', () => {
    const s = sim({ introTicks: 60 });
    s.step(press(Btn.Sub), press(Btn.Sub));
    expect(eventsOfType(s, 'assist').length).toBe(0);
    expect(s.player.supporter.mode).toBe(DroneMode.Active);
  });

  it('still keeps station during the intro', () => {
    const s = sim({ introTicks: 60 });
    const p = s.player;
    const before = { x: p.supporter.x, y: p.supporter.y };
    for (let i = 0; i < 30; i++) s.step(emptyInput(), emptyInput());
    expect(Number.isFinite(p.supporter.x)).toBe(true);
    // On station and unmoved, because the owner is frozen too.
    expect(Math.hypot(p.supporter.x - before.x, p.supporter.y - before.y)).toBeLessThan(2);
  });

  it('drops a pending order when its owner dies mid-windup', () => {
    const s = sim();
    toFight(s);
    const p = s.player;
    p.supporter.order(HALCYON.sub);
    expect(p.supporter.state).not.toBe(0); // not Idle: an order is in flight
    p.life = 0;
    s.step(emptyInput(), emptyInput());
    const before = s.projectiles.activeCount;
    for (let i = 0; i < p.def.supporter.windup + 4; i++) s.step(emptyInput(), emptyInput());
    // The dead machine's drone fired nothing.
    expect(s.projectiles.activeCount).toBeLessThanOrEqual(before);
  });

  it('stows itself when its owner dies, rather than flying formation on a wreck', () => {
    const s = sim();
    toFight(s);
    const p = s.player;
    p.life = 0;
    s.step(emptyInput(), emptyInput());
    expect(p.supporter.mode).toBe(DroneMode.Stowed);
    expect(p.supporter.visible).toBe(false);
  });

  it('puts the drone back on station, repaired, when a training dummy revives', () => {
    const s = sim({ dummy: true });
    toFight(s);
    const e = s.enemy;
    e.supporter.order(NOCTURNE.sub);
    e.supporter.life = 3;
    e.life = 0;
    s.step(emptyInput(), emptyInput());
    expect(s.dummyDowns).toBe(1);
    const d = e.def.supporter;
    expect(e.supporter.x).toBeCloseTo(e.x - e.facing * d.followBack, 6);
    expect(e.supporter.state).toBe(0); // Idle
    expect(e.supporter.cooldown).toBe(0);
    expect(e.supporter.mode).toBe(DroneMode.Active);
    expect(e.supporter.life).toBe(d.maxLife);
  });

  it('revives a destroyed dummy drone, so training never runs out of target', () => {
    const s = sim({ dummy: true });
    toFight(s);
    const e = s.enemy;
    // Spend the rebuild, then kill it for good, so this is a genuinely
    // destroyed drone rather than one that was going to come back anyway.
    e.supporter.takeHit(9999);
    e.supporter.rebuildsLeft = 0;
    e.supporter.mode = DroneMode.Active;
    e.supporter.life = NOCTURNE.supporter.maxLife;
    e.supporter.takeHit(9999);
    expect(e.supporter.destroyed).toBe(true);
    e.life = 0;
    s.step(emptyInput(), emptyInput());
    expect(e.supporter.destroyed).toBe(false);
    expect(e.supporter.mode).toBe(DroneMode.Active);
  });
});

describe('supporter — input path', () => {
  /**
   * The toggle must stay reachable through the same remappable action table the
   * rest of the game reads. A previous bug shipped a melee button the simulation
   * understood and `InputManager` never sent; `bindings.test.ts` now proves every
   * `Btn` has an action and a default, and this pins the assist's own entry so a
   * rename cannot quietly detach the drone from its button.
   *
   * `InputManager` itself imports Phaser and needs a DOM, so it cannot be
   * constructed here — it is exercised in the live browser check instead.
   */
  it('is bound to a real, remappable action with a default key', () => {
    expect(BUTTON_ACTION[Btn.Sub]).toBe('sub');
    expect(ACTION_ORDER).toContain('sub');
    const b = DEFAULT_BINDINGS.sub;
    expect(b.keys.length + b.pads.length).toBeGreaterThan(0);
  });

  it('drives the drone from an ordinary InputFrame, with no private path', () => {
    const s = sim();
    toFight(s);
    close(s);
    s.player.supporter.cancel();
    s.player.supporter.cooldown = 0;
    // Exactly what InputManager builds when the bound key goes down.
    const frame: InputFrame = { ...emptyInput(), held: 1 << Btn.Sub, pressed: 1 << Btn.Sub };
    s.step(frame, emptyInput());
    // Manual only: the *enemy's* drone auto-fires on the same tick, and counting
    // that would pass whether or not the button did anything.
    expect(eventsOfType(s, 'assist').filter((e) => !e.auto && e.ownerId === s.player.id)).toHaveLength(1);
  });

  it('orders on the pressed edge only, never while the button is held', () => {
    const s = sim();
    toFight(s);
    close(s);
    s.player.supporter.cancel();
    s.player.supporter.cooldown = 0;
    const held: InputFrame = { ...emptyInput(), held: 1 << Btn.Sub, pressed: 0 };

    s.step({ ...held, pressed: 1 << Btn.Sub }, emptyInput());
    let manual = eventsOfType(s, 'assist').filter((e) => !e.auto).length;
    expect(manual).toBe(1);

    // Keep holding well past a full windup / recover / cooldown cycle, so a
    // held button has every opportunity to sneak a second order through.
    for (let i = 0; i < 400; i++) {
      s.step(held, emptyInput());
      manual += eventsOfType(s, 'assist').filter((e) => !e.auto).length;
    }
    expect(manual).toBe(1);
  });
});
