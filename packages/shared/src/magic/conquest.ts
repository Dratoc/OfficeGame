import { ARMY, CONQUEST, CONQUEST_START, MF_DT, RECRUIT, UNIT_STATS, type MfSoldierKind } from './config';
import { magicMap } from './map';
import {
  addArmy,
  armyCapacityUsed,
  commanderOf,
  createMagicWorld,
  makeGate,
  spawnUnit,
  unitById,
  type MfArmy,
  type MfEvent,
  type MfInput,
  type MfUnit,
  type MfWorld,
} from './world';

/**
 * Conquest: three fortresses across the valley. Holding one gives victory points and gold every
 * second and makes it a recruitment center. Gates stop the enemy, can be broken and are rebuilt
 * after a while. Soldiers can be left behind as a garrison that defends on its own.
 */

/** A conquest match: both armies at their camps, three neutral fortresses in the middle. */
export function createConquestMatch(seed: number, start = CONQUEST_START): MfWorld {
  const map = magicMap('conquest');
  const w = createMagicWorld(seed, 'conquest');
  addArmy(w, { name: 'Tu ejército', ...start, ...map.playerSpawn });
  addArmy(w, { name: 'Ejército de la Frontera Roja', ...start, ...map.enemyCamp });
  w.econ = [0, 1].map(() => ({ gold: CONQUEST.startGold, vp: 0, queue: [], respawn: 0 }));
  w.forts = map.forts.map((f, id) => ({
    id,
    name: f.name,
    x: f.x,
    z: f.z,
    half: f.half,
    owner: -1,
    capture: 0,
    contested: false,
    gates: f.gates.map((g) => makeGate(w, g.x, g.z, Math.atan2(g.x - f.x, g.z - f.z)).id),
  }));
  return w;
}

export function insideFort(f: { x: number; z: number; half: number }, p: { x: number; z: number }, margin = 0.6) {
  return Math.abs(p.x - f.x) < f.half - margin && Math.abs(p.z - f.z) < f.half - margin;
}

/** Where a side trains soldiers: its camp and every fortress it holds. Index -1 is the camp. */
export function recruitPoints(world: MfWorld, team: number): { at: number; x: number; z: number }[] {
  const map = magicMap('conquest');
  const camp = team === 0 ? map.playerSpawn : map.enemyCamp;
  return [{ at: -1, x: camp.x, z: camp.z }, ...world.forts.filter((f) => f.owner === team).map((f) => ({ at: f.id, x: f.x, z: f.z }))];
}

/** Places used plus places already being trained, for the 50 cap. */
export function capacityWithQueue(world: MfWorld, team: number) {
  return armyCapacityUsed(world, team) + world.econ[team]!.queue.reduce((n, q) => n + UNIT_STATS[q.kind].capacity, 0);
}

/** Train one soldier at the recruitment point nearest to the commander. */
export function recruit(world: MfWorld, team: number, kind: MfSoldierKind, events: MfEvent[]): boolean {
  const econ = world.econ[team]!;
  const price = RECRUIT[kind];
  if (econ.gold < price.cost) {
    events.push({ t: 'denied', team, reason: 'No alcanza el oro' });
    return false;
  }
  if (capacityWithQueue(world, team) + UNIT_STATS[kind].capacity > ARMY.maxCapacity) {
    events.push({ t: 'denied', team, reason: `El ejército ya ocupa sus ${ARMY.maxCapacity} lugares` });
    return false;
  }
  const cmd = commanderOf(world, team);
  const points = recruitPoints(world, team);
  const at = points.reduce((best, p) => (Math.hypot(p.x - cmd.x, p.z - cmd.z) < Math.hypot(best.x - cmd.x, best.z - cmd.z) ? p : best), points[0]!);
  econ.gold -= price.cost;
  econ.queue.push({ kind, at: at.at, left: price.time, total: price.time });
  events.push({ t: 'recruit', team, kind, at: at.at });
  return true;
}

/** The fortress the commander stands in, if his side holds it. */
function fortUnderCommander(world: MfWorld, team: number) {
  const cmd = commanderOf(world, team);
  return world.forts.find((f) => f.owner === team && insideFort(f, cmd, 0)) ?? null;
}

