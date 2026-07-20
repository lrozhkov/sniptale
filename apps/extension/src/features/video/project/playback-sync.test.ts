import { expect, it } from 'vitest';
import { shouldRefreshMediaTime } from './playback-sync';

it('refreshes media time immediately when the current time is invalid', () => {
  expect(
    shouldRefreshMediaTime({
      currentTime: Number.NaN,
      isPlaying: false,
      nextTime: 1,
      playbackRate: 1,
    })
  ).toBe(true);
});

it('uses a narrow threshold while paused and a rate-aware threshold while playing', () => {
  expect(
    shouldRefreshMediaTime({ currentTime: 1, isPlaying: false, nextTime: 1.02, playbackRate: 1 })
  ).toBe(true);
  expect(
    shouldRefreshMediaTime({ currentTime: 1, isPlaying: true, nextTime: 1.15, playbackRate: 1 })
  ).toBe(false);
  expect(
    shouldRefreshMediaTime({ currentTime: 1, isPlaying: true, nextTime: 1.5, playbackRate: 2 })
  ).toBe(true);
});

it('falls back to the base playing threshold for invalid playback rates', () => {
  expect(
    shouldRefreshMediaTime({
      currentTime: 1,
      isPlaying: true,
      nextTime: 1.19,
      playbackRate: Number.NaN,
    })
  ).toBe(false);
});
