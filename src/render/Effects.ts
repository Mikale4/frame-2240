import Phaser from 'phaser';
import { TEX } from './Textures';
import { ProjKind } from '../combat/types';
import { depthScaleAt } from '../core/Depth';
import { PROJ_FAMILIES, type ProjFamilyId } from '../projectiles/families';

interface Particle {
  img: Phaser.GameObjects.Image;
  life: number;
  maxLife: number;
  vx: number;
  vy: number;
  drag: number;
  spin: number;
  scaleFrom: number;
  scaleTo: number;
  alphaFrom: number;
  fadePow: number;
  /** Scale signs, so a flipped particle stays flipped as it is re-scaled. */
  signX: number;
  signY: number;
  active: boolean;
}

/**
 * Pooled additive-blend particle layer.
 *
 * Covers every effect the vertical slice needs: muzzle flashes, hit sparks,
 * guard/absorb pings, boost trails, barrier bubbles, melee arcs and explosions.
 */
export class Effects {
  private pool: Particle[] = [];
  private readonly layer: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, depth: number, capacity = 420) {
    this.layer = scene.add.container(0, 0);
    this.layer.setDepth(depth);
    for (let i = 0; i < capacity; i++) {
      const img = scene.add.image(0, 0, TEX.glow);
      img.setBlendMode(Phaser.BlendModes.ADD);
      img.setVisible(false);
      this.layer.add(img);
      this.pool.push({
        img,
        life: 0,
        maxLife: 1,
        vx: 0,
        vy: 0,
        drag: 0.94,
        spin: 0,
        scaleFrom: 1,
        scaleTo: 0,
        alphaFrom: 1,
        fadePow: 1,
        signX: 1,
        signY: 1,
        active: false,
      });
    }
  }

  get container(): Phaser.GameObjects.Container {
    return this.layer;
  }

  private take(): Particle | null {
    for (const p of this.pool) if (!p.active) return p;
    return null;
  }

  private emit(opts: {
    key: string;
    x: number;
    y: number;
    life: number;
    scaleFrom: number;
    scaleTo?: number;
    tint: number;
    alpha?: number;
    vx?: number;
    vy?: number;
    drag?: number;
    rotation?: number;
    spin?: number;
    scaleYMul?: number;
    fadePow?: number;
    blend?: Phaser.BlendModes;
    /**
     * Mirror the sprite at random on each axis.
     *
     * Straight from the reference, which sets `facing` and `vfacing` from
     * `Random < 500` on every secondary effect it spawns. It costs nothing and
     * it is why a bank of four debris sprites never reads as four sprites.
     */
    flip?: boolean;
  }): void {
    const p = this.take();
    if (!p) return;
    // Effects live in arena space alongside the mechs, so they take the same
    // pseudo-3D depth scale automatically rather than every call site passing it.
    const d = depthScaleAt(opts.y);
    p.active = true;
    p.life = opts.life;
    p.maxLife = opts.life;
    p.vx = (opts.vx ?? 0) * d;
    p.vy = (opts.vy ?? 0) * d;
    p.drag = opts.drag ?? 0.94;
    p.spin = opts.spin ?? 0;
    p.scaleFrom = opts.scaleFrom * d;
    p.scaleTo = (opts.scaleTo ?? 0) * d;
    p.alphaFrom = opts.alpha ?? 1;
    p.fadePow = opts.fadePow ?? 1;
    p.signX = opts.flip && Math.random() < 0.5 ? -1 : 1;
    p.signY = opts.flip && Math.random() < 0.5 ? -1 : 1;

    const img = p.img;
    img.setTexture(opts.key);
    img.setPosition(opts.x, opts.y);
    img.setTint(opts.tint);
    img.setRotation(opts.rotation ?? 0);
    img.setScale(p.scaleFrom * p.signX, p.scaleFrom * (opts.scaleYMul ?? 1) * p.signY);
    img.setAlpha(p.alphaFrom);
    img.setBlendMode(opts.blend ?? Phaser.BlendModes.ADD);
    img.setVisible(true);
    img.setData('scaleYMul', opts.scaleYMul ?? 1);
  }

  /** Advances all particles. `dt` is in seconds. */
  update(dt: number): void {
    const f = dt * 60;
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life -= f;
      if (p.life <= 0) {
        p.active = false;
        p.img.setVisible(false);
        continue;
      }
      const t = 1 - p.life / p.maxLife;
      p.img.x += p.vx * f;
      p.img.y += p.vy * f;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.img.rotation += p.spin * f;
      const s = p.scaleFrom + (p.scaleTo - p.scaleFrom) * t;
      const ym = (p.img.getData('scaleYMul') as number) ?? 1;
      p.img.setScale(s * p.signX, s * ym * p.signY);
      p.img.setAlpha(p.alphaFrom * Math.pow(1 - t, p.fadePow));
    }
  }

  // ------------------------------------------------------------ effect recipes

  muzzle(x: number, y: number, angle: number, kind: ProjKind, tint: number): void {
    const big = kind === ProjKind.Beam || kind === ProjKind.Heavy;
    this.emit({
      key: TEX.glow,
      x,
      y,
      life: big ? 8 : 5,
      scaleFrom: big ? 0.42 : 0.24,
      scaleTo: 0.03,
      tint,
      alpha: 0.8,
      rotation: angle,
      fadePow: 1.3,
    });
    // A short forward flare along the barrel.
    this.emit({
      key: TEX.streak,
      x: x + Math.cos(angle) * 14,
      y: y + Math.sin(angle) * 14,
      life: big ? 7 : 4,
      scaleFrom: big ? 0.5 : 0.3,
      scaleTo: 0.06,
      tint: 0xffffff,
      alpha: 0.7,
      rotation: angle,
      scaleYMul: 0.42,
    });
    for (let i = 0; i < (big ? 5 : 3); i++) {
      const a = angle + (Math.random() - 0.5) * 0.9;
      const sp = 1.6 + Math.random() * (big ? 5 : 2.6);
      this.emit({
        key: TEX.spark,
        x,
        y,
        life: 8 + Math.random() * 10,
        scaleFrom: 0.3,
        scaleTo: 0.03,
        tint,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        drag: 0.9,
      });
    }
  }

  hit(x: number, y: number, kind: ProjKind, tint: number): void {
    const heavy = kind === ProjKind.Melee || kind === ProjKind.Beam || kind === ProjKind.Heavy;
    this.emit({
      key: TEX.glow,
      x,
      y,
      life: heavy ? 12 : 8,
      scaleFrom: heavy ? 0.8 : 0.42,
      scaleTo: 0.05,
      tint: 0xffffff,
      alpha: 0.9,
      fadePow: 1.4,
    });
    this.emit({
      key: TEX.ring,
      x,
      y,
      life: heavy ? 18 : 12,
      scaleFrom: 0.15,
      scaleTo: heavy ? 1.1 : 0.62,
      tint,
      alpha: 0.85,
      fadePow: 1.6,
    });
    const n = heavy ? 13 : 7;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * (heavy ? 9 : 5);
      this.emit({
        key: TEX.spark,
        x,
        y,
        life: 12 + Math.random() * 16,
        scaleFrom: 0.28 + Math.random() * 0.2,
        scaleTo: 0.02,
        tint: i % 3 === 0 ? 0xffffff : tint,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        drag: 0.9,
      });
    }
  }

  // -------------------------------------------------- family-keyed projectile fx
  //
  // `muzzle` and `hit` above key off `ProjKind`, which has five values for
  // forty-eight weapons: a flame thrower and a railgun are both `Bullet` and lit
  // up identically. These key off the projectile family instead, so what a shot
  // is *made of* decides how it leaves the barrel and how it comes apart. The
  // kind-based pair stays for the hits that have no family behind them — a shot
  // striking a drone, for one.

  /**
   * Muzzle flash for a family.
   *
   * Sized from the family's own dimensions, so a needle spits a thin hot line
   * and a mortar coughs. The reference bakes its spawn flash into the front of
   * the projectile animation as a one-frame additive frame; ours is a separate
   * emitter, which comes to the same thing on screen and does not require the
   * flash to travel with the shot.
   */
  muzzleFor(x: number, y: number, angle: number, famId: ProjFamilyId, tint: number): void {
    const f = PROJ_FAMILIES[famId];
    const long = Math.max(f.length, f.width);
    // 60px is a mid-sized family, so `size` lands near 1 for most of the bank.
    const size = long / 60;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    this.emit({
      key: TEX.glow,
      x,
      y,
      life: 4 + size * 4,
      scaleFrom: 0.18 * size + 0.1,
      scaleTo: 0.02,
      tint,
      alpha: 0.85,
      fadePow: 1.3,
    });
    // A flare down the barrel, as long and as thin as the shot itself.
    this.emit({
      key: TEX.streak,
      x: x + cos * 12 * size,
      y: y + sin * 12 * size,
      life: 3 + size * 4,
      scaleFrom: 0.26 * size + 0.14,
      scaleTo: 0.05,
      tint: 0xffffff,
      alpha: 0.75,
      rotation: angle,
      scaleYMul: Math.max(0.12, f.width / f.length) * 0.6,
    });

    if (f.burst === 'ember') {
      // Propellant: a wash of smoke back down the barrel.
      for (let i = 0; i < 4; i++) {
        const a = angle + Math.PI + (Math.random() - 0.5) * 1.1;
        this.emit({
          key: TEX.glow,
          x,
          y,
          life: 14 + Math.random() * 12,
          scaleFrom: 0.18 * size,
          scaleTo: 0.5 * size,
          tint: f.trailTint || 0xff9a4a,
          alpha: 0.45,
          vx: Math.cos(a) * 2.2,
          vy: Math.sin(a) * 2.2,
          drag: 0.9,
          fadePow: 1.5,
        });
      }
      return;
    }

    if (f.burst === 'arc') {
      // Electricity earths itself across the muzzle rather than spraying.
      for (let i = 0; i < 3; i++) {
        this.emit({
          key: TEX.streak,
          x: x + cos * 10,
          y: y + sin * 10,
          life: 4 + Math.random() * 4,
          scaleFrom: 0.4 + Math.random() * 0.4,
          scaleTo: 0.1,
          tint: i % 2 ? 0xffffff : tint,
          alpha: 0.9,
          rotation: angle + (Math.random() - 0.5) * 2.2,
          scaleYMul: 0.1,
          fadePow: 1.7,
        });
      }
      return;
    }

    const n = f.burst === 'shatter' ? 5 : 3;
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.random() - 0.5) * 0.85;
      const sp = 1.6 + Math.random() * (2 + size * 2);
      this.emit({
        key: f.burst === 'shatter' ? TEX.shard : TEX.spark,
        x,
        y,
        life: 8 + Math.random() * 10,
        scaleFrom: 0.26 + size * 0.1,
        scaleTo: 0.03,
        tint,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        drag: 0.9,
        spin: f.burst === 'shatter' ? (Math.random() - 0.5) * 0.4 : 0,
        flip: true,
      });
    }
  }

  /**
   * Impact burst for a family.
   *
   * `power` scales the whole thing with the damage dealt, so a grazing
   * flechette and a breach lance do not detonate identically.
   */
  impactFor(x: number, y: number, famId: ProjFamilyId, tint: number, power = 1): void {
    const f = PROJ_FAMILIES[famId];
    const size = Math.max(0.55, Math.min(2.2, (Math.max(f.length, f.width) / 60) * power));

    // Every impact opens on a white core flash: the hit has to register before
    // it has to be identified.
    this.emit({
      key: TEX.glow,
      x,
      y,
      life: 6 + size * 4,
      scaleFrom: 0.34 * size,
      scaleTo: 0.04,
      tint: 0xffffff,
      alpha: 0.95,
      fadePow: 1.4,
    });

    switch (f.burst) {
      case 'pulse': {
        for (let r = 0; r < 3; r++) {
          this.emit({
            key: TEX.ring,
            x,
            y,
            life: 12 + r * 6,
            scaleFrom: 0.12,
            scaleTo: (0.55 + r * 0.36) * size,
            tint: r === 1 ? 0xffffff : tint,
            alpha: 0.8,
            fadePow: 1.7,
          });
        }
        for (let i = 0; i < 5; i++) {
          const a = Math.random() * Math.PI * 2;
          this.emit({
            key: TEX.spark,
            x,
            y,
            life: 10 + Math.random() * 12,
            scaleFrom: 0.24 * size,
            scaleTo: 0.02,
            tint,
            vx: Math.cos(a) * (2 + Math.random() * 4),
            vy: Math.sin(a) * (2 + Math.random() * 4),
            drag: 0.9,
          });
        }
        break;
      }

      case 'ember': {
        this.emit({
          key: TEX.glow,
          x,
          y,
          life: 16 + size * 6,
          scaleFrom: 0.5 * size,
          scaleTo: 0.08,
          tint: f.trailTint || 0xff8a3a,
          alpha: 0.9,
          fadePow: 1.3,
        });
        for (let i = 0; i < Math.round(9 * size); i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 1.5 + Math.random() * 5 * size;
          this.emit({
            key: TEX.spark,
            x,
            y,
            life: 22 + Math.random() * 26,
            scaleFrom: 0.3 * size,
            scaleTo: 0.02,
            tint: i % 3 === 0 ? 0xfff0c0 : f.trailTint || 0xff7a2a,
            vx: Math.cos(a) * sp,
            // Embers fall. Fire that radiates evenly looks like a firework.
            vy: Math.sin(a) * sp * 0.6 + 1.1,
            drag: 0.965,
          });
        }
        this.emit({
          key: TEX.glow,
          x,
          y: y + 6,
          life: 34,
          scaleFrom: 0.24 * size,
          scaleTo: 0.9 * size,
          tint: 0x3a3630,
          alpha: 0.45,
          vy: -0.7,
          drag: 0.98,
          fadePow: 1.5,
        });
        break;
      }

      case 'shatter': {
        for (let i = 0; i < Math.round(10 * size); i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 2.5 + Math.random() * 7 * size;
          this.emit({
            key: TEX.shard,
            x,
            y,
            life: 18 + Math.random() * 22,
            scaleFrom: (0.7 + Math.random() * 0.5) * size,
            scaleTo: 0.06,
            tint: i % 4 === 0 ? 0xffffff : tint,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            spin: (Math.random() - 0.5) * 0.55,
            drag: 0.94,
            flip: true,
          });
        }
        this.emit({
          key: TEX.ring,
          x,
          y,
          life: 12,
          scaleFrom: 0.1,
          scaleTo: 0.7 * size,
          tint,
          alpha: 0.7,
          fadePow: 2,
        });
        break;
      }

      case 'arc': {
        for (let i = 0; i < 6; i++) {
          this.emit({
            key: TEX.streak,
            x: x + (Math.random() - 0.5) * 22 * size,
            y: y + (Math.random() - 0.5) * 22 * size,
            life: 5 + Math.random() * 6,
            scaleFrom: (0.5 + Math.random() * 0.7) * size,
            scaleTo: 0.1,
            tint: i % 2 ? 0xffffff : tint,
            alpha: 0.95,
            rotation: Math.random() * Math.PI * 2,
            scaleYMul: 0.09,
            fadePow: 1.6,
          });
        }
        for (let i = 0; i < 6; i++) {
          const a = Math.random() * Math.PI * 2;
          this.emit({
            key: TEX.spark,
            x,
            y,
            life: 12 + Math.random() * 12,
            scaleFrom: 0.22 * size,
            scaleTo: 0.02,
            tint: 0xdff2ff,
            vx: Math.cos(a) * (3 + Math.random() * 5),
            vy: Math.sin(a) * (3 + Math.random() * 5),
            drag: 0.88,
          });
        }
        break;
      }

      default: {
        this.emit({
          key: TEX.ring,
          x,
          y,
          life: 10 + size * 4,
          scaleFrom: 0.12,
          scaleTo: 0.62 * size,
          tint,
          alpha: 0.85,
          fadePow: 1.6,
        });
        for (let i = 0; i < Math.round(8 * size); i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 2 + Math.random() * 6 * size;
          this.emit({
            key: TEX.spark,
            x,
            y,
            life: 12 + Math.random() * 16,
            scaleFrom: (0.26 + Math.random() * 0.2) * size,
            scaleTo: 0.02,
            tint: i % 3 === 0 ? 0xffffff : tint,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            drag: 0.9,
          });
        }
        break;
      }
    }
  }

  /**
   * The smear a shot leaves behind it.
   *
   * Kept short on purpose. The reference's trails are `AfterImage` with
   * `length = 2` — two frames, one frame apart. The long streaks in its
   * screenshots are that short trail on a *fast* projectile, plus several fired
   * at once; building a twenty-node ribbon would look nothing like it.
   */
  projTrail(x: number, y: number, angle: number, famId: ProjFamilyId, tint: number): void {
    const f = PROJ_FAMILIES[famId];
    const col = f.trailTint || tint;
    this.emit({
      key: f.burst === 'ember' ? TEX.glow : TEX.streak,
      x,
      y,
      life: f.burst === 'ember' ? 12 : 6,
      scaleFrom: f.trailScale,
      scaleTo: f.burst === 'ember' ? f.trailScale * 1.5 : 0.02,
      tint: col,
      alpha: f.burst === 'ember' ? 0.5 : 0.62,
      rotation: angle,
      scaleYMul: f.burst === 'ember' ? 1 : Math.max(0.1, f.width / f.length) * 0.8,
      drag: 0.9,
      fadePow: 1.5,
    });
  }

  guard(x: number, y: number, tint: number): void {
    this.emit({
      key: TEX.hex,
      x,
      y,
      life: 12,
      scaleFrom: 0.5,
      scaleTo: 0.78,
      tint,
      alpha: 0.85,
    });
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      this.emit({
        key: TEX.spark,
        x,
        y,
        life: 10,
        scaleFrom: 0.3,
        scaleTo: 0,
        tint: 0xbfe6ff,
        vx: Math.cos(a) * 2.4,
        vy: Math.sin(a) * 2.4,
      });
    }
  }

  /** Barrier absorbed a shot and banked it as saturation charge. */
  absorb(x: number, y: number, tint: number): void {
    this.emit({
      key: TEX.ring,
      x,
      y,
      life: 16,
      scaleFrom: 0.7,
      scaleTo: 0.08,
      tint,
      alpha: 1,
      fadePow: 0.8,
    });
    this.emit({ key: TEX.glow, x, y, life: 10, scaleFrom: 0.6, scaleTo: 0, tint });
  }

  barrier(x: number, y: number, radius: number, tint: number): void {
    this.emit({
      key: TEX.hex,
      x,
      y,
      life: 26,
      scaleFrom: 0.25,
      scaleTo: (radius * 2.2) / 160,
      tint,
      alpha: 1,
      fadePow: 1.4,
      spin: 0.02,
    });
    this.emit({
      key: TEX.ring,
      x,
      y,
      life: 20,
      scaleFrom: 0.2,
      scaleTo: (radius * 2.6) / 128,
      tint: 0xffffff,
      alpha: 0.8,
      fadePow: 1.8,
    });
  }

  /** Persistent bubble drawn while barrier invulnerability is up. */
  barrierHold(x: number, y: number, radius: number, tint: number): void {
    this.emit({
      key: TEX.hex,
      x,
      y,
      life: 3,
      scaleFrom: (radius * 2.05) / 160,
      scaleTo: (radius * 2.1) / 160,
      tint,
      alpha: 0.42,
      spin: 0.03,
    });
  }

  melee(x: number, y: number, angle: number, stage: number, tint: number): void {
    const scale = stage === 2 ? 1.15 : 0.85;
    this.emit({
      key: TEX.slash,
      x: x + Math.cos(angle) * 26,
      y: y + Math.sin(angle) * 26,
      life: stage === 2 ? 14 : 10,
      scaleFrom: scale * 0.5,
      scaleTo: scale,
      tint,
      alpha: 1,
      rotation: angle,
      fadePow: 1.5,
    });
    this.emit({
      key: TEX.glow,
      x: x + Math.cos(angle) * 34,
      y: y + Math.sin(angle) * 34,
      life: 9,
      scaleFrom: scale * 0.9,
      scaleTo: 0.05,
      tint: 0xffffff,
      alpha: 0.85,
    });
  }

  /**
   * Thruster plume. Emitted every other call and kept small: these stack
   * additively every frame from two nozzles per mech, so a generous size here
   * washes the chassis out completely.
   */
  private thrusterPhase = 0;

  thruster(x: number, y: number, angle: number, power: number, tint: number): void {
    if (power <= 0.05) return;
    if (++this.thrusterPhase % 2 !== 0) return;
    this.emit({
      key: TEX.glow,
      x,
      y,
      life: 6 + power * 6,
      scaleFrom: 0.09 + power * 0.17,
      scaleTo: 0.01,
      tint,
      alpha: 0.22 + power * 0.26,
      vx: Math.cos(angle) * (1.0 + power * 2.0),
      vy: Math.sin(angle) * (1.0 + power * 2.0),
      drag: 0.88,
      fadePow: 1.3,
    });
  }

  dash(x: number, y: number, angle: number, tint: number): void {
    this.emit({
      key: TEX.streak,
      x,
      y,
      life: 13,
      scaleFrom: 1.5,
      scaleTo: 0.2,
      tint,
      alpha: 0.9,
      rotation: angle + Math.PI,
      scaleYMul: 0.42,
      fadePow: 1.4,
    });
    this.emit({
      key: TEX.ring,
      x,
      y,
      life: 14,
      scaleFrom: 0.15,
      scaleTo: 1.1,
      tint: 0xffffff,
      alpha: 0.55,
      fadePow: 2,
    });
  }

  guardBreak(x: number, y: number): void {
    this.emit({ key: TEX.glow, x, y, life: 20, scaleFrom: 2.0, scaleTo: 0.1, tint: 0xff6a4a });
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      this.emit({
        key: TEX.shard,
        x,
        y,
        life: 22 + Math.random() * 14,
        scaleFrom: 0.9,
        scaleTo: 0.1,
        tint: 0xffd9c0,
        vx: Math.cos(a) * (3 + Math.random() * 5),
        vy: Math.sin(a) * (3 + Math.random() * 5),
        spin: (Math.random() - 0.5) * 0.4,
        drag: 0.94,
      });
    }
  }

  saturation(x: number, y: number, tint: number): void {
    for (let i = 0; i < 3; i++) {
      this.emit({
        key: TEX.ring,
        x,
        y,
        life: 26 + i * 6,
        scaleFrom: 0.1,
        scaleTo: 2.2 + i * 0.6,
        tint,
        alpha: 0.85,
        fadePow: 1.7,
      });
    }
    this.emit({ key: TEX.glow, x, y, life: 22, scaleFrom: 2.4, scaleTo: 0.2, tint, alpha: 1 });
  }

  /**
   * The activation burst, one recipe per saturation mode.
   *
   * The three modes now do genuinely different things, so they must not open
   * with the same puff of rings — the flash is the only moment the player is
   * told which one they committed to, and it has to be readable in the half
   * second before the fight resumes. Each is built from a different *shape*
   * rather than a different colour, since colour is already spoken for by the
   * chassis palette:
   *
   * - Shield: hex plating slamming inward onto the mech, then a held dome.
   * - Shoot: a cross of muzzle spikes and a hard white core — a weapon lighting.
   * - Speed: horizontal streaks tearing past, biased along the facing.
   */
  saturationBurst(x: number, y: number, mode: number, tint: number, facing: number): void {
    // A white core flash under every mode, so all three read as "something big
    // just happened" before they read as which one.
    this.emit({ key: TEX.glow, x, y, life: 16, scaleFrom: 3.6, scaleTo: 0.3, tint: 0xffffff, alpha: 1, fadePow: 1.6 });

    if (mode === 0) {
      // ---- SHIELD: plating converging inward, then a standing dome ----------
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const r = 120;
        this.emit({
          key: TEX.hex,
          x: x + Math.cos(a) * r,
          y: y + Math.sin(a) * r * 0.7,
          life: 20,
          scaleFrom: 0.9,
          scaleTo: 0.25,
          tint,
          alpha: 0.95,
          // Inward: the plates fly on to the mech rather than off it.
          vx: -Math.cos(a) * 6.4,
          vy: -Math.sin(a) * 4.6,
          spin: (i % 2 ? 1 : -1) * 0.12,
          drag: 0.9,
        });
      }
      for (let i = 0; i < 3; i++) {
        this.emit({
          key: TEX.ring,
          x,
          y,
          life: 30 + i * 10,
          scaleFrom: 3.0 + i * 0.5,
          scaleTo: 1.5,
          tint: i === 1 ? 0xffffff : tint,
          alpha: 0.7,
          fadePow: 2.2,
        });
      }
      this.emit({ key: TEX.hex, x, y, life: 44, scaleFrom: 0.4, scaleTo: 2.9, tint, alpha: 0.8, fadePow: 2.4 });
      return;
    }

    if (mode === 1) {
      // ---- SHOOT: a cross of muzzle spikes and a hard core ------------------
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        this.emit({
          key: TEX.streak,
          x,
          y,
          life: 18,
          scaleFrom: 2.6,
          scaleTo: 0.2,
          tint: 0xffffff,
          alpha: 1,
          rotation: a,
          scaleYMul: 0.16,
          fadePow: 1.8,
        });
      }
      for (let i = 0; i < 22; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 4 + Math.random() * 9;
        this.emit({
          key: TEX.spark,
          x,
          y,
          life: 18 + Math.random() * 18,
          scaleFrom: 0.75,
          scaleTo: 0.05,
          tint: i % 3 === 0 ? 0xffffff : tint,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp * 0.7,
          drag: 0.9,
        });
      }
      this.emit({ key: TEX.ring, x, y, life: 24, scaleFrom: 0.2, scaleTo: 3.4, tint, alpha: 0.9, fadePow: 1.5 });
      return;
    }

    // ---- SPEED: streaks tearing past, biased along the facing ---------------
    for (let i = 0; i < 16; i++) {
      const oy = (Math.random() - 0.5) * 96;
      const back = -facing;
      this.emit({
        key: TEX.streak,
        x: x + (Math.random() - 0.5) * 40,
        y: y + oy,
        life: 16 + Math.random() * 12,
        scaleFrom: 1.4 + Math.random() * 1.6,
        scaleTo: 0.1,
        tint: i % 4 === 0 ? 0xffffff : tint,
        alpha: 0.95,
        vx: back * (7 + Math.random() * 12),
        vy: oy * 0.012,
        scaleYMul: 0.1,
        drag: 0.95,
        fadePow: 1.4,
      });
    }
    for (let i = 0; i < 2; i++) {
      this.emit({
        key: TEX.ring,
        x,
        y,
        life: 22 + i * 8,
        scaleFrom: 0.2,
        scaleTo: 2.6 + i,
        tint,
        alpha: 0.75,
        scaleYMul: 0.55,
        fadePow: 1.9,
      });
    }
  }

  /**
   * Sparks venting from a machine that is stunned and hurt.
   *
   * Called every frame for the length of a saturation burnout, rather than once
   * at the start: the stun is the longest helpless window in the game, and
   * without something continuous on the mech the player cannot tell a stunned
   * machine from one that is simply hovering. `intensity` rises for an overheat,
   * which is both longer and damaging.
   *
   * Electrical rather than fiery — white-hot specks thrown out and falling,
   * with the occasional arc across the hull. Fire would read as "on fire", which
   * is a status element this game already has and means something else.
   */
  stunSparks(x: number, y: number, radius: number, tint: number, intensity = 1): void {
    const n = Math.random() < 0.55 * intensity ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = radius * (0.3 + Math.random() * 0.7);
      const sx = x + Math.cos(a) * r;
      const sy = y + Math.sin(a) * r * 0.8;
      this.emit({
        key: TEX.spark,
        x: sx,
        y: sy,
        life: 14 + Math.random() * 16,
        scaleFrom: 0.34 + Math.random() * 0.28,
        scaleTo: 0.02,
        tint: i % 2 === 0 ? 0xffffff : 0xffd9a0,
        vx: (Math.random() - 0.5) * 4.5,
        // Biased downward: the machine is shedding, not firing.
        vy: 0.8 + Math.random() * 2.6,
        drag: 0.96,
      });
    }
    // An occasional arc across the hull, so the stun reads as electrical.
    if (Math.random() < 0.16 * intensity) {
      const a = Math.random() * Math.PI * 2;
      this.emit({
        key: TEX.streak,
        x: x + Math.cos(a) * radius * 0.4,
        y: y + Math.sin(a) * radius * 0.35,
        life: 7,
        scaleFrom: 0.85,
        scaleTo: 0.2,
        tint,
        alpha: 0.9,
        rotation: Math.random() * Math.PI,
        scaleYMul: 0.11,
        fadePow: 1.6,
      });
    }
    // A puff of vented smoke now and then, low and slow.
    if (Math.random() < 0.1 * intensity) {
      this.emit({
        key: TEX.glow,
        x: x + (Math.random() - 0.5) * radius,
        y: y + radius * 0.3,
        life: 30,
        scaleFrom: 0.3,
        scaleTo: 0.9,
        tint: 0x39404f,
        alpha: 0.5,
        vy: -0.5,
        drag: 0.98,
        fadePow: 1.4,
      });
    }
  }

  /**
   * The burst running dry. Deliberately ugly next to the activation: sparks
   * falling out of the machine rather than energy pouring into it.
   */
  satBurnout(x: number, y: number): void {
    this.emit({ key: TEX.glow, x, y, life: 24, scaleFrom: 2.2, scaleTo: 0.1, tint: 0x6a7080, alpha: 0.9 });
    this.emit({ key: TEX.ring, x, y, life: 26, scaleFrom: 2.4, scaleTo: 0.4, tint: 0x99a2b5, alpha: 0.6, fadePow: 2 });
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      this.emit({
        key: TEX.spark,
        x,
        y,
        life: 26 + Math.random() * 22,
        scaleFrom: 0.6,
        scaleTo: 0.05,
        tint: i % 3 === 0 ? 0xffd9a0 : 0x8a90a0,
        vx: Math.cos(a) * (1.5 + Math.random() * 3),
        // Falls rather than radiates: the machine is venting, not firing.
        vy: Math.abs(Math.sin(a)) * (2 + Math.random() * 3),
        drag: 0.97,
      });
    }
  }

  /** Aura sustained while a saturation mode is active. */
  satAura(x: number, y: number, tint: number): void {
    this.emit({
      key: TEX.glow,
      x: x + (Math.random() - 0.5) * 40,
      y: y + (Math.random() - 0.5) * 60,
      life: 16,
      scaleFrom: 0.42,
      scaleTo: 0,
      tint,
      alpha: 0.5,
      vy: -0.9 - Math.random(),
      drag: 0.97,
    });
  }

  explode(x: number, y: number, big: boolean, tint: number): void {
    const n = big ? 34 : 14;
    this.emit({
      key: TEX.glow,
      x,
      y,
      life: big ? 40 : 20,
      scaleFrom: big ? 4.2 : 1.7,
      scaleTo: 0.2,
      tint: 0xfff0c0,
      alpha: 1,
      fadePow: 1.3,
    });
    for (let r = 0; r < (big ? 3 : 1); r++) {
      this.emit({
        key: TEX.ring,
        x,
        y,
        life: 26 + r * 10,
        scaleFrom: 0.2,
        scaleTo: big ? 4.5 + r : 1.6,
        tint: r % 2 ? tint : 0xffc879,
        alpha: 0.9,
        fadePow: 1.8,
      });
    }
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * (big ? 13 : 6);
      const shard = i % 3 === 0;
      this.emit({
        key: shard ? TEX.shard : TEX.spark,
        x,
        y,
        life: 24 + Math.random() * (big ? 40 : 20),
        scaleFrom: shard ? 1.1 : 0.6,
        scaleTo: 0.05,
        tint: i % 4 === 0 ? 0xffffff : i % 3 === 0 ? 0xff9a4a : tint,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        spin: (Math.random() - 0.5) * 0.5,
        drag: 0.945,
      });
    }
  }

  clear(): void {
    for (const p of this.pool) {
      p.active = false;
      p.img.setVisible(false);
    }
  }
}
