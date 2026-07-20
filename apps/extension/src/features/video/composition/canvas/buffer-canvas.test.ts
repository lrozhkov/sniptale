// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';
import { createVideoCompositionBufferCanvas } from './buffer-canvas';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('creates an offscreen canvas when the runtime supports it', () => {
  class OffscreenCanvasMock {
    constructor(
      public readonly width: number,
      public readonly height: number
    ) {}
  }
  vi.stubGlobal('OffscreenCanvas', OffscreenCanvasMock);

  const canvas = createVideoCompositionBufferCanvas(320, 180);

  expect(canvas).toBeInstanceOf(OffscreenCanvasMock);
  expect(canvas).toEqual(expect.objectContaining({ height: 180, width: 320 }));
});

it('falls back to an explicitly owned document canvas', () => {
  const createElement = vi.spyOn(document, 'createElement');
  vi.stubGlobal('OffscreenCanvas', undefined);

  const result = createVideoCompositionBufferCanvas(640, 360, document);

  expect(createElement).toHaveBeenCalledWith('canvas');
  expect(result).toBeInstanceOf(HTMLCanvasElement);
  expect(result).toEqual(expect.objectContaining({ height: 360, width: 640 }));
});

it('returns null without offscreen or document canvas support', () => {
  vi.stubGlobal('OffscreenCanvas', undefined);
  vi.stubGlobal('document', undefined);

  expect(createVideoCompositionBufferCanvas(640, 360, null)).toBeNull();
});
