import type { Fighter } from '@inbox/shared';

function lerpAngle(a: number, b: number, k: number) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * k;
}

/** A fighter between two simulation steps, for smooth drawing at any frame rate. */
export function lerpFighter(a: Fighter, b: Fighter, k: number): Fighter {
  const pos = { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k };
  if (a.action !== b.action) return { ...b, ...pos };
  return { ...b, ...pos, facing: lerpAngle(a.facing, b.facing, k), t: a.t + (b.t - a.t) * k };
}
