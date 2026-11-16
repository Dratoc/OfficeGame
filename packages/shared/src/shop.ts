import { ITEM_CATALOG, type ItemDef, type Rarity } from './avatar';
import { mulberry32 } from './rng';
import type { MatchResult } from './progression';

/** Doubloons: the in-game coin. Earned only by playing; spent only on cosmetics. */
export const STARTING_COINS = 150;
export const COINS_PER_ACHIEVEMENT = 50;

export const SHOP_PRICES: Record<Rarity, number> = {
  common: 60,
  rare: 150,
  epic: 400,
  legendary: 900,
  mythic: 2000,
};
export const FEATURED_COUNT = 6;
export const FEATURED_DISCOUNT = 0.25;

/** Coins for one match: something for everyone who plays, more for winning and placing. */
export function coinsForResult(result: MatchResult, correct: number, placement = 1, players = 2): number {
  if (result === 'abandon') return 0;
  const base = result === 'win' ? 30 : result === 'draw' ? 20 : 10;
  const podium = result === 'loss' && players > 2 ? 5 * (players - placement) : 0;
  return base + podium + Math.min(correct, 20);
}

/** The day the shop rotates on, in UTC, as YYYY-MM-DD. */
export const shopDay = (now: number) => new Date(now).toISOString().slice(0, 10);

/** Six purchasable items on sale today. Same list for everyone, changes at 00:00 UTC. */
export function featuredItems(day: string): ItemDef[] {
  const seed = [...day].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rand = mulberry32(seed);
  const pool = ITEM_CATALOG.filter((i) => i.purchasable);
  const picked: ItemDef[] = [];
  while (picked.length < Math.min(FEATURED_COUNT, pool.length)) {
    const it = pool[Math.floor(rand() * pool.length)]!;
    if (!picked.includes(it)) picked.push(it);
  }
  return picked;
}

export function priceOf(item: ItemDef, featured: boolean): number {
  const full = SHOP_PRICES[item.rarity];
  return featured ? Math.round((full * (1 - FEATURED_DISCOUNT)) / 5) * 5 : full;
}

export interface ShopItemDto {
  itemId: string;
  price: number;
  fullPrice: number;
  featured: boolean;
  owned: boolean;
}

export interface ShopDto {
  coins: number;
  day: string;
  items: ShopItemDto[];
}
