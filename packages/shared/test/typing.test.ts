import { describe, expect, it } from 'vitest';
import { applyWord, compareTyping, computeWpm, emptyTypingStats, exceedsHumanSpeed, generateWords, levelForXp, xpForLevel, eloDelta, validateAvatar, DEFAULT_AVATAR, starterItemIds } from '../src';

describe('typing rules', () => {
  it('generates the same words from the same seed', () => {
    expect(generateWords(42)).toEqual(generateWords(42));
    expect(generateWords(42)).not.toEqual(generateWords(43));
    expect(generateWords(1, 60)).toHaveLength(60);
  });

  it('counts correct and wrong words', () => {
    let s = emptyTypingStats();
    s = applyWord(s, 'dragon', 'dragon', 900).stats;
    s = applyWord(s, 'correo', 'coreo', 1800).stats;
    expect(s).toMatchObject({ correctWords: 1, errors: 1, submitted: 2, nextIndex: 2, correctChars: 7, lastCorrectAt: 900 });
  });

  it('computes wpm over 10 seconds', () => {
    expect(computeWpm(50, 10_000)).toBe(60);
  });

  it('orders players by words, then errors, then time', () => {
    const a = { ...emptyTypingStats(), correctWords: 10, errors: 1, lastCorrectAt: 9000 };
    const b = { ...emptyTypingStats(), correctWords: 9, errors: 0, lastCorrectAt: 8000 };
    expect(compareTyping(a, b)).toBeGreaterThan(0);
    const c = { ...a, errors: 0 };
    expect(compareTyping(a, c)).toBeLessThan(0);
    const d = { ...a, lastCorrectAt: 8500 };
    expect(compareTyping(a, d)).toBeLessThan(0);
    expect(compareTyping(a, { ...a })).toBe(0);
  });

  it('flags impossible speeds', () => {
    expect(exceedsHumanSpeed(60, 10_000)).toBe(false); // 72 wpm
    expect(exceedsHumanSpeed(300, 10_000)).toBe(true); // 360 wpm
  });
});

describe('progression', () => {
  it('maps xp to levels', () => {
    expect(xpForLevel(2)).toBe(100);
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(99)).toBe(1);
    expect(levelForXp(100)).toBe(2);
    expect(levelForXp(1000)).toBe(5);
  });
  it('elo is zero sum for equal ratings', () => {
    expect(eloDelta(1000, 1000, 1)).toBe(16);
    expect(eloDelta(1000, 1000, 0)).toBe(-16);
  });
});

describe('avatar validation', () => {
  it('accepts the default avatar with starter items', () => {
    expect(validateAvatar(DEFAULT_AVATAR, new Set(starterItemIds()))).toBeNull();
  });
  it('rejects items the player does not own', () => {
    const cfg = { ...DEFAULT_AVATAR, equipped: { ...DEFAULT_AVATAR.equipped, headgear: 'headgear_crown' } };
    expect(validateAvatar(cfg, new Set(starterItemIds()))).toMatch(/Aún no desbloqueas/);
  });
  it('rejects an item in the wrong slot', () => {
    const cfg = { ...DEFAULT_AVATAR, equipped: { ...DEFAULT_AVATAR.equipped, hair: 'weapon_mug' } };
    expect(validateAvatar(cfg, new Set(starterItemIds()))).toMatch(/no va en/);
  });
});
