// @vitest-environment jsdom
/* eslint-disable max-lines-per-function --
   exact raster mutation proof keeps fill, flood, erase, and gradient mask branches together */

import { describe, expect, it } from 'vitest';
import {
  clearRasterBitmap,
  eraseRasterBitmap,
  fillRasterBitmap,
  fillRasterBitmapWithLinearGradient,
  floodFillRasterBitmap,
} from './mutations';

function createBitmap(width: number, height: number, color = '#000000'): HTMLCanvasElement {
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

function createMask(
  width: number,
  height: number,
  rect: { left: number; top: number; width: number; height: number }
) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('2d context is unavailable');
  }

  context.fillStyle = '#ffffff';
  context.fillRect(rect.left, rect.top, rect.width, rect.height);
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

describe('editor-controller/raster/mutations', () => {
  it('fills only masked pixels for solid fills', () => {
    const bitmap = createBitmap(4, 4, '#000000');
    fillRasterBitmap({
      bitmap,
      color: '#ff0000',
      maskCanvas: createMask(4, 4, { left: 1, top: 1, width: 2, height: 2 }),
    });

    expect(readPixel(bitmap, 0, 0)).toEqual([0, 0, 0, 255]);
    expect(readPixel(bitmap, 1, 1)).toEqual([255, 0, 0, 255]);
  });

  it('clears only selected mask pixels', () => {
    const bitmap = createBitmap(4, 4, '#ffffff');
    clearRasterBitmap({
      bitmap,
      maskCanvas: createMask(4, 4, { left: 1, top: 1, width: 2, height: 2 }),
    });

    expect(readPixel(bitmap, 0, 0)[3]).toBe(255);
    expect(readPixel(bitmap, 1, 1)[3]).toBe(0);
  });

  it('keeps flood fill inside the contiguous source region', () => {
    const bitmap = createBitmap(4, 4, '#0000ff');
    const context = bitmap.getContext('2d');
    if (!context) {
      throw new Error('2d context is unavailable');
    }

    context.fillStyle = '#00ff00';
    context.fillRect(0, 0, 2, 2);
    floodFillRasterBitmap({
      bitmap,
      startX: 0,
      startY: 0,
      color: '#ff0000',
      tolerance: 0,
    });

    expect(readPixel(bitmap, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(readPixel(bitmap, 1, 1)).toEqual([255, 0, 0, 255]);
    expect(readPixel(bitmap, 3, 3)).toEqual([0, 0, 255, 255]);
  });

  it('erases only masked brush hits and keeps gradient fills drawable', () => {
    const bitmap = createBitmap(8, 8, '#ffffff');
    fillRasterBitmapWithLinearGradient({
      bitmap,
      start: { x: 0, y: 0 },
      end: { x: 8, y: 0 },
      stops: [
        { color: '#000000', offset: 0 },
        { color: '#777777', offset: 0.5, opacity: 0.5 },
        { color: '#ffffff', offset: 1 },
      ],
    });
    eraseRasterBitmap({
      bitmap,
      points: [{ x: 4, y: 4 }],
      radius: 2,
      maskCanvas: createMask(8, 8, { left: 3, top: 3, width: 2, height: 2 }),
    });

    expect(readPixel(bitmap, 4, 4)[3]).toBe(0);
    expect(readPixel(bitmap, 0, 0)[3]).toBe(255);
  });

  it('erases continuous segments between sampled pointer points', () => {
    const bitmap = createBitmap(10, 7, '#ffffff');

    eraseRasterBitmap({
      bitmap,
      points: [
        { x: 1, y: 3 },
        { x: 8, y: 3 },
      ],
      radius: 1,
    });

    expect(readPixel(bitmap, 1, 3)[3]).toBe(0);
    expect(readPixel(bitmap, 4, 3)[3]).toBe(0);
    expect(readPixel(bitmap, 8, 3)[3]).toBe(0);
    expect(readPixel(bitmap, 4, 0)[3]).toBe(255);
  });

  it('keeps masked gradient writes inside the mask and respects tolerance misses', () => {
    const bitmap = createBitmap(6, 2, '#000000');
    fillRasterBitmapWithLinearGradient({
      bitmap,
      start: { x: 0, y: 0 },
      end: { x: 6, y: 0 },
      stops: [
        { color: '#000000', offset: 0 },
        { color: '#ffffff', offset: 1 },
      ],
      maskCanvas: createMask(6, 2, { left: 2, top: 0, width: 2, height: 2 }),
    });
    floodFillRasterBitmap({
      bitmap,
      startX: 0,
      startY: 0,
      color: '#ff0000',
      tolerance: 0,
      maskCanvas: createMask(6, 2, { left: 0, top: 0, width: 1, height: 2 }),
    });

    expect(readPixel(bitmap, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(readPixel(bitmap, 5, 0)).not.toEqual([255, 0, 0, 255]);
  });
});
