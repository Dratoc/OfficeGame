import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../lib/auth';
import { forbidden, notFound } from '../lib/errors';
import { getMatchSummary } from '../lib/matches';

export async function matchRoutes(app: FastifyInstance) {
  app.get('/api/matches/:id', async (req) => {
    const userId = await requireUser(req);
    const { id } = z.object({ id: z.string().max(40) }).parse(req.params);
    const summary = await getMatchSummary(id);
    if (!summary) throw notFound('Esa partida no existe');
    if (!summary.participants.some((p) => p.user.id === userId)) throw forbidden();
    return summary;
  });
}
