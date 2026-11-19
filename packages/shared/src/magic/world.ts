import { mulberry32 } from '../rng';
import { ARMY, DAMAGE_VS, MF_DT, MF_FLY_HEIGHT, MF_GRAVITY, UNIT_STATS, type MfComposition, type MfFormation, type MfSoldierKind, type MfUnitKind } from './config';
import { assignSlots, defendSlots, followSlots } from './formation';
import { magicMap, type MfMapId, type MfObstacle } from './map';
import { applyEconomyInput, conquestStep, onUnitDeath } from './conquest';

/**
 * Magic Frontiers battle simulation. Pure and deterministic: the browser runs it for the prototype,
 * and the server can run the very same code once battles go online. No rendering in here.
 *
 * The player never steers soldiers one by one: each army has a commander, and the commander's
 * orders (Follow, Attack, Defend) set how every soldier behaves on its own.
 */

export type MfOrder = 'follow' | 'attack' | 'defend';
export type MfSelection = 'all' | MfSoldierKind;

export interface MfUnit {
  id: number;
  team: number;
  kind: MfUnitKind;
  x: number;
  z: number;
  vx: number;
  vz: number;
  facing: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  /** Seconds since death, for the fall animation. */
  deadFor: number;
  order: MfOrder;
  /** Priority target from the commander's Attack order (-1 = none). */
  focus: number;
  /** The enemy this unit is fighting right now (-1 = none). */
  target: number;
  retarget: number;
  /** Seconds until the unit can attack again. */
  cd: number;
  /** Melee swing in progress: seconds until the blow lands (< 0 = not swinging). */
  swing: number;
  swingTarget: number;
  /** Last action, for animations: what and how long ago. */
  act: 'none' | 'swing' | 'cast';
  actT: number;
  /** Where the formation (or the defense line) wants this unit. */
  slotX: number;
  slotZ: number;
  hasSlot: boolean;
  slotIndex: number;
  /** Defend: the protected spot and the direction the line faces. */
  anchorX: number;
  anchorZ: number;
  anchorDir: number;
  /** A magic volley shot waiting to leave the staff (seconds; < 0 = none). */
  volleyIn: number;
  volleyX: number;
  volleyZ: number;
  /** Anti-jam: time spent not getting closer to the goal, and a sideways nudge when stuck. */
  stuck: number;
  lastGoal: number;
  nudge: number;
  nudgeT: number;
  /** Who hurt this unit last and how long ago, so soldiers defend themselves. */
  hurtBy: number;
  hurtT: number;
  /** Fortress this soldier was left to defend (-1 = with the army). Orders don't reach it. */
  garrison: number;
}

export interface MfArmy {
  team: number;
  name: string;
  commander: number;
  /** March heading: where the formation faces. Only turns while the commander walks. */
  heading: number;
  /** Heading used when slots were last handed out. */
  plannedHeading: number;
  planKey: string;
  selection: MfSelection;
  formation: MfFormation;
  volleyCd: number;
  warCry: number;
}

export interface MfProjectile {
  id: number;
  team: number;
  owner: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  damage: number;
  splash: number;
  volley: boolean;
  age: number;
}

/** A fortress in a conquest match. */
export interface MfFort {
  id: number;
  name: string;
  x: number;
  z: number;
  half: number;
  /** Team holding it, or -1 while neutral. */
  owner: number;
  /** -1..1: +1 fully taken by team 0, -1 by team 1. */
  capture: number;
  /** Someone from each side is inside. */
  contested: boolean;
  /** Gate unit ids. */
  gates: number[];
}

/** Gold, points and the training queue of one side. */
export interface MfEconomy {
  gold: number;
  vp: number;
  queue: { kind: MfSoldierKind; at: number; left: number; total: number }[];
  /** Seconds until the fallen commander is back at the base (0 = alive). */
  respawn: number;
}

export interface MfWorld {
  mode: MfMapId;
  forts: MfFort[];
  econ: MfEconomy[];
  tick: number;
  time: number;
  units: MfUnit[];
  armies: MfArmy[];
  projectiles: MfProjectile[];
  nextId: number;
  /** Projectile ids have their own counter so unit ids stay 1..n (unit id = index + 1). */
  nextShot: number;
  rnd: () => number;
  over: boolean;
  /** Winning team, or -1 while the battle goes on. */
  winner: number;
}

/** What a commander does this step. Built from the keyboard and mouse, or by the AI. */
export interface MfInput {
  /** Walk direction in world space, length 0 to 1. */
  mx: number;
  mz: number;
  /** Ground point under the aim reticle. */
  aimX: number;
  aimZ: number;
  /** Commander's own sword swing. */
  strike: boolean;
  order: MfOrder | null;
  select: MfSelection | null;
  volley: boolean;
  /** Change the marching formation. */
  formation?: MfFormation | null;
  /** Conquest: train a soldier at the recruitment point nearest to the commander. */
  buy?: MfSoldierKind | null;
  /** Conquest: leave soldiers to defend the fortress the commander stands in, or take them back. */
  garrison?: 'leave' | 'recall' | null;
}

