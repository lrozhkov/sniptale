// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MIN_REGION_SELECTOR_SIZE,
  resizeRegionDimension,
  toDevicePixelRegion,
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
  it('converts regions into device pixels', () => {
    expect(toDevicePixelRegion({ x: 10, y: 20, width: 30, height: 40 })).toEqual({
      x: 20,
      y: 40,
      width: 60,
      height: 80,
    });
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
      height: 225,
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
