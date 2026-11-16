import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@inbox/shared';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: GameSocket | null = null;
/** serverTime ≈ Date.now() + clockOffset */
let clockOffset = 0;

export function getSocket(): GameSocket {
  if (!socket) socket = io({ withCredentials: true, transports: ['websocket', 'polling'] });
  return socket;
}

export function closeSocket() {
  socket?.close();
  socket = null;
}

export const serverNow = () => Date.now() + clockOffset;

/**
 * Estimates the offset between this browser's clock and the server's with a few pings,
 * keeping the sample with the lowest round trip (the least distorted by the network).
 */
export async function syncClock(samples = 5): Promise<{ offset: number; rtt: number }> {
  const s = getSocket();
  let best = { offset: 0, rtt: Infinity };
  for (let i = 0; i < samples; i++) {
    const t0 = Date.now();
    const res = await s.timeout(2000).emitWithAck('time:ping', { t0 }).catch(() => null);
    if (!res) continue;
    const t1 = Date.now();
    const rtt = t1 - t0;
    if (rtt < best.rtt) best = { rtt, offset: res.server - (t0 + rtt / 2) };
  }
  if (best.rtt !== Infinity) clockOffset = best.offset;
  return best;
}
