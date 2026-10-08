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

it('reuses both exposure surfaces after a sample paint failure', () => {
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
        save: vi.fn(),
        restore: vi.fn(),
        setTransform: vi.fn(),
        clearRect: vi.fn(),
        drawImage: vi.fn(),
      };
    }
  }
  vi.stubGlobal('OffscreenCanvas', Surface);
  const params = {
    bufferWidth: 911,
    bufferHeight: 513,
    drawWidth: 911,
    drawHeight: 513,
    targetContext: { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D,
  };
  const failed = createVideoCompositionPassBuffer(params)!;
  try {
    expect(() =>
      failed.drawPass(0.5, () => {
        throw new Error('sample failed');
      })
    ).toThrow('sample failed');
  } finally {
    failed.dispose();
  }
  const next = createVideoCompositionPassBuffer(params)!;
  next.drawPass(0.5, (context) => {
    expect(context.globalAlpha).toBe(1);
    expect(context.globalCompositeOperation).toBe('source-over');
  });
  next.flush();
  expect(allocations).toBe(2);
});

it.each([false, true])(
  'rounds and reuses two managed leases, releasing them on failure=%s',
  async (fail) => {
    const pool = await import('./buffer-pool');
    const globalAcquire = vi.spyOn(pool, 'acquireVideoCompositionBuffer');
    const leases: {
      context: CanvasRenderingContext2D;
      canvas: HTMLCanvasElement;
      release: ReturnType<typeof vi.fn>;
    }[] = [];
    const canvas = vi.fn((_role: string, size: { width: number; height: number }) => {
      const context = {
        save: vi.fn(),
        restore: vi.fn(),
        setTransform: vi.fn(),
        clearRect: vi.fn(),
        drawImage: vi.fn(),
        getTransform: vi.fn(() => ({ a: 0.5, d: 0.5 })),
      } as unknown as CanvasRenderingContext2D;
      const lease = { canvas: { ...size } as HTMLCanvasElement, context, release: vi.fn() };
      leases.push(lease);
      return lease;
    });
    const target = {
      drawImage: vi.fn(),
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
    } as unknown as CanvasRenderingContext2D;
    try {
      const buffer = createVideoCompositionPassBuffer({
        bufferWidth: 639.5,
        bufferHeight: 359.5,
        drawWidth: 1920,
        drawHeight: 1080,
        targetContext: target,
        resources: { canvas, bytes: vi.fn() },
      })!;
      const paint = vi.fn((context: CanvasRenderingContext2D) => {
        expect(context.globalCompositeOperation).toBe('source-over');
        expect(context.globalAlpha).toBe(1);
      });
      buffer.drawPass(0.3, paint);
      buffer.drawPass(0.7, paint);
      expect(canvas.mock.calls.map(([role]) => role)).toEqual([
        'motion-accumulator',
        'motion-sample',
      ]);
      expect(leases[0]!.context.globalAlpha).toBe(0.7);
      expect(leases[1]!.context.setTransform).toHaveBeenCalledWith({ a: 0.5, d: 0.5 });
      if (fail)
        expect(() =>
          buffer.drawPass(1, () => {
            throw new Error('paint failed');
          })
        ).toThrow('paint failed');
      else buffer.flush();
      buffer.dispose();
      expect(leases.map((lease) => lease.release.mock.calls.length)).toEqual([1, 1]);
      expect(globalAcquire).not.toHaveBeenCalled();
      if (!fail) expect(target.drawImage).toHaveBeenCalledWith(leases[0]!.canvas, 0, 0, 1920, 1080);
    } finally {
      globalAcquire.mockRestore();
    }
  }
);
