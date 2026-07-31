import { BarrierResponse, ProjKind, Team, type ProjectileSpawn } from '../combat/types';
import { approachAngle } from '../core/MathUtil';
import type { ProjFamilyId } from './families';

/** A live projectile. Pooled by ProjectilePool to keep the sim allocation-free. */
export class Projectile {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  damage = 0;
  guardDamage = 0;
  life = 0;
  maxLife = 0;
  radius = 0;
  ownerId = -1;
  team: Team = Team.Player;
  kind: ProjKind = ProjKind.Bullet;
  barrier: BarrierResponse = BarrierResponse.Absorb;
  hitstop = 0;
  hitstun = 0;
  knockback = 0;
  homing = 0;
  pierceLeft = 0;
  /** Status element inflicted on a clean hit. */
  element = 0;
  active = false;
  /** Ids already hit, so piercing shots do not multi-hit the same target. */
  readonly hitIds = new Set<number>();
  /** Previous position, used for swept collision and trail rendering. */
  prevX = 0;
  prevY = 0;

  // ---- art and motion -------------------------------------------------------
  /** Detonates against incoming enemy fire. See `ProjectileSpawn.intercepts`. */
  intercepts = false;
  family: ProjFamilyId = 'pellet';
  visualScale = 1;
  velMul = 1;
  accel = 0;
  swerve = 0;
  swervePeriod = 24;
  speedMin = 0;
  speedMax = Infinity;

  /** Ticks since launch. Drives the weave and the additive flicker. */
  get age(): number {
    return this.maxLife - this.life;
  }

  reset(s: ProjectileSpawn): void {
    this.x = s.x;
    this.y = s.y;
    this.prevX = s.x;
    this.prevY = s.y;
    this.vx = s.vx;
    this.vy = s.vy;
    this.damage = s.damage;
    this.guardDamage = s.guardDamage;
    this.life = s.life;
    this.maxLife = s.life;
    this.radius = s.radius;
    this.ownerId = s.ownerId;
    this.team = s.team;
    this.kind = s.kind;
    this.barrier = s.barrier;
    this.hitstop = s.hitstop;
    this.hitstun = s.hitstun;
    this.knockback = s.knockback;
    this.homing = s.homing;
    this.pierceLeft = s.pierceCount;
    this.element = s.element ?? 0;
    this.intercepts = s.intercepts ?? false;
    this.family = s.family ?? 'pellet';
    this.visualScale = s.visualScale ?? 1;
    this.velMul = s.velMul ?? 1;
    this.accel = s.accel ?? 0;
    this.swerve = s.swerve ?? 0;
    this.swervePeriod = s.swervePeriod ?? 24;
    this.speedMin = s.speedMin ?? 0;
    this.speedMax = s.speedMax ?? Infinity;
    this.active = true;
    this.hitIds.clear();
  }

  get angle(): number {
    return Math.atan2(this.vy, this.vx);
  }

  /** Advances one tick, optionally homing toward `tx,ty`. */
  step(tx: number | null, ty: number | null): void {
    this.prevX = this.x;
    this.prevY = this.y;

    if (this.homing > 0 && tx !== null && ty !== null) {
      const speed = Math.hypot(this.vx, this.vy);
      const want = Math.atan2(ty - this.y, tx - this.x);
      const next = approachAngle(this.angle, want, this.homing);
      // Missiles also build speed as they run, so late salvos still threaten.
      const s = Math.min(speed * 1.012, speed + 0.1);
      this.vx = Math.cos(next) * s;
      this.vy = Math.sin(next) * s;
    }

    // Weave. Integrating the derivative of a sinusoid keeps the heading exactly
    // `launch + swerve * sin(t)`, so the shot oscillates about its aim line and
    // never wanders off it — a weave that accumulated could not be led, and the
    // AI's dodge prediction reads a straight line from current velocity.
    if (this.swerve !== 0) {
      const w = (Math.PI * 2) / this.swervePeriod;
      const d = this.swerve * w * Math.cos(w * this.age);
      const c = Math.cos(d);
      const s = Math.sin(d);
      const vx = this.vx * c - this.vy * s;
      this.vy = this.vx * s + this.vy * c;
      this.vx = vx;
    }

    // Per-family acceleration. The reference gives every projectile family its
    // own `velmul` and `accel`, which is most of what makes one weapon feel
    // unlike another in flight; ours all travelled at a constant speed.
    if (this.velMul !== 1 || this.accel !== 0) {
      const sp = Math.hypot(this.vx, this.vy);
      if (sp > 1e-6) {
        const next = Math.min(this.speedMax, Math.max(this.speedMin, sp * this.velMul + this.accel));
        this.vx = (this.vx / sp) * next;
        this.vy = (this.vy / sp) * next;
      }
    }

    this.x += this.vx;
    this.y += this.vy;
    this.life--;
    if (this.life <= 0) this.active = false;
  }

  /** Snapshot used by Combatant.takeHit, which expects a ProjectileSpawn shape. */
  asHit(): ProjectileSpawn {
    return {
      x: this.x,
      y: this.y,
      vx: this.vx,
      vy: this.vy,
      damage: this.damage,
      guardDamage: this.guardDamage,
      life: this.life,
      radius: this.radius,
      ownerId: this.ownerId,
      team: this.team,
      kind: this.kind,
      barrier: this.barrier,
      hitstop: this.hitstop,
      hitstun: this.hitstun,
      knockback: this.knockback,
      homing: this.homing,
      pierceCount: this.pierceLeft,
      element: this.element,
    };
  }
}

export class ProjectilePool {
  readonly items: Projectile[] = [];

  constructor(capacity = 256) {
    for (let i = 0; i < capacity; i++) this.items.push(new Projectile());
  }

  spawn(s: ProjectileSpawn): Projectile | null {
    for (const p of this.items) {
      if (!p.active) {
        p.reset(s);
        return p;
      }
    }
    return null;
  }

  get activeCount(): number {
    let n = 0;
    for (const p of this.items) if (p.active) n++;
    return n;
  }

  clear(): void {
    for (const p of this.items) p.active = false;
  }
}

/**
 * Swept circle-vs-circle test. Projectiles move fast enough that a point test
 * would tunnel through a mech at high projectile speeds.
 */
export function sweptHit(
  p: Projectile,
  cx: number,
  cy: number,
  r: number,
): boolean {
  const rr = p.radius + r;
  const dx = p.x - p.prevX;
  const dy = p.y - p.prevY;
  const fx = p.prevX - cx;
  const fy = p.prevY - cy;

  const a = dx * dx + dy * dy;
  if (a < 1e-6) return fx * fx + fy * fy <= rr * rr;

  // Closest point on the swept segment to the circle centre.
  let t = -(fx * dx + fy * dy) / a;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = fx + dx * t;
  const py = fy + dy * t;
  return px * px + py * py <= rr * rr;
}
