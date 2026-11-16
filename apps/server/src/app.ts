import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { HttpError } from './lib/errors';
import { authRoutes } from './routes/auth';
import { userRoutes } from './routes/users';
import { mailRoutes } from './routes/mail';
import { challengeRoutes } from './routes/challenges';
import { matchRoutes } from './routes/matches';
import { shopRoutes } from './routes/shop';
import { friendRoutes } from './routes/friends';

const here = dirname(fileURLToPath(import.meta.url));
const WEB_DIST = resolve(here, '../../web/dist');

export async function buildApp(opts: { logger?: boolean } = {}) {
  const app = Fastify({ logger: opts.logger ?? false, trustProxy: true });
  await app.register(cookie);
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof HttpError) return reply.status(err.status).send({ error: err.message });
    const e = err as { statusCode?: number; name?: string; message?: string };
    if (e.statusCode === 429) return reply.status(429).send({ error: 'Demasiadas solicitudes. Respira y vuelve a intentar.' });
    if (e.name === 'ZodError') return reply.status(400).send({ error: 'Datos no válidos' });
    app.log.error(err);
    return reply.status(500).send({ error: 'Algo salió mal en el servidor' });
  });

  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(mailRoutes);
  await app.register(challengeRoutes);
  await app.register(matchRoutes);
  await app.register(friendRoutes);
  await app.register(shopRoutes);
  app.get('/api/health', async () => ({ ok: true }));

  // In production the server also serves the built web app.
  if (existsSync(WEB_DIST)) {
    await app.register(fastifyStatic, { root: WEB_DIST });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api')) return reply.status(404).send({ error: 'No encontrado' });
      return reply.sendFile('index.html');
    });
  }
  return app;
}
