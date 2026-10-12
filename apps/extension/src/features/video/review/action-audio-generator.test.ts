import { expect, it } from 'vitest';
import {
  actionAudioSeed,
  iterateActionTypingWindow,
  actionTypingBlock,
} from './action-audio-generator';

it('pins v1 UTF8 typed-identity and stable-source-span seed vectors', () => {
  expect(actionAudioSeed({ kind: 'action', id: 'click' }, 'typing-natural-v1', '[0,5]')).toBe(
    2057412440
  );
  expect(actionAudioSeed({ kind: 'signal', id: 'typing' }, 'typing-natural-v1', '[0,5]')).toBe(
    3846533255
  );
  expect(actionAudioSeed({ kind: 'signal', id: 'текст' }, 'typing-natural-v1', '[2,7]')).toBe(
    1145128811
  );
});

it('queries independent native-frame blocks with stable IDs and every pre-window tail', () => {
  const seed = actionAudioSeed({ kind: 'signal', id: 'typing' }, 'typing-natural-v1', '[0,15]');
  const whole = [...iterateActionTypingWindow(seed, 0, 15)];
  const partition = [
    ...iterateActionTypingWindow(seed, 0, 2),
    ...iterateActionTypingWindow(seed, 2, 5),
    ...iterateActionTypingWindow(seed, 5, 15),
  ];
  const union = [...new Map(partition.map((event) => [event.id, event])).values()];
  expect(union).toEqual(whole);
  expect(whole[0]?.startFrame).toBe(0);
  for (const event of whole) {
    expect(Number.isInteger(event.startFrame)).toBe(true);
    expect(event.sampleId).toMatch(/^key-0[1-4]-v1$/u);
    expect(event.gain).toBeGreaterThanOrEqual(0.85);
    expect(event.gain).toBeLessThanOrEqual(1.15);
  }
  for (let index = 1; index < whole.length; index++)
    expect(whole[index]!.startFrame - whole[index - 1]!.startFrame).toBeGreaterThanOrEqual(3675);
  const before = whole.find((event) => event.startFrame > 44100)!;
  const seek = before.startFrame / 44100 + 0.001;
  expect([...iterateActionTypingWindow(seed, seek, seek + 0.01)]).toContainEqual(before);
  expect([...iterateActionTypingWindow(seed, 1000, 1001)]).toEqual([
    ...iterateActionTypingWindow(seed, 1000, 1001),
  ]);
  expect(actionTypingBlock(seed, 500).length).toBeLessThanOrEqual(16);
  expect(actionTypingBlock(seed, 500).every((event) => event.id.startsWith('500:'))).toBe(true);
  expect(() => actionTypingBlock(seed, -1)).toThrow('invalid');
});
