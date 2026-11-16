import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { GAME_MODES } from '@inbox/shared';
import { prisma } from '../lib/db';
import { requireUser } from '../lib/auth';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { sendMail } from '../lib/mail';
import { toUser } from '../realtime/notify';

const CHALLENGE_TTL_MS = 24 * 3600_000;

const createSchema = z.object({
  opponent: z.string().trim().min(1, 'Escribe a quién quieres desafiar').max(40),
  mode: z.enum(['typing', 'racing', 'puzzle', 'office']).default('typing'),
  subject: z.string().trim().max(120).optional(),
  message: z.string().trim().max(1000).default(''),
});

export async function expireChallenges() {
  await prisma.challenge.updateMany({ where: { status: 'pending', expiresAt: { lt: new Date() } }, data: { status: 'expired' } });
}

export async function challengeRoutes(app: FastifyInstance) {
  app.post('/api/challenges', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const userId = await requireUser(req);
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Datos no válidos');
    const { opponent, mode, message } = parsed.data;
    if (!GAME_MODES[mode].available) throw badRequest(`${GAME_MODES[mode].name} llegará pronto`);

    const opp = await prisma.user.findFirst({ where: { username: { equals: opponent.replace(/^@/, ''), mode: 'insensitive' } } });
    if (!opp) throw notFound(`No encontramos a "${opponent}" en el directorio`);
    if (opp.id === userId) throw badRequest('No puedes desafiarte a ti mismo (aunque sería un duelo épico)');

    const me = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { username: true } });
    const challenge = await prisma.challenge.create({
      data: { mode, challengerId: userId, opponentId: opp.id, message, expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS) },
    });
    const subject = parsed.data.subject || `${GAME_MODES[mode].name}: ${me.username} te desafía`;
    const body =
      (message ? `${message}\n\n` : '') +
      `${me.username} te desafía a un ${GAME_MODES[mode].name}. ${GAME_MODES[mode].tagline}\n\nEl desafío vence en 24 horas.`;
    const mail = await sendMail({ fromUserId: userId, toUserId: opp.id, kind: 'challenge', subject, body, challengeId: challenge.id });
    return { challengeId: challenge.id, mail };
  });

  app.post('/api/challenges/:id/accept', async (req) => {
    const userId = await requireUser(req);
    const { id } = z.object({ id: z.string().max(40) }).parse(req.params);
    const challenge = await prisma.challenge.findUnique({ where: { id }, include: { challenger: true, opponent: true } });
    if (!challenge) throw notFound('Ese desafío no existe');
    if (challenge.opponentId !== userId) throw forbidden('Este desafío no es para ti');
    if (challenge.status === 'accepted' && challenge.matchId) return { matchId: challenge.matchId };
    if (challenge.status !== 'pending') throw conflict('Este desafío ya no está disponible');
    if (challenge.expiresAt < new Date()) {
      await prisma.challenge.update({ where: { id }, data: { status: 'expired' } });
      throw conflict('Este desafío venció');
    }

    const matchId = await prisma.$transaction(async (tx) => {
      // Guards against a double click or two tabs accepting at once.
      const claimed = await tx.challenge.updateMany({ where: { id, status: 'pending' }, data: { status: 'accepted' } });
      if (claimed.count === 0) throw conflict('Este desafío ya no está disponible');
      const match = await tx.match.create({
        data: {
          mode: challenge.mode,
          participants: { create: [{ userId: challenge.challengerId }, { userId: challenge.opponentId }] },
        },
      });
      await tx.challenge.update({ where: { id }, data: { matchId: match.id } });
      return match.id;
    });

    await sendMail({
      fromUserId: userId,
      toUserId: challenge.challengerId,
      kind: 'challenge',
      subject: `RE: ${GAME_MODES[challenge.mode as 'typing'].name}: ${challenge.opponent.username} aceptó`,
      body: `${challenge.opponent.username} aceptó tu desafío. La sala de batalla está abierta.\n\nEntra cuando quieras: la partida empieza cuando los dos estén listos.`,
      challengeId: id,
      matchId,
    });
    for (const uid of [challenge.challengerId, challenge.opponentId]) toUser(uid, 'challenge:accepted', { challengeId: id, matchId });
    return { matchId };
  });

  app.post('/api/challenges/:id/decline', async (req) => {
    const userId = await requireUser(req);
    const { id } = z.object({ id: z.string().max(40) }).parse(req.params);
    const challenge = await prisma.challenge.findUnique({ where: { id }, include: { opponent: true } });
    if (!challenge) throw notFound('Ese desafío no existe');
    if (challenge.opponentId !== userId) throw forbidden('Este desafío no es para ti');
    const res = await prisma.challenge.updateMany({ where: { id, status: 'pending' }, data: { status: 'declined' } });
    if (res.count === 0) throw conflict('Este desafío ya no está disponible');
    await sendMail({
      fromUserId: userId,
      toUserId: challenge.challengerId,
      kind: 'challenge',
      subject: `RE: Desafío rechazado por ${challenge.opponent.username}`,
      body: `${challenge.opponent.username} rechazó tu desafío.\n\nMotivo oficial: "tengo una reunión que pudo haber sido un correo".`,
      challengeId: id,
    });
    return { ok: true };
  });
}