export const MF_NO_INPUT: MfInput = { mx: 0, mz: 0, aimX: 0, aimZ: 0, strike: false, order: null, select: null, volley: false, formation: null };

export type MfEvent =
  | { t: 'swing'; id: number }
  | { t: 'cast'; id: number; volley: boolean }
  | { t: 'hit'; id: number; by: number; amount: number }
  | { t: 'death'; id: number }
  | { t: 'boom'; x: number; y: number; z: number; team: number; r: number; volley: boolean }
  | { t: 'order'; team: number; order: MfOrder; selection: MfSelection; focus: number }
  | { t: 'select'; team: number; selection: MfSelection }
  | { t: 'volley'; team: number; x: number; z: number }
  | { t: 'breath'; id: number }
  | { t: 'formation'; team: number; formation: MfFormation }
  | { t: 'spawn'; id: number }
  | { t: 'fort'; id: number; owner: number; from: number }
  | { t: 'recruit'; team: number; kind: MfSoldierKind; at: number }
  | { t: 'garrison'; team: number; fort: number; n: number; recall: boolean }
  | { t: 'respawn'; id: number }
  | { t: 'denied'; team: number; reason: string }
  | { t: 'end'; winner: number };

export interface MfArmySetup extends MfComposition {
  name: string;
  x: number;
  z: number;
  facing: number;
}

const ANGLE = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

function turnTowards(from: number, to: number, max: number) {
  const d = ANGLE(to - from);
  return Math.abs(d) <= max ? to : from + Math.sign(d) * max;
}

function makeUnit(world: MfWorld, team: number, kind: MfUnitKind, x: number, z: number, facing: number): MfUnit {
  const s = UNIT_STATS[kind];
  return {
    id: world.nextId++,
    team,
    kind,
    x,
    z,
    vx: 0,
    vz: 0,
    facing,
    hp: s.hp,
    maxHp: s.hp,
    alive: true,
    deadFor: 0,
    order: 'follow',
    focus: -1,
    target: -1,
    retarget: world.rnd() * 0.3,
    cd: world.rnd() * 0.5,
    swing: -1,
    swingTarget: -1,
    act: 'none',
    actT: 9,
    slotX: x,
    slotZ: z,
    hasSlot: false,
    slotIndex: 0,
    anchorX: x,
    anchorZ: z,
    anchorDir: facing,
    volleyIn: -1,
    volleyX: 0,
    volleyZ: 0,
    stuck: 0,
    lastGoal: Infinity,
    nudge: 0,
    nudgeT: 0,
    hurtBy: -1,
    hurtT: 99,
    garrison: -1,
  };
}

/** Adds an army: a commander and its soldiers already standing in formation. */
export function makeGate(world: MfWorld, x: number, z: number, facing: number): MfUnit {
  const g = makeUnit(world, -1, 'gate', x, z, facing);
  g.alive = false;
  world.units.push(g);
  return g;
}

export function addArmy(world: MfWorld, setup: MfArmySetup): MfArmy {
  const team = world.armies.length;
  const cmd = makeUnit(world, team, 'commander', setup.x, setup.z, setup.facing);
  world.units.push(cmd);
  const army: MfArmy = { team, name: setup.name, commander: cmd.id, heading: setup.facing, plannedHeading: setup.facing, planKey: '', selection: 'all', formation: 'line', volleyCd: 0, warCry: 0 };
  world.armies.push(army);
  const kinds: MfSoldierKind[] = [
    ...Array<MfSoldierKind>(setup.warriors).fill('warrior'),
    ...Array<MfSoldierKind>(setup.mages).fill('mage'),
    ...Array<MfSoldierKind>(setup.beasts).fill('beast'),
  ];
  const slots = followSlots(setup.warriors, setup.mages, setup.beasts);
  const next = { warrior: 0, mage: 0, beast: 0 };
  const c = Math.cos(setup.facing);
  const s = Math.sin(setup.facing);
  for (const k of kinds) {
    const p = slots[k][next[k]++]!;
    const x = setup.x + p.x * c + p.z * s;
    const z = setup.z - p.x * s + p.z * c;
    world.units.push(makeUnit(world, team, k, x, z, setup.facing));
  }
  return army;
}

export function createMagicWorld(seed: number, mode: MfMapId = 'skirmish'): MfWorld {
  return { mode, forts: [], econ: [], tick: 0, time: 0, units: [], armies: [], projectiles: [], nextId: 1, nextShot: 1, rnd: mulberry32(seed), over: false, winner: -1 };
}

