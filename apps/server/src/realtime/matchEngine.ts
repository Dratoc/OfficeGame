import { randomInt } from 'node:crypto';
import {
  COUNTDOWN_MS,
  LATE_GRACE_MS,
  RECONNECT_WINDOW_MS,
  type GameModeId,
  type PublicUser,
  type RoomStateEvent,
  type Answer,
  type OfficeInputBatch,
  type ChairsInputBatch,
  type SalesInputBatch,
  type ZombieInputBatch,
  type LiveMatch,
  DROP_IN_MODES,
  GAME_MODES,
  type PowerId,
} from '@inbox/shared';
import { prisma } from '../lib/db';
import { publicUserSelect, toPublicUser } from '../lib/users';
import { finalizeMatch, getMatchSummary } from '../lib/matches';
import { MODE_REGISTRY } from '../modes/registry';
import type { GameMode } from '../modes/types';
import type { SequenceActionResult } from '../modes/sequence';
import { getIO, matchRoom } from './notify';

type Phase = RoomStateEvent['phase'];

interface Room {
  matchId: string;
  modeId: GameModeId;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mode: GameMode<any, any, any, any>;
  players: Map<string, { user: PublicUser; sockets: number; ready: boolean }>;
  phase: Phase;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  state: any;
  startAt: number | null;
  endAt: number | null;
  timers: NodeJS.Timeout[];
  /** Simulation loop of real-time modes. */
  loop: NodeJS.Timeout | null;
  dropTimers: Map<string, NodeJS.Timeout>;
  /** What each player picked in the lobby (Office Battle powers). */
  options: Map<string, unknown>;
  abandoned: Set<string>;
  finishing: Promise<void> | null;
}

/**
 * Authoritative match rooms. One process holds the live state of each match in memory;
 * the database holds everything that must survive (match, words, results). Scaling to
 * several processes means pinning a match to one process (sticky sessions or a Redis adapter).
 */
export class MatchEngine {
  private rooms = new Map<string, Room>();
  private loading = new Map<string, Promise<Room | null>>();

  constructor(private now: () => number = Date.now) {}

  private async loadRoom(matchId: string): Promise<Room | null> {
    const existing = this.rooms.get(matchId);
    if (existing) return existing;
    const pending = this.loading.get(matchId);
    if (pending) return pending;
    const p = (async () => {
      const match = await prisma.match.findUnique({
        where: { id: matchId },
        include: { participants: { include: { user: { select: publicUserSelect } } } },
      });
      if (!match) return null;
      if (match.status === 'countdown' || match.status === 'playing') {
        // The server restarted mid-match: live state is gone, so the match is void.
        await prisma.match.update({ where: { id: matchId }, data: { status: 'cancelled', endedAt: new Date() } });
        return null;
      }
      if (match.status !== 'waiting') return null;
      const mode = MODE_REGISTRY[match.mode as GameModeId];
      if (!mode) return null;
      const room: Room = {
        matchId,
        modeId: match.mode as GameModeId,
        mode,
        players: new Map(match.participants.map((p) => [p.userId, { user: toPublicUser(p.user), sockets: 0, ready: false }])),
        phase: 'waiting',
        state: null,
        startAt: null,
        endAt: null,
        timers: [],
        loop: null,
        dropTimers: new Map(),
        options: new Map(),
        abandoned: new Set(),
        finishing: null,
      };
      this.rooms.set(matchId, room);
      return room;
    })();
    this.loading.set(matchId, p);
    try {
      return await p;
    } finally {
      this.loading.delete(matchId);
    }
  }

