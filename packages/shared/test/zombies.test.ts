import { describe, expect, it } from 'vitest';
import {
  DOORS,
  SHOP,
  ZOMBIE_DT,
  ZOMBIE_NO_INPUT,
  ZombieBot,
  addSurvivor,
  createZombieWorld,
  fortAt,
  mulberry32,
  stepZombieWorld,
  viewOf,
  waveZombies,
  type ZombieInput,
  type ZombieWorld,
} from '../src';

function run(world: ZombieWorld, seconds: number, skill = 0.8, seed = 3, extra?: (w: ZombieWorld) => void) {
  const rnd = mulberry32(seed);
  const bots = new Map<string, ZombieBot>();
  const log: Record<string, number> = {};
  for (let i = 0; i < seconds / ZOMBIE_DT && !world.over; i++) {
    extra?.(world);
    const inputs = new Map<string, ZombieInput>();
    const view = viewOf(world);
    for (const s of world.survivors) {
      if (!bots.has(s.id)) bots.set(s.id, new ZombieBot(skill, rnd));
      inputs.set(s.id, bots.get(s.id)!.step(view, s, world.survivors[0]!.id, ZOMBIE_DT));
    }
    for (const e of stepZombieWorld(world, inputs)) log[e.type] = (log[e.type] ?? 0) + 1;
  }
  return log;
}

describe('Zona Zombi rules', () => {
  it('scales the waves with every player', () => {
    expect(waveZombies(1, 2).length).toBe(2 * waveZombies(1, 1).length);
    expect(waveZombies(3, 1).filter((k) => k === 2).length).toBeGreaterThan(0);
  });

  for (const n of [1, 2, 4]) {
    it(`${n} bots fight waves until they all fall at once`, () => {
      const world = createZombieWorld(Array.from({ length: n }, (_, i) => `p${i}`), 11);
      const log = run(world, 900);
      console.log(n, { wave: world.wave, kills: world.kills, over: world.over, t: Math.round(world.t) }, log);
      expect(world.kills).toBeGreaterThan(10);
      expect(world.wave).toBeGreaterThanOrEqual(2);
      expect(log.merge ?? 0).toBeGreaterThan(0);
    });
  }

  it('a fallen player gets back up alone after a few seconds', () => {
    const world = createZombieWorld(['a', 'b'], 2);
    const b = world.survivors[1]!;
    b.hp = 0;
    b.action = 'down';
    for (let i = 0; i < 9 / ZOMBIE_DT; i++) stepZombieWorld(world, new Map());
    expect(b.action).not.toBe('down');
    expect(b.hp).toBeGreaterThan(0);
    expect(world.over).toBe(false);
  });

  it('ends when everyone is down at the same time', () => {
    const world = createZombieWorld(['a', 'b'], 2);
    for (const s of world.survivors) {
      s.hp = 0;
      s.action = 'down';
    }
    stepZombieWorld(world, new Map());
    expect(world.over).toBe(true);
  });

  it('lets a latecomer in with money for the waves they missed and more zombies', () => {
    const world = createZombieWorld(['a'], 4);
    run(world, 60);
    const before = world.queue.length;
    const s = addSurvivor(world, 'late');
    expect(world.survivors).toHaveLength(2);
    expect(s.money).toBeGreaterThan(60);
    if (world.phase === 'fight') expect(world.queue.length).toBeGreaterThan(before);
  });

  it('sells weapons and materials at the counter, barricades a door and drives a bought truck', () => {
    const world = createZombieWorld(['a'], 4);
    const s = world.survivors[0]!;
    s.money = 2000;
    const go = (x: number, z: number) => {
      s.x = x;
      s.z = z;
    };
    const step = (patch: Partial<ZombieInput>) => stepZombieWorld(world, new Map([['a', { ...ZOMBIE_NO_INPUT, ...patch }]]));
    go(32, 34.1);
    step({ buy: SHOP.findIndex((i) => i.id === 'w_motosierra') });
    step({ buy: SHOP.findIndex((i) => i.id === 'm_acero') });
    step({ buy: SHOP.findIndex((i) => i.id === 'v_camion') });
    step({ buy: SHOP.findIndex((i) => i.id === 'w_espada') });
    expect(s.wl[9]).toBe(1);
    expect(s.wl[1]).toBe(0);
    expect(s.mats[1]).toBe(1);
    expect(world.cars).toHaveLength(1);
    const door = DOORS.find((d) => d.fort === 'corporativo')!;
    go(door.in.x, door.in.z);
    expect(fortAt(s.x, s.z)).toBe('corporativo');
    step({ use: true });
    expect(world.doors[door.id]).toBeGreaterThan(0);
    const car = world.cars[0]!;
    go(car.x + 1.8, car.z);
    step({ use: true });
    expect(s.car).toBe(car.id);
    for (let i = 0; i < 20; i++) step({ mx: -1, mz: 0 });
    expect(Math.abs(car.v)).toBeGreaterThan(1);
    step({ use: true });
    expect(s.car).toBe(0);
  });
});