/** A skirmish: the player's army in the south camp against an AI army in the north. */
export function createMagicBattle(
  seed: number,
  enemy: MfComposition = { warriors: 6, mages: 4, beasts: 0 },
  player: MfComposition = { warriors: 6, mages: 4, beasts: 0 },
): MfWorld {
  const map = magicMap();
  const w = createMagicWorld(seed, 'skirmish');
  addArmy(w, { name: 'Tu ejército', ...player, ...map.playerSpawn });
  addArmy(w, { name: 'Ejército de la Frontera Roja', ...enemy, ...map.enemyCamp });
  return w;
}

/** Adds one soldier to an army mid-battle (reinforcements). It joins in Follow. */
export function spawnUnit(world: MfWorld, team: number, kind: MfSoldierKind, x: number, z: number, facing = 0): MfUnit {
  const u = makeUnit(world, team, kind, x, z, facing);
  world.units.push(u);
  world.armies[team]!.planKey = '';
  return u;
}

/** Places used in an army (soldiers alive or on their way), for the 50-unit cap. */
export function armyCapacityUsed(world: MfWorld, team: number): number {
  let n = 0;
  for (const u of world.units) if (u.alive && u.team === team) n += UNIT_STATS[u.kind].capacity;
  return n;
}

export function unitById(world: MfWorld, id: number): MfUnit | undefined {
  // Ids are handed out in order and units are never removed, so this is a direct index.
  return world.units[id - 1];
}

export function commanderOf(world: MfWorld, team: number): MfUnit {
  return unitById(world, world.armies[team]!.commander)!;
}

export interface MfArmyCount {
  warrior: number;
  mage: number;
  beast: number;
  warriorMax: number;
  mageMax: number;
  beastMax: number;
  commanderHp: number;
  commanderMax: number;
}

/** Living soldiers per kind, for the HUD. */
export function armyCount(world: MfWorld, team: number): MfArmyCount {
  const c: MfArmyCount = { warrior: 0, mage: 0, beast: 0, warriorMax: 0, mageMax: 0, beastMax: 0, commanderHp: 0, commanderMax: 1 };
  for (const u of world.units) {
    if (u.team !== team) continue;
    if (u.kind === 'gate') continue;
    if (u.kind === 'commander') {
      c.commanderHp = Math.max(0, u.hp);
      c.commanderMax = u.maxHp;
      continue;
    }
    c[`${u.kind}Max`]++;
    if (u.alive) c[u.kind]++;
  }
  return c;
}

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

function nearestEnemy(world: MfWorld, from: { x: number; z: number }, team: number, within: number, pred?: (u: MfUnit) => boolean): MfUnit | null {
  let best: MfUnit | null = null;
  let bd = within;
  // About a hundred units at most: a straight scan per decision is cheaper than keeping a grid.
  for (const u of world.units) {
    if (!u.alive || u.team === team) continue;
    // Soldiers come before gates: a gate only gets attention when nobody else is near.
    const d = dist(from, u) + (u.kind === 'gate' ? 6 : 0);
    if (d < bd && (!pred || pred(u))) {
      bd = d;
      best = u;
    }
  }
  return best;
}

function damage(world: MfWorld, u: MfUnit, amount: number, by: number, events: MfEvent[]) {
  if (!u.alive) return;
  const attacker = unitById(world, by);
  let k = UNIT_STATS[u.kind].damageTaken * (attacker ? DAMAGE_VS[attacker.kind][u.kind] ?? 1 : 1);
  if (u.kind === 'warrior' && u.order === 'defend' && dist(u, { x: u.slotX, z: u.slotZ }) < 1.5) k *= ARMY.defendDamageTaken;
  const dmg = Math.round(amount * k);
  u.hp -= dmg;
  u.hurtBy = by;
  u.hurtT = 0;
  events.push({ t: 'hit', id: u.id, by, amount: dmg });
  if (u.hp <= 0) {
    u.hp = 0;
    u.alive = false;
    u.vx = u.vz = 0;
    u.swing = -1;
    u.volleyIn = -1;
    u.deadFor = 0;
    events.push({ t: 'death', id: u.id });
    if (world.mode === 'conquest') onUnitDeath(world, u, attacker);
  }
}

/** Launch a magic bolt in an arc so it comes down on (tx, tz) after flying at `speed`. */
function launch(world: MfWorld, u: MfUnit, tx: number, tz: number, damageAmount: number, splash: number, speed: number, volley: boolean) {
  const sx = u.x + Math.sin(u.facing) * 0.5;
  const sz = u.z + Math.cos(u.facing) * 0.5;
  const sy = 1.9;
  const d = Math.max(0.5, Math.hypot(tx - sx, tz - sz));
  const t = d / speed;
  const ty = 0.6;
  world.projectiles.push({
    id: world.nextShot++,
    team: u.team,
    owner: u.id,
    x: sx,
    y: sy,
    z: sz,
    vx: ((tx - sx) / d) * speed,
    vy: (ty - sy + 0.5 * MF_GRAVITY * t * t) / t,
    vz: ((tz - sz) / d) * speed,
    damage: damageAmount,
    splash,
    volley,
    age: 0,
  });
}

