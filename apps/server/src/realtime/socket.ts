import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { queueJoinSchema, roomJoinSchema, timePingSchema, typingWordSchema } from '@inbox/shared';
import { SESSION_COOKIE, readCookie, userIdFromToken } from '../lib/auth';
import { setIO, toUser, userRoom, type IO } from './notify';
import { engine } from './matchEngine';
import { matchmaker } from './matchmaking';
import { markConnected, markDisconnected } from './presence';
import { friendIds } from '../lib/friends';

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

    socket.on('typing:word', (data) => {
      if (!allow()) return;
      const parsed = typingWordSchema.safeParse(data);
      if (!parsed.success || !joined.has(parsed.data.matchId)) return;
      engine.word(userId, parsed.data);
    });

    socket.on('queue:join', (data) => {
      if (!allow() || !queueJoinSchema.safeParse(data).success) return;
      void matchmaker.join(data.mode, userId).catch(() => {});
    });

    socket.on('queue:leave', () => matchmaker.leave(userId));

    socket.on('disconnect', () => {
      for (const matchId of joined) engine.leave(matchId, userId);
      joined.clear();
      if (markDisconnected(userId)) {
        matchmaker.leave(userId);
        void broadcastPresence(userId, false).catch(() => {});
      }
    });
  });

  setInterval(() => void matchmaker.tick().catch(() => {}), 2000).unref();
  return io;
}
