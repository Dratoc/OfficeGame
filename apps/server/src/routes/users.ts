import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { avatarConfigSchema, validateAvatar, type GameModeId, type HistoryEntryDto, type LeaderboardEntryDto, type MatchResult, type MeDto, type ProfileDto } from '@inbox/shared';
import { prisma } from '../lib/db';
import { requireUser } from '../lib/auth';
import { badRequest, notFound } from '../lib/errors';
import { getPublicUser, getStatsDto, hasPlayed, publicUserSelect, toPublicUser } from '../lib/users';
import { winRate } from '@inbox/shared';
import { friendStatus } from '../lib/friends';
import { isOnline } from '../realtime/presence';

async function history(userId: string, take = 20): Promise<HistoryEntryDto[]> {
  const rows = await prisma.matchParticipant.findMany({
    where: { userId, match: { status: 'finished' } },
    orderBy: { match: { endedAt: 'desc' } },
    take,
    include: { match: { include: { participants: { include: { user: { select: publicUserSelect } } } } } },
  });
  return rows.map((r) => {
    const opp = r.match.participants.find((p) => p.userId !== userId);
    return {
      matchId: r.matchId,
      mode: r.match.mode as GameModeId,
      endedAt: r.match.endedAt!.toISOString(),
      result: (r.result ?? 'draw') as MatchResult,
      opponent: opp ? toPublicUser(opp.user) : null,
      correctWords: r.correctWords,
      wpm: r.wpm,
      ratingDelta: (r.ratingAfter ?? 0) - (r.ratingBefore ?? 0),
    };
  });
}

export async function userRoutes(app: FastifyInstance) {
  app.get('/api/me', async (req) => {
    const userId = await requireUser(req);
    const user = await getPublicUser(userId);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, inventory: { select: { itemId: true } } } });
    const me: MeDto = { ...user!, email: row.email, stats: await getStatsDto(userId), inventory: row.inventory.map((i) => i.itemId) };
    return me;
  });

  app.get('/api/users', async (req) => {
    const userId = await requireUser(req);
    const q = z.object({ search: z.string().max(40).default('') }).parse(req.query);
    const rows = await prisma.user.findMany({
      where: { id: { not: userId }, username: { contains: q.search, mode: 'insensitive' } },
      select: publicUserSelect,
      orderBy: { username: 'asc' },
      take: 8,
    });
    return rows.map(toPublicUser);
  });

  app.get('/api/users/:username', async (req) => {
    const viewerId = await requireUser(req);
    const { username } = z.object({ username: z.string().max(40) }).parse(req.params);
    const row = await prisma.user.findFirst({ where: { username: { equals: username, mode: 'insensitive' } }, select: { ...publicUserSelect, _count: { select: { inventory: true } } } });
    if (!row) throw notFound('Ese jugador no existe');
    const profile: ProfileDto = {
      friendStatus: await friendStatus(viewerId, row.id),
      online: isOnline(row.id),
      user: toPublicUser(row), stats: await getStatsDto(row.id), history: await history(row.id), inventoryCount: row._count.inventory };
    return profile;
  });

  app.put('/api/avatar', async (req) => {
    const userId = await requireUser(req);
    const parsed = avatarConfigSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Avatar no válido');
    const owned = new Set((await prisma.inventory.findMany({ where: { userId }, select: { itemId: true } })).map((i) => i.itemId));
    const error = validateAvatar(parsed.data, owned);
    if (error) throw badRequest(error);
    await prisma.avatar.upsert({ where: { userId }, create: { userId, config: parsed.data }, update: { config: parsed.data } });
    return { ok: true, avatar: parsed.data };
  });

  app.get('/api/leaderboard', async (req) => {
    await requireUser(req);
    const q = z.object({ page: z.coerce.number().int().min(0).default(0) }).parse(req.query);
    const PAGE = 50;
    const rows = await prisma.playerStats.findMany({
      where: hasPlayed,
      orderBy: [{ rating: 'desc' }, { wins: 'desc' }, { userId: 'asc' }],
      skip: q.page * PAGE,
      take: PAGE,
      include: { user: { select: publicUserSelect } },
    });
    const entries: LeaderboardEntryDto[] = rows.map((r, i) => ({
      rank: q.page * PAGE + i + 1,
      user: toPublicUser(r.user),
      rating: r.rating,
      wins: r.wins,
      losses: r.losses,
      draws: r.draws,
      winRate: winRate(r.wins, r.losses, r.draws),
    }));
    return entries;
  });
}
