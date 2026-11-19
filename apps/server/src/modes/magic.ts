import {
  GAME_MODES,
  MF_IDLE_NET_INPUT,
  MF_TICK_MS,
  createConquestMatch,
  decodeMagicInput,
  heldMagicInput,
  mergeMagicInput,
  packMagicWorld,
  stepMagicWorld,
  type MagicFrame,
  type MagicNetInput,
  type MfEvent,
  type MfInput,
  type MfWorld,
} from '@inbox/shared';
import type { GameMode, PlayerOutcome } from './types';

/** Input steps a player may have waiting. More than this means a burst or a cheat: the oldest are merged away. */
const MAX_QUEUE = 6;
/** Simulation steps per server tick: the battle runs at 30 steps a second and pictures go out at 15. */
const STEPS_PER_TICK = 2;

type Stats = { readonly correctWords: number; readonly errors: number; nextIndex: number };

export interface MagicState {
  world: MfWorld;
  /** Player id by team: the first player commands the south army, the second the north. */
  teams: string[];
  queues: Map<string, MagicNetInput[]>;
  held: Map<string, MagicNetInput>;
  ack: Map<string, number>;
  simulatedMs: number;
  announced: boolean;
  /** Shape the room snapshot expects: enemy soldiers defeated and own soldiers lost. */
  players: Map<string, Stats>;
}

/** Soldiers of `team` that have fallen (gates never count). */
function fallen(world: MfWorld, team: number) {
  return world.units.filter((u) => u.team === team && !u.alive && u.kind !== 'gate').length;
}

/**
 * Magic Frontiers conquest, 1 against 1. Each player only sends their commander's input; the
 * server runs the whole battle (soldiers, fortresses, gold and training) with the same rules as
 * practice and sends the picture to both.
 */
export const magicMode: GameMode<MagicState, { inputs: MagicNetInput[] }, { accepted: boolean }, MagicFrame> = {
  id: 'magic',
  durationMs: GAME_MODES.magic.durationMs,
  minPlayers: 2,
  maxPlayers: 2,
  tickMs: MF_TICK_MS * STEPS_PER_TICK,

  createState(seed, playerIds) {
    const world = createConquestMatch(seed);
    world.armies[0]!.name = 'Ejército del Sur';
    world.armies[1]!.name = 'Ejército del Norte';
    const teams = playerIds.slice(0, 2);
    return {
      world,
      teams,
      queues: new Map(teams.map((id) => [id, []])),
      held: new Map(teams.map((id) => [id, MF_IDLE_NET_INPUT])),
      ack: new Map(teams.map((id) => [id, 0])),
      simulatedMs: 0,
      announced: false,
      players: new Map(
        teams.map((id, team) => [
          id,
          {
            get correctWords() {
              return fallen(world, 1 - team);
            },
            get errors() {
              return fallen(world, team);
            },
            nextIndex: 0,
          },
        ]),
      ),
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
      const dropped = q.shift()!;
      q[0] = mergeMagicInput(dropped, q[0]!);
    }
    return { accepted: true };
  },

  tick(state, ctx) {
    const { world } = state;
    const frame = (events: MfEvent[]): MagicFrame => ({
      tick: world.tick,
      at: ctx.startAt + state.simulatedMs,
      world: packMagicWorld(world),
      teams: state.teams,
      ack: Object.fromEntries(state.ack),
      events,
    });
    if (ctx.now < ctx.startAt) {
      if (state.announced) return null;
      state.announced = true;
      return frame([]);
    }
    const target = Math.min(ctx.now, ctx.endAt) - ctx.startAt;
    const events: MfEvent[] = [];
    let steps = 0;
    // Catch up after a slow timer, but never more than a handful of steps at once.
    while (state.simulatedMs + MF_TICK_MS <= target && steps < STEPS_PER_TICK * 3 && !world.over) {
      state.simulatedMs += MF_TICK_MS;
      steps++;
      const inputs = new Map<number, MfInput>();
      state.teams.forEach((id, team) => {
        // A player who left or lost connection: the commander stands still and the army fights on its own.
        if (!ctx.activeIds.includes(id)) return;
        const next = state.queues.get(id)!.shift();
        if (next) {
          state.ack.set(id, next.seq);
          state.held.set(id, next);
          inputs.set(team, decodeMagicInput(next));
        } else {
          // A late packet: keep walking the same way, without repeating presses.
          inputs.set(team, decodeMagicInput(heldMagicInput(state.held.get(id)!)));
        }
      });
      events.push(...stepMagicWorld(world, inputs));
    }
    return steps === 0 ? null : frame(events);
  },

  outcome(state, userId): PlayerOutcome {
    const { world } = state;
    const team = state.teams.indexOf(userId);
    const econ = world.econ[team];
    return {
      userId,
      // Enemy soldiers defeated take the place of correct words, own losses of errors.
      correctWords: team >= 0 ? fallen(world, 1 - team) : 0,
      errors: team >= 0 ? fallen(world, team) : 0,
      // Victory points, and fortresses held at the end.
      correctChars: Math.floor(econ?.vp ?? 0),
      wpm: world.forts.filter((f) => f.owner === team).length,
      accuracy: 0,
    };
  },

  isDone(state, activeIds) {
    // Over when someone reaches the points (or the clock runs out), or one side left for good.
    return state.world.over || state.teams.filter((id) => activeIds.includes(id)).length < 2;
  },

  compare(state, a, b) {
    const { world } = state;
    const ta = state.teams.indexOf(a);
    const tb = state.teams.indexOf(b);
    if (world.over && world.winner >= 0) return world.winner === ta ? 1 : world.winner === tb ? -1 : 0;
    const va = world.econ[ta]?.vp ?? 0;
    const vb = world.econ[tb]?.vp ?? 0;
    return Math.sign(Math.floor(va) - Math.floor(vb));
  },
};
