import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import {
  OFFICE,
  OFFICE_ARENA,
  OFFICE_TICK_MS,
  createFighter,
  createWorld,
  resolveCombat,
  POWERS,
  POWER_TUNING,
  type OfficeWorld,
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

const OFFICE_SPAWNS_X = createFighter('x', 0).x;
const press = (p: Partial<OfficeInput>): OfficeInput => ({ ...NO_INPUT, ...p });

const worlds = new WeakMap<Fighter, OfficeWorld>();
const res = (a: Fighter) => resolveCombat(worlds.get(a)!);

/** Two fighters a step apart, a facing b. */
function duel(powers: Parameters<typeof createFighter>[2] = undefined): [Fighter, Fighter] {
  const a = createFighter('a', 0, powers);
  const b = createFighter('b', 1);
  const w = createWorld([a, b]);
  worlds.set(a, w);
  worlds.set(b, w);
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
    stepFighter(a, i === 0 ? press({ atk: true }) : NO_INPUT, [b]);
    stepFighter(b, bInput, [a]);
    events.push(...res(a));
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
      stepFighter(a, i === 0 ? press({ atk: true }) : NO_INPUT, [b]);
      b.facing = 0;
      events.push(...res(a));
    }
    expect(events.map((e) => e.type)).toContain('hit');
  });

  it('dodging makes the swing miss and has a cooldown', () => {
    const [a, b] = duel();
    stepFighter(a, press({ atk: true }), [b]);
    stepFighter(b, press({ dge: true, mz: 1 }), [a]);
    expect(b.action).toBe('dodge');
    const events = [];
    for (let i = 0; i < 10; i++) {
      stepFighter(a, NO_INPUT, [b]);
      stepFighter(b, press({ dge: true }), [a]);
      events.push(...res(a));
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
    for (let i = 0; i < 200; i++) stepFighter(f, press({ mx: -1, mz: -1 }), []);
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

/** Steps a and b until a's power (slot 0) resolved, then lets staples fly. */
function cast(a: Fighter, b: Fighter, steps = 20, bInput: OfficeInput = NO_INPUT) {
  const events = [];
  for (let i = 0; i < steps; i++) {
    stepFighter(a, i === 0 ? press({ p1: true }) : NO_INPUT, [b]);
    stepFighter(b, bInput, [a]);
    events.push(...res(a));
  }
  return events;
}

describe('office battle powers', () => {
  it('staples fly across the room and hit from afar, then the power cools down', () => {
    const [a, b] = duel(['stapler', 'sprint']);
    b.x = 5;
    const events = cast(a, b);
    expect(events.some((e) => e.type === 'power' && e.power === 'stapler')).toBe(true);
    expect(b.hp).toBe(OFFICE.maxHp - POWER_TUNING.stapler.damage);
    expect(a.cds[0]).toBeGreaterThan(POWERS.stapler.cooldown - 1);
    // Pressing again while it cools down does nothing.
    cast(a, b, 3);
    expect(a.casts).toBe(1);
  });

  it('a staple stops at the furniture', () => {
    const [a, b] = duel(['stapler', 'sprint']);
    // Desk at x=-5, z=-2.6: shoot along it from the left side of the room.
    a.x = -7.5;
    a.z = -2.6;
    b.x = -2.5;
    b.z = -2.6;
    cast(a, b, 30);
    expect(b.hp).toBe(OFFICE.maxHp);
  });

  it('coffee goes through a block, folders stop everything', () => {
    const [a, b] = duel(['coffee', 'meeting']);
    b.action = 'block';
    cast(a, b, 4, press({ blk: true }));
    expect(b.hp).toBe(OFFICE.maxHp - POWER_TUNING.coffee.damage);

    const [c, d] = duel(['meeting', 'coffee']);
    d.powers = ['folders', 'sprint'];
    stepFighter(d, press({ p1: true }), [c]);
    expect(d.shieldT).toBeGreaterThan(0);
    const events = cast(c, d, 4);
    expect(events.map((e) => e.type)).toContain('shielded');
    expect(d.hp).toBe(OFFICE.maxHp);
  });

  it('a surprise meeting stuns everyone close, a bandage heals, sprint is faster', () => {
    const a = createFighter('a', 0, ['meeting', 'bandage']);
    const b = createFighter('b', 1);
    const c = createFighter('c', 2);
    a.x = 0;
    a.z = 0;
    b.x = 1.5;
    b.z = 0;
    c.x = -1;
    c.z = 1.4;
    const w = createWorld([a, b, c]);
    stepFighter(a, press({ p1: true }), [b, c]);
    resolveCombat(w);
    expect(b.action).toBe('stun');
    expect(c.action).toBe('stun');
    expect(b.stunFor).toBeCloseTo(POWER_TUNING.meeting.stun);
    expect(b.hp).toBe(OFFICE.maxHp - POWER_TUNING.meeting.damage);

    a.hp = 50;
    for (let i = 0; i < 20; i++) stepFighter(a, NO_INPUT, [b, c]);
    stepFighter(a, press({ p2: true }), [b, c]);
    resolveCombat(w);
    expect(a.hp).toBe(50 + POWER_TUNING.bandage.heal);

    const slow = createFighter('s', 0);
    const fast = createFighter('f', 0, ['sprint', 'stapler']);
    stepFighter(fast, press({ p1: true }), []);
    for (let i = 0; i < 6; i++) stepFighter(fast, NO_INPUT, []);
    const x0 = fast.x;
    for (let i = 0; i < 10; i++) {
      stepFighter(slow, press({ mx: 1 }), []);
      stepFighter(fast, press({ mx: 1 }), []);
    }
    expect(fast.x - x0).toBeGreaterThan((slow.x - OFFICE_SPAWNS_X) * 1.5);
  });

  it('in a free-for-all, whoever lasted longer ranks higher', () => {
    const s = officeMode.createState(1, ['a', 'b', 'c'], new Map([['a', ['coffee', 'sprint']], ['b', ['nope']]]));
    expect(s.fighters.get('a')!.powers).toEqual(['coffee', 'sprint']);
    // An invalid pick falls back to the default pair.
    expect(s.fighters.get('b')!.powers).toEqual(['stapler', 'folders']);
    const [a, b, c] = ['a', 'b', 'c'].map((id) => s.fighters.get(id)!) as [Fighter, Fighter, Fighter];
    b.hp = 0;
    b.out = 10;
    c.hp = 0;
    c.out = 40;
    expect(officeMode.isDone!(s, ['a', 'b', 'c'])).toBe(true);
    expect(officeMode.compare(s, 'a', 'c')).toBeGreaterThan(0);
    expect(officeMode.compare(s, 'c', 'b')).toBeGreaterThan(0);
    c.hp = 30;
    expect(officeMode.isDone!(s, ['a', 'b', 'c'])).toBe(false);
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
        inputs.push({ seq: ++seq, mx, mz, atk, blk: false, dge: false, p1: false, p2: false });
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

describe('private rooms', () => {
  it('a host creates a room, three friends join with the code and the fight starts for all four', async () => {
    const users = await Promise.all(['sa1', 'sa2', 'sa3', 'sa4', 'sa5'].map((n) => register(`${n}_${sfx}`)));
    const sockets = await Promise.all(users.map((u) => socketFor(u.cookie)));
    const [host, ...rest] = sockets as [Socket, ...Socket[]];
    const created = await host.emitWithAck('lobby:create');
    expect(created.ok).toBe(true);
    const code = created.code as string;
    expect(code).toHaveLength(5);
    expect(await host.emitWithAck('lobby:start')).toMatchObject({ ok: false });

    const states: any[] = [];
    host.on('lobby:state', (st: any) => states.push(st));
    for (const s of rest.slice(0, 3)) expect(await s.emitWithAck('lobby:join', { code: code.toLowerCase() })).toEqual({ ok: true });
    // The fifth player finds it full.
    expect(await rest[3]!.emitWithAck('lobby:join', { code })).toMatchObject({ ok: false });
    expect(await rest[3]!.emitWithAck('lobby:join', { code: 'ZZZZZ' })).toMatchObject({ ok: false });
    await sleep(100);
    expect(states.at(-1).members).toHaveLength(4);

    // Only the host starts.
    expect(await rest[0]!.emitWithAck('lobby:start')).toMatchObject({ ok: false });
    const started = sockets.slice(0, 4).map((s) => new Promise<any>((r) => s.once('lobby:started', r)));
    expect(await host.emitWithAck('lobby:start')).toEqual({ ok: true });
    const ids = new Set((await Promise.all(started)).map((x) => x.matchId));
    expect(ids.size).toBe(1);
    const matchId = [...ids][0] as string;

    // Everyone joins, picks powers and readies up; four fighters appear.
    const frame = new Promise<OfficeFrame>((r) => host.once('match:frame', ({ frame }: any) => r(frame)));
    for (const s of sockets.slice(0, 4)) expect(await s.emitWithAck('room:join', { matchId })).toEqual({ ok: true });
    host.emit('room:loadout', { matchId, powers: ['coffee', 'meeting'] });
    await sleep(100);
    for (const s of sockets.slice(0, 4)) s.emit('room:ready', { matchId });
    const first = await frame;
    expect(first.fighters).toHaveLength(4);
    const hostId = (await prisma.user.findFirstOrThrow({ where: { username: `sa1_${sfx}` } })).id;
    expect(first.fighters.find((f) => f.id === hostId)!.powers).toEqual(['coffee', 'meeting']);
    sockets.forEach((s) => s.disconnect());
  }, 30_000);

  it('the host leaving passes the room on, and the last one out closes it', async () => {
    const users = await Promise.all(['sb1', 'sb2'].map((n) => register(`${n}_${sfx}`)));
    const [a, b] = await Promise.all(users.map((u) => socketFor(u.cookie)));
    const { code } = await a!.emitWithAck('lobby:create');
    await b!.emitWithAck('lobby:join', { code });
    const next = new Promise<any>((r) => b!.on('lobby:state', (st: any) => st && st.members.length === 1 && r(st)));
    a!.emit('lobby:leave');
    const st = await next;
    expect(st.members).toHaveLength(1);
    expect(st.hostId).toBe(st.members[0].id);
    b!.emit('lobby:leave');
    await sleep(100);
    expect(await a!.emitWithAck('lobby:join', { code })).toMatchObject({ ok: false });
    a!.disconnect();
    b!.disconnect();
  });
});
