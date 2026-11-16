import type { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@inbox/shared';

export type IO = Server<ClientToServerEvents, ServerToClientEvents>;

let io: IO | null = null;

export function setIO(server: IO) {
  io = server;
}

export function getIO(): IO | null {
  return io;
}

export const userRoom = (userId: string) => `user:${userId}`;
export const matchRoom = (matchId: string) => `match:${matchId}`;

/** Sends an event to every open tab of a user. No-op if the server has no socket layer (tests). */
export function toUser<E extends keyof ServerToClientEvents>(userId: string, event: E, ...args: Parameters<ServerToClientEvents[E]>) {
  io?.to(userRoom(userId)).emit(event, ...args);
}
