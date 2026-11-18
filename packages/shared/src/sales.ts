import { z } from 'zod';

/**
 * A Toda Máquina: a cooperative mode for 1 to 4 players about selling machinery.
 *
 * Customers arrive at the sales counter asking for a machine (a forklift, a pallet truck or a
 * truck) for one of the company's branches, sometimes with an accessory. The team takes the
 * request, turns it into a purchase order at the order desk, gets it stamped by management,
 * swaps the stamped order for the right machine in the yard, adds the accessory and delivers it
 * at the loading dock of the right branch.
 *
 * The floor is split into four areas (reception, management, yard and dispatch). With fewer
 * than four players some players own more than one area; walls only stand between areas of
 * different players, who pass papers and machines over counters set into those walls.
 *
 * Every workday has a clock and a sales goal. Reaching the goal starts the next, busier day.
 * Running out of time, or letting three customers leave angry, ends the game: the customers
 * burn the place down. A wrong delivery costs time.
 *
 * Like the other real-time modes, this file is the whole rule set as a deterministic fixed-step
 * simulation: the server runs it as the source of truth, the offline practice runs it locally,
 * and the client runs `moveWorker` to predict its own movement. Coordinates: x goes right, z
 * goes toward the camera (down on the screen), in meters.
 */

export const SALES_TICK_MS = 50;
export const SALES_DT = SALES_TICK_MS / 1000;
export const SALES_MAX_PLAYERS = 4;

export const SALES = {
  radius: 0.4,
  speed: 5.2,
  /** Distance from a worker's center to a station's spot to use it. */
  reach: 1.25,
  /** Seconds of work (holding the action) to write a purchase order and to stamp it. */
  writeSeconds: 2.4,
  stampSeconds: 1.4,
  /** Seconds taken off the workday clock for each wrong delivery. */
  penaltySeconds: 8,
  /** Angry customers that burn everything down. */
  maxStrikes: 3,
  dayClock: 120,
  /** Points per delivered order, plus a tip that grows with the customer's remaining patience. */
  points: { base: 100, accessory: 40, tip: 60 },
  /** Points per second left on the clock when the goal is reached. */
  timeBonus: 2,
  mesonSlots: 5,
} as const;

export type ZoneId = 'recepcion' | 'gerencia' | 'patio' | 'despacho';
export const ZONE_IDS: readonly ZoneId[] = ['recepcion', 'gerencia', 'patio', 'despacho'];

