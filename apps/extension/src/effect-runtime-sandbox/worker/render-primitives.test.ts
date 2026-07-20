import { expect, it, vi } from 'vitest';

import { drawImageAsset } from './assets/render-assets';
import {
  createLogicalCanvasFactory,
  getLogicalCanvasScale,
  getLogicalCanvasSize,
} from './canvas/logical-canvas';
import { createPassContext } from './interpreter/support.test-support';
import type { RuntimeCanvas } from './model/types';

class FakeBitmap implements ImageBitmap {
  readonly close = vi.fn();
  constructor(
    readonly width: number,
    readonly height: number
  ) {}
}

it('draws contain/fill and both cover crop orientations with bounded styling', () => {
  const context = createPassContext();
  const wide = new FakeBitmap(200, 100);
  const tall = new FakeBitmap(100, 200);

  drawImageAsset(context, { bitmap: wide });
  drawImageAsset(context, { bitmap: wide }, { fit: 'fill', height: 20, width: 30 });
  drawImageAsset(context, { bitmap: wide }, { fit: 'cover', height: 100, width: 100 });
  drawImageAsset(
    context,
    { bitmap: tall },
    {
      alpha: 0.5,
      composite: 'screen',
      filter: 'blur(1px)',
      fit: 'cover',
      height: 100,
      opacity: 0.25,
      rotate: 1,
      scale: 2,
      shadowBlur: 3,
      shadowColor: '#000',
      width: 100,
      x: 4,
      y: 5,
    }
  );

  expect(context.drawImage).toHaveBeenCalledTimes(4);
  expect(context.drawImage).toHaveBeenNthCalledWith(3, wide, 50, 0, 100, 100, -50, -50, 100, 100);
  expect(context.drawImage).toHaveBeenNthCalledWith(4, tall, 0, 50, 100, 100, -100, -100, 200, 200);
  expect(context).toMatchObject({
    filter: 'blur(1px)',
    globalAlpha: 0.25,
    shadowBlur: 3,
    shadowColor: '#000',
  });
});

it('creates logical backing canvases and exposes safe sizes and scales', () => {
  const context = createPassContext();
  const canvas: RuntimeCanvas = { getContext: () => context, height: 1, width: 1 };
  const createCanvas = vi.fn(() => canvas);
  const factory = createLogicalCanvasFactory({
    createCanvas,
    outputHeight: 720,
    outputWidth: 1280,
    renderHeight: 2160,
    renderWidth: 3840,
  });

  expect(factory(10.4, 20.6)).toBe(canvas);
  expect(createCanvas).toHaveBeenCalledWith(30, 63);
  expect(getLogicalCanvasSize(canvas)).toEqual({ height: 21, width: 10 });
  expect(getLogicalCanvasScale(context)).toEqual({ uniform: 3, x: 3, y: 3 });
  expect(getLogicalCanvasScale(createPassContext())).toEqual({ uniform: 1, x: 1, y: 1 });
});

it('still returns a logical canvas when the 2D context is unavailable', () => {
  const canvas: RuntimeCanvas = { getContext: () => null, height: 1, width: 1 };
  const factory = createLogicalCanvasFactory({
    createCanvas: () => canvas,
    outputHeight: 0,
    outputWidth: 0,
    renderHeight: 0,
    renderWidth: 0,
  });

  expect(factory(Number.NaN, 0)).toBe(canvas);
  expect(getLogicalCanvasSize(canvas)).toEqual({ height: 1, width: 1 });
});
