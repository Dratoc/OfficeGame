import { z } from 'zod';
import { mulberry32 } from './rng';

/**
 * Zona Zombi: a cooperative survival mode for 1 to 4 players on a wide map.
 *
 * Hordes of zombies come in waves. They appear around every player, outside the screen, and each
 * one follows the player it came for until that player falls. Zombies come in three sizes: small
 * ones barely hurt, but three small ones that bunch up merge into a normal one, and three normal
 * ones merge into a big one that wrecks vehicles.
 *
 * Three strongholds stand on the map, each with its own shop: a medieval castle (medieval weapons
 * and a war chariot), a magic tower (spells and a flying carpet) and a corporate building (modern
 * weapons, a car and a truck with a plow). Money comes only from killing zombies and is spent on
 * weapons, weapon upgrades, healing, vehicles and materials to barricade the stronghold doors.
 *
 * The fighting works like Office Battle: move, attack (J), block (K) and dodge (Space). Waves never
 * end: the game is over when every player is down at the same time. With friendly fire on, your
 * weapons also hurt your teammates.
 *
 * Like the other real-time modes, this file is the whole rule set as a deterministic fixed-step
 * simulation: the server runs it as the source of truth, the offline practice runs it locally,
 * and the client runs `moveSurvivor` and `driveVehicle` to predict its own movement.
 * Coordinates: x goes right, z goes toward the camera (down on the screen), in meters.
 */

export const ZOMBIE_TICK_MS = 50;
export const ZOMBIE_DT = ZOMBIE_TICK_MS / 1000;
export const ZOMBIE_MAX_PLAYERS = 4;

/** The playable map is a square centered on the origin. */
export const ZMAP = { half: 60 } as const;

export const SURVIVOR = {
  maxHp: 100,
  radius: 0.42,
  speed: 4.6,
  blockSpeed: 0.35,
  /** Share of a zombie's blow that still goes through a block from the front. */
  blockChip: 0.25,
  dodge: { duration: 0.3, speed: 10.5, cooldown: 0.9 },
  stun: 0.28,
  /** Melee swings turn toward a zombie this close; shots aim from farther away. */
  lockMelee: 3.6,
  lockShot: 15,
  startMoney: 60,
  /** Seconds a teammate holds E next to you to get you back up, and the health you come back with. */
  reviveSeconds: 2.2,
  reviveHp: 45,
  /** A fallen player gets back up on their own after this many seconds, protected for a moment. */
  respawnSeconds: 8,
  respawnHp: 70,
  respawnShield: 2.5,
  /** Friendly fire is always on: share of a weapon's damage that hurts other players. */
  friendlyShare: 0.6,
  /** Money for a player who joins a match in progress, per wave already played. */
  latecomerMoney: 45,
  useReach: 2.4,
} as const;

// ───────────────────────────── The map ─────────────────────────────

export type FortId = 'castillo' | 'torre' | 'corporativo';
export const FORT_IDS: readonly FortId[] = ['castillo', 'torre', 'corporativo'];

export interface FortDef {
  id: FortId;
  name: string;
  /** The shop's name and what it sells. */
  shop: string;
  color: string;
  cx: number;
  cz: number;
  hw: number;
  hd: number;
  /** Where the shopkeeper's counter stands, and the spot in front of it. */
  counter: { x: number; z: number; hw: number; hd: number };
  shopSpot: { x: number; z: number };
  /** Where bought vehicles appear, outside the main door. */
  pad: { x: number; z: number; h: number };
}

export const FORTS: Record<FortId, FortDef> = {
  castillo: {
    id: 'castillo',
    name: 'Castillo',
    shop: 'Herrería del castillo',
    color: '#c9a36a',
    cx: -34,
    cz: 6,
    hw: 10,
    hd: 8,
    counter: { x: -34, z: 0, hw: 2.2, hd: 0.5 },
    shopSpot: { x: -34, z: 1.4 },
    pad: { x: -34, z: 19.5, h: Math.PI / 2 },
  },
  torre: {
    id: 'torre',
    name: 'Torre mágica',
    shop: 'Bazar arcano',
    color: '#9a6cff',
    cx: 30,
    cz: -30,
    hw: 8,
    hd: 8,
    counter: { x: 28, z: -35.5, hw: 2.2, hd: 0.5 },
    shopSpot: { x: 28, z: -34.1 },
    pad: { x: 30, z: -16.5, h: Math.PI / 2 },
  },
  corporativo: {
    id: 'corporativo',
    name: 'Edificio corporativo',
    shop: 'Proveedores S.A.',
    color: '#5ab0ff',
    cx: 32,
    cz: 30,
    hw: 10,
    hd: 8,
    counter: { x: 32, z: 35.5, hw: 2.2, hd: 0.5 },
    shopSpot: { x: 32, z: 34.1 },
    pad: { x: 32, z: 16.5, h: -Math.PI / 2 },
  },
};

export const WALL_T = 0.8;
export const DOOR_HALF = 1.7;

export interface DoorDef {
  id: number;
  fort: FortId;
  x: number;
  z: number;
  /** Outward normal of the wall the door is in. */
  nx: number;
  nz: number;
  /** Points just outside and just inside, where zombies line up to go through. */
  out: { x: number; z: number };
  in: { x: number; z: number };
  /** The barricade's box when it is up. */
  box: Box;
}

export interface Box {
  x: number;
  z: number;
  hw: number;
  hd: number;
}

/** Doors of each stronghold, as the side of the wall and the offset along it. */
const DOOR_SPEC: Record<FortId, { side: 'n' | 's' | 'e' | 'w'; at: number }[]> = {
  castillo: [
    { side: 's', at: 0 },
    { side: 'e', at: 0 },
  ],
  torre: [
    { side: 's', at: 0 },
    { side: 'w', at: 0 },
  ],
  corporativo: [
    { side: 'n', at: 0 },
    { side: 'w', at: 0 },
  ],
};

function buildDoors(): DoorDef[] {
  const doors: DoorDef[] = [];
  for (const id of FORT_IDS) {
    const f = FORTS[id];
    for (const d of DOOR_SPEC[id]) {
      const nx = d.side === 'e' ? 1 : d.side === 'w' ? -1 : 0;
      const nz = d.side === 's' ? 1 : d.side === 'n' ? -1 : 0;
      const x = nx ? f.cx + nx * f.hw : f.cx + d.at;
      const z = nz ? f.cz + nz * f.hd : f.cz + d.at;
      doors.push({
        id: doors.length,
        fort: id,
        x,
        z,
        nx,
        nz,
        out: { x: x + nx * 2.2, z: z + nz * 2.2 },
        in: { x: x - nx * 2.2, z: z - nz * 2.2 },
        box: nx ? { x, z, hw: WALL_T / 2 + 0.1, hd: DOOR_HALF } : { x, z, hw: DOOR_HALF, hd: WALL_T / 2 + 0.1 },
      });
    }
  }
  return doors;
}

export const DOORS: readonly DoorDef[] = buildDoors();

export type WallKind = 'wall' | 'counter' | 'tower' | 'tree' | 'rock' | 'wreck' | 'crate';

export interface Solid extends Box {
  kind: WallKind;
  fort?: FortId;
  /** Rotation for drawing, in radians. */
  rot?: number;
}

function buildWalls(): Solid[] {
  const out: Solid[] = [];
  for (const id of FORT_IDS) {
    const f = FORTS[id];
    const doors = DOORS.filter((d) => d.fort === id);
    const sides = [
      { side: 'n', horizontal: true, fixed: f.cz - f.hd, from: f.cx - f.hw - WALL_T / 2, to: f.cx + f.hw + WALL_T / 2 },
      { side: 's', horizontal: true, fixed: f.cz + f.hd, from: f.cx - f.hw - WALL_T / 2, to: f.cx + f.hw + WALL_T / 2 },
      { side: 'w', horizontal: false, fixed: f.cx - f.hw, from: f.cz - f.hd + WALL_T / 2, to: f.cz + f.hd - WALL_T / 2 },
      { side: 'e', horizontal: false, fixed: f.cx + f.hw, from: f.cz - f.hd + WALL_T / 2, to: f.cz + f.hd - WALL_T / 2 },
    ] as const;
    for (const s of sides) {
      const gaps = doors
        .filter((d) => (s.horizontal ? d.nz !== 0 && Math.abs(d.z - s.fixed) < 0.01 : d.nx !== 0 && Math.abs(d.x - s.fixed) < 0.01))
        .map((d) => (s.horizontal ? d.x : d.z))
        .sort((a, b) => a - b);
      let start = s.from;
      for (const g of [...gaps, null]) {
        const end = g === null ? s.to : g - DOOR_HALF;
        if (end - start > 0.05) {
          const mid = (start + end) / 2;
          const half = (end - start) / 2;
          out.push(s.horizontal ? { kind: 'wall', fort: id, x: mid, z: s.fixed, hw: half, hd: WALL_T / 2 } : { kind: 'wall', fort: id, x: s.fixed, z: mid, hw: WALL_T / 2, hd: half });
        }
        if (g !== null) start = g + DOOR_HALF;
      }
    }
    out.push({ kind: 'counter', fort: id, ...f.counter });
  }
  // The magic tower itself stands in a corner of its courtyard.
  out.push({ kind: 'tower', fort: 'torre', x: 34.5, z: -25.5, hw: 1.9, hd: 1.9 });
  return out;
}

function insideRect(x: number, z: number, r: Box, margin = 0) {
  return Math.abs(x - r.x) <= r.hw + margin && Math.abs(z - r.z) <= r.hd + margin;
}

const fortBox = (f: FortDef): Box => ({ x: f.cx, z: f.cz, hw: f.hw, hd: f.hd });

/** Trees, rocks and wrecked cars scattered around, the same in every match. */
function buildProps(): Solid[] {
  const rnd = mulberry32(20261118);
  const props: Solid[] = [];
  const kinds: WallKind[] = ['tree', 'tree', 'tree', 'rock', 'wreck', 'crate'];
  let tries = 0;
  while (props.length < 46 && tries++ < 2000) {
    const x = (rnd() * 2 - 1) * (ZMAP.half - 4);
    const z = (rnd() * 2 - 1) * (ZMAP.half - 4);
    if (Math.hypot(x, z) < 11) continue;
    if (FORT_IDS.some((id) => insideRect(x, z, fortBox(FORTS[id]), 7))) continue;
    // Keep the roads between the plaza and the strongholds clear.
    if (FORT_IDS.some((id) => distToSegment(x, z, 0, 0, FORTS[id].pad.x, FORTS[id].pad.z) < 4.5)) continue;
    if (props.some((p) => Math.hypot(p.x - x, p.z - z) < 5)) continue;
    const kind = kinds[Math.floor(rnd() * kinds.length)]!;
    const rot = rnd() * Math.PI;
    const size = kind === 'tree' ? { hw: 0.5, hd: 0.5 } : kind === 'rock' ? { hw: 0.9, hd: 0.8 } : kind === 'wreck' ? { hw: 1.0, hd: 1.0 } : { hw: 0.55, hd: 0.55 };
    props.push({ kind, x, z, rot, ...size });
  }
  return props;
}

function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax;
  const dz = bz - az;
  const len = dx * dx + dz * dz;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len)) : 0;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

export const ZWALLS: readonly Solid[] = buildWalls();
export const ZPROPS: readonly Solid[] = buildProps();
const SOLIDS: readonly Solid[] = [...ZWALLS, ...ZPROPS];