/** Spread a fortress's garrison on a ring inside the walls, facing out. */
function placeGarrison(world: MfWorld, fortId: number) {
  const f = world.forts[fortId]!;
  const units = world.units.filter((u) => u.alive && u.garrison === fortId);
  units.forEach((u, i) => {
    const a = (i / Math.max(1, units.length)) * Math.PI * 2;
    const r = u.kind === 'warrior' ? f.half - 2.2 : f.half - 4.5;
    u.order = 'defend';
    u.slotX = f.x + Math.sin(a) * r;
    u.slotZ = f.z + Math.cos(a) * r;
    u.hasSlot = true;
    u.anchorX = f.x;
    u.anchorZ = f.z;
    u.anchorDir = a;
    u.focus = -1;
  });
}

/** Leave `n` soldiers (from the selected group) in the fortress, or call its garrison back. */
export function garrison(world: MfWorld, army: MfArmy, mode: 'leave' | 'recall', events: MfEvent[], n: number = CONQUEST.garrisonStep): number {
  const fort = fortUnderCommander(world, army.team);
  if (!fort) {
    events.push({ t: 'denied', team: army.team, reason: 'Entra en una fortaleza tuya para dejar o recoger tropas' });
    return 0;
  }
  const cmd = commanderOf(world, army.team);
  if (mode === 'recall') {
    const back = world.units.filter((u) => u.alive && u.garrison === fort.id && u.team === army.team);
    for (const u of back) {
      u.garrison = -1;
      u.order = 'follow';
      u.hasSlot = false;
    }
    army.planKey = '';
    events.push({ t: 'garrison', team: army.team, fort: fort.id, n: back.length, recall: true });
    return back.length;
  }
  const pool = world.units
    .filter((u) => u.alive && u.team === army.team && u.garrison < 0 && u.kind !== 'commander' && u.kind !== 'gate' && (army.selection === 'all' || u.kind === army.selection))
    .sort((a, b) => Math.hypot(a.x - cmd.x, a.z - cmd.z) - Math.hypot(b.x - cmd.x, b.z - cmd.z))
    .slice(0, n);
  for (const u of pool) u.garrison = fort.id;
  placeGarrison(world, fort.id);
  army.planKey = '';
  events.push({ t: 'garrison', team: army.team, fort: fort.id, n: pool.length, recall: false });
  return pool.length;
}

export function applyEconomyInput(world: MfWorld, army: MfArmy, input: MfInput, events: MfEvent[]) {
  if (input.buy) recruit(world, army.team, input.buy, events);
  if (input.garrison) garrison(world, army, input.garrison, events);
}

/** Gold for kills, and the commander's trip back to camp. */
export function onUnitDeath(world: MfWorld, u: MfUnit, killer: MfUnit | undefined) {
  if (killer && killer.team !== u.team && killer.team >= 0 && u.kind !== 'gate') {
    const econ = world.econ[killer.team];
    if (econ) econ.gold += u.kind === 'commander' ? CONQUEST.goldPerCommander : CONQUEST.goldPerKill * UNIT_STATS[u.kind].capacity;
  }
  if (u.kind === 'commander') world.econ[u.team]!.respawn = CONQUEST.commanderRespawn;
}

function setOwner(world: MfWorld, fortId: number, owner: number, events: MfEvent[]) {
  const f = world.forts[fortId]!;
  const from = f.owner;
  f.owner = owner;
  // The gates change hands broken, and the new owner rebuilds them.
  for (const id of f.gates) {
    const g = unitById(world, id)!;
    g.team = owner;
    g.alive = false;
    g.hp = 0;
    g.deadFor = owner >= 0 ? CONQUEST.gateRebuild * 0.6 : 0;
  }
  // A garrison whose fortress fell keeps fighting there, but it can be called back.
  events.push({ t: 'fort', id: fortId, owner, from });
}

