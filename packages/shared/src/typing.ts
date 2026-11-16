/** Rules of the Typing Battle. Imported by both client and server so they always agree. */

export const TYPING_DURATION_MS = 10_000;
export const COUNTDOWN_MS = 3_000;
/** Messages typed before the end but still in flight are accepted for this long. */
export const LATE_GRACE_MS = 300;
/** Above this sustained speed the server stops accepting words (anti-cheat). */
export const MAX_WPM = 250;
/** Minimum time between two words, per character of the new word (about 600 WPM). */
export const MIN_MS_PER_CHAR = 20;
/** How long a player may be disconnected during a match before forfeiting. */
export const RECONNECT_WINDOW_MS = 5_000;
export const MAX_WORD_LENGTH = 40;

export interface TypingStats {
  /** Index of the next word the player must type. */
  nextIndex: number;
  correctWords: number;
  errors: number;
  correctChars: number;
  submitted: number;
  /** ms since start of the last correct word; used as a tie-breaker. */
  lastCorrectAt: number | null;
}

export function emptyTypingStats(): TypingStats {
  return { nextIndex: 0, correctWords: 0, errors: 0, correctChars: 0, submitted: 0, lastCorrectAt: null };
}

export function isWordCorrect(expected: string, typed: string): boolean {
  return expected === typed.trim();
}

/** Words per minute, using the standard 5 characters per word (+1 for the space). */
export function computeWpm(correctChars: number, durationMs = TYPING_DURATION_MS): number {
  if (durationMs <= 0) return 0;
  return Math.round((correctChars / 5) / (durationMs / 60_000));
}

export function computeAccuracy(stats: Pick<TypingStats, 'correctWords' | 'submitted'>): number {
  if (stats.submitted === 0) return 0;
  return Math.round((stats.correctWords / stats.submitted) * 100);
}

/** Applies one submitted word. Returns a new stats object and whether the word was correct. */
export function applyWord(stats: TypingStats, expected: string, typed: string, elapsedMs: number): { stats: TypingStats; correct: boolean } {
  const correct = isWordCorrect(expected, typed);
  const next: TypingStats = {
    ...stats,
    nextIndex: stats.nextIndex + 1,
    submitted: stats.submitted + 1,
  };
  if (correct) {
    next.correctWords += 1;
    // +1 for the space that separates words
    next.correctChars += expected.length + 1;
    next.lastCorrectAt = elapsedMs;
  } else {
    next.errors += 1;
  }
  return { stats: next, correct };
}

/**
 * Orders two players. Positive if `a` beats `b`, negative if `b` beats `a`, 0 for a draw.
 * More correct words wins; then fewer errors; then whoever reached their last correct word first.
 */
export function compareTyping(a: TypingStats, b: TypingStats): number {
  if (a.correctWords !== b.correctWords) return a.correctWords - b.correctWords;
  if (a.errors !== b.errors) return b.errors - a.errors;
  const at = a.lastCorrectAt ?? Infinity;
  const bt = b.lastCorrectAt ?? Infinity;
  if (at !== bt) return at < bt ? 1 : -1;
  return 0;
}

/** True when the speed so far is beyond what a human can sustain. */
export function exceedsHumanSpeed(correctChars: number, elapsedMs: number): boolean {
  if (elapsedMs < 1500) return correctChars > (MAX_WPM * 5 * 1500) / 60_000;
  return computeWpm(correctChars, elapsedMs) > MAX_WPM;
}
