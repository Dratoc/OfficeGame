import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import type { MatchGoEvent, MatchSummaryDto, MeDto, WordResultEvent } from '@inbox/shared';
import { buildApp } from '../src/app';
import { attachSocket } from '../src/realtime/socket';
import { syncCatalog } from '../src/lib/catalog';
import { prisma } from '../src/lib/db';

let base = '';
let app: Awaited<ReturnType<typeof buildApp>>;
const suffix = Math.random().toString(36).slice(2, 7);

async function api(cookie: string, method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json()) as any, setCookie: res.headers.get('set-cookie') };
}

async function register(name: string) {
  const r = await api('', 'POST', '/api/auth/register', { email: `${name}@test.dev`, username: name, password: 'contraseña-segura' });
  expect(r.status).toBe(200);
  return r.setCookie!.split(';')[0]!;
}

function socketFor(cookie: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = connect(base, { extraHeaders: { cookie }, transports: ['websocket'] });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}

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

describe('auth', () => {
  it('rejects duplicate usernames and bad passwords', async () => {
    const name = `dup_${suffix}`;
    await register(name);
    const again = await api('', 'POST', '/api/auth/register', { email: `other_${suffix}@test.dev`, username: name.toUpperCase(), password: 'contraseña-segura' });
    expect(again.status).toBe(409);
    const bad = await api('', 'POST', '/api/auth/login', { login: name, password: 'nope-nope' });
    expect(bad.status).toBe(401);
    const ok = await api('', 'POST', '/api/auth/login', { login: name, password: 'contraseña-segura' });
    expect(ok.status).toBe(200);
  });

  it('rejects unauthenticated sockets', async () => {
    await expect(socketFor('')).rejects.toThrow('unauthorized');
  });

  it('refuses to equip items the player has not unlocked', async () => {
    const c = await register(`armory_${suffix}`);
    const me = (await api(c, 'GET', '/api/me')).json as MeDto;
    const r = await api(c, 'PUT', '/api/avatar', { ...me.avatar, equipped: { ...me.avatar.equipped, headgear: 'headgear_crown' } });
    expect(r.status).toBe(400);
  });
});

