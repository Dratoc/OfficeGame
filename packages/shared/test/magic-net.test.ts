import { describe, expect, it } from 'vitest';
import {
  MF_NO_INPUT,
  commanderOf,
  createConquestMatch,
  decodeMagicInput,
  encodeMagicInput,
  packMagicWorld,
  predictCommander,
  stepMagicWorld,
  unpackMagicWorld,
  type MfInput,
} from '../src';

describe('Magic Frontiers online', () => {
  it('sends a commander input and gets the same input back', () => {
    const input: MfInput = { mx: 0.6, mz: -0.8, aimX: 12.5, aimZ: -30, strike: true, order: 'defend', select: 'mage', volley: true, formation: 'wedge', buy: 'beast', garrison: 'recall' };
    expect(decodeMagicInput(encodeMagicInput(input, 7))).toEqual(input);
    expect(decodeMagicInput(encodeMagicInput(MF_NO_INPUT, 1))).toEqual({ ...MF_NO_INPUT, buy: null, garrison: null });
  });

  it('packs a battle into a picture the renderer can read', () => {
    const w = createConquestMatch(5);
    for (let i = 0; i < 40; i++) stepMagicWorld(w, new Map([[0, { ...MF_NO_INPUT, mz: 1, aimX: 0, aimZ: 0, buy: i === 1 ? 'warrior' : null }]]));
    const packed = packMagicWorld(w);
    const json = JSON.stringify(packed);
    // Small enough to send 15 times a second.
    expect(json.length).toBeLessThan(12_000);
    const view = unpackMagicWorld(JSON.parse(json));
    expect(view.units).toHaveLength(w.units.length);
    const a = commanderOf(w, 0);
    const b = commanderOf(view, 0);
    expect(b.x).toBeCloseTo(a.x, 1);
    expect(b.z).toBeCloseTo(a.z, 1);
    expect(b.alive).toBe(true);
    expect(view.forts.map((f) => f.name)).toEqual(w.forts.map((f) => f.name));
    expect(view.econ[0]!.queue).toHaveLength(w.econ[0]!.queue.length);
    expect(view.armies[0]!.formation).toBe(w.armies[0]!.formation);
  });

  it('predicts the commander walk close to what the server does', () => {
    const w = createConquestMatch(5);
    const cmd = commanderOf(w, 0);
    const guess = { x: cmd.x, z: cmd.z, vx: cmd.vx, vz: cmd.vz, facing: cmd.facing };
    for (let i = 0; i < 30; i++) {
      const input = { ...MF_NO_INPUT, mx: 0.3, mz: 1, aimX: cmd.x, aimZ: cmd.z + 10 };
      predictCommander(guess, input, 'conquest');
      stepMagicWorld(w, new Map([[0, input]]));
    }
    expect(Math.hypot(guess.x - cmd.x, guess.z - cmd.z)).toBeLessThan(1);
  });
});
