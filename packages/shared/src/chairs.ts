import { z } from 'zod';

/**
 * Chair Race: 2 to 4 players race office chairs around a track laid out on the office floor.
 * You can only throw paper balls straight ahead, and landing one on a rival gives you a boost.
 * So the leader can only dodge, while those behind always have someone to aim at and a way
 * to catch up.
 *
 * Like Office Battle, this file is the whole rule set as a deterministic fixed-step simulation:
 * the server runs it as the source of truth and the client runs the same steps to predict its
 * own chair. Coordinates: x goes right, z goes toward the camera, both in meters. A heading is
 * the angle of the direction the chair rolls, atan2(dz, dx); steering right makes it grow.
 */

export const CHAIRS_TICK_MS = 1000 / 30;
export const CHAIRS_DT = CHAIRS_TICK_MS / 1000;
export const CHAIRS_MAX_PLAYERS = 4;
export const CHAIRS_LAPS = 3;
/** Once the first chair crosses the finish line, the rest have this long to finish. */
export const CHAIRS_CLOSE_MS = 15_000;

export const CHAIRS = {
  radius: 0.6,
  maxSpeed: 12,
  reverseSpeed: 4,
  accel: 10,
  brake: 18,
  /** Slowdown when you let go of the throttle. */
  drag: 4,
  /** Radians per second at full lock and full speed; chairs can turn a bit while still. */
  turn: 2.5,
  /** Speed kept each step while scraping a wall. */
  wallGrip: 0.93,
  boost: { seconds: 2, maxSpeed: 16.5, accel: 24, kick: 4 },
  /** A hit spins you around: no control for a moment, and much slower. */
  spin: { seconds: 0.8, keep: 0.45 },
  /** A quick sideways hop: paper balls fly under you while you are in the air. */
  hop: { seconds: 0.32, speed: 7.5, cooldown: 1.5 },
  shot: { cooldown: 0.55, speed: 21, life: 1.05, radius: 0.32 },
} as const;

/** Control points of the track's center line, a closed loop through the office. */
export const TRACK_POINTS: readonly (readonly [number, number])[] = [
  [-16, -15],
  [0, -15],
  [16, -14],
  [25, -9],
  [28, -1],
  [24, 6],
  [15, 8],
  [9, 14],
  [0, 16],
  [-9, 15],
  [-14, 10],
  [-17, 4],
  [-22, 1],
  [-29, 0],
  [-33, -6],
  [-31, -12],
  [-25, -15],
];
export const TRACK_HALF_WIDTH = 3.6;

export interface TrackSample {
  x: number;
  z: number;
  /** Unit direction of travel. */
  tx: number;
  tz: number;
  /** Distance from the start line. */
  s: number;
}

export interface Track {
  samples: TrackSample[];
  length: number;
  halfWidth: number;
}

function catmull(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** Samples the closed spline through the control points. Built once and shared by everyone. */
export function buildTrack(points = TRACK_POINTS, perSegment = 48, halfWidth = TRACK_HALF_WIDTH): Track {
  const n = points.length;
  const raw: { x: number; z: number }[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n]!;
    const p1 = points[i]!;
    const p2 = points[(i + 1) % n]!;
    const p3 = points[(i + 2) % n]!;
    for (let k = 0; k < perSegment; k++) {
      const t = k / perSegment;
      raw.push({ x: catmull(p0[0], p1[0], p2[0], p3[0], t), z: catmull(p0[1], p1[1], p2[1], p3[1], t) });
    }
  }
  // Round off the tighter corners: a few passes of a moving average along the loop.
  for (let pass = 0; pass < 10; pass++) {
    const copy = raw.map((p) => ({ ...p }));
    for (let i = 0; i < raw.length; i++) {
      let x = 0;
      let z = 0;
      for (let k = -8; k <= 8; k++) {
        const q = copy[(i + k + raw.length) % raw.length]!;
        x += q.x;
        z += q.z;
      }
      raw[i] = { x: x / 17, z: z / 17 };
    }
  }
  const samples: TrackSample[] = [];
  let s = 0;
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i]!;
    const b = raw[(i + 1) % raw.length]!;
    const prev = raw[(i - 1 + raw.length) % raw.length]!;
    const dx = b.x - prev.x;
    const dz = b.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    samples.push({ x: a.x, z: a.z, tx: dx / len, tz: dz / len, s });
    s += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return { samples, length: s, halfWidth };
}

