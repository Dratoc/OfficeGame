import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { RACE_LENGTH, multiEloDeltas, type MatchGoEvent, type MatchSummaryDto } from '@inbox/shared';
import { buildApp } from '../src/app';
import { attachSocket } from '../src/realtime/socket';
import { syncCatalog } from '../src/lib/catalog';
import { prisma } from '../src/lib/db';
import { createMatch, decideResults, finalizeMatch } from '../src/lib/matches';
import { racingMode } from '../src/modes/sequence';

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
  const json = (await res.json()) as any;
  return { cookie: res.headers.get('set-cookie')!.split(';')[0]!, id: json.user?.id ?? json.id };
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

describe('results for any number of players', () => {
  const outcomes = (ids: string[]) => ids.map((userId) => ({ userId, correctWords: 0, errors: 0, correctChars: 0, wpm: 0, accuracy: 0 }));
  const score: Record<string, number> = { a: 9, b: 5, c: 5, d: 1 };

  it('ranks a four player race, sharing places on ties and putting abandons last', () => {
    const r = decideResults({ outcomes: outcomes(['a', 'b', 'c', 'd']), abandoned: new Set(['d']), compare: (x, y) => score[x]! - score[y]! });
    expect(r.get('a')).toEqual({ result: 'win', place: 1 });
    expect(r.get('b')).toEqual({ result: 'loss', place: 2 });
    expect(r.get('c')).toEqual({ result: 'loss', place: 2 });
    expect(r.get('d')).toEqual({ result: 'abandon', place: 4 });
  });

  it('keeps the classic two player results', () => {
    const r = decideResults({ outcomes: outcomes(['b', 'c']), abandoned: new Set(), compare: (x, y) => score[x]! - score[y]! });
    expect(r.get('b')!.result).toBe('draw');
    expect(r.get('c')!.result).toBe('draw');
    const left = decideResults({ outcomes: outcomes(['a', 'd']), abandoned: new Set(['a']), compare: (x, y) => score[x]! - score[y]! });
    expect(left.get('d')!.result).toBe('win');
  });

  it('averages Elo over every pair', () => {
    expect(multiEloDeltas([{ rating: 1000, place: 1 }, { rating: 1000, place: 2 }])).toEqual([16, -16]);
    const four = multiEloDeltas([1, 2, 3, 4].map((place) => ({ rating: 1000, place })));
    expect(four[0]).toBeGreaterThan(four[1]!);
    expect(four[1]).toBeGreaterThan(0);
    expect(four[2]).toBeLessThan(0);
    expect(four.reduce((s, x) => s + x, 0)).toBe(0);
  });
});

