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
  it('sums live video encoders at their independently negotiated rates', () => {
    expect(
      resolveAggregateRecordingPixelRate({
        artifacts: [
          { dimensions: { height: 1080, width: 1920 }, frameRate: 60 },
          { dimensions: { height: 720, width: 1280 }, frameRate: 30 },
        ],
      })
    ).toBe(1920 * 1080 * 60 + 1280 * 720 * 30);
  });

  it('accepts independent encoders and rejects only an artifact that exceeds its ceiling', () => {
    expect(() =>
      assertRecordingResourceBudget({
        artifacts: [
          { dimensions: { height: 1304, width: 2560 }, frameRate: 60 },
          { dimensions: { height: 1080, width: 1920 }, frameRate: 30 },
        ],
        frameRate: VideoFrameRate.FPS30,
        resolution: VideoResolutionPreset.SOURCE,
      })
    ).not.toThrow();
    expect(() =>
      assertRecordingResourceBudget({
        artifacts: [{ dimensions: { height: 2160, width: 3840 }, frameRate: 60 }],
        frameRate: VideoFrameRate.FPS30,
        resolution: VideoResolutionPreset.SOURCE,
      })
    ).toThrow('exceeds its encoder resource budget');
  });

  it('rejects an empty aggregate and malformed dimensions', () => {
    expect(() =>
      assertRecordingResourceBudget({
        artifacts: [],
        frameRate: VideoFrameRate.FPS30,
        resolution: VideoResolutionPreset.SOURCE,
      })
    ).toThrow('at least one video artifact');
    expect(() =>
      assertRecordingResourceBudget({
        artifacts: [{ dimensions: { height: 0, width: 1920 }, frameRate: 30 }],
        frameRate: VideoFrameRate.FPS30,
        resolution: VideoResolutionPreset.SOURCE,
      })
    ).toThrow('positive integers');
  });

  it('rejects a fixed 2160p profile above its canonical 24 fps tier', () => {
    expect(() =>
      assertRecordingResourceBudget({
        artifacts: [{ dimensions: { height: 2160, width: 3840 }, frameRate: 30 }],
        frameRate: VideoFrameRate.FPS30,
        resolution: VideoResolutionPreset.P2160,
      })
    ).toThrow('unsupported for its resolution');
  });
});
