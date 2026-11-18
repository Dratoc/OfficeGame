import { describe, expect, it } from 'vitest';
import {
  CHAIRS,
  CHAIRS_DT,
  CHAIRS_LAPS,
  CHAIRS_NO_INPUT,
  ChairBot,
  TRACK,
  compareKarts,
  createChairsWorld,
  createKart,
  locate,
  mulberry32,
  pointAt,
  resolveChairs,
  standings,
  stepKart,
  type ChairsInput,
  type Kart,
} from '../src';

const input = (over: Partial<ChairsInput> = {}): ChairsInput => ({ ...CHAIRS_NO_INPUT, ...over });

/** Puts a chair on the track at distance s, looking along it, already rolling. */
function placed(id: string, s: number, side = 0, v = 0): Kart {
  const k = createKart(id, 0);
  const p = pointAt(TRACK, s, side);
  k.x = p.x;
  k.z = p.z;
  k.h = Math.atan2(p.tz, p.tx);
  k.i = locate(TRACK, p.x, p.z).i;
  k.prog = s;
  k.v = v;
  return k;
}

describe('chair race track', () => {
  it('is a closed loop whose parts never come close enough to jump a partition', () => {
    const s = TRACK.samples;
    let closest = Infinity;
    for (let i = 0; i < s.length; i += 2) {
      for (let j = i + 1; j < s.length; j += 2) {
        const arc = Math.min(Math.abs(s[i]!.s - s[j]!.s), TRACK.length - Math.abs(s[i]!.s - s[j]!.s));
        if (arc < 25) continue;
        closest = Math.min(closest, Math.hypot(s[i]!.x - s[j]!.x, s[i]!.z - s[j]!.z));
      }
    }
    expect(closest).toBeGreaterThan(TRACK.halfWidth * 2 + 3);
    expect(TRACK.length).toBeGreaterThan(120);
  });

  it('starts everyone on the grid behind the line, in different spots', () => {
    const karts = [0, 1, 2, 3].map((i) => createKart(`k${i}`, i));
    for (const k of karts) {
      expect(k.prog).toBeLessThan(0);
      expect(Math.abs(locate(TRACK, k.x, k.z).side)).toBeLessThan(TRACK.halfWidth - CHAIRS.radius);
    }
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) expect(Math.hypot(karts[i]!.x - karts[j]!.x, karts[i]!.z - karts[j]!.z)).toBeGreaterThan(CHAIRS.radius * 2);
  });
});

describe('chair physics', () => {
  it('accelerates up to top speed and the partitions keep you on the track', () => {
    const k = createKart('a', 0);
    for (let i = 0; i < 30 * 8; i++) {
      stepKart(k, input({ thr: 1 }));
      expect(Math.abs(locate(TRACK, k.x, k.z).side)).toBeLessThanOrEqual(TRACK.halfWidth - CHAIRS.radius + 0.05);
      expect(k.v).toBeLessThanOrEqual(CHAIRS.maxSpeed + 1e-9);
    }
    // Driving straight without steering ends up scraping a wall at the first turn.
    expect(k.prog).toBeGreaterThan(10);
  });

  it('throws only straight ahead, and a hit spins the target and gives the thrower a turbo', () => {
    const shooter = placed('a', 10, 0, 8);
    const target = placed('b', 20, 0, 8);
    const world = createChairsWorld([shooter, target]);
    stepKart(shooter, input({ thr: 1, fire: true }));
    stepKart(target, input({ thr: 1 }));
    let events = resolveChairs(world);
    expect(events.some((e) => e.type === 'fire' && e.by === 'a')).toBe(true);
    const ball = world.balls[0]!;
    // Along the chair's heading.
    expect((ball.vx * Math.cos(shooter.h) + ball.vz * Math.sin(shooter.h)) / Math.hypot(ball.vx, ball.vz)).toBeCloseTo(1, 5);
    let hit = false;
    for (let i = 0; i < 40 && !hit; i++) {
      stepKart(shooter, input({ thr: 1 }));
      stepKart(target, input({ thr: 1 }));
      events = resolveChairs(world);
      hit = events.some((e) => e.type === 'hit' && e.by === 'a' && e.target === 'b');
    }
    expect(hit).toBe(true);
    expect(shooter.boostT).toBeGreaterThan(CHAIRS.boost.seconds - 0.1);
    expect(shooter.hits).toBe(1);
    expect(target.spinT).toBeGreaterThan(0);
    expect(target.taken).toBe(1);
    // With the turbo the thrower goes beyond the normal top speed.
    for (let i = 0; i < 30; i++) stepKart(shooter, input({ thr: 1 }));
    expect(shooter.v).toBeGreaterThan(CHAIRS.maxSpeed);
  });

  it('cannot hit someone behind: the leader can only dodge', () => {
    const leader = placed('a', 30, 0, 8);
    const chaser = placed('b', 22, 0, 8);
    const world = createChairsWorld([leader, chaser]);
    for (let i = 0; i < 45; i++) {
      stepKart(leader, input({ thr: 1, fire: true }));
      stepKart(chaser, input({ thr: 1 }));
      const events = resolveChairs(world);
      expect(events.some((e) => e.type === 'hit')).toBe(false);
    }
    expect(leader.shots).toBeGreaterThan(0);
  });

  it('a sideways hop lets a paper ball fly underneath', () => {
    const shooter = placed('a', 10, 0, 0);
    const target = placed('b', 13, 0, 0);
    const world = createChairsWorld([shooter, target]);
    stepKart(shooter, input({ fire: true }));
    stepKart(target, input({ hop: 1 }));
    resolveChairs(world);
    expect(target.hopT).toBeGreaterThan(0);
    for (let i = 0; i < 8; i++) {
      stepKart(shooter, input());
      stepKart(target, input());
      const events = resolveChairs(world);
      expect(events.some((e) => e.type === 'hit')).toBe(false);
    }
    expect(target.hops).toBe(1);
    // And the hop has a cooldown.
    stepKart(target, input({ hop: -1 }));
    expect(target.hops).toBe(1);
  });

  it('bots finish all the laps and the standings follow the finish order', () => {
    const rnd = mulberry32(42);
    const karts = [0, 1, 2, 3].map((i) => createKart(`k${i}`, i));
    const bots = karts.map((_, i) => new ChairBot([0.3, 0.5, 0.7, 0.95][i], rnd));
    const world = createChairsWorld(karts);
    let hits = 0;
    for (let t = 0; t < 30 * 120 && !karts.every((k) => k.done); t++) {
      karts.forEach((k, i) => stepKart(k, bots[i]!.step(k, karts.filter((o) => o !== k), world.balls, CHAIRS_DT)));
      hits += resolveChairs(world).filter((e) => e.type === 'hit').length;
    }
    expect(karts.every((k) => k.done > 0 && k.lap === CHAIRS_LAPS)).toBe(true);
    expect(hits).toBeGreaterThan(0);
    const order = standings(karts);
    const byFinish = [...karts].sort((a, b) => a.done - b.done).map((k) => k.id);
    expect(order).toEqual(byFinish);
    expect(compareKarts(karts.find((k) => k.id === order[0])!, karts.find((k) => k.id === order[3])!)).toBeGreaterThan(0);
  });
});