/** The stronghold whose courtyard holds this point, if any. */
export function fortAt(x: number, z: number): FortId | null {
  for (const id of FORT_IDS) {
    const f = FORTS[id];
    if (Math.abs(x - f.cx) < f.hw - WALL_T / 2 && Math.abs(z - f.cz) < f.hd - WALL_T / 2) return id;
  }
  return null;
}

/** Pushes a circle out of a box. */
function pushOut(p: { x: number; z: number }, o: Box, r: number): boolean {
  const cx = Math.max(o.x - o.hw, Math.min(p.x, o.x + o.hw));
  const cz = Math.max(o.z - o.hd, Math.min(p.z, o.z + o.hd));
  const dx = p.x - cx;
  const dz = p.z - cz;
  const d = Math.hypot(dx, dz);
  if (d >= r) return false;
  if (d > 1e-6) {
    p.x = cx + (dx / d) * r;
    p.z = cz + (dz / d) * r;
  } else {
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
  return true;
}

/** Keeps a circle out of walls, props, the map edge and, for zombies, raised barricades. */
export function collideZ(p: { x: number; z: number }, r: number, barricades?: readonly number[]): boolean {
  let hit = false;
  for (const o of SOLIDS) {
    if (Math.abs(p.x - o.x) > o.hw + r + 0.1 || Math.abs(p.z - o.z) > o.hd + r + 0.1) continue;
    if (pushOut(p, o, r)) hit = true;
  }
  if (barricades) {
    for (const d of DOORS) {
      if ((barricades[d.id] ?? 0) <= 0) continue;
      if (pushOut(p, d.box, r)) hit = true;
    }
  }
  const lim = ZMAP.half - r;
  if (Math.abs(p.x) > lim || Math.abs(p.z) > lim) hit = true;
  p.x = Math.max(-lim, Math.min(lim, p.x));
  p.z = Math.max(-lim, Math.min(lim, p.z));
  return hit;
}

function blocked(x: number, z: number, r: number): boolean {
  if (Math.abs(x) > ZMAP.half - r || Math.abs(z) > ZMAP.half - r) return true;
  return SOLIDS.some((o) => insideRect(x, z, o, r));
}

// ───────────────────────────── Weapons, vehicles, shop ─────────────────────────────

export const WEAPON_IDS = ['bate', 'espada', 'ballesta', 'martillo', 'baston', 'rayo', 'hielo', 'pistola', 'escopeta', 'motosierra'] as const;
export type WeaponId = (typeof WEAPON_IDS)[number];

export type WeaponKind = 'melee' | 'shot' | 'nova' | 'saw';
export type ShotKind = 'bolt' | 'fire' | 'zap' | 'bullet' | 'pellet';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  fort: FortId | null;
  kind: WeaponKind;
  price: number;
  description: string;
  /** Damage per blow, per shot or per pellet; damage per second for the chainsaw. */
  damage: number;
  /** Seconds between uses. */
  cooldown: number;
  /** Seconds the swing or the shot keeps you busy, and when it lands. */
  duration: number;
  hitAt: number;
  /** Holding the attack keeps firing. */
  auto?: boolean;
  range?: number;
  /** cos of the half-angle a swing covers. */
  arc?: number;
  knockback?: number;
  shot?: ShotKind;
  speed?: number;
  life?: number;
  pellets?: number;
  spread?: number;
  /** Zombies a shot goes through. */
  pierce?: number;
  /** Explosion radius on impact. */
  blast?: number;
  /** Seconds a frost spell slows zombies. */
  slow?: number;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  bate: { id: 'bate', name: 'Bate de oficina', fort: null, kind: 'melee', price: 0, description: 'Con lo que empiezas. Golpe rápido y corto.', damage: 15, cooldown: 0.42, duration: 0.42, hitAt: 0.15, range: 1.6, arc: 0.3, knockback: 4 },
  espada: { id: 'espada', name: 'Espada', fort: 'castillo', kind: 'melee', price: 70, description: 'Tajo amplio que alcanza a varios zombis.', damage: 30, cooldown: 0.42, duration: 0.42, hitAt: 0.15, range: 2.0, arc: 0.1, knockback: 4.5 },
  ballesta: { id: 'ballesta', name: 'Ballesta', fort: 'castillo', kind: 'shot', price: 140, description: 'Virote a distancia que atraviesa a dos zombis.', damage: 38, cooldown: 0.8, duration: 0.35, hitAt: 0.12, shot: 'bolt', speed: 24, life: 0.9, pierce: 2, knockback: 3 },
  martillo: { id: 'martillo', name: 'Martillo de guerra', fort: 'castillo', kind: 'melee', price: 240, description: 'Lento, pero aplasta todo lo que tienes delante y alrededor.', damage: 62, cooldown: 0.8, duration: 0.8, hitAt: 0.4, range: 2.3, arc: -0.3, knockback: 9 },
  baston: { id: 'baston', name: 'Bastón de fuego', fort: 'torre', kind: 'shot', price: 160, description: 'Bola de fuego que explota al chocar.', damage: 26, cooldown: 0.75, duration: 0.35, hitAt: 0.15, shot: 'fire', speed: 15, life: 1.1, blast: 2.4, knockback: 4 },
  rayo: { id: 'rayo', name: 'Varita de rayos', fort: 'torre', kind: 'shot', price: 280, description: 'Rayos seguidos que atraviesan a toda una fila. Mantén para disparar.', damage: 20, cooldown: 0.42, duration: 0.25, hitAt: 0.08, auto: true, shot: 'zap', speed: 32, life: 0.6, pierce: 5, knockback: 1.5 },
  hielo: { id: 'hielo', name: 'Anillo de escarcha', fort: 'torre', kind: 'nova', price: 210, description: 'Onda helada a tu alrededor: daña y deja lentos a los zombis.', damage: 24, cooldown: 3, duration: 0.4, hitAt: 0.2, range: 4.2, slow: 3, knockback: 5 },
  pistola: { id: 'pistola', name: 'Pistola', fort: 'corporativo', kind: 'shot', price: 100, description: 'Tiros rápidos. Mantén para disparar.', damage: 17, cooldown: 0.28, duration: 0.18, hitAt: 0.05, auto: true, shot: 'bullet', speed: 34, life: 0.6, knockback: 1.5 },
  escopeta: { id: 'escopeta', name: 'Escopeta', fort: 'corporativo', kind: 'shot', price: 220, description: 'Seis perdigones en abanico. Brutal de cerca.', damage: 12, cooldown: 0.9, duration: 0.35, hitAt: 0.08, shot: 'pellet', speed: 26, life: 0.38, pellets: 6, spread: 0.55, knockback: 3 },
  motosierra: { id: 'motosierra', name: 'Motosierra', fort: 'corporativo', kind: 'saw', price: 300, description: 'Mantén el ataque: corta sin parar todo lo que tienes enfrente.', damage: 80, cooldown: 0, duration: 0.1, hitAt: 0, auto: true, range: 1.8, arc: 0.25 },
};

/** Damage multiplier by weapon level (1 to 3). */
export const WEAPON_LEVELS = [1, 1.45, 2] as const;
export const MAX_WEAPON_LEVEL = 3;

export const VEHICLE_IDS = ['carro', 'alfombra', 'auto', 'camion'] as const;
export type VehicleId = (typeof VEHICLE_IDS)[number];

export interface VehicleDef {
  id: VehicleId;
  name: string;
  fort: FortId;
  price: number;
  description: string;
  hp: number;
  maxSpeed: number;
  accel: number;
  /** Radians per second at full lock. */
  turn: number;
  radius: number;
  /** Damage dealt per m/s when running a zombie over. 0: it flies over them. */
  ram: number;
  /** Plows through big zombies instead of stopping. */
  plow?: boolean;
  flies?: boolean;
}

export const VEHICLES: Record<VehicleId, VehicleDef> = {
  carro: { id: 'carro', name: 'Carro de guerra', fort: 'castillo', price: 280, description: 'Carro con cuchillas en las ruedas. Atropella y aguanta bastante.', hp: 240, maxSpeed: 11, accel: 9, turn: 2.6, radius: 1.1, ram: 4 },
  alfombra: { id: 'alfombra', name: 'Alfombra voladora', fort: 'torre', price: 320, description: 'La más rápida. Vuela por encima de los zombis, pero no los atropella.', hp: 150, maxSpeed: 14.5, accel: 13, turn: 3.4, radius: 1.0, ram: 0, flies: true },
  auto: { id: 'auto', name: 'Auto', fort: 'corporativo', price: 260, description: 'Rápido y ágil para cruzar el mapa atropellando.', hp: 210, maxSpeed: 14, accel: 11, turn: 2.8, radius: 1.1, ram: 4 },
  camion: { id: 'camion', name: 'Camión con pala', fort: 'corporativo', price: 600, description: 'Lento y enorme. La pala barre hordas enteras y resiste a los grandes.', hp: 560, maxSpeed: 9, accel: 6, turn: 1.9, radius: 1.5, ram: 9, plow: true },
};

export const MATERIAL_IDS = ['madera', 'acero', 'arcano'] as const;
export type MaterialId = (typeof MATERIAL_IDS)[number];

export const MATERIALS: Record<MaterialId, { id: MaterialId; name: string; fort: FortId; price: number; hp: number; color: string; description: string }> = {
  madera: { id: 'madera', name: 'Tablones de roble', fort: 'castillo', price: 25, hp: 220, color: '#9a6a3a', description: 'Barricada barata para una puerta.' },
  acero: { id: 'acero', name: 'Planchas de acero', fort: 'corporativo', price: 45, hp: 380, color: '#9aa7b4', description: 'Barricada resistente para una puerta.' },
  arcano: { id: 'arcano', name: 'Sello arcano', fort: 'torre', price: 70, hp: 600, color: '#b48cff', description: 'Barrera mágica muy dura para una puerta.' },
};

/** A door holds at most this much barricade. */
export const BARRICADE_MAX = 1200;

export type ShopKind = 'weapon' | 'upgrade' | 'material' | 'vehicle' | 'heal';

export interface ShopItem {
  id: string;
  fort: FortId;
  kind: ShopKind;
  ref: string;
  name: string;
  description: string;
  /** Base price; upgrades cost more for each level. */
  price: number;
  heal?: number;
}

function buildShop(): ShopItem[] {
  const items: ShopItem[] = [];
  const heals: Record<FortId, { name: string; price: number; heal: number; description: string }> = {
    castillo: { name: 'Hidromiel', price: 25, heal: 40, description: 'Recuperas 40 de vida.' },
    torre: { name: 'Poción de vida', price: 40, heal: 70, description: 'Recuperas 70 de vida.' },
    corporativo: { name: 'Botiquín', price: 30, heal: 50, description: 'Recuperas 50 de vida.' },
  };
  for (const fort of FORT_IDS) {
    for (const w of WEAPON_IDS) {
      const def = WEAPONS[w];
      if (def.fort === fort) items.push({ id: `w_${w}`, fort, kind: 'weapon', ref: w, name: def.name, description: def.description, price: def.price });
    }
    for (const w of WEAPON_IDS) {
      const def = WEAPONS[w];
      // The starting bat is upgraded at the castle forge.
      if (def.fort === fort || (w === 'bate' && fort === 'castillo')) items.push({ id: `u_${w}`, fort, kind: 'upgrade', ref: w, name: `Mejorar ${def.name.toLowerCase()}`, description: 'Más daño en cada nivel (hasta el nivel 3).', price: Math.max(50, def.price) });
    }
    for (const m of MATERIAL_IDS) if (MATERIALS[m].fort === fort) items.push({ id: `m_${m}`, fort, kind: 'material', ref: m, name: MATERIALS[m].name, description: MATERIALS[m].description, price: MATERIALS[m].price });
    for (const v of VEHICLE_IDS) if (VEHICLES[v].fort === fort) items.push({ id: `v_${v}`, fort, kind: 'vehicle', ref: v, name: VEHICLES[v].name, description: VEHICLES[v].description, price: VEHICLES[v].price });
    const h = heals[fort];
    items.push({ id: `h_${fort}`, fort, kind: 'heal', ref: fort, name: h.name, description: h.description, price: h.price, heal: h.heal });
  }
  return items;
}

