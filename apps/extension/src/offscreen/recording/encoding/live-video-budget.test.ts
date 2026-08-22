import { describe, expect, it } from 'vitest';
import {
  evaluateLiveVideoByteBudget,
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
});
