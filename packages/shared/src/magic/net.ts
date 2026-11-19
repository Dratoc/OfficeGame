import { z } from 'zod';
import { FORMATIONS, MF_DT, UNIT_STATS, type MfSoldierKind, type MfUnitKind } from './config';
import { magicMap, type MfMapId } from './map';
import {
  MF_NO_INPUT,
  createMagicWorld,
  type MfArmy,
  type MfEvent,
  type MfInput,
  type MfOrder,
  type MfProjectile,
  type MfSelection,
  type MfUnit,
  type MfWorld,
} from './world';

/**
 * Magic Frontiers online. The server runs the battle; players only send their commander's input
 * and get back a compact picture of the whole battlefield a few times per step. Everything here is
 * pure so the server, the browser and the tests share it.
 */

const ORDERS: (MfOrder | null)[] = [null, 'follow', 'attack', 'defend'];
const SELECTIONS: MfSelection[] = ['all', 'warrior', 'mage', 'beast'];
const KINDS: MfUnitKind[] = ['commander', 'warrior', 'mage', 'beast', 'gate'];
const SOLDIERS: MfSoldierKind[] = ['warrior', 'mage', 'beast'];
const ACTS: MfUnit['act'][] = ['none', 'swing', 'cast'];
const UNIT_ORDERS: MfOrder[] = ['follow', 'attack', 'defend'];

/** One step of a commander's input, as it travels. */
export const magicNetInputSchema = z.object({
  seq: z.number().int().min(0).max(1e9),
  mx: z.number().finite().min(-1).max(1),
  mz: z.number().finite().min(-1).max(1),
  ax: z.number().finite().min(-200).max(200),
  az: z.number().finite().min(-200).max(200),
  st: z.boolean(),
  /** Order: 0 none, 1 follow, 2 attack, 3 defend. */
  o: z.number().int().min(0).max(3),
  /** Selection: -1 unchanged, 0 all, 1 warriors, 2 mages, 3 beasts. */
  sel: z.number().int().min(-1).max(3),
  v: z.boolean(),
  /** Formation: -1 unchanged, else an index of FORMATIONS. */
  f: z.number().int().min(-1).max(2),
  /** Buy: -1 nothing, else warrior, mage, beast. */
  b: z.number().int().min(-1).max(2),
  /** Garrison: -1 nothing, 0 leave, 1 recall. */
  g: z.number().int().min(-1).max(1),
});
export type MagicNetInput = z.infer<typeof magicNetInputSchema>;

export const magicInputBatchSchema = z.object({
  matchId: z.string().min(1).max(40),
  inputs: z.array(magicNetInputSchema).min(1).max(8),
});
export type MagicInputBatch = z.infer<typeof magicInputBatchSchema>;

export function encodeMagicInput(i: MfInput, seq: number): MagicNetInput {
  return {
    seq,
    mx: Math.max(-1, Math.min(1, i.mx)),
    mz: Math.max(-1, Math.min(1, i.mz)),
    ax: Math.max(-200, Math.min(200, i.aimX)),
    az: Math.max(-200, Math.min(200, i.aimZ)),
    st: i.strike,
    o: Math.max(0, ORDERS.indexOf(i.order)),
    sel: i.select ? SELECTIONS.indexOf(i.select) : -1,
    v: i.volley,
    f: i.formation ? FORMATIONS.indexOf(i.formation) : -1,
    b: i.buy ? SOLDIERS.indexOf(i.buy) : -1,
    g: i.garrison === 'leave' ? 0 : i.garrison === 'recall' ? 1 : -1,
  };
}

export function decodeMagicInput(n: MagicNetInput): MfInput {
  return {
    mx: n.mx,
    mz: n.mz,
    aimX: n.ax,
    aimZ: n.az,
    strike: n.st,
    order: ORDERS[n.o] ?? null,
    select: n.sel >= 0 ? SELECTIONS[n.sel]! : null,
    volley: n.v,
    formation: n.f >= 0 ? FORMATIONS[n.f]! : null,
    buy: n.b >= 0 ? SOLDIERS[n.b]! : null,
    garrison: n.g === 0 ? 'leave' : n.g === 1 ? 'recall' : null,
  };
}

