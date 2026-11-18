import { describe, expect, it } from 'vitest';
import { SALES_DT, SalesBot, createSalesWorld, moveWorker, mulberry32, stepSales, type SalesInput, type SalesWorld } from '../src';

function run(players: number, seconds: number, skill = 0.8, seed = 7) {
  const ids = Array.from({ length: players }, (_, i) => `p${i}`);
  const world = createSalesWorld(ids, seed);
  const rnd = mulberry32(seed);
  const bots = ids.map(() => new SalesBot(skill, rnd));
  const log: string[] = [];
  for (let i = 0; i < seconds / SALES_DT && !world.over; i++) {
    const inputs = new Map<string, SalesInput>();
    world.workers.forEach((w, k) => {
      const input = bots[k]!.step(world, w, world.workers, SALES_DT);
      moveWorker(w, input);
      inputs.set(w.id, input);
    });
    for (const e of stepSales(world, inputs)) if (e.type !== 'nope') log.push(`${world.t.toFixed(1)} ${e.type} ${e.by} #${e.order ?? ''} ${e.n ?? ''} ${e.text ?? ''}`);
  }
  return { world, log };
}

const summary = (w: SalesWorld) => ({ day: w.day, score: w.score, served: w.served, lost: w.lost, over: w.over, t: Math.round(w.t) });

describe('A Toda Máquina rules', () => {
  for (const n of [1, 2, 3, 4]) {
    it(`a team of ${n} bots serves customers and reaches the first goal`, () => {
      const { world, log } = run(n, 600);
      if (process.env.SALES_LOG) console.log(n, summary(world), log.filter((l) => /served|wrong|lost|goal|over/.test(l)).join('\n'));
      else console.log(n, summary(world));
      expect(world.served).toBeGreaterThan(3);
      expect(world.day).toBeGreaterThan(1);
    });
  }
});
