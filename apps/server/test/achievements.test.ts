import { afterAll, describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, newAchievements, type AchievementContext } from '@inbox/shared';
import { prisma } from '../src/lib/db';
import { createMatch, finalizeMatch } from '../src/lib/matches';

const sfx = Math.random().toString(36).slice(2, 7);
afterAll(() => prisma.$disconnect());

const ctx = (over: Partial<AchievementContext> = {}): AchievementContext => ({
  mode: 'typing', result: 'loss', placement: 2, players: 2, correct: 5, errors: 1, wpm: 40, level: 1, wins: 0, played: 1, winStreak: 0, modesWon: 0, friends: 0, hasPet: false, ...over,
});

describe('achievement rules', () => {
  it('has unique ids and grants only what was earned', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    expect(newAchievements(ctx(), [])).toEqual(['first_match']);
    expect(newAchievements(ctx({ mode: 'racing', result: 'win', placement: 1, players: 4, wins: 1, wpm: 85, errors: 0, correct: 30, hasPet: true }), ['first_match']).sort()).toEqual(
      ['best_friend', 'fast_fingers', 'first_win', 'flawless', 'race_winner'].sort(),
    );
    expect(newAchievements(ctx({ mode: 'math', correct: 25 }), ['first_match'])).toEqual(['accountant']);
  });
});

describe('granting', () => {
  async function user(name: string) {
    return prisma.user.create({
      data: { email: `${name}_${sfx}@test.dev`, username: `${name}_${sfx}`, passwordHash: 'x', stats: { create: {} }, avatar: { create: { config: { equipped: { pet: 'pet_cat' } } } } },
    });
  }
  const play = async (a: string, b: string, aWords: number, bWords: number) => {
    const matchId = await createMatch('typing', [a, b]);
    const words: Record<string, number> = { [a]: aWords, [b]: bWords };
    return finalizeMatch({
      matchId,
      mode: 'typing',
      outcomes: [a, b].map((userId) => ({ userId, correctWords: words[userId]!, errors: 0, correctChars: 0, wpm: 30, accuracy: 100 })),
      abandoned: new Set(),
      compare: (x, y) => words[x]! - words[y]!,
    });
  };

  it('grants each achievement once, tracks win streaks and reports them in the summary', async () => {
    const [ana, beto] = await Promise.all([user('ach_a'), user('ach_b')]);
    const first = await play(ana.id, beto.id, 12, 4);
    const a1 = first.participants.find((p) => p.user.id === ana.id)!;
    expect(a1.achievements.sort()).toEqual(['best_friend', 'first_match', 'first_win', 'flawless'].sort());
    expect(first.participants.find((p) => p.user.id === beto.id)!.achievements).toEqual(['first_match']);

    const second = await play(ana.id, beto.id, 8, 3);
    expect(second.participants.find((p) => p.user.id === ana.id)!.achievements).toEqual([]);
    const third = await play(ana.id, beto.id, 9, 2);
    expect(third.participants.find((p) => p.user.id === ana.id)!.achievements).toEqual(['streak_3']);

    const mail = await prisma.mail.findFirst({ where: { toUserId: ana.id, matchId: third.id } });
    expect(mail?.body).toContain('Imparable');
    expect(await prisma.achievement.count({ where: { userId: ana.id } })).toBe(5);
  });
});
