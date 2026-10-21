// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MIN_REGION_SELECTOR_SIZE,
  resizeRegionDimension,
  resizeRegionWithAspectRatio,
  updateDraggingRegion,
  updateResizingRegion,
  type RegionBounds,
} from './helpers';

beforeEach(() => {
  vi.stubGlobal('innerWidth', 1000);
  vi.stubGlobal('innerHeight', 800);
  vi.stubGlobal('devicePixelRatio', 2);
});

describe('region-selector geometry helpers', () => {
  it.each([16 / 9, 4 / 3, 1, 9 / 16])(
    'keeps even dimensions and the ratio %s at every corner',
    (ratio) => {
      vi.stubGlobal('innerWidth', 1001);
      vi.stubGlobal('innerHeight', 799);
      const initial = resizeRegionWithAspectRatio(
        { x: 100, y: 100, width: 320, height: 200 },
        'width',
        319,
        ratio
      );
      for (const corner of ['nw', 'ne', 'sw', 'se']) {
        for (const delta of [-2000, -37, 41, 2000]) {
          const result = updateResizingRegion(
            initial,
            initial,
            { x: 0, y: 0 },
            corner,
            new MouseEvent('mousemove', { clientX: delta, clientY: delta }),
            ratio
          );
          expect(result.width % 2).toBe(0);
          expect(result.height % 2).toBe(0);
          expect(Math.abs(result.width - result.height * ratio)).toBeLessThanOrEqual(2);
          expect(result.x).toBeGreaterThanOrEqual(0);
          expect(result.y).toBeGreaterThanOrEqual(0);
          expect(result.x + result.width).toBeLessThanOrEqual(innerWidth);
          expect(result.y + result.height).toBeLessThanOrEqual(innerHeight);
        }
      }
    }
  );
  it('keeps the locked ratio while resizing a corner at the viewport edge', () => {
    const initial = { x: 100, y: 100, width: 320, height: 180 };
    const result = updateResizingRegion(
      initial,
      initial,
      { x: 420, y: 280 },
      'se',
      new MouseEvent('mousemove', { clientX: 1600, clientY: 1200 }),
      16 / 9
    );
    expect(Math.abs(result.width - (result.height * 16) / 9)).toBeLessThanOrEqual(1);
    expect(result.x + result.width).toBeLessThanOrEqual(innerWidth);
    expect(result.y + result.height).toBeLessThanOrEqual(innerHeight);
  });
  it('resizes around the region center while clamping to viewport bounds', () => {
    const region = { x: 900, y: 760, width: 120, height: 120 };

    expect(resizeRegionDimension(region, 'width', 20)).toEqual({
      x: 900,
      y: 680,
      width: MIN_REGION_SELECTOR_SIZE,
      height: 120,
    });
    expect(resizeRegionDimension(region, 'height', 5000)).toEqual({
      x: 880,
      y: 0,
      width: 120,
      height: 800,
    });
  });

  it('updates dragging regions within the viewport only', () => {
    const initialRegion = { x: 300, y: 250, width: 200, height: 180 };
    const currentRegion = { ...initialRegion };

    expect(
      updateDraggingRegion(initialRegion, currentRegion, { x: 100, y: 100 }, {
        clientX: 900,
        clientY: 700,
      } as MouseEvent)
    ).toEqual({
      x: 800,
      y: 620,
      width: 200,
      height: 180,
    });
  });
});

describe('region-selector resize helpers', () => {
  function resize(
    resizeCorner: string,
    event: Pick<MouseEvent, 'clientX' | 'clientY'>,
    currentRegion: RegionBounds = { x: 100, y: 100, width: 300, height: 200 }
  ) {
    return updateResizingRegion(
      currentRegion,
      currentRegion,
      { x: 0, y: 0 },
      resizeCorner,
      event as MouseEvent
    );
  }

  it('expands east and south edges directly', () => {
    expect(resize('se', { clientX: 40, clientY: 25 })).toEqual({
      x: 100,
      y: 100,
      width: 340,
      height: 224,
    });
  });

  it('moves west and north edges while keeping the minimum size', () => {
    expect(resize('nw', { clientX: 260, clientY: 160 })).toEqual({
      x: 300,
      y: 200,
      width: MIN_REGION_SELECTOR_SIZE,
      height: MIN_REGION_SELECTOR_SIZE,
    });
  });

  it('keeps resize handles inside the viewport when the pointer drags past the screen edge', () => {
    expect(resize('nw', { clientX: -400, clientY: -300 })).toEqual({
      x: 0,
      y: 0,
      width: 400,
      height: 300,
    });
  });
});
