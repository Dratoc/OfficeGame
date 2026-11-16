import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ITEM_CATALOG, ITEMS_BY_ID, featuredItems, priceOf, shopDay, type ShopDto } from '@inbox/shared';
import { prisma } from '../lib/db';
import { requireUser } from '../lib/auth';
import { badRequest, conflict, notFound } from '../lib/errors';

const buySchema = z.object({ itemId: z.string().min(1).max(60), expectedPrice: z.number().int().nonnegative() });

/**
 * Cosmetic shop. Prices and the daily featured list are computed on the server; the client
 * only says which item it wants and the price it saw, so a price change never surprises anyone.
 */
export async function shopRoutes(app: FastifyInstance, opts: { now?: () => number } = {}) {
  const now = opts.now ?? Date.now;

  async function shopFor(userId: string): Promise<ShopDto> {
    const [stats, owned] = await Promise.all([
      prisma.playerStats.findUniqueOrThrow({ where: { userId }, select: { coins: true } }),
      prisma.inventory.findMany({ where: { userId }, select: { itemId: true } }),
    ]);
    const have = new Set(owned.map((o) => o.itemId));
    const day = shopDay(now());
    const featured = new Set(featuredItems(day).map((i) => i.id));
    return {
      coins: stats.coins,
      day,
      items: ITEM_CATALOG.filter((i) => i.purchasable).map((i) => ({
        itemId: i.id,
        price: priceOf(i, featured.has(i.id)),
        fullPrice: priceOf(i, false),
        featured: featured.has(i.id),
        owned: have.has(i.id),
      })),
    };
  }

  app.get('/api/shop', async (req) => shopFor(await requireUser(req)));

  app.post('/api/shop/buy', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const userId = await requireUser(req);
    const parsed = buySchema.safeParse(req.body);
    if (!parsed.success) throw badRequest('Compra inválida');
    const item = ITEMS_BY_ID.get(parsed.data.itemId);
    if (!item || !item.purchasable) throw notFound('Ese objeto no está a la venta');
    const price = priceOf(item, featuredItems(shopDay(now())).some((i) => i.id === item.id));
    if (price !== parsed.data.expectedPrice) throw conflict('El precio cambió. Revisa la tienda e inténtalo de nuevo.');

    await prisma.$transaction(async (tx) => {
      const already = await tx.inventory.findUnique({ where: { userId_itemId: { userId, itemId: item.id } } });
      if (already) throw conflict('Ya tienes este objeto');
      // Atomic: only succeeds if the balance still covers the price.
      const paid = await tx.playerStats.updateMany({ where: { userId, coins: { gte: price } }, data: { coins: { decrement: price } } });
      if (paid.count === 0) throw badRequest('No te alcanzan los doblones');
      await tx.inventory.create({ data: { userId, itemId: item.id, source: 'purchase' } });
      await tx.purchase.create({ data: { userId, itemId: item.id, price } });
    });
    return shopFor(userId);
  });
}
