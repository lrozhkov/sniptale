import { describe, expect, it } from 'vitest';
import { resolveReviewRenderBitrate } from './render-settings';

describe('source-aware quick-edit export budget', () => {
  const source = { videoBitrate: 791_920, width: 1904, height: 984, frameRate: 40 };
  it('does not inflate a screen recording to the generic high-quality bitrate', () => {
    const bitrate = resolveReviewRenderBitrate(source, { width: 1920, height: 1080, fps: 38 });
    expect(bitrate).toBeGreaterThan(791_920);
    expect(bitrate).toBeLessThan(1_500_000);
  });
  it('retains an explicit high-quality choice and a finite fallback for missing metadata', () => {
    const size = { width: 1920, height: 1080, fps: 30 };
    expect(resolveReviewRenderBitrate(source, size, 'high')).toBeGreaterThan(2_000_000);
    for (const videoBitrate of [undefined, NaN, 0, Infinity])
      expect(Number.isFinite(resolveReviewRenderBitrate({ videoBitrate }, size))).toBe(true);
  });
  it('respects reduced resolution and does not exceed the generic budget', () => {
    const size = { width: 640, height: 360, fps: 30 };
    expect(resolveReviewRenderBitrate(source, size)).toBeLessThan(1_000_000);
    expect(
      resolveReviewRenderBitrate({ ...source, videoBitrate: 80_000_000 }, size)
    ).toBeLessThanOrEqual(resolveReviewRenderBitrate({}, size, 'high'));
  });
});
