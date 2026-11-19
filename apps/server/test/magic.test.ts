import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { MF_IDLE_NET_INPUT, MF_TICK_MS, type MagicFrame, type MagicNetInput, type MatchSummaryDto } from '@inbox/shared';
import { buildApp } from '../src/app';
import { attachSocket } from '../src/realtime/socket';
import { syncCatalog } from '../src/lib/catalog';
import { prisma } from '../src/lib/db';
import { magicMode } from '../src/modes/magic';

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
const step = (seq: number, patch: Partial<MagicNetInput> = {}): MagicNetInput => ({ ...MF_IDLE_NET_INPUT, seq, ...patch });

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

describe('Magic Frontiers mode', () => {
  it('gives each player an army and keeps presses when merging a burst of inputs', () => {
    const state = magicMode.createState(1, ['a', 'b']);
    expect(state.teams).toEqual(['a', 'b']);
    expect(state.world.armies).toHaveLength(2);
    expect(state.world.forts).toHaveLength(3);
    const burst = [step(1, { b: 0 }), step(2), step(3), step(4), step(5), step(6), step(7, { mx: 1 })];
    magicMode.applyAction(state, 'a', { inputs: burst }, { now: 10, startAt: 0, endAt: 60_000 });
    const q = state.queues.get('a')!;
    expect(q).toHaveLength(6);
    expect(q[0]!.b).toBe(0);
    // Steps already queued are resends and are ignored.
    magicMode.applyAction(state, 'a', { inputs: [step(5), step(7)] }, { now: 20, startAt: 0, endAt: 60_000 });
    expect(q).toHaveLength(6);
  });

  it('runs two steps per tick, applies one input per step and buys with the merged press', () => {
    const state = magicMode.createState(1, ['a', 'b']);
    magicMode.applyAction(state, 'a', { inputs: [step(1, { b: 0, mz: 1 }), step(2, { mz: 1 })] }, { now: 0, startAt: 0, endAt: 60_000 });
    const gold = state.world.econ[0]!.gold;
    const frame = magicMode.tick!(state, { now: MF_TICK_MS * 2 + 1, startAt: 0, endAt: 60_000, activeIds: ['a', 'b'] })!;
    expect(frame.world.tick).toBe(2);
    expect(frame.ack).toEqual({ a: 2, b: 0 });
    expect(frame.teams).toEqual(['a', 'b']);
    expect(state.world.econ[0]!.gold).toBeLessThan(gold);
    expect(state.world.econ[0]!.queue).toHaveLength(1);
    expect(frame.events.some((e) => e.t === 'recruit' && e.team === 0)).toBe(true);
  });

  it('is over when one side leaves, and the points decide who is ahead', () => {
    const state = magicMode.createState(1, ['a', 'b']);
    expect(magicMode.isDone!(state, ['a', 'b'])).toBe(false);
    expect(magicMode.isDone!(state, ['a'])).toBe(true);
    state.world.econ[1]!.vp = 40;
    expect(magicMode.compare(state, 'b', 'a')).toBe(1);
    expect(magicMode.outcome(state, 'b').correctChars).toBe(40);
  });
});

describe('Magic Frontiers rooms', () => {
  it('two players start a conquest from a room and the server runs it with their inputs', async () => {
    const users = await Promise.all(['mf1', 'mf2', 'mf3'].map((n) => register(`${n}_${sfx}`)));
    const [host, guest, third] = (await Promise.all(users.map((u) => socketFor(u.cookie)))) as [Socket, Socket, Socket];
    const created = await host.emitWithAck('lobby:create', { mode: 'magic' });
    expect(created.ok).toBe(true);
    expect(await host.emitWithAck('lobby:start')).toMatchObject({ ok: false });
    for (const s of [guest, third]) expect(await s.emitWithAck('lobby:join', { code: created.code })).toEqual({ ok: true });
    // It is 1 against 1: three in the room cannot start.
    expect(await host.emitWithAck('lobby:start')).toMatchObject({ ok: false });
    third.emit('lobby:leave');
    await sleep(100);

    const started = [host, guest].map((s) => new Promise<any>((r) => s.once('lobby:started', r)));
    expect(await host.emitWithAck('lobby:start')).toEqual({ ok: true });
    const [s1] = await Promise.all(started);
    expect(s1.mode).toBe('magic');
    const matchId = s1.matchId as string;

    const frames: MagicFrame[] = [];
    host.on('magic:frame', ({ frame }: any) => frames.push(frame));
    for (const s of [host, guest]) expect(await s.emitWithAck('room:join', { matchId })).toEqual({ ok: true });
    const go = new Promise<any>((r) => host.once('match:go', r));
    host.emit('room:ready', { matchId });
    guest.emit('room:ready', { matchId });
    const { startAt } = await go;
    await sleep(Math.max(0, startAt - Date.now()) + 100);

    const hostId = (await prisma.user.findFirstOrThrow({ where: { username: `mf1_${sfx}` } })).id;
    const team = frames.at(-1)!.teams.indexOf(hostId);
    expect(team).toBeGreaterThanOrEqual(0);
    const cmdOf = (f: MagicFrame) => f.world.units[f.world.armies[team]![0] - 1]!;
    const before = cmdOf(frames.at(-1)!);
    // March towards the middle of the valley (south army goes north, north army goes south).
    const dir = team === 0 ? 1 : -1;
    let seq = 0;
    for (let i = 0; i < 20; i++) {
      const inputs = [1, 2].map(() => step(++seq, { mz: dir, az: before[3] + dir * 10, ax: before[2], b: i === 3 ? 0 : -1 }));
      host.emit('magic:input', { matchId, inputs });
      await sleep(MF_TICK_MS * 2);
    }
    await sleep(150);
    const last = frames.at(-1)!;
    const after = cmdOf(last);
    expect((after[3] - before[3]) * dir).toBeGreaterThan(4);
    expect(last.ack[hostId]).toBeGreaterThan(20);
    expect(last.world.econ[team]!.queue.length + frames.flatMap((f) => f.events).filter((e) => e.t === 'spawn').length).toBeGreaterThan(0);

    // The guest leaves for good: the host wins.
    const end = new Promise<MatchSummaryDto>((r) => host.once('match:end', r));
    guest.disconnect();
    const summary = await end;
    expect(summary.mode).toBe('magic');
    expect(summary.participants.find((p) => p.user.id === hostId)!.result).toBe('win');
    host.disconnect();
    third.disconnect();
  }, 30_000);
});