function applyCommand(world: MfWorld, army: MfArmy, input: MfInput, events: MfEvent[]) {
  const cmd = unitById(world, army.commander)!;
  if (input.select && input.select !== army.selection) {
    army.selection = input.select;
    events.push({ t: 'select', team: army.team, selection: army.selection });
  }
  if (input.formation && input.formation !== army.formation) {
    army.formation = input.formation;
    army.planKey = '';
    events.push({ t: 'formation', team: army.team, formation: army.formation });
  }
  const chosen = (u: MfUnit) => u.alive && u.team === army.team && u.kind !== 'commander' && u.kind !== 'gate' && u.garrison < 0 && (army.selection === 'all' || u.kind === army.selection);
  if (input.order) {
    const order = input.order;
    let focus = -1;
    if (order === 'attack') {
      // The enemy under the reticle, or the closest one to it.
      focus = nearestEnemy(world, { x: input.aimX, z: input.aimZ }, army.team, 9)?.id ?? -1;
      army.warCry = ARMY.warCry;
    }
    const picked = world.units.filter(chosen);
    for (const u of picked) {
      u.order = order;
      u.focus = focus;
      u.retarget = 0;
      if (order !== 'defend') u.hasSlot = false;
    }
    if (order === 'defend') {
      const dir = Math.atan2(input.aimX - cmd.x, input.aimZ - cmd.z);
      const of = (k: MfSoldierKind) => picked.filter((u) => u.kind === k);
      const slots = defendSlots(of('warrior').length, of('mage').length, of('beast').length);
      const c = Math.cos(dir);
      const s = Math.sin(dir);
      const toWorld = (p: { x: number; z: number }) => ({ x: cmd.x + p.x * c + p.z * s, z: cmd.z - p.x * s + p.z * c });
      for (const k of ['warrior', 'mage', 'beast'] as const) assignSlots(of(k), slots[k].map(toWorld));
      for (const u of picked) {
        u.anchorX = cmd.x;
        u.anchorZ = cmd.z;
        u.anchorDir = dir;
      }
    }
    army.planKey = '';
    events.push({ t: 'order', team: army.team, order, selection: army.selection, focus });
  }
  if (world.mode === 'conquest') applyEconomyInput(world, army, input, events);
  if (input.volley && army.volleyCd <= 0) {
    const mages = world.units.filter((u) => u.alive && u.team === army.team && UNIT_STATS[u.kind].ranged && u.kind !== 'commander' && u.garrison < 0);
    if (mages.length) {
      army.volleyCd = ARMY.volleyCooldown;
      events.push({ t: 'volley', team: army.team, x: input.aimX, z: input.aimZ });
      for (const m of mages) {
        // A little spread and a ripple in timing, so it rains instead of landing as one ball.
        const range = UNIT_STATS[m.kind].ranged!.range;
        let tx = input.aimX + (world.rnd() - 0.5) * 2.6;
        let tz = input.aimZ + (world.rnd() - 0.5) * 2.6;
        const d = Math.hypot(tx - m.x, tz - m.z);
        if (d > range) {
          tx = m.x + ((tx - m.x) / d) * range;
          tz = m.z + ((tz - m.z) / d) * range;
        }
        m.volleyIn = 0.05 + world.rnd() * 0.35;
        m.volleyX = tx;
        m.volleyZ = tz;
      }
    }
  }
}

function moveCommander(world: MfWorld, cmd: MfUnit, input: MfInput, events: MfEvent[]) {
  const s = UNIT_STATS.commander;
  const len = Math.hypot(input.mx, input.mz);
  const k = len > 1 ? 1 / len : 1;
  const tvx = input.mx * k * s.speed;
  const tvz = input.mz * k * s.speed;
  const blend = Math.min(1, MF_DT * 12);
  cmd.vx += (tvx - cmd.vx) * blend;
  cmd.vz += (tvz - cmd.vz) * blend;
  const aim = Math.atan2(input.aimX - cmd.x, input.aimZ - cmd.z);
  if (Math.hypot(input.aimX - cmd.x, input.aimZ - cmd.z) > 0.3) cmd.facing = turnTowards(cmd.facing, aim, MF_DT * 14);
  if (input.strike && cmd.cd <= 0 && cmd.swing < 0) {
    cmd.swing = s.melee!.windup;
    cmd.cd = s.melee!.cooldown;
    cmd.act = 'swing';
    cmd.actT = 0;
    events.push({ t: 'swing', id: cmd.id });
  }
}

