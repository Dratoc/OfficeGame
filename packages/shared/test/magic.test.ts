import { describe, expect, it } from 'vitest';
import {
  ARMY,
  ARMY_SIZES,
  FORMATIONS,
  MF_DT,
  capacityOf,
  MF_NO_INPUT,
  MagicCommanderBot,
  UNIT_STATS,
  addArmy,
  armyCount,
  commanderOf,
  createMagicBattle,
  createMagicWorld,
  followSlots,
  stepMagicWorld,
  type MfInput,
  type MfWorld,
} from '../src';

const idle = (w: MfWorld, team: number): MfInput => {
  const c = commanderOf(w, team);
  return { ...MF_NO_INPUT, aimX: c.x + Math.sin(c.facing) * 8, aimZ: c.z + Math.cos(c.facing) * 8 };
};

function run(w: MfWorld, seconds: number, inputs: (w: MfWorld) => Map<number, MfInput>) {
  for (let i = 0; i < seconds / MF_DT && !w.over; i++) stepMagicWorld(w, inputs(w));
}

describe('Magic Frontiers', () => {
  it('builds slots for every soldier in every formation, mages behind the commander', () => {
    for (const shape of FORMATIONS) {
      const s = followSlots(26, 14, 2, shape);
      expect(s.warrior).toHaveLength(26);
      expect(s.mage).toHaveLength(14);
      expect(s.beast).toHaveLength(2);
      expect(s.mage.every((p) => p.z < 0)).toBe(true);
      // No two ground slots on top of each other, and nobody on the commander.
      const all = [...s.warrior, ...s.mage];
      for (let i = 0; i < all.length; i++) {
        expect(Math.hypot(all[i]!.x, all[i]!.z)).toBeGreaterThan(0.9);
        for (let j = i + 1; j < all.length; j++) expect(Math.hypot(all[i]!.x - all[j]!.x, all[i]!.z - all[j]!.z)).toBeGreaterThan(1.1);
      }
    }
  });

  it('army sizes fill the 50-unit cap at most', () => {
    for (const c of Object.values(ARMY_SIZES)) expect(capacityOf(c)).toBeLessThanOrEqual(ARMY.maxCapacity);
    expect(capacityOf(ARMY_SIZES.large)).toBe(ARMY.maxCapacity);
  });

  it('a dragon burns a group of warriors with its breath and flies over trees', () => {
    const w = createMagicWorld(9);
    addArmy(w, { name: 'A', warriors: 0, mages: 0, beasts: 1, x: 0, z: 0, facing: 0 });
    addArmy(w, { name: 'B', warriors: 5, mages: 0, beasts: 0, x: 0, z: 9, facing: Math.PI });
    const dragon = w.units.find((u) => u.kind === 'beast')!;
    stepMagicWorld(w, new Map([[0, { ...idle(w, 0), order: 'attack', aimX: 0, aimZ: 9 }]]));
    let burned = new Set<number>();
    for (let i = 0; i < 90; i++) {
      const ev = stepMagicWorld(w, new Map([[0, idle(w, 0)], [1, idle(w, 1)]]));
      for (const e of ev) if (e.t === 'hit' && e.by === dragon.id) burned.add(e.id);
    }
    expect(burned.size).toBeGreaterThanOrEqual(3);
    // Warriors take more from dragons than their base damage.
    const ev: number[] = [];
    const w2 = createMagicWorld(10);
    addArmy(w2, { name: 'A', warriors: 0, mages: 0, beasts: 1, x: 0, z: 0, facing: 0 });
    addArmy(w2, { name: 'B', warriors: 1, mages: 0, beasts: 0, x: 0, z: 4, facing: Math.PI });
    stepMagicWorld(w2, new Map([[0, { ...idle(w2, 0), order: 'attack', aimX: 0, aimZ: 4 }]]));
    for (let i = 0; i < 150; i++) for (const e of stepMagicWorld(w2, new Map([[0, idle(w2, 0)], [1, idle(w2, 1)]]))) if (e.t === 'hit' && e.id === w2.units.find((u) => u.kind === 'warrior')!.id) ev.push(e.amount);
    expect(ev).toContain(Math.round(UNIT_STATS.beast.breath!.damage * 1.5));
    burned = new Set();
  });

  it('runs a 50 against 50 battle fast enough for 30 steps a second', () => {
    const w = createMagicBattle(11, ARMY_SIZES.large, ARMY_SIZES.large);
    const bot0 = new MagicCommanderBot(0, 0.8, 1);
    const bot1 = new MagicCommanderBot(1, 0.8, 2);
    const t0 = performance.now();
    let steps = 0;
    for (; steps < 60 / MF_DT && !w.over; steps++) stepMagicWorld(w, new Map([[0, bot0.step(w)], [1, bot1.step(w)]]));
    const perStep = (performance.now() - t0) / steps;
    // A step every 33 ms: the rules must take only a small slice of it.
    expect(perStep).toBeLessThan(4);
  });

  it('the army follows the commander across the field and keeps its formation', () => {
    const w = createMagicWorld(1);
    addArmy(w, { name: 'A', warriors: 6, mages: 4, beasts: 0, x: 0, z: -40, facing: 0 });
    // Walk north for 8 seconds, then turn east for 6.
    run(w, 14, (w) => {
      const c = commanderOf(w, 0);
      const east = w.time > 8;
      return new Map([[0, { ...MF_NO_INPUT, mx: east ? 1 : 0, mz: east ? 0 : 1, aimX: c.x + (east ? 10 : 0), aimZ: c.z + (east ? 0 : 10) }]]);
    });
    run(w, 3, (w) => new Map([[0, idle(w, 0)]]));
    const c = commanderOf(w, 0);
    const soldiers = w.units.filter((u) => u.kind !== 'commander');
    for (const u of soldiers) {
      expect(Math.hypot(u.x - c.x, u.z - c.z)).toBeLessThan(9);
      expect(Math.hypot(u.x - u.slotX, u.z - u.slotZ)).toBeLessThan(1.5);
    }
    // Nobody overlaps.
    for (let i = 0; i < soldiers.length; i++)
      for (let j = i + 1; j < soldiers.length; j++) expect(Math.hypot(soldiers[i]!.x - soldiers[j]!.x, soldiers[i]!.z - soldiers[j]!.z)).toBeGreaterThan(0.8);
  });

  it('Attack sends everyone after the marked enemy, and they pick new targets when it falls', () => {
    const w = createMagicWorld(2);
    addArmy(w, { name: 'A', warriors: 6, mages: 4, beasts: 0, x: 0, z: 0, facing: 0 });
    addArmy(w, { name: 'B', warriors: 3, mages: 0, beasts: 0, x: 0, z: 16, facing: Math.PI });
    const enemyCmd = commanderOf(w, 1);
    const marked = w.units.find((u) => u.team === 1 && u.kind === 'warrior')!;
    stepMagicWorld(w, new Map([[0, { ...idle(w, 0), order: 'attack', aimX: marked.x, aimZ: marked.z }]]));
    expect(w.units.filter((u) => u.team === 0 && u.kind !== 'commander').every((u) => u.order === 'attack' && u.focus === marked.id)).toBe(true);
    // The enemy commander stays still and does nothing; the soldiers should wipe out its army.
    run(w, 40, (w) => new Map([[0, idle(w, 0)], [1, idle(w, 1)]]));
    expect(marked.alive).toBe(false);
    expect(w.over).toBe(true);
    expect(w.winner).toBe(0);
    expect(enemyCmd.alive || w.units.filter((u) => u.team === 1 && u.kind !== 'commander').every((u) => !u.alive)).toBe(true);
  });

  it('Defend holds the line: warriors do not chase enemies outside the zone', () => {
    const w = createMagicWorld(3);
    addArmy(w, { name: 'A', warriors: 6, mages: 0, beasts: 0, x: 0, z: 0, facing: 0 });
    addArmy(w, { name: 'B', warriors: 1, mages: 0, beasts: 0, x: 0, z: 30, facing: Math.PI });
    stepMagicWorld(w, new Map([[0, { ...idle(w, 0), order: 'defend', aimX: 0, aimZ: 10 }]]));
    // An enemy wanders at 16 m: well outside the defense zone.
    run(w, 6, (w) => {
      const e = w.units.find((u) => u.team === 1 && u.kind === 'warrior')!;
      e.x = 4;
      e.z = 16;
      return new Map([[0, idle(w, 0)], [1, idle(w, 1)]]);
    });
    for (const u of w.units.filter((u) => u.team === 0 && u.kind === 'warrior')) {
      expect(u.order).toBe('defend');
      expect(Math.hypot(u.x - u.slotX, u.z - u.slotZ)).toBeLessThan(1);
      expect(u.slotZ).toBeGreaterThan(1); // the line stands in front, towards the aim
    }
  });

  it('a magic volley flies in an arc from each mage and damages enemies at the aim point', () => {
    const w = createMagicWorld(4);
    addArmy(w, { name: 'A', warriors: 0, mages: 4, beasts: 0, x: 0, z: 0, facing: 0 });
    addArmy(w, { name: 'B', warriors: 4, mages: 0, beasts: 0, x: 0, z: 13, facing: Math.PI });
    const target = w.units.filter((u) => u.team === 1 && u.kind === 'warrior');
    const cx = target.reduce((a, u) => a + u.x, 0) / target.length;
    const cz = target.reduce((a, u) => a + u.z, 0) / target.length;
    let hits = 0;
    let peak = 0;
    const mages = w.units.filter((u) => u.team === 0 && u.kind === 'mage');
    for (let i = 0; i < 60; i++) {
      const input = i === 0 ? { ...idle(w, 0), volley: true, aimX: cx, aimZ: cz } : idle(w, 0);
      const ev = stepMagicWorld(w, new Map([[0, input], [1, idle(w, 1)]]));
      for (const p of w.projectiles) peak = Math.max(peak, p.y);
      hits += ev.filter((e) => e.t === 'hit' && mages.some((m) => m.id === e.by)).length;
    }
    expect(w.armies[0]!.volleyCd).toBeGreaterThan(ARMY.volleyCooldown - 3);
    expect(peak).toBeGreaterThan(2.5);
    expect(hits).toBeGreaterThan(3);
  });

  it('a full battle against the AI commander ends with a winner', () => {
    const w = createMagicBattle(5);
    const bot0 = new MagicCommanderBot(0, 0.8, 1);
    const bot1 = new MagicCommanderBot(1, 0.8, 2);
    run(w, 240, (w) => new Map([[0, bot0.step(w)], [1, bot1.step(w)]]));
    expect(w.over).toBe(true);
    expect([0, 1]).toContain(w.winner);
    const c = armyCount(w, w.winner);
    expect(c.warrior + c.mage).toBeGreaterThan(0);
    expect(UNIT_STATS.warrior.capacity * 6 + UNIT_STATS.mage.capacity * 4).toBeLessThanOrEqual(ARMY.maxCapacity);
  });
});