/** Capture, points, gold, training, gates and the end of the match. Runs after the battle step. */
export function conquestStep(world: MfWorld, events: MfEvent[]) {
  const map = magicMap('conquest');
  for (const f of world.forts) {
    const count = [0, 0];
    for (const u of world.units) {
      if (!u.alive || u.team < 0 || u.kind === 'gate' || UNIT_STATS[u.kind].flying) continue;
      if (insideFort(f, u)) count[u.team]!++;
    }
    const [a, b] = count as [number, number];
    f.contested = a > 0 && b > 0;
    const rate = (n: number) => (MF_DT / CONQUEST.captureTime) * Math.min(2, 1 + 0.15 * (n - 1));
    if (a > 0 && b === 0) f.capture = Math.min(1, f.capture + rate(a));
    else if (b > 0 && a === 0) f.capture = Math.max(-1, f.capture - rate(b));
    else if (!f.contested) {
      // Nobody inside: the flag slowly goes back to whoever holds it.
      const rest = f.owner === 0 ? 1 : f.owner === 1 ? -1 : 0;
      const step = (MF_DT / CONQUEST.captureTime) * 0.5;
      f.capture = f.capture < rest ? Math.min(rest, f.capture + step) : Math.max(rest, f.capture - step);
    }
    if (f.owner !== 0 && f.capture >= 1) setOwner(world, f.id, 0, events);
    else if (f.owner !== 1 && f.capture <= -1) setOwner(world, f.id, 1, events);
    else if ((f.owner === 0 && f.capture <= 0) || (f.owner === 1 && f.capture >= 0)) setOwner(world, f.id, -1, events);

    // Gates are rebuilt after a while, as long as no enemy is right there.
    for (const id of f.gates) {
      const g = unitById(world, id)!;
      if (g.alive || f.owner < 0) continue;
      if (g.deadFor < CONQUEST.gateRebuild) continue;
      const enemyNear = world.units.some((u) => u.alive && u.team >= 0 && u.team !== f.owner && u.kind !== 'gate' && Math.hypot(u.x - g.x, u.z - g.z) < 5);
      if (enemyNear) continue;
      g.alive = true;
      g.hp = g.maxHp;
      events.push({ t: 'spawn', id: g.id });
    }
  }

  for (let team = 0; team < world.econ.length; team++) {
    const econ = world.econ[team]!;
    const held = world.forts.filter((f) => f.owner === team).length;
    econ.vp += held * CONQUEST.vpPerFort * MF_DT;
    econ.gold += (CONQUEST.goldPerSecond + held * CONQUEST.goldPerFort) * MF_DT;

    // Training: one soldier at a time; it appears at its fortress (or the camp) and joins the army.
    const next = econ.queue[0];
    if (next) {
      next.left -= MF_DT;
      if (next.left <= 0) {
        econ.queue.shift();
        const points = recruitPoints(world, team);
        const at = points.find((p) => p.at === next.at) ?? points[0]!;
        const a = world.rnd() * Math.PI * 2;
        const u = spawnUnit(world, team, next.kind, at.x + Math.sin(a) * 1.5, at.z + Math.cos(a) * 1.5);
        events.push({ t: 'spawn', id: u.id });
      }
    }

    // The fallen commander rides back into camp.
    if (econ.respawn > 0) {
      econ.respawn -= MF_DT;
      if (econ.respawn <= 0) {
        econ.respawn = 0;
        const cmd = commanderOf(world, team);
        const camp = team === 0 ? map.playerSpawn : map.enemyCamp;
        cmd.alive = true;
        cmd.hp = cmd.maxHp;
        cmd.x = camp.x;
        cmd.z = camp.z;
        cmd.vx = cmd.vz = 0;
        cmd.deadFor = 0;
        events.push({ t: 'respawn', id: cmd.id });
      }
    }
  }

  const [p0, p1] = world.econ.map((e) => e.vp) as [number, number];
  const target = CONQUEST.victoryPoints;
  if (p0 >= target || p1 >= target || world.time >= CONQUEST.timeLimit) {
    world.over = true;
    world.winner = p0 === p1 ? -1 : p0 > p1 ? 0 : 1;
    events.push({ t: 'end', winner: world.winner });
  }
}
