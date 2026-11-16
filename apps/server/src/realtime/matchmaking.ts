import { GAME_MODES, RACE_FILL_MS, type PlayableModeId } from '@inbox/shared';
import { prisma } from '../lib/db';
import { createMatch } from '../lib/matches';
import { getPublicUser } from '../lib/users';
import { toUser } from './notify';

interface Ticket {
  userId: string;
  rating: number;
  since: number;
}

/**
 * Quick match queue. One queue per mode, held in memory by the process that also runs
 * the matches. Pairs the waiting player with the closest rating; the allowed rating gap
 * widens the longer someone waits, so nobody waits forever. Modes for 3 or 4 players (races)
 * gather a group instead: they start full, or with whoever is there once the first waited a while.
 */
export class Matchmaker {
  private queues = new Map<PlayableModeId, Ticket[]>();
  private busy = false;

  constructor(private now: () => number = Date.now) {}

  private queue(mode: PlayableModeId) {
    let q = this.queues.get(mode);
    if (!q) this.queues.set(mode, (q = []));
    return q;
  }

  isQueued(userId: string): boolean {
    return [...this.queues.values()].some((q) => q.some((t) => t.userId === userId));
  }

  async join(mode: PlayableModeId, userId: string): Promise<void> {
    if (this.isQueued(userId)) {
      toUser(userId, 'queue:status', { searching: true, since: this.ticket(userId)?.since ?? this.now(), mode: this.modeOf(userId) });
      return;
    }
    const stats = await prisma.playerStats.findUnique({ where: { userId }, select: { rating: true } });
    const ticket: Ticket = { userId, rating: stats?.rating ?? 1000, since: this.now() };
    this.queue(mode).push(ticket);
    toUser(userId, 'queue:status', { searching: true, since: ticket.since, mode });
    await this.tryPair(mode);
    this.announce(mode);
  }

  leave(userId: string) {
    let removed = false;
    for (const [mode, q] of this.queues) {
      const next = q.filter((t) => t.userId !== userId);
      if (next.length !== q.length) {
        removed = true;
        this.queues.set(mode, next);
        this.announce(mode);
      }
    }
    if (removed) toUser(userId, 'queue:status', { searching: false, since: null });
  }

  private modeOf(userId: string): PlayableModeId | undefined {
    for (const [mode, q] of this.queues) if (q.some((t) => t.userId === userId)) return mode;
    return undefined;
  }

  /** Group modes tell everyone waiting how many runners are in. */
  private announce(mode: PlayableModeId) {
    if (GAME_MODES[mode].maxPlayers <= 2) return;
    const q = this.queue(mode);
    for (const t of q) toUser(t.userId, 'queue:status', { searching: true, since: t.since, mode, players: q.length });
  }

  private async start(mode: PlayableModeId, tickets: Ticket[]) {
    const q = this.queue(mode);
    for (const t of tickets) q.splice(q.indexOf(t), 1);
    const ids = tickets.map((t) => t.userId);
    const matchId = await createMatch(mode, ids);
    const users = await Promise.all(ids.map((id) => getPublicUser(id)));
    ids.forEach((id, i) => {
      const opponents = users.filter((_, j) => j !== i).map((u) => u!);
      toUser(id, 'queue:matched', { matchId, mode, opponent: opponents[0]!, opponents });
    });
  }

  private ticket(userId: string) {
    for (const q of this.queues.values()) {
      const t = q.find((x) => x.userId === userId);
      if (t) return t;
    }
    return undefined;
  }

  /** Allowed rating gap: 150 at first, +50 every 5 seconds of waiting. */
  private gap(t: Ticket) {
    return 150 + Math.floor((this.now() - t.since) / 5000) * 50;
  }

  async tryPair(mode: PlayableModeId): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const q = this.queue(mode);
      const { minPlayers, maxPlayers } = GAME_MODES[mode];
      if (maxPlayers > 2) {
        while (q.length >= maxPlayers) await this.start(mode, q.slice(0, maxPlayers));
        if (q.length >= minPlayers && this.now() - q[0]!.since >= RACE_FILL_MS) await this.start(mode, [...q]);
        return;
      }
      while (q.length >= 2) {
        const a = q[0]!;
        let best: Ticket | null = null;
        for (const b of q.slice(1)) {
          const diff = Math.abs(a.rating - b.rating);
          if (diff <= Math.max(this.gap(a), this.gap(b)) && (!best || diff < Math.abs(a.rating - best.rating))) best = b;
        }
        if (!best) break;
        await this.start(mode, [a, best]);
      }
    } finally {
      this.busy = false;
    }
  }

  /** Re-checks every queue so widening gaps can pair players who were too far apart. */
  async tick() {
    for (const mode of this.queues.keys()) await this.tryPair(mode);
  }
}

export const matchmaker = new Matchmaker();
