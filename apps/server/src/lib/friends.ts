import type { FriendStatus } from '@inbox/shared';
import { prisma } from './db';

export async function friendIds(userId: string): Promise<string[]> {
  const rows = await prisma.friendship.findMany({
    where: { status: 'accepted', OR: [{ requesterId: userId }, { addresseeId: userId }] },
    select: { requesterId: true, addresseeId: true },
  });
  return rows.map((r) => (r.requesterId === userId ? r.addresseeId : r.requesterId));
}

export async function friendStatus(viewerId: string, targetId: string): Promise<FriendStatus> {
  if (viewerId === targetId) return 'self';
  const f = await prisma.friendship.findFirst({
    where: { OR: [{ requesterId: viewerId, addresseeId: targetId }, { requesterId: targetId, addresseeId: viewerId }] },
  });
  if (!f) return 'none';
  if (f.status === 'accepted') return 'friends';
  return f.requesterId === viewerId ? 'outgoing' : 'incoming';
}
