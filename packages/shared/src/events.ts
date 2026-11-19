import { z } from 'zod';
import { MAX_WORD_LENGTH } from './typing';
import { LOBBY_MODES, PLAYABLE_MODES, type GameModeId, type LobbyModeId, type PlayableModeId } from './modes';
import type { Prompt } from './prompts';
import type { OfficeFrame, OfficeInputBatch, PowerId } from './office';
import type { ChairsFrame, ChairsInputBatch } from './chairs';
import type { SalesFrame, SalesInputBatch } from './sales';
import type { ZombieFrame, ZombieInputBatch } from './zombies';
import type { MagicFrame, MagicInputBatch } from './magic/net';
import type { MailDto, MatchSummaryDto, PublicUser } from './api';

/** Socket.IO protocol. Every client → server payload is validated with these schemas. */

export const roomJoinSchema = z.object({ matchId: z.string().min(1).max(40) });
export const roomReadySchema = z.object({ matchId: z.string().min(1).max(40) });
export const answerSchema = z.object({
  matchId: z.string().min(1).max(40),
  index: z.number().int().min(0).max(10_000),
  answer: z.string().max(MAX_WORD_LENGTH),
  /** Client estimate, in server time, of when the word was finished. */
  typedAt: z.number().finite(),
});
export const queueJoinSchema = z.object({ mode: z.enum(PLAYABLE_MODES) });
export const lobbyModeSchema = z.object({ mode: z.enum(LOBBY_MODES) });
export const timePingSchema = z.object({ t0: z.number().finite() });

export type RoomJoin = z.infer<typeof roomJoinSchema>;
export type Answer = z.infer<typeof answerSchema>;

export interface RoomPlayerState {
  user: PublicUser;
  connected: boolean;
  ready: boolean;
  correctWords: number;
  errors: number;
  nextIndex: number;
  /** Office Battle: the powers this player picked. */
  loadout?: PowerId[];
}

export interface RoomStateEvent {
  matchId: string;
  mode: GameModeId;
  phase: 'waiting' | 'countdown' | 'playing' | 'finished' | 'cancelled';
  players: RoomPlayerState[];
  startAt: number | null;
  endAt: number | null;
  serverNow: number;
}

export interface MatchGoEvent {
  matchId: string;
  mode: GameModeId;
  prompts: Prompt[];
  startAt: number;
  endAt: number;
}

export interface WordResultEvent {
  matchId: string;
  userId: string;
  index: number;
  correct: boolean;
  accepted: boolean;
  correctWords: number;
  errors: number;
  nextIndex: number;
}

/** A public match in progress that anyone can join (Zona Zombi). */
export interface LiveMatch {
  matchId: string;
  mode: GameModeId;
  players: PublicUser[];
  max: number;
  /** Wave being played, and seconds since the start. */
  wave: number;
  seconds: number;
}

export const liveJoinSchema = z.object({ matchId: z.string().min(1).max(40) });

/** A private room (Office Battle, Chair Race or A Toda Máquina) before the match starts. */
export interface LobbyState {
  code: string;
  /** What the host picked to play. */
  mode: LobbyModeId;
  hostId: string;
  members: PublicUser[];
  max: number;
}

export interface ServerToClientEvents {
  'mail:new': (mail: MailDto) => void;
  'challenge:accepted': (data: { challengeId: string; matchId: string }) => void;
  'room:state': (state: RoomStateEvent) => void;
  'match:go': (data: MatchGoEvent) => void;
  'match:word': (data: WordResultEvent) => void;
  'match:end': (summary: MatchSummaryDto) => void;
  /** Office Battle: the authoritative state of the fight, every simulation tick. */
  'match:frame': (data: { matchId: string; frame: OfficeFrame }) => void;
  /** Chair Race: the authoritative state of the race, every simulation tick. */
  'chairs:frame': (data: { matchId: string; frame: ChairsFrame }) => void;
  /** A Toda Máquina: the authoritative state of the shift, every simulation tick. */
  'sales:frame': (data: { matchId: string; frame: SalesFrame }) => void;
  /** Zona Zombi: the authoritative state of the map, every simulation tick. */
  'zombies:frame': (data: { matchId: string; frame: ZombieFrame }) => void;
  'magic:frame': (data: { matchId: string; frame: MagicFrame }) => void;
  /** Your private room changed; null when you are no longer in one. */
  'lobby:state': (state: LobbyState | null) => void;
  'lobby:started': (data: { matchId: string; mode?: LobbyModeId }) => void;
  'lobby:invited': (data: { code: string; from: PublicUser; mode?: LobbyModeId }) => void;
  /** A friend you invited turned the invitation down. */
  'lobby:declined': (data: { code: string; from: PublicUser }) => void;
  'error:message': (data: { message: string }) => void;
  'presence:update': (data: { userId: string; online: boolean }) => void;
  'friends:changed': () => void;
  'queue:status': (data: { searching: boolean; since: number | null; mode?: PlayableModeId; players?: number }) => void;
  'queue:matched': (data: { matchId: string; mode: PlayableModeId; opponent: PublicUser; opponents: PublicUser[] }) => void;
}

export interface ClientToServerEvents {
  'time:ping': (data: { t0: number }, ack: (res: { t0: number; server: number }) => void) => void;
  'room:join': (data: RoomJoin, ack: (res: { ok: boolean; error?: string }) => void) => void;
  'room:leave': (data: RoomJoin) => void;
  'room:ready': (data: RoomJoin) => void;
  'match:answer': (data: Answer) => void;
  /** Office Battle: a few steps of input (move, attack, block, dodge). */
  'office:input': (data: OfficeInputBatch) => void;
  /** Chair Race: a few steps of input (steer, throttle, throw, hop). */
  'chairs:input': (data: ChairsInputBatch) => void;
  /** A Toda Máquina: a few steps of input (move, press or hold the action). */
  'sales:input': (data: SalesInputBatch) => void;
  /** Zona Zombi: a few steps of input (move, fight, use, shop). */
  'zombies:input': (data: ZombieInputBatch) => void;
  'magic:input': (data: MagicInputBatch) => void;
  /** Zona Zombi: the public matches being played right now. */
  'zombies:list': (ack: (res: LiveMatch[]) => void) => void;
  /** Zona Zombi: start a public match right away, alone. Others can join it while it lasts. */
  'zombies:start': (ack: (res: { ok: boolean; error?: string; matchId?: string }) => void) => void;
  /** Zona Zombi: jump into a public match in progress. */
  'zombies:join': (data: { matchId: string }, ack: (res: { ok: boolean; error?: string }) => void) => void;
  /** Office Battle: pick two powers in the lobby. */
  'room:loadout': (data: { matchId: string; powers: PowerId[] }) => void;
  /** The mode is optional; without it the room plays Office Battle. */
  'lobby:create': (data: { mode?: LobbyModeId }, ack: (res: { ok: boolean; error?: string; code?: string }) => void) => void;
  /** The host changes what the room will play. */
  'lobby:mode': (data: { mode: LobbyModeId }) => void;
  'lobby:join': (data: { code: string }, ack: (res: { ok: boolean; error?: string }) => void) => void;
  'lobby:leave': () => void;
  'lobby:start': (ack: (res: { ok: boolean; error?: string }) => void) => void;
  'lobby:invite': (data: { userId: string }) => void;
  'lobby:decline': (data: { code: string }) => void;
  'queue:join': (data: { mode: PlayableModeId }) => void;
  'queue:leave': () => void;
}