export const SHOP: readonly ShopItem[] = buildShop();

// ───────────────────────────── Zombies ─────────────────────────────

export type ZombieKind = 0 | 1 | 2;
export const ZOMBIE_KINDS = [
  { name: 'Zombi pequeño', hp: 14, speed: 3.9, radius: 0.32, dmg: 3, carDmg: 2, doorDmg: 5, reach: 0.55, wind: 0.45, rest: 0.8, money: 4, scale: 0.62 },
  { name: 'Zombi', hp: 60, speed: 3.15, radius: 0.46, dmg: 11, carDmg: 8, doorDmg: 16, reach: 0.7, wind: 0.55, rest: 1.0, money: 14, scale: 1 },
  { name: 'Zombi gigante', hp: 300, speed: 2.5, radius: 0.95, dmg: 26, carDmg: 95, doorDmg: 70, reach: 1.0, wind: 0.95, rest: 1.5, money: 60, scale: 2.1 },
] as const;

/** Seconds a zombie must have been walking around before it can merge, and how close three must be. */
export const MERGE = { age: 3, near: [1.15, 1.9] } as const;
export const MAX_ZOMBIES = 110;

export type ZombieAct = 'walk' | 'wind' | 'stun';
export const ZOMBIE_ACTS: readonly ZombieAct[] = ['walk', 'wind', 'stun'];

export interface Zombie {
  id: number;
  kind: ZombieKind;
  x: number;
  z: number;
  h: number;
  hp: number;
  max: number;
  act: ZombieAct;
  t: number;
  /** The player it follows. */
  target: string;
  /** A door it is going through: index, +1 going in or -1 going out, and the leg of the trip. */
  door: number;
  dir: number;
  leg: number;
  /** What it is winding up to hit: a player id, 'car:<id>' or 'door:<id>'. */
  aim: string;
  rest: number;
  slow: number;
  age: number;
  vx: number;
  vz: number;
  /** Seconds a vehicle can't hit it again. */
  immune: number;
  /** Detour waypoint around a stronghold. */
  wx: number;
  wz: number;
  speed: number;
}

// ───────────────────────────── Players and vehicles ─────────────────────────────

export type SurvivorAction = 'idle' | 'run' | 'attack' | 'saw' | 'block' | 'dodge' | 'stun' | 'down' | 'drive';

export interface Survivor {
  id: string;
  x: number;
  z: number;
  facing: number;
  hp: number;
  action: SurvivorAction;
  t: number;
  dodgeCd: number;
  vx: number;
  vz: number;
  swung: boolean;
  /** Weapon in hand (index in WEAPON_IDS), levels of every weapon (0: not owned) and its cooldown. */
  wpn: number;
  wl: number[];
  cd: number;
  /** Barricade materials carried, by MATERIAL_IDS. */
  mats: number[];
  money: number;
  /** Money made in the whole match. */
  earned: number;
  kills: number;
  bigKills: number;
  downs: number;
  /** Vehicle driven, 0 if on foot. */
  car: number;
  /** Seconds of a teammate's help to get up. */
  revive: number;
  /** Seconds on the ground; at respawnSeconds the player gets back up alone. */
  downT: number;
  /** Seconds nothing can hurt you, after getting back up. */
  shield: number;
  active: boolean;
}

export interface Vehicle {
  id: number;
  kind: VehicleId;
  x: number;
  z: number;
  h: number;
  v: number;
  hp: number;
  /** Who is driving, '' when empty. */
  driver: string;
  owner: string;
}

/** One fixed step of input. Presses: atk, dge, use, cyc. Held: ah, blk, uh. */
export interface ZombieInput {
  seq: number;
  mx: number;
  mz: number;
  atk: boolean;
  ah: boolean;
  blk: boolean;
  dge: boolean;
  use: boolean;
  uh: boolean;
  cyc: boolean;
  /** Pick a weapon by WEAPON_IDS index, -1 for none. */
  sel: number;
  /** Buy a SHOP item by index, -1 for none. */
  buy: number;
}

export const ZOMBIE_NO_INPUT: ZombieInput = { seq: 0, mx: 0, mz: 0, atk: false, ah: false, blk: false, dge: false, use: false, uh: false, cyc: false, sel: -1, buy: -1 };

export const zombieInputSchema = z.object({
  seq: z.number().int().min(0).max(1e9),
  mx: z.number().finite().min(-1).max(1),
  mz: z.number().finite().min(-1).max(1),
  atk: z.boolean(),
  ah: z.boolean(),
  blk: z.boolean(),
  dge: z.boolean(),
  use: z.boolean(),
  uh: z.boolean(),
  cyc: z.boolean(),
  sel: z.number().int().min(-1).max(WEAPON_IDS.length - 1),
  buy: z.number().int().min(-1).max(200),
});

export const zombieInputBatchSchema = z.object({
  matchId: z.string().min(1).max(40),
  inputs: z.array(zombieInputSchema).min(1).max(8),
});
export type ZombieInputBatch = z.infer<typeof zombieInputBatchSchema>;

export interface Shot {
  id: number;
  owner: string;
  kind: ShotKind;
  x: number;
  z: number;
  vx: number;
  vz: number;
  life: number;
  dmg: number;
  pierce: number;
  blast: number;
  knock: number;
  /** Zombies already pierced, so a shot hits each one once. */
  hit: number[];
}

export type ZEventType =
  | 'swing'
  | 'shot'
  | 'nova'
  | 'blast'
  | 'hit'
  | 'kill'
  | 'merge'
  | 'hurt'
  | 'block'
  | 'dodge'
  | 'down'
  | 'revive'
  | 'respawn'
  | 'buy'
  | 'nope'
  | 'barricade'
  | 'door_hit'
  | 'door_break'
  | 'car_in'
  | 'car_out'
  | 'car_hit'
  | 'car_boom'
  | 'ram'
  | 'wave'
  | 'clear'
  | 'over'
  | 'join'
  | 'friendly';

export interface ZEvent {
  type: ZEventType;
  by: string;
  target?: string;
  x: number;
  z: number;
  n?: number;
  kind?: number;
  text?: string;
}

export type ZPhase = 'prep' | 'fight' | 'break';

export const WAVES = { prep: 15, rest: 20, clearBonus: 15 } as const;

export interface ZombieWorld {
  t: number;
  tick: number;
  seed: number;
  rng: number;
  wave: number;
  phase: ZPhase;
  /** Seconds left of the preparation or the rest between waves. */
  timer: number;
  /** Zombies still to come this wave, by kind. */
  queue: ZombieKind[];
  spawnT: number;
  /** Player that gets the next batch of zombies around them. */
  spawnTurn: number;
  survivors: Survivor[];
  zombies: Zombie[];
  shots: Shot[];
  cars: Vehicle[];
  /** Barricade health per door, and the strongest material used on it (-1 for none). */
  doors: number[];
  doorMat: number[];
  nextId: number;
  ff: boolean;
  over: boolean;
  kills: number;
}

/** What the server sends every tick. */
export interface ZombieFrame {
  tick: number;
  at: number;
  world: PackedZombieWorld;
  ack: Record<string, number>;
  events: ZEvent[];
}

/** The world on the wire: zombies and shots as flat number arrays to keep frames small. */
export interface PackedZombieWorld {
  t: number;
  wave: number;
  phase: ZPhase;
  timer: number;
  left: number;
  survivors: Survivor[];
  /** id, kind, x, z, h, act, t, hp, max for each zombie. */
  zs: number[];
  /** id, kind, x, z, vx, vz for each shot. */
  ss: number[];
  cars: Vehicle[];
  doors: number[];
  doorMat: number[];
  ff: boolean;
  over: boolean;
  kills: number;
}

/** What the 3D view needs, from a live world or from a frame. */
export interface ZombieView {
  t: number;
  wave: number;
  phase: ZPhase;
  timer: number;
  left: number;
  survivors: Survivor[];
  zombies: Pick<Zombie, 'id' | 'kind' | 'x' | 'z' | 'h' | 'act' | 't' | 'hp' | 'max'>[];
  shots: Pick<Shot, 'id' | 'kind' | 'x' | 'z' | 'vx' | 'vz'>[];
  cars: Vehicle[];
  doors: number[];
  doorMat: number[];
  ff: boolean;
  over: boolean;
  kills: number;
}

const SHOT_KINDS: readonly ShotKind[] = ['bolt', 'fire', 'zap', 'bullet', 'pellet'];

// ───────────────────────────── Setup ─────────────────────────────

const SPAWNS = [
  { x: -1.5, z: 1.5 },
  { x: 1.5, z: 1.5 },
  { x: -1.5, z: -1.5 },
  { x: 1.5, z: -1.5 },
];

export function createSurvivor(id: string, slot: number): Survivor {
  const s = SPAWNS[slot % SPAWNS.length]!;
  const wl = WEAPON_IDS.map((w) => (w === 'bate' ? 1 : 0));
  return {
    id,
    x: s.x,
    z: s.z,
    facing: -Math.PI / 2,
    hp: SURVIVOR.maxHp,
    action: 'idle',
    t: 0,
    dodgeCd: 0,
    vx: 0,
    vz: 0,
    swung: false,
    wpn: 0,
    wl,
    cd: 0,
    mats: MATERIAL_IDS.map(() => 0),
    money: SURVIVOR.startMoney,
    earned: 0,
    kills: 0,
    bigKills: 0,
    downs: 0,
    car: 0,
    revive: 0,
    downT: 0,
    shield: 0,
    active: true,
  };
}

export function createZombieWorld(ids: readonly string[], seed = 1, friendlyFire = true): ZombieWorld {
  return {
    t: 0,
    tick: 0,
    seed,
    rng: seed >>> 0 || 1,
    wave: 0,
    phase: 'prep',
    timer: WAVES.prep,
    queue: [],
    spawnT: 0,
    spawnTurn: 0,
    survivors: ids.map((id, i) => createSurvivor(id, i)),
    zombies: [],
    shots: [],
    cars: [],
    doors: DOORS.map(() => 0),
    doorMat: DOORS.map(() => -1),
    nextId: 1,
    ff: friendlyFire,
    over: false,
    kills: 0,
  };
}

