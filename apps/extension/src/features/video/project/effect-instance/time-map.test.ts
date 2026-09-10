import { expect, it } from 'vitest';
import { mapScopedEffectIntervals } from './time-map';
import type { VideoProjectEffectInstance } from './types';

it('retimes only scoped intervals and preserves retained graph time through compression/removal', () => {
  const effect: VideoProjectEffectInstance = {
    id: 'fx',
    snapshotId: 's',
    kind: 'targetEffect',
    controls: {},
    enabled: true,
    target: { kind: 'track', trackId: 'v' },
    startTime: 2,
    duration: 8,
    playbackRate: 0.5,
    sourceStart: 1,
    rangeMode: 'interval',
  };
  const mapped = mapScopedEffectIntervals([effect], new Set(['v']), {
    start: 4,
    end: 8,
    duration: 2,
  });
  expect(
    mapped.map(({ startTime, duration, sourceStart, playbackRate }) => ({
      startTime,
      duration,
      sourceStart,
      playbackRate,
    }))
  ).toEqual([
    { startTime: 2, duration: 2, sourceStart: 1, playbackRate: 0.5 },
    { startTime: 4, duration: 2, sourceStart: 2, playbackRate: 1 },
    { startTime: 6, duration: 2, sourceStart: 4, playbackRate: 0.5 },
  ]);
  expect(new Set(mapped.map(({ id }) => id)).size).toBe(3);
  expect(
    mapScopedEffectIntervals([effect], new Set(['other']), { start: 4, end: 8, duration: 0 })
  ).toEqual([effect]);
  const removed = mapScopedEffectIntervals([effect], new Set(['v']), {
    start: 4,
    end: 8,
    duration: 0,
  });
  expect(removed).toHaveLength(2);
  expect(removed[1]).toMatchObject({ startTime: 4, duration: 2, sourceStart: 4 });
  expect(
    mapScopedEffectIntervals([{ ...effect, rangeMode: 'owner' }], new Set(['v']), {
      start: 4,
      end: 8,
      duration: 0,
    })[0]
  ).toMatchObject({ startTime: 2, duration: 8 });
});