/** Same input with the one-shot presses taken out: what a held key keeps doing when a packet is late. */
export function heldMagicInput(n: MagicNetInput): MagicNetInput {
  return { ...n, st: false, o: 0, sel: -1, v: false, f: -1, b: -1, g: -1 };
}

/** Merges a dropped step into the next one so no press is lost. */
export function mergeMagicInput(dropped: MagicNetInput, next: MagicNetInput): MagicNetInput {
  return {
    ...next,
    st: next.st || dropped.st,
    o: next.o || dropped.o,
    sel: next.sel >= 0 ? next.sel : dropped.sel,
    v: next.v || dropped.v,
    f: next.f >= 0 ? next.f : dropped.f,
    b: next.b >= 0 ? next.b : dropped.b,
    g: next.g >= 0 ? next.g : dropped.g,
  };
}

export const MF_IDLE_NET_INPUT: MagicNetInput = encodeMagicInput(MF_NO_INPUT, 0);

const r2 = (v: number) => Math.round(v * 100) / 100;
const r1 = (v: number) => Math.round(v * 10) / 10;

/**
 * A unit on the wire: [team, kind, x, z, facing, vx, vz, hp, maxHp, alive, order, focus, act,
 * actT, deadFor, garrison]. Only what the picture and the HUD need.
 */
export type PackedMfUnit = [number, number, number, number, number, number, number, number, number, 0 | 1, number, number, number, number, number, number];
/** [id, team, owner, x, y, z, volley] */
export type PackedMfShot = [number, number, number, number, number, number, 0 | 1];

export interface PackedMfWorld {
  mode: MfMapId;
  tick: number;
  time: number;
  over: boolean;
  winner: number;
  units: PackedMfUnit[];
  shots: PackedMfShot[];
  /** [commander id, heading, selection, formation, volley cooldown, war cry] per army. */
  armies: [number, number, number, number, number, number][];
  /** [owner, capture, contested] per fortress. */
  forts: [number, number, 0 | 1][];
  econ: { gold: number; vp: number; respawn: number; queue: [number, number, number, number][] }[];
}

export interface MagicFrame {
  tick: number;
  /** Server time of this picture. */
  at: number;
  world: PackedMfWorld;
  /** Player id by team: team 0 is the south army, team 1 the north. */
  teams: string[];
  /** Last input step applied for each player. */
  ack: Record<string, number>;
  events: MfEvent[];
}

export function packMagicWorld(w: MfWorld): PackedMfWorld {
  return {
    mode: w.mode,
    tick: w.tick,
    time: r2(w.time),
    over: w.over,
    winner: w.winner,
    units: w.units.map((u) => [
      u.team,
      KINDS.indexOf(u.kind),
      r2(u.x),
      r2(u.z),
      r2(u.facing),
      r1(u.vx),
      r1(u.vz),
      Math.ceil(u.hp),
      u.maxHp,
      u.alive ? 1 : 0,
      UNIT_ORDERS.indexOf(u.order),
      u.focus,
      ACTS.indexOf(u.act),
      r2(Math.min(9, u.actT)),
      r1(Math.min(60, u.deadFor)),
      u.garrison,
    ]),
    shots: w.projectiles.map((p) => [p.id, p.team, p.owner, r2(p.x), r2(p.y), r2(p.z), p.volley ? 1 : 0]),
    armies: w.armies.map((a) => [a.commander, r2(a.heading), SELECTIONS.indexOf(a.selection), FORMATIONS.indexOf(a.formation), r1(a.volleyCd), r1(a.warCry)]),
    forts: w.forts.map((f) => [f.owner, Math.round(f.capture * 1000) / 1000, f.contested ? 1 : 0]),
    econ: w.econ.map((e) => ({
      gold: r1(e.gold),
      vp: r1(e.vp),
      respawn: r1(e.respawn),
      queue: e.queue.map((q) => [SOLDIERS.indexOf(q.kind), q.at, r1(q.left), q.total]),
    })),
  };
}

/**
 * Rebuilds a world the renderer and the HUD can read from a packed picture. It is a view: the
 * fields only the simulation uses keep neutral values, and it must never be stepped.
 */