describe('racing mode', () => {
  it('stops counting at the finish line and knows when everyone is done', () => {
    const s = racingMode.createState(42, ['a', 'b']);
    let t = 0;
    for (let i = 0; i < RACE_LENGTH; i++) {
      t += 600;
      expect(racingMode.applyAction(s, 'a', { index: i, answer: s.answers[i]!, typedAt: t }, { now: t, startAt: 0, endAt: 45_000 }).correct).toBe(true);
    }
    const extra = racingMode.applyAction(s, 'a', { index: RACE_LENGTH, answer: s.answers[RACE_LENGTH]!, typedAt: t + 600 }, { now: t + 600, startAt: 0, endAt: 45_000 });
    expect(extra).toMatchObject({ accepted: false, reason: 'finished' });
    expect(racingMode.isDone!(s, ['a'])).toBe(true);
    expect(racingMode.isDone!(s, ['a', 'b'])).toBe(false);
    // Speed is measured over the time it took to finish, not the whole clock.
    expect(racingMode.outcome(s, 'a').wpm).toBeGreaterThan(60);
  });

  it('persists places, Elo and podium XP for three racers', async () => {
    const users = await Promise.all(['r1', 'r2', 'r3'].map((n) => register(`${n}_${sfx}`)));
    const people = await prisma.user.findMany({ where: { username: { in: ['r1', 'r2', 'r3'].map((n) => `${n}_${sfx}`) } }, orderBy: { username: 'asc' } });
    expect(users).toHaveLength(3);
    const [p1, p2, p3] = people.map((p) => p.id) as [string, string, string];
    const matchId = await createMatch('racing', [p1, p2, p3]);
    const words: Record<string, number> = { [p1]: 30, [p2]: 20, [p3]: 10 };
    const summary = await finalizeMatch({
      matchId,
      mode: 'racing',
      outcomes: [p1, p2, p3].map((userId) => ({ userId, correctWords: words[userId]!, errors: 0, correctChars: 0, wpm: 0, accuracy: 100 })),
      abandoned: new Set(),
      compare: (a, b) => words[a]! - words[b]!,
    });
    const by = (id: string) => summary.participants.find((p) => p.user.id === id)!;
    expect([by(p1).placement, by(p2).placement, by(p3).placement]).toEqual([1, 2, 3]);
    expect(by(p1).result).toBe('win');
    expect(by(p2).result).toBe('loss');
    expect(by(p2).xpGained).toBe(40 + 20 + 20 * 2);
    expect(by(p3).xpGained).toBe(40 + 10 * 2);
    expect(by(p2).ratingAfter - by(p2).ratingBefore).toBe(0);
    expect(summary.winnerId).toBe(p1);
  });
});

describe('race queue', () => {
  it('starts a race for three once the first runner waited, and ends early when all finish', async () => {
    const users = await Promise.all(['q1', 'q2', 'q3'].map((n) => register(`${n}_${sfx}`)));
    const sockets = await Promise.all(users.map((u) => socketFor(u.cookie)));
    const counts: number[] = [];
    sockets[0]!.on('queue:status', (s: any) => s.players && counts.push(s.players));
    const matched = sockets.map((s) => new Promise<any>((r) => s.once('queue:matched', r)));
    for (const s of sockets) {
      s.emit('queue:join', { mode: 'racing' });
      await sleep(100);
    }
    const m = await Promise.all(matched);
    expect(new Set(m.map((x) => x.matchId)).size).toBe(1);
    expect(m[0].opponents).toHaveLength(2);
    expect(Math.max(...counts)).toBe(3);

    // Two runners finish, the third leaves: the race ends without waiting 45 seconds.
    const matchId = m[0].matchId as string;
    const go = new Promise<MatchGoEvent>((r) => sockets[0]!.once('match:go', r));
    const end = new Promise<MatchSummaryDto>((r) => sockets[0]!.once('match:end', r));
    for (const s of sockets) expect(await s.emitWithAck('room:join', { matchId })).toEqual({ ok: true });
    for (const s of sockets) s.emit('room:ready', { matchId });
    const g = await go;
    await sleep(Math.max(0, g.startAt - Date.now()) + 50);
    sockets[2]!.disconnect();
    const t0 = Date.now();
    for (let i = 0; i < RACE_LENGTH; i++) {
      await sleep(460);
      sockets[0]!.emit('match:answer', { matchId, index: i, answer: g.prompts[i]!.text, typedAt: Date.now() });
      sockets[1]!.emit('match:answer', { matchId, index: i, answer: i % 10 === 3 ? 'x' : g.prompts[i]!.text, typedAt: Date.now() });
    }
    for (let i = RACE_LENGTH; i < RACE_LENGTH + 3; i++) {
      await sleep(460);
      sockets[1]!.emit('match:answer', { matchId, index: i, answer: g.prompts[i]!.text, typedAt: Date.now() });
    }
    const summary = await end;
    expect(Date.now() - t0).toBeLessThan(30_000);
    const places = summary.participants.map((p) => p.placement).sort();
    expect(places).toEqual([1, 2, 3]);
    expect(summary.participants.find((p) => p.placement === 3)!.result).toBe('abandon');
    sockets.forEach((s) => s.disconnect());
  }, 60_000);
});
