import type { GameModeId, MatchResult, Prompt } from '@inbox/shared';

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
export interface TickContext extends ActionContext {
  /** Players who are connected and did not abandon. */
  activeIds: string[];
}

export interface GameMode<State, Action, ActionResult, Frame = never> {
  id: GameModeId;
  durationMs: number;
  minPlayers: number;
  maxPlayers: number;
  /** options: what each player picked in the lobby (Office Battle powers), by user id. */
  createState(seed: number, playerIds: string[], options?: ReadonlyMap<string, unknown>): State;
  /** prompts go to every player when the match goes live; answers stay on the server. */
  startPayload(state: State): { prompts: Prompt[]; answers: string[] };
  applyAction(state: State, userId: string, action: Action, ctx: ActionContext): ActionResult;
  outcome(state: State, userId: string): PlayerOutcome;
  /** True when the match can end before the clock runs out (every active player finished a race). */
  isDone?(state: State, activeIds: string[]): boolean;
  /** Positive if a beats b, negative if b beats a, 0 draw. */
  compare(state: State, a: string, b: string): number;
  /** Real-time modes (Office Battle) run a simulation every tickMs while the match is live. */
  tickMs?: number;
  /** Advances the simulation; the frame it returns goes to every player. */
  tick?(state: State, ctx: TickContext): Frame | null;
  /** Cooperative modes: the whole team wins or loses together, and ratings do not change. */
  teamResult?(state: State): Exclude<MatchResult, 'abandon' | 'draw'>;
}