export const TRACK: Track = buildTrack();

export interface TrackSpot {
  /** Index of the nearest sample. */
  i: number;
  /** Distance along the track from the start line, 0..length. */
  s: number;
  /** Signed distance from the center line; positive is to the right of the direction of travel. */
  side: number;
}

/** Where a point is on the track. With a hint, only nearby samples are searched. */
export function locate(track: Track, x: number, z: number, hint = -1): TrackSpot {
  const { samples } = track;
  const n = samples.length;
  let best = 0;
  let bestD = Infinity;
  const check = (i: number) => {
    const p = samples[i]!;
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  };
  if (hint >= 0) for (let k = -24; k <= 24; k++) check((((hint + k) % n) + n) % n);
  else for (let i = 0; i < n; i++) check(i);
  const p = samples[best]!;
  // Project onto the local direction for a smooth distance along the track.
  const along = (x - p.x) * p.tx + (z - p.z) * p.tz;
  const side = (x - p.x) * -p.tz + (z - p.z) * p.tx;
  return { i: best, s: (((p.s + along) % track.length) + track.length) % track.length, side };
}

/** A point on the track at distance s, moved `side` meters to the right. */
export function pointAt(track: Track, s: number, side = 0): { x: number; z: number; tx: number; tz: number } {
  const { samples, length } = track;
  const d = ((s % length) + length) % length;
  // Binary search for the sample just before d.
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (samples[mid]!.s <= d) lo = mid;
    else hi = mid - 1;
  }
  const a = samples[lo]!;
  const b = samples[(lo + 1) % samples.length]!;
  const segLen = (b.s || length) - a.s;
  const k = segLen > 0 ? (d - a.s) / segLen : 0;
  const tx = a.tx + (b.tx - a.tx) * k;
  const tz = a.tz + (b.tz - a.tz) * k;
  const tl = Math.hypot(tx, tz) || 1;
  return { x: a.x + (b.x - a.x) * k + (-tz / tl) * side, z: a.z + (b.z - a.z) * k + (tx / tl) * side, tx: tx / tl, tz: tz / tl };
}

export interface Kart {
  id: string;
  x: number;
  z: number;
  /** Direction the chair rolls. */
  h: number;
  /** Speed along the heading, m/s; negative rolls backward. */
  v: number;
  /** Nearest track sample, to search quickly next step. */
  i: number;
  /** Meters driven along the track since the start line; negative on the grid. */
  prog: number;
  /** Finished laps. */
  lap: number;
  /** Simulation step when it crossed the finish line, 0 while racing. */
  done: number;
  boostT: number;
  spinT: number;
  hopT: number;
  /** Sideways hop direction: -1 left, 1 right. */
  hopDir: number;
  hopCd: number;
  shotCd: number;
  /** Threw a paper ball this step; the server turns it into a projectile. */
  fired: boolean;
  /** Scraping a wall this step. */
  wall: boolean;
  shots: number;
  hits: number;
  taken: number;
  hops: number;
}

/** One fixed step of input. `fire` and `hop` are presses. */
export interface ChairsInput {
  seq: number;
  /** -1 full left, 1 full right. */
  steer: number;
  /** 1 full throttle, -1 brake and reverse. */
  thr: number;
  fire: boolean;
  /** -1 hop left, 1 hop right, 0 none. */
  hop: number;
}

export const CHAIRS_NO_INPUT: ChairsInput = { seq: 0, steer: 0, thr: 0, fire: false, hop: 0 };

export const chairsInputSchema = z.object({
  seq: z.number().int().min(0).max(1e9),
  steer: z.number().finite().min(-1).max(1),
  thr: z.number().finite().min(-1).max(1),
  fire: z.boolean(),
  hop: z.number().int().min(-1).max(1),
});

