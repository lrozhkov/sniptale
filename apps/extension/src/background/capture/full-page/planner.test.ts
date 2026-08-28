import { expect, it } from 'vitest';
import { createFullPageTilePlan } from './planner';

function geometry(extentWidth: number, extentHeight: number, width = 800, height = 600) {
  return {
    devicePixelRatio: 1,
    extentHeight,
    extentWidth,
    outputHeight: extentHeight,
    outputWidth: extentWidth,
    rootKind: 'document' as const,
    rootViewport: { height, width, x: 0, y: 0 },
    viewportHeight: height,
    viewportWidth: width,
  };
}

it('plans row-major 2D tiles with 64 CSS pixel overlap and right/bottom clamps', () => {
  const plans = createFullPageTilePlan(geometry(2_000, 1_400));

  expect(plans.map(({ targetX, targetY }) => [targetX, targetY])).toEqual([
    [0, 0],
    [736, 0],
    [1200, 0],
    [0, 536],
    [736, 536],
    [1200, 536],
    [0, 800],
    [736, 800],
    [1200, 800],
  ]);
  expect(plans.at(-1)).toEqual(
    expect.objectContaining({
      lastColumn: true,
      lastRow: true,
      sourceInsetX: 336,
      sourceInsetY: 336,
    })
  );
});

it('uses one viewport tile when neither axis overflows', () => {
  expect(createFullPageTilePlan(geometry(640, 480))).toEqual([
    expect.objectContaining({
      firstColumn: true,
      firstRow: true,
      lastColumn: true,
      lastRow: true,
      targetX: 0,
      targetY: 0,
    }),
  ]);
});

it('rejects an oversized raster before allocating a tile plan', () => {
  expect(() => createFullPageTilePlan(geometry(70_000, 600))).toThrow(
    'Full-page screenshot exceeds the configured quality limits'
  );
});

it('applies a custom minimum scale and raster size to the same tile planner', () => {
  expect(() =>
    createFullPageTilePlan(geometry(50_000, 600), {
      maxFileSizeMiB: 64,
      maxMegapixels: 64,
      minScalePercent: 75,
      profile: 'custom',
    })
  ).toThrow('Full-page screenshot exceeds the configured quality limits');
  expect(() =>
    createFullPageTilePlan(geometry(50_000, 600), {
      maxFileSizeMiB: 64,
      maxMegapixels: 64,
      minScalePercent: 50,
      profile: 'custom',
    })
  ).not.toThrow();
});

it('rejects hostile 2D geometry before materializing its cartesian product', () => {
  expect(() => createFullPageTilePlan(geometry(10_000, 10_000, 65, 65))).toThrow(
    'Full-page screenshot requires too many raster tiles'
  );
});