export interface ZoneDef {
  id: ZoneId;
  name: string;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export const ZONES: Record<ZoneId, ZoneDef> = {
  recepcion: { id: 'recepcion', name: 'Recepción', x0: -14, x1: 0, z0: 0, z1: 9 },
  gerencia: { id: 'gerencia', name: 'Gerencia', x0: -14, x1: 0, z0: -9, z1: 0 },
  patio: { id: 'patio', name: 'Patio de máquinas', x0: 0, x1: 14, z0: -9, z1: 0 },
  despacho: { id: 'despacho', name: 'Despacho', x0: 0, x1: 14, z0: 0, z1: 9 },
};

const ZONE_BIT: Record<ZoneId, number> = { recepcion: 1, gerencia: 2, patio: 4, despacho: 8 };
export const zoneBit = (z: ZoneId) => ZONE_BIT[z];
export const zonesOf = (mask: number): ZoneId[] => ZONE_IDS.filter((z) => mask & ZONE_BIT[z]);

/** Which areas each player gets, by how many are playing. Every split leaves each player a rectangle. */
export function zoneMasks(players: number): number[] {
  const R = ZONE_BIT.recepcion;
  const G = ZONE_BIT.gerencia;
  const P = ZONE_BIT.patio;
  const D = ZONE_BIT.despacho;
  if (players <= 1) return [R | G | P | D];
  if (players === 2) return [R | G, P | D];
  if (players === 3) return [R, G, P | D];
  return [R, G, P, D];
}

export type ModelId = 'electrica' | 'gas' | 'transpaleta' | 'camion';
export type AccessoryId = 'horquillas' | 'bateria' | 'baliza';
export type BranchId = 'norte' | 'centro' | 'sur';

export interface ModelDef {
  id: ModelId;
  name: string;
  short: string;
  color: string;
  /** Accessories that fit this machine. */
  fits: AccessoryId[];
}

export const MODELS: Record<ModelId, ModelDef> = {
  electrica: { id: 'electrica', name: 'Grúa horquilla eléctrica', short: 'Grúa eléctrica', color: '#f2b705', fits: ['horquillas', 'bateria', 'baliza'] },
  gas: { id: 'gas', name: 'Grúa horquilla a gas', short: 'Grúa a gas', color: '#e8772e', fits: ['horquillas', 'baliza'] },
  transpaleta: { id: 'transpaleta', name: 'Transpaleta eléctrica', short: 'Transpaleta', color: '#2f8fd8', fits: ['bateria'] },
  camion: { id: 'camion', name: 'Camión ¾', short: 'Camión', color: '#d64545', fits: ['baliza'] },
};
export const MODEL_IDS: readonly ModelId[] = ['electrica', 'gas', 'transpaleta', 'camion'];

export const ACCESSORIES: Record<AccessoryId, { id: AccessoryId; name: string; color: string }> = {
  horquillas: { id: 'horquillas', name: 'Horquillas largas', color: '#9aa4ae' },
  bateria: { id: 'bateria', name: 'Batería extra', color: '#2fbf71' },
  baliza: { id: 'baliza', name: 'Baliza de seguridad', color: '#ff9f1a' },
};
export const ACCESSORY_IDS: readonly AccessoryId[] = ['horquillas', 'bateria', 'baliza'];

export const BRANCHES: Record<BranchId, { id: BranchId; name: string; color: string }> = {
  norte: { id: 'norte', name: 'Sucursal Norte', color: '#e0b43a' },
  centro: { id: 'centro', name: 'Sucursal Centro', color: '#4f8fe0' },
  sur: { id: 'sur', name: 'Sucursal Sur', color: '#3fb27f' },
};
export const BRANCH_IDS: readonly BranchId[] = ['norte', 'centro', 'sur'];

export type StationKind = 'meson' | 'oc' | 'timbre' | 'bay' | 'shelf' | 'dock' | 'pass';

export interface StationDef {
  id: number;
  kind: StationKind;
  /** Where a worker stands to use it. */
  x: number;
  z: number;
  /** Areas it can be used from; a pass counter sits between two. */
  zones: ZoneId[];
  /** Furniture that workers bump into, as a box. */
  box?: { x0: number; x1: number; z0: number; z1: number };
  model?: ModelId;
  accessory?: AccessoryId;
  branch?: BranchId;
  /** Counter slot, for the sales counter. */
  slot?: number;
}

function buildStations(): StationDef[] {
  const list: Omit<StationDef, 'id'>[] = [];
  // The sales counter along the street, one spot per customer.
  for (let i = 0; i < SALES.mesonSlots; i++) list.push({ kind: 'meson', x: -12 + i * 2.5, z: 7.4, zones: ['recepcion'], slot: i });
  // Two order desks against the left wall.
  list.push({ kind: 'oc', x: -12.1, z: 2.6, zones: ['recepcion'], box: { x0: -14, x1: -12.8, z0: 1.8, z1: 3.4 } });
  list.push({ kind: 'oc', x: -12.1, z: 5.2, zones: ['recepcion'], box: { x0: -14, x1: -12.8, z0: 4.4, z1: 6.0 } });
  // Two stamps on the manager's desks.
  list.push({ kind: 'timbre', x: -10.5, z: -7.2, zones: ['gerencia'], box: { x0: -11.4, x1: -9.6, z0: -9, z1: -7.9 } });
  list.push({ kind: 'timbre', x: -6.5, z: -7.2, zones: ['gerencia'], box: { x0: -7.4, x1: -5.6, z0: -9, z1: -7.9 } });
  // One parking bay per model along the back of the yard.
  MODEL_IDS.forEach((model, i) => list.push({ kind: 'bay', x: 2.6 + i * 3.1, z: -6.3, zones: ['patio'], model, box: { x0: 1.5 + i * 3.1, x1: 3.7 + i * 3.1, z0: -9, z1: -7.0 } }));
  // Accessory shelves along the bottom wall of dispatch.
  ACCESSORY_IDS.forEach((accessory, i) => list.push({ kind: 'shelf', x: 2.4 + i * 2.6, z: 7.4, zones: ['despacho'], accessory, box: { x0: 1.5 + i * 2.6, x1: 3.3 + i * 2.6, z0: 8.1, z1: 9 } }));
  // Loading docks on the right wall, one per branch.
  BRANCH_IDS.forEach((branch, i) => list.push({ kind: 'dock', x: 12.6, z: 1.9 + i * 2.7, zones: ['despacho'], branch }));
  // Pass counters set into the walls: two spots each.
  for (const x of [-5.2, -3.9]) list.push({ kind: 'pass', x, z: 0, zones: ['recepcion', 'gerencia'] });
  for (const z of [-5.2, -3.9]) list.push({ kind: 'pass', x: 0, z, zones: ['gerencia', 'patio'] });
  for (const x of [6.4, 7.7]) list.push({ kind: 'pass', x, z: 0, zones: ['patio', 'despacho'] });
  for (const z of [3.9, 5.2]) list.push({ kind: 'pass', x: 0, z, zones: ['recepcion', 'despacho'] });
  return list.map((s, id) => ({ ...s, id }));
}

export const STATIONS: readonly StationDef[] = buildStations();

/** The sales counter itself, which nobody walks through. */
export const COUNTER_BOX = { x0: -13.6, x1: -0.6, z0: 8.0, z1: 9 };
const SOLIDS = [COUNTER_BOX, ...STATIONS.flatMap((s) => (s.box ? [s.box] : []))];

export type ItemKind = 'solicitud' | 'oc' | 'oc_ok' | 'maquina';

export interface Item {
  id: number;
  kind: ItemKind;
  /** The order it belongs to. */
  order: number;
  /** Machines only. */
  model?: ModelId;
  accessory?: AccessoryId | null;
}

export const ITEM_NAMES: Record<ItemKind, string> = {
  solicitud: 'Solicitud',
  oc: 'Orden de compra',
  oc_ok: 'Orden timbrada',
  maquina: 'Máquina',
};

export interface Order {
  id: number;
  slot: number;
  model: ModelId;
  branch: BranchId;
  accessory: AccessoryId | null;
  patience: number;
  /** Seconds of patience left. */
  left: number;
  /** waiting: nobody took the request yet. */
  status: 'waiting' | 'taken';
}

export interface Worker {
  id: string;
  x: number;
  z: number;
  /** Facing, atan2(dz, dx). */
  h: number;
  /** Areas this worker may walk in, as a bit mask. */
  zones: number;
  held: Item | null;
  /** Holding the action button next to a desk with work to do. */
  working: boolean;
  /** Steps of the recipe this worker did, and wrong deliveries. */
  steps: number;
  mistakes: number;
  /** False while disconnected: their areas go to the others. */
  active: boolean;
}

export interface StationState {
  item: Item | null;
  /** Seconds of work done on the paper on this desk. */
  work: number;
}

export interface SalesInput {
  seq: number;
  /** Movement, each from -1 to 1. */
  mx: number;
  mz: number;
  /** A press of the action button this step. */
  act: boolean;
  /** The action button is held down. */
  hold: boolean;
}

export const SALES_NO_INPUT: SalesInput = { seq: 0, mx: 0, mz: 0, act: false, hold: false };

export const salesInputSchema = z.object({
  seq: z.number().int().min(0).max(1e9),
  mx: z.number().finite().min(-1).max(1),
  mz: z.number().finite().min(-1).max(1),
  act: z.boolean(),
  hold: z.boolean(),
});

export const salesInputBatchSchema = z.object({
  matchId: z.string().min(1).max(40),
  inputs: z.array(salesInputSchema).min(1).max(8),
});
export type SalesInputBatch = z.infer<typeof salesInputBatchSchema>;

export type SalesEventType =
  | 'arrive'
  | 'take'
  | 'place'
  | 'pickup'
  | 'written'
  | 'stamped'
  | 'machine'
  | 'return'
  | 'accessory'
  | 'served'
  | 'wrong'
  | 'lost'
  | 'nope'
  | 'goal'
  | 'over'
  | 'zones';

export interface SalesEvent {
  type: SalesEventType;
  /** Who did it, or '' for the world. */
  by: string;
  order?: number;
  station?: number;
  /** Points for 'served', seconds lost for 'wrong', the new day for 'goal'. */
  n?: number;
  /** Short explanation for 'nope' and 'wrong'. */
  text?: string;
}

export type SalesOver = 'angry' | 'time' | null;

export interface SalesWorld {
  tick: number;
  /** Seconds since the start. */
  t: number;
  workers: Worker[];
  stations: StationState[];
  orders: Order[];
  nextOrder: number;
  nextItem: number;
  /** Workday number, from 1. */
  day: number;
  /** Seconds left on today's clock. */
  clock: number;
  goal: number;
  /** Points made today, and in total. */
  dayScore: number;
  score: number;
  strikes: number;
  served: number;
  lost: number;
  spawnIn: number;
  rng: number;
  over: SalesOver;
}

/** What the server sends every tick. */
export interface SalesFrame {
  tick: number;
  at: number;
  world: SalesWorld;
  ack: Record<string, number>;
  events: SalesEvent[];
}

function rand(world: SalesWorld): number {
  // mulberry32, with its state kept in the world so the simulation stays deterministic.
  world.rng = (world.rng + 0x6d2b79f5) >>> 0;
  let t = world.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function pick<T>(world: SalesWorld, list: readonly T[]): T {
  return list[Math.floor(rand(world) * list.length)]!;
}

/** Points to reach in a workday, growing each day and with the size of the team. */
export function dayGoal(day: number, players: number): number {
  const d = day - 1;
  const raw = (300 + 160 * d + 15 * d * d) * (0.7 + 0.15 * Math.max(1, Math.min(4, players)));
  return Math.round(raw / 10) * 10;
}

/** Customers waiting at once, more on busier days and with more players. */
export function maxOrders(day: number, players: number): number {
  return Math.min(SALES.mesonSlots, 1 + Math.ceil(players / 2) + Math.floor((day - 1) / 2));
}

/** Seconds until the next customer walks in. */
export function spawnGap(day: number, players: number): number {
  return Math.max(4, 15 - 1.6 * (day - 1) - 1.2 * players);
}

function patienceFor(day: number, accessory: boolean): number {
  return Math.max(50, 80 - 4 * (day - 1)) + (accessory ? 12 : 0);
}

/** Where each worker starts: the middle of their first area. */
function homeOf(mask: number, index: number): { x: number; z: number } {
  const zone = ZONES[zonesOf(mask)[0] ?? 'recepcion'];
  return { x: (zone.x0 + zone.x1) / 2 + (index % 2 ? 1 : -1) * 0.8, z: (zone.z0 + zone.z1) / 2 };
}

export function createSalesWorld(ids: readonly string[], seed = 1): SalesWorld {
  const masks = zoneMasks(ids.length);
  const workers: Worker[] = ids.map((id, i) => {
    const home = homeOf(masks[i]!, i);
    return { id, x: home.x, z: home.z, h: Math.PI / 2, zones: masks[i]!, held: null, working: false, steps: 0, mistakes: 0, active: true };
  });
  return {
    tick: 0,
    t: 0,
    workers,
    stations: STATIONS.map(() => ({ item: null, work: 0 })),
    orders: [],
    nextOrder: 1,
    nextItem: 1,
    day: 1,
    clock: SALES.dayClock,
    goal: dayGoal(1, ids.length),
    dayScore: 0,
    score: 0,
    strikes: 0,
    served: 0,
    lost: 0,
    spawnIn: 2,
    rng: seed >>> 0 || 1,
    over: null,
  };
}

function inZone(mask: number, x: number, z: number): boolean {
  for (const id of ZONE_IDS) {
    if (!(mask & ZONE_BIT[id])) continue;
    const r = ZONES[id];
    if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return true;
  }
  return false;
}

/** A worker of this radius fits here: every edge point inside their areas. */
function fits(mask: number, x: number, z: number, r: number): boolean {
  return inZone(mask, x, z) && inZone(mask, x - r, z) && inZone(mask, x + r, z) && inZone(mask, x, z - r) && inZone(mask, x, z + r);
}

/** Pushes a circle out of the furniture boxes. */
function pushOut(w: { x: number; z: number }, r: number) {
  for (const b of SOLIDS) {
    const cx = Math.max(b.x0, Math.min(b.x1, w.x));
    const cz = Math.max(b.z0, Math.min(b.z1, w.z));
    const dx = w.x - cx;
    const dz = w.z - cz;
    const d = Math.hypot(dx, dz);
    if (d >= r) continue;
    if (d > 1e-6) {
      w.x = cx + (dx / d) * r;
      w.z = cz + (dz / d) * r;
    } else {
      // The center is inside the box: leave by the nearest side.
      const opts = [
        { x: b.x0 - r, z: w.z, d: w.x - b.x0 },
        { x: b.x1 + r, z: w.z, d: b.x1 - w.x },
        { x: w.x, z: b.z0 - r, d: w.z - b.z0 },
        { x: w.x, z: b.z1 + r, d: b.z1 - w.z },
      ].sort((a, c) => a.d - c.d);
      w.x = opts[0]!.x;
      w.z = opts[0]!.z;
    }
  }
}

/**
 * Moves one worker by one fixed step, inside their own areas. It never touches the stations:
 * the client runs exactly this to predict its own movement.
 */
export function moveWorker(w: Worker, input: SalesInput, dt = SALES_DT): void {
  let mx = Math.max(-1, Math.min(1, input.mx));
  let mz = Math.max(-1, Math.min(1, input.mz));
  const len = Math.hypot(mx, mz);
  if (len > 1) {
    mx /= len;
    mz /= len;
  }
  const r = SALES.radius;
  if (len > 0.05) {
    w.h = Math.atan2(mz, mx);
    const nx = w.x + mx * SALES.speed * dt;
    const nz = w.z + mz * SALES.speed * dt;
    if (fits(w.zones, nx, nz, r)) {
      w.x = nx;
      w.z = nz;
    } else if (fits(w.zones, nx, w.z, r)) w.x = nx;
    else if (fits(w.zones, w.x, nz, r)) w.z = nz;
    pushOut(w, r);
    // Furniture never pushes anyone out of their areas.
    if (!fits(w.zones, w.x, w.z, r)) {
      const zone = ZONES[zonesOf(w.zones).find((id) => inZone(ZONE_BIT[id], w.x, w.z)) ?? zonesOf(w.zones)[0]!];
      w.x = Math.max(zone.x0 + r, Math.min(zone.x1 - r, w.x));
      w.z = Math.max(zone.z0 + r, Math.min(zone.z1 - r, w.z));
    }
  }
}

export function cloneWorker(w: Worker): Worker {
  return { ...w, held: w.held ? { ...w.held } : null };
}

/** The station a worker would use now: the nearest one in reach that belongs to their areas. */
export function stationInReach(w: Pick<Worker, 'x' | 'z' | 'zones'>): StationDef | null {
  let best: StationDef | null = null;
  let bestD: number = SALES.reach;
  for (const s of STATIONS) {
    if (!s.zones.some((z) => w.zones & ZONE_BIT[z])) continue;
    const d = Math.hypot(s.x - w.x, s.z - w.z);
    if (d <= bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

const WORK_SECONDS: Partial<Record<StationKind, number>> = { oc: SALES.writeSeconds, timbre: SALES.stampSeconds };
/** The paper a desk takes, and what it turns it into. */
const DESK_TURNS: Partial<Record<StationKind, { from: ItemKind; to: ItemKind }>> = {
  oc: { from: 'solicitud', to: 'oc' },
  timbre: { from: 'oc', to: 'oc_ok' },
};

export function workSecondsFor(kind: StationKind): number {
  return WORK_SECONDS[kind] ?? 0;
}

/** True when the paper on a desk is finished and ready to take. */
export function deskDone(def: StationDef, st: StationState): boolean {
  const turn = DESK_TURNS[def.kind];
  return !!st.item && !!turn && st.item.kind === turn.to;
}

/**
 * What pressing the action would do right now, for the on-screen hint. The same checks as
 * `useStation`, without changing anything.
 */
export function actionHint(world: SalesWorld, w: Worker): { text: string; ok: boolean } | null {
  const s = stationInReach(w);
  if (!s) return null;
  const st = world.stations[s.id]!;
  const held = w.held;
  const order = (id: number) => world.orders.find((o) => o.id === id);
  switch (s.kind) {
    case 'meson': {
      const o = world.orders.find((x) => x.slot === s.slot);
      if (!o) return null;
      if (o.status === 'taken') return { text: `Cliente #${o.id}: esperando su máquina`, ok: false };
      if (held) return { text: 'Tienes las manos ocupadas', ok: false };
      return { text: `Tomar solicitud #${o.id}`, ok: true };
    }
    case 'oc':
    case 'timbre': {
      const turn = DESK_TURNS[s.kind]!;
      const label = s.kind === 'oc' ? 'Escritorio de órdenes' : 'Timbre de gerencia';
      if (!st.item) {
        if (held?.kind === turn.from) return { text: s.kind === 'oc' ? 'Dejar la solicitud para hacer la orden' : 'Dejar la orden para timbrarla', ok: true };
        return { text: s.kind === 'oc' ? `${label}: trae una solicitud` : `${label}: trae una orden de compra`, ok: false };
      }
      if (deskDone(s, st)) return held ? { text: 'Tienes las manos ocupadas', ok: false } : { text: `Tomar ${ITEM_NAMES[st.item.kind].toLowerCase()} #${st.item.order}`, ok: true };
      return { text: s.kind === 'oc' ? 'Mantén para escribir la orden' : 'Mantén para timbrar', ok: true };
    }
    case 'bay': {
      const m = MODELS[s.model!];
      if (held?.kind === 'oc_ok') {
        const o = order(held.order);
        return { text: `Retirar ${m.short}${o && o.model !== s.model ? ' (¡no es la del pedido!)' : ''}`, ok: true };
      }
      if (held?.kind === 'maquina') return held.model === s.model ? { text: `Devolver ${m.short}`, ok: true } : { text: `Esta bahía es de ${m.short}`, ok: false };
      return { text: `${m.short}: trae una orden timbrada`, ok: false };
    }
    case 'shelf': {
      const a = ACCESSORIES[s.accessory!];
      if (held?.kind !== 'maquina') return { text: `${a.name}: trae una máquina`, ok: false };
      if (!MODELS[held.model!].fits.includes(s.accessory!)) return { text: `${a.name} no le sirve a ${MODELS[held.model!].short}`, ok: false };
      return { text: held.accessory === s.accessory ? `Sacar ${a.name.toLowerCase()}` : `Poner ${a.name.toLowerCase()}`, ok: true };
    }
    case 'dock': {
      const b = BRANCHES[s.branch!];
      if (held?.kind !== 'maquina') return { text: `Andén ${b.name}`, ok: false };
      return { text: `Entregar en ${b.name}`, ok: true };
    }
    case 'pass': {
      if (held) return st.item ? { text: 'Mesón de traspaso ocupado', ok: false } : { text: `Dejar ${ITEM_NAMES[held.kind].toLowerCase()} en el traspaso`, ok: true };
      return st.item ? { text: `Tomar ${ITEM_NAMES[st.item.kind].toLowerCase()} #${st.item.order}`, ok: true } : null;
    }
  }
}

function newItem(world: SalesWorld, kind: ItemKind, order: number): Item {
  return { id: world.nextItem++, kind, order };
}

/** A press of the action button next to a station. */
function useStation(world: SalesWorld, w: Worker, s: StationDef, events: SalesEvent[]) {
  const st = world.stations[s.id]!;
  const held = w.held;
  const nope = (text: string) => events.push({ type: 'nope', by: w.id, station: s.id, text });
  switch (s.kind) {
    case 'meson': {
      const o = world.orders.find((x) => x.slot === s.slot && x.status === 'waiting');
      if (!o) return;
      if (held) return nope('Tienes las manos ocupadas');
      o.status = 'taken';
      w.held = newItem(world, 'solicitud', o.id);
      w.steps++;
      events.push({ type: 'take', by: w.id, order: o.id, station: s.id });
      return;
    }
    case 'oc':
    case 'timbre': {
      const turn = DESK_TURNS[s.kind]!;
      if (!st.item) {
        if (!held) return;
        if (held.kind !== turn.from) return nope(s.kind === 'oc' ? 'Aquí se hacen órdenes a partir de solicitudes' : 'Aquí solo se timbran órdenes de compra');
        st.item = held;
        st.work = 0;
        w.held = null;
        events.push({ type: 'place', by: w.id, order: held.order, station: s.id });
        return;
      }
      if (deskDone(s, st)) {
        if (held) return nope('Tienes las manos ocupadas');
        w.held = st.item;
        st.item = null;
        st.work = 0;
        events.push({ type: 'pickup', by: w.id, order: w.held.order, station: s.id });
      }
      return;
    }
    case 'bay': {
      if (held?.kind === 'oc_ok') {
        w.held = { id: held.id, kind: 'maquina', order: held.order, model: s.model!, accessory: null };
        w.steps++;
        events.push({ type: 'machine', by: w.id, order: held.order, station: s.id });
        return;
      }
      if (held?.kind === 'maquina') {
        if (held.model !== s.model) return nope(`Esta bahía es de ${MODELS[s.model!].short}`);
        w.held = { id: held.id, kind: 'oc_ok', order: held.order };
        events.push({ type: 'return', by: w.id, order: held.order, station: s.id });
        return;
      }
      return nope('Para retirar una máquina necesitas la orden timbrada');
    }
    case 'shelf': {
      if (held?.kind !== 'maquina') return nope('Los accesorios se ponen en una máquina');
      if (!MODELS[held.model!].fits.includes(s.accessory!)) return nope(`${ACCESSORIES[s.accessory!].name} no le sirve a ${MODELS[held.model!].short}`);
      held.accessory = held.accessory === s.accessory ? null : s.accessory!;
      if (held.accessory) w.steps++;
      events.push({ type: 'accessory', by: w.id, order: held.order, station: s.id });
      return;
    }
    case 'dock': {
      if (held?.kind !== 'maquina') return nope('Al andén solo llegan máquinas');
      const o = world.orders.find((x) => x.id === held.order);
      if (!o) {
        w.held = null;
        return;
      }
      const problems: string[] = [];
      if (held.model !== o.model) problems.push(`pidió ${MODELS[o.model].short}`);
      if ((held.accessory ?? null) !== o.accessory) problems.push(o.accessory ? `falta ${ACCESSORIES[o.accessory].name.toLowerCase()}` : 'no pidió accesorio');
      if (s.branch !== o.branch) problems.push(`es para ${BRANCHES[o.branch].name}`);
      if (problems.length) {
        w.mistakes++;
        world.clock = Math.max(0, world.clock - SALES.penaltySeconds);
        events.push({ type: 'wrong', by: w.id, order: o.id, station: s.id, n: SALES.penaltySeconds, text: `Pedido #${o.id}: ${problems.join(', ')}` });
        return;
      }
      const P = SALES.points;
      const points = P.base + (o.accessory ? P.accessory : 0) + Math.round((P.tip * Math.max(0, o.left)) / o.patience / 5) * 5;
      world.orders = world.orders.filter((x) => x !== o);
      w.held = null;
      w.steps++;
      world.score += points;
      world.dayScore += points;
      world.served++;
      events.push({ type: 'served', by: w.id, order: o.id, station: s.id, n: points });
      return;
    }
    case 'pass': {
      if (held) {
        if (st.item) return nope('El mesón de traspaso está ocupado');
        st.item = held;
        w.held = null;
        events.push({ type: 'place', by: w.id, order: held.order, station: s.id });
      } else if (st.item) {
        w.held = st.item;
        st.item = null;
        events.push({ type: 'pickup', by: w.id, order: w.held.order, station: s.id });
      }
      return;
    }
  }
}

/** Takes every paper and machine of a lost order out of the game. */
function dropOrder(world: SalesWorld, id: number) {
  for (const w of world.workers) if (w.held?.order === id) w.held = null;
  for (const st of world.stations)
    if (st.item?.order === id) {
      st.item = null;
      st.work = 0;
    }
}

/** Gives the areas of disconnected workers to those still playing. */
export function assignZones(world: SalesWorld, events: SalesEvent[] = []): void {
  const active = world.workers.filter((w) => w.active);
  if (!active.length) return;
  const masks = zoneMasks(active.length);
  let changed = false;
  active.forEach((w, i) => {
    if (w.zones === masks[i]) return;
    w.zones = masks[i]!;
    changed = true;
    if (!fits(w.zones, w.x, w.z, SALES.radius)) {
      const home = homeOf(w.zones, i);
      w.x = home.x;
      w.z = home.z;
    }
  });
  if (changed) events.push({ type: 'zones', by: '' });
}

/**
 * One fixed step of the whole game, after every worker moved: stations, customers, the clock
 * and the goal. `inputs` holds this step's input of each worker by id.
 */
export function stepSales(world: SalesWorld, inputs: ReadonlyMap<string, SalesInput>, dt = SALES_DT): SalesEvent[] {
  const events: SalesEvent[] = [];
  if (world.over) return events;
  world.tick++;
  world.t += dt;

  for (const w of world.workers) {
    w.working = false;
    if (!w.active) continue;
    const input = inputs.get(w.id) ?? SALES_NO_INPUT;
    const s = stationInReach(w);
    if (!s) continue;
    if (input.act) useStation(world, w, s, events);
    const st = world.stations[s.id]!;
    const turn = DESK_TURNS[s.kind];
    if ((input.act || input.hold) && turn && st.item?.kind === turn.from) {
      w.working = true;
      st.work += dt;
      if (st.work >= WORK_SECONDS[s.kind]!) {
        st.item = { ...st.item, kind: turn.to };
        st.work = 0;
        w.steps++;
        events.push({ type: s.kind === 'oc' ? 'written' : 'stamped', by: w.id, order: st.item.order, station: s.id });
      }
    }
  }

  // Customers lose patience; the ones who run out leave angry.
  for (const o of [...world.orders]) {
    o.left -= dt;
    if (o.left > 0) continue;
    world.orders = world.orders.filter((x) => x !== o);
    dropOrder(world, o.id);
    world.strikes++;
    world.lost++;
    events.push({ type: 'lost', by: '', order: o.id });
  }

  // New customers.
  const players = world.workers.length;
  world.spawnIn -= dt;
  if (world.spawnIn <= 0 && world.orders.length < maxOrders(world.day, players)) {
    const free = Array.from({ length: SALES.mesonSlots }, (_, i) => i).filter((i) => !world.orders.some((o) => o.slot === i));
    if (free.length) {
      const model = pick(world, MODEL_IDS);
      const extraChance = world.day <= 1 ? 0 : world.day === 2 ? 0.4 : 0.6;
      const accessory = rand(world) < extraChance ? pick(world, MODELS[model].fits) : null;
      const patience = patienceFor(world.day, !!accessory);
      const order: Order = { id: world.nextOrder++, slot: pick(world, free), model, branch: pick(world, BRANCH_IDS), accessory, patience, left: patience, status: 'waiting' };
      world.orders.push(order);
      events.push({ type: 'arrive', by: '', order: order.id });
      world.spawnIn = spawnGap(world.day, players) * (0.8 + rand(world) * 0.4);
    }
  } else if (world.spawnIn <= 0 && world.orders.length === 0) {
    world.spawnIn = 0.5;
  }

  // The goal: next day. The clock or the angry customers: game over.
  if (world.dayScore >= world.goal) {
    const bonus = Math.round(world.clock * SALES.timeBonus);
    world.score += bonus;
    world.day++;
    world.goal = dayGoal(world.day, players);
    world.dayScore = 0;
    world.clock = SALES.dayClock;
    // A good day calms one angry customer down.
    world.strikes = Math.max(0, world.strikes - 1);
    events.push({ type: 'goal', by: '', n: world.day, text: String(bonus) });
  } else {
    world.clock = Math.max(0, world.clock - dt);
  }
  if (world.strikes >= SALES.maxStrikes) world.over = 'angry';
  else if (world.clock <= 0) world.over = 'time';
  if (world.over) events.push({ type: 'over', by: '', text: world.over });
  return events;
}

/** Workdays fully completed. */
export const daysCompleted = (world: SalesWorld) => world.day - 1;

function round(n: number) {
  return Math.round(n * 100) / 100;
}

/** A copy of the world rounded for the wire. */
export function packSalesWorld(world: SalesWorld): SalesWorld {
  return {
    ...world,
    t: round(world.t),
    clock: round(world.clock),
    spawnIn: round(world.spawnIn),
    workers: world.workers.map((w) => ({ ...w, x: round(w.x), z: round(w.z), h: Math.round(w.h * 1000) / 1000, held: w.held ? { ...w.held } : null })),
    stations: world.stations.map((s) => ({ item: s.item ? { ...s.item } : null, work: round(s.work) })),
    orders: world.orders.map((o) => ({ ...o, left: round(o.left) })),
  };
}
