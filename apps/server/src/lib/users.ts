import type { Prisma } from '@prisma/client';
import { DEFAULT_AVATAR, avatarConfigSchema, winRate, type AvatarConfig, type PlayerStatsDto, type PublicUser } from '@inbox/shared';
import { prisma } from './db';

/** Prisma select that yields everything a PublicUser needs. */
export const publicUserSelect = {
  id: true,
  username: true,
  title: true,
  avatar: { select: { config: true } },
  stats: { select: { level: true } },
} satisfies Prisma.UserSelect;

export type PublicUserRow = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;

export function parseAvatar(json: unknown): AvatarConfig {
  const parsed = avatarConfigSchema.safeParse(json);
  return parsed.success ? parsed.data : DEFAULT_AVATAR;
}

export function toPublicUser(row: PublicUserRow): PublicUser {
  return {
    id: row.id,
    username: row.username,
    title: row.title,
    avatar: parseAvatar(row.avatar?.config),
    level: row.stats?.level ?? 1,
  };
}

export async function getPublicUser(id: string): Promise<PublicUser | null> {
  const row = await prisma.user.findUnique({ where: { id }, select: publicUserSelect });
  return row ? toPublicUser(row) : null;
}

const hasPlayed: Prisma.PlayerStatsWhereInput = { OR: [{ wins: { gt: 0 } }, { losses: { gt: 0 } }, { draws: { gt: 0 } }] };

export async function getStatsDto(userId: string): Promise<PlayerStatsDto> {
  const s = await prisma.playerStats.findUniqueOrThrow({ where: { userId } });
  const played = s.wins + s.losses + s.draws > 0;
  const rank = played ? (await prisma.playerStats.count({ where: { AND: [hasPlayed, { rating: { gt: s.rating } }] } })) + 1 : null;
  return { level: s.level, xp: s.xp, rating: s.rating, wins: s.wins, losses: s.losses, draws: s.draws, winRate: winRate(s.wins, s.losses, s.draws), rank, coins: s.coins };
}

export { hasPlayed };
