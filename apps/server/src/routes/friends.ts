import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { FriendsDto } from '@inbox/shared';
import { prisma } from '../lib/db';
import { requireUser } from '../lib/auth';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { publicUserSelect, toPublicUser } from '../lib/users';
import { sendMail } from '../lib/mail';
import { isOnline } from '../realtime/presence';
import { toUser } from '../realtime/notify';

const MAX_FRIENDS = 200;

export async function friendRoutes(app: FastifyInstance) {
  app.get('/api/friends', async (req) => {
    const userId = await requireUser(req);
    const rows = await prisma.friendship.findMany({
      where: { OR: [{ requesterId: userId }, { addresseeId: userId }] },
      include: { requester: { select: publicUserSelect }, addressee: { select: publicUserSelect } },
      orderBy: { createdAt: 'desc' },
    });
    const dto: FriendsDto = { friends: [], incoming: [], outgoing: [] };
    for (const r of rows) {
      const mine = r.requesterId === userId;
      const other = toPublicUser(mine ? r.addressee : r.requester);
      if (r.status === 'accepted') dto.friends.push({ user: other, online: isOnline(other.id), since: (r.acceptedAt ?? r.createdAt).toISOString() });
      else (mine ? dto.outgoing : dto.incoming).push({ id: r.id, user: other, createdAt: r.createdAt.toISOString() });
    }
    // Online first, then alphabetical.
    dto.friends.sort((a, b) => Number(b.online) - Number(a.online) || a.user.username.localeCompare(b.user.username));
    return dto;
  });

  app.post('/api/friends', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const userId = await requireUser(req);
    const parsed = z.object({ username: z.string().trim().min(1).max(40) }).safeParse(req.body);
    if (!parsed.success) throw badRequest('Escribe un nombre de usuario');
    const target = await prisma.user.findFirst({ where: { username: { equals: parsed.data.username.replace(/^@/, ''), mode: 'insensitive' } } });
    if (!target) throw notFound(`No encontramos a "${parsed.data.username}" en el directorio`);
    if (target.id === userId) throw badRequest('Ya eres tu mejor colega');

    const existing = await prisma.friendship.findFirst({
      where: { OR: [{ requesterId: userId, addresseeId: target.id }, { requesterId: target.id, addresseeId: userId }] },
    });
    if (existing?.status === 'accepted') throw conflict(`${target.username} ya está en tus contactos`);
    if (existing && existing.requesterId === userId) throw conflict('Ya le enviaste una solicitud');

    const count = await prisma.friendship.count({ where: { status: 'accepted', OR: [{ requesterId: userId }, { addresseeId: userId }] } });
    if (count >= MAX_FRIENDS) throw conflict(`Llegaste al máximo de ${MAX_FRIENDS} contactos`);

    const me = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { username: true } });
    if (existing) {
      // They had already asked us: adding them back accepts it.
      await prisma.friendship.update({ where: { id: existing.id }, data: { status: 'accepted', acceptedAt: new Date() } });
      toUser(target.id, 'friends:changed');
      toUser(userId, 'friends:changed');
      return { status: 'friends' as const };
    }
    await prisma.friendship.create({ data: { requesterId: userId, addresseeId: target.id } });
    await sendMail({
      fromUserId: userId,
      toUserId: target.id,
      kind: 'social',
      subject: `${me.username} quiere agregarte a sus contactos`,
      body: `${me.username} quiere sumarte a su lista de contactos del reino.\n\nAcepta la solicitud en la carpeta Contactos para ver cuándo está en línea y desafiarle más rápido.`,
    });
    toUser(target.id, 'friends:changed');
    return { status: 'outgoing' as const };
  });

  app.post('/api/friends/requests/:id/accept', async (req) => {
    const userId = await requireUser(req);
    const { id } = z.object({ id: z.string().max(40) }).parse(req.params);
    const f = await prisma.friendship.findUnique({ where: { id } });
    if (!f) throw notFound('Esa solicitud ya no existe');
    if (f.addresseeId !== userId) throw forbidden();
    if (f.status === 'accepted') return { ok: true };
    await prisma.friendship.update({ where: { id }, data: { status: 'accepted', acceptedAt: new Date() } });
    const me = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { username: true } });
    await sendMail({
      fromUserId: userId,
      toUserId: f.requesterId,
      kind: 'social',
      subject: `RE: ${me.username} aceptó tu solicitud`,
      body: `${me.username} ahora está en tus contactos. Ya puedes ver cuándo está en línea.`,
    });
    toUser(f.requesterId, 'friends:changed');
    toUser(userId, 'friends:changed');
    return { ok: true };
  });

  /** Declines an incoming request, cancels an outgoing one. */
  app.delete('/api/friends/requests/:id', async (req) => {
    const userId = await requireUser(req);
    const { id } = z.object({ id: z.string().max(40) }).parse(req.params);
    const f = await prisma.friendship.findUnique({ where: { id } });
    if (!f || f.status !== 'pending') throw notFound('Esa solicitud ya no existe');
    if (f.addresseeId !== userId && f.requesterId !== userId) throw forbidden();
    await prisma.friendship.delete({ where: { id } });
    toUser(f.requesterId === userId ? f.addresseeId : f.requesterId, 'friends:changed');
    return { ok: true };
  });

  app.delete('/api/friends/:userId', async (req) => {
    const userId = await requireUser(req);
    const { userId: other } = z.object({ userId: z.string().max(40) }).parse(req.params);
    const res = await prisma.friendship.deleteMany({
      where: { status: 'accepted', OR: [{ requesterId: userId, addresseeId: other }, { requesterId: other, addresseeId: userId }] },
    });
    if (res.count === 0) throw notFound('No está en tus contactos');
    toUser(other, 'friends:changed');
    return { ok: true };
  });
}
