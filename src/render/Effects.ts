import Phaser from 'phaser';
import { TEX } from './Textures';
import { ProjKind } from '../combat/types';

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
  }): void {
    const p = this.take();
    if (!p) return;
    p.active = true;
    p.life = opts.life;
    p.maxLife = opts.life;
    p.vx = opts.vx ?? 0;
    p.vy = opts.vy ?? 0;
    p.drag = opts.drag ?? 0.94;
    p.spin = opts.spin ?? 0;
    p.scaleFrom = opts.scaleFrom;
    p.scaleTo = opts.scaleTo ?? 0;
    p.alphaFrom = opts.alpha ?? 1;
    p.fadePow = opts.fadePow ?? 1;

    const img = p.img;
    img.setTexture(opts.key);
    img.setPosition(opts.x, opts.y);
    img.setTint(opts.tint);
    img.setRotation(opts.rotation ?? 0);
    img.setScale(opts.scaleFrom, opts.scaleFrom * (opts.scaleYMul ?? 1));
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
      p.img.setScale(s, s * ym);
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