export function unpackMagicWorld(p: PackedMfWorld): MfWorld {
  const w = createMagicWorld(1, p.mode);
  w.tick = p.tick;
  w.time = p.time;
  w.over = p.over;
  w.winner = p.winner;
  w.units = p.units.map((t, i) => {
    const kind = KINDS[t[1]]!;
    return {
      id: i + 1,
      team: t[0],
      kind,
      x: t[2],
      z: t[3],
      facing: t[4],
      vx: t[5],
      vz: t[6],
      hp: t[7],
      maxHp: t[8],
      alive: t[9] === 1,
      deadFor: t[14],
      order: UNIT_ORDERS[t[10]] ?? 'follow',
      focus: t[11],
      target: -1,
      retarget: 0,
      cd: 0,
      swing: -1,
      swingTarget: -1,
      act: ACTS[t[12]] ?? 'none',
      actT: t[13],
      slotX: t[2],
      slotZ: t[3],
      hasSlot: false,
      slotIndex: 0,
      anchorX: t[2],
      anchorZ: t[3],
      anchorDir: t[4],
      volleyIn: -1,
      volleyX: 0,
      volleyZ: 0,
      stuck: 0,
      lastGoal: 0,
      nudge: 0,
      nudgeT: 0,
      hurtBy: -1,
      hurtT: 99,
      garrison: t[15],
    };
  });
  w.nextId = w.units.length + 1;
  w.projectiles = p.shots.map(
    (s): MfProjectile => ({ id: s[0], team: s[1], owner: s[2], x: s[3], y: s[4], z: s[5], vx: 0, vy: 0, vz: 0, damage: 0, splash: 0, volley: s[6] === 1, age: 0 }),
  );
  w.armies = p.armies.map(
    (a, team): MfArmy => ({
      team,
      name: team === 0 ? 'Ejército del Sur' : 'Ejército del Norte',
      commander: a[0],
      heading: a[1],
      plannedHeading: a[1],
      planKey: '',
      selection: SELECTIONS[a[2]] ?? 'all',
      formation: FORMATIONS[a[3]] ?? 'line',
      volleyCd: a[4],
      warCry: a[5],
    }),
  );
  const sites = magicMap(p.mode).forts;
  w.forts = p.forts.map((f, id) => {
    const s = sites[id]!;
    const h = s.half;
    return { id, name: s.name, x: s.x, z: s.z, half: h, owner: f[0], capture: f[1], contested: f[2] === 1, gates: [] };
  });
  w.econ = p.econ.map((e) => ({
    gold: e.gold,
    vp: e.vp,
    respawn: e.respawn,
    queue: e.queue.map((q) => ({ kind: SOLDIERS[q[0]]!, at: q[1], left: q[2], total: q[3] })),
  }));
  return w;
}

/**
 * Client-side guess of where your own commander goes this step, so walking feels instant online.
 * Same speed and turn rules as the server, with the map's walls, trees and rocks; other units are
 * left out and the next picture from the server corrects the small difference.
 */
export function predictCommander(c: { x: number; z: number; vx: number; vz: number; facing: number }, input: MfInput, mode: MfMapId) {
  const s = UNIT_STATS.commander;
  const len = Math.hypot(input.mx, input.mz);
  const k = len > 1 ? 1 / len : 1;
  const blend = Math.min(1, MF_DT * 12);
  c.vx += (input.mx * k * s.speed - c.vx) * blend;
  c.vz += (input.mz * k * s.speed - c.vz) * blend;
  if (Math.hypot(input.aimX - c.x, input.aimZ - c.z) > 0.3) {
    const aim = Math.atan2(input.aimX - c.x, input.aimZ - c.z);
    const d = Math.atan2(Math.sin(aim - c.facing), Math.cos(aim - c.facing));
    const max = MF_DT * 14;
    c.facing = Math.abs(d) <= max ? aim : c.facing + Math.sign(d) * max;
  }
  c.x += c.vx * MF_DT;
  c.z += c.vz * MF_DT;
  const map = magicMap(mode);
  for (const o of map.obstacles) {
    const dx = c.x - o.x;
    const dz = c.z - o.z;
    const r = o.r + s.radius;
    const dd = dx * dx + dz * dz;
    if (dd >= r * r) continue;
    const l = Math.sqrt(dd) || 0.001;
    c.x = o.x + (dx / l) * r;
    c.z = o.z + (dz / l) * r;
  }
  c.x = Math.max(-map.half, Math.min(map.half, c.x));
  c.z = Math.max(-map.half, Math.min(map.half, c.z));
}