  snapshot(room: Room): RoomStateEvent {
    return {
      matchId: room.matchId,
      mode: room.modeId,
      phase: room.phase,
      startAt: room.startAt,
      endAt: room.endAt,
      serverNow: this.now(),
      players: [...room.players.entries()].map(([id, p]) => {
        const s = room.state?.players?.get(id);
        return {
          user: p.user,
          connected: p.sockets > 0,
          ready: p.ready,
          correctWords: s?.correctWords ?? 0,
          errors: s?.errors ?? 0,
          nextIndex: s?.nextIndex ?? 0,
          ...(room.options.has(id) ? { loadout: room.options.get(id) as PowerId[] } : {}),
        };
      }),
    };
  }

  private broadcast(room: Room) {
    getIO()?.to(matchRoom(room.matchId)).emit('room:state', this.snapshot(room));
  }

  /** A socket of `userId` joins the match. Returns an error message or null. */
  async join(matchId: string, userId: string, socket: { join: (r: string) => void; emit: (...a: any[]) => void }): Promise<string | null> {
    const room = await this.loadRoom(matchId);
    if (!room) {
      const summary = await getMatchSummary(matchId);
      if (!summary || !summary.participants.some((p) => p.user.id === userId)) return 'Esta partida no existe';
      if (summary.status === 'finished') {
        socket.emit('match:end', summary);
        return null;
      }
      return 'Esta partida fue cancelada';
    }
    const player = room.players.get(userId);
    if (!player) return 'No participas en esta partida';
    socket.join(matchRoom(matchId));
    player.sockets++;
    const drop = room.dropTimers.get(userId);
    if (drop) {
      clearTimeout(drop);
      room.dropTimers.delete(userId);
    }
    if (room.phase === 'playing' && room.state) {
      socket.emit('match:go', { matchId, mode: room.modeId, prompts: room.mode.startPayload(room.state).prompts, startAt: room.startAt!, endAt: room.endAt! });
    }
    this.broadcast(room);
    return null;
  }

  leave(matchId: string, userId: string) {
    const room = this.rooms.get(matchId);
    const player = room?.players.get(userId);
    if (!room || !player) return;
    player.sockets = Math.max(0, player.sockets - 1);
    if (player.sockets === 0) {
      if (room.phase === 'waiting') player.ready = false;
      if (room.phase === 'countdown' || room.phase === 'playing') {
        room.dropTimers.set(
          userId,
          setTimeout(() => {
            room.dropTimers.delete(userId);
            if (room.players.get(userId)!.sockets > 0) return;
            room.abandoned.add(userId);
            const remaining = [...room.players.keys()].filter((id) => !room.abandoned.has(id));
            // A team keeps playing while anyone is left; a fight needs a rival.
            if (remaining.length <= (room.mode.teamResult ? 0 : 1) || (room.state && room.mode.isDone?.(room.state, remaining))) void this.finish(room);
          }, RECONNECT_WINDOW_MS),
        );
      }
    }
    this.broadcast(room);
  }

  async ready(matchId: string, userId: string) {
    const room = this.rooms.get(matchId);
    const player = room?.players.get(userId);
    if (!room || !player || room.phase !== 'waiting' || player.sockets === 0) return;
    player.ready = true;
    const all = [...room.players.values()];
    if (all.length >= room.mode.minPlayers && all.every((p) => p.ready && p.sockets > 0)) {
      await this.startCountdown(room);
    } else {
      this.broadcast(room);
    }
  }

  /** A player picks their powers in the lobby. Locked once the countdown starts. */
  setOption(matchId: string, userId: string, value: unknown) {
    const room = this.rooms.get(matchId);
    if (!room || !room.players.has(userId) || room.phase !== 'waiting') return;
    room.options.set(userId, value);
    this.broadcast(room);
  }

