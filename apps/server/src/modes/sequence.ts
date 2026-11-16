import {
  GAME_MODES,
  RACE_LENGTH,
  LATE_GRACE_MS,
  MIN_MS_PER_CHAR,
  compareTyping,
  computeAccuracy,
  computeWpm,
  emptyTypingStats,
  exceedsHumanSpeed,
  generatePrompts,
  normalizeAnswer,
  type Answer,
  type PlayableModeId,
  type Prompt,
  type TypingStats,
} from '@inbox/shared';
import type { ActionContext, GameMode } from './types';

interface PlayerState extends TypingStats {
  lastAt: number | null;
  rejected: number;
}

export interface SequenceState {
  prompts: Prompt[];
  /** Kept on the server only. */
  answers: string[];
  players: Map<string, PlayerState>;
}

export type RejectReason = 'finished' | 'out-of-order' | 'not-started' | 'too-late' | 'too-fast' | 'unknown-player';

export interface SequenceActionResult {
  accepted: boolean;
  correct: boolean;
  reason?: RejectReason;
  stats: TypingStats | null;
}

interface Options {
  /** Shortest humanly possible time between two answers. */
  minGapMs: (answer: string) => number;
  /** Typing also caps sustained words per minute. */
  capWpm: boolean;
  /** Races end for a player once they reach this many correct answers. */
  finishAt?: number;
}

/**
 * Builds a mode where players answer the same sequence of prompts one by one: words to type,
 * sums to solve, shortcuts to press, steps of an office task. The server checks each answer.
 */
export function createSequenceMode(id: PlayableModeId, opts: Options): GameMode<SequenceState, Pick<Answer, 'index' | 'answer' | 'typedAt'>, SequenceActionResult> {
  const durationMs = GAME_MODES[id].durationMs;
  return {
    id,
    durationMs,
    minPlayers: GAME_MODES[id].minPlayers,
    maxPlayers: GAME_MODES[id].maxPlayers,

    createState(seed, playerIds) {
      const { prompts, answers } = generatePrompts(id, seed);
      return { prompts, answers, players: new Map(playerIds.map((p) => [p, { ...emptyTypingStats(), lastAt: null, rejected: 0 }])) };
    },

    startPayload(state) {
      return { prompts: state.prompts, answers: state.answers };
    },

    applyAction(state, userId, action, ctx: ActionContext) {
      const p = state.players.get(userId);
      if (!p) return { accepted: false, correct: false, reason: 'unknown-player', stats: null };
      const reject = (reason: RejectReason): SequenceActionResult => {
        p.rejected++;
        return { accepted: false, correct: false, reason, stats: p };
      };
      if (opts.finishAt && p.correctWords >= opts.finishAt) return reject('finished');
      if (action.index !== p.nextIndex) return reject('out-of-order');
      if (ctx.now > ctx.endAt + LATE_GRACE_MS) return reject('too-late');
      // The client's timestamp is only trusted within one second of when we received it.
      const at = Math.min(ctx.now, Math.max(action.typedAt, ctx.now - 1000));
      if (at < ctx.startAt) return reject('not-started');
      if (at > ctx.endAt) return reject('too-late');
      const expected = state.answers[action.index];
      if (expected === undefined) return reject('out-of-order');
      if (at - (p.lastAt ?? ctx.startAt) < opts.minGapMs(action.answer)) return reject('too-fast');

      const correct = normalizeAnswer(action.answer) === normalizeAnswer(expected);
      const elapsed = at - ctx.startAt;
      const next: TypingStats = { ...p, nextIndex: p.nextIndex + 1, submitted: p.submitted + 1 };
      if (correct) {
        next.correctWords += 1;
        next.correctChars += expected.length + 1;
        next.lastCorrectAt = elapsed;
      } else {
        next.errors += 1;
      }
      if (correct && opts.capWpm && exceedsHumanSpeed(next.correctChars, Math.max(elapsed, 1))) return reject('too-fast');
      Object.assign(p, next, { lastAt: at });
      return { accepted: true, correct, stats: p };
    },

    outcome(state, userId) {
      const p = state.players.get(userId) ?? { ...emptyTypingStats(), lastAt: null, rejected: 0 };
      return {
        userId,
        correctWords: p.correctWords,
        errors: p.errors,
        correctChars: p.correctChars,
        // Typing reports words per minute (over the time a racer needed to finish); the other
        // modes report correct answers per minute.
        wpm:
          id === 'typing' || id === 'racing'
            ? computeWpm(p.correctChars, opts.finishAt && p.correctWords >= opts.finishAt ? Math.max(p.lastCorrectAt ?? durationMs, 1) : durationMs)
            : Math.round(p.correctWords / (durationMs / 60_000)),
        accuracy: computeAccuracy(p),
      };
    },

    isDone(state, activeIds) {
      const goal = opts.finishAt;
      if (!goal) return false;
      return activeIds.length > 0 && activeIds.every((uid) => (state.players.get(uid)?.correctWords ?? 0) >= goal);
    },

    compare(state, a, b) {
      const pa = state.players.get(a);
      const pb = state.players.get(b);
      return pa && pb ? compareTyping(pa, pb) : 0;
    },
  };
}

export const typingMode = createSequenceMode('typing', { minGapMs: (w) => w.trim().length * MIN_MS_PER_CHAR, capWpm: true });
export const racingMode = createSequenceMode('racing', { minGapMs: (w) => w.trim().length * MIN_MS_PER_CHAR, capWpm: true, finishAt: RACE_LENGTH });
export const mathMode = createSequenceMode('math', { minGapMs: () => 250, capWpm: false });
export const keysMode = createSequenceMode('keys', { minGapMs: () => 120, capWpm: false });
export const taskMode = createSequenceMode('task', { minGapMs: () => 250, capWpm: false });
