/** Small deterministic math helpers shared by the simulation and the renderer. */

export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Moves `from` toward `to` by at most `maxDelta`. */
export function approach(from: number, to: number, maxDelta: number): number {
  if (from < to) return Math.min(from + maxDelta, to);
  if (from > to) return Math.max(from - maxDelta, to);
  return to;
}

/** Wraps an angle (radians) into (-PI, PI]. */
export function wrapAngle(a: number): number {
  let x = a;
  while (x <= -Math.PI) x += TAU;
  while (x > Math.PI) x -= TAU;
  return x;
}

/** Shortest signed angular difference from `a` to `b`, in radians. */
export function angleDelta(a: number, b: number): number {
  return wrapAngle(b - a);
}

/**
 * Rotates `from` toward `to` by at most `maxStep` radians, taking the short way
 * around. Used for turret slew and chassis banking.
 */
export function approachAngle(from: number, to: number, maxStep: number): number {
  const d = angleDelta(from, to);
  if (Math.abs(d) <= maxStep) return wrapAngle(to);
  return wrapAngle(from + Math.sign(d) * maxStep);
}

export function length(x: number, y: number): number {
  return Math.hypot(x, y);
}

/** Scales the vector so its length never exceeds `max`. Returns [x, y]. */
export function limitLength(x: number, y: number, max: number): [number, number] {
  const l = Math.hypot(x, y);
  if (l <= max || l === 0) return [x, y];
  const s = max / l;
  return [x * s, y * s];
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}
