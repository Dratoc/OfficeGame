import { z } from 'zod';

/**
 * Office Battle: a 1 vs 1 brawl in a 3D office. This file holds the whole rule set as a
 * deterministic fixed-step simulation. The server runs it as the source of truth; the client
 * runs the same steps to predict its own fighter so the controls feel instant.
 *
 * Coordinates: x goes right, z goes toward the camera, both in meters. Facing is the angle of
 * the direction the fighter looks at, atan2(dz, dx).
 */

export const OFFICE_TICK_MS = 1000 / 30;
export const OFFICE_DT = OFFICE_TICK_MS / 1000;

export const OFFICE = {
  maxHp: 100,
  radius: 0.42,
  speed: 4.4,
  /** Speed multiplier while holding block. */
  blockSpeed: 0.35,
  attack: {
    duration: 0.46,
    /** Seconds into the swing when the hit lands. */
    hitAt: 0.17,
    range: 1.55,
    /** cos of the half-angle in front of the attacker that the swing covers. */
    arc: 0.35,
    damage: 10,
    /** Small forward step during the swing. */
    lunge: 1.6,
  },
  block: {
    /** Damage that still goes through a block. */
    chip: 2,
    /** cos of the half-angle that a block covers in front of the defender. */
    arc: 0.0,
  },
  dodge: { duration: 0.3, speed: 10.5, cooldown: 0.9 },
  /** Getting hit, or bouncing off a block, leaves you unable to act for a moment. */
  stun: { duration: 0.4, knockback: 6.5 },
  /** Attacks and blocks turn toward a rival that is this close. */
  lockRange: 3.6,
} as const;

/** Playable floor, a rectangle centered on the origin. */
export const OFFICE_ARENA = { halfW: 8, halfD: 5 } as const;

export type ObstacleKind = 'desk' | 'printer' | 'cooler' | 'plant' | 'shelf';

export interface Obstacle {
  kind: ObstacleKind;
  x: number;
  z: number;
  /** Half sizes on x and z. */
  hw: number;
  hd: number;
  /** Rotation in quarter turns, only for drawing. */
  turn?: number;
}

/** Office furniture that blocks movement. The client draws one model per obstacle. */
export const OFFICE_OBSTACLES: readonly Obstacle[] = [
  { kind: 'desk', x: -5, z: -2.6, hw: 1.2, hd: 0.6 },
  { kind: 'desk', x: 5, z: 2.6, hw: 1.2, hd: 0.6, turn: 2 },
  { kind: 'printer', x: -6.2, z: 3.4, hw: 0.55, hd: 0.4 },
  { kind: 'cooler', x: 6.4, z: -3.6, hw: 0.3, hd: 0.3 },
  { kind: 'plant', x: 0, z: -4.2, hw: 0.32, hd: 0.32 },
  { kind: 'plant', x: -1.8, z: 3.9, hw: 0.32, hd: 0.32 },
  { kind: 'shelf', x: 2.4, z: -4.35, hw: 0.9, hd: 0.3 },
];

export const OFFICE_SPAWNS = [
  { x: -3, z: 0.4, facing: 0 },
  { x: 3, z: -0.4, facing: Math.PI },
] as const;

export type FighterAction = 'idle' | 'run' | 'attack' | 'block' | 'dodge' | 'stun' | 'ko';

export interface Fighter {
  id: string;
  x: number;
  z: number;
  facing: number;
  hp: number;
  action: FighterAction;
  /** Seconds since the current action started. */
  t: number;
  dodgeCd: number;
  /** Velocity of a dash or a knockback, in m/s. */
  vx: number;
  vz: number;
  /** The current swing already resolved its hit. */
  swung: boolean;
  hits: number;
  taken: number;
  dealt: number;
  attacks: number;
  blocks: number;
  dodges: number;
}

/** One fixed step of input. `atk` and `dge` are presses, `blk` is held. */
export interface OfficeInput {
  seq: number;
  mx: number;
  mz: number;
  atk: boolean;
  blk: boolean;
  dge: boolean;
}

