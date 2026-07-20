// @vitest-environment jsdom

import { expect, it } from 'vitest';
import { paintRasterBrushBitmap } from './brush';

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

function readPixel(
  canvas: HTMLCanvasElement,
  x: number,
  y: number
): [number, number, number, number] {
  const data = canvas.getContext('2d')?.getImageData(x, y, 1, 1).data;
  return [data?.[0] ?? 0, data?.[1] ?? 0, data?.[2] ?? 0, data?.[3] ?? 0];
}

it('paints source-over brush pixels with opacity and clips to bitmap edges', () => {
  const bitmap = createBitmap(5, 5);

  expect(
    paintRasterBrushBitmap({
      bitmap,
      color: '#ff0000',
      hardness: 1,
      opacity: 0.5,
      points: [{ x: 0, y: 0 }],
      radius: 2,
    })
  ).toBe(true);

  expect(readPixel(bitmap, 0, 0)).toEqual([255, 0, 0, 128]);
  expect(readPixel(bitmap, 4, 4)).toEqual([0, 0, 0, 0]);
});

it('reports unchanged strokes when opacity or mask prevents painting', () => {
  const bitmap = createBitmap(5, 5);
  const mask = createBitmap(5, 5);
  mask.getContext('2d')?.clearRect(0, 0, 5, 5);

  expect(
    paintRasterBrushBitmap({
      bitmap,
      color: '#ff0000',
      hardness: 1,
      opacity: 0,
      points: [{ x: 2, y: 2 }],
      radius: 2,
    })
  ).toBe(false);
  expect(
    paintRasterBrushBitmap({
      bitmap,
      color: '#ff0000',
      hardness: 1,
      maskCanvas: mask,
      opacity: 1,
      points: [{ x: 2, y: 2 }],
      radius: 2,
    })
  ).toBe(false);

  expect(readPixel(bitmap, 2, 2)).toEqual([0, 0, 0, 0]);
});

it('applies hardness falloff and optional masks along interpolated strokes', () => {
  const bitmap = createBitmap(8, 5);
  const mask = createBitmap(8, 5, '#ffffff');
  mask.getContext('2d')?.clearRect(6, 0, 2, 5);

  expect(
    paintRasterBrushBitmap({
      bitmap,
      color: '#0000ff',
      hardness: 0,
      maskCanvas: mask,
      opacity: 1,
      points: [
        { x: 1, y: 2 },
        { x: 6, y: 2 },
      ],
      radius: 2,
    })
  ).toBe(true);

  expect(readPixel(bitmap, 3, 2)[3]).toBeGreaterThan(0);
  expect(readPixel(bitmap, 3, 0)[3]).toBeLessThan(255);
  expect(readPixel(bitmap, 7, 2)[3]).toBe(0);
});
