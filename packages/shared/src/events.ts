import { z } from 'zod';
import { MAX_WORD_LENGTH } from './typing';
import type { MailDto, MatchSummaryDto, PublicUser } from './api';

/** Socket.IO protocol. Every client → server payload is validated with these schemas. */

export const roomJoinSchema = z.object({ matchId: z.string().min(1).max(40) });
export const roomReadySchema = z.object({ matchId: z.string().min(1).max(40) });
export const typingWordSchema = z.object({
  matchId: z.string().min(1).max(40),
  index: z.number().int().min(0).max(10_000),
  word: z.string().max(MAX_WORD_LENGTH),
  /** Client estimate, in server time, of when the word was finished. */
  typedAt: z.number().finite(),
});
export const timePingSchema = z.object({ t0: z.number().finite() });

export type RoomJoin = z.infer<typeof roomJoinSchema>;
export type TypingWord = z.infer<typeof typingWordSchema>;

export interface RoomPlayerState {
  user: PublicUser;
  connected: boolean;
  ready: boolean;
  correctWords: number;
  errors: number;
  nextIndex: number;
}

export interface RoomStateEvent {
  matchId: string;
  phase: 'waiting' | 'countdown' | 'playing' | 'finished' | 'cancelled';
  players: RoomPlayerState[];
  startAt: number | null;
  endAt: number | null;
  serverNow: number;
}

export interface MatchGoEvent {
  matchId: string;
  words: string[];
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

export interface ServerToClientEvents {
  'mail:new': (mail: MailDto) => void;
  'challenge:accepted': (data: { challengeId: string; matchId: string }) => void;
  'room:state': (state: RoomStateEvent) => void;
  'match:go': (data: MatchGoEvent) => void;
  'match:word': (data: WordResultEvent) => void;
  'match:end': (summary: MatchSummaryDto) => void;
  'error:message': (data: { message: string }) => void;
}

export interface ClientToServerEvents {
  'time:ping': (data: { t0: number }, ack: (res: { t0: number; server: number }) => void) => void;
  'room:join': (data: RoomJoin, ack: (res: { ok: boolean; error?: string }) => void) => void;
  'room:leave': (data: RoomJoin) => void;
  'room:ready': (data: RoomJoin) => void;
  'typing:word': (data: TypingWord) => void;
}
