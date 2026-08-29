import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FULL_PAGE_QUALITY_POLICY,
  FULL_PAGE_QUALITY_PROFILES,
  isFullPageCaptureGeometry,
  parseFullPageQualityPolicy,
  projectFullPageCaptureRasterRegion,
  type FullPageCaptureGeometry,
  type FullPageCaptureRasterRegion,
} from './index';

describe('full-page quality policy boundary', () => {
  it('keeps factory defaults canonical and parses exact built-in and custom profiles', () => {
    expect(DEFAULT_FULL_PAGE_QUALITY_POLICY).toBe(FULL_PAGE_QUALITY_PROFILES.maximum);
    expect(parseFullPageQualityPolicy(FULL_PAGE_QUALITY_PROFILES.maximum)).toEqual(
      FULL_PAGE_QUALITY_PROFILES.maximum
    );
    expect(parseFullPageQualityPolicy(FULL_PAGE_QUALITY_PROFILES['high-quality'])).toEqual(
      FULL_PAGE_QUALITY_PROFILES['high-quality']
    );
    expect(
      parseFullPageQualityPolicy({
        maxFileSizeMiB: 72,
        maxMegapixels: 70,
        minScalePercent: 40,
        profile: 'custom',
      })
    ).toEqual({
      maxFileSizeMiB: 72,
      maxMegapixels: 70,
      minScalePercent: 40,
      profile: 'custom',
    });
  });

  it.each([
    { maxFileSizeMiB: 0, maxMegapixels: 64, minScalePercent: 50, profile: 'custom' },
    { maxFileSizeMiB: 64, maxMegapixels: -1, minScalePercent: 50, profile: 'custom' },
    { maxFileSizeMiB: 64, maxMegapixels: 64, minScalePercent: Number.NaN, profile: 'custom' },
    { maxFileSizeMiB: Infinity, maxMegapixels: 64, minScalePercent: 50, profile: 'custom' },
    { maxFileSizeMiB: 129, maxMegapixels: 64, minScalePercent: 50, profile: 'custom' },
    { ...FULL_PAGE_QUALITY_PROFILES.safe, maxMegapixels: 65 },
  ])('rejects unsafe or non-canonical policy %#', (policy) => {
    expect(parseFullPageQualityPolicy(policy)).toBeNull();
  });
});

const documentGeometry: FullPageCaptureGeometry = {
  devicePixelRatio: 1,
  extentHeight: 1200,
  extentWidth: 800,
  outputHeight: 1200,
  outputWidth: 800,
  rootKind: 'document',
  rootViewport: { height: 600, width: 800, x: 0, y: 0 },
  viewportHeight: 600,
  viewportWidth: 800,
};

const region = (
  coordinateSpace: FullPageCaptureRasterRegion['coordinateSpace'],
  x = 20,
  y = 30
): FullPageCaptureRasterRegion => ({ coordinateSpace, height: 80, width: 100, x, y });

describe('full-page capture geometry boundary', () => {
  it('accepts the complete canonical geometry and rejects malformed numeric and shape fields', () => {
    expect(isFullPageCaptureGeometry(documentGeometry)).toBe(true);
    expect(isFullPageCaptureGeometry(null)).toBe(false);
    for (const key of [
      'devicePixelRatio',
      'extentHeight',
      'extentWidth',
      'outputHeight',
      'outputWidth',
      'viewportHeight',
      'viewportWidth',
    ] as const) {
      expect(isFullPageCaptureGeometry({ ...documentGeometry, [key]: Number.NaN })).toBe(false);
    }
    for (const key of [
      'extentHeight',
      'extentWidth',
      'outputHeight',
      'outputWidth',
      'viewportHeight',
      'viewportWidth',
    ] as const) {
      expect(isFullPageCaptureGeometry({ ...documentGeometry, [key]: 0 })).toBe(false);
    }
    expect(isFullPageCaptureGeometry({ ...documentGeometry, devicePixelRatio: 0 })).toBe(false);
    expect(isFullPageCaptureGeometry({ ...documentGeometry, rootKind: 'unknown' })).toBe(false);
    expect(isFullPageCaptureGeometry({ ...documentGeometry, rootViewport: null })).toBe(false);
    expect(
      isFullPageCaptureGeometry({
        ...documentGeometry,
        rootViewport: { ...documentGeometry.rootViewport, width: 0 },
      })
    ).toBe(false);
    for (const key of ['height', 'width', 'x', 'y'] as const) {
      expect(
        isFullPageCaptureGeometry({
          ...documentGeometry,
          rootViewport: { ...documentGeometry.rootViewport, [key]: -1 },
        })
      ).toBe(false);
    }
  });
});

describe('full-page iframe raster projection', () => {
  const elementGeometry: FullPageCaptureGeometry = {
    ...documentGeometry,
    extentHeight: 1600,
    extentWidth: 1000,
    outputHeight: 1800,
    outputWidth: 1100,
    rootKind: 'element',
    rootViewport: { height: 400, width: 700, x: 50, y: 100 },
  };

  it('projects document, viewport, and internal-root coordinates only to matching captures', () => {
    expect(projectFullPageCaptureRasterRegion(region('document'), documentGeometry)).toEqual({
      height: 80,
      width: 100,
      x: 20,
      y: 30,
    });
    expect(projectFullPageCaptureRasterRegion(region('viewport'), documentGeometry)).toBeNull();
    expect(
      projectFullPageCaptureRasterRegion(region('viewport'), {
        ...documentGeometry,
        rootKind: 'viewport',
      })
    ).toEqual({ height: 80, width: 100, x: 20, y: 30 });
    expect(projectFullPageCaptureRasterRegion(region('root-content'), documentGeometry)).toBeNull();
    expect(
      projectFullPageCaptureRasterRegion(region('viewport-shell'), documentGeometry)
    ).toBeNull();
    expect(projectFullPageCaptureRasterRegion(region('root-content'), elementGeometry)).toEqual({
      height: 80,
      width: 100,
      x: 70,
      y: 130,
    });
  });

  it('maps each internal-scroller shell slice and rejects overlap with stitched content', () => {
    expect(
      projectFullPageCaptureRasterRegion(region('viewport-shell', 20, 10), elementGeometry)
    ).toEqual({ height: 80, width: 100, x: 20, y: 10 });
    expect(
      projectFullPageCaptureRasterRegion(region('viewport-shell', 20, 520), elementGeometry)
    ).toEqual({ height: 80, width: 100, x: 20, y: 1720 });
    expect(
      projectFullPageCaptureRasterRegion(
        { ...region('viewport-shell', 0, 200), width: 40 },
        elementGeometry
      )
    ).toEqual({ height: 80, width: 40, x: 0, y: 200 });
    expect(
      projectFullPageCaptureRasterRegion(
        { ...region('viewport-shell', 760, 200), width: 40 },
        elementGeometry
      )
    ).toEqual({ height: 80, width: 40, x: 1060, y: 200 });
    expect(
      projectFullPageCaptureRasterRegion(region('viewport-shell', 200, 200), elementGeometry)
    ).toBeNull();
  });
});