export const officeInputSchema = z.object({
  seq: z.number().int().min(0).max(1e9),
  mx: z.number().finite().min(-1).max(1),
  mz: z.number().finite().min(-1).max(1),
  atk: z.boolean(),
  blk: z.boolean(),
  dge: z.boolean(),
});

export const officeInputBatchSchema = z.object({
  matchId: z.string().min(1).max(40),
  inputs: z.array(officeInputSchema).min(1).max(8),
});
export type OfficeInputBatch = z.infer<typeof officeInputBatchSchema>;

export type OfficeEventType = 'hit' | 'block' | 'dodge' | 'whiff' | 'ko';

export interface OfficeEvent {
  type: OfficeEventType;
  by: string;
  target: string;
  dmg: number;
  x: number;
  z: number;
}

/** What the server sends every tick. Numbers are rounded to keep it small. */
export interface OfficeFrame {
  tick: number;
  /** Server time of this frame. */
  at: number;
  fighters: Fighter[];
  /** Last input step the server applied, per player. */
  ack: Record<string, number>;
  events: OfficeEvent[];
}

export const NO_INPUT: OfficeInput = { seq: 0, mx: 0, mz: 0, atk: false, blk: false, dge: false };

export function createFighter(id: string, slot: number): Fighter {
  const s = OFFICE_SPAWNS[slot % OFFICE_SPAWNS.length]!;
  return { id, x: s.x, z: s.z, facing: s.facing, hp: OFFICE.maxHp, action: 'idle', t: 0, dodgeCd: 0, vx: 0, vz: 0, swung: false, hits: 0, taken: 0, dealt: 0, attacks: 0, blocks: 0, dodges: 0 };
}

export function cloneFighter(f: Fighter): Fighter {
  return { ...f };
}

const BUSY: ReadonlySet<FighterAction> = new Set(['attack', 'dodge', 'stun', 'ko']);

export function isBusy(f: Fighter): boolean {
  return BUSY.has(f.action);
}

function clampMove(mx: number, mz: number): [number, number] {
  const len = Math.hypot(mx, mz);
  if (len < 0.15) return [0, 0];
  return len > 1 ? [mx / len, mz / len] : [mx, mz];
}

function faceToward(f: Fighter, rival: { x: number; z: number } | null | undefined) {
  if (!rival) return;
  const dx = rival.x - f.x;
  const dz = rival.z - f.z;
  if (Math.hypot(dx, dz) <= OFFICE.lockRange) f.facing = Math.atan2(dz, dx);
}

/** Pushes a circle out of the arena walls and the furniture. */
export function collide(p: { x: number; z: number }, r = OFFICE.radius) {
  for (const o of OFFICE_OBSTACLES) {
    const cx = Math.max(o.x - o.hw, Math.min(p.x, o.x + o.hw));
    const cz = Math.max(o.z - o.hd, Math.min(p.z, o.z + o.hd));
    const dx = p.x - cx;
    const dz = p.z - cz;
    const d = Math.hypot(dx, dz);
    if (d < r) {
      if (d > 1e-6) {
        p.x = cx + (dx / d) * r;
        p.z = cz + (dz / d) * r;
      } else {
        // Center inside the box: leave by the nearest side.
        const pushes = [
          [o.x - o.hw - r - p.x, 0],
          [o.x + o.hw + r - p.x, 0],
          [0, o.z - o.hd - r - p.z],
          [0, o.z + o.hd + r - p.z],
        ] as const;
        const best = pushes.reduce((a, b) => (Math.abs(a[0] + a[1]) <= Math.abs(b[0] + b[1]) ? a : b));
        p.x += best[0];
        p.z += best[1];
      }
    }
  }
  p.x = Math.max(-OFFICE_ARENA.halfW + r, Math.min(OFFICE_ARENA.halfW - r, p.x));
  p.z = Math.max(-OFFICE_ARENA.halfD + r, Math.min(OFFICE_ARENA.halfD - r, p.z));
}

