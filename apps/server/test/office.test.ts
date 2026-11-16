import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import {
  OFFICE,
  OFFICE_ARENA,
  OFFICE_TICK_MS,
  createFighter,
  resolveCombat,
  stepFighter,
  NO_INPUT,
  type Fighter,
  type MatchGoEvent,
  type MatchSummaryDto,
  type OfficeFrame,
  type OfficeInput,
} from '@inbox/shared';
import { buildApp } from '../src/app';
import { attachSocket } from '../src/realtime/socket';
import { syncCatalog } from '../src/lib/catalog';
import { prisma } from '../src/lib/db';
import { officeMode } from '../src/modes/office';

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

const press = (p: Partial<OfficeInput>): OfficeInput => ({ ...NO_INPUT, ...p });

/** Two fighters a step apart, a facing b. */
function duel(): [Fighter, Fighter] {
  const a = createFighter('a', 0);
  const b = createFighter('b', 1);
  a.x = 0;
  a.z = 0;
  a.facing = 0;
  b.x = 1.1;
  b.z = 0;
  b.facing = Math.PI;
  return [a, b];
}

/** Runs both fighters until a's swing resolves. */
function swing(a: Fighter, b: Fighter, bInput: OfficeInput = NO_INPUT) {
  const events = [];
  for (let i = 0; i < 12; i++) {
    stepFighter(a, i === 0 ? press({ atk: true }) : NO_INPUT, b);
    stepFighter(b, bInput, a);
    events.push(...resolveCombat([a, b]));
  }
  return events;
}

describe('office battle rules', () => {
  it('a swing in range hits once, knocks back and stuns', () => {
    const [a, b] = duel();
    const events = swing(a, b);
    expect(events.filter((e) => e.type === 'hit')).toHaveLength(1);
    expect(b.hp).toBe(OFFICE.maxHp - OFFICE.attack.damage);
    expect(b.x).toBeGreaterThan(1.1);
    expect(a.hits).toBe(1);
    expect(b.taken).toBe(1);
  });

  it('a block from the front stops the hit and leaves the attacker open', () => {
    const [a, b] = duel();
    const events = swing(a, b, press({ blk: true }));
    expect(events.map((e) => e.type)).toContain('block');
    expect(b.hp).toBe(OFFICE.maxHp - OFFICE.block.chip);
    expect(a.action).toBe('stun');
    expect(b.blocks).toBe(1);
  });

  it('a block does not cover your back', () => {
    const [a, b] = duel();
    b.facing = 0;
    // Facing away, block does not turn you because the lock-on only happens when you start blocking.
    b.action = 'block';
    const events = [];
    for (let i = 0; i < 12; i++) {
      stepFighter(a, i === 0 ? press({ atk: true }) : NO_INPUT, b);
      b.facing = 0;
      events.push(...resolveCombat([a, b]));
    }
    expect(events.map((e) => e.type)).toContain('hit');
  });

  it('dodging makes the swing miss and has a cooldown', () => {
    const [a, b] = duel();
    stepFighter(a, press({ atk: true }), b);
    stepFighter(b, press({ dge: true, mz: 1 }), a);
    expect(b.action).toBe('dodge');
    const events = [];
    for (let i = 0; i < 10; i++) {
      stepFighter(a, NO_INPUT, b);
      stepFighter(b, press({ dge: true }), a);
      events.push(...resolveCombat([a, b]));
    }
    expect(b.hp).toBe(OFFICE.maxHp);
    expect(b.dodges).toBe(1);
    expect(b.dodgeCd).toBeGreaterThan(0);
  });

  it('knocks out at zero health and nobody leaves the office', () => {
    const [a, b] = duel();
    b.hp = 5;
    const events = swing(a, b);
    expect(events.map((e) => e.type)).toContain('ko');
    expect(b.hp).toBe(0);
    expect(b.action).toBe('ko');
    const f = createFighter('c', 0);
    for (let i = 0; i < 200; i++) stepFighter(f, press({ mx: -1, mz: -1 }), null);
    expect(f.x).toBeGreaterThanOrEqual(-OFFICE_ARENA.halfW);
    expect(f.z).toBeGreaterThanOrEqual(-OFFICE_ARENA.halfD);
  });

  it('the server uses one input per step, so flooding inputs does not make you faster', () => {
    const s = officeMode.createState(1, ['a', 'b']);
    const startX = s.fighters.get('a')!.x;
    const inputs = Array.from({ length: 8 }, (_, i) => press({ seq: i + 1, mx: 1 }));
    for (let k = 0; k < 5; k++) officeMode.applyAction(s, 'a', { inputs }, { now: 0, startAt: 0, endAt: 60_000 });
    officeMode.tick!(s, { now: OFFICE_TICK_MS * 3 + 1, startAt: 0, endAt: 60_000, activeIds: ['a', 'b'] });
    const moved = s.fighters.get('a')!.x - startX;
    expect(moved).toBeCloseTo(OFFICE.speed * (OFFICE_TICK_MS / 1000) * 3, 3);
    // Resent steps are ignored, and a burst bigger than the queue drops its oldest steps.
    expect(s.ack.get('a')).toBe(5);
    expect(s.queues.get('a')!.map((i) => i.seq)).toEqual([6, 7, 8]);
  });
});

