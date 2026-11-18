import {
  GAME_MODES,
  SALES_MAX_PLAYERS,
  SALES_NO_INPUT,
  SALES_TICK_MS,
  assignZones,
  createSalesWorld,
  moveWorker,
  packSalesWorld,
  stepSales,
  type SalesEvent,
  type SalesFrame,
  type SalesInput,
  type SalesWorld,
} from '@inbox/shared';
import type { GameMode, PlayerOutcome } from './types';

/** Input steps a player may have waiting. More than this means a burst or a cheat: the oldest are merged away. */
const MAX_QUEUE = 6;

export interface SalesState {
  world: SalesWorld;
  queues: Map<string, SalesInput[]>;
  /** The last input applied, so a held direction keeps working when a packet is late. */
  held: Map<string, SalesInput>;
  ack: Map<string, number>;
  simulatedMs: number;
  announced: boolean;
  /** Shape the room snapshot expects: recipe steps done and wrong deliveries. */
  players: Map<string, { readonly correctWords: number; readonly errors: number; nextIndex: number }>;
}

/**
 * A Toda Máquina on the server, for 1 to 4 players working together. Players only send inputs
 * (move, press or hold the action); the server runs the shift, settles every order, desk, machine
 * and delivery, and sends the whole floor to everyone. The match ends when the customers burn the
 * place down (too many angry customers, or the day's goal not reached in time).
 */
export const salesMode: GameMode<SalesState, { inputs: SalesInput[] }, { accepted: boolean }, SalesFrame> = {
  id: 'sales',
  durationMs: GAME_MODES.sales.durationMs,
  minPlayers: 1,
  maxPlayers: SALES_MAX_PLAYERS,
  tickMs: SALES_TICK_MS,

  createState(seed, playerIds) {
    const world = createSalesWorld(playerIds, seed);
    const players = new Map(
      world.workers.map((w) => [
        w.id,
        {
          get correctWords() {
            return w.steps;
          },
          get errors() {
            return w.mistakes;
          },
          nextIndex: 0,
        },
      ]),
    );
    return {
      world,
      queues: new Map(playerIds.map((id) => [id, []])),
      held: new Map(playerIds.map((id) => [id, SALES_NO_INPUT])),
      ack: new Map(playerIds.map((id) => [id, 0])),
      simulatedMs: 0,
      announced: false,
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
      q[0] = { ...q[0]!, act: q[0]!.act || dropped.act };
    }
    return { accepted: true };
  },

  tick(state, ctx) {
    const { world } = state;
    const frame = (events: SalesEvent[]): SalesFrame => ({
      tick: world.tick,
      at: ctx.startAt + state.simulatedMs,
      world: packSalesWorld(world),
      ack: Object.fromEntries(state.ack),
      events,
    });
    if (ctx.now < ctx.startAt) {
      // Show the floor and everyone's areas during the countdown.
      if (state.announced) return null;
      state.announced = true;
      return frame([]);
    }
    const target = Math.min(ctx.now, ctx.endAt) - ctx.startAt;
    const events: SalesEvent[] = [];
    let steps = 0;
    while (state.simulatedMs + SALES_TICK_MS <= target && steps < 5 && !world.over) {
      state.simulatedMs += SALES_TICK_MS;
      steps++;
      // Areas of players who dropped out go to the rest, and come back when they return.
      let changed = false;
      for (const w of world.workers) {
        const active = ctx.activeIds.includes(w.id);
        if (w.active !== active) {
          w.active = active;
          changed = true;
        }
      }
      if (changed) assignZones(world, events);
      const inputs = new Map<string, SalesInput>();
      for (const w of world.workers) {
        let input = SALES_NO_INPUT;
        if (w.active) {
          const next = state.queues.get(w.id)!.shift();
          if (next) {
            state.ack.set(w.id, next.seq);
            state.held.set(w.id, next);
            input = next;
          } else {
            // A late packet: keep walking the same way, without repeating presses.
            input = { ...state.held.get(w.id)!, act: false };
          }
        }
        moveWorker(w, input);
        inputs.set(w.id, input);
      }
      events.push(...stepSales(world, inputs));
    }
    return steps === 0 ? null : frame(events);
  },

  outcome(state, userId): PlayerOutcome {
    const { world } = state;
    const w = world.workers.find((x) => x.id === userId)!;
    const customers = world.served + world.lost;
    return {
      userId,
      // Recipe steps take the place of correct words, wrong deliveries of errors.
      correctWords: w.steps,
      errors: w.mistakes,
      // The team's score and the workday reached.
      correctChars: world.score,
      wpm: world.day,
      accuracy: customers ? Math.round((world.served / customers) * 100) : 0,
    };
  },

  isDone(state, activeIds) {
    return state.world.over !== null || activeIds.length === 0;
  },

  compare() {
    // Everyone is on the same team.
    return 0;
  },

  teamResult(state) {
    // A shift counts as a win once the team reached at least one day's goal.
    return state.world.day >= 2 ? 'win' : 'loss';
  },
};
