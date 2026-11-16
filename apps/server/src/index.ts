import { buildApp } from './app';
import { attachSocket } from './realtime/socket';
import { syncCatalog } from './lib/catalog';
import { expireChallenges } from './routes/challenges';

const port = Number(process.env.PORT ?? 3000);

const app = await buildApp({ logger: true });
await syncCatalog();
attachSocket(app.server);
setInterval(() => void expireChallenges().catch(() => {}), 60_000).unref();
await app.listen({ port, host: '0.0.0.0' });