/**
 * Advances one fighter by one fixed step: action changes, movement and collisions with
 * the office. It never touches the rival; hits are settled by `resolveCombat`.
 */
export function stepFighter(f: Fighter, input: OfficeInput, rival: { x: number; z: number } | null, dt = OFFICE_DT): void {
  f.t += dt;
  f.dodgeCd = Math.max(0, f.dodgeCd - dt);
  if (f.action === 'ko') {
    f.vx = f.vz = 0;
    return;
  }
  const [mx, mz] = clampMove(input.mx, input.mz);
  const moving = mx !== 0 || mz !== 0;

  // Timed actions run out.
  if (f.action === 'attack' && f.t >= OFFICE.attack.duration) setAction(f, 'idle');
  if (f.action === 'dodge' && f.t >= OFFICE.dodge.duration) setAction(f, 'idle');
  if (f.action === 'stun' && f.t >= OFFICE.stun.duration) setAction(f, 'idle');

  if (!isBusy(f)) {
    if (input.dge && f.dodgeCd <= 0) {
      setAction(f, 'dodge');
      const dir = moving ? Math.atan2(mz, mx) : f.facing + Math.PI;
      f.vx = Math.cos(dir) * OFFICE.dodge.speed;
      f.vz = Math.sin(dir) * OFFICE.dodge.speed;
      f.dodgeCd = OFFICE.dodge.cooldown;
      f.dodges++;
    } else if (input.atk) {
      setAction(f, 'attack');
      faceToward(f, rival);
      f.attacks++;
    } else if (input.blk) {
      if (f.action !== 'block') setAction(f, 'block');
      faceToward(f, rival);
    } else {
      const next = moving ? 'run' : 'idle';
      if (f.action !== next) setAction(f, next);
    }
  }

  let vx = 0;
  let vz = 0;
  switch (f.action) {
    case 'idle':
    case 'run':
      vx = mx * OFFICE.speed;
      vz = mz * OFFICE.speed;
      if (moving) f.facing = Math.atan2(mz, mx);
      break;
    case 'block':
      vx = mx * OFFICE.speed * OFFICE.blockSpeed;
      vz = mz * OFFICE.speed * OFFICE.blockSpeed;
      break;
    case 'attack': {
      const lunge = f.t < OFFICE.attack.hitAt ? OFFICE.attack.lunge : 0;
      vx = Math.cos(f.facing) * lunge;
      vz = Math.sin(f.facing) * lunge;
      break;
    }
    case 'dodge':
      vx = f.vx;
      vz = f.vz;
      break;
    case 'stun': {
      vx = f.vx;
      vz = f.vz;
      // Knockback fades quickly.
      const decay = Math.max(0, 1 - 9 * dt);
      f.vx = Math.abs(f.vx * decay) < 0.05 ? 0 : f.vx * decay;
      f.vz = Math.abs(f.vz * decay) < 0.05 ? 0 : f.vz * decay;
      break;
    }
  }
  f.x += vx * dt;
  f.z += vz * dt;
  collide(f);
}

