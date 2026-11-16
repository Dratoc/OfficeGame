import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import type { FriendsDto, ProfileDto } from '@inbox/shared';
import { buildApp } from '../src/app';
import { attachSocket } from '../src/realtime/socket';
import { syncCatalog } from '../src/lib/catalog';
import { prisma } from '../src/lib/db';

let base = '';
let app: Awaited<ReturnType<typeof buildApp>>;
const sfx = Math.random().toString(36).slice(2, 7);

async function api(cookie: string, method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, { method, headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: (await res.json()) as any, setCookie: res.headers.get('set-cookie') };
}
async function register(name: string) {
  const r = await api('', 'POST', '/api/auth/register', { email: `${name}@test.dev`, username: name, password: 'contraseña-segura' });
  expect(r.status).toBe(200);
  return r.setCookie!.split(';')[0]!;
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

describe('friends', () => {
  it('sends, accepts and removes friend requests, with live presence', async () => {
    const eva = await register(`eva_${sfx}`);
    const fede = await register(`fede_${sfx}`);

    expect((await api(eva, 'POST', '/api/friends', { username: `eva_${sfx}` })).status).toBe(400);
    expect((await api(eva, 'POST', '/api/friends', { username: `fede_${sfx}` })).json.status).toBe('outgoing');
    expect((await api(eva, 'POST', '/api/friends', { username: `fede_${sfx}` })).status).toBe(409);

    const fedeView = (await api(fede, 'GET', '/api/friends')).json as FriendsDto;
    expect(fedeView.incoming).toHaveLength(1);
    const mail = (await api(fede, 'GET', '/api/mail')).json.mails[0];
    expect(mail.kind).toBe('social');

    // Only the addressee can accept.
    expect((await api(eva, 'POST', `/api/friends/requests/${fedeView.incoming[0]!.id}/accept`)).status).toBe(403);
    expect((await api(fede, 'POST', `/api/friends/requests/${fedeView.incoming[0]!.id}/accept`)).status).toBe(200);

    const profile = (await api(eva, 'GET', `/api/users/fede_${sfx}`)).json as ProfileDto;
    expect(profile.friendStatus).toBe('friends');
    expect(profile.online).toBe(false);

    const se = await socketFor(eva);
    const presence = new Promise<{ userId: string; online: boolean }>((r) => se.once('presence:update', r));
    const sf = await socketFor(fede);
    expect((await presence).online).toBe(true);
    const evaView = (await api(eva, 'GET', '/api/friends')).json as FriendsDto;
    expect(evaView.friends[0]!.online).toBe(true);

    const offline = new Promise<{ userId: string; online: boolean }>((r) => se.once('presence:update', r));
    sf.close();
    expect((await offline).online).toBe(false);

    expect((await api(eva, 'DELETE', `/api/friends/${evaView.friends[0]!.user.id}`)).status).toBe(200);
    expect(((await api(fede, 'GET', '/api/friends')).json as FriendsDto).friends).toHaveLength(0);
    se.close();
  });

  it('accepts automatically when both send a request', async () => {
    const a = await register(`gabi_${sfx}`);
    const b = await register(`hugo_${sfx}`);
    await api(a, 'POST', '/api/friends', { username: `hugo_${sfx}` });
    expect((await api(b, 'POST', '/api/friends', { username: `gabi_${sfx}` })).json.status).toBe('friends');
  });
});

describe('quick match', () => {
  it('pairs two players in the queue into the same match', async () => {
    const a = await register(`ines_${sfx}`);
    const b = await register(`juan_${sfx}`);
    const sa = await socketFor(a);
    const sb = await socketFor(b);
    const statusA = new Promise<any>((r) => sa.once('queue:status', r));
    const ma = new Promise<any>((r) => sa.once('queue:matched', r));
    const mb = new Promise<any>((r) => sb.once('queue:matched', r));
    sa.emit('queue:join', { mode: 'typing' });
    expect((await statusA).searching).toBe(true);
    await sleep(100);
    sb.emit('queue:join', { mode: 'typing' });
    const [ra, rb] = await Promise.all([ma, mb]);
    expect(ra.matchId).toBe(rb.matchId);
    expect(ra.opponent.username).toBe(`juan_${sfx}`);
    expect(await sa.emitWithAck('room:join', { matchId: ra.matchId })).toEqual({ ok: true });
    sa.close();
    sb.close();
  });

  it('leaving the queue stops the search', async () => {
    const a = await register(`kim_${sfx}`);
    const sa = await socketFor(a);
    sa.emit('queue:join', { mode: 'typing' });
    await new Promise((r) => sa.once('queue:status', r));
    const stopped = new Promise<any>((r) => sa.once('queue:status', r));
    sa.emit('queue:leave');
    expect((await stopped).searching).toBe(false);
    sa.close();
  });
});