  private async startCountdown(room: Room) {
    room.phase = 'countdown';
    const seed = randomInt(1, 2 ** 31 - 1);
    room.state = room.mode.createState(seed, [...room.players.keys()], room.options);
    const now = this.now();
    room.startAt = now + COUNTDOWN_MS;
    room.endAt = room.startAt + room.mode.durationMs;
    await prisma.match.update({
      where: { id: room.matchId },
      data: { status: 'playing', seed, words: room.mode.startPayload(room.state).answers, startedAt: new Date(room.startAt) },
    });
    this.broadcast(room);
    // Real-time modes tick from the countdown on, so players see the arena before the start.
    if (room.mode.tick) room.loop = setInterval(() => this.tick(room), room.mode.tickMs ?? 50);
    room.timers.push(
      setTimeout(() => {
        room.phase = 'playing';
        // The words are only revealed when the match starts, to both players at once.
        getIO()?.to(matchRoom(room.matchId)).emit('match:go', {
          matchId: room.matchId,
          mode: room.modeId,
          prompts: room.mode.startPayload(room.state).prompts,
          startAt: room.startAt!,
          endAt: room.endAt!,
        });
        this.broadcast(room);
      }, Math.max(0, room.startAt - this.now())),
      setTimeout(() => void this.finish(room), Math.max(0, room.endAt - this.now() + LATE_GRACE_MS)),
    );
  }

  answer(userId: string, data: Answer): SequenceActionResult | null {
    const room = this.rooms.get(data.matchId);
    if (!room || !room.state || !room.players.has(userId) || room.mode.tick) return null;
    if (room.phase !== 'playing' && room.phase !== 'countdown') return null;
    if (room.abandoned.has(userId)) return null;
    const res = room.mode.applyAction(room.state, userId, data, { now: this.now(), startAt: room.startAt!, endAt: room.endAt! }) as SequenceActionResult;
    if (res.accepted && room.mode.isDone?.(room.state, [...room.players.keys()].filter((id) => !room.abandoned.has(id)))) {
      // Everyone crossed the finish line: no need to wait for the clock.
      setTimeout(() => void this.finish(room), 0);
    }
    if (res.stats) {
      getIO()
        ?.to(matchRoom(room.matchId))
        .emit('match:word', {
          matchId: room.matchId,
          userId,
          index: data.index,
          correct: res.correct,
          accepted: res.accepted,
          correctWords: res.stats.correctWords,
          errors: res.stats.errors,
          nextIndex: res.stats.nextIndex,
        });
    }
    return res;
  }

  private activeIds(room: Room): string[] {
    return [...room.players.entries()].filter(([id, p]) => p.sockets > 0 && !room.abandoned.has(id)).map(([id]) => id);
  }

  /** One step of a real-time mode: run the simulation and send the frame to everyone. */
  tick(room: Room) {
    if ((room.phase !== 'playing' && room.phase !== 'countdown') || !room.state || !room.mode.tick || room.finishing) return;
    const frame = room.mode.tick(room.state, { now: this.now(), startAt: room.startAt!, endAt: room.endAt!, activeIds: this.activeIds(room) });
    if (frame) {
      const io = getIO()?.to(matchRoom(room.matchId));
      if (room.modeId === 'chairs') io?.emit('chairs:frame', { matchId: room.matchId, frame });
      else if (room.modeId === 'sales') io?.emit('sales:frame', { matchId: room.matchId, frame });
      else if (room.modeId === 'zombies') io?.emit('zombies:frame', { matchId: room.matchId, frame });
      else io?.emit('match:frame', { matchId: room.matchId, frame });
    }
    const remaining = [...room.players.keys()].filter((id) => !room.abandoned.has(id));
    if (room.mode.isDone?.(room.state, remaining)) {
      // A knockout ends the fight (or everyone crossed the line); leave a moment for it to play out.
      if (room.loop) clearInterval(room.loop);
      room.loop = null;
      room.timers.push(setTimeout(() => void this.finish(room), 1200));
    }
  }

