import { expect, it } from 'vitest';
import {
  composeSourceAudioRanges,
  sourceAudioAttenuationAtTime,
  sourceAudioGainAtTime,
} from './source-attenuation';

it('composes manual gain with minimum attenuation once and restores gaps and tails', () => {
  const manual = [{ start: 0, end: 6, volume: 0.8 }];
  const attenuation = [
    { start: 1, end: 3, volume: 0.5 },
    { start: 2, end: 4, volume: 0.25 },
    { start: 2, end: 4, volume: 0.25 },
    { start: 4, end: 5, volume: 0 },
  ];
  const before = structuredClone({ manual, attenuation });
  expect(composeSourceAudioRanges(manual, attenuation)).toEqual([
    { start: 0, end: 1, volume: 0.8 },
    { start: 1, end: 2, volume: 0.4 },
    { start: 2, end: 4, volume: 0.2 },
    { start: 4, end: 5, volume: 0 },
    { start: 5, end: 6, volume: 0.8 },
  ]);
  expect({ manual, attenuation }).toEqual(before);
});

it('uses half-open intervals and joins equal adjacent cells without filling gaps', () => {
  const ranges = composeSourceAudioRanges(
    [],
    [
      { start: 1, end: 2, volume: 0.5 },
      { start: 2, end: 3, volume: 0.5 },
      { start: 4, end: 5, volume: 1 },
      { start: 6, end: 7, volume: 0.25 },
    ]
  );
  expect(ranges).toEqual([
    { start: 1, end: 3, volume: 0.5 },
    { start: 6, end: 7, volume: 0.25 },
  ]);
  expect([0, 1, 2, 3, 5, 6, 7].map((time) => sourceAudioAttenuationAtTime(ranges, time))).toEqual([
    1, 0.5, 0.5, 1, 1, 0.25, 1,
  ]);
  expect(composeSourceAudioRanges([], [])).toEqual([]);
});

it('preserves amplified manual gain and applies minimum overlapping attenuation once', () => {
  const manual = [{ start: 1, end: 4, volume: 2 }];
  const attenuation = [
    { start: 2, end: 3, volume: 0.5 },
    { start: 2, end: 3, volume: 0.25 },
  ];
  const composed = composeSourceAudioRanges(manual, attenuation);
  expect([0, 1, 2, 3, 4].map((time) => sourceAudioGainAtTime(composed, time))).toEqual([
    1, 2, 0.5, 2, 1,
  ]);
  expect(sourceAudioGainAtTime(manual, 1)).toBe(2);
  expect(sourceAudioGainAtTime(manual, 4)).toBe(1);
});
