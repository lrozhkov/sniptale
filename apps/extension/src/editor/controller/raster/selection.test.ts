// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  createEmptyRasterMask,
  getRasterMaskBounds,
  rasterMaskHasPixels,
  replaceRasterMaskWithFloodSelection,
  replaceRasterMaskWithPolygon,
  replaceRasterMaskWithRect,
} from './selection';

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

describe('editor-controller/raster/selection', () => {
  it('builds marquee and polygon masks with stable bounds', () => {
    const marqueeMask = createEmptyRasterMask(20, 20);
    replaceRasterMaskWithRect(marqueeMask, { left: 2, top: 3, width: 5, height: 6 });
    expect(rasterMaskHasPixels(marqueeMask)).toBe(true);
    expect(getRasterMaskBounds(marqueeMask)).toEqual({ left: 2, top: 3, width: 5, height: 6 });

    const polygonMask = createEmptyRasterMask(20, 20);
    replaceRasterMaskWithPolygon(polygonMask, [
      { x: 4, y: 4 },
      { x: 14, y: 5 },
      { x: 9, y: 14 },
    ]);
    expect(rasterMaskHasPixels(polygonMask)).toBe(true);
    expect(getRasterMaskBounds(polygonMask)).toEqual({ left: 4, top: 4, width: 10, height: 10 });
  });

  it('creates flood masks from contiguous pixels only', () => {
    const mask = createEmptyRasterMask(4, 4);
    replaceRasterMaskWithFloodSelection({
      maskCanvas: mask,
      imageData: createImageData(4, 4, (x, y) =>
        x < 2 && y < 2 ? [255, 0, 0, 255] : [0, 0, 255, 255]
      ),
      startX: 0,
      startY: 0,
      tolerance: 0,
    });

    expect(getRasterMaskBounds(mask)).toEqual({ left: 0, top: 0, width: 2, height: 2 });
    expect(rasterMaskHasPixels(mask)).toBe(true);
  });
});
