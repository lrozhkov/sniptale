import { afterEach, expect, it, vi } from 'vitest';

import { createVideoCompositionPassBuffer } from './pass-buffer';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('creates a lighter-composition pass buffer and flushes it to the target context', () => {
  const bufferContext = {
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    globalCompositeOperation: 'source-over',
    setTransform: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  const targetContext = {
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  class OffscreenCanvasMock {
    getContext = vi.fn(() => bufferContext);

    constructor(_width: number, _height: number) {}
  }

  vi.stubGlobal('OffscreenCanvas', OffscreenCanvasMock as unknown as typeof OffscreenCanvas);

  const result = createVideoCompositionPassBuffer({
    bufferHeight: 720,
    bufferWidth: 1280,
    drawHeight: 360,
    drawWidth: 640,
    targetContext,
  });

  expect(result?.context).toBe(bufferContext);
  expect(bufferContext.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
  expect(bufferContext.clearRect).toHaveBeenCalledWith(0, 0, 1280, 720);
  expect(bufferContext.globalCompositeOperation).toBe('lighter');

  result?.flush();

  expect(targetContext.drawImage).toHaveBeenCalledWith(
    expect.any(OffscreenCanvasMock),
    0,
    0,
    640,
    360
  );
});

it('returns null when no compatible buffer canvas can be created', () => {
  const targetContext = {
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D;

  const result = createVideoCompositionPassBuffer({
    bufferHeight: 720,
    bufferWidth: 1280,
    drawHeight: 720,
    drawWidth: 1280,
    ownerDocument: null,
    targetContext,
  });

  expect(result).toBeNull();
});

it('returns null when the requested buffer dimensions are invalid', () => {
  const targetContext = {
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D;

  const result = createVideoCompositionPassBuffer({
    bufferHeight: 0,
    bufferWidth: 1280,
    drawHeight: 720,
    drawWidth: 1280,
    targetContext,
  });

  expect(result).toBeNull();
});

it('falls back to an owner document canvas when OffscreenCanvas is unavailable', () => {
  const bufferContext = {
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    globalCompositeOperation: 'source-over',
    setTransform: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  const bufferCanvas = {
    getContext: vi.fn(() => bufferContext),
    height: 0,
    width: 0,
  };
  const ownerDocument = {
    createElement: vi.fn(() => bufferCanvas),
  } as unknown as Document;
  const targetContext = {
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D;

  vi.stubGlobal('OffscreenCanvas', undefined);

  const result = createVideoCompositionPassBuffer({
    bufferHeight: 720,
    bufferWidth: 1280,
    drawHeight: 360,
    drawWidth: 640,
    ownerDocument,
    targetContext,
  });

  expect(ownerDocument.createElement).toHaveBeenCalledWith('canvas');
  expect(bufferCanvas.width).toBe(1280);
  expect(bufferCanvas.height).toBe(720);
  expect(result).not.toBeNull();
});

it('reuses crossfade surfaces across repeated frames', () => {
  let allocations = 0;
  class Surface {
    constructor(
      public width: number,
      public height: number
    ) {
      allocations++;
    }
    getContext() {
      return {
        setTransform: vi.fn(),
        clearRect: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        globalCompositeOperation: 'source-over',
      };
    }
  }
  vi.stubGlobal('OffscreenCanvas', Surface);
  const targetContext = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
  for (let frame = 0; frame < 60; frame++) {
    createVideoCompositionPassBuffer({
      bufferWidth: 1280,
      bufferHeight: 720,
      drawWidth: 1280,
      drawHeight: 720,
      targetContext,
    })!.flush();
  }
  expect(allocations).toBe(1);
});

it('releases the lease when composing into the target fails', () => {
  let allocations = 0;
  class Surface {
    constructor(
      public width: number,
      public height: number
    ) {
      allocations++;
    }
    getContext() {
      return { save: vi.fn(), restore: vi.fn(), setTransform: vi.fn(), clearRect: vi.fn() };
    }
  }
  vi.stubGlobal('OffscreenCanvas', Surface);
  const targetContext = {
    drawImage: () => {
      throw new Error('context lost');
    },
  } as unknown as CanvasRenderingContext2D;
  const params = {
    bufferWidth: 913,
    bufferHeight: 517,
    drawWidth: 913,
    drawHeight: 517,
    targetContext,
  };
  expect(() => createVideoCompositionPassBuffer(params)!.flush()).toThrow('context lost');
  const next = createVideoCompositionPassBuffer(params)!;
  expect(allocations).toBe(1);
  next.dispose();
});