/** Where a unit would like to go and whom it fights, from its army's order. */
function think(world: MfWorld, u: MfUnit, cmd: MfUnit): { gx: number; gz: number; run: boolean; face: MfUnit | null } {
  const s = UNIT_STATS[u.kind];
  const ranged = s.ranged;
  const slot = { x: u.slotX, z: u.slotZ };
  const anchor = { x: u.anchorX, z: u.anchorZ };
  let target = u.target > 0 ? unitById(world, u.target) ?? null : null;
  if (target && !target.alive) target = null;

  u.retarget -= MF_DT;
  if (u.retarget <= 0 || !target) {
    u.retarget = 0.3;
    const attacker = u.hurtT < 1.5 ? unitById(world, u.hurtBy) : undefined;
    if (u.order === 'attack') {
      const focus = u.focus > 0 ? unitById(world, u.focus) : undefined;
      if (focus?.alive && dist(focus, cmd) < ARMY.attackLeash) target = focus;
      else {
        if (u.focus > 0 && !focus?.alive) u.focus = -1;
        target = nearestEnemy(world, u, u.team, ARMY.attackSearch, (e) => dist(e, cmd) < ARMY.attackLeash);
      }
    } else if (u.order === 'defend') {
      const zone = ARMY.defendRadius + (ranged ? ranged.range * 0.5 : 0);
      target = nearestEnemy(world, ranged ? u : anchor, u.team, ranged ? ranged.range : ARMY.defendRadius, (e) => dist(e, anchor) < zone);
    } else {
      // Follow: hold formation. Warriors only answer enemies at arm's length; mages shoot on the march.
      target = ranged ? nearestEnemy(world, u, u.team, ranged.range * 0.9) : nearestEnemy(world, u, u.team, ARMY.followEngage);
      if (!target && attacker?.alive && dist(attacker, u) < ARMY.followEngage + 1.5) target = attacker;
    }
  }
  u.target = target ? target.id : -1;

  const home = { x: u.slotX, z: u.slotZ };
  if (!target) return { gx: home.x, gz: home.z, run: u.order !== 'defend', face: null };

  const d = dist(u, target);
  const reach = (s.melee?.range ?? 0) + s.radius + UNIT_STATS[target.kind].radius;
  const breath = s.breath;
  if (breath) {
    // Dragons: swoop in close enough to burn, throwing fireballs on the way.
    if (u.order === 'attack') {
      if (d > breath.range * 0.7) return { gx: target.x, gz: target.z, run: true, face: null };
      return { gx: u.x, gz: u.z, run: false, face: target };
    }
    if (u.order === 'defend' && dist(target, slot) < ARMY.defendStepOut + breath.range) {
      const away = Math.max(0.01, d);
      return d > breath.range * 0.7 ? { gx: target.x - ((target.x - u.x) / away) * breath.range * 0.6, gz: target.z - ((target.z - u.z) / away) * breath.range * 0.6, run: false, face: target } : { gx: u.x, gz: u.z, run: false, face: target };
    }
    return { gx: home.x, gz: home.z, run: u.order === 'follow', face: target };
  }
  if (ranged) {
    // Mages: shoot when in range, back off from anyone too close, otherwise keep their place.
    if (u.order === 'attack') {
      if (d < ranged.keepAway) {
        const away = Math.max(0.01, d);
        return { gx: u.x + ((u.x - target.x) / away) * 3, gz: u.z + ((u.z - target.z) / away) * 3, run: true, face: target };
      }
      if (d > ranged.range * 0.92) return { gx: target.x, gz: target.z, run: true, face: null };
      return { gx: u.x, gz: u.z, run: false, face: target };
    }
    return { gx: home.x, gz: home.z, run: u.order === 'follow', face: target };
  }
  // Warriors: close in and strike.
  if (u.order === 'defend') {
    // Step out of the line only a little, then come back to it.
    if (dist(target, slot) > ARMY.defendStepOut + reach) return { gx: home.x, gz: home.z, run: false, face: target };
  }
  if (d <= reach) return { gx: u.x, gz: u.z, run: false, face: target };
  // Aim for the near side of the enemy so attackers spread around it instead of stacking.
  return { gx: target.x + ((u.x - target.x) / d) * reach * 0.8, gz: target.z + ((u.z - target.z) / d) * reach * 0.8, run: true, face: null };
}

