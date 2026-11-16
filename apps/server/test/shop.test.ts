import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { FEATURED_COUNT, STARTING_COINS, ITEMS_BY_ID, SHOP_PRICES, type ShopDto } from '@inbox/shared';
import { buildApp } from '../src/app';
import { syncCatalog } from '../src/lib/catalog';
import { prisma } from '../src/lib/db';

let base = '';
let app: Awaited<ReturnType<typeof buildApp>>;
const sfx = Math.random().toString(36).slice(2, 7);

async function api(cookie: string, method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, { method, headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: (await res.json()) as any, setCookie: res.headers.get('set-cookie') };
}
async function register(name: string) {
  const r = await api('', 'POST', '/api/auth/register', { email: `${name}@test.dev`, username: name, password: 'contraseña-segura' });
  expect(r.status).toBe(200);
  return r.setCookie!.split(';')[0]!;
}

beforeAll(async () => {
  app = await buildApp();
  await syncCatalog();
  await app.listen({ port: 0, host: '127.0.0.1' });
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('cosmetic shop', () => {
  it('sells cosmetics for doubloons, with daily discounts, and never twice', async () => {
    const c = await register(`shop_${sfx}`);
    const shop = (await api(c, 'GET', '/api/shop')).json as ShopDto;
    expect(shop.coins).toBe(STARTING_COINS);
    expect(shop.items.filter((i) => i.featured)).toHaveLength(FEATURED_COUNT);
    for (const i of shop.items) expect(i.price).toBeLessThanOrEqual(i.fullPrice);

    const cheap = shop.items.find((i) => !i.owned && i.price <= STARTING_COINS)!;
    expect(cheap).toBeTruthy();
    expect((await api(c, 'POST', '/api/shop/buy', { itemId: cheap.itemId, expectedPrice: cheap.price + 1 })).status).toBe(409);
    const bought = await api(c, 'POST', '/api/shop/buy', { itemId: cheap.itemId, expectedPrice: cheap.price });
    expect(bought.status).toBe(200);
    expect(bought.json.coins).toBe(STARTING_COINS - cheap.price);
    expect(bought.json.items.find((i: any) => i.itemId === cheap.itemId).owned).toBe(true);
    expect((await api(c, 'POST', '/api/shop/buy', { itemId: cheap.itemId, expectedPrice: cheap.price })).status).toBe(409);

    // The new item can be equipped right away.
    const me = (await api(c, 'GET', '/api/me')).json;
    expect(me.inventory).toContain(cheap.itemId);
    const slot = ITEMS_BY_ID.get(cheap.itemId)!.slot;
    expect((await api(c, 'PUT', '/api/avatar', { ...me.avatar, equipped: { ...me.avatar.equipped, [slot]: cheap.itemId } })).status).toBe(200);

    const pricey = shop.items.find((i) => !i.owned && i.price > STARTING_COINS)!;
    expect((await api(c, 'POST', '/api/shop/buy', { itemId: pricey.itemId, expectedPrice: pricey.price })).json.error).toMatch(/doblones/);
    expect((await api(c, 'POST', '/api/shop/buy', { itemId: 'head_human', expectedPrice: 0 })).status).toBe(404);
  });

  it('never lets two simultaneous purchases spend the same coins', async () => {
    const c = await register(`race_${sfx}`);
    const user = await prisma.user.findUniqueOrThrow({ where: { username: `race_${sfx}` } });
    const shop = (await api(c, 'GET', '/api/shop')).json as ShopDto;
    const commons = shop.items.filter((i) => !i.owned && !i.featured && i.fullPrice === SHOP_PRICES.common).slice(0, 2);
    const rares = shop.items.filter((i) => !i.owned && !i.featured && i.fullPrice === SHOP_PRICES.rare).slice(0, 4);
    const pick = commons.length === 2 ? commons : rares.slice(0, 2);
    await prisma.playerStats.update({ where: { userId: user.id }, data: { coins: pick[0]!.price } });
    const results = await Promise.all(pick.map((i) => api(c, 'POST', '/api/shop/buy', { itemId: i.itemId, expectedPrice: i.price })));
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    expect((await prisma.playerStats.findUniqueOrThrow({ where: { userId: user.id } })).coins).toBe(0);
    expect(await prisma.purchase.count({ where: { userId: user.id } })).toBe(1);
  });
});