/** The world's own random numbers, so a replay of the same inputs gives the same match. */
function rand(world: ZombieWorld): number {
  world.rng = (world.rng + 0x6d2b79f5) >>> 0;
  let t = world.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ───────────────────────────── Movement ─────────────────────────────

function clampMove(mx: number, mz: number): [number, number] {
  const len = Math.hypot(mx, mz);
  if (len < 0.15) return [0, 0];
  return len > 1 ? [mx / len, mz / len] : [mx, mz];
}

export const weaponOf = (s: Survivor): WeaponDef => WEAPONS[WEAPON_IDS[s.wpn] ?? 'bate'];

const BUSY: ReadonlySet<SurvivorAction> = new Set(['attack', 'dodge', 'stun', 'down', 'drive']);

/** The closest zombie within range, if any. */
export function nearestZombie(p: { x: number; z: number }, zombies: readonly { x: number; z: number; hp: number }[], range: number) {
  let best: { x: number; z: number; hp: number } | null = null;
  let bestD = range;
  for (const zb of zombies) {
    if (zb.hp <= 0) continue;
    const d = Math.hypot(zb.x - p.x, zb.z - p.z);
    if (d < bestD) {
      bestD = d;
      best = zb;
    }
  }
  return best;
}

function faceZombie(s: Survivor, zombies: readonly { x: number; z: number; hp: number }[], range: number) {
  const zb = nearestZombie(s, zombies, range);
  if (zb) s.facing = Math.atan2(zb.z - s.z, zb.x - s.x);
}

function setAction(s: Survivor, action: SurvivorAction) {
  s.action = action;
  s.t = 0;
  if (action !== 'stun' && action !== 'dodge') {
    s.vx = 0;
    s.vz = 0;
  }
  s.swung = false;
}

/**
 * Advances one player on foot by one fixed step: picking actions (attack, block, dodge) and
 * walking, with collisions. Damage happens in `stepZombieWorld`. The client runs this to predict
 * its own movement, with the zombies of the last frame for aiming.
 */
export function moveSurvivor(s: Survivor, input: ZombieInput, zombies: readonly { x: number; z: number; hp: number }[], dt = ZOMBIE_DT): void {
  s.t += dt;
  s.dodgeCd = Math.max(0, s.dodgeCd - dt);
  s.cd = Math.max(0, s.cd - dt);
  s.shield = Math.max(0, s.shield - dt);
  if (s.action === 'down' || s.action === 'drive') {
    s.vx = s.vz = 0;
    return;
  }
  const [mx, mz] = clampMove(input.mx, input.mz);
  const moving = mx !== 0 || mz !== 0;
  const w = weaponOf(s);

  if (s.action === 'attack' && s.t >= w.duration) setAction(s, 'idle');
  if (s.action === 'dodge' && s.t >= SURVIVOR.dodge.duration) setAction(s, 'idle');
  if (s.action === 'stun' && s.t >= SURVIVOR.stun) setAction(s, 'idle');
  if (s.action === 'saw' && !(input.ah || input.atk)) setAction(s, 'idle');

  if (!BUSY.has(s.action)) {
    const wantsAttack = input.atk || (w.auto && input.ah);
    if (input.dge && s.dodgeCd <= 0) {
      setAction(s, 'dodge');
      const dir = moving ? Math.atan2(mz, mx) : s.facing + Math.PI;
      s.vx = Math.cos(dir) * SURVIVOR.dodge.speed;
      s.vz = Math.sin(dir) * SURVIVOR.dodge.speed;
      s.dodgeCd = SURVIVOR.dodge.cooldown;
    } else if (wantsAttack && w.kind === 'saw') {
      if (s.action !== 'saw') setAction(s, 'saw');
      faceZombie(s, zombies, SURVIVOR.lockMelee);
    } else if (wantsAttack && s.cd <= 0) {
      setAction(s, 'attack');
      s.cd = w.cooldown;
      faceZombie(s, zombies, w.kind === 'shot' ? SURVIVOR.lockShot : SURVIVOR.lockMelee);
    } else if (input.blk) {
      if (s.action !== 'block') setAction(s, 'block');
    } else if (s.action !== 'saw') {
      const next = moving ? 'run' : 'idle';
      if (s.action !== next) setAction(s, next);
    }
  }

  let vx = 0;
  let vz = 0;
  const speed = SURVIVOR.speed;
  switch (s.action) {
    case 'idle':
    case 'run':
      vx = mx * speed;
      vz = mz * speed;
      if (moving) s.facing = Math.atan2(mz, mx);
      break;
    case 'saw':
      vx = mx * speed * 0.55;
      vz = mz * speed * 0.55;
      if (moving && !nearestZombie(s, zombies, SURVIVOR.lockMelee)) s.facing = Math.atan2(mz, mx);
      break;
    case 'block':
      vx = mx * speed * SURVIVOR.blockSpeed;
      vz = mz * speed * SURVIVOR.blockSpeed;
      break;
    case 'attack':
      if (w.kind === 'melee' && s.t < w.hitAt) {
        vx = Math.cos(s.facing) * 1.5;
        vz = Math.sin(s.facing) * 1.5;
      }
      break;
    case 'dodge':
      vx = s.vx;
      vz = s.vz;
      break;
    case 'stun': {
      vx = s.vx;
      vz = s.vz;
      const decay = Math.max(0, 1 - 9 * dt);
      s.vx = Math.abs(s.vx * decay) < 0.05 ? 0 : s.vx * decay;
      s.vz = Math.abs(s.vz * decay) < 0.05 ? 0 : s.vz * decay;
      break;
    }
  }
  s.x += vx * dt;
  s.z += vz * dt;
  collideZ(s, SURVIVOR.radius);
}

/** Drives a vehicle by one fixed step: steer toward the stick, speed up, slow down and bounce off walls. */
export function driveVehicle(v: Vehicle, input: Pick<ZombieInput, 'mx' | 'mz' | 'blk'>, dt = ZOMBIE_DT): void {
  const def = VEHICLES[v.kind];
  const [mx, mz] = clampMove(input.mx, input.mz);
  const mag = Math.hypot(mx, mz);
  if (mag > 0) {
    const want = Math.atan2(mz, mx);
    let diff = want - v.h;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const back = Math.abs(diff) > 2.3;
    if (back) {
      // Pulling the opposite way brakes, then reverses slowly.
      v.v -= def.accel * 1.4 * mag * dt;
      v.v = Math.max(-def.maxSpeed * 0.35, v.v);
      const rev = diff > 0 ? diff - Math.PI : diff + Math.PI;
      if (v.v < 0) v.h -= Math.sign(rev) * Math.min(Math.abs(rev), def.turn * dt);
    } else {
      const grip = Math.min(1, 0.35 + Math.abs(v.v) / 4);
      v.h += Math.sign(diff) * Math.min(Math.abs(diff), def.turn * grip * dt);
      v.v += def.accel * mag * Math.max(0.2, Math.cos(diff)) * dt;
      v.v = Math.min(def.maxSpeed * mag, Math.max(v.v - def.accel * 0.5 * dt, v.v));
      v.v = Math.min(def.maxSpeed, v.v);
    }
  } else {
    const drag = def.accel * 0.8 * dt;
    v.v = Math.abs(v.v) <= drag ? 0 : v.v - Math.sign(v.v) * drag;
  }
  if (input.blk) {
    const brake = def.accel * 2 * dt;
    v.v = Math.abs(v.v) <= brake ? 0 : v.v - Math.sign(v.v) * brake;
  }
  v.h = Math.atan2(Math.sin(v.h), Math.cos(v.h));
  v.x += Math.cos(v.h) * v.v * dt;
  v.z += Math.sin(v.h) * v.v * dt;
  if (collideZ(v, def.radius)) v.v *= 0.6;
}

export function cloneSurvivor(s: Survivor): Survivor {
  return { ...s, wl: [...s.wl], mats: [...s.mats] };
}

// ───────────────────────────── Helpers ─────────────────────────────

function round(n: number) {
  return Math.round(n * 100) / 100;
}

function segHitsBox(ax: number, az: number, bx: number, bz: number, b: Box): boolean {
  // Slab test of the segment against the box.
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dz = bz - az;
  for (const [p, d, lo, hi] of [
    [ax, dx, b.x - b.hw, b.x + b.hw],
    [az, dz, b.z - b.hd, b.z + b.hd],
  ] as const) {
    if (Math.abs(d) < 1e-9) {
      if (p < lo || p > hi) return false;
    } else {
      let ta = (lo - p) / d;
      let tb = (hi - p) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) return false;
    }
  }
  return true;
}

/** If a stronghold stands between a zombie outside and its goal, the corner to walk around it by. */
function detour(x: number, z: number, gx: number, gz: number): { x: number; z: number } | null {
  for (const id of FORT_IDS) {
    const f = FORTS[id];
    const hard: Box = { x: f.cx, z: f.cz, hw: f.hw + 0.9, hd: f.hd + 0.9 };
    if (insideRect(x, z, hard) || !segHitsBox(x, z, gx, gz, hard)) continue;
    const m = 2.2;
    let best: { x: number; z: number } | null = null;
    let bestD = Infinity;
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const) {
      const c = { x: f.cx + sx * (f.hw + m), z: f.cz + sz * (f.hd + m) };
      if (Math.hypot(c.x - x, c.z - z) < 0.8) continue;
      if (segHitsBox(x, z, c.x, c.z, hard)) continue;
      const d = Math.hypot(c.x - x, c.z - z) + Math.hypot(gx - c.x, gz - c.z);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    // Every corner hidden: head to the closest one and look again from there.
    if (!best) {
      for (const [sx, sz] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ] as const) {
        const c = { x: f.cx + sx * (f.hw + m), z: f.cz + sz * (f.hd + m) };
        const d = Math.hypot(c.x - x, c.z - z);
        if (d < bestD && d > 0.8) {
          bestD = d;
          best = c;
        }
      }
    }
    return best;
  }
  return null;
}

function money(world: ZombieWorld, id: string, n: number) {
  const s = world.survivors.find((x) => x.id === id);
  if (!s) return;
  s.money += n;
  s.earned += n;
}

const carOf = (world: ZombieWorld, s: Survivor) => (s.car ? world.cars.find((c) => c.id === s.car) ?? null : null);

/** Where a player is for the zombies: their vehicle while driving. */
function bodyOf(world: ZombieWorld, s: Survivor): { x: number; z: number; r: number; car: Vehicle | null } {
  const car = carOf(world, s);
  return car ? { x: car.x, z: car.z, r: VEHICLES[car.kind].radius, car } : { x: s.x, z: s.z, r: SURVIVOR.radius, car: null };
}

/** The shop counter a player stands at, if any. */
export function shopAt(s: { x: number; z: number }): FortId | null {
  for (const id of FORT_IDS) {
    const sp = FORTS[id].shopSpot;
    if (Math.hypot(s.x - sp.x, s.z - sp.z) <= SURVIVOR.useReach) return id;
  }
  return null;
}

/** The door a player can barricade from where they stand, if any. */
export function doorInReach(s: { x: number; z: number }): DoorDef | null {
  let best: DoorDef | null = null;
  let bestD = SURVIVOR.useReach + 0.4;
  for (const d of DOORS) {
    const dist = Math.hypot(s.x - d.x, s.z - d.z);
    if (dist < bestD) {
      bestD = dist;
      best = d;
    }
  }
  return best;
}

