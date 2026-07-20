// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { getRasterMaskBounds } from './bounds';
import { replaceRasterMaskWithFloodSelection } from './flood';
import {
  createEmptyRasterMask,
  rasterMaskHasPixels,
  replaceRasterMaskWithPolygon,
  replaceRasterMaskWithRect,
} from './mask';

function createImageData(
  width: number,
  height: number,
  painter: (x: number, y: number) => [number, number, number, number]
) {
  const context = document.createElement('canvas').getContext('2d');
  if (!context) {
    throw new Error('2d context is unavailable');
  }

  const imageData = context.createImageData(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const [red, green, blue, alpha] = painter(x, y);
      imageData.data[offset] = red;
      imageData.data[offset + 1] = green;
      imageData.data[offset + 2] = blue;
      imageData.data[offset + 3] = alpha;
    }
  }
  return imageData;
}

function registerMaskBoundsTest() {
  it('keeps mask drawing separate from bounds scanning', () => {
    const mask = createEmptyRasterMask(12, 12);

    expect(rasterMaskHasPixels(mask)).toBe(false);
    expect(getRasterMaskBounds(mask)).toBeNull();
    replaceRasterMaskWithRect(mask, { left: 2, top: 3, width: 4, height: 5 });
    expect(rasterMaskHasPixels(mask)).toBe(true);
    expect(getRasterMaskBounds(mask)).toEqual({ left: 2, top: 3, width: 4, height: 5 });
  });
}

function registerReplacementTest() {
  it('clears previous mask content before polygon and flood replacement', () => {
    const mask = createEmptyRasterMask(8, 8);

    replaceRasterMaskWithRect(mask, { left: 0, top: 0, width: 8, height: 8 });
    replaceRasterMaskWithPolygon(mask, [
      { x: 1, y: 1 },
      { x: 4, y: 1 },
      { x: 1, y: 4 },
    ]);
    expect(getRasterMaskBounds(mask)).toEqual({ left: 1, top: 1, width: 3, height: 3 });

    replaceRasterMaskWithFloodSelection({
      imageData: createImageData(8, 8, (x, y) =>
        x > 4 && y > 4 ? [255, 0, 0, 255] : [0, 0, 255, 255]
      ),
      maskCanvas: mask,
      startX: 5,
      startY: 5,
      tolerance: 0,
    });
    expect(getRasterMaskBounds(mask)).toEqual({ left: 5, top: 5, width: 3, height: 3 });
  });
}

function registerFallbackTest() {
  it('keeps mask replacement safe when canvas context or polygon points are unavailable', () => {
    const nullContextCanvas = {
      getContext: () => null,
      height: 4,
      width: 4,
    } as unknown as HTMLCanvasElement;
    const mask = createEmptyRasterMask(4, 4);

    replaceRasterMaskWithRect(nullContextCanvas, { left: 0, top: 0, width: 2, height: 2 });
    replaceRasterMaskWithPolygon(nullContextCanvas, [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 0 },
    ]);
    replaceRasterMaskWithPolygon(mask, [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]);

    expect(rasterMaskHasPixels(mask)).toBe(false);
  });
}

describe('raster selection role owners', () => {
  registerMaskBoundsTest();
  registerReplacementTest();
  registerFallbackTest();
});
