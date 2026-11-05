// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPreviewRenderResources,
  PreviewRenderResourceError,
} from './preview-render-resources';

function setup(maximumManagedBytes = 800, maximumCanvases = 2) {
  const context = { globalAlpha: 1 } as CanvasRenderingContext2D;
  const canvases: HTMLCanvasElement[] = [];
  const createCanvas = vi.fn(() => {
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue(context);
    canvases.push(canvas);
    return canvas;
  });
  const resources = createPreviewRenderResources({
    maximumManagedBytes,
    maximumCanvases,
    createCanvas,
  });
  return { resources, createCanvas, canvases, context };
}
const size = { width: 10, height: 10 };
afterEach(() => vi.restoreAllMocks());

describe('session render resources', () => {
  it('counts active and idle surfaces, and reuses only released exclusive leases', () => {
    const { resources, createCanvas } = setup();
    const first = resources.canvas('source', size);
    const second = resources.canvas('scratch', size);
    expect(first.canvas).not.toBe(second.canvas);
    first.release();
    first.release();
    expect(resources.counters).toEqual({
      managedBytes: 800,
      peakManagedBytes: 800,
      canvasCount: 2,
      peakCanvasCount: 2,
    });
    const reset = vi.spyOn(first.canvas, 'width', 'set');
    const third = resources.canvas('another-role', size);
    expect(third.canvas).toBe(first.canvas);
    expect(reset).toHaveBeenCalledWith(10);
    first.release();
    expect(() => resources.canvas('overflow', size)).toThrow(PreviewRenderResourceError);
    expect(createCanvas).toHaveBeenCalledTimes(2);
  });

  it('resets a supported context without rewriting its reusable backing', () => {
    const { resources, context, createCanvas } = setup();
    context.reset = vi.fn(() => {
      context.globalAlpha = 1;
    });
    const first = resources.canvas('source', size);
    context.globalAlpha = 0.2;
    first.release();
    const width = vi.spyOn(first.canvas, 'width', 'set');
    const height = vi.spyOn(first.canvas, 'height', 'set');
    const next = resources.canvas('next', size);
    expect(next.canvas).toBe(first.canvas);
    expect(context.reset).toHaveBeenCalledOnce();
    expect(context.globalAlpha).toBe(1);
    expect(width).not.toHaveBeenCalled();
    expect(height).not.toHaveBeenCalled();
    expect(createCanvas).toHaveBeenCalledOnce();
  });

  it('preserves the fixed allocation error when cleanup setters also fail', () => {
    const { resources, createCanvas } = setup();
    const canvas = document.createElement('canvas');
    const height = vi.spyOn(canvas, 'height', 'set');
    vi.spyOn(canvas, 'width', 'set').mockImplementation(() => {
      throw new Error('platform resize failure');
    });
    createCanvas.mockReturnValueOnce(canvas);
    expect(() => resources.canvas('source', size)).toThrow(
      'Preview render resource allocation failed'
    );
    expect(height).toHaveBeenCalledWith(0);
    expect(resources.counters.managedBytes).toBe(0);
    expect(resources.counters.canvasCount).toBe(0);
    expect(resources.canvas('retry', size).canvas.width).toBe(10);
  });

  it('separates immutable context options and normalizes property order', () => {
    const { resources } = setup();
    const opaque = resources.canvas('opaque', size, { alpha: false, willReadFrequently: true });
    opaque.release();
    const transparent = resources.canvas('transparent', size, { alpha: true });
    expect(transparent.canvas).not.toBe(opaque.canvas);
    const same = resources.canvas('same', size, { willReadFrequently: true, alpha: false });
    expect(same.canvas).toBe(opaque.canvas);
  });

  it('evicts idle backings before replacement without exceeding the declared budget', () => {
    const { resources } = setup(400, 1);
    const first = resources.canvas('first', size);
    first.release();
    const second = resources.canvas('replacement', { width: 5, height: 20 });
    expect(first.canvas.width).toBe(0);
    expect(first.canvas.height).toBe(0);
    expect(second.canvas.width).toBe(5);
    expect(resources.counters).toEqual({
      managedBytes: 400,
      peakManagedBytes: 400,
      canvasCount: 1,
      peakCanvasCount: 1,
    });
  });

  it('reserves byte storage alongside canvases and refuses exact-capacity overflow', () => {
    const { resources } = setup(500);
    const canvas = resources.canvas('frame', size);
    const bytes = resources.bytes('array', 100);
    expect(resources.counters.managedBytes).toBe(500);
    expect(() => resources.bytes('overflow', 1)).toThrow(PreviewRenderResourceError);
    bytes.release();
    bytes.release();
    expect(resources.counters.managedBytes).toBe(400);
    canvas.release();
    const replacement = resources.bytes('array', 500);
    expect(canvas.canvas.width).toBe(0);
    expect(resources.counters.canvasCount).toBe(0);
    replacement.release();
    expect(resources.counters.managedBytes).toBe(0);
  });

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid size and bytes %s before allocation',
    (value) => {
      const { resources, createCanvas } = setup();
      expect(() => resources.canvas('bad', { width: value, height: 10 })).toThrow(
        PreviewRenderResourceError
      );
      expect(() => resources.canvas('bad', { width: 10, height: value })).toThrow(
        PreviewRenderResourceError
      );
      expect(() => resources.bytes('bad', value)).toThrow(PreviewRenderResourceError);
      expect(createCanvas).not.toHaveBeenCalled();
      expect(resources.counters.managedBytes).toBe(0);
    }
  );

  it('rejects multiplication overflow and invalid budgets without allocating', () => {
    const { resources, createCanvas } = setup();
    expect(() =>
      resources.canvas('overflow', { width: Number.MAX_SAFE_INTEGER, height: 2 })
    ).toThrow(PreviewRenderResourceError);
    expect(createCanvas).not.toHaveBeenCalled();
    for (const value of [0, -1, NaN, Infinity, 1.2]) {
      expect(() =>
        createPreviewRenderResources({ maximumManagedBytes: value, maximumCanvases: 1 })
      ).toThrow();
      expect(() =>
        createPreviewRenderResources({ maximumManagedBytes: 400, maximumCanvases: value })
      ).toThrow();
    }
  });

  it.each(['null', 'throw'])('rolls back context creation failure: %s', (failure) => {
    const { resources, createCanvas, canvases } = setup();
    createCanvas.mockImplementationOnce(() => {
      const canvas = document.createElement('canvas');
      vi.spyOn(canvas, 'getContext').mockImplementation(() => {
        if (failure === 'throw') throw new Error('driver failure');
        return null;
      });
      canvases.push(canvas);
      return canvas;
    });
    expect(() => resources.canvas('private-role', size)).toThrow(
      'Preview render resource allocation failed'
    );
    expect(canvases[0]?.width).toBe(0);
    expect(resources.counters.managedBytes).toBe(0);
    expect(resources.counters.canvasCount).toBe(0);
    expect(resources.canvas('retry', size).canvas.width).toBe(10);
  });

  it('disposes active and idle leases, rejecting new work and tolerating late releases', () => {
    const { resources } = setup(900);
    const active = resources.canvas('active', size);
    const idle = resources.canvas('idle', size);
    idle.release();
    const bytes = resources.bytes('bytes', 100);
    resources.dispose();
    resources.dispose();
    active.release();
    bytes.release();
    expect(active.canvas.width).toBe(0);
    expect(idle.canvas.height).toBe(0);
    expect(resources.counters).toEqual({
      managedBytes: 0,
      peakManagedBytes: 900,
      canvasCount: 0,
      peakCanvasCount: 2,
    });
    expect(() => resources.canvas('late', size)).toThrow(PreviewRenderResourceError);
    expect(() => resources.bytes('late', 1)).toThrow(PreviewRenderResourceError);
  });
});

