import { expect, it } from 'vitest';

import { shouldBuildPersistentVideoPreview } from './runtime-support';

it('uses encoded video when a 720p range exceeds exact-frame memory capacity', () => {
  expect(
    shouldBuildPersistentVideoPreview({
      canPlayPersistentVideo: true,
      exactFrameCapacity: 91,
      frameCount: 121,
      rasterSize: { height: 720, width: 1280 },
    })
  ).toBe(true);
});

it('keeps a bounded 720p range in the exact-frame cache', () => {
  expect(
    shouldBuildPersistentVideoPreview({
      canPlayPersistentVideo: true,
      exactFrameCapacity: 91,
      frameCount: 91,
      rasterSize: { height: 720, width: 1280 },
    })
  ).toBe(false);
});

it('does not select encoded video without a compatible playback surface', () => {
  expect(
    shouldBuildPersistentVideoPreview({
      canPlayPersistentVideo: false,
      exactFrameCapacity: 22,
      frameCount: 121,
      rasterSize: { height: 1440, width: 2560 },
    })
  ).toBe(false);
});