export const chairsInputBatchSchema = z.object({
  matchId: z.string().min(1).max(40),
  inputs: z.array(chairsInputSchema).min(1).max(8),
});
export type ChairsInputBatch = z.infer<typeof chairsInputBatchSchema>;

/** A flying ball of crumpled paper. */
export interface PaperBall {
  id: number;
  owner: string;
  x: number;
  z: number;
  vx: number;
  vz: number;
  life: number;
}

export type ChairsEventType = 'fire' | 'hit' | 'hop' | 'lap' | 'finish' | 'bump';

export interface ChairsEvent {
  type: ChairsEventType;
  /** Who threw, hopped, finished a lap or bumped. */
  by: string;
  /** Who got hit; equals `by` for other events. */
  target: string;
  x: number;
  z: number;
  /** For 'lap': laps finished; for 'finish': the place. */
  n?: number;
}

export interface ChairsWorld {
  karts: Kart[];
  balls: PaperBall[];
  tick: number;
  nextId: number;
  /** How many chairs crossed the finish line. */
  finished: number;
}

/** What the server sends every tick. */
export interface ChairsFrame {
  tick: number;
  at: number;
  karts: Kart[];
  balls: PaperBall[];
  ack: Record<string, number>;
  events: ChairsEvent[];
  /** Server time when the race closes after the first chair finished, or null. */
  closeAt: number | null;
}

/** Starting grid: two by two behind the start line. */
export function gridSpot(slot: number, track: Track = TRACK) {
  const row = Math.floor(slot / 2);
  const back = 3 + row * 3.4;
  const side = (slot % 2 === 0 ? -1 : 1) * 1.6;
  const p = pointAt(track, track.length - back, side);
  return { x: p.x, z: p.z, h: Math.atan2(p.tz, p.tx), prog: -back };
}

export function createKart(id: string, slot: number, track: Track = TRACK): Kart {
  const g = gridSpot(slot, track);
  return {
    id,
    x: g.x,
    z: g.z,
    h: g.h,
    v: 0,
    i: locate(track, g.x, g.z).i,
    prog: g.prog,
    lap: 0,
    done: 0,
    boostT: 0,
    spinT: 0,
    hopT: 0,
    hopDir: 0,
    hopCd: 0,
    shotCd: 0,
    fired: false,
    wall: false,
    shots: 0,
    hits: 0,
    taken: 0,
    hops: 0,
  };
}

export function createChairsWorld(karts: Kart[]): ChairsWorld {
  return { karts, balls: [], tick: 0, nextId: 1, finished: 0 };
}

export function cloneKart(k: Kart): Kart {
  return { ...k };
}

/**
 * Advances one chair by one fixed step: steering, speed, the hop, walls and progress along
 * the track. It never touches the rivals; paper balls and bumps are settled by `resolveChairs`.
 */
