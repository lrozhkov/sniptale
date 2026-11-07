import { expect, it } from 'vitest';

import { createPreviewMediaSyncState, shouldRefreshPreviewMediaTime } from './sync';

it.each([30, 60, 120, 240])(
  'seeks paused preview for each frame at %ifps, including slow sources',
  (fps) => {
    for (const playbackRate of [0.25, 1, 2]) {
      for (const direction of [-1, 1]) {
        expect(
          shouldRefreshPreviewMediaTime({
            currentTime: 10 + direction / fps,
            isPlaying: false,
            mediaCurrentTime: 5,
            mediaPaused: true,
            nextTime: 5 + (direction * playbackRate) / fps,
            playbackRate,
            state: createPreviewMediaSyncState(),
          })
        ).toBe(true);
      }
    }
  }
);

it('does not repeatedly seek an unchanged paused frame', () => {
  expect(
    shouldRefreshPreviewMediaTime({
      currentTime: 10,
      isPlaying: false,
      mediaCurrentTime: 5,
      mediaPaused: true,
      nextTime: 5,
      playbackRate: 1,
      state: createPreviewMediaSyncState(),
    })
  ).toBe(false);
});

it.each([0, -0.0000004, 0.0000004])(
  'starts prepared playback without another seek at source error %s',
  (error) => {
    expect(
      shouldRefreshPreviewMediaTime({
        currentTime: 10,
        isPlaying: true,
        mediaCurrentTime: 5 + error,
        mediaPaused: true,
        nextTime: 5,
        playbackRate: 2,
        state: createPreviewMediaSyncState(),
      })
    ).toBe(false);
  }
);

it('still seeks an unprepared playback start and a changed source after a timeline jump', () => {
  for (const state of [createPreviewMediaSyncState(), { wasPlaying: true, lastTimelineTime: 1 }]) {
    expect(
      shouldRefreshPreviewMediaTime({
        currentTime: 10,
        isPlaying: true,
        mediaCurrentTime: 5,
        mediaPaused: true,
        nextTime: 5.01,
        playbackRate: 2,
        state,
      })
    ).toBe(true);
  }
});
