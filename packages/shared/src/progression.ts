export const XP_WIN = 100;
export const XP_LOSS = 40;
export const XP_DRAW = 60;
export const XP_PER_CORRECT_WORD = 2;
export const ELO_K = 32;
export const START_RATING = 1000;

export type MatchResult = 'win' | 'loss' | 'draw' | 'abandon';

/** Total XP needed to reach a level. Level 1 = 0, 2 = 100, 3 = 300, 5 = 1000, 10 = 4500. */
export function xpForLevel(level: number): number {
  return 50 * level * (level - 1);
}

export function levelForXp(xp: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}

export function levelProgress(xp: number): { level: number; current: number; needed: number; pct: number } {
  const level = levelForXp(xp);
  const base = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const current = xp - base;
  const needed = next - base;
  return { level, current, needed, pct: Math.round((current / needed) * 100) };
}

export function xpForResult(result: MatchResult, correctWords: number, placement = 1, players = 2): number {
  // In races of 3 or 4, finishing second or third is still worth something.
  const podium = result === 'loss' && players > 2 ? 20 * (players - placement) : 0;
  const base = (result === 'win' ? XP_WIN : result === 'draw' ? XP_DRAW : result === 'loss' ? XP_LOSS : 0) + podium;
  return result === 'abandon' ? 0 : base + correctWords * XP_PER_CORRECT_WORD;
}

/** Elo for a two player match. score: 1 win, 0.5 draw, 0 loss. */
export function eloDelta(rating: number, opponentRating: number, score: number, k = ELO_K): number {
  const expected = 1 / (1 + Math.pow(10, (opponentRating - rating) / 400));
  return Math.round(k * (score - expected));
}

/**
 * Rating change for every player of a match with any number of players. Each pair is scored
 * as a duel (better place wins, same place draws) and the result is averaged, so a 1 vs 1
 * match gives exactly the classic Elo change.
 */
export function multiEloDeltas(players: { rating: number; place: number }[], k = ELO_K): number[] {
  const n = players.length;
  if (n < 2) return players.map(() => 0);
  return players.map((me, i) => {
    let sum = 0;
    players.forEach((other, j) => {
      if (i === j) return;
      const score = me.place < other.place ? 1 : me.place === other.place ? 0.5 : 0;
      const expected = 1 / (1 + Math.pow(10, (other.rating - me.rating) / 400));
      sum += k * (score - expected);
    });
    return Math.round(sum / (n - 1));
  });
}

export function winRate(wins: number, losses: number, draws: number): number {
  const total = wins + losses + draws;
  return total === 0 ? 0 : Math.round((wins / total) * 100);
}
