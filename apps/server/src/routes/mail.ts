import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/db';
import { requireUser } from '../lib/auth';
import { forbidden, notFound } from '../lib/errors';
import { mailInclude, toMailDto } from '../lib/mail';
import { expireChallenges } from './challenges';

export async function mailRoutes(app: FastifyInstance) {
  app.get('/api/mail', async (req) => {
    const userId = await requireUser(req);
    const q = z.object({ folder: z.enum(['inbox', 'sent', 'challenges']).default('inbox') }).parse(req.query);
    await expireChallenges();
    const where =
      q.folder === 'sent'
        ? { fromUserId: userId }
        : q.folder === 'challenges'
          ? { toUserId: userId, kind: 'challenge' }
          : { toUserId: userId };
    const rows = await prisma.mail.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100, include: mailInclude });
    const unread = await prisma.mail.count({ where: { toUserId: userId, readAt: null } });
    return { mails: rows.map(toMailDto), unread };
  });

  app.post('/api/mail/:id/read', async (req) => {
    const userId = await requireUser(req);
    const { id } = z.object({ id: z.string().max(40) }).parse(req.params);
    const mail = await prisma.mail.findUnique({ where: { id } });
    if (!mail) throw notFound();
    if (mail.toUserId !== userId) throw forbidden();
    if (!mail.readAt) await prisma.mail.update({ where: { id }, data: { readAt: new Date() } });
    return { ok: true };
  });

  app.post('/api/mail/read-all', async (req) => {
    const userId = await requireUser(req);
    await prisma.mail.updateMany({ where: { toUserId: userId, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  });
}