function fight(world: MfWorld, u: MfUnit, events: MfEvent[]) {
  const s = UNIT_STATS[u.kind];
  if (u.target < 0 || u.cd > 0 || u.swing >= 0) return;
  const t = unitById(world, u.target);
  if (!t?.alive) return;
  const d = dist(u, t);
  const reach = (s.melee?.range ?? 0) + s.radius + UNIT_STATS[t.kind].radius;
  if (s.breath && d <= s.breath.range + UNIT_STATS[t.kind].radius) {
    // Fire breath: everyone in the cone in front of the dragon burns.
    u.facing = Math.atan2(t.x - u.x, t.z - u.z);
    for (const e of world.units) {
      if (!e.alive || e.team === u.team) continue;
      const de = dist(u, e);
      if (de > s.breath.range + UNIT_STATS[e.kind].radius) continue;
      const a = Math.abs(ANGLE(Math.atan2(e.x - u.x, e.z - u.z) - u.facing));
      if (a < s.breath.arc || de < s.radius + 0.6) damage(world, e, s.breath.damage, u.id, events);
    }
    u.cd = s.breath.cooldown * (0.9 + world.rnd() * 0.2);
    u.act = 'cast';
    u.actT = 0;
    events.push({ t: 'breath', id: u.id });
    return;
  }
  if (s.ranged && d <= s.ranged.range && d > reach) {
    // Lead the target a little: aim where it will be when the bolt lands.
    const time = d / s.ranged.speed;
    launch(world, u, t.x + t.vx * time * 0.8, t.z + t.vz * time * 0.8, s.ranged.damage, s.ranged.splash, s.ranged.speed, false);
    u.cd = s.ranged.cooldown * (0.9 + world.rnd() * 0.2);
    u.act = 'cast';
    u.actT = 0;
    events.push({ t: 'cast', id: u.id, volley: false });
  } else if (s.melee && d <= reach + 0.15) {
    u.swing = s.melee.windup;
    u.swingTarget = t.id;
    u.cd = s.melee.cooldown * (0.9 + world.rnd() * 0.2);
    u.act = 'swing';
    u.actT = 0;
    events.push({ t: 'swing', id: u.id });
  }
}

function landSwing(world: MfWorld, u: MfUnit, events: MfEvent[]) {
  const s = UNIT_STATS[u.kind];
  if (u.swing < 0) return;
  u.swing -= MF_DT;
  if (u.swing >= 0) return;
  u.swing = -1;
  if (u.kind === 'commander') {
    // The commander's sword sweeps an arc in front of him.
    for (const e of world.units) {
      if (!e.alive || e.team === u.team) continue;
      const d = dist(u, e);
      if (d > s.melee!.range + s.radius + UNIT_STATS[e.kind].radius) continue;
      const a = Math.abs(ANGLE(Math.atan2(e.x - u.x, e.z - u.z) - u.facing));
      if (a < 1) damage(world, e, s.melee!.damage, u.id, events);
    }
    return;
  }
  const t = unitById(world, u.swingTarget);
  if (!t?.alive) return;
  if (dist(u, t) <= s.melee!.range + s.radius + UNIT_STATS[t.kind].radius + 0.6) damage(world, t, s.melee!.damage, u.id, events);
}

function steer(world: MfWorld, u: MfUnit, gx: number, gz: number, run: boolean, obstacles: MfObstacle[]) {
  const s = UNIT_STATS[u.kind];
  let dx = gx - u.x;
  let dz = gz - u.z;
  const d = Math.hypot(dx, dz);
  let tvx = 0;
  let tvz = 0;
  if (d > 0.2) {
    const max = s.speed * (run && d > 2.5 ? ARMY.catchUp : 1);
    const sp = Math.min(max, d * 2.4);
    dx /= d;
    dz /= d;
    tvx = dx * sp;
    tvz = dz * sp;
    // Walk around trees and rocks in the way instead of pushing into them (flyers go over).
    for (const o of s.flying ? [] : obstacles) {
      const ox = o.x - u.x;
      const oz = o.z - u.z;
      const along = ox * dx + oz * dz;
      if (along < 0 || along > Math.min(d, 4) + o.r) continue;
      const side = ox * dz - oz * dx;
      const clear = o.r + s.radius + 0.35;
      if (Math.abs(side) > clear) continue;
      const dir = side > 0 ? -1 : 1;
      const push = (1 - Math.abs(side) / clear) * sp * 1.4;
      tvx += dz * dir * push;
      tvz += -dx * dir * push;
    }
    // Unstick: if a unit has not come closer for a while, try sliding sideways for a moment.
    if (d < u.lastGoal - 0.05) {
      u.lastGoal = d;
      u.stuck = 0;
    } else if (d > 1.5) {
      u.stuck += MF_DT;
      if (u.stuck > 0.8) {
        u.stuck = 0;
        u.lastGoal = d;
        u.nudge = world.rnd() < 0.5 ? -1 : 1;
        u.nudgeT = 0.6;
      }
    }
    if (u.nudgeT > 0) {
      u.nudgeT -= MF_DT;
      tvx += dz * u.nudge * sp * 0.9;
      tvz += -dx * u.nudge * sp * 0.9;
    }
  } else {
    u.lastGoal = Infinity;
    u.stuck = 0;
  }
  // Keep a little room from friends so the group spreads out instead of piling up.
  for (const o of world.units) {
    if (o === u || !o.alive || o.team !== u.team || UNIT_STATS[o.kind].flying !== s.flying) continue;
    const ox = u.x - o.x;
    const oz = u.z - o.z;
    const r = s.radius + UNIT_STATS[o.kind].radius + 0.45;
    const dd = ox * ox + oz * oz;
    if (dd >= r * r || dd < 1e-6) continue;
    const l = Math.sqrt(dd);
    const f = ((r - l) / r) * 3.2;
    tvx += (ox / l) * f;
    tvz += (oz / l) * f;
  }
  const blend = Math.min(1, MF_DT * 9);
  u.vx += (tvx - u.vx) * blend;
  u.vz += (tvz - u.vz) * blend;
  const sp = Math.hypot(u.vx, u.vz);
  const max = s.speed * ARMY.catchUp * 1.1;
  if (sp > max) {
    u.vx *= max / sp;
    u.vz *= max / sp;
  }
}

