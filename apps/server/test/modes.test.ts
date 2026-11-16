import { describe, expect, it } from 'vitest';
import { comboId, generatePrompts } from '@inbox/shared';
import { keysMode, mathMode, taskMode, typingMode } from '../src/modes/sequence';

const ctx = (now: number) => ({ now, startAt: 0, endAt: 20_000 });

describe('sequence modes', () => {
  it('generates the same prompts for the same seed and hides nothing the client needs', () => {
    for (const mode of ['typing', 'math', 'keys', 'task'] as const) {
      const a = generatePrompts(mode, 7);
      expect(a).toEqual(generatePrompts(mode, 7));
      expect(a.prompts.length).toBe(a.answers.length);
      expect(a.prompts.length).toBeGreaterThanOrEqual(40);
    }
  });

  it('math checks the result', () => {
    const s = mathMode.createState(3, ['a', 'b']);
    const [x, op, y] = s.prompts[0]!.text.split(' ');
    const res = op === '+' ? +x! + +y! : op === '−' ? +x! - +y! : +x! * +y!;
    expect(mathMode.applyAction(s, 'a', { index: 0, answer: String(res), typedAt: 800 }, ctx(800)).correct).toBe(true);
    expect(mathMode.applyAction(s, 'a', { index: 1, answer: '-1', typedAt: 1600 }, ctx(1600)).correct).toBe(false);
    expect(mathMode.outcome(s, 'a')).toMatchObject({ correctWords: 1, errors: 1 });
  });

  it('keys accepts the canonical combo, in any modifier order', () => {
    const s = keysMode.createState(11, ['a', 'b']);
    const p = s.prompts.find((x) => x.kind === 'combo')!;
    const i = s.prompts.indexOf(p);
    s.players.get('a')!.nextIndex = i;
    const shuffled = comboId([...p.keys!].reverse());
    expect(keysMode.applyAction(s, 'a', { index: i, answer: shuffled, typedAt: 500 }, ctx(500)).correct).toBe(true);
  });

  it('task scores the right option and never sends answers in prompts', () => {
    const s = taskMode.createState(5, ['a', 'b']);
    const p = s.prompts[0]!;
    expect(p.choices).toHaveLength(3);
    expect(JSON.stringify(p)).not.toContain('"ok"');
    expect(taskMode.applyAction(s, 'a', { index: 0, answer: s.answers[0]!, typedAt: 900 }, ctx(900)).correct).toBe(true);
  });

  it('rejects answers that come faster than a human can', () => {
    const s = mathMode.createState(1, ['a', 'b']);
    mathMode.applyAction(s, 'a', { index: 0, answer: s.answers[0]!, typedAt: 1000 }, ctx(1000));
    const r = mathMode.applyAction(s, 'a', { index: 1, answer: s.answers[1]!, typedAt: 1050 }, ctx(1050));
    expect(r).toMatchObject({ accepted: false, reason: 'too-fast' });
    const t = typingMode.createState(1, ['a', 'b']);
    expect(typingMode.applyAction(t, 'a', { index: 0, answer: t.answers[0]!, typedAt: -5 }, ctx(-5)).reason).toBe('not-started');
  });
});