describe('typing battle', () => {
  it('plays a full authoritative match between two real clients', async () => {
    const ana = await register(`ana_${suffix}`);
    const beto = await register(`beto_${suffix}`);

    const ch = await api(ana, 'POST', '/api/challenges', { opponent: `beto_${suffix}`, message: '¿Duelo antes del almuerzo?' });
    expect(ch.status).toBe(200);

    const inbox = (await api(beto, 'GET', '/api/mail?folder=inbox')).json;
    const challengeMail = inbox.mails.find((m: any) => m.kind === 'challenge');
    expect(challengeMail.challenge.status).toBe('pending');

    // Only the opponent can accept, and only once.
    expect((await api(ana, 'POST', `/api/challenges/${ch.json.challengeId}/accept`)).status).toBe(403);
    const [acc1, acc2] = await Promise.all([
      api(beto, 'POST', `/api/challenges/${ch.json.challengeId}/accept`),
      api(beto, 'POST', `/api/challenges/${ch.json.challengeId}/accept`),
    ]);
    const matchId = acc1.json.matchId ?? acc2.json.matchId;
    expect(matchId).toBeTruthy();
    expect([acc1.status, acc2.status]).toContain(200);

    const sa = await socketFor(ana);
    const sb = await socketFor(beto);
    const words: Record<string, WordResultEvent[]> = { a: [], b: [] };
    sa.on('match:word', (w: WordResultEvent) => words.a.push(w));

    const goA = new Promise<MatchGoEvent>((r) => sa.once('match:go', r));
    const goB = new Promise<MatchGoEvent>((r) => sb.once('match:go', r));
    const endA = new Promise<MatchSummaryDto>((r) => sa.once('match:end', r));

    expect(await sa.emitWithAck('room:join', { matchId })).toEqual({ ok: true });
    expect(await sb.emitWithAck('room:join', { matchId })).toEqual({ ok: true });
    sa.emit('room:ready', { matchId });
    sb.emit('room:ready', { matchId });

    const [ga, gb] = await Promise.all([goA, goB]);
    expect(ga.prompts).toEqual(gb.prompts);
    expect(ga.endAt - ga.startAt).toBe(10_000);

    // Ana types 6 words correctly; Beto types 3 correct and 1 wrong; a bot-speed burst is rejected.
    for (let i = 0; i < 6; i++) {
      await sleep(450);
      sa.emit('match:answer', { matchId, index: i, answer: ga.prompts[i]!.text, typedAt: Date.now() });
      if (i < 4) sb.emit('match:answer', { matchId, index: i, answer: i === 2 ? 'xxx' : gb.prompts[i]!.text, typedAt: Date.now() });
    }
    // Burst: 5 words at once, far faster than a human.
    for (let i = 6; i < 11; i++) sa.emit('match:answer', { matchId, index: i, answer: ga.prompts[i]!.text, typedAt: Date.now() });

    const summary = await endA;
    const a = summary.participants.find((p) => p.user.username === `ana_${suffix}`)!;
    const b = summary.participants.find((p) => p.user.username === `beto_${suffix}`)!;
    expect(summary.status).toBe('finished');
    expect(a.result).toBe('win');
    expect(b.result).toBe('loss');
    expect(b.correctWords).toBe(3);
    expect(b.errors).toBe(1);
    expect(a.correctWords).toBeGreaterThanOrEqual(6);
    expect(a.correctWords).toBeLessThan(11);
    expect(words.a.some((w) => !w.accepted)).toBe(true);
    expect(a.ratingAfter).toBeGreaterThan(a.ratingBefore);
    expect(b.ratingAfter).toBeLessThan(b.ratingBefore);
    expect(a.xpGained).toBe(100 + a.correctWords * 2);

    const meA = (await api(ana, 'GET', '/api/me')).json as MeDto;
    expect(meA.stats.wins).toBe(1);
    expect(meA.stats.level).toBe(2);
    expect(meA.inventory).toContain('weapon_sword'); // level 2 unlock

    const inboxA = (await api(ana, 'GET', '/api/mail')).json;
    expect(inboxA.mails[0].kind).toBe('result');
    expect(inboxA.mails[0].subject).toContain('Victoria');

    const board = (await api(ana, 'GET', '/api/leaderboard')).json;
    expect(board.some((e: any) => e.user.username === `ana_${suffix}`)).toBe(true);

    // Words sent after the end are ignored and the match cannot be finished twice.
    sb.emit('match:answer', { matchId, index: 4, answer: gb.prompts[4]!.text, typedAt: Date.now() });
    await sleep(200);
    const again = (await api(beto, 'GET', `/api/matches/${matchId}`)).json as MatchSummaryDto;
    expect(again.participants.find((p) => p.user.username === `beto_${suffix}`)!.correctWords).toBe(3);

    sa.close();
    sb.close();
  });

  it('awards the win when the rival disconnects mid-match', async () => {
    const c1 = await register(`carla_${suffix}`);
    const c2 = await register(`dani_${suffix}`);
    const ch = await api(c1, 'POST', '/api/challenges', { opponent: `dani_${suffix}` });
    const { matchId } = (await api(c2, 'POST', `/api/challenges/${ch.json.challengeId}/accept`)).json;
    const s1 = await socketFor(c1);
    const s2 = await socketFor(c2);
    const go = new Promise<MatchGoEvent>((r) => s1.once('match:go', r));
    const end = new Promise<MatchSummaryDto>((r) => s1.once('match:end', r));
    await s1.emitWithAck('room:join', { matchId });
    await s2.emitWithAck('room:join', { matchId });
    s1.emit('room:ready', { matchId });
    s2.emit('room:ready', { matchId });
    await go;
    s2.close();
    const summary = await end;
    expect(summary.participants.find((p) => p.user.username === `carla_${suffix}`)!.result).toBe('win');
    expect(summary.participants.find((p) => p.user.username === `dani_${suffix}`)!.result).toBe('abandon');
    s1.close();
  });
});