function setAction(f: Fighter, action: FighterAction) {
  f.action = action;
  f.t = 0;
  if (action !== 'stun' && action !== 'dodge') {
    f.vx = 0;
    f.vz = 0;
  }
  f.swung = false;
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * Settles swings that reach their hit moment, and keeps fighters from overlapping.
 * Server only (and the offline practice): this is where damage happens.
 */
export function resolveCombat(fighters: Fighter[]): OfficeEvent[] {
  const events: OfficeEvent[] = [];
  for (const a of fighters) {
    if (a.action !== 'attack' || a.swung || a.t < OFFICE.attack.hitAt) continue;
    a.swung = true;
    for (const d of fighters) {
      if (d === a || d.action === 'ko') continue;
      const dx = d.x - a.x;
      const dz = d.z - a.z;
      const dist = Math.hypot(dx, dz);
      const ux = dist > 1e-6 ? dx / dist : Math.cos(a.facing);
      const uz = dist > 1e-6 ? dz / dist : Math.sin(a.facing);
      const inFront = Math.cos(a.facing) * ux + Math.sin(a.facing) * uz >= OFFICE.attack.arc;
      const mid = { x: round((a.x + d.x) / 2), z: round((a.z + d.z) / 2) };
      if (dist > OFFICE.attack.range + OFFICE.radius || (!inFront && dist > OFFICE.radius * 2.2)) {
        events.push({ type: 'whiff', by: a.id, target: d.id, dmg: 0, x: round(a.x + Math.cos(a.facing)), z: round(a.z + Math.sin(a.facing)) });
        continue;
      }
      if (d.action === 'dodge') {
        events.push({ type: 'dodge', by: a.id, target: d.id, dmg: 0, ...mid });
        continue;
      }
      // A block only covers the front of the defender.
      const facesAttacker = Math.cos(d.facing) * -ux + Math.sin(d.facing) * -uz >= OFFICE.block.arc;
      if (d.action === 'block' && facesAttacker) {
        const dmg = Math.min(d.hp, OFFICE.block.chip);
        d.hp -= dmg;
        a.dealt += dmg;
        d.blocks++;
        // The attacker bounces off the block and is open for a moment.
        a.action = 'stun';
        a.t = 0;
        a.vx = -ux * OFFICE.stun.knockback * 0.6;
        a.vz = -uz * OFFICE.stun.knockback * 0.6;
        events.push({ type: 'block', by: a.id, target: d.id, dmg, ...mid });
        if (d.hp <= 0) knockOut(d, events, a.id, mid);
        continue;
      }
      const dmg = Math.min(d.hp, OFFICE.attack.damage);
      d.hp -= dmg;
      d.taken++;
      a.hits++;
      a.dealt += dmg;
      d.action = 'stun';
      d.t = 0;
      d.swung = false;
      d.vx = ux * OFFICE.stun.knockback;
      d.vz = uz * OFFICE.stun.knockback;
      d.facing = Math.atan2(-uz, -ux);
      events.push({ type: 'hit', by: a.id, target: d.id, dmg, ...mid });
      if (d.hp <= 0) knockOut(d, events, a.id, mid);
    }
  }
  separate(fighters);
  return events;
}

function knockOut(d: Fighter, events: OfficeEvent[], by: string, at: { x: number; z: number }) {
  d.hp = 0;
  d.action = 'ko';
  d.t = 0;
  d.vx = d.vz = 0;
  events.push({ type: 'ko', by, target: d.id, dmg: 0, ...at });
}

function separate(fighters: Fighter[]) {
  for (let i = 0; i < fighters.length; i++) {
    for (let j = i + 1; j < fighters.length; j++) {
      const a = fighters[i]!;
      const b = fighters[j]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      const min = OFFICE.radius * 2;
      if (d >= min) continue;
      const ux = d > 1e-6 ? dx / d : 1;
      const uz = d > 1e-6 ? dz / d : 0;
      const push = (min - d) / 2;
      a.x -= ux * push;
      a.z -= uz * push;
      b.x += ux * push;
      b.z += uz * push;
      collide(a);
      collide(b);
    }
  }
}

/** Rounds a fighter for the wire. */
export function packFighter(f: Fighter): Fighter {
  return { ...f, x: round(f.x), z: round(f.z), facing: Math.round(f.facing * 1000) / 1000, t: Math.round(f.t * 1000) / 1000, dodgeCd: round(f.dodgeCd), vx: round(f.vx), vz: round(f.vz) };
}

/**
 * Who is ahead: still standing beats knocked out, then more health, then more damage dealt.
 * Positive if a is ahead of b.
 */
export function compareFighters(a: Fighter, b: Fighter): number {
  const alive = Number(a.hp > 0) - Number(b.hp > 0);
  if (alive) return alive;
  if (a.hp !== b.hp) return a.hp - b.hp;
  return a.dealt - b.dealt;
}
