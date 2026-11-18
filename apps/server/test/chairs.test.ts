import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { CHAIRS_CLOSE_MS, CHAIRS_DT, CHAIRS_TICK_MS, ChairBot, mulberry32, type ChairsFrame, type ChairsInput, type MatchSummaryDto } from '@inbox/shared';
import { buildApp } from '../src/app';
import { attachSocket } from '../src/realtime/socket';
import { syncCatalog } from '../src/lib/catalog';
import { prisma } from '../src/lib/db';
import { chairsMode } from '../src/modes/chairs';

let base = '';
let app: Awaited<ReturnType<typeof buildApp>>;
const sfx = Math.random().toString(36).slice(2, 7);

async function register(name: string) {
  const res = await fetch(base + '/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${name}@test.dev`, username: name, password: 'contraseña-segura' }),
  });
  expect(res.status).toBe(200);
  return { cookie: res.headers.get('set-cookie')!.split(';')[0]! };
}
const socketFor = (cookie: string) =>
  new Promise<Socket>((resolve, reject) => {
    const s = connect(base, { extraHeaders: { cookie }, transports: ['websocket'] });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  app = await buildApp();
  await syncCatalog();
  attachSocket(app.server);
  await app.listen({ port: 0, host: '127.0.0.1' });
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('chair race mode', () => {
  it('runs a whole race on the server: bots finish in order and the rest get the closing time', () => {
    const ids = ['a', 'b', 'c'];
    const state = chairsMode.createState(1, ids);
    const rnd = mulberry32(9);
    const bots = new Map(ids.map((id, i) => [id, new ChairBot([0.95, 0.6, 0.3][i], rnd)]));
    const startAt = 1_000_000;
    const endAt = startAt + chairsMode.durationMs;
    let now = startAt;
    let seq = 0;
    let finished = false;
    // Player c stops racing halfway: the race closes 15 s after the first one finishes.
    while (now < endAt && !finished) {
      now += CHAIRS_TICK_MS;
      seq++;
      for (const id of ids) {
        const k = state.karts.get(id)!;
        const input = bots.get(id)!.step(k, [...state.karts.values()].filter((o) => o !== k), state.world.balls, CHAIRS_DT);
        const stopped = id === 'c' && k.prog > 200;
        chairsMode.applyAction(state, id, { inputs: [{ ...input, seq, thr: stopped ? 0 : input.thr }] }, { now, startAt, endAt });
      }
      chairsMode.tick!(state, { now, startAt, endAt, activeIds: ids });
      finished = chairsMode.isDone!(state, ids);
    }
    expect(finished).toBe(true);
    const a = state.karts.get('a')!;
    const b = state.karts.get('b')!;
    const c = state.karts.get('c')!;
    expect(a.done || b.done).toBeTruthy();
    expect(c.done).toBe(0);
    // It ended at the closing time, not when the clock ran out.
    expect(state.closeAtMs).not.toBeNull();
    expect(state.simulatedMs).toBeGreaterThanOrEqual(state.closeAtMs!);
    expect(state.closeAtMs! - CHAIRS_CLOSE_MS).toBeLessThan(chairsMode.durationMs);
    expect(chairsMode.compare(state, 'c', 'a')).toBeLessThan(0);
    expect(chairsMode.compare(state, 'c', 'b')).toBeLessThan(0);
    const out = chairsMode.outcome(state, 'a');
    expect(out.correctChars).toBe(3);
    expect(out.correctWords).toBe(a.hits);
  });

  it('ignores resent input steps and only uses one step per tick', () => {
    const state = chairsMode.createState(1, ['a', 'b']);
    const startAt = 0;
    const endAt = 120_000;
    const step = (seq: number): ChairsInput => ({ seq, steer: 0, thr: 1, fire: false, hop: 0 });
    chairsMode.applyAction(state, 'a', { inputs: [step(1), step(2), step(3)] }, { now: 10, startAt, endAt });
    chairsMode.applyAction(state, 'a', { inputs: [step(2), step(3)] }, { now: 10, startAt, endAt });
    expect(state.queues.get('a')).toHaveLength(3);
    chairsMode.tick!(state, { now: CHAIRS_TICK_MS + 1, startAt, endAt, activeIds: ['a', 'b'] });
    expect(state.ack.get('a')).toBe(1);
    expect(state.queues.get('a')).toHaveLength(2);
  });
});

describe('chair race rooms', () => {
  it('a host opens a chair race room, switches modes, a friend joins and the race runs on the server', async () => {
    const users = await Promise.all(['ch1', 'ch2'].map((n) => register(`${n}_${sfx}`)));
    const [host, guest] = (await Promise.all(users.map((u) => socketFor(u.cookie)))) as [Socket, Socket];
    const states: any[] = [];
    host.on('lobby:state', (st: any) => st && states.push(st));
    const created = await host.emitWithAck('lobby:create', { mode: 'chairs' });
    expect(created.ok).toBe(true);
    await sleep(100);
    expect(states.at(-1).mode).toBe('chairs');

    // Only the host can change the mode.
    host.emit('lobby:mode', { mode: 'office' });
    await sleep(100);
    expect(states.at(-1).mode).toBe('office');
    host.emit('lobby:mode', { mode: 'chairs' });
    expect(await guest.emitWithAck('lobby:join', { code: created.code })).toEqual({ ok: true });
    guest.emit('lobby:mode', { mode: 'office' });
    await sleep(150);
    expect(states.at(-1).mode).toBe('chairs');
    expect(states.at(-1).members).toHaveLength(2);

    const started = [host, guest].map((s) => new Promise<any>((r) => s.once('lobby:started', r)));
    expect(await host.emitWithAck('lobby:start')).toEqual({ ok: true });
    const [s1] = await Promise.all(started);
    expect(s1.mode).toBe('chairs');
    const matchId = s1.matchId as string;
    expect((await prisma.match.findUniqueOrThrow({ where: { id: matchId } })).mode).toBe('chairs');

    const frames: ChairsFrame[] = [];
    host.on('chairs:frame', ({ frame }: any) => frames.push(frame));
    let officeFrames = 0;
    host.on('match:frame', () => officeFrames++);
    for (const s of [host, guest]) expect(await s.emitWithAck('room:join', { matchId })).toEqual({ ok: true });
    const go = new Promise<any>((r) => host.once('match:go', r));
    host.emit('room:ready', { matchId });
    guest.emit('room:ready', { matchId });
    const { startAt } = await go;
    await sleep(Math.max(0, startAt - Date.now()) + 50);

    const hostId = (await prisma.user.findFirstOrThrow({ where: { username: `ch1_${sfx}` } })).id;
    const before = frames.at(-1)!.karts.find((k) => k.id === hostId)!;
    // Office Battle inputs do nothing in a chair race.
    host.emit('office:input', { matchId, inputs: [{ seq: 1, mx: 1, mz: 0, atk: true, blk: false, dge: false, p1: false, p2: false }] });
    let seq = 0;
    for (let i = 0; i < 30; i++) {
      const inputs = [1, 2].map(() => ({ seq: ++seq, steer: 0, thr: 1, fire: i === 5, hop: 0 }));
      host.emit('chairs:input', { matchId, inputs });
      await sleep(CHAIRS_TICK_MS * 2);
    }
    const after = frames.at(-1)!.karts.find((k) => k.id === hostId)!;
    expect(after.prog - before.prog).toBeGreaterThan(5);
    expect(after.shots).toBe(1);
    expect(frames.at(-1)!.ack[hostId]).toBeGreaterThan(30);
    expect(officeFrames).toBe(0);

    // The guest leaves for good: the race is decided and the result mail says so.
    const end = new Promise<MatchSummaryDto>((r) => host.once('match:end', r));
    guest.disconnect();
    const summary = await end;
    expect(summary.mode).toBe('chairs');
    expect(summary.participants.find((p) => p.user.id === hostId)!.result).toBe('win');
    host.disconnect();
  }, 30_000);
});
