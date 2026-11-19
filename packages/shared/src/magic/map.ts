import { mulberry32 } from '../rng';

/**
 * The prototype battlefield: a valley with a road from the player's camp (south) to the enemy camp
 * (north), forest on both flanks and rocks in the middle to fight around. Obstacles are circles so
 * steering and collisions stay cheap. Generated from a fixed seed, so every client builds the same map.
 */

export interface MfObstacle {
  x: number;
  z: number;
  r: number;
  kind: 'tree' | 'rock' | 'tower' | 'tent' | 'wall';
  /** Tents: which camp they belong to. */
  team?: number;
  /** Visual size and variation; does not change the collision circle. */
  size: number;
}

export interface MfMap {
  half: number;
  playerSpawn: { x: number; z: number; facing: number };
  enemyCamp: { x: number; z: number; facing: number };
  obstacles: MfObstacle[];
  /** Strategic fortresses (conquest only). */
  forts: MfFortSite[];
}

export type MfMapId = 'skirmish' | 'conquest';

/** A fortress: square walls with a gate in the middle of each side. */
export interface MfFortSite {
  name: string;
  x: number;
  z: number;
  /** Half the side of the square of walls. */
  half: number;
  /** Gate centers, in the gaps of the walls. */
  gates: { x: number; z: number }[];
}

/** Gate gaps are this wide; the gate itself (when standing) closes them. */
export const GATE_HALF_WIDTH = 2.2;
const FORT_HALF = 9;
const FORTS = [
  { name: 'Fortaleza del Oeste', x: -32, z: -3 },
  { name: 'Fortaleza Central', x: 0, z: -3 },
  { name: 'Fortaleza del Este', x: 32, z: -3 },
];

const HALF = 70;
const PLAYER = { x: 0, z: -46, facing: 0 };
const ENEMY = { x: 0, z: 40, facing: Math.PI };

/** The road winds a little; trees never grow on it. */
export function roadX(z: number): number {
  return Math.sin(z * 0.045) * 7;
}

function nearRoad(x: number, z: number, margin: number) {
  return Math.abs(x - roadX(z)) < margin;
}

const cached = new Map<MfMapId, MfMap>();

/**
 * The valley. 'skirmish' is the open battlefield of the first prototype; 'conquest' adds three
 * walled fortresses across the middle of the map (and clears the forest around them).
 */
export function magicMap(id: MfMapId = 'skirmish'): MfMap {
  const hit = cached.get(id);
  if (hit) return hit;
  const rnd = mulberry32(20261119);
  const obstacles: MfObstacle[] = [];
  const forts: MfFortSite[] = [];
  if (id === 'conquest') {
    for (const f of FORTS) {
      const h = FORT_HALF;
      const gates = [
        { x: f.x, z: f.z + h },
        { x: f.x, z: f.z - h },
        { x: f.x + h, z: f.z },
        { x: f.x - h, z: f.z },
      ];
      forts.push({ ...f, half: h, gates });
      // Walls as a chain of touching stones, leaving a gap for each gate.
      // From the edge of each gate out to the corners, so the gate closes the gap exactly.
      const ts: number[] = [];
      for (let t = GATE_HALF_WIDTH + 1; t < h; t += 1.5) ts.push(t, -t);
      ts.push(h, -h);
      for (const t of ts) {
        for (const [x, z] of [
          [f.x + t, f.z + h],
          [f.x + t, f.z - h],
          [f.x + h, f.z + t],
          [f.x - h, f.z + t],
        ] as const)
          if (!obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < 0.5)) obstacles.push({ x, z, r: 1, kind: 'wall', size: 1 });
      }
    }
  }
  const free = (x: number, z: number, r: number) => obstacles.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + r + 1.4);
  const clearOfCamps = (x: number, z: number) =>
    Math.hypot(x - PLAYER.x, z - PLAYER.z) > 16 && Math.hypot(x - ENEMY.x, z - ENEMY.z) > 18 && forts.every((f) => Math.max(Math.abs(x - f.x), Math.abs(z - f.z)) > f.half + 7);

  // Two ruined watchtowers at the enemy camp, a hint of the fortresses to come.
  obstacles.push({ x: -12, z: 50, r: 2.2, kind: 'tower', size: 1 });
  obstacles.push({ x: 12, z: 50, r: 2.2, kind: 'tower', size: 1 });

  // Tents around each camp.
  for (const [team, camp] of [PLAYER, ENEMY].entries()) {
    const back = team === 0 ? -1 : 1;
    for (const [dx, dz] of [
      [-8, 7],
      [8, 7],
      [-10, -1],
      [10, -1],
    ] as const)
      obstacles.push({ x: camp.x + dx, z: camp.z + dz * back, r: 1.4, kind: 'tent', size: 1, team });
  }

  // Forests on the flanks, thicker towards the edges.
  const walls = obstacles.filter((o) => o.kind === 'wall').length;
  for (let i = 0; i < 900 && obstacles.length - walls < 150; i++) {
    const side = rnd() < 0.5 ? -1 : 1;
    const x = side * (24 + Math.pow(rnd(), 0.7) * (HALF - 26));
    const z = -HALF + 4 + rnd() * (HALF * 2 - 8);
    const r = 0.7 + rnd() * 0.5;
    if (!clearOfCamps(x, z) || !free(x, z, r)) continue;
    obstacles.push({ x, z, r, kind: 'tree', size: 0.8 + rnd() * 0.6 });
  }
  // Rocks and a few small trees in the open field: cover to fight around, kept away from the
  // road so they never hide the army from the camera while marching.
  for (let i = 0; i < 400 && obstacles.length - walls < 185; i++) {
    const x = (rnd() * 2 - 1) * 22;
    const z = -30 + rnd() * 58;
    const rock = rnd() < 0.65;
    const r = rock ? 0.9 + rnd() * 1 : 0.7;
    if (nearRoad(x, z, 10) || !clearOfCamps(x, z) || !free(x, z, r + 3)) continue;
    obstacles.push({ x, z, r, kind: rock ? 'rock' : 'tree', size: rock ? r : 0.7 + rnd() * 0.25 });
  }

  const map: MfMap = { half: HALF, playerSpawn: PLAYER, enemyCamp: ENEMY, obstacles, forts };
  cached.set(id, map);
  return map;
}
