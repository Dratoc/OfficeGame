import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { SALES_DT, SALES_TICK_MS, SalesBot, mulberry32, zoneMasks, type MatchSummaryDto, type SalesFrame, type SalesInput } from '@inbox/shared';
import { buildApp } from '../src/app';
import { attachSocket } from '../src/realtime/socket';
import { syncCatalog } from '../src/lib/catalog';
import { prisma } from '../src/lib/db';
import { decideResults } from '../src/lib/matches';
import { salesMode } from '../src/modes/sales';

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

describe('A Toda Máquina mode', () => {
  it('runs a shift on the server with bot inputs until the customers burn everything', () => {
    const ids = ['a', 'b', 'c'];
    const state = salesMode.createState(5, ids);
    const rnd = mulberry32(3);
    const bots = new Map(ids.map((id) => [id, new SalesBot(0.9, rnd)]));
    const startAt = 1_000_000;
    const endAt = startAt + salesMode.durationMs;
    let now = startAt;
    let seq = 0;
    // Player c stops helping after two minutes: the others can't keep up forever.
    while (now < endAt && !salesMode.isDone!(state, ids)) {
      now += SALES_TICK_MS;
      seq++;
      for (const w of state.world.workers) {
        const input = bots.get(w.id)!.step(state.world, w, state.world.workers, SALES_DT);
        const lazy = w.id === 'c' && now - startAt > 120_000;
        salesMode.applyAction(state, w.id, { inputs: [lazy ? { seq, mx: 0, mz: 0, act: false, hold: false } : { ...input, seq }] }, { now, startAt, endAt });
      }
      salesMode.tick!(state, { now, startAt, endAt, activeIds: ids });
    }
    const w = state.world;
    expect(w.over).not.toBeNull();
    expect(w.served).toBeGreaterThan(3);
    expect(w.day).toBeGreaterThan(1);
    expect(salesMode.teamResult!(state)).toBe('win');
    const out = salesMode.outcome(state, 'a');
    expect(out.correctChars).toBe(w.score);
    expect(out.wpm).toBe(w.day);
    expect(out.correctWords).toBeGreaterThan(0);
    // Everyone shares the result.
    const standings = decideResults({ outcomes: ids.map((id) => salesMode.outcome(state, id)), abandoned: new Set(), compare: () => 0, teamResult: 'win' });
    expect([...standings.values()].every((s) => s.result === 'win' && s.place === 1)).toBe(true);
  });

  it('gives the areas of a player who drops out to the rest', () => {
    const state = salesMode.createState(1, ['a', 'b', 'c']);
    const startAt = 0;
    const endAt = salesMode.durationMs;
    expect(state.world.workers.map((w) => w.zones)).toEqual(zoneMasks(3));
    const frame = salesMode.tick!(state, { now: SALES_TICK_MS + 1, startAt, endAt, activeIds: ['a', 'c'] });
    expect(frame?.events.some((e) => e.type === 'zones')).toBe(true);
    const [a, b, c] = state.world.workers;
    expect([a!.zones, c!.zones]).toEqual(zoneMasks(2));
    expect(b!.active).toBe(false);
  });

  it('ignores resent input steps and only uses one step per tick', () => {
    const state = salesMode.createState(1, ['a']);
    const step = (seq: number): SalesInput => ({ seq, mx: 1, mz: 0, act: false, hold: false });
    salesMode.applyAction(state, 'a', { inputs: [step(1), step(2), step(3)] }, { now: 10, startAt: 0, endAt: 60_000 });
    salesMode.applyAction(state, 'a', { inputs: [step(2), step(3)] }, { now: 10, startAt: 0, endAt: 60_000 });
    expect(state.queues.get('a')).toHaveLength(3);
    salesMode.tick!(state, { now: SALES_TICK_MS + 1, startAt: 0, endAt: 60_000, activeIds: ['a'] });
    expect(state.ack.get('a')).toBe(1);
    expect(state.queues.get('a')).toHaveLength(2);
  });
});

describe('A Toda Máquina rooms', () => {
  it('a team plays together, keeps going when one leaves, and shares the result without rating changes', async () => {
    const users = await Promise.all(['sa1', 'sa2'].map((n) => register(`${n}_${sfx}`)));
    const [host, guest] = (await Promise.all(users.map((u) => socketFor(u.cookie)))) as [Socket, Socket];
    const created = await host.emitWithAck('lobby:create', { mode: 'sales' });
    expect(created.ok).toBe(true);
    expect(await guest.emitWithAck('lobby:join', { code: created.code })).toEqual({ ok: true });
    const started = [host, guest].map((s) => new Promise<any>((r) => s.once('lobby:started', r)));
    expect(await host.emitWithAck('lobby:start')).toEqual({ ok: true });
    const [s1] = await Promise.all(started);
    expect(s1.mode).toBe('sales');
    const matchId = s1.matchId as string;

    const frames: SalesFrame[] = [];
    host.on('sales:frame', ({ frame }: any) => frames.push(frame));
    for (const s of [host, guest]) expect(await s.emitWithAck('room:join', { matchId })).toEqual({ ok: true });
    const go = new Promise<any>((r) => host.once('match:go', r));
    host.emit('room:ready', { matchId });
    guest.emit('room:ready', { matchId });
    const { startAt } = await go;
    await sleep(Math.max(0, startAt - Date.now()) + 50);

    const hostId = (await prisma.user.findFirstOrThrow({ where: { username: `sa1_${sfx}` } })).id;
    const ratingBefore = (await prisma.playerStats.findUniqueOrThrow({ where: { userId: hostId } })).rating;
    const before = frames.at(-1)!.world.workers.find((w) => w.id === hostId)!;
    expect(before.zones).toBe(zoneMasks(2)[0]);
    let seq = 0;
    for (let i = 0; i < 20; i++) {
      host.emit('sales:input', { matchId, inputs: [1, 2].map(() => ({ seq: ++seq, mx: 0, mz: 1, act: false, hold: false })) });
      await sleep(SALES_TICK_MS * 2);
    }
    const after = frames.at(-1)!.world.workers.find((w) => w.id === hostId)!;
    expect(after.z - before.z).toBeGreaterThan(1);

    // The guest leaves: the shift goes on and the host takes over every area.
    guest.disconnect();
    await sleep(5_600);
    const solo = frames.at(-1)!.world;
    expect(solo.over).toBeNull();
    expect(solo.workers.find((w) => w.id === hostId)!.zones).toBe(zoneMasks(1)[0]);

    const end = new Promise<MatchSummaryDto>((r) => host.once('match:end', r));
    // Nobody served anyone: the first day ends as a loss for the team, and only the clock is left.
    const room = (await import('../src/realtime/matchEngine')).engine.getRoom(matchId)!;
    room.state.world.clock = 0.05;
    const summary = await end;
    expect(summary.mode).toBe('sales');
    const mine = summary.participants.find((p) => p.user.id === hostId)!;
    expect(mine.result).toBe('loss');
    expect(mine.ratingAfter).toBe(ratingBefore);
    expect(summary.participants.find((p) => p.user.id !== hostId)!.result).toBe('abandon');
    host.disconnect();
  }, 30_000);
});
