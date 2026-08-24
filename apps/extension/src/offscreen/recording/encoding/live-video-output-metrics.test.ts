import { describe, expect, it } from 'vitest';
import { LiveVideoOutputMetrics } from './live-video-output-metrics';

describe('LiveVideoOutputMetrics', () => {
  it('separates payload budget, actual keyframes, GOP, and timestamp integrity', () => {
    const metrics = new LiveVideoOutputMetrics();
    metrics.observe({ byteLength: 100_000, duration: 4, timestamp: 0, type: 'key' });
    metrics.observe({ byteLength: 2_000, duration: 4, timestamp: 4, type: 'delta' });
    metrics.observe({ byteLength: 80_000, duration: 4, timestamp: 8, type: 'key' });
    metrics.observe({ byteLength: 2_000, duration: 3, timestamp: 12, type: 'delta' });

    expect(
      metrics.summarize({
        configuredBitrate: 1_000_000,
        forcedKeyFrames: 1,
        keyFrameInterval: 4,
      })
    ).toEqual(
      expect.objectContaining({
        actualKeyFrames: 2,
        averageGopInterval: 8,
        backwardEncodedPacketTimestamps: 0,
        duplicateEncodedPacketTimestamps: 0,
        encodedVideoBytes: 184_000,
        keyFrameByteShare: 180_000 / 184_000,
        maximumGopInterval: 8,
        minimumGopInterval: 8,
        totalEncodedPacketDuration: 15,
        videoByteBudget: expect.objectContaining({ withinBudget: true }),
        videoKeyFrameBudget: expect.objectContaining({
          allowedKeyFrames: 5,
          withinBudget: true,
        }),
      })
    );
  });

  it('flags excessive actual keyframes independently from forced-keyframe requests', () => {
    const metrics = new LiveVideoOutputMetrics();
    for (let index = 0; index < 50; index += 1) {
      metrics.observe({ byteLength: 2_000, duration: 0.3, timestamp: index * 0.3, type: 'key' });
    }

    expect(
      metrics.summarize({
        configuredBitrate: 12_000_000,
        forcedKeyFrames: 1,
        keyFrameInterval: 4,
      }).videoKeyFrameBudget
    ).toEqual(expect.objectContaining({ excessKeyFrames: 45, withinBudget: false }));
  });
});