describe('exact staged render limits', () => {
  it('expands only to the next declared plan and preserves lifetime peaks', () => {
    const { resources } = setup(400, 1);
    const first = resources.canvas('front', size);
    expect(() => resources.canvas('staging', size)).toThrow(PreviewRenderResourceError);
    resources.replaceLimits({ maximumManagedBytes: 800, maximumCanvases: 2 });
    const second = resources.canvas('staging', size);
    expect(() => resources.bytes('unplanned', 1)).toThrow(PreviewRenderResourceError);
    second.release();
    resources.replaceLimits({ maximumManagedBytes: 400, maximumCanvases: 1 });
    expect(first.canvas.width).toBe(10);
    expect(second.canvas.width).toBe(0);
    expect(resources.counters.managedBytes).toBe(400);
    expect(resources.counters.peakManagedBytes).toBe(800);
    expect(resources.counters.peakCanvasCount).toBe(2);
  });

  it('evicts oldest idle surfaces deterministically for count and byte limits', () => {
    const { resources } = setup(1200, 3);
    const first = resources.canvas('oldest', size);
    const second = resources.canvas('newer', size);
    const active = resources.canvas('active', size);
    first.release();
    second.release();
    resources.replaceLimits({ maximumManagedBytes: 1200, maximumCanvases: 2 });
    expect(first.canvas.width).toBe(0);
    expect(second.canvas.width).toBe(10);
    resources.replaceLimits({ maximumManagedBytes: 400, maximumCanvases: 2 });
    expect(second.canvas.width).toBe(0);
    expect(active.canvas.width).toBe(10);
    first.release();
    second.release();
    expect(resources.counters.managedBytes).toBe(400);
  });

  it('refuses limits below active byte reservations without evicting idle storage or changing limits', () => {
    const { resources } = setup(1200, 2);
    const active = resources.canvas('front', size);
    const idle = resources.canvas('idle', size);
    idle.release();
    const reservation = resources.bytes('bitmap', 300);
    expect(() => resources.replaceLimits({ maximumManagedBytes: 699, maximumCanvases: 1 })).toThrow(
      PreviewRenderResourceError
    );
    expect(idle.canvas.width).toBe(10);
    expect(active.canvas.width).toBe(10);
    expect(resources.counters.managedBytes).toBe(1100);
    const oldLimitStillApplies = resources.bytes('remaining', 100);
    expect(resources.counters.managedBytes).toBe(1200);
    oldLimitStillApplies.release();
    reservation.release();
  });

  it('refuses a canvas-count reduction below live leases before any idle eviction', () => {
    const { resources } = setup(1200, 3);
    resources.canvas('front', size);
    resources.canvas('staging', size);
    const idle = resources.canvas('idle', size);
    idle.release();
    expect(() =>
      resources.replaceLimits({ maximumManagedBytes: 1200, maximumCanvases: 1 })
    ).toThrow(PreviewRenderResourceError);
    expect(idle.canvas.width).toBe(10);
    expect(resources.canvas('reuse', size).canvas).toBe(idle.canvas);
  });

  it.each([0, -1, NaN, Infinity, 1.5])(
    'rejects invalid staged limits %s before eviction',
    (value) => {
      const { resources } = setup();
      const idle = resources.canvas('idle', size);
      idle.release();
      expect(() =>
        resources.replaceLimits({ maximumManagedBytes: value, maximumCanvases: 1 })
      ).toThrow();
      expect(() =>
        resources.replaceLimits({ maximumManagedBytes: 400, maximumCanvases: value })
      ).toThrow();
      expect(idle.canvas.width).toBe(10);
    }
  );

  it('rejects budget updates after disposal and tolerates late release', () => {
    const { resources } = setup();
    const lease = resources.canvas('front', size);
    const bytes = resources.bytes('bitmap', 10);
    resources.dispose();
    expect(() =>
      resources.replaceLimits({ maximumManagedBytes: 800, maximumCanvases: 2 })
    ).toThrow();
    lease.release();
    bytes.release();
    expect(resources.counters.managedBytes).toBe(0);
  });
});

