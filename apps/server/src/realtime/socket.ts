import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { queueJoinSchema, roomJoinSchema, timePingSchema, answerSchema, officeInputBatchSchema, chairsInputBatchSchema, salesInputBatchSchema, zombieInputBatchSchema, liveJoinSchema, lobbyModeSchema, loadoutPickSchema, lobbyCodeSchema, lobbyInviteSchema } from '@inbox/shared';
import { SESSION_COOKIE, readCookie, userIdFromToken } from '../lib/auth';
import { setIO, toUser, userRoom, type IO } from './notify';
import { engine } from './matchEngine';
import { matchmaker } from './matchmaking';
import { lobbies } from './lobbies';
import { markConnected, markDisconnected } from './presence';
import { friendIds } from '../lib/friends';
import { createMatch } from '../lib/matches';
import { getPublicUser } from '../lib/users';

async function broadcastPresence(userId: string, online: boolean) {
  for (const id of await friendIds(userId)) toUser(id, 'presence:update', { userId, online });
}

/** Simple per-socket token bucket so a client cannot flood the engine. */
function limiter(perSecond: number) {
  let tokens = perSecond;
  let last = Date.now();
  return () => {
    const now = Date.now();
    tokens = Math.min(perSecond, tokens + ((now - last) / 1000) * perSecond);
    last = now;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}

export function attachSocket(server: HttpServer): IO {
  const io: IO = new Server(server, { serveClient: false, cors: { origin: false } });
  setIO(io);

  io.use(async (socket, next) => {
    const token = readCookie(socket.handshake.headers.cookie, SESSION_COOKIE);
    const userId = await userIdFromToken(token);
    if (!userId) return next(new Error('unauthorized'));
    socket.data.userId = userId;
    next();
  });

  io.on('connection', (socket) => {
    const userId: string = socket.data.userId;
    const joined = new Set<string>();
    const allow = limiter(30);
    // Office Battle sends a small batch of input steps about 15 times a second.
    const allowInput = limiter(40);
    socket.join(userRoom(userId));
    if (markConnected(userId)) void broadcastPresence(userId, true).catch(() => {});

    socket.on('time:ping', (data, ack) => {
      if (typeof ack !== 'function' || !timePingSchema.safeParse(data).success) return;
      ack({ t0: data.t0, server: Date.now() });
    });

    socket.on('room:join', async (data, ack) => {
      const parsed = roomJoinSchema.safeParse(data);
      if (!parsed.success || typeof ack !== 'function') return;
      if (joined.has(parsed.data.matchId)) return ack({ ok: true });
      const error = await engine.join(parsed.data.matchId, userId, socket);
      if (!error) joined.add(parsed.data.matchId);
      ack(error ? { ok: false, error } : { ok: true });
    });

    socket.on('room:leave', (data) => {
      const parsed = roomJoinSchema.safeParse(data);
      if (!parsed.success || !joined.has(parsed.data.matchId)) return;
      joined.delete(parsed.data.matchId);
      socket.leave(`match:${parsed.data.matchId}`);
      engine.leave(parsed.data.matchId, userId);
    });

    socket.on('room:ready', (data) => {
      const parsed = roomJoinSchema.safeParse(data);
      if (!parsed.success || !joined.has(parsed.data.matchId)) return;
      void engine.ready(parsed.data.matchId, userId);
    });

    socket.on('match:answer', (data) => {
      if (!allow()) return;
      const parsed = answerSchema.safeParse(data);
      if (!parsed.success || !joined.has(parsed.data.matchId)) return;
      engine.answer(userId, parsed.data);
    });

    socket.on('office:input', (data) => {
      if (!allowInput()) return;
      const parsed = officeInputBatchSchema.safeParse(data);
      if (!parsed.success || !joined.has(parsed.data.matchId)) return;
      engine.input(userId, parsed.data, 'office');
    });

    socket.on('chairs:input', (data) => {
      if (!allowInput()) return;
      const parsed = chairsInputBatchSchema.safeParse(data);
      if (!parsed.success || !joined.has(parsed.data.matchId)) return;
      engine.input(userId, parsed.data, 'chairs');
    });

    socket.on('sales:input', (data) => {
      if (!allowInput()) return;
      const parsed = salesInputBatchSchema.safeParse(data);
      if (!parsed.success || !joined.has(parsed.data.matchId)) return;
      engine.input(userId, parsed.data, 'sales');
    });

    socket.on('zombies:input', (data) => {
      if (!allowInput()) return;
      const parsed = zombieInputBatchSchema.safeParse(data);
      if (!parsed.success || !joined.has(parsed.data.matchId)) return;
      engine.input(userId, parsed.data, 'zombies');
    });

    // Zona Zombi matches are public: anyone can see them and jump in while they last.
    socket.on('zombies:list', (ack) => {
      if (typeof ack !== 'function' || !allow()) return;
      ack(engine.live());
    });
    socket.on('zombies:start', async (ack) => {
      if (typeof ack !== 'function' || !allow()) return;
      matchmaker.leave(userId);
      lobbies.leave(userId);
      const matchId = await createMatch('zombies', [userId]).catch(() => null);
      ack(matchId ? { ok: true, matchId } : { ok: false, error: 'No se pudo crear la partida' });
    });
    socket.on('zombies:join', async (data, ack) => {
      if (typeof ack !== 'function' || !allow()) return;
      const parsed = liveJoinSchema.safeParse(data);
      if (!parsed.success) return ack({ ok: false, error: 'Partida inválida' });
      const user = await getPublicUser(userId).catch(() => null);
      if (!user) return ack({ ok: false, error: 'No se pudo entrar' });
      matchmaker.leave(userId);
      lobbies.leave(userId);
      const error = await engine.joinLive(parsed.data.matchId, user).catch(() => 'No se pudo entrar a la partida');
      ack(error ? { ok: false, error } : { ok: true });
    });

    socket.on('room:loadout', (data) => {
      if (!allow()) return;
      const parsed = loadoutPickSchema.safeParse(data);
      if (!parsed.success || !joined.has(parsed.data.matchId)) return;
      engine.setOption(parsed.data.matchId, userId, parsed.data.powers);
    });

    // Private rooms (Office Battle, Chair Race or A Toda Máquina).
    socket.on('lobby:create', async (data, cb) => {
      // Older clients send only the callback: those rooms play Office Battle.
      const ack = typeof data === 'function' ? (data as typeof cb) : cb;
      if (typeof ack !== 'function' || !allow()) return;
      const parsed = lobbyModeSchema.safeParse(data);
      matchmaker.leave(userId);
      const code = await lobbies.create(userId, parsed.success ? parsed.data.mode : 'office').catch(() => null);
      ack(code ? { ok: true, code } : { ok: false, error: 'No se pudo crear la sala' });
    });
    socket.on('lobby:mode', (data) => {
      if (!allow()) return;
      const parsed = lobbyModeSchema.safeParse(data);
      if (parsed.success) void lobbies.setMode(userId, parsed.data.mode).catch(() => {});
    });
    socket.on('lobby:join', async (data, ack) => {
      if (typeof ack !== 'function' || !allow()) return;
      const parsed = lobbyCodeSchema.safeParse(data);
      if (!parsed.success) return ack({ ok: false, error: 'El código tiene 5 caracteres' });
      matchmaker.leave(userId);
      const error = await lobbies.join(parsed.data.code, userId).catch(() => 'No se pudo entrar a la sala');
      ack(error ? { ok: false, error } : { ok: true });
    });
    socket.on('lobby:leave', () => lobbies.leave(userId));
    socket.on('lobby:start', async (ack) => {
      if (typeof ack !== 'function' || !allow()) return;
      const error = await lobbies.start(userId).catch(() => 'No se pudo empezar la pelea');
      ack(error ? { ok: false, error } : { ok: true });
    });
    socket.on('lobby:invite', (data) => {
      if (!allow()) return;
      const parsed = lobbyInviteSchema.safeParse(data);
      if (parsed.success) void lobbies.invite(userId, parsed.data.userId).catch(() => {});
    });

    socket.on('queue:join', (data) => {
      if (!allow() || !queueJoinSchema.safeParse(data).success) return;
      lobbies.leave(userId);
      void matchmaker.join(data.mode, userId).catch(() => {});
    });

    socket.on('queue:leave', () => matchmaker.leave(userId));

    socket.on('disconnect', () => {
      for (const matchId of joined) engine.leave(matchId, userId);
      joined.clear();
      if (markDisconnected(userId)) {
        matchmaker.leave(userId);
        lobbies.leave(userId);
        void broadcastPresence(userId, false).catch(() => {});
      }
    });
  });

  setInterval(() => void matchmaker.tick().catch(() => {}), 2000).unref();
  return io;
}
