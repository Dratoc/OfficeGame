import { z } from 'zod';

/**
 * Office Battle: a brawl for 2 to 4 players in a 3D office, every fighter against the rest. This file holds the whole rule set as a
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

export const OFFICE_MAX_PLAYERS = 4;

export const POWER_IDS = ['stapler', 'coffee', 'folders', 'sprint', 'meeting', 'bandage'] as const;
export type PowerId = (typeof POWER_IDS)[number];

export interface PowerDef {
  id: PowerId;
  name: string;
  description: string;
  /** Seconds before it can be used again. */
  cooldown: number;
  /** Seconds the fighter is busy casting it. */
  cast: number;
}

/**
 * The power wallet: every player picks LOADOUT_SIZE of these before a fight. Powers are the
 * same for everyone and are never sold, so a fight is decided by skill, not by the shop.
 */
export const POWERS: Record<PowerId, PowerDef> = {
  stapler: { id: 'stapler', name: 'Grapadora relámpago', description: 'Dispara una ráfaga de grapas en línea recta: 8 de daño a distancia.', cooldown: 3.5, cast: 0.25 },
  coffee: { id: 'coffee', name: 'Café hirviendo', description: 'Salpica café en un cono corto: 14 de daño, empuja y atraviesa los bloqueos.', cooldown: 7, cast: 0.3 },
  folders: { id: 'folders', name: 'Escudo de carpetas', description: 'Durante 2 segundos ningún golpe te hace daño.', cooldown: 10, cast: 0.15 },
  sprint: { id: 'sprint', name: 'Viernes 17:59', description: 'Corres un 60 % más rápido durante 3 segundos.', cooldown: 8, cast: 0.1 },
  meeting: { id: 'meeting', name: 'Reunión sorpresa', description: 'Todos los que estén cerca reciben 6 de daño y quedan aturdidos casi un segundo.', cooldown: 11, cast: 0.35 },
  bandage: { id: 'bandage', name: 'Curita de RR.HH.', description: 'Recuperas 18 de vida.', cooldown: 14, cast: 0.4 },
};

export const POWER_TUNING = {
  stapler: { speed: 13, life: 0.75, damage: 8, radius: 0.18 },
  coffee: { range: 2.3, arc: 0.3, damage: 14, knockback: 8 },
  folders: { seconds: 2 },
  sprint: { seconds: 3, speed: 1.6 },
  meeting: { range: 2.6, damage: 6, stun: 0.9 },
  bandage: { heal: 18 },
} as const;

export const LOADOUT_SIZE = 2;
export const DEFAULT_LOADOUT: PowerId[] = ['stapler', 'folders'];

export const loadoutSchema = z
  .array(z.enum(POWER_IDS))
  .length(LOADOUT_SIZE)
  .refine((l) => new Set(l).size === l.length, 'Elige poderes distintos');

export const loadoutPickSchema = z.object({ matchId: z.string().min(1).max(40), powers: loadoutSchema });

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
  { x: 0.4, z: -2.8, facing: Math.PI / 2 },
  { x: -0.4, z: 2.8, facing: -Math.PI / 2 },
] as const;

export type FighterAction = 'idle' | 'run' | 'attack' | 'block' | 'dodge' | 'stun' | 'cast' | 'ko';

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
  /** The current swing or power already resolved. */
  swung: boolean;
  /** How long the current stun lasts. */
  stunFor: number;
  /** The two powers picked for this fight, and their cooldowns. */
  powers: PowerId[];
  cds: number[];
  /** Index of the power being cast, or -1. */
  power: number;
  shieldT: number;
  sprintT: number;
  /** Simulation step of the knockout, 0 while standing. Later knockouts rank higher. */
  out: number;
  hits: number;
  taken: number;
  dealt: number;
  attacks: number;
  blocks: number;
  dodges: number;
  casts: number;
}

/** One fixed step of input. `atk`, `dge`, `p1` and `p2` are presses, `blk` is held. */
export interface OfficeInput {
  seq: number;
  mx: number;
  mz: number;
  atk: boolean;
  blk: boolean;
  dge: boolean;
  /** First and second power of the loadout. */
  p1: boolean;
  p2: boolean;
}

export const officeInputSchema = z.object({
  seq: z.number().int().min(0).max(1e9),
  mx: z.number().finite().min(-1).max(1),
  mz: z.number().finite().min(-1).max(1),
  atk: z.boolean(),
  blk: z.boolean(),
  dge: z.boolean(),
  p1: z.boolean().default(false),
  p2: z.boolean().default(false),
});