describe('contextless GPU presentation resources', () => {
  function renderer(
    resources: ReturnType<typeof createPreviewRenderResources>,
    completion?: Promise<void>
  ) {
    const surfaces: Array<{ dispose: ReturnType<typeof vi.fn>; canvas: HTMLCanvasElement }> = [];
    const backend = {
      allocatedBytes: 0,
      render:
        vi.fn<
          import('../../features/video/composition/canvas/gpu-preview').GpuPreviewRenderer['render']
        >(),
      dispose: vi.fn(),
      createSurface: vi.fn((canvas: HTMLCanvasElement) => {
        canvas.getContext('webgpu');
        let reservation: { release(): void } | undefined;
        const dispose = vi.fn(() => {
          reservation?.release();
          reservation = undefined;
        });
        surfaces.push({ canvas, dispose });
        return {
          canvas,
          present: vi.fn(async () => {
            reservation ??= resources.bytes('GPU output', canvas.width * canvas.height * 8);
            await completion;
          }),
          dispose,
        };
      }),
    } satisfies import('../../features/video/composition/canvas/gpu-preview').GpuPreviewRenderer;
    return { backend, surfaces };
  }
  it('keeps GPU and2D slots separate and reuses only exact size/backend without2D reset', () => {
    const f = setup(2000, 5),
      g = renderer(f.resources);
    const cpu = f.resources.canvas('cpu', size);
    cpu.release();
    const first = f.resources.presentationCanvas(size, g.backend);
    first.release();
    const width = vi.spyOn(first.canvas, 'width', 'set'),
      height = vi.spyOn(first.canvas, 'height', 'set');
    const next = f.resources.presentationCanvas(size, g.backend);
    expect(next.canvas).toBe(first.canvas);
    expect(next.surface).toBe(first.surface);
    expect(next.canvas).not.toBe(cpu.canvas);
    expect(g.backend.createSurface).toHaveBeenCalledTimes(1);
    expect(vi.mocked(first.canvas.getContext).mock.calls).toEqual([['webgpu']]);
    expect(width).not.toHaveBeenCalled();
    expect(height).not.toHaveBeenCalled();
    expect(f.resources.counters.canvasCount).toBe(2);
    expect(f.resources.counters.managedBytes).toBe(400);
    next.release();
    f.resources.dispose();
  });
  it('bounds three GPU output slots per backend and global canvas capacity', () => {
    const f = setup(10000, 5),
      g = renderer(f.resources);
    const a = f.resources.presentationCanvas(size, g.backend),
      b = f.resources.presentationCanvas(size, g.backend),
      c = f.resources.presentationCanvas(size, g.backend);
    expect(() => f.resources.presentationCanvas(size, g.backend)).toThrow(
      PreviewRenderResourceError
    );
    expect(f.createCanvas).toHaveBeenCalledTimes(3);
    a.release();
    const reuse = f.resources.presentationCanvas(size, g.backend);
    expect(reuse.canvas).toBe(a.canvas);
    b.release();
    c.release();
    reuse.release();
    f.resources.dispose();
    const bounded = setup(10000, 1),
      other = renderer(bounded.resources);
    const held = bounded.resources.canvas('held', size);
    expect(() => bounded.resources.presentationCanvas(size, other.backend)).toThrow(
      PreviewRenderResourceError
    );
    held.release();
    bounded.resources.dispose();
  });
  it('retires idle resized GPU slots before changing backing and never crosses backend identity', () => {
    const f = setup(10000, 1),
      firstBackend = renderer(f.resources),
      secondBackend = renderer(f.resources);
    const first = f.resources.presentationCanvas(size, firstBackend.backend);
    first.release();
    firstBackend.surfaces[0]!.dispose.mockImplementation(() => expect(first.canvas.width).toBe(10));
    const resized = f.resources.presentationCanvas({ width: 5, height: 20 }, firstBackend.backend);
    expect(firstBackend.surfaces[0]!.dispose).toHaveBeenCalledTimes(1);
    expect(first.canvas.width).toBe(0);
    resized.release();
    const other = f.resources.presentationCanvas({ width: 5, height: 20 }, secondBackend.backend);
    expect(other.canvas).not.toBe(resized.canvas);
    expect(resized.canvas.width).toBe(0);
    other.release();
    f.resources.dispose();
  });
  it('accounts GPU destination bytes only through its backend reservation', async () => {
    const f = setup(800, 2),
      g = renderer(f.resources),
      lease = f.resources.presentationCanvas(size, g.backend);
    expect(f.resources.counters.managedBytes).toBe(0);
    await lease.surface.present({
      output: size,
      logical: size,
      layers: [],
      signal: new AbortController().signal,
    });
    expect(f.resources.counters.managedBytes).toBe(800);
    expect(f.resources.counters.canvasCount).toBe(1);
    lease.release();
    f.resources.dispose();
    expect(f.resources.counters.managedBytes).toBe(0);
  });
  it('preserves active GPU backings and external reservations through disposal until fence release', async () => {
    let settle!: () => void;
    const fence = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const f = setup(900, 2),
      g = renderer(f.resources, fence),
      lease = f.resources.presentationCanvas(size, g.backend);
    const extra = f.resources.bytes('other core resource', 100);
    const pending = lease.surface
      .present({ output: size, logical: size, layers: [], signal: new AbortController().signal })
      .then(() => lease.release());
    f.resources.dispose();
    f.resources.dispose();
    expect(lease.canvas.width).toBe(10);
    expect(g.surfaces[0]!.dispose).not.toHaveBeenCalled();
    expect(f.resources.counters.managedBytes).toBe(900);
    expect(f.resources.counters.canvasCount).toBe(1);
    expect(() => f.resources.presentationCanvas(size, g.backend)).toThrow(
      PreviewRenderResourceError
    );
    settle();
    await pending;
    lease.release();
    expect(g.surfaces[0]!.dispose).toHaveBeenCalledTimes(1);
    expect(lease.canvas.width).toBe(0);
    expect(f.resources.counters.managedBytes).toBe(100);
    extra.release();
    expect(f.resources.counters.managedBytes).toBe(0);
    expect(f.resources.counters.canvasCount).toBe(0);
  });
  it('rolls back backend binding failure without retaining a canvas', () => {
    const f = setup(),
      g = renderer(f.resources),
      failure = new Error('binding');
    g.backend.createSurface.mockImplementationOnce(() => {
      throw failure;
    });
    expect(() => f.resources.presentationCanvas(size, g.backend)).toThrow(failure);
    expect(f.canvases[0]!.width).toBe(0);
    expect(f.resources.counters.canvasCount).toBe(0);
    const retry = f.resources.presentationCanvas(size, g.backend);
    retry.release();
    f.resources.dispose();
  });
});

