import { describe, expect, it } from 'vitest';
import {
  VideoFrameRate,
  VideoResolutionPreset,
} from '@sniptale/runtime-contracts/video/types/types';
import {
  assertRecordingResourceBudget,
  resolveAggregateRecordingPixelRate,
} from './resource-budget';

describe('recording resource budget', () => {
  it('sums every live video encoder before applying the shared envelope', () => {
    expect(
      resolveAggregateRecordingPixelRate({
        dimensions: [
          { height: 1080, width: 1920 },
          { height: 720, width: 1280 },
        ],
        frameRate: VideoFrameRate.FPS30,
      })
    ).toBe((1920 * 1080 + 1280 * 720) * 30);
  });

  it('accepts the exact live ceiling and rejects aggregate overflow', () => {
    expect(() =>
      assertRecordingResourceBudget({
        dimensions: [{ height: 2160, width: 3840 }],
        frameRate: VideoFrameRate.FPS30,
        resolution: VideoResolutionPreset.SOURCE,
      })
    ).not.toThrow();
    expect(() =>
      assertRecordingResourceBudget({
        dimensions: [
          { height: 2160, width: 3840 },
          { height: 720, width: 1280 },
        ],
        frameRate: VideoFrameRate.FPS30,
        resolution: VideoResolutionPreset.SOURCE,
      })
    ).toThrow('exceed the supported live encoding budget');
  });

  it('rejects an empty aggregate and malformed dimensions', () => {
    expect(() =>
      assertRecordingResourceBudget({
        dimensions: [],
        frameRate: VideoFrameRate.FPS30,
        resolution: VideoResolutionPreset.SOURCE,
      })
    ).toThrow('at least one video artifact');
    expect(() =>
      assertRecordingResourceBudget({
        dimensions: [{ height: 0, width: 1920 }],
        frameRate: VideoFrameRate.FPS30,
        resolution: VideoResolutionPreset.SOURCE,
      })
    ).toThrow('positive integers');
  });

  it('rejects a fixed 2160p profile above its canonical 24 fps tier', () => {
    expect(() =>
      assertRecordingResourceBudget({
        dimensions: [{ height: 2160, width: 3840 }],
        frameRate: VideoFrameRate.FPS30,
        resolution: VideoResolutionPreset.P2160,
      })
    ).toThrow('unsupported for its resolution');
  });
});