export function stepKart(k: Kart, input: ChairsInput, track: Track = TRACK, dt = CHAIRS_DT): void {
  k.boostT = Math.max(0, k.boostT - dt);
  k.spinT = Math.max(0, k.spinT - dt);
  k.hopT = Math.max(0, k.hopT - dt);
  k.hopCd = Math.max(0, k.hopCd - dt);
  k.shotCd = Math.max(0, k.shotCd - dt);
  k.fired = false;

  const finished = k.done > 0;
  const control = k.spinT <= 0;
  // After the finish line the chair coasts to a stop on its own.
  const steer = finished || !control ? 0 : Math.max(-1, Math.min(1, input.steer));
  const thr = finished ? 0 : !control ? 0 : Math.max(-1, Math.min(1, input.thr));

  const boosted = k.boostT > 0;
  const top = boosted ? CHAIRS.boost.maxSpeed : CHAIRS.maxSpeed;
  const accel = boosted ? CHAIRS.boost.accel : CHAIRS.accel;
  if (!control) {
    k.v *= Math.max(0, 1 - 2.5 * dt);
  } else if (thr > 0.05) {
    const want = top * thr;
    if (k.v < want) k.v = Math.min(want, k.v + accel * dt * (k.v < 0 ? 2 : 1));
    else k.v = Math.max(want, k.v - CHAIRS.drag * dt);
  } else if (thr < -0.05) {
    if (k.v > 0) k.v = Math.max(0, k.v - CHAIRS.brake * dt * -thr);
    else k.v = Math.max(-CHAIRS.reverseSpeed, k.v - CHAIRS.accel * 0.6 * dt * -thr);
  } else {
    const d = (finished ? CHAIRS.drag * 1.5 : CHAIRS.drag) * dt;
    k.v = Math.abs(k.v) <= d ? 0 : k.v - Math.sign(k.v) * d;
  }
  // A boost always pulls you up to speed, even off the throttle.
  if (boosted && k.v < CHAIRS.maxSpeed && control && !finished) k.v = Math.min(top, k.v + accel * 0.5 * dt);

  const grip = 0.45 + 0.55 * Math.min(1, Math.abs(k.v) / 6);
  k.h += steer * CHAIRS.turn * grip * dt * (k.v < -0.3 ? -1 : 1);
  k.h = Math.atan2(Math.sin(k.h), Math.cos(k.h));

  if (control && !finished && input.hop !== 0 && k.hopCd <= 0 && k.hopT <= 0) {
    k.hopT = CHAIRS.hop.seconds;
    k.hopDir = input.hop > 0 ? 1 : -1;
    k.hopCd = CHAIRS.hop.cooldown;
    k.hops++;
  }
  if (control && !finished && input.fire && k.shotCd <= 0) {
    k.shotCd = CHAIRS.shot.cooldown;
    k.fired = true;
    k.shots++;
  }

  let vx = Math.cos(k.h) * k.v;
  let vz = Math.sin(k.h) * k.v;
  if (k.hopT > 0) {
    // Right of the heading is (-sin h, cos h).
    vx += -Math.sin(k.h) * k.hopDir * CHAIRS.hop.speed;
    vz += Math.cos(k.h) * k.hopDir * CHAIRS.hop.speed;
  }
  k.x += vx * dt;
  k.z += vz * dt;

  // Walls: the cubicle partitions along both edges of the track.
  const spot = locate(track, k.x, k.z, k.i);
  const limit = track.halfWidth - CHAIRS.radius;
  k.wall = false;
  if (Math.abs(spot.side) > limit) {
    const p = track.samples[spot.i]!;
    const push = Math.abs(spot.side) - limit;
    const sign = Math.sign(spot.side);
    k.x -= -p.tz * sign * push;
    k.z -= p.tx * sign * push;
    k.v *= CHAIRS.wallGrip;
    k.wall = true;
  }
  const after = locate(track, k.x, k.z, spot.i);
  const prevS = (((k.prog % track.length) + track.length) % track.length);
  let ds = after.s - prevS;
  if (ds > track.length / 2) ds -= track.length;
  if (ds < -track.length / 2) ds += track.length;
  k.i = after.i;
  k.prog += ds;
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * Throws the paper balls of this step, moves those in flight, settles hits, laps and the finish
 * line, and keeps chairs from overlapping. Server only (and the offline practice).
 */
export function resolveChairs(world: ChairsWorld, track: Track = TRACK, dt = CHAIRS_DT): ChairsEvent[] {
  const events: ChairsEvent[] = [];
  const { karts } = world;
  world.tick++;
  const S = CHAIRS.shot;

  for (const k of karts) {
    if (!k.fired) continue;
    k.fired = false;
    const fx = Math.cos(k.h);
    const fz = Math.sin(k.h);
    // Straight ahead only, at the chair's speed plus the throw.
    const speed = Math.max(0, k.v) + S.speed;
    world.balls.push({ id: world.nextId++, owner: k.id, x: k.x + fx * (CHAIRS.radius + 0.3), z: k.z + fz * (CHAIRS.radius + 0.3), vx: fx * speed, vz: fz * speed, life: S.life });
    events.push({ type: 'fire', by: k.id, target: k.id, x: round(k.x), z: round(k.z) });
  }

  world.balls = world.balls.filter((b) => {
    b.life -= dt;
    b.x += b.vx * dt;
    b.z += b.vz * dt;
    if (b.life <= 0) return false;
    // Paper balls stop at the partitions.
    if (Math.abs(locate(track, b.x, b.z).side) > track.halfWidth + 0.2) return false;
    for (const k of karts) {
      if (k.id === b.owner || k.done > 0) continue;
      if (Math.hypot(k.x - b.x, k.z - b.z) > CHAIRS.radius + S.radius) continue;
      // Hopping chairs let paper balls fly underneath.
      if (k.hopT > 0) continue;
      k.spinT = CHAIRS.spin.seconds;
      k.v *= CHAIRS.spin.keep;
      k.taken++;
      const owner = karts.find((o) => o.id === b.owner);
      if (owner) {
        owner.hits++;
        if (owner.done === 0) {
          owner.boostT = CHAIRS.boost.seconds;
          owner.v = Math.min(CHAIRS.boost.maxSpeed, Math.max(owner.v, 0) + CHAIRS.boost.kick);
        }
      }
      events.push({ type: 'hit', by: b.owner, target: k.id, x: round(k.x), z: round(k.z) });
      return false;
    }
    return true;
  });

  // Chairs bounce off each other.
  for (let i = 0; i < karts.length; i++) {
    for (let j = i + 1; j < karts.length; j++) {
      const a = karts[i]!;
      const b = karts[j]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      const min = CHAIRS.radius * 2;
      if (d >= min) continue;
      const ux = d > 1e-6 ? dx / d : 1;
      const uz = d > 1e-6 ? dz / d : 0;
      const push = (min - d) / 2;
      a.x -= ux * push;
      a.z -= uz * push;
      b.x += ux * push;
      b.z += uz * push;
      // The one who rams in from behind loses a little speed.
      const aFront = Math.cos(a.h) * ux + Math.sin(a.h) * uz;
      const bFront = -(Math.cos(b.h) * ux + Math.sin(b.h) * uz);
      if (aFront > 0.5) a.v *= 0.85;
      if (bFront > 0.5) b.v *= 0.85;
      if (aFront > 0.5 || bFront > 0.5) events.push({ type: 'bump', by: a.id, target: b.id, x: round((a.x + b.x) / 2), z: round((a.z + b.z) / 2) });
    }
  }

  // Laps and the finish line.
  for (const k of karts) {
    if (k.done > 0) continue;
    const laps = Math.max(0, Math.floor(k.prog / track.length));
    if (laps > k.lap) {
      k.lap = Math.min(laps, CHAIRS_LAPS);
      if (k.lap >= CHAIRS_LAPS) {
        world.finished++;
        k.done = world.tick;
        k.boostT = 0;
        events.push({ type: 'finish', by: k.id, target: k.id, x: round(k.x), z: round(k.z), n: world.finished });
      } else {
        events.push({ type: 'lap', by: k.id, target: k.id, x: round(k.x), z: round(k.z), n: k.lap });
      }
    }
  }
  return events;
}

/** Positive if a is ahead of b: finishing first beats finishing later, then distance driven. */
export function compareKarts(a: Kart, b: Kart): number {
  if (a.done && b.done) return b.done - a.done;
  if (a.done || b.done) return a.done ? 1 : -1;
  return a.prog - b.prog;
}

/** Ids from first place to last. */
export function standings(karts: readonly Kart[]): string[] {
  return [...karts].sort((a, b) => compareKarts(b, a)).map((k) => k.id);
}

/** Rounds a chair for the wire. */
export function packKart(k: Kart): Kart {
  return {
    ...k,
    x: round(k.x),
    z: round(k.z),
    h: Math.round(k.h * 1000) / 1000,
    v: round(k.v),
    prog: round(k.prog),
    boostT: round(k.boostT),
    spinT: round(k.spinT),
    hopT: Math.round(k.hopT * 1000) / 1000,
    hopCd: round(k.hopCd),
    shotCd: round(k.shotCd),
  };
}

export function packBall(b: PaperBall): PaperBall {
  return { ...b, x: round(b.x), z: round(b.z), vx: round(b.vx), vz: round(b.vz), life: round(b.life) };
}
