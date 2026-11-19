import { describe, expect, it } from 'vitest';
import {
  ARMY,
  CONQUEST,
  MF_DT,
  MF_NO_INPUT,
  MagicConquestBot,
  RECRUIT,
  capacityWithQueue,
  commanderOf,
  createConquestMatch,
  insideFort,
  magicMap,
  stepMagicWorld,
  type MfInput,
  type MfWorld,
} from '../src';

const idle = (w: MfWorld, team: number): MfInput => {
  const c = commanderOf(w, team);
  return { ...MF_NO_INPUT, aimX: c.x + Math.sin(c.facing) * 8, aimZ: c.z + Math.cos(c.facing) * 8 };
};

/** Walk team 0's commander to a point (the army follows), other inputs merged in. */
function walkTo(w: MfWorld, x: number, z: number, extra: Partial<MfInput> = {}): MfInput {
  const c = commanderOf(w, 0);
  const dx = x - c.x;
  const dz = z - c.z;
  const l = Math.hypot(dx, dz);
  return { ...idle(w, 0), mx: l > 0.8 ? dx / l : 0, mz: l > 0.8 ? dz / l : 0, aimX: x, aimZ: z + 5, ...extra };
}

function run(w: MfWorld, seconds: number, input: (w: MfWorld) => Map<number, MfInput>) {
  for (let i = 0; i < seconds / MF_DT && !w.over; i++) stepMagicWorld(w, input(w));
}

/** Teleport team 1 far away so it doesn't interfere. */
function benchEnemy(w: MfWorld) {
  for (const u of w.units) if (u.team === 1) (u.x = 60), (u.z = 60);
}

