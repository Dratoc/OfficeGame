import {
  GAME_MODES,
  NO_INPUT,
  compareFighters,
  createFighter,
  packFighter,
  resolveCombat,
  stepFighter,
  OFFICE_TICK_MS,
  type Fighter,
  type OfficeEvent,
  type OfficeFrame,
  type OfficeInput,
} from '@inbox/shared';
import type { GameMode, PlayerOutcome } from './types';

/** Input steps a player may have waiting. More than this means a burst or a cheat: the oldest are merged away. */
const MAX_QUEUE = 6;

export interface OfficeState {
  fighters: Map<string, Fighter>;
  order: string[];
  queues: Map<string, OfficeInput[]>;
  /** The last input applied, so a held direction keeps working when a packet is late. */
  held: Map<string, OfficeInput>;
  ack: Map<string, number>;
  tick: number;
  /** Simulation time already run, in ms since the start. */
  simulatedMs: number;
  /** The starting positions were sent during the countdown. */
  announced: boolean;
  /** Shape the room snapshot expects: hits landed and hits taken. */
  players: Map<string, { readonly correctWords: number; readonly errors: number; nextIndex: number }>;
}

/**
 * Office Battle on the server. Players only send inputs (move, attack, block, dodge); the
 * server runs the fixed-step simulation, settles every hit and sends the result to both.
 * One input step is consumed per simulation step, so sending more inputs never makes you faster.
 */
export const officeMode: GameMode<OfficeState, { inputs: OfficeInput[] }, { accepted: boolean }, OfficeFrame> = {
  id: 'office',
  durationMs: GAME_MODES.office.durationMs,
  minPlayers: 2,
  maxPlayers: 2,
  tickMs: OFFICE_TICK_MS,

  createState(_seed, playerIds) {
    const fighters = new Map(playerIds.map((id, i) => [id, createFighter(id, i)]));
    const players = new Map(
      playerIds.map((id) => {
        const f = fighters.get(id)!;
        return [
          id,
          {
            get correctWords() {
              return f.hits;
            },
            get errors() {
              return f.taken;
            },
            nextIndex: 0,
          },
        ];
      }),
    );
    return {
      fighters,
      order: [...playerIds],
      queues: new Map(playerIds.map((id) => [id, []])),
      held: new Map(playerIds.map((id) => [id, NO_INPUT])),
      ack: new Map(playerIds.map((id) => [id, 0])),
      tick: 0,
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
    // Steps arrive in order; anything already queued or applied is a resend and is ignored.
    let last = q.length ? q[q.length - 1]!.seq : state.ack.get(userId)!;
    for (const input of action.inputs) {
      if (input.seq <= last) continue;
      q.push(input);
      last = input.seq;
    }
    while (q.length > MAX_QUEUE) {
      // Keep presses that would otherwise be lost when merging away old steps.
      const dropped = q.shift()!;
      q[0] = { ...q[0]!, atk: q[0]!.atk || dropped.atk, dge: q[0]!.dge || dropped.dge };
    }
    return { accepted: true };
  },

  tick(state, ctx) {
    const frame = (events: OfficeEvent[]): OfficeFrame => ({
      tick: state.tick,
      at: ctx.startAt + state.simulatedMs,
      fighters: state.order.map((id) => packFighter(state.fighters.get(id)!)),
      ack: Object.fromEntries(state.ack),
      events,
    });
    if (ctx.now < ctx.startAt) {
      // Show both fighters in their corners during the countdown.
      if (state.announced) return null;
      state.announced = true;
      return frame([]);
    }
    const target = Math.min(ctx.now, ctx.endAt) - ctx.startAt;
    const events: OfficeEvent[] = [];
    let steps = 0;
    // Catch up on missed steps after a slow timer, but never more than a handful at once.
    while (state.simulatedMs + OFFICE_TICK_MS <= target && steps < 5) {
      state.simulatedMs += OFFICE_TICK_MS;
      steps++;
      state.tick++;
      const list = state.order.map((id) => state.fighters.get(id)!);
      for (const f of list) {
        const rival = list.find((o) => o !== f) ?? null;
        let input = NO_INPUT;
        if (ctx.activeIds.includes(f.id)) {
          const next = state.queues.get(f.id)!.shift();
          if (next) {
            state.ack.set(f.id, next.seq);
            state.held.set(f.id, next);
            input = next;
          } else {
            // A late packet: keep moving and blocking the same way, without repeating presses.
            input = { ...state.held.get(f.id)!, atk: false, dge: false };
          }
        }
        stepFighter(f, input, rival);
      }
      events.push(...resolveCombat(list));
      if (list.some((f) => f.hp <= 0)) break;
    }
    return steps === 0 ? null : frame(events);
  },

  outcome(state, userId): PlayerOutcome {
    const f = state.fighters.get(userId)!;
    return {
      userId,
      correctWords: f.hits,
      errors: f.taken,
      // Damage dealt and health left take the place of characters and speed.
      correctChars: f.dealt,
      wpm: 0,
      accuracy: f.attacks ? Math.round((f.hits / f.attacks) * 100) : 0,
    };
  },

  isDone(state) {
    return [...state.fighters.values()].some((f) => f.hp <= 0);
  },

  compare(state, a, b) {
    return compareFighters(state.fighters.get(a)!, state.fighters.get(b)!);
  },
};
