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