describe('office battle online', () => {
  it('matches two players, runs the fight on the server and ends on a knockout', async () => {
    const users = await Promise.all(['ob1', 'ob2'].map((n) => register(`${n}_${sfx}`)));
    const [a, b] = await Promise.all(users.map((u) => socketFor(u.cookie)));
    const matched = [a!, b!].map((s) => new Promise<any>((r) => s.once('queue:matched', r)));
    a!.emit('queue:join', { mode: 'office' });
    await sleep(50);
    b!.emit('queue:join', { mode: 'office' });
    const [ma] = await Promise.all(matched);
    const matchId = ma.matchId as string;
    expect(ma.mode).toBe('office');

    const go = new Promise<MatchGoEvent>((r) => a!.once('match:go', r));
    const end = new Promise<MatchSummaryDto>((r) => a!.once('match:end', r));
    for (const s of [a!, b!]) expect(await s.emitWithAck('room:join', { matchId })).toEqual({ ok: true });
    for (const s of [a!, b!]) s.emit('room:ready', { matchId });
    const g = await go;
    expect(g.mode).toBe('office');

    let last: OfficeFrame | null = null;
    let frames = 0;
    let hits = 0;
    b!.on('match:frame', ({ frame }: { frame: OfficeFrame }) => {
      frames++;
      last = frame;
      hits += frame.events.filter((e) => e.type === 'hit').length;
    });
    await sleep(Math.max(0, g.startAt - Date.now()));

    // Player a walks to b and keeps swinging; b stands still.
    const aId = (await prisma.user.findFirstOrThrow({ where: { username: `ob1_${sfx}` } })).id;
    let seq = 0;
    const t0 = Date.now();
    let done = false;
    void end.then(() => (done = true));
    while (!done && Date.now() - t0 < 40_000) {
      const inputs: OfficeInput[] = [];
      const fr = last as OfficeFrame | null;
      const me = fr?.fighters.find((f) => f.id === aId);
      const foe = fr?.fighters.find((f) => f.id !== aId);
      for (let k = 0; k < 2; k++) {
        let mx = 0;
        let mz = 0;
        let atk = false;
        if (me && foe) {
          const dx = foe.x - me.x;
          const dz = foe.z - me.z;
          const d = Math.hypot(dx, dz);
          if (d > 1.2) {
            mx = dx / d;
            mz = dz / d;
          } else atk = true;
        }
        inputs.push({ seq: ++seq, mx, mz, atk, blk: false, dge: false });
      }
      a!.emit('office:input', { matchId, inputs });
      await sleep(OFFICE_TICK_MS * 2);
    }
    const summary = await end;
    expect(frames).toBeGreaterThan(20);
    expect(hits).toBeGreaterThanOrEqual(Math.ceil(OFFICE.maxHp / OFFICE.attack.damage));
    const winner = summary.participants.find((p) => p.result === 'win')!;
    expect(winner.user.id).toBe(aId);
    expect(winner.correctWords).toBe(Math.ceil(OFFICE.maxHp / OFFICE.attack.damage));
    expect(summary.participants.find((p) => p.result === 'loss')!.errors).toBe(winner.correctWords);
    // The knockout ended it well before the 60 second clock.
    expect(Date.now() - t0).toBeLessThan(30_000);
    a!.disconnect();
    b!.disconnect();
  }, 60_000);
});
