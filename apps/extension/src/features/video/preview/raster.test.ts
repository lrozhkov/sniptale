import { expect, it } from 'vitest';
import { resolvePreviewRasterSize, resolveQuickPreviewRasterSize } from './raster';
import { VIDEO_EDITOR_PREVIEW_RASTER_PRESETS } from './preferences';

const base = {
  canonical: { width: 1920, height: 1080 },
  css: { width: 960, height: 540 },
  dpr: 1,
  rasterPreset: 'current' as const,
  pausedQuality: 'same' as const,
  paused: false,
};

it('uses vertical preset resolution for portrait scenes', () => {
  expect(resolvePreviewRasterSize({ width: 1080, height: 1920 }, '720p')).toEqual({
    width: 406,
    height: 720,
  });
  expect(resolvePreviewRasterSize({ width: 1920, height: 1080 }, '720p')).toEqual({
    width: 1280,
    height: 720,
  });
  for (const preset of VIDEO_EDITOR_PREVIEW_RASTER_PRESETS) {
    const result = resolvePreviewRasterSize({ width: 1, height: 1 }, preset);
    expect(result.width).toBe(Number.parseInt(preset, 10));
    expect(result.height).toBe(result.width);
  }
});

it('keeps unusual aspect ratios within even axis and pixel caps', () => {
  for (const canonical of [
    { width: 7680, height: 1080 },
    { width: 3900, height: 2128 },
    { width: 1080, height: 7680 },
  ]) {
    for (const preset of VIDEO_EDITOR_PREVIEW_RASTER_PRESETS) {
      const result = resolvePreviewRasterSize(canonical, preset);
      expect(Math.max(result.width, result.height)).toBeLessThanOrEqual(4096);
      expect(result.width * result.height).toBeLessThanOrEqual(8_294_400);
      expect(result.width % 2).toBe(0);
      expect(result.height % 2).toBe(0);
    }
  }
  expect(resolvePreviewRasterSize({ width: 3900, height: 2128 }, '2160p')).toEqual({
    height: 2126,
    width: 3898,
  });
});

it('fits unsnapped CSS geometry with DPR applied once and capped at two', () => {
  expect(resolveQuickPreviewRasterSize(base)).toEqual({ width: 960, height: 540 });
  expect(resolveQuickPreviewRasterSize({ ...base, dpr: 2 })).toEqual({ width: 1920, height: 1080 });
  expect(resolveQuickPreviewRasterSize({ ...base, dpr: 3 })).toEqual({ width: 1920, height: 1080 });
  expect(resolveQuickPreviewRasterSize({ ...base, css: { width: 801.5, height: 600 } })).toEqual({
    width: 802,
    height: 450,
  });
  expect(
    resolveQuickPreviewRasterSize({
      ...base,
      canonical: { width: 1080, height: 1920 },
      css: { width: 900, height: 600 },
    })
  ).toEqual({ width: 338, height: 600 });
});

it('ignores display size and DPR for named rasters', () => {
  for (const preset of VIDEO_EDITOR_PREVIEW_RASTER_PRESETS)
    expect(
      resolveQuickPreviewRasterSize({
        ...base,
        rasterPreset: preset,
        dpr: 3,
        css: { width: 20, height: 10 },
      })
    ).toEqual(resolvePreviewRasterSize(base.canonical, preset));
});

it('refines only on pause without shrinking larger selected rasters', () => {
  expect(resolveQuickPreviewRasterSize({ ...base, pausedQuality: 'detailed' })).toEqual({
    width: 960,
    height: 540,
  });
  expect(
    resolveQuickPreviewRasterSize({ ...base, paused: true, pausedQuality: 'detailed' })
  ).toEqual({ width: 1920, height: 1080 });
  expect(
    resolveQuickPreviewRasterSize({
      ...base,
      paused: true,
      pausedQuality: 'detailed',
      rasterPreset: '2160p',
    })
  ).toEqual({ width: 3840, height: 2160 });
  expect(
    resolveQuickPreviewRasterSize({
      ...base,
      paused: true,
      pausedQuality: 'detailed',
      canonical: { width: 7680, height: 4320 },
    })
  ).toEqual({ width: 3840, height: 2160 });
});

it('rejects invalid layout values before allocation', () => {
  for (const value of [0, -1, NaN, Infinity]) {
    expect(() => resolveQuickPreviewRasterSize({ ...base, dpr: value })).toThrow(RangeError);
    expect(() =>
      resolveQuickPreviewRasterSize({ ...base, canonical: { ...base.canonical, width: value } })
    ).toThrow(RangeError);
    expect(() =>
      resolveQuickPreviewRasterSize({ ...base, css: { ...base.css, height: value } })
    ).toThrow(RangeError);
  }
});