export const officeInputBatchSchema = z.object({
  matchId: z.string().min(1).max(40),
  inputs: z.array(officeInputSchema).min(1).max(8),
});
export type OfficeInputBatch = z.infer<typeof officeInputBatchSchema>;

export type OfficeEventType = 'hit' | 'block' | 'dodge' | 'whiff' | 'ko' | 'power' | 'heal' | 'shielded';

export interface OfficeEvent {
  type: OfficeEventType;
  by: string;
  /** Who took it; for 'power' and 'heal', the caster. */
  target: string;
  dmg: number;
  x: number;
  z: number;
  /** The power behind it, when there is one. */
  power?: PowerId;
}

/** A flying staple burst. */
export interface Projectile {
  id: number;
  owner: string;
  x: number;
  z: number;
  vx: number;
  vz: number;
  life: number;
}

/** Everything that moves in a fight. */
export interface OfficeWorld {
  fighters: Fighter[];
  projectiles: Projectile[];
  tick: number;
  nextId: number;
}

/** What the server sends every tick. Numbers are rounded to keep it small. */
export interface OfficeFrame {
  tick: number;
  /** Server time of this frame. */
  at: number;
  fighters: Fighter[];
  projectiles: Projectile[];
  /** Last input step the server applied, per player. */
  ack: Record<string, number>;
  events: OfficeEvent[];
}

export const NO_INPUT: OfficeInput = { seq: 0, mx: 0, mz: 0, atk: false, blk: false, dge: false, p1: false, p2: false };

export function createFighter(id: string, slot: number, powers: PowerId[] = DEFAULT_LOADOUT): Fighter {
  const s = OFFICE_SPAWNS[slot % OFFICE_SPAWNS.length]!;
  return {
    id,
    x: s.x,
    z: s.z,
    facing: s.facing,
    hp: OFFICE.maxHp,
    action: 'idle',
    t: 0,
    dodgeCd: 0,
    vx: 0,
    vz: 0,
    swung: false,
    stunFor: 0,
    powers: [...powers],
    cds: powers.map(() => 0),
    power: -1,
    shieldT: 0,
    sprintT: 0,
    out: 0,
    hits: 0,
    taken: 0,
    dealt: 0,
    attacks: 0,
    blocks: 0,
    dodges: 0,
    casts: 0,
  };
}

export function createWorld(fighters: Fighter[]): OfficeWorld {
  return { fighters, projectiles: [], tick: 0, nextId: 1 };
}

export function cloneFighter(f: Fighter): Fighter {
  return { ...f, powers: [...f.powers], cds: [...f.cds] };
}

const BUSY: ReadonlySet<FighterAction> = new Set(['attack', 'dodge', 'stun', 'cast', 'ko']);

export function isBusy(f: Fighter): boolean {
  return BUSY.has(f.action);
}

function clampMove(mx: number, mz: number): [number, number] {
  const len = Math.hypot(mx, mz);
  if (len < 0.15) return [0, 0];
  return len > 1 ? [mx / len, mz / len] : [mx, mz];
}

export interface Rival {
  x: number;
  z: number;
  hp: number;
}

