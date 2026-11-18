import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { ZOMBIE_NO_INPUT, ZOMBIE_TICK_MS, type LiveMatch, type MatchSummaryDto, type ZombieFrame, type ZombieInput } from '@inbox/shared';
import { buildApp } from '../src/app';
import { attachSocket } from '../src/realtime/socket';
import { syncCatalog } from '../src/lib/catalog';
import { prisma } from '../src/lib/db';
import { zombiesMode } from '../src/modes/zombies';

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

describe('Zona Zombi mode', () => {
  it('keeps presses when merging a burst of input steps', () => {
    const state = zombiesMode.createState(1, ['a']);
    const step = (seq: number, patch: Partial<ZombieInput> = {}): ZombieInput => ({ ...ZOMBIE_NO_INPUT, seq, ...patch });
    zombiesMode.applyAction(state, 'a', { inputs: [step(1, { buy: 3 }), step(2), step(3), step(4), step(5), step(6), step(7, { mx: 1 })] }, { now: 10, startAt: 0, endAt: 60_000 });
    const q = state.queues.get('a')!;
    expect(q).toHaveLength(6);
    expect(q[0]!.buy).toBe(3);
  });

  it('adds a player to a live match with their own stats', () => {
    const state = zombiesMode.createState(1, ['a']);
    zombiesMode.addPlayer!(state, 'b');
    expect(state.world.survivors.map((s) => s.id)).toEqual(['a', 'b']);
    expect(state.players.get('b')!.correctWords).toBe(0);
    const frame = zombiesMode.tick!(state, { now: ZOMBIE_TICK_MS + 1, startAt: 0, endAt: 60_000, activeIds: ['a', 'b'] });
    expect(frame?.events.some((e) => e.type === 'join')).toBe(true);
  });
});

describe('Zona Zombi public matches', () => {
  it('starts alone, shows up in the public list, lets someone join mid-match and ends when everyone is down', async () => {
    const users = await Promise.all(['zo1', 'zo2'].map((n) => register(`${n}_${sfx}`)));
    const [host, late] = (await Promise.all(users.map((u) => socketFor(u.cookie)))) as [Socket, Socket];
    const started = await host.emitWithAck('zombies:start');
    expect(started.ok).toBe(true);
    const matchId = started.matchId as string;
    const frames: ZombieFrame[] = [];
    host.on('zombies:frame', ({ frame }: any) => frames.push(frame));
    expect(await host.emitWithAck('room:join', { matchId })).toEqual({ ok: true });
    const go = new Promise<any>((r) => host.once('match:go', r));
    host.emit('room:ready', { matchId });
    const { startAt } = await go;
    await sleep(Math.max(0, startAt - Date.now()) + 100);

    const list: LiveMatch[] = await late.emitWithAck('zombies:list');
    const mine = list.find((m) => m.matchId === matchId);
    expect(mine?.players).toHaveLength(1);
    expect(await late.emitWithAck('zombies:join', { matchId })).toEqual({ ok: true });
    expect(await late.emitWithAck('room:join', { matchId })).toEqual({ ok: true });
    await sleep(300);
    expect(frames.at(-1)!.world.survivors).toHaveLength(2);

    // The late one walks; the server moves them.
    const lateId = (await prisma.user.findFirstOrThrow({ where: { username: `zo2_${sfx}` } })).id;
    const before = frames.at(-1)!.world.survivors.find((s) => s.id === lateId)!;
    let seq = 0;
    for (let i = 0; i < 12; i++) {
      late.emit('zombies:input', { matchId, inputs: [1, 2].map(() => ({ ...ZOMBIE_NO_INPUT, seq: ++seq, mx: 1 })) });
      await sleep(ZOMBIE_TICK_MS * 2);
    }
    const after = frames.at(-1)!.world.survivors.find((s) => s.id === lateId)!;
    expect(after.x - before.x).toBeGreaterThan(1);

    const end = new Promise<MatchSummaryDto>((r) => host.once('match:end', r));
    const room = (await import('../src/realtime/matchEngine')).engine.getRoom(matchId)!;
    for (const s of room.state.world.survivors) {
      s.hp = 0;
      s.action = 'down';
    }
    const summary = await end;
    expect(summary.mode).toBe('zombies');
    expect(summary.participants).toHaveLength(2);
    expect(summary.participants.every((p) => p.result === 'loss')).toBe(true);
    host.disconnect();
    late.disconnect();
  }, 30_000);
});