function integrate(world: MfWorld, obstacles: MfObstacle[], half: number) {
  for (const u of world.units) {
    if (!u.alive) continue;
    u.x += u.vx * MF_DT;
    u.z += u.vz * MF_DT;
  }
  // Solid bodies: nobody overlaps anybody, friend or foe.
  const live = world.units.filter((u) => u.alive);
  for (let i = 0; i < live.length; i++) {
    const a = live[i]!;
    const ra = UNIT_STATS[a.kind].radius;
    const fa = UNIT_STATS[a.kind].flying;
    for (let j = i + 1; j < live.length; j++) {
      const b = live[j]!;
      // Flyers only bump into other flyers.
      if (UNIT_STATS[b.kind].flying !== fa) continue;
      // A gate lets its own side through and never moves.
      const ga = a.kind === 'gate';
      const gb = b.kind === 'gate';
      if ((ga || gb) && (a.team === b.team || (ga && gb))) continue;
      const r = ra + UNIT_STATS[b.kind].radius;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const dd = dx * dx + dz * dz;
      if (dd >= r * r) continue;
      const l = Math.sqrt(dd) || 0.001;
      const push = (r - l) / 2;
      const nx = dd ? dx / l : 1;
      const nz = dd ? dz / l : 0;
      const ka = ga ? 0 : gb ? 2 : 1;
      const kb = gb ? 0 : ga ? 2 : 1;
      a.x -= nx * push * ka;
      a.z -= nz * push * ka;
      b.x += nx * push * kb;
      b.z += nz * push * kb;
    }
    for (const o of fa || a.kind === 'gate' ? [] : obstacles) {
      const dx = a.x - o.x;
      const dz = a.z - o.z;
      const r = o.r + ra;
      const dd = dx * dx + dz * dz;
      if (dd >= r * r) continue;
      const l = Math.sqrt(dd) || 0.001;
      a.x = o.x + (dx / l) * r;
      a.z = o.z + (dz / l) * r;
    }
    a.x = Math.max(-half, Math.min(half, a.x));
    a.z = Math.max(-half, Math.min(half, a.z));
  }
}

function flyProjectiles(world: MfWorld, obstacles: MfObstacle[], events: MfEvent[]) {
  const keep: MfProjectile[] = [];
  for (const p of world.projectiles) {
    p.age += MF_DT;
    p.vy -= MF_GRAVITY * MF_DT;
    p.x += p.vx * MF_DT;
    p.y += p.vy * MF_DT;
    p.z += p.vz * MF_DT;
    let hit: MfUnit | null = null;
    for (const u of world.units) {
      if (!u.alive || u.team === p.team) continue;
      const r = UNIT_STATS[u.kind].radius + 0.3;
      const body = UNIT_STATS[u.kind].flying ? Math.abs(p.y - MF_FLY_HEIGHT) < 1.3 : p.y < 2.3;
      if (body && Math.hypot(u.x - p.x, u.z - p.z) < r) {
        hit = u;
        break;
      }
    }
    const tree = obstacles.find((o) => p.y < (o.kind === 'rock' ? o.size * 1.2 : 6) && Math.hypot(o.x - p.x, o.z - p.z) < o.r * 0.8);
    if (!hit && !tree && p.y > 0 && p.age < 4) {
      keep.push(p);
      continue;
    }
    // Impact: full damage to a direct hit, splash to everyone else in the blast.
    if (hit) damage(world, hit, p.damage, p.owner, events);
    if (p.splash > 0) {
      for (const u of world.units) {
        if (!u.alive || u.team === p.team || u === hit) continue;
        const d = Math.hypot(u.x - p.x, u.z - p.z);
        if (d < p.splash) damage(world, u, p.damage * 0.45 * (1 - d / p.splash / 2), p.owner, events);
      }
    }
    events.push({ t: 'boom', x: p.x, y: Math.max(0, p.y), z: p.z, team: p.team, r: p.splash, volley: p.volley });
  }
  world.projectiles = keep;
}