  /** Inputs of a real-time mode (Office Battle, Chair Race, A Toda Máquina). The mode must match the input kind. */
  input(userId: string, data: OfficeInputBatch | ChairsInputBatch | SalesInputBatch | ZombieInputBatch, kind: 'office' | 'chairs' | 'sales' | 'zombies' = 'office'): boolean {
    const room = this.rooms.get(data.matchId);
    if (!room || !room.state || !room.mode.tick || !room.players.has(userId) || room.modeId !== kind) return false;
    if (room.phase !== 'playing' && room.phase !== 'countdown') return false;
    if (room.abandoned.has(userId)) return false;
    const res = room.mode.applyAction(room.state, userId, { inputs: data.inputs }, { now: this.now(), startAt: room.startAt!, endAt: room.endAt! }) as { accepted: boolean };
    return res.accepted;
  }

  async finish(room: Room): Promise<void> {
    if (room.finishing) return room.finishing;
    room.finishing = (async () => {
      if (room.loop) clearInterval(room.loop);
      room.loop = null;
      room.timers.forEach(clearTimeout);
      room.dropTimers.forEach(clearTimeout);
      room.phase = 'finished';
      const ids = [...room.players.keys()];
      const summary = await finalizeMatch({
        matchId: room.matchId,
        mode: room.modeId,
        outcomes: ids.map((id) => room.mode.outcome(room.state, id)),
        abandoned: room.abandoned,
        compare: (a, b) => room.mode.compare(room.state, a, b),
        teamResult: room.mode.teamResult?.(room.state),
      });
      this.broadcast(room);
      getIO()?.to(matchRoom(room.matchId)).emit('match:end', summary);
      setTimeout(() => this.rooms.delete(room.matchId), 60_000).unref();
    })();
    return room.finishing;
  }

  /** Public matches of drop-in modes being played right now, for anyone to join. */
  live(): LiveMatch[] {
    const now = this.now();
    const out: LiveMatch[] = [];
    for (const room of this.rooms.values()) {
      if (!DROP_IN_MODES.includes(room.modeId) || room.finishing || !room.state) continue;
      if (room.phase !== 'playing' && room.phase !== 'countdown') continue;
      const players = [...room.players.entries()].filter(([id, p]) => !room.abandoned.has(id) && p.sockets > 0).map(([, p]) => p.user);
      if (!players.length) continue;
      out.push({
        matchId: room.matchId,
        mode: room.modeId,
        players,
        max: GAME_MODES[room.modeId].maxPlayers,
        wave: room.state.world?.wave ?? 0,
        seconds: Math.max(0, Math.round((now - (room.startAt ?? now)) / 1000)),
      });
    }
    return out.sort((a, b) => b.players.length - a.players.length);
  }

  /**
   * Someone jumps into a public match in progress. They become a participant (results, XP and
   * doubloons included) and the mode adds them to the live state. Returns an error or null.
   */
  async joinLive(matchId: string, user: PublicUser): Promise<string | null> {
    const room = this.rooms.get(matchId);
    if (!room || !DROP_IN_MODES.includes(room.modeId) || !room.mode.addPlayer || !room.state) return 'Esta partida ya no está disponible';
    if (room.finishing || (room.phase !== 'playing' && room.phase !== 'countdown')) return 'Esta partida ya terminó';
    if (room.mode.isDone?.(room.state, this.activeIds(room))) return 'Esta partida ya terminó';
    if (room.players.has(user.id)) {
      room.abandoned.delete(user.id);
      return null;
    }
    const active = [...room.players.keys()].filter((id) => !room.abandoned.has(id)).length;
    if (active >= GAME_MODES[room.modeId].maxPlayers) return `La partida está llena (${active} de ${GAME_MODES[room.modeId].maxPlayers})`;
    await prisma.matchParticipant.create({ data: { matchId, userId: user.id } });
    room.players.set(user.id, { user, sockets: 0, ready: true });
    room.mode.addPlayer(room.state, user.id);
    this.broadcast(room);
    return null;
  }

  /** For tests. */
  getRoom(matchId: string) {
    return this.rooms.get(matchId);
  }
}

export const engine = new MatchEngine();
