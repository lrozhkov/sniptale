import { describe, expect, it } from 'vitest';
import { LiveVideoOutputMetrics } from './live-video-output-metrics';

describe('LiveVideoOutputMetrics', () => {
  it('separates payload budget, actual keyframes, GOP, and timestamp integrity', () => {
    const metrics = new LiveVideoOutputMetrics();
    metrics.observe({ byteLength: 100_000, duration: 4, timestamp: 0, type: 'key' });
    metrics.observe({ byteLength: 2_000, duration: 4, timestamp: 4, type: 'delta' });
    metrics.observe({ byteLength: 80_000, duration: 4, timestamp: 8, type: 'key' });
    metrics.observe({ byteLength: 2_000, duration: 3, timestamp: 12, type: 'delta' });

    expect(metrics.summarize(1_000_000)).toEqual(
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
      })
    );
  });
});
