import { describe, expect, it } from 'vitest';

import { resolveVideoEditorPreviewRasterSize } from './raster';

describe('video editor preview raster', () => {
  it('preserves landscape and portrait aspect ratios with even dimensions', () => {
    expect(resolveVideoEditorPreviewRasterSize({ width: 1920, height: 1080 }, '720p')).toEqual({
      height: 720,
      width: 1280,
    });
    expect(resolveVideoEditorPreviewRasterSize({ width: 1080, height: 1920 }, '720p')).toEqual({
      height: 720,
      width: 406,
    });
  });

  it('caps unusual aspect ratios to the 4K preview budget', () => {
    const raster = resolveVideoEditorPreviewRasterSize({ width: 7680, height: 1080 }, '2160p');
    expect(raster.width).toBeLessThanOrEqual(4096);
    expect(raster.width * raster.height).toBeLessThanOrEqual(3840 * 2160);
    expect(raster.width % 2).toBe(0);
    expect(raster.height % 2).toBe(0);
  });

  it('rounds capped awkward aspect ratios down inside the 4K pixel envelope', () => {
    const raster = resolveVideoEditorPreviewRasterSize({ width: 3900, height: 2128 }, '2160p');

    expect(raster).toEqual({ height: 2126, width: 3898 });
    expect(raster.width * raster.height).toBeLessThanOrEqual(3840 * 2160);
  });
});
