import {
  LATE_GRACE_MS,
  MIN_MS_PER_CHAR,
  TYPING_DURATION_MS,
  applyWord,
  compareTyping,
  computeAccuracy,
  computeWpm,
  emptyTypingStats,
  exceedsHumanSpeed,
  generateWords,
  type TypingStats,
  type TypingWord,
} from '@inbox/shared';
import type { ActionContext, GameMode } from './types';

interface PlayerState extends TypingStats {
  lastWordAt: number | null;
  rejected: number;
}

export interface TypingState {
  words: string[];
  players: Map<string, PlayerState>;
}

export type RejectReason = 'out-of-order' | 'not-started' | 'too-late' | 'too-fast' | 'unknown-player';

export interface TypingActionResult {
  accepted: boolean;
  correct: boolean;
  reason?: RejectReason;
  stats: TypingStats | null;
}

export const WORDS_PER_MATCH = 80;

export const typingMode: GameMode<TypingState, Pick<TypingWord, 'index' | 'word' | 'typedAt'>, TypingActionResult> = {
  id: 'typing',
  durationMs: TYPING_DURATION_MS,
  minPlayers: 2,
  maxPlayers: 2,

  createState(seed, playerIds) {
    return {
      words: generateWords(seed, WORDS_PER_MATCH),
      players: new Map(playerIds.map((id) => [id, { ...emptyTypingStats(), lastWordAt: null, rejected: 0 }])),
    };
  },

  startPayload(state) {
    return { words: state.words };
  },

  applyAction(state, userId, action, ctx: ActionContext) {
    const p = state.players.get(userId);
    if (!p) return { accepted: false, correct: false, reason: 'unknown-player', stats: null };
    const reject = (reason: RejectReason): TypingActionResult => {
      p.rejected++;
      return { accepted: false, correct: false, reason, stats: p };
    };

    if (action.index !== p.nextIndex) return reject('out-of-order');
    if (ctx.now > ctx.endAt + LATE_GRACE_MS) return reject('too-late');
    // The client's timestamp is only trusted within one second of when we received it.
    const typedAt = Math.min(ctx.now, Math.max(action.typedAt, ctx.now - 1000));
    if (typedAt < ctx.startAt) return reject('not-started');
    if (typedAt > ctx.endAt) return reject('too-late');

    const expected = state.words[action.index];
    if (expected === undefined) return reject('out-of-order');

    const minGap = action.word.trim().length * MIN_MS_PER_CHAR;
    const since = p.lastWordAt ?? ctx.startAt;
    if (typedAt - since < minGap) return reject('too-fast');

    const elapsed = typedAt - ctx.startAt;
    const { stats, correct } = applyWord(p, expected, action.word, elapsed);
    if (correct && exceedsHumanSpeed(stats.correctChars, Math.max(elapsed, 1))) return reject('too-fast');

    Object.assign(p, stats, { lastWordAt: typedAt });
    return { accepted: true, correct, stats: p };
  },

  outcome(state, userId) {
    const p = state.players.get(userId) ?? { ...emptyTypingStats(), lastWordAt: null, rejected: 0 };
    return {
      userId,
      correctWords: p.correctWords,
      errors: p.errors,
      correctChars: p.correctChars,
      wpm: computeWpm(p.correctChars, TYPING_DURATION_MS),
      accuracy: computeAccuracy(p),
    };
  },

  compare(state, a, b) {
    const pa = state.players.get(a);
    const pb = state.players.get(b);
    if (!pa || !pb) return 0;
    return compareTyping(pa, pb);
  },
};