describe('GPU pool resize and backend changes', () => {
  function backend(resources: ReturnType<typeof createPreviewRenderResources>) {
    const retired: HTMLCanvasElement[] = [];
    return {
      retired,
      renderer: {
        allocatedBytes: 0,
        render:
          vi.fn<
            import('../../features/video/composition/canvas/gpu-preview').GpuPreviewRenderer['render']
          >(),
        dispose: vi.fn(),
        createSurface(canvas: HTMLCanvasElement) {
          let bytes: { release(): void } | undefined;
          return {
            canvas,
            async present() {
              bytes ??= resources.bytes('destination', canvas.width * canvas.height * 8);
            },
            dispose() {
              retired.push(canvas);
              bytes?.release();
              bytes = undefined;
            },
          };
        },
      } satisfies import('../../features/video/composition/canvas/gpu-preview').GpuPreviewRenderer,
    };
  }
  it('retires idle configured GPU targets before deciding a smaller resize phase budget', async () => {
    const { resources } = setup(3000, 3),
      gpu = backend(resources);
    const front = resources.presentationCanvas(size, gpu.renderer);
    const a = resources.presentationCanvas(size, gpu.renderer);
    const b = resources.presentationCanvas(size, gpu.renderer);
    for (const lease of [front, a, b])
      await lease.surface.present({
        output: size,
        logical: size,
        layers: [],
        signal: new AbortController().signal,
      });
    a.release();
    b.release();
    resources.replaceLimits({ maximumManagedBytes: 1200, maximumCanvases: 3 });
    expect(resources.counters.managedBytes).toBe(800);
    expect(front.canvas.width).toBe(10);
    expect(gpu.retired).toEqual([a.canvas, b.canvas]);
    const smaller = resources.presentationCanvas({ width: 5, height: 5 }, gpu.renderer);
    await smaller.surface.present({
      output: { width: 5, height: 5 },
      logical: size,
      layers: [],
      signal: new AbortController().signal,
    });
    expect(resources.counters.managedBytes).toBe(1000);
    const smallerSecond = resources.presentationCanvas({ width: 5, height: 5 }, gpu.renderer);
    await smallerSecond.surface.present({
      output: { width: 5, height: 5 },
      logical: size,
      layers: [],
      signal: new AbortController().signal,
    });
    expect(resources.counters.managedBytes).toBe(1200);
    smallerSecond.release();
    smaller.release();
    front.release();
    resources.dispose();
  });
  it('retires idle old-backend entries while preserving its active front', () => {
    const { resources } = setup(4000, 5),
      old = backend(resources),
      next = backend(resources);
    const front = resources.presentationCanvas(size, old.renderer),
      idle = resources.presentationCanvas(size, old.renderer);
    idle.release();
    const replacement = resources.presentationCanvas(size, next.renderer);
    expect(old.retired).toEqual([idle.canvas]);
    expect(idle.canvas.width).toBe(0);
    expect(front.canvas.width).toBe(10);
    expect(resources.counters.canvasCount).toBe(2);
    replacement.release();
    front.release();
    resources.dispose();
  });
});
