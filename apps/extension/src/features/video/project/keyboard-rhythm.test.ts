import { expect, it } from 'vitest';
import {
  encodeRecordingKeyboardRhythm,
  isRecordingKeyboardRhythmBlock,
  iterateRecordingKeyboardRhythm,
  isRecordingKeyboardRhythmBlocks,
} from './keyboard-rhythm';

it('retains arbitrary intervals on a bounded absolute grid without drift and supports stable window identity', () => {
  const times = Array.from({ length: 4096 }, (_, index) => 1 + index * 0.13737);
  const block = encodeRecordingKeyboardRhythm('block', times);
  const decoded = [...iterateRecordingKeyboardRhythm(block)];
  expect(block.encoding).toBe('delta');
  expect(decoded).toHaveLength(times.length);
  decoded.forEach((attack, index) =>
    expect(Math.abs(attack.time - times[index]!)).toBeLessThanOrEqual(0.000500001)
  );
  expect([
    ...iterateRecordingKeyboardRhythm(block, decoded[300]!.time, decoded[302]!.time),
  ]).toEqual(decoded.slice(300, 303));
});

it('uses RLE for regular cadence and keeps real long pauses and zero deltas', () => {
  const block = encodeRecordingKeyboardRhythm('pause', [0, 0, 0.1, 0.2, 1.05, 1.15]);
  expect([...iterateRecordingKeyboardRhythm(block)].map((attack) => attack.time)).toEqual([
    0, 0, 0.1, 0.2, 1.05, 1.15,
  ]);
  expect(
    encodeRecordingKeyboardRhythm(
      'regular',
      Array.from({ length: 4096 }, (_, index) => index / 10)
    ).ticks
  ).toEqual([0, 1, 100, 4095]);
});

it('rejects expansion bombs, malformed runs, future versions and out-of-source times before iteration', () => {
  const block = encodeRecordingKeyboardRhythm('valid', [1, 2]);
  for (const patch of [
    { version: 2 },
    { count: 10000000 },
    { encoding: 'rle', ticks: [0, 10000000] },
    { encoding: 'rle', ticks: [0, 0] },
    { ticks: [0, -1] },
    { startTime: 86401 },
    { ticks: [0, Infinity] },
    { ticks: [0, 86400000] },
  ]) {
    expect(isRecordingKeyboardRhythmBlock({ ...block, ...patch })).toBe(false);
  }
});

it('stores one hour at ten delivered presses per second in bounded chunks under a one-MiB cadence budget', () => {
  const blocks = Array.from({ length: Math.ceil(36000 / 4096) }, (_, chunk) =>
    encodeRecordingKeyboardRhythm(
      `chunk-${chunk}`,
      Array.from(
        { length: Math.min(4096, 36000 - chunk * 4096) },
        (_, index) => (chunk * 4096 + index) / 10
      )
    )
  );
  expect(blocks.reduce((sum, block) => sum + block.count, 0)).toBe(36000);
  expect(JSON.stringify(blocks).length).toBeLessThan(1024 * 1024);
  expect(
    blocks
      .flatMap((block) => [...iterateRecordingKeyboardRhythm(block)])
      .map((attack) => attack.time)
  ).toHaveLength(36000);
});

it('admits 24 hours of irregular ten-Hz cadence in bounded blocks within an eight-MiB encoded budget', () => {
  const count = 864000;
  const blocks = Array.from({ length: Math.ceil(count / 4096) }, (_, chunk) =>
    encodeRecordingKeyboardRhythm(
      `day-${chunk}`,
      Array.from({ length: Math.min(4096, count - chunk * 4096) }, (_, index) => {
        const attack = chunk * 4096 + index;
        return attack / 10 + (attack % 2) * 0.02;
      })
    )
  );
  expect(blocks.reduce((sum, block) => sum + block.count, 0)).toBe(count);
  expect(isRecordingKeyboardRhythmBlocks(blocks)).toBe(true);
  expect(JSON.stringify(blocks).length).toBeLessThan(8 * 1024 * 1024);
  expect(
    [...iterateRecordingKeyboardRhythm(blocks.at(-1)!, 86399.8, 86400)].map((attack) => attack.time)
  ).toEqual([86399.8, 86399.92]);
});

it('rejects duplicate block identities while retaining independent blocks at the same time', () => {
  const first = encodeRecordingKeyboardRhythm('same', [1]);
  const later = encodeRecordingKeyboardRhythm('same', [1.01]);
  expect(isRecordingKeyboardRhythmBlocks([first, later])).toBe(false);
  expect(isRecordingKeyboardRhythmBlocks([first, { ...later, id: 'second' }])).toBe(true);
});

it('rejects oversized or blank block identifiers before attack identity expansion', () => {
  const block = encodeRecordingKeyboardRhythm('valid', [1]);
  expect(isRecordingKeyboardRhythmBlock({ ...block, id: 'x'.repeat(128) })).toBe(true);
  expect(isRecordingKeyboardRhythmBlock({ ...block, id: 'x'.repeat(129) })).toBe(false);
  expect(isRecordingKeyboardRhythmBlock({ ...block, id: ' '.repeat(4) })).toBe(false);
});
