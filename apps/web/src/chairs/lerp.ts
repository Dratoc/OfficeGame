import type { Kart } from '@inbox/shared';

/** A chair between two simulation steps, for smooth drawing at any frame rate. */
export function lerpKart(a: Kart, b: Kart, k: number): Kart {
  // A big jump (a correction or a respawn) is not blended.
  if (Math.hypot(b.x - a.x, b.z - a.z) > 3) return b;
  const d = Math.atan2(Math.sin(b.h - a.h), Math.cos(b.h - a.h));
  return { ...b, x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, h: a.h + d * k, v: a.v + (b.v - a.v) * k };
}