function planFormation(world: MfWorld, army: MfArmy, cmd: MfUnit) {
  // The march heading follows where the commander walks, not where he looks, so turning to aim
  // never sends the whole army running around him.
  const sp = Math.hypot(cmd.vx, cmd.vz);
  if (sp > 1.2) army.heading = turnTowards(army.heading, Math.atan2(cmd.vx, cmd.vz), ARMY.headingTurnRate * MF_DT);
  const followers = world.units.filter((u) => u.alive && u.team === army.team && u.kind !== 'commander' && u.kind !== 'gate' && u.order !== 'defend');
  const groups = { warrior: [] as MfUnit[], mage: [] as MfUnit[], beast: [] as MfUnit[] };
  for (const u of followers) groups[u.kind as MfSoldierKind].push(u);
  const slots = followSlots(groups.warrior.length, groups.mage.length, groups.beast.length, army.formation);
  const c = Math.cos(army.heading);
  const s = Math.sin(army.heading);
  const toWorld = (p: { x: number; z: number }) => ({ x: cmd.x + p.x * c + p.z * s, z: cmd.z - p.x * s + p.z * c });
  const world3 = { warrior: slots.warrior.map(toWorld), mage: slots.mage.map(toWorld), beast: slots.beast.map(toWorld) };
  const key = `${army.formation}:${followers.map((u) => u.id).join(',')}`;
  const turned = Math.abs(ANGLE(army.heading - army.plannedHeading)) > ARMY.reassignTurn;
  if (key !== army.planKey || turned || followers.some((u) => !u.hasSlot)) {
    // Hand out places again: nearest soldier to each place, so nobody crosses the whole group.
    army.planKey = key;
    army.plannedHeading = army.heading;
    for (const k of ['warrior', 'mage', 'beast'] as const) assignSlots(groups[k], world3[k]);
  } else {
    // Same places, moved with the commander.
    for (const u of followers) {
      const p = world3[u.kind as MfSoldierKind][u.slotIndex];
      if (p) {
        u.slotX = p.x;
        u.slotZ = p.z;
      }
    }
  }
}

/** Advances the battle one step. Inputs are by team. Returns what happened, for effects and sounds. */
export function stepMagicWorld(world: MfWorld, inputs: Map<number, MfInput>): MfEvent[] {
  const events: MfEvent[] = [];
  if (world.over) return events;
  const map = magicMap(world.mode);
  world.tick++;
  world.time += MF_DT;

  for (const army of world.armies) {
    const cmd = unitById(world, army.commander)!;
    army.volleyCd = Math.max(0, army.volleyCd - MF_DT);
    army.warCry = Math.max(0, army.warCry - MF_DT);
    if (!cmd.alive) continue;
    const input = inputs.get(army.team) ?? { ...MF_NO_INPUT, aimX: cmd.x + Math.sin(cmd.facing) * 8, aimZ: cmd.z + Math.cos(cmd.facing) * 8 };
    applyCommand(world, army, input, events);
    moveCommander(world, cmd, input, events);
    planFormation(world, army, cmd);
  }

  for (const u of world.units) {
    u.actT += MF_DT;
    if (!u.alive) {
      u.deadFor += MF_DT;
      continue;
    }
    u.cd = Math.max(0, u.cd - MF_DT);
    u.hurtT += MF_DT;
    landSwing(world, u, events);
    if (u.kind === 'commander' || u.kind === 'gate') continue;
    const cmd = commanderOf(world, u.team);
    const plan = think(world, u, cmd);
    steer(world, u, plan.gx, plan.gz, plan.run, map.obstacles);
    const sp = Math.hypot(u.vx, u.vz);
    const want = plan.face ? Math.atan2(plan.face.x - u.x, plan.face.z - u.z) : sp > 0.4 ? Math.atan2(u.vx, u.vz) : u.order === 'defend' ? u.anchorDir : world.armies[u.team]!.heading;
    u.facing = turnTowards(u.facing, want, MF_DT * 8);
    if (u.volleyIn >= 0) {
      u.volleyIn -= MF_DT;
      if (u.volleyIn < 0) {
        const r = UNIT_STATS[u.kind].ranged!;
        u.facing = Math.atan2(u.volleyX - u.x, u.volleyZ - u.z);
        launch(world, u, u.volleyX, u.volleyZ, r.damage * ARMY.volleyDamage, ARMY.volleySplash, r.speed, true);
        u.cd = Math.max(u.cd, r.cooldown * 0.5);
        u.act = 'cast';
        u.actT = 0;
        events.push({ t: 'cast', id: u.id, volley: true });
      }
    } else {
      fight(world, u, events);
    }
  }

  integrate(world, map.obstacles, map.half);
  flyProjectiles(world, map.obstacles, events);

  if (world.mode === 'conquest') {
    conquestStep(world, events);
    return events;
  }
  // An army is beaten when its commander falls or it has no soldiers left.
  const beaten = world.armies.map((a) => {
    const cmd = unitById(world, a.commander)!;
    return !cmd.alive || !world.units.some((u) => u.alive && u.team === a.team && u.kind !== 'commander');
  });
  if (beaten.some(Boolean)) {
    world.over = true;
    world.winner = beaten[0] && beaten[1] ? -1 : beaten[0] ? 1 : 0;
    events.push({ t: 'end', winner: world.winner });
  }
  return events;
}
