import { BarrierResponse, ProjKind, Team, type ProjectileSpawn } from '../combat/types';
import { approachAngle } from '../core/MathUtil';

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
