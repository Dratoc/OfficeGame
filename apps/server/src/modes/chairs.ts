import {
  CHAIRS_CLOSE_MS,
  CHAIRS_MAX_PLAYERS,
  CHAIRS_NO_INPUT,
  CHAIRS_TICK_MS,
  GAME_MODES,
  compareKarts,
  createChairsWorld,
  createKart,
  packBall,
  packKart,
  resolveChairs,
  stepKart,
  type ChairsEvent,
  type ChairsFrame,
  type ChairsInput,
  type ChairsWorld,
  type Kart,
} from '@inbox/shared';
import type { GameMode, PlayerOutcome } from './types';

/** Input steps a player may have waiting. More than this means a burst or a cheat: the oldest are merged away. */
const MAX_QUEUE = 6;

export interface ChairsState {
  karts: Map<string, Kart>;
  world: ChairsWorld;
  order: string[];
  queues: Map<string, ChairsInput[]>;
  /** The last input applied, so held steering keeps working when a packet is late. */
  held: Map<string, ChairsInput>;
  ack: Map<string, number>;
  tick: number;
  simulatedMs: number;
  announced: boolean;
  /** Simulation time (ms since the start) when the race closes, once someone finished. */
  closeAtMs: number | null;
  /** Shape the room snapshot expects: hits landed and hits taken. */
  players: Map<string, { readonly correctWords: number; readonly errors: number; nextIndex: number }>;
}

/**
 * Chair Race on the server, for 2 to 4 players. Like Office Battle, players only send inputs
 * (steer, throttle, throw, hop); the server runs the fixed-step race, settles every paper ball
 * and boost, and sends the result to everyone. One input step is used per simulation step.
 */
export const chairsMode: GameMode<ChairsState, { inputs: ChairsInput[] }, { accepted: boolean }, ChairsFrame> = {
  id: 'chairs',
  durationMs: GAME_MODES.chairs.durationMs,
  minPlayers: 2,
  maxPlayers: CHAIRS_MAX_PLAYERS,
  tickMs: CHAIRS_TICK_MS,

  createState(_seed, playerIds) {
    const karts = new Map(playerIds.map((id, i) => [id, createKart(id, i)]));
    const players = new Map(
      playerIds.map((id) => {
        const k = karts.get(id)!;
        return [
          id,
          {
            get correctWords() {
              return k.hits;
            },
            get errors() {
              return k.taken;
            },
            nextIndex: 0,
          },
        ];
      }),
    );
    return {
      karts,
      world: createChairsWorld(playerIds.map((id) => karts.get(id)!)),
      order: [...playerIds],
      queues: new Map(playerIds.map((id) => [id, []])),
      held: new Map(playerIds.map((id) => [id, CHAIRS_NO_INPUT])),
      ack: new Map(playerIds.map((id) => [id, 0])),
      tick: 0,
      simulatedMs: 0,
      announced: false,
      closeAtMs: null,
      players,
    };
  },

  startPayload() {
    return { prompts: [], answers: [] };
  },

  applyAction(state, userId, action, ctx) {
    const q = state.queues.get(userId);
    if (!q || ctx.now < ctx.startAt - 500 || ctx.now > ctx.endAt) return { accepted: false };
    let last = q.length ? q[q.length - 1]!.seq : state.ack.get(userId)!;
    for (const input of action.inputs) {
      if (input.seq <= last) continue;
      q.push(input);
      last = input.seq;
    }
    while (q.length > MAX_QUEUE) {
      // Keep presses that would otherwise be lost when merging away old steps.
      const dropped = q.shift()!;
      const next = q[0]!;
      q[0] = { ...next, fire: next.fire || dropped.fire, hop: next.hop || dropped.hop };
    }
    return { accepted: true };
  },

  tick(state, ctx) {
    const frame = (events: ChairsEvent[]): ChairsFrame => ({
      tick: state.tick,
      at: ctx.startAt + state.simulatedMs,
      karts: state.order.map((id) => packKart(state.karts.get(id)!)),
      balls: state.world.balls.map(packBall),
      ack: Object.fromEntries(state.ack),
      events,
      closeAt: state.closeAtMs === null ? null : ctx.startAt + state.closeAtMs,
    });
    if (ctx.now < ctx.startAt) {
      // Show every chair on the grid during the countdown.
      if (state.announced) return null;
      state.announced = true;
      return frame([]);
    }
    const target = Math.min(ctx.now, ctx.endAt) - ctx.startAt;
    const events: ChairsEvent[] = [];
    let steps = 0;
    while (state.simulatedMs + CHAIRS_TICK_MS <= target && steps < 5) {
      state.simulatedMs += CHAIRS_TICK_MS;
      steps++;
      state.tick++;
      for (const k of state.world.karts) {
        let input = CHAIRS_NO_INPUT;
        if (ctx.activeIds.includes(k.id)) {
          const next = state.queues.get(k.id)!.shift();
          if (next) {
            state.ack.set(k.id, next.seq);
            state.held.set(k.id, next);
            input = next;
          } else {
            // A late packet: keep steering the same way, without repeating presses.
            input = { ...state.held.get(k.id)!, fire: false, hop: 0 };
          }
        }
        stepKart(k, input);
      }
      const evs = resolveChairs(state.world);
      events.push(...evs);
      if (state.closeAtMs === null && evs.some((e) => e.type === 'finish')) state.closeAtMs = state.simulatedMs + CHAIRS_CLOSE_MS;
    }
    return steps === 0 ? null : frame(events);
  },

  outcome(state, userId): PlayerOutcome {
    const k = state.karts.get(userId)!;
    return {
      userId,
      // Paper balls landed and taken take the place of correct words and errors.
      correctWords: k.hits,
      errors: k.taken,
      // Laps finished take the place of characters.
      correctChars: k.lap,
      wpm: 0,
      accuracy: k.shots ? Math.min(100, Math.round((k.hits / k.shots) * 100)) : 0,
    };
  },

  isDone(state, activeIds) {
    // Everyone still connected crossed the finish line, or the time after the first one ran out.
    if (state.closeAtMs !== null && state.simulatedMs >= state.closeAtMs) return true;
    const racing = activeIds.filter((id) => state.karts.get(id)?.done === 0);
    return activeIds.length > 0 && racing.length === 0;
  },

  compare(state, a, b) {
    return compareKarts(state.karts.get(a)!, state.karts.get(b)!);
  },
};
