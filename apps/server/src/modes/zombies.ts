import {
  GAME_MODES,
  ZOMBIE_MAX_PLAYERS,
  ZOMBIE_NO_INPUT,
  ZOMBIE_TICK_MS,
  addSurvivor,
  createZombieWorld,
  packZombieWorld,
  stepZombieWorld,
  wavesSurvived,
  type ZEvent,
  type ZombieFrame,
  type ZombieInput,
  type ZombieWorld,
} from '@inbox/shared';
import type { GameMode, PlayerOutcome } from './types';

/** Input steps a player may have waiting. More than this means a burst or a cheat: the oldest are merged away. */
const MAX_QUEUE = 6;

type Stats = { readonly correctWords: number; readonly errors: number; nextIndex: number };

export interface ZombieState {
  world: ZombieWorld;
  queues: Map<string, ZombieInput[]>;
  /** The last input applied, so a held direction keeps working when a packet is late. */
  held: Map<string, ZombieInput>;
  ack: Map<string, number>;
  simulatedMs: number;
  announced: boolean;
  /** Events that happened outside a tick (someone joined), sent with the next frame. */
  pending: ZEvent[];
  /** Shape the room snapshot expects: kills and times fallen. */
  players: Map<string, Stats>;
}

function statsOf(world: ZombieWorld, id: string): Stats {
  return {
    get correctWords() {
      return world.survivors.find((s) => s.id === id)?.kills ?? 0;
    },
    get errors() {
      return world.survivors.find((s) => s.id === id)?.downs ?? 0;
    },
    nextIndex: 0,
  };
}

/**
 * Zona Zombi on the server, for 1 to 4 players. Players only send inputs; the server runs the
 * whole map (zombies, weapons, shops, vehicles and barricades) and sends it to everyone. Friendly
 * fire is always on. Fallen players get back up after a few seconds, so the match only ends when
 * everyone is down at the same time. Matches are public: anyone can join one in progress.
 */
export const zombiesMode: GameMode<ZombieState, { inputs: ZombieInput[] }, { accepted: boolean }, ZombieFrame> = {
  id: 'zombies',
  durationMs: GAME_MODES.zombies.durationMs,
  minPlayers: 1,
  maxPlayers: ZOMBIE_MAX_PLAYERS,
  tickMs: ZOMBIE_TICK_MS,

  createState(seed, playerIds) {
    const world = createZombieWorld(playerIds, seed, true);
    return {
      world,
      queues: new Map(playerIds.map((id) => [id, []])),
      held: new Map(playerIds.map((id) => [id, ZOMBIE_NO_INPUT])),
      ack: new Map(playerIds.map((id) => [id, 0])),
      simulatedMs: 0,
      announced: false,
      pending: [],
      players: new Map(playerIds.map((id) => [id, statsOf(world, id)])),
    };
  },

  addPlayer(state, userId) {
    if (state.world.survivors.some((s) => s.id === userId)) return;
    addSurvivor(state.world, userId, state.pending);
    state.queues.set(userId, []);
    state.held.set(userId, ZOMBIE_NO_INPUT);
    state.ack.set(userId, 0);
    state.players.set(userId, statsOf(state.world, userId));
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
      q[0] = {
        ...next,
        atk: next.atk || dropped.atk,
        dge: next.dge || dropped.dge,
        use: next.use || dropped.use,
        cyc: next.cyc || dropped.cyc,
        sel: next.sel >= 0 ? next.sel : dropped.sel,
        buy: next.buy >= 0 ? next.buy : dropped.buy,
      };
    }
    return { accepted: true };
  },

  tick(state, ctx) {
    const { world } = state;
    const frame = (events: ZEvent[]): ZombieFrame => ({
      tick: world.tick,
      at: ctx.startAt + state.simulatedMs,
      world: packZombieWorld(world),
      ack: Object.fromEntries(state.ack),
      events,
    });
    if (ctx.now < ctx.startAt) {
      if (state.announced) return null;
      state.announced = true;
      return frame([]);
    }
    const target = Math.min(ctx.now, ctx.endAt) - ctx.startAt;
    const events: ZEvent[] = state.pending.splice(0);
    let steps = 0;
    while (state.simulatedMs + ZOMBIE_TICK_MS <= target && steps < 5 && !world.over) {
      state.simulatedMs += ZOMBIE_TICK_MS;
      steps++;
      const inputs = new Map<string, ZombieInput>();
      for (const s of world.survivors) {
        s.active = ctx.activeIds.includes(s.id);
        if (!s.active) continue;
        const next = state.queues.get(s.id)?.shift();
        if (next) {
          state.ack.set(s.id, next.seq);
          state.held.set(s.id, next);
          inputs.set(s.id, next);
        } else {
          // A late packet: keep moving and holding the same way, without repeating presses.
          const h = state.held.get(s.id) ?? ZOMBIE_NO_INPUT;
          inputs.set(s.id, { ...h, atk: false, dge: false, use: false, cyc: false, sel: -1, buy: -1 });
        }
      }
      events.push(...stepZombieWorld(world, inputs));
    }
    return steps === 0 ? null : frame(events);
  },

  outcome(state, userId): PlayerOutcome {
    const { world } = state;
    const s = world.survivors.find((x) => x.id === userId);
    return {
      userId,
      // Kills take the place of correct words, times fallen of errors.
      correctWords: s?.kills ?? 0,
      errors: s?.downs ?? 0,
      // Money made in the match, and the wave reached.
      correctChars: s?.earned ?? 0,
      wpm: world.wave,
      accuracy: s?.bigKills ?? 0,
    };
  },

  isDone(state, activeIds) {
    return state.world.over || activeIds.length === 0;
  },

  compare() {
    return 0;
  },

  teamResult(state) {
    // Surviving four full waves counts as a win.
    return wavesSurvived(state.world) >= 4 ? 'win' : 'loss';
  },
};
