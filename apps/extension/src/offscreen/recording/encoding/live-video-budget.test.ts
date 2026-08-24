import { describe, expect, it } from 'vitest';
import {
  evaluateLiveVideoByteBudget,
  evaluateLiveVideoKeyFrameBudget,
  LIVE_VIDEO_BITRATE_TOLERANCE,
  LIVE_VIDEO_STARTUP_ALLOWANCE_SECONDS,
} from './live-video-budget';

describe('live video byte budget', () => {
  it('allows documented rate-control and startup variance without hiding a 33% overshoot', () => {
    const configuredBitrate = 12_000_000;
    const duration = 15;
    const allowedBitrate =
      configuredBitrate *
      (1 + LIVE_VIDEO_BITRATE_TOLERANCE + LIVE_VIDEO_STARTUP_ALLOWANCE_SECONDS / duration);

    const allowedBytes = evaluateLiveVideoByteBudget({
      configuredBitrate,
      duration,
      encodedBytes: 0,
    }).allowedBytes;
    expect(
      evaluateLiveVideoByteBudget({
        configuredBitrate,
        duration,
        encodedBytes: Math.floor(Math.min(allowedBytes - 1, (allowedBitrate * duration) / 8)),
      }).withinBudget
    ).toBe(true);
    expect(
      evaluateLiveVideoByteBudget({
        configuredBitrate,
        duration,
        encodedBytes: Math.floor((16_010_000 * duration) / 8),
      }).withinBudget
    ).toBe(false);
  });

  it.each([
    [{ configuredBitrate: 0, duration: 15, encodedBytes: 1 }, 'bitrate'],
    [{ configuredBitrate: Number.NaN, duration: 15, encodedBytes: 1 }, 'bitrate'],
    [{ configuredBitrate: 1, duration: -1, encodedBytes: 1 }, 'duration'],
    [{ configuredBitrate: 1, duration: Number.POSITIVE_INFINITY, encodedBytes: 1 }, 'duration'],
    [{ configuredBitrate: 1, duration: 15, encodedBytes: -1 }, 'bytes'],
    [{ configuredBitrate: 1, duration: 15, encodedBytes: 0.5 }, 'bytes'],
  ])('rejects invalid budget input %j', (input, expectedMessage) => {
    expect(() => evaluateLiveVideoByteBudget(input)).toThrow(expectedMessage);
  });

  it('allows periodic GOP keyframes without hiding fragmented static-screen GOPs', () => {
    expect(
      evaluateLiveVideoKeyFrameBudget({
        actualKeyFrames: 5,
        configuredInterval: 4,
        duration: 15,
        forcedKeyFrames: 1,
      })
    ).toEqual({
      actualKeyFrames: 5,
      allowedKeyFrames: 5,
      configuredInterval: 4,
      duration: 15,
      excessKeyFrames: 0,
      forcedKeyFrames: 1,
      withinBudget: true,
    });
    expect(
      evaluateLiveVideoKeyFrameBudget({
        actualKeyFrames: 50,
        configuredInterval: 4,
        duration: 15,
        forcedKeyFrames: 1,
      })
    ).toEqual(expect.objectContaining({ excessKeyFrames: 45, withinBudget: false }));
  });

  it.each([
    [{ actualKeyFrames: -1, configuredInterval: 4, duration: 15, forcedKeyFrames: 1 }, 'keyframe'],
    [{ actualKeyFrames: 1.5, configuredInterval: 4, duration: 15, forcedKeyFrames: 1 }, 'keyframe'],
    [{ actualKeyFrames: 1, configuredInterval: 0, duration: 15, forcedKeyFrames: 1 }, 'interval'],
    [
      { actualKeyFrames: 1, configuredInterval: Number.NaN, duration: 15, forcedKeyFrames: 1 },
      'interval',
    ],
    [{ actualKeyFrames: 1, configuredInterval: 4, duration: -1, forcedKeyFrames: 1 }, 'duration'],
    [{ actualKeyFrames: 1, configuredInterval: 4, duration: 15, forcedKeyFrames: -1 }, 'Forced'],
  ])('rejects invalid keyframe budget input %j', (input, expectedMessage) => {
    expect(() => evaluateLiveVideoKeyFrameBudget(input)).toThrow(expectedMessage);
  });
});
