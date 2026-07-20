// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { resolveBrushAlpha } from './alpha';
import { compositeRasterBrushPixel } from './composite';
import { paintRasterBrushBitmap } from './paint';
import { paintRasterBrushPoint } from './point';

function createBitmap(width: number, height: number, color = '#00000000'): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('2d context is unavailable');
  }
  context.fillStyle = color;
  context.fillRect(0, 0, width, height);
  return canvas;
}

function getImageData(canvas: HTMLCanvasElement): ImageData {
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('2d context is unavailable');
  }
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function registerAlphaCompositeTest() {
  it('keeps alpha falloff and source-over compositing independent', () => {
    const data = new Uint8ClampedArray([0, 0, 255, 255]);

    expect(
      resolveBrushAlpha({ color: [255, 0, 0, 128], hardness: 0, opacity: 0.5, radius: 4 }, 2)
    ).toBeCloseTo(0.125, 3);
    expect(compositeRasterBrushPixel(data, 0, { alpha: 0.5, blue: 0, green: 0, red: 255 })).toBe(
      true
    );
    expect(data).toEqual(new Uint8ClampedArray([128, 0, 128, 255]));
  });
}

function registerPointMaskTest() {
  it('paints one bounded point and respects transparent masks', () => {
    const bitmap = createBitmap(5, 5);
    const imageData = getImageData(bitmap);
    const mask = new Uint8ClampedArray(5 * 5 * 4);

    expect(
      paintRasterBrushPoint({
        bitmap,
        color: [255, 0, 0, 255],
        hardness: 1,
        imageData,
        mask,
        opacity: 1,
        point: { x: 2, y: 2 },
        radius: 1,
      })
    ).toBe(false);
    mask[(2 * 5 + 2) * 4 + 3] = 255;
    expect(
      paintRasterBrushPoint({
        bitmap,
        color: [255, 0, 0, 255],
        hardness: 1,
        imageData,
        mask,
        opacity: 1,
        point: { x: 2, y: 2 },
        radius: 1,
      })
    ).toBe(true);
  });
}

function registerPaintWriteTest() {
  it('writes bitmap image data only when sampled stroke points change pixels', () => {
    const bitmap = createBitmap(3, 3);

    expect(
      paintRasterBrushBitmap({
        bitmap,
        color: '#00ff00',
        hardness: 1,
        opacity: 1,
        points: [{ x: 1, y: 1 }],
        radius: 1,
      })
    ).toBe(true);
  });
}

describe('raster brush role owners', () => {
  registerAlphaCompositeTest();
  registerPointMaskTest();
  registerPaintWriteTest();
});
