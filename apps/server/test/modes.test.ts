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

describe('puzzle mode', () => {
  it('generates solvable puzzles of every kind', () => {
    const { prompts, answers } = generatePrompts('puzzle', 99);
    expect(prompts.length).toBe(60);
    const labels = new Set(prompts.map((p) => p.label));
    expect(labels.size).toBe(4);
    prompts.forEach((p, i) => {
      const a = answers[i]!;
      if (p.input === 'choice') expect(p.choices!.map((c) => c.id)).toContain(a);
      if (p.input === 'number') expect(Number.isFinite(Number(a))).toBe(true);
      if (p.input === 'text') {
        expect(p.text.toLowerCase().split('').sort().join('')).toBe(a.split('').sort().join(''));
        expect(p.text.toLowerCase()).not.toBe(a);
      }
    });
  });

  it('checks series answers and stops at the goal', async () => {
    const { puzzleMode } = await import('../src/modes/sequence');
    const { PUZZLE_GOAL } = await import('@inbox/shared');
    const s = puzzleMode.createState(4, ['a', 'b']);
    let t = 0;
    for (let i = 0; i < PUZZLE_GOAL; i++) {
      t += 900;
      expect(puzzleMode.applyAction(s, 'a', { index: i, answer: s.answers[i]!, typedAt: t }, { now: t, startAt: 0, endAt: 45_000 }).correct).toBe(true);
    }
    expect(puzzleMode.applyAction(s, 'a', { index: PUZZLE_GOAL, answer: s.answers[PUZZLE_GOAL]!, typedAt: t + 900 }, { now: t + 900, startAt: 0, endAt: 45_000 })).toMatchObject({ accepted: false, reason: 'finished' });
    expect(puzzleMode.isDone!(s, ['a'])).toBe(true);
  });
});