/** The closest rival still standing. */
export function nearestRival(f: { x: number; z: number }, rivals: readonly Rival[]): Rival | null {
  let best: Rival | null = null;
  let bestD = Infinity;
  for (const r of rivals) {
    if (r.hp <= 0 || r === f) continue;
    const d = Math.hypot(r.x - f.x, r.z - f.z);
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best;
}

function faceToward(f: Fighter, rivals: readonly Rival[], range: number = OFFICE.lockRange) {
  const rival = nearestRival(f, rivals);
  if (!rival) return;
  const dx = rival.x - f.x;
  const dz = rival.z - f.z;
  if (Math.hypot(dx, dz) <= range) f.facing = Math.atan2(dz, dx);
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
 * the office. It never touches the rivals; hits and powers are settled by `resolveCombat`.
 */
export function stepFighter(f: Fighter, input: OfficeInput, rivals: readonly Rival[], dt = OFFICE_DT): void {
  f.t += dt;
  f.dodgeCd = Math.max(0, f.dodgeCd - dt);
  f.shieldT = Math.max(0, f.shieldT - dt);
  f.sprintT = Math.max(0, f.sprintT - dt);
  for (let i = 0; i < f.cds.length; i++) f.cds[i] = Math.max(0, f.cds[i]! - dt);
  if (f.action === 'ko') {
    f.vx = f.vz = 0;
    return;
  }
  const [mx, mz] = clampMove(input.mx, input.mz);
  const moving = mx !== 0 || mz !== 0;

  // Timed actions run out.
  if (f.action === 'attack' && f.t >= OFFICE.attack.duration) setAction(f, 'idle');
  if (f.action === 'dodge' && f.t >= OFFICE.dodge.duration) setAction(f, 'idle');
  if (f.action === 'stun' && f.t >= f.stunFor) setAction(f, 'idle');
  if (f.action === 'cast' && f.t >= POWERS[f.powers[f.power] ?? 'stapler'].cast) setAction(f, 'idle');

  const cast = input.p1 ? 0 : input.p2 ? 1 : -1;
  if (!isBusy(f)) {
    if (cast >= 0 && cast < f.powers.length && f.cds[cast]! <= 0) {
      const id = f.powers[cast]!;
      setAction(f, 'cast');
      f.power = cast;
      f.cds[cast] = POWERS[id].cooldown;
      f.casts++;
      // Aimed powers turn toward the closest rival, from farther away than a swing.
      if (id === 'stapler') faceToward(f, rivals, 9);
      if (id === 'coffee') faceToward(f, rivals);
      if (id === 'folders') f.shieldT = POWER_TUNING.folders.seconds;
      if (id === 'sprint') f.sprintT = POWER_TUNING.sprint.seconds;
    } else if (input.dge && f.dodgeCd <= 0) {
      setAction(f, 'dodge');
      const dir = moving ? Math.atan2(mz, mx) : f.facing + Math.PI;
      f.vx = Math.cos(dir) * OFFICE.dodge.speed;
      f.vz = Math.sin(dir) * OFFICE.dodge.speed;
      f.dodgeCd = OFFICE.dodge.cooldown;
      f.dodges++;
    } else if (input.atk) {
      setAction(f, 'attack');
      faceToward(f, rivals);
      f.attacks++;
    } else if (input.blk) {
      if (f.action !== 'block') setAction(f, 'block');
      faceToward(f, rivals);
    } else {
      const next = moving ? 'run' : 'idle';
      if (f.action !== next) setAction(f, next);
    }
  }

  const speed = OFFICE.speed * (f.sprintT > 0 ? POWER_TUNING.sprint.speed : 1);
  let vx = 0;
  let vz = 0;
  switch (f.action) {
    case 'idle':
    case 'run':
      vx = mx * speed;
      vz = mz * speed;
      if (moving) f.facing = Math.atan2(mz, mx);
      break;
    case 'block':
      vx = mx * speed * OFFICE.blockSpeed;
      vz = mz * speed * OFFICE.blockSpeed;
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
  if (action !== 'cast') f.power = -1;
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

interface Blow {
  dmg: number;
  stun: number;
  knockback: number;
  /** Goes through a block. */
  unblockable?: boolean;
  type?: OfficeEventType;
  power?: PowerId;
}

/**
 * One blow from `a` (a fighter, or the owner of a projectile) to `d`, coming from direction
 * (ux, uz). Handles dodges, shields, blocks, damage and knockouts.
 */
function strike(world: OfficeWorld, a: Fighter, d: Fighter, ux: number, uz: number, blow: Blow, events: OfficeEvent[], melee: boolean) {
  const mid = { x: round((a.x + d.x) / 2), z: round((a.z + d.z) / 2) };
  const at = melee ? mid : { x: round(d.x), z: round(d.z) };
  const extra = blow.power ? { power: blow.power } : {};
  if (d.action === 'dodge') {
    events.push({ type: 'dodge', by: a.id, target: d.id, dmg: 0, ...at, ...extra });
    return;
  }
  if (d.shieldT > 0) {
    events.push({ type: 'shielded', by: a.id, target: d.id, dmg: 0, ...at, ...extra });
    return;
  }
  // A block only covers the front of the defender.
  const facesAttacker = Math.cos(d.facing) * -ux + Math.sin(d.facing) * -uz >= OFFICE.block.arc;
  if (d.action === 'block' && facesAttacker && !blow.unblockable) {
    const dmg = Math.min(d.hp, OFFICE.block.chip);
    d.hp -= dmg;
    a.dealt += dmg;
    d.blocks++;
    if (melee) {
      // The attacker bounces off the block and is open for a moment.
      a.action = 'stun';
      a.t = 0;
      a.stunFor = OFFICE.stun.duration;
      a.vx = -ux * OFFICE.stun.knockback * 0.6;
      a.vz = -uz * OFFICE.stun.knockback * 0.6;
      a.power = -1;
    }
    events.push({ type: 'block', by: a.id, target: d.id, dmg, ...at, ...extra });
    if (d.hp <= 0) knockOut(world, d, events, a.id, at);
    return;
  }
  const dmg = Math.min(d.hp, blow.dmg);
  d.hp -= dmg;
  d.taken++;
  a.hits++;
  a.dealt += dmg;
  d.action = 'stun';
  d.t = 0;
  d.stunFor = blow.stun;
  d.swung = false;
  d.power = -1;
  d.vx = ux * blow.knockback;
  d.vz = uz * blow.knockback;
  d.facing = Math.atan2(-uz, -ux);
  events.push({ type: blow.type ?? 'hit', by: a.id, target: d.id, dmg, ...at, ...extra });
  if (d.hp <= 0) knockOut(world, d, events, a.id, at);
}

function direction(a: { x: number; z: number; facing: number }, d: { x: number; z: number }) {
  const dx = d.x - a.x;
  const dz = d.z - a.z;
  const dist = Math.hypot(dx, dz);
  const ux = dist > 1e-6 ? dx / dist : Math.cos(a.facing);
  const uz = dist > 1e-6 ? dz / dist : Math.sin(a.facing);
  return { dist, ux, uz, front: Math.cos(a.facing) * ux + Math.sin(a.facing) * uz };
}

function insideFurniture(x: number, z: number) {
  return OFFICE_OBSTACLES.some((o) => Math.abs(x - o.x) <= o.hw && Math.abs(z - o.z) <= o.hd) || Math.abs(x) > OFFICE_ARENA.halfW || Math.abs(z) > OFFICE_ARENA.halfD;
}

/**
 * Settles swings and powers that reach their moment, moves projectiles and keeps fighters
 * from overlapping. Server only (and the offline practice): this is where damage happens.
 */
export function resolveCombat(world: OfficeWorld, dt = OFFICE_DT): OfficeEvent[] {
  const events: OfficeEvent[] = [];
  const { fighters } = world;
  world.tick++;

  // Powers act the moment they are cast.
  for (const a of fighters) {
    if (a.action !== 'cast' || a.swung) continue;
    a.swung = true;
    const id = a.powers[a.power];
    if (!id) continue;
    events.push({ type: 'power', by: a.id, target: a.id, dmg: 0, x: round(a.x), z: round(a.z), power: id });
    if (id === 'stapler') {
      const t = POWER_TUNING.stapler;
      world.projectiles.push({ id: world.nextId++, owner: a.id, x: a.x + Math.cos(a.facing) * 0.6, z: a.z + Math.sin(a.facing) * 0.6, vx: Math.cos(a.facing) * t.speed, vz: Math.sin(a.facing) * t.speed, life: t.life });
    } else if (id === 'coffee') {
      const t = POWER_TUNING.coffee;
      for (const d of fighters) {
        if (d === a || d.action === 'ko') continue;
        const { dist, ux, uz, front } = direction(a, d);
        if (dist <= t.range + OFFICE.radius && (front >= t.arc || dist < OFFICE.radius * 2.2)) strike(world, a, d, ux, uz, { dmg: t.damage, stun: OFFICE.stun.duration, knockback: t.knockback, unblockable: true, power: id }, events, false);
      }
    } else if (id === 'meeting') {
      const t = POWER_TUNING.meeting;
      for (const d of fighters) {
        if (d === a || d.action === 'ko') continue;
        const { dist, ux, uz } = direction(a, d);
        if (dist <= t.range + OFFICE.radius) strike(world, a, d, ux, uz, { dmg: t.damage, stun: t.stun, knockback: 2, unblockable: true, power: id }, events, false);
      }
    } else if (id === 'bandage') {
      const heal = Math.min(OFFICE.maxHp - a.hp, POWER_TUNING.bandage.heal);
      a.hp += heal;
      events.push({ type: 'heal', by: a.id, target: a.id, dmg: heal, x: round(a.x), z: round(a.z), power: id });
    }
  }

  // Swings.
  for (const a of fighters) {
    if (a.action !== 'attack' || a.swung || a.t < OFFICE.attack.hitAt) continue;
    a.swung = true;
    let landed = false;
    for (const d of fighters) {
      if (d === a || d.action === 'ko') continue;
      const { dist, ux, uz, front } = direction(a, d);
      if (dist > OFFICE.attack.range + OFFICE.radius || (front < OFFICE.attack.arc && dist > OFFICE.radius * 2.2)) continue;
      landed = true;
      strike(world, a, d, ux, uz, { dmg: OFFICE.attack.damage, stun: OFFICE.stun.duration, knockback: OFFICE.stun.knockback }, events, true);
      // Bounced off a block: the swing stops there.
      if ((a.action as FighterAction) === 'stun') break;
    }
    if (!landed) events.push({ type: 'whiff', by: a.id, target: a.id, dmg: 0, x: round(a.x + Math.cos(a.facing)), z: round(a.z + Math.sin(a.facing)) });
  }

  // Staples in flight.
  const t = POWER_TUNING.stapler;
  world.projectiles = world.projectiles.filter((p) => {
    p.life -= dt;
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    if (p.life <= 0 || insideFurniture(p.x, p.z)) return false;
    const owner = fighters.find((f) => f.id === p.owner);
    for (const d of fighters) {
      if (d.id === p.owner || d.action === 'ko') continue;
      if (Math.hypot(d.x - p.x, d.z - p.z) > OFFICE.radius + t.radius) continue;
      if (d.action === 'dodge') continue;
      const speed = Math.hypot(p.vx, p.vz) || 1;
      const src = owner ?? d;
      strike(world, src, d, p.vx / speed, p.vz / speed, { dmg: t.damage, stun: 0.22, knockback: 2.5, power: 'stapler' }, events, false);
      return false;
    }
    return true;
  });

  separate(fighters);
  return events;
}

function knockOut(world: OfficeWorld, d: Fighter, events: OfficeEvent[], by: string, at: { x: number; z: number }) {
  d.hp = 0;
  d.action = 'ko';
  d.t = 0;
  d.vx = d.vz = 0;
  d.shieldT = d.sprintT = 0;
  d.out = world.tick;
  events.push({ type: 'ko', by, target: d.id, dmg: 0, ...at });
}

function separate(fighters: Fighter[]) {
  for (let i = 0; i < fighters.length; i++) {
    for (let j = i + 1; j < fighters.length; j++) {
      const a = fighters[i]!;
      const b = fighters[j]!;
      if (a.action === 'ko' || b.action === 'ko') continue;
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
  return {
    ...f,
    x: round(f.x),
    z: round(f.z),
    facing: Math.round(f.facing * 1000) / 1000,
    t: Math.round(f.t * 1000) / 1000,
    dodgeCd: round(f.dodgeCd),
    vx: round(f.vx),
    vz: round(f.vz),
    cds: f.cds.map(round),
    shieldT: round(f.shieldT),
    sprintT: round(f.sprintT),
  };
}

export function packProjectile(p: Projectile): Projectile {
  return { ...p, x: round(p.x), z: round(p.z), vx: round(p.vx), vz: round(p.vz), life: round(p.life) };
}

/** True when at most one fighter is still standing. */
export function lastStanding(fighters: readonly Fighter[]): boolean {
  return fighters.length > 1 && fighters.filter((f) => f.hp > 0).length <= 1;
}

/**
 * Who is ahead: still standing beats knocked out, and lasting longer beats an earlier knockout;
 * then more health, then more damage dealt. Positive if a is ahead of b.
 */
export function compareFighters(a: Fighter, b: Fighter): number {
  const alive = Number(a.hp > 0) - Number(b.hp > 0);
  if (alive) return alive;
  if (a.hp <= 0 && a.out !== b.out) return a.out - b.out;
  if (a.hp !== b.hp) return a.hp - b.hp;
  return a.dealt - b.dealt;
}

/** Private Office Battle rooms: a host creates one, friends join with its code. */
export const LOBBY_CODE_LENGTH = 5;
/** Letters that cannot be confused with each other when read aloud or typed. */
export const LOBBY_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const lobbyCodeSchema = z.object({ code: z.string().trim().toUpperCase().length(LOBBY_CODE_LENGTH) });
export const lobbyInviteSchema = z.object({ userId: z.string().min(1).max(40) });
