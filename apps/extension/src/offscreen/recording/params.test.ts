import { expect, it } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { appendRecordingViewportParams } from './params';

it('omits undefined recording viewport params while preserving provided values', () => {
  expect(
    appendRecordingViewportParams(
      { streamId: 'stream-1' },
      {
        cropRegion: { x: 1, y: 2, width: 3, height: 4 },
        viewport: { width: 100, height: 200, devicePixelRatio: 2 },
      }
    )
  ).toEqual({
    streamId: 'stream-1',
    cropRegion: { x: 1, y: 2, width: 3, height: 4 },
    viewport: { width: 100, height: 200, devicePixelRatio: 2 },
  });
});

it('preserves all optional recording viewport params when they are provided', () => {
  expect(
    appendRecordingViewportParams(
      { streamId: 'stream-2' },
      {
        captureMode: CaptureMode.VIEWPORT_EMULATION,
        targetResolution: { width: 1600, height: 900 },
        emulatedViewportCssSize: { width: 960, height: 540 },
      }
    )
  ).toEqual({
    streamId: 'stream-2',
    captureMode: CaptureMode.VIEWPORT_EMULATION,
    targetResolution: { width: 1600, height: 900 },
    emulatedViewportCssSize: { width: 960, height: 540 },
  });
});