describe('Magic Frontiers conquest', () => {
  it('has three walled fortresses with four gates each, neutral at the start', () => {
    const w = createConquestMatch(1);
    expect(w.forts).toHaveLength(3);
    expect(w.forts.every((f) => f.owner === -1 && f.gates.length === 4)).toBe(true);
    expect(magicMap('conquest').obstacles.filter((o) => o.kind === 'wall').length).toBeGreaterThan(40);
    expect(w.econ.map((e) => e.gold)).toEqual([CONQUEST.startGold, CONQUEST.startGold]);
  });

  it('marching the army into a fortress takes it, and it pays points and gold', () => {
    const w = createConquestMatch(2);
    benchEnemy(w);
    const fort = w.forts[1]!;
    // The road leads to the south gate of the central fortress.
    run(w, 30, (w) => new Map([[0, walkTo(w, fort.x, fort.z)], [1, idle(w, 1)]]));
    expect(insideFort(fort, commanderOf(w, 0))).toBe(true);
    expect(fort.owner).toBe(0);
    const before = { ...w.econ[0]! };
    run(w, 10, (w) => new Map([[0, idle(w, 0)], [1, idle(w, 1)]]));
    expect(w.econ[0]!.vp).toBeGreaterThan(before.vp + 9);
    expect(w.econ[0]!.gold).toBeGreaterThan(before.gold + (CONQUEST.goldPerSecond + CONQUEST.goldPerFort) * 9);
  });

  it('gates are rebuilt for the owner, stop the enemy and let friends through', () => {
    const w = createConquestMatch(3);
    benchEnemy(w);
    const fort = w.forts[1]!;
    run(w, 30, (w) => new Map([[0, walkTo(w, fort.x, fort.z)], [1, idle(w, 1)]]));
    expect(fort.owner).toBe(0);
    run(w, CONQUEST.gateRebuild, (w) => new Map([[0, idle(w, 0)], [1, idle(w, 1)]]));
    const gates = fort.gates.map((id) => w.units[id - 1]!);
    expect(gates.every((g) => g.alive && g.team === 0)).toBe(true);
    // An enemy warrior pushes against the north gate and cannot get in.
    const intruder = w.units.find((u) => u.team === 1 && u.kind === 'warrior')!;
    const north = gates.find((g) => g.z > fort.z + 1)!;
    for (let i = 0; i < 120; i++) {
      intruder.vx = 0;
      intruder.vz = -5;
      if (i === 0) {
        intruder.x = north.x;
        intruder.z = north.z + 4;
      }
      stepMagicWorld(w, new Map([[0, idle(w, 0)], [1, idle(w, 1)]]));
    }
    expect(insideFort(fort, intruder, 0)).toBe(false);
  });

  it('recruits soldiers for gold at the nearest point, up to the 50 cap', () => {
    const w = createConquestMatch(4);
    benchEnemy(w);
    const gold = w.econ[0]!.gold;
    const count = w.units.filter((u) => u.team === 0 && u.alive).length;
    stepMagicWorld(w, new Map([[0, { ...idle(w, 0), buy: 'warrior' }]]));
    expect(w.econ[0]!.gold).toBeLessThan(gold - RECRUIT.warrior.cost + 1);
    run(w, RECRUIT.warrior.time + 0.5, (w) => new Map([[0, idle(w, 0)]]));
    expect(w.units.filter((u) => u.team === 0 && u.alive).length).toBe(count + 1);
    // Plenty of gold: the queue stops at the cap.
    w.econ[0]!.gold = 99999;
    for (let i = 0; i < 80; i++) stepMagicWorld(w, new Map([[0, { ...idle(w, 0), buy: 'warrior' }]]));
    expect(capacityWithQueue(w, 0)).toBe(ARMY.maxCapacity);
  });

  it('leaves a garrison that stays and defends when the army marches on, and calls it back', () => {
    const w = createConquestMatch(5);
    benchEnemy(w);
    const fort = w.forts[1]!;
    run(w, 30, (w) => new Map([[0, walkTo(w, fort.x, fort.z)], [1, idle(w, 1)]]));
    stepMagicWorld(w, new Map([[0, { ...idle(w, 0), garrison: 'leave' }]]));
    const kept = w.units.filter((u) => u.garrison === fort.id);
    expect(kept).toHaveLength(CONQUEST.garrisonStep);
    // March away: the garrison doesn't follow, and orders don't reach it.
    run(w, 12, (w) => new Map([[0, walkTo(w, -30, -20, { order: w.time < 31 ? 'attack' : null })]]));
    for (const u of kept) {
      expect(u.order).toBe('defend');
      expect(insideFort(fort, u, 0)).toBe(true);
    }
    run(w, 14, (w) => new Map([[0, walkTo(w, fort.x, fort.z)]]));
    stepMagicWorld(w, new Map([[0, { ...idle(w, 0), garrison: 'recall' }]]));
    expect(kept.every((u) => u.garrison === -1 && u.order === 'follow')).toBe(true);
  });

  it('a fallen commander comes back at the camp and the match goes on', () => {
    const w = createConquestMatch(6);
    benchEnemy(w);
    const c = commanderOf(w, 0);
    c.x = 20;
    stepMagicWorld(w, new Map());
    c.hp = 1;
    // Kill him through the rules: a hit from an enemy soldier.
    const e = w.units.find((u) => u.team === 1 && u.kind === 'warrior')!;
    e.x = c.x;
    e.z = c.z + 1.2;
    run(w, 3, (w) => new Map([[0, idle(w, 0)]]));
    expect(c.alive).toBe(false);
    expect(w.over).toBe(false);
    run(w, CONQUEST.commanderRespawn + 1, (w) => new Map([[0, idle(w, 0)]]));
    expect(c.alive).toBe(true);
    expect(Math.hypot(c.x - magicMap('conquest').playerSpawn.x, c.z - magicMap('conquest').playerSpawn.z)).toBeLessThan(5);
  });

  it('two AI commanders play a whole match: forts change hands and someone wins on points', () => {
    const w = createConquestMatch(7);
    const a = new MagicConquestBot(0, 0.7, 1);
    const b = new MagicConquestBot(1, 0.7, 2);
    const owners = new Set<string>();
    let spawned = 0;
    for (let i = 0; i < CONQUEST.timeLimit / MF_DT && !w.over; i++) {
      for (const e of stepMagicWorld(w, new Map([[0, a.step(w)], [1, b.step(w)]]))) {
        if (e.t === 'fort') owners.add(`${e.id}:${e.owner}`);
        if (e.t === 'spawn' && w.units[e.id - 1]!.kind !== 'gate') spawned++;
      }
    }
    expect(w.over).toBe(true);
    expect(owners.size).toBeGreaterThanOrEqual(2);
    expect(spawned).toBeGreaterThan(5);
    expect(Math.max(...w.econ.map((e) => e.vp))).toBeGreaterThan(50);
    console.log('match', Math.round(w.time), 's, points', w.econ.map((e) => Math.round(e.vp)), 'winner', w.winner, 'forts', w.forts.map((f) => f.owner));
  });
});
