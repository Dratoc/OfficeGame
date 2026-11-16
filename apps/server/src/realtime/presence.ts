/** Who is online right now, counted by open sockets (a user may have several tabs). */
const sockets = new Map<string, number>();

export function isOnline(userId: string): boolean {
  return (sockets.get(userId) ?? 0) > 0;
}

/** Returns true when the user just came online. */
export function markConnected(userId: string): boolean {
  const n = (sockets.get(userId) ?? 0) + 1;
  sockets.set(userId, n);
  return n === 1;
}

/** Returns true when the user just went offline. */
export function markDisconnected(userId: string): boolean {
  const n = Math.max(0, (sockets.get(userId) ?? 0) - 1);
  if (n === 0) sockets.delete(userId);
  else sockets.set(userId, n);
  return n === 0;
}