/** An empty vehicle within reach. */
export function carInReach(world: Pick<ZombieWorld, 'cars'>, s: { x: number; z: number }): Vehicle | null {
  let best: Vehicle | null = null;
  let bestD = Infinity;
  for (const c of world.cars) {
    if (c.driver) continue;
    const d = Math.hypot(c.x - s.x, c.z - s.z) - VEHICLES[c.kind].radius;
    if (d < SURVIVOR.useReach && d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/** Price of a shop item for this player, or null with the reason it can't be bought. */
export function shopOffer(item: ShopItem, s: Pick<Survivor, 'wl' | 'hp' | 'mats'>, world?: Pick<ZombieWorld, 'cars'>): { price: number; ok: boolean; why?: string } {
  if (item.kind === 'weapon') {
    const owned = (s.wl[WEAPON_IDS.indexOf(item.ref as WeaponId)] ?? 0) > 0;
    return owned ? { price: item.price, ok: false, why: 'Ya la tienes' } : { price: item.price, ok: true };
  }
  if (item.kind === 'upgrade') {
    const lvl = s.wl[WEAPON_IDS.indexOf(item.ref as WeaponId)] ?? 0;
    if (lvl === 0) return { price: item.price, ok: false, why: 'Primero cómprala' };
    if (lvl >= MAX_WEAPON_LEVEL) return { price: 0, ok: false, why: 'Nivel máximo' };
    return { price: Math.round(item.price * (lvl === 1 ? 0.8 : 1.5)), ok: true };
  }
  if (item.kind === 'heal') return s.hp >= SURVIVOR.maxHp ? { price: item.price, ok: false, why: 'Vida llena' } : { price: item.price, ok: true };
  if (item.kind === 'vehicle' && world && world.cars.length >= 8) return { price: item.price, ok: false, why: 'Hay demasiados vehículos' };
  return { price: item.price, ok: true };
}

/** What pressing E does where this player stands, for the hint on screen. */
export function useHint(world: Pick<ZombieWorld, 'cars' | 'survivors' | 'doors'>, s: Survivor): string | null {
  if (s.action === 'down') return null;
  if (s.car) return 'E: bajarte';
  const mate = world.survivors.find((o) => o !== s && o.action === 'down' && Math.hypot(o.x - s.x, o.z - s.z) < 1.8);
  if (mate) return 'Mantén E: levantar a tu compañero';
  if (carInReach(world, s)) return 'E: subirte';
  const door = doorInReach(s);
  if (door) {
    const has = s.mats.some((n) => n > 0);
    if (!has) return (world.doors[door.id] ?? 0) > 0 ? 'Puerta bloqueada · compra materiales para reforzarla' : 'Compra materiales en la tienda para bloquear esta puerta';
    return (world.doors[door.id] ?? 0) >= BARRICADE_MAX ? 'Barricada al máximo' : 'E: bloquear la puerta';
  }
  return null;
}

// ───────────────────────────── Damage ─────────────────────────────

function hurtZombie(world: ZombieWorld, zb: Zombie, dmg: number, by: string, ux: number, uz: number, knock: number, events: ZEvent[]) {
  if (zb.hp <= 0) return;
  zb.hp -= dmg;
  const heavy = zb.kind === 2;
  zb.vx += ux * knock * (heavy ? 0.15 : 1);
  zb.vz += uz * knock * (heavy ? 0.15 : 1);
  if (!heavy && knock >= 3 && zb.act === 'wind') {
    zb.act = 'stun';
    zb.t = 0;
  }
  events.push({ type: 'hit', by, x: round(zb.x), z: round(zb.z), n: Math.round(dmg), kind: zb.kind });
  if (zb.hp <= 0) {
    const k = ZOMBIE_KINDS[zb.kind];
    money(world, by, k.money);
    const s = world.survivors.find((x) => x.id === by);
    if (s) {
      s.kills++;
      if (zb.kind === 2) s.bigKills++;
    }
    world.kills++;
    events.push({ type: 'kill', by, x: round(zb.x), z: round(zb.z), n: k.money, kind: zb.kind, target: String(zb.id) });
  }
}

/** A weapon's blow on a teammate, with friendly fire on. */
function hurtMate(world: ZombieWorld, a: Survivor, d: Survivor, dmg: number, ux: number, uz: number, events: ZEvent[]) {
  if (!world.ff || d === a || d.action === 'down' || d.action === 'drive' || d.action === 'dodge') return;
  const real = Math.max(1, Math.round(dmg * SURVIVOR.friendlyShare));
  damageSurvivor(world, d, real, ux, uz, 3, a.id, events, true);
}

function damageSurvivor(world: ZombieWorld, d: Survivor, dmg: number, ux: number, uz: number, knock: number, by: string, events: ZEvent[], friendly = false) {
  if (d.action === 'down' || d.shield > 0) return;
  if (d.action === 'dodge') {
    events.push({ type: 'dodge', by, target: d.id, x: round(d.x), z: round(d.z) });
    return;
  }
  const facesAttacker = Math.cos(d.facing) * -ux + Math.sin(d.facing) * -uz >= 0;
  let real = dmg;
  if (d.action === 'block' && facesAttacker) {
    real = Math.max(1, Math.round(dmg * SURVIVOR.blockChip));
    events.push({ type: 'block', by, target: d.id, x: round(d.x), z: round(d.z), n: real });
  } else {
    d.action = 'stun';
    d.t = 0;
    d.swung = false;
    d.vx = ux * knock;
    d.vz = uz * knock;
    events.push({ type: friendly ? 'friendly' : 'hurt', by, target: d.id, x: round(d.x), z: round(d.z), n: real });
  }
  d.hp = Math.max(0, d.hp - real);
  if (d.hp <= 0) knockDown(world, d, events, by);
}

function knockDown(world: ZombieWorld, d: Survivor, events: ZEvent[], by: string) {
  const car = carOf(world, d);
  if (car) car.driver = '';
  d.car = 0;
  d.hp = 0;
  d.action = 'down';
  d.t = 0;
  d.vx = d.vz = 0;
  d.revive = 0;
  d.downT = 0;
  d.downs++;
  events.push({ type: 'down', by, target: d.id, x: round(d.x), z: round(d.z) });
}

function exitCar(world: ZombieWorld, s: Survivor, car: Vehicle, events: ZEvent[]) {
  car.driver = '';
  s.car = 0;
  const r = VEHICLES[car.kind].radius + SURVIVOR.radius + 0.2;
  // Step out on the left side, or wherever there is room.
  for (const a of [car.h - Math.PI / 2, car.h + Math.PI / 2, car.h + Math.PI, car.h]) {
    const x = car.x + Math.cos(a) * r;
    const z = car.z + Math.sin(a) * r;
    if (!blocked(x, z, SURVIVOR.radius)) {
      s.x = x;
      s.z = z;
      break;
    }
  }
  collideZ(s, SURVIVOR.radius);
  s.action = 'idle';
  s.t = 0;
  car.v = 0;
  events.push({ type: 'car_out', by: s.id, x: round(car.x), z: round(car.z), kind: VEHICLE_IDS.indexOf(car.kind) });
}

// ───────────────────────────── Interactions ─────────────────────────────

function interact(world: ZombieWorld, s: Survivor, input: ZombieInput, events: ZEvent[]) {
  if (s.action === 'down' || !s.active) return;
  const at = { x: round(s.x), z: round(s.z) };
  // Pick or cycle weapons.
  if (input.sel >= 0 && input.sel < WEAPON_IDS.length && (s.wl[input.sel] ?? 0) > 0 && s.action !== 'attack') {
    s.wpn = input.sel;
    if (s.action === 'saw') setAction(s, 'idle');
  } else if (input.cyc && s.action !== 'attack') {
    for (let i = 1; i <= WEAPON_IDS.length; i++) {
      const next = (s.wpn + i) % WEAPON_IDS.length;
      if ((s.wl[next] ?? 0) > 0) {
        s.wpn = next;
        break;
      }
    }
    if (s.action === 'saw') setAction(s, 'idle');
  }

  // Shopping.
  if (input.buy >= 0) {
    const item = SHOP[input.buy];
    const fort = s.car ? null : shopAt(s);
    if (!item || item.fort !== fort) {
      events.push({ type: 'nope', by: s.id, ...at, text: 'Acércate al mesón de la tienda' });
    } else {
      const offer = shopOffer(item, s, world);
      if (!offer.ok) events.push({ type: 'nope', by: s.id, ...at, text: offer.why });
      else if (s.money < offer.price) events.push({ type: 'nope', by: s.id, ...at, text: `Te faltan ${offer.price - s.money} monedas` });
      else {
        let done = true;
        if (item.kind === 'weapon') {
          const i = WEAPON_IDS.indexOf(item.ref as WeaponId);
          s.wl[i] = 1;
          s.wpn = i;
        } else if (item.kind === 'upgrade') {
          s.wl[WEAPON_IDS.indexOf(item.ref as WeaponId)]!++;
        } else if (item.kind === 'material') {
          s.mats[MATERIAL_IDS.indexOf(item.ref as MaterialId)]!++;
        } else if (item.kind === 'heal') {
          s.hp = Math.min(SURVIVOR.maxHp, s.hp + (item.heal ?? 0));
        } else if (item.kind === 'vehicle') {
          const def = VEHICLES[item.ref as VehicleId];
          const pad = FORTS[item.fort].pad;
          const spot = { x: pad.x, z: pad.z };
          // Next to any vehicle already waiting there.
          for (let k = 0; k < 6 && world.cars.some((c) => Math.hypot(c.x - spot.x, c.z - spot.z) < 3); k++) spot.x += k % 2 ? -3.4 * (k + 1) : 3.4 * (k + 1);
          if (blocked(spot.x, spot.z, def.radius)) {
            spot.x = pad.x;
            spot.z = pad.z;
          }
          world.cars.push({ id: world.nextId++, kind: def.id, x: spot.x, z: spot.z, h: pad.h, v: 0, hp: def.hp, driver: '', owner: s.id });
        } else done = false;
        if (done) {
          s.money -= offer.price;
          events.push({ type: 'buy', by: s.id, ...at, text: item.id, n: offer.price });
        }
      }
    }
  }

  if (!input.use) return;
  const car = carOf(world, s);
  if (car) {
    exitCar(world, s, car, events);
    return;
  }
  // E next to a fallen teammate is handled as a hold, in revive().
  if (world.survivors.some((o) => o !== s && o.action === 'down' && Math.hypot(o.x - s.x, o.z - s.z) < 1.8)) return;
  if (s.action === 'attack' || s.action === 'dodge' || s.action === 'stun') return;
  const free = carInReach(world, s);
  if (free) {
    free.driver = s.id;
    s.car = free.id;
    setAction(s, 'drive');
    s.x = free.x;
    s.z = free.z;
    events.push({ type: 'car_in', by: s.id, x: round(free.x), z: round(free.z), kind: VEHICLE_IDS.indexOf(free.kind) });
    return;
  }
  const door = doorInReach(s);
  if (door) {
    const cur = world.doors[door.id] ?? 0;
    if (cur >= BARRICADE_MAX) {
      events.push({ type: 'nope', by: s.id, ...at, text: 'Esta puerta ya está al máximo' });
      return;
    }
    // The strongest material carried goes up first.
    let best = -1;
    for (let i = MATERIAL_IDS.length - 1; i >= 0; i--) {
      if ((s.mats[i] ?? 0) > 0 && (best < 0 || MATERIALS[MATERIAL_IDS[i]!].hp > MATERIALS[MATERIAL_IDS[best]!].hp)) best = i;
    }
    if (best < 0) {
      events.push({ type: 'nope', by: s.id, ...at, text: 'No tienes materiales: cómpralos en una tienda' });
      return;
    }
    // Nobody gets walled in with the zombies: zombies standing in the doorway are pushed out.
    s.mats[best]!--;
    const mat = MATERIALS[MATERIAL_IDS[best]!];
    world.doors[door.id] = Math.min(BARRICADE_MAX, cur + mat.hp);
    if ((world.doorMat[door.id] ?? -1) < 0 || mat.hp > MATERIALS[MATERIAL_IDS[world.doorMat[door.id]!]!].hp) world.doorMat[door.id] = best;
    events.push({ type: 'barricade', by: s.id, x: door.x, z: door.z, n: door.id, kind: best });
  }
}

/** A fallen player stands up: where they fell when a teammate helps, next to a teammate (or in the plaza) when alone. */
function getUp(world: ZombieWorld, d: Survivor, hp: number, move: boolean) {
  d.revive = 0;
  d.downT = 0;
  d.hp = hp;
  d.action = 'idle';
  d.t = 0;
  d.shield = SURVIVOR.respawnShield;
  if (!move) return;
  const standing = world.survivors.find((s) => s !== d && s.active && s.action !== 'down');
  const b = standing ? bodyOf(world, standing) : { x: 0, z: 0 };
  d.x = b.x + 1.4;
  d.z = b.z + 1.4;
  collideZ(d, SURVIVOR.radius);
}

/** Teammates holding E next to a fallen player get them back up. */
function revive(world: ZombieWorld, inputs: ReadonlyMap<string, ZombieInput>, dt: number, events: ZEvent[]) {
  for (const d of world.survivors) {
    if (d.action !== 'down') continue;
    d.downT += dt;
    if (d.downT >= SURVIVOR.respawnSeconds) {
      getUp(world, d, SURVIVOR.respawnHp, true);
      events.push({ type: 'respawn', by: d.id, x: round(d.x), z: round(d.z) });
      continue;
    }
    const helper = world.survivors.find((h) => h !== d && h.active && h.action !== 'down' && !h.car && inputs.get(h.id)?.uh && Math.hypot(h.x - d.x, h.z - d.z) < 1.8);
    if (!helper) {
      d.revive = Math.max(0, d.revive - dt * 0.5);
      continue;
    }
    d.revive += dt;
    if (d.revive >= SURVIVOR.reviveSeconds) {
      getUp(world, d, SURVIVOR.reviveHp, false);
      events.push({ type: 'revive', by: helper.id, target: d.id, x: round(d.x), z: round(d.z) });
    }
  }
}

// ───────────────────────────── Weapons in action ─────────────────────────────

function dirTo(a: { x: number; z: number; facing: number }, d: { x: number; z: number }) {
  const dx = d.x - a.x;
  const dz = d.z - a.z;
  const dist = Math.hypot(dx, dz);
  const ux = dist > 1e-6 ? dx / dist : Math.cos(a.facing);
  const uz = dist > 1e-6 ? dz / dist : Math.sin(a.facing);
  return { dist, ux, uz, front: Math.cos(a.facing) * ux + Math.sin(a.facing) * uz };
}

function useWeapons(world: ZombieWorld, dt: number, events: ZEvent[]) {
  for (const s of world.survivors) {
    const w = weaponOf(s);
    const lvl = WEAPON_LEVELS[Math.max(0, (s.wl[s.wpn] ?? 1) - 1)] ?? 1;
    if (s.action === 'saw') {
      // The chainsaw cuts every step while held.
      if (s.t < 0.05) events.push({ type: 'swing', by: s.id, x: round(s.x), z: round(s.z), kind: s.wpn });
      const dmg = w.damage * lvl * dt;
      for (const zb of world.zombies) {
        const { dist, ux, uz, front } = dirTo(s, zb);
        const r = ZOMBIE_KINDS[zb.kind].radius;
        if (dist > (w.range ?? 1.8) + r || (front < (w.arc ?? 0.25) && dist > r + SURVIVOR.radius + 0.2)) continue;
        // Shown as one hit every few steps so numbers stay readable.
        zb.hp -= dmg;
        zb.vx += ux * 0.6;
        zb.vz += uz * 0.6;
        if (zb.kind < 2 && zb.act === 'wind') {
          zb.act = 'stun';
          zb.t = 0;
        }
        if (zb.hp <= 0) {
          zb.hp = 0.0001;
          hurtZombie(world, zb, 1, s.id, ux, uz, 2, events);
        } else if (world.tick % 4 === 0) events.push({ type: 'hit', by: s.id, x: round(zb.x), z: round(zb.z), n: Math.round(dmg * 4), kind: zb.kind });
      }
      if (world.ff && world.tick % 4 === 0) {
        for (const d of world.survivors) {
          const { dist, ux, uz, front } = dirTo(s, d);
          if (d !== s && dist < (w.range ?? 1.8) + SURVIVOR.radius && front > (w.arc ?? 0.25)) hurtMate(world, s, d, dmg * 4, ux, uz, events);
        }
      }
      continue;
    }
    if (s.action !== 'attack' || s.swung || s.t < w.hitAt) continue;
    s.swung = true;
    const dmg = w.damage * lvl;
    if (w.kind === 'melee') {
      events.push({ type: 'swing', by: s.id, x: round(s.x), z: round(s.z), kind: s.wpn });
      for (const zb of world.zombies) {
        const { dist, ux, uz, front } = dirTo(s, zb);
        const r = ZOMBIE_KINDS[zb.kind].radius;
        if (dist > (w.range ?? 1.6) + r || (front < (w.arc ?? 0.3) && dist > r + SURVIVOR.radius + 0.3)) continue;
        hurtZombie(world, zb, dmg, s.id, ux, uz, w.knockback ?? 4, events);
      }
      for (const d of world.survivors) {
        if (d === s) continue;
        const { dist, ux, uz, front } = dirTo(s, d);
        if (dist <= (w.range ?? 1.6) + SURVIVOR.radius && front >= (w.arc ?? 0.3)) hurtMate(world, s, d, dmg, ux, uz, events);
      }
    } else if (w.kind === 'nova') {
      events.push({ type: 'nova', by: s.id, x: round(s.x), z: round(s.z), kind: s.wpn });
      for (const zb of world.zombies) {
        const { dist, ux, uz } = dirTo(s, zb);
        if (dist > (w.range ?? 4) + ZOMBIE_KINDS[zb.kind].radius) continue;
        zb.slow = Math.max(zb.slow, w.slow ?? 3);
        hurtZombie(world, zb, dmg, s.id, ux, uz, w.knockback ?? 5, events);
      }
      for (const d of world.survivors) {
        const { dist, ux, uz } = dirTo(s, d);
        if (d !== s && dist <= (w.range ?? 4)) hurtMate(world, s, d, dmg, ux, uz, events);
      }
    } else if (w.kind === 'shot') {
      events.push({ type: 'shot', by: s.id, x: round(s.x), z: round(s.z), kind: s.wpn });
      const n = w.pellets ?? 1;
      for (let i = 0; i < n; i++) {
        const a = s.facing + (n > 1 ? ((i / (n - 1)) * 2 - 1) * (w.spread ?? 0) * 0.5 : 0);
        world.shots.push({
          id: world.nextId++,
          owner: s.id,
          kind: w.shot ?? 'bullet',
          x: s.x + Math.cos(a) * 0.6,
          z: s.z + Math.sin(a) * 0.6,
          vx: Math.cos(a) * (w.speed ?? 20),
          vz: Math.sin(a) * (w.speed ?? 20),
          life: w.life ?? 0.8,
          dmg,
          pierce: w.pierce ?? 1,
          blast: w.blast ?? 0,
          knock: w.knockback ?? 2,
          hit: [],
        });
      }
    }
  }
}

function explode(world: ZombieWorld, shot: Shot, events: ZEvent[]) {
  events.push({ type: 'blast', by: shot.owner, x: round(shot.x), z: round(shot.z), n: shot.blast });
  for (const zb of world.zombies) {
    const d = Math.hypot(zb.x - shot.x, zb.z - shot.z);
    if (d > shot.blast + ZOMBIE_KINDS[zb.kind].radius) continue;
    const ux = d > 1e-6 ? (zb.x - shot.x) / d : 1;
    const uz = d > 1e-6 ? (zb.z - shot.z) / d : 0;
    hurtZombie(world, zb, shot.dmg * 0.7, shot.owner, ux, uz, shot.knock, events);
  }
  const owner = world.survivors.find((s) => s.id === shot.owner);
  if (owner) {
    for (const d of world.survivors) {
      const dist = Math.hypot(d.x - shot.x, d.z - shot.z);
      if (d !== owner && dist <= shot.blast) hurtMate(world, owner, d, shot.dmg * 0.7, (d.x - shot.x) / (dist || 1), (d.z - shot.z) / (dist || 1), events);
    }
  }
}

function moveShots(world: ZombieWorld, dt: number, events: ZEvent[]) {
  world.shots = world.shots.filter((p) => {
    p.life -= dt;
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    const wall = blocked(p.x, p.z, 0.05) || DOORS.some((d) => (world.doors[d.id] ?? 0) > 0 && insideRect(p.x, p.z, d.box));
    if (p.life <= 0 || wall) {
      if (p.blast > 0) explode(world, p, events);
      return false;
    }
    const speed = Math.hypot(p.vx, p.vz) || 1;
    const ux = p.vx / speed;
    const uz = p.vz / speed;
    for (const zb of world.zombies) {
      if (zb.hp <= 0 || p.hit.includes(zb.id)) continue;
      if (Math.hypot(zb.x - p.x, zb.z - p.z) > ZOMBIE_KINDS[zb.kind].radius + 0.2) continue;
      if (p.blast > 0) {
        explode(world, p, events);
        hurtZombie(world, zb, p.dmg, p.owner, ux, uz, p.knock, events);
        return false;
      }
      hurtZombie(world, zb, p.dmg, p.owner, ux, uz, p.knock, events);
      p.hit.push(zb.id);
      if (p.hit.length >= p.pierce) return false;
    }
    if (world.ff) {
      const owner = world.survivors.find((s) => s.id === p.owner);
      for (const d of world.survivors) {
        if (!owner || d === owner || d.action === 'down' || d.car) continue;
        if (Math.hypot(d.x - p.x, d.z - p.z) > SURVIVOR.radius + 0.2) continue;
        hurtMate(world, owner, d, p.dmg, ux, uz, events);
        if (p.blast > 0) explode(world, p, events);
        return false;
      }
    }
    return true;
  });
}

// ───────────────────────────── Vehicles ─────────────────────────────

function runOver(world: ZombieWorld, dt: number, events: ZEvent[]) {
  for (const car of world.cars) {
    const def = VEHICLES[car.kind];
    for (const zb of world.zombies) {
      if (zb.hp <= 0) continue;
      zb.immune = Math.max(0, zb.immune - dt / Math.max(1, world.cars.length));
      const r = ZOMBIE_KINDS[zb.kind].radius;
      const dx = zb.x - car.x;
      const dz = zb.z - car.z;
      const d = Math.hypot(dx, dz);
      if (d >= def.radius + r) continue;
      const ux = d > 1e-6 ? dx / d : Math.cos(car.h);
      const uz = d > 1e-6 ? dz / d : Math.sin(car.h);
      if (def.flies) continue;
      const speed = Math.abs(car.v);
      if (speed > 3 && zb.immune <= 0 && car.driver) {
        zb.immune = 0.5;
        const dmg = speed * def.ram * (zb.kind === 2 && !def.plow ? 0.6 : 1);
        events.push({ type: 'ram', by: car.driver, x: round(zb.x), z: round(zb.z), kind: zb.kind });
        hurtZombie(world, zb, dmg, car.driver, ux, uz, 6 + speed * 0.5, events);
        if (zb.kind === 2) {
          // A big one is like hitting a wall, unless you have a plow.
          car.v *= def.plow ? 0.7 : 0.25;
          if (!def.plow) damageCar(world, car, 30, car.driver, events);
        } else car.v *= def.plow ? 0.97 : 0.9;
      }
      // Keep zombies out of the vehicle's body.
      zb.x = car.x + ux * (def.radius + r);
      zb.z = car.z + uz * (def.radius + r);
    }
  }
}

function damageCar(world: ZombieWorld, car: Vehicle, dmg: number, by: string, events: ZEvent[]) {
  car.hp -= dmg;
  events.push({ type: 'car_hit', by, x: round(car.x), z: round(car.z), n: Math.round(dmg), kind: VEHICLE_IDS.indexOf(car.kind) });
  if (car.hp > 0) return;
  const driver = world.survivors.find((s) => s.id === car.driver);
  if (driver) {
    exitCar(world, driver, car, events);
    driver.action = 'stun';
    driver.t = 0;
  }
  world.cars = world.cars.filter((c) => c !== car);
  events.push({ type: 'car_boom', by, x: round(car.x), z: round(car.z), kind: VEHICLE_IDS.indexOf(car.kind) });
}

// ───────────────────────────── Zombies in action ─────────────────────────────

function spawnZombie(world: ZombieWorld, kind: ZombieKind, x: number, z: number, target: string): Zombie {
  const k = ZOMBIE_KINDS[kind];
  const wave = Math.max(1, world.wave);
  // Tougher with every wave and with every extra player.
  const players = world.survivors.filter((s) => s.active).length;
  const hp = Math.round(k.hp * (1 + 0.09 * (wave - 1)) * (1 + 0.2 * Math.max(0, players - 1)));
  const zb: Zombie = {
    id: world.nextId++,
    kind,
    x,
    z,
    h: 0,
    hp,
    max: hp,
    act: 'walk',
    t: 0,
    target,
    door: -1,
    dir: 0,
    leg: 0,
    aim: '',
    rest: 0,
    slow: 0,
    age: 0,
    vx: 0,
    vz: 0,
    immune: 0,
    wx: NaN,
    wz: NaN,
    speed: k.speed * Math.min(1.12, 1 + 0.015 * (wave - 1)) * (0.9 + rand(world) * 0.2),
  };
  world.zombies.push(zb);
  return zb;
}

/** Where a zombie walks to next, given where its player is. */
function zombieGoal(world: ZombieWorld, zb: Zombie, tx: number, tz: number): { x: number; z: number; door: number } {
  const zf = fortAt(zb.x, zb.z);
  const tf = fortAt(tx, tz);
  if (zb.door >= 0) {
    const d = DOORS[zb.door]!;
    // The player moved: rethink the trip unless it is halfway through.
    if (zb.leg === 0 && ((zb.dir > 0 && tf !== d.fort) || (zb.dir < 0 && tf === d.fort))) zb.door = -1;
  }
  if (zb.door < 0 && zf !== tf) {
    const from = zf ?? tf!;
    const dir = zf ? -1 : 1;
    let best = -1;
    let bestD = Infinity;
    for (const d of DOORS) {
      if (d.fort !== from) continue;
      const first = dir > 0 ? d.out : d.in;
      const last = dir > 0 ? d.in : d.out;
      const cost = Math.hypot(first.x - zb.x, first.z - zb.z) + Math.hypot(tx - last.x, tz - last.z) + (dir > 0 ? (world.doors[d.id] ?? 0) / 60 : 0);
      if (cost < bestD) {
        bestD = cost;
        best = d.id;
      }
    }
    zb.door = best;
    zb.dir = dir;
    zb.leg = 0;
  }
  if (zb.door >= 0) {
    const d = DOORS[zb.door]!;
    const first = zb.dir > 0 ? d.out : d.in;
    const last = zb.dir > 0 ? d.in : d.out;
    if (zb.leg === 0 && Math.hypot(first.x - zb.x, first.z - zb.z) < 0.9) zb.leg = 1;
    if (zb.leg === 1 && Math.hypot(last.x - zb.x, last.z - zb.z) < 0.9) {
      zb.door = -1;
      return { x: tx, z: tz, door: -1 };
    }
    const goal = zb.leg === 0 ? first : last;
    if (zb.leg === 0 && !zf) {
      const around = detour(zb.x, zb.z, goal.x, goal.z);
      if (around) return { ...around, door: -1 };
    }
    return { x: goal.x, z: goal.z, door: zb.leg === 1 && (world.doors[d.id] ?? 0) > 0 ? d.id : -1 };
  }
  if (!zf) {
    const around = detour(zb.x, zb.z, tx, tz);
    if (around) return { ...around, door: -1 };
  }
  return { x: tx, z: tz, door: -1 };
}

function retarget(world: ZombieWorld, zb: Zombie) {
  const cur = world.survivors.find((s) => s.id === zb.target);
  if (cur && cur.action !== 'down' && cur.active) return cur;
  let best: Survivor | null = null;
  let bestD = Infinity;
  for (const s of world.survivors) {
    if (s.action === 'down' || !s.active) continue;
    const d = Math.hypot(s.x - zb.x, s.z - zb.z);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  if (best) zb.target = best.id;
  return best;
}

function stepZombies(world: ZombieWorld, dt: number, events: ZEvent[]) {
  for (const zb of world.zombies) {
    const k = ZOMBIE_KINDS[zb.kind];
    zb.age += dt;
    zb.t += dt;
    zb.slow = Math.max(0, zb.slow - dt);
    zb.rest = Math.max(0, zb.rest - dt);
    // Knockback slides and fades.
    if (zb.vx || zb.vz) {
      zb.x += zb.vx * dt;
      zb.z += zb.vz * dt;
      const decay = Math.max(0, 1 - 8 * dt);
      zb.vx = Math.abs(zb.vx * decay) < 0.05 ? 0 : zb.vx * decay;
      zb.vz = Math.abs(zb.vz * decay) < 0.05 ? 0 : zb.vz * decay;
    }
    if (zb.act === 'stun') {
      if (zb.t >= 0.45) {
        zb.act = 'walk';
        zb.t = 0;
      }
      continue;
    }
    const target = retarget(world, zb);
    if (!target) {
      zb.act = 'walk';
      continue;
    }
    const body = bodyOf(world, target);

    if (zb.act === 'wind') {
      if (zb.t < k.wind) continue;
      // The blow lands on whatever it aimed at, if still in reach.
      zb.act = 'walk';
      zb.t = 0;
      zb.rest = k.rest;
      if (zb.aim.startsWith('door:')) {
        const id = Number(zb.aim.slice(5));
        if ((world.doors[id] ?? 0) > 0) {
          world.doors[id] = Math.max(0, world.doors[id]! - k.doorDmg);
          const d = DOORS[id]!;
          events.push({ type: 'door_hit', by: String(zb.id), x: d.x, z: d.z, n: id, kind: zb.kind });
          if (world.doors[id] === 0) {
            world.doorMat[id] = -1;
            events.push({ type: 'door_break', by: String(zb.id), x: d.x, z: d.z, n: id });
          }
        }
      } else if (zb.aim.startsWith('car:')) {
        const car = world.cars.find((c) => c.id === Number(zb.aim.slice(4)));
        if (car && Math.hypot(car.x - zb.x, car.z - zb.z) <= VEHICLES[car.kind].radius + k.radius + k.reach + 0.4) damageCar(world, car, k.carDmg, String(zb.id), events);
      } else {
        const s = world.survivors.find((x) => x.id === zb.aim);
        if (s && s.action !== 'down' && !s.car) {
          const { dist, ux, uz } = dirTo({ x: zb.x, z: zb.z, facing: zb.h }, s);
          if (dist <= k.radius + SURVIVOR.radius + k.reach + 0.35) {
            const blocked = s.action === 'block' && Math.cos(s.facing) * -ux + Math.sin(s.facing) * -uz >= 0;
            damageSurvivor(world, s, k.dmg, ux, uz, zb.kind === 2 ? 9 : 4, String(zb.id), events);
            if (blocked && zb.kind < 2) {
              // A block throws small and normal zombies off balance.
              zb.act = 'stun';
              zb.t = 0;
              zb.vx -= ux * 4;
              zb.vz -= uz * 4;
            }
          }
        }
      }
      continue;
    }

    // Walking: pick the goal, step toward it, and wind up a blow when something is in reach.
    const goal = zombieGoal(world, zb, body.x, body.z);
    if (zb.rest <= 0) {
      let aim = '';
      if (goal.door >= 0) {
        const d = DOORS[goal.door]!;
        if (Math.hypot(d.x - zb.x, d.z - zb.z) <= k.radius + 0.6 + k.reach + 0.9) aim = `door:${d.id}`;
      }
      if (!aim) {
        // Anyone in reach gets it, its own player first.
        const near = (s: Survivor) => {
          const b = bodyOf(world, s);
          return s.action !== 'down' && s.active && Math.hypot(b.x - zb.x, b.z - zb.z) <= b.r + k.radius + k.reach;
        };
        const victim = near(target) ? target : world.survivors.find(near);
        if (victim) {
          const b = bodyOf(world, victim);
          if (!(b.car && VEHICLES[b.car.kind].flies && zb.kind === 0)) aim = b.car ? `car:${b.car.id}` : victim.id;
          zb.h = Math.atan2(b.z - zb.z, b.x - zb.x);
        }
      }
      if (aim) {
        zb.act = 'wind';
        zb.t = 0;
        zb.aim = aim;
        continue;
      }
    }
    const dx = goal.x - zb.x;
    const dz = goal.z - zb.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.05) {
      const speed = zb.speed * (zb.slow > 0 ? 0.45 : 1);
      const stop = goal.door >= 0 ? 0.6 : body.r + k.radius + 0.05;
      const step = Math.min(speed * dt, Math.max(0, dist - (dist < 3 && goal.x === body.x && goal.z === body.z ? stop : 0)));
      zb.x += (dx / dist) * step;
      zb.z += (dz / dist) * step;
      let want = Math.atan2(dz, dx);
      let diff = want - zb.h;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      zb.h += diff * Math.min(1, dt * 8);
      want = zb.h;
    }
  }

  // Zombies push each other apart and stay out of walls, raised barricades and players.
  const zs = world.zombies;
  for (let i = 0; i < zs.length; i++) {
    const a = zs[i]!;
    const ra = ZOMBIE_KINDS[a.kind].radius;
    for (let j = i + 1; j < zs.length; j++) {
      const b = zs[j]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      if (Math.abs(dx) > 2 || Math.abs(dz) > 2) continue;
      const d = Math.hypot(dx, dz);
      const min = (ra + ZOMBIE_KINDS[b.kind].radius) * 0.9;
      if (d >= min) continue;
      const ux = d > 1e-6 ? dx / d : 1;
      const uz = d > 1e-6 ? dz / d : 0;
      // Bigger zombies shove smaller ones.
      const wa = ZOMBIE_KINDS[b.kind].radius / (ra + ZOMBIE_KINDS[b.kind].radius);
      a.x -= ux * (min - d) * wa;
      a.z -= uz * (min - d) * wa;
      b.x += ux * (min - d) * (1 - wa);
      b.z += uz * (min - d) * (1 - wa);
    }
    for (const s of world.survivors) {
      if (s.action === 'down' || s.car) continue;
      const dx = a.x - s.x;
      const dz = a.z - s.z;
      const d = Math.hypot(dx, dz);
      const min = ra + SURVIVOR.radius;
      if (d < min && d > 1e-6) {
        a.x = s.x + (dx / d) * min;
        a.z = s.z + (dz / d) * min;
      }
    }
    collideZ(a, ra, world.doors);
  }
}

/** Three small zombies that bunch up become a normal one; three normal ones become a big one. */
function mergeZombies(world: ZombieWorld, events: ZEvent[]) {
  for (const kind of [0, 1] as const) {
    const near = MERGE.near[kind];
    for (const a of world.zombies) {
      if (a.kind !== kind || a.hp <= 0 || a.age < MERGE.age) continue;
      const mates = world.zombies.filter((b) => b !== a && b.kind === kind && b.hp > 0 && b.age >= MERGE.age && Math.hypot(b.x - a.x, b.z - a.z) <= near);
      if (mates.length < 2) continue;
      const group = [a, mates[0]!, mates[1]!];
      const x = group.reduce((s, g) => s + g.x, 0) / 3;
      const z = group.reduce((s, g) => s + g.z, 0) / 3;
      for (const g of group) g.hp = 0;
      const born = spawnZombie(world, (kind + 1) as ZombieKind, x, z, a.target);
      born.h = a.h;
      born.act = 'stun';
      born.t = 0;
      events.push({ type: 'merge', by: String(born.id), x: round(x), z: round(z), kind: born.kind });
    }
  }
}

// ───────────────────────────── Waves ─────────────────────────────

/** The zombies of a wave, by kind, for this many players. */
export function waveZombies(wave: number, players: number): ZombieKind[] {
  // Every player brings a whole wave's worth of zombies with them.
  const total = Math.round((6 + 4 * wave) * Math.max(1, players));
  const big = wave >= 3 ? (1 + Math.floor((wave - 3) / 2)) * Math.ceil(players / 2) : 0;
  const normal = wave >= 2 ? Math.floor(total * Math.min(0.35, 0.1 * wave)) : 0;
  const small = Math.max(0, total - big - normal);
  return [...Array<ZombieKind>(small).fill(0), ...Array<ZombieKind>(normal).fill(1), ...Array<ZombieKind>(big).fill(2)];
}

function startWave(world: ZombieWorld, events: ZEvent[]) {
  world.wave++;
  world.phase = 'fight';
  world.timer = 0;
  const alive = world.survivors.filter((s) => s.active).length || 1;
  const q = waveZombies(world.wave, alive);
  // Shuffle so the big ones don't all come last.
  for (let i = q.length - 1; i > 0; i--) {
    const j = Math.floor(rand(world) * (i + 1));
    [q[i], q[j]] = [q[j]!, q[i]!];
  }
  world.queue = q;
  world.spawnT = 0;
  events.push({ type: 'wave', by: '', x: 0, z: 0, n: world.wave, kind: q.length });
}

function spawnBatch(world: ZombieWorld) {
  const alive = world.survivors.filter((s) => s.active && s.action !== 'down');
  if (!alive.length || !world.queue.length) return;
  const s = alive[world.spawnTurn++ % alive.length]!;
  // A batch of small ones comes together, which is how they end up merging.
  const kind = world.queue[0]!;
  const n = kind === 0 ? Math.min(3, world.queue.filter((k) => k === 0).length) : 1;
  const center = bodyOf(world, s);
  for (let attempt = 0; attempt < 10; attempt++) {
    const a = rand(world) * Math.PI * 2;
    const r = 17 + rand(world) * 7;
    const x = center.x + Math.cos(a) * r;
    const z = center.z + Math.sin(a) * r;
    if (Math.abs(x) > ZMAP.half - 2 || Math.abs(z) > ZMAP.half - 2) continue;
    if (FORT_IDS.some((id) => insideRect(x, z, fortBox(FORTS[id]), 1.5))) continue;
    if (blocked(x, z, 1)) continue;
    if (alive.some((o) => Math.hypot(o.x - x, o.z - z) < 12)) continue;
    let made = 0;
    for (let i = 0; i < world.queue.length && made < n; ) {
      if (world.queue[i] !== kind) {
        i++;
        continue;
      }
      world.queue.splice(i, 1);
      const zb = spawnZombie(world, kind, x + (made % 2) * 1.2 - 0.6, z + Math.floor(made / 2) * 1.2 - 0.3, s.id);
      zb.h = Math.atan2(center.z - z, center.x - x);
      made++;
    }
    return;
  }
}

function stepWaves(world: ZombieWorld, dt: number, events: ZEvent[]) {
  if (world.phase !== 'fight') {
    world.timer -= dt;
    if (world.timer <= 0) startWave(world, events);
    return;
  }
  world.spawnT -= dt;
  if (world.queue.length && world.spawnT <= 0 && world.zombies.length < MAX_ZOMBIES) {
    spawnBatch(world);
    world.spawnT = Math.max(0.7, 2.6 - world.wave * 0.12);
  }
  if (!world.queue.length && !world.zombies.length) {
    world.phase = 'break';
    world.timer = WAVES.rest;
    const bonus = WAVES.clearBonus * world.wave;
    events.push({ type: 'clear', by: '', x: 0, z: 0, n: world.wave, kind: bonus });
    // The fallen get back up for the break, next to a teammate.
    for (const s of world.survivors) {
      if (s.active) money(world, s.id, bonus);
      if (s.action !== 'down') continue;
      getUp(world, s, SURVIVOR.respawnHp, true);
      events.push({ type: 'respawn', by: s.id, x: round(s.x), z: round(s.z) });
    }
  }
}

// ───────────────────────────── The step ─────────────────────────────

/**
 * Advances the whole match by one fixed step with every player's input: shopping, vehicles,
 * barricades, movement, weapons, zombies, merges and waves. Returns what happened.
 */
export function stepZombieWorld(world: ZombieWorld, inputs: ReadonlyMap<string, ZombieInput>, dt = ZOMBIE_DT): ZEvent[] {
  const events: ZEvent[] = [];
  if (world.over) return events;
  world.t += dt;
  world.tick++;
  for (const s of world.survivors) interact(world, s, inputs.get(s.id) ?? ZOMBIE_NO_INPUT, events);
  for (const s of world.survivors) {
    const input = s.active ? inputs.get(s.id) ?? ZOMBIE_NO_INPUT : ZOMBIE_NO_INPUT;
    const car = carOf(world, s);
    if (car) {
      s.cd = Math.max(0, s.cd - dt);
      driveVehicle(car, input, dt);
      s.x = car.x;
      s.z = car.z;
      s.facing = car.h;
      s.t += dt;
    } else moveSurvivor(s, input, world.zombies, dt);
  }
  // Empty vehicles roll to a stop.
  for (const c of world.cars) if (!c.driver && c.v) driveVehicle(c, ZOMBIE_NO_INPUT, dt);
  useWeapons(world, dt, events);
  moveShots(world, dt, events);
  runOver(world, dt, events);
  world.zombies = world.zombies.filter((zb) => zb.hp > 0);
  stepZombies(world, dt, events);
  if (world.tick % 10 === 0) mergeZombies(world, events);
  world.zombies = world.zombies.filter((zb) => zb.hp > 0);
  revive(world, inputs, dt, events);
  stepWaves(world, dt, events);
  const standing = world.survivors.filter((s) => s.active && s.action !== 'down');
  if (!standing.length && world.survivors.some((s) => s.active)) {
    world.over = true;
    events.push({ type: 'over', by: '', x: 0, z: 0, n: world.wave });
  }
  return events;
}

/**
 * A player joins a match in progress: they start in the plaza with money for the waves they
 * missed, and the current wave gets their share of zombies on top.
 */
export function addSurvivor(world: ZombieWorld, id: string, events: ZEvent[] = []): Survivor {
  const existing = world.survivors.find((s) => s.id === id);
  if (existing) return existing;
  const s = createSurvivor(id, world.survivors.length);
  s.money += SURVIVOR.latecomerMoney * world.wave;
  s.shield = SURVIVOR.respawnShield;
  collideZ(s, SURVIVOR.radius);
  world.survivors.push(s);
  if (world.phase === 'fight') {
    const extra = waveZombies(world.wave, 1);
    world.queue.push(...extra);
  }
  events.push({ type: 'join', by: id, x: round(s.x), z: round(s.z), n: world.survivors.length });
  return s;
}

// ───────────────────────────── Wire ─────────────────────────────

export function packSurvivor(s: Survivor): Survivor {
  return {
    ...s,
    x: round(s.x),
    z: round(s.z),
    facing: Math.round(s.facing * 1000) / 1000,
    t: Math.round(s.t * 1000) / 1000,
    dodgeCd: round(s.dodgeCd),
    vx: round(s.vx),
    vz: round(s.vz),
    cd: round(s.cd),
    hp: Math.ceil(s.hp),
    revive: round(s.revive),
  };
}

export function packZombieWorld(world: ZombieWorld): PackedZombieWorld {
  const zs: number[] = [];
  for (const zb of world.zombies) zs.push(zb.id, zb.kind, round(zb.x), round(zb.z), Math.round(zb.h * 100) / 100, ZOMBIE_ACTS.indexOf(zb.act), round(zb.t), Math.ceil(zb.hp), zb.max);
  const ss: number[] = [];
  for (const p of world.shots) ss.push(p.id, SHOT_KINDS.indexOf(p.kind), round(p.x), round(p.z), round(p.vx), round(p.vz));
  return {
    t: round(world.t),
    wave: world.wave,
    phase: world.phase,
    timer: round(world.timer),
    left: world.queue.length + world.zombies.length,
    survivors: world.survivors.map(packSurvivor),
    zs,
    ss,
    cars: world.cars.map((c) => ({ ...c, x: round(c.x), z: round(c.z), h: Math.round(c.h * 1000) / 1000, v: round(c.v), hp: Math.ceil(c.hp) })),
    doors: world.doors.map((d) => Math.ceil(d)),
    doorMat: [...world.doorMat],
    ff: world.ff,
    over: world.over,
    kills: world.kills,
  };
}

export function unpackZombieWorld(p: PackedZombieWorld): ZombieView {
  const zombies: ZombieView['zombies'] = [];
  for (let i = 0; i + 8 < p.zs.length; i += 9) {
    zombies.push({ id: p.zs[i]!, kind: p.zs[i + 1] as ZombieKind, x: p.zs[i + 2]!, z: p.zs[i + 3]!, h: p.zs[i + 4]!, act: ZOMBIE_ACTS[p.zs[i + 5]!] ?? 'walk', t: p.zs[i + 6]!, hp: p.zs[i + 7]!, max: p.zs[i + 8]! });
  }
  const shots: ZombieView['shots'] = [];
  for (let i = 0; i + 5 < p.ss.length; i += 6) shots.push({ id: p.ss[i]!, kind: SHOT_KINDS[p.ss[i + 1]!] ?? 'bullet', x: p.ss[i + 2]!, z: p.ss[i + 3]!, vx: p.ss[i + 4]!, vz: p.ss[i + 5]! });
  return { t: p.t, wave: p.wave, phase: p.phase, timer: p.timer, left: p.left, survivors: p.survivors, zombies, shots, cars: p.cars, doors: p.doors, doorMat: p.doorMat, ff: p.ff, over: p.over, kills: p.kills };
}

/** The live world seen like a frame, for the offline practice. */
export function viewOf(world: ZombieWorld): ZombieView {
  return {
    t: world.t,
    wave: world.wave,
    phase: world.phase,
    timer: world.timer,
    left: world.queue.length + world.zombies.length,
    survivors: world.survivors,
    zombies: world.zombies,
    shots: world.shots,
    cars: world.cars,
    doors: world.doors,
    doorMat: world.doorMat,
    ff: world.ff,
    over: world.over,
    kills: world.kills,
  };
}

/** Waves fully survived. */
export const wavesSurvived = (world: Pick<ZombieWorld, 'wave' | 'phase' | 'over'>) => Math.max(0, world.wave - (world.phase === 'fight' ? 1 : 0));
