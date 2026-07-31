import { describe, expect, it } from 'vitest';
import { MatchSim } from '../combat/MatchSim';
import { HALCYON, NOCTURNE } from '../data/mechs';
import { ROSTER } from '../data/mechs';
import { DroneMode } from '../combat/Supporter';
import { Btn, MatchPhase, emptyInput, type InputFrame, type SimEvent } from '../combat/types';
import { ACTION_ORDER, BUTTON_ACTION, DEFAULT_BINDINGS } from '../input/Bindings';

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

describe('supporter — deploy and recall', () => {
  it('recalls on the first press, since the drone starts deployed', () => {
    const s = sim();
    toFight(s);
    const p = s.player;
    s.step(press(Btn.Sub), emptyInput());
    expect(eventsOfType(s, 'droneRecall').length).toBe(1);
    expect(p.supporter.mode).toBe(DroneMode.Recalling);
  });

  it('completes the recall into the chassis, then hides and protects it', () => {
    const s = sim();
    toFight(s);
    const p = s.player;
    s.step(press(Btn.Sub), emptyInput());
    stepUntil(s, () => p.supporter.mode === DroneMode.Stowed, 200);
    expect(p.supporter.mode).toBe(DroneMode.Stowed);
    expect(p.supporter.visible).toBe(false);
    expect(p.supporter.hittable).toBe(false);
    // Docked, not abandoned wherever it happened to be.
    expect(Math.hypot(p.supporter.x - p.x, p.supporter.y - p.y)).toBeLessThan(30);
  });

  it('deploys again on the next press, and only contributes once on station', () => {
    const s = sim();
    toFight(s);
    const p = s.player;
    s.step(press(Btn.Sub), emptyInput());
    stepUntil(s, () => p.supporter.mode === DroneMode.Stowed, 200);

    s.step(press(Btn.Sub), emptyInput());
    expect(eventsOfType(s, 'droneDeploy').length).toBe(1);
    expect(p.supporter.mode).toBe(DroneMode.Deploying);
    // Exposed on the way out, but earning nothing yet.
    expect(p.supporter.hittable).toBe(true);
    expect(p.supporter.onStation).toBe(false);
    expect(p.dronePassive).toBeNull();

    stepUntil(s, () => p.supporter.mode === DroneMode.Active, 200);
    expect(p.dronePassive?.name).toBe('REACTOR LINK');
  });

  it('takes the authored number of ticks to launch', () => {
    const s = sim();
    toFight(s);
    const p = s.player;
    s.step(press(Btn.Sub), emptyInput());
    stepUntil(s, () => p.supporter.mode === DroneMode.Stowed, 200);
    s.step(press(Btn.Sub), emptyInput());
    const took = stepUntil(s, () => p.supporter.mode === DroneMode.Active, 200);
    expect(took).toBeGreaterThanOrEqual(HALCYON.supporter.deployTicks - 3);
    expect(took).toBeLessThanOrEqual(HALCYON.supporter.deployTicks + 3);
  });

  it('repairs while stowed and never while flying', () => {
    const s = sim();
    toFight(s);
    separate(s);
    const p = s.player;
    p.supporter.life = 40;

    // Deployed: no repair.
    for (let i = 0; i < 60; i++) s.step(emptyInput(), emptyInput());
    expect(p.supporter.life).toBe(40);

    s.step(press(Btn.Sub), emptyInput());
    stepUntil(s, () => p.supporter.mode === DroneMode.Stowed, 200);
    const docked = p.supporter.life;
    for (let i = 0; i < 100; i++) s.step(emptyInput(), emptyInput());
    expect(p.supporter.life).toBeGreaterThan(docked);
    expect(p.supporter.life).toBeLessThanOrEqual(HALCYON.supporter.maxLife);
  });

  it('cancels a volley in flight when recalled', () => {
    const s = sim();
    toFight(s);
    const p = s.player;
    p.supporter.order(HALCYON.sub);
    expect(p.supporter.state).not.toBe(0);
    s.step(press(Btn.Sub), emptyInput());
    expect(p.supporter.state).toBe(0); // Idle
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

  it('is destroyed when its hit points empty, and stays destroyed', () => {
    const s = sim();
    toFight(s);
    const sup = s.player.supporter;
    expect(sup.takeHit(HALCYON.supporter.maxLife * 2)).toBe('down');
    expect(sup.destroyed).toBe(true);
    expect(sup.hittable).toBe(false);
    expect(sup.visible).toBe(false);

    // Nothing brings it back: not time, not the button, not a passive.
    for (let i = 0; i < 400; i++) s.step(press(Btn.Sub), emptyInput());
    expect(sup.destroyed).toBe(true);
    expect(sup.life).toBe(0);
    expect(s.player.dronePassive).toBeNull();
  });

  it('refuses the assist button once destroyed, audibly', () => {
    const s = sim();
    toFight(s);
    s.player.supporter.takeHit(9999);
    s.step(press(Btn.Sub), emptyInput());
    expect(eventsOfType(s, 'assistDenied').length).toBe(1);
    expect(eventsOfType(s, 'droneDeploy').length).toBe(0);
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
    expect(sup.destroyed).toBe(true);
  });

  it('cannot be hit while it is stowed inside the chassis', () => {
    const s = sim();
    toFight(s);
    separate(s);
    const p = s.player;
    s.step(press(Btn.Sub), emptyInput());
    stepUntil(s, () => p.supporter.mode === DroneMode.Stowed, 200);
    const before = p.supporter.life;

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
    expect(p.supporter.life).toBe(before);
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
    expect(dChassis).toBeGreaterThan(40);
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

  it('holds fire while stowed, even in range', () => {
    const s = sim();
    toFight(s);
    close(s);
    const p = s.player;
    s.step(press(Btn.Sub), emptyInput());
    stepUntil(s, () => p.supporter.mode === DroneMode.Stowed, 200);
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
    // Stow the second one's drone entirely.
    without.step(press(Btn.Sub), emptyInput());
    stepUntil(without, () => without.player.supporter.mode === DroneMode.Stowed, 200);
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

  it('cannot be deployed or recalled during the intro', () => {
    const s = sim({ introTicks: 60 });
    s.step(press(Btn.Sub), press(Btn.Sub));
    expect(eventsOfType(s, 'droneRecall').length).toBe(0);
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
    // Exactly what InputManager builds when the bound key goes down.
    const frame: InputFrame = { ...emptyInput(), held: 1 << Btn.Sub, pressed: 1 << Btn.Sub };
    s.step(frame, emptyInput());
    expect(eventsOfType(s, 'droneRecall').length).toBe(1);
  });

  it('toggles on the pressed edge only, never while the button is held', () => {
    const s = sim();
    toFight(s);
    const held: InputFrame = { ...emptyInput(), held: 1 << Btn.Sub, pressed: 0 };

    let toggles = 0;
    s.step({ ...held, pressed: 1 << Btn.Sub }, emptyInput());
    toggles += eventsOfType(s, 'droneRecall').length + eventsOfType(s, 'droneDeploy').length;
    expect(toggles).toBe(1);

    // Keep holding for well past a full deploy and recall cycle, so a held
    // button has every opportunity to sneak a second toggle through.
    for (let i = 0; i < 400; i++) {
      s.step(held, emptyInput());
      toggles += eventsOfType(s, 'droneRecall').length + eventsOfType(s, 'droneDeploy').length;
    }
    expect(toggles).toBe(1);
    expect(s.player.supporter.mode).toBe(DroneMode.Stowed);
  });
});
