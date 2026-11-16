import type { GameModeId } from '@inbox/shared';

export interface ActionContext {
  now: number;
  startAt: number;
  endAt: number;
}

export interface PlayerOutcome {
  userId: string;
  correctWords: number;
  errors: number;
  correctChars: number;
  wpm: number;
  accuracy: number;
}

/**
 * A game mode is a pure rule set. The match engine owns rooms, clocks, sockets and
 * persistence; a mode only knows how to start, apply a player action and rank players.
 * New modes (Racing, Puzzle, Office) implement this same interface.
 */
export interface GameMode<State, Action, ActionResult> {
  id: GameModeId;
  durationMs: number;
  minPlayers: number;
  maxPlayers: number;
  createState(seed: number, playerIds: string[]): State;
  /** What every player receives when the match goes live. */
  startPayload(state: State): { words: string[] };
  applyAction(state: State, userId: string, action: Action, ctx: ActionContext): ActionResult;
  outcome(state: State, userId: string): PlayerOutcome;
  /** Positive if a beats b, negative if b beats a, 0 draw. */
  compare(state: State, a: string, b: string): number;
}
