// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createGpuPreviewPresentationOwner } from './gpu-preview-presentation';
import { GpuPreviewDeviceError } from './gpu-preview';
import { deferred } from './gpu-preview.test-support';

const owners: ReturnType<typeof createGpuPreviewPresentationOwner>[] = [];
afterEach(() => {
  for (const owner of owners.splice(0)) owner.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function fixture(maximumSurfaces = 3, maximumBytes = 4096) {
  const context = {
    configure: vi.fn(),
    unconfigure: vi.fn(),
    getCurrentTexture: vi.fn(() => ({}) as GPUTexture),
  };
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 4;
  const bitmapContext = { transferFromImageBitmap: vi.fn<(bitmap: ImageBitmap | null) => void>() };
  const getContext = vi.fn<(_mode?: string) => typeof context | typeof bitmapContext | null>(
    () => context
  );
  Object.defineProperty(canvas, 'getContext', { value: getContext });
  const releases: ReturnType<typeof vi.fn>[] = [];
  const reserve = vi.fn((_bytes: number) => {
    const release = vi.fn();
    releases.push(release);
    return { release };
  });
  const execute = vi.fn(async (_request: unknown, getTexture: () => GPUTexture) => {
    getTexture();
  });
  const onIdle = vi.fn();
  const owner = createGpuPreviewPresentationOwner({
    device: { limits: { maxTextureDimension2D: 64 } } as GPUDevice,
    format: 'bgra8unorm',
    maximumSurfaces,
    maximumBytes,
    reserve,
    check: (signal) => signal.throwIfAborted(),
    execute,
    onIdle,
    unavailable: () => new GpuPreviewDeviceError('unavailable'),
  });
  owners.push(owner);
  const request = (signal = new AbortController().signal) => ({
    output: { width: canvas.width, height: canvas.height },
    logical: { width: 8, height: 4 },
    layers: [],
    signal,
  });
  return {
    owner,
    context,
    bitmapContext,
    canvas,
    getContext,
    reserve,
    releases,
    execute,
    onIdle,
    request,
  };
}
it('configures only WebGPU once and retains accounted output storage between presents', async () => {
  const f = fixture();
  const surface = f.owner.create(f.canvas);
  await surface.present(f.request());
  await surface.present(f.request());
  expect(f.getContext.mock.calls).toEqual([['webgpu']]);
  expect(f.context.configure).toHaveBeenCalledTimes(1);
  expect(f.context.configure).toHaveBeenCalledWith(
    expect.objectContaining({ alphaMode: 'premultiplied' })
  );
  expect(f.owner.allocatedBytes).toBe(256);
  expect(f.reserve).toHaveBeenCalledExactlyOnceWith(256);
  surface.dispose();
  expect(f.owner.allocatedBytes).toBe(0);
  expect(f.releases[0]).toHaveBeenCalledTimes(1);
  expect(f.canvas.width).toBe(8);
});
it('refuses duplicate canvases and bounded capacity, and recovers a released slot', () => {
  const f = fixture(1);
  const surface = f.owner.create(f.canvas);
  expect(() => f.owner.create(f.canvas)).toThrow();
  expect(() => f.owner.create(document.createElement('canvas'))).toThrow();
  surface.dispose();
  expect(() => f.owner.create(f.canvas)).not.toThrow();
});
it('reconfigures an idle resize and releases its previous reservation once', async () => {
  const f = fixture();
  const surface = f.owner.create(f.canvas);
  await surface.present(f.request());
  f.canvas.width = 16;
  await surface.present(f.request());
  expect(f.context.configure).toHaveBeenCalledTimes(2);
  expect(f.context.unconfigure).toHaveBeenCalledTimes(1);
  expect(f.owner.allocatedBytes).toBe(512);
  expect(f.releases[0]).toHaveBeenCalledTimes(1);
});
it('rejects double presentation without releasing the pending target', async () => {
  const f = fixture(),
    gate = deferred<void>();
  f.execute.mockImplementation(async (_request, getTexture) => {
    getTexture();
    await gate.promise;
  });
  const surface = f.owner.create(f.canvas),
    pending = surface.present(f.request());
  expect(f.owner.pending).toBe(1);
  await expect(surface.present(f.request())).rejects.toThrow();
  expect(f.context.unconfigure).not.toHaveBeenCalled();
  gate.resolve();
  await pending;
  expect(f.owner.pending).toBe(0);
});
it('keeps target resources through owner disposal until execution settles', async () => {
  const f = fixture(),
    gate = deferred<void>();
  f.execute.mockImplementation(async (_request, getTexture) => {
    getTexture();
    await gate.promise;
  });
  const surface = f.owner.create(f.canvas),
    pending = surface.present(f.request());
  f.owner.dispose();
  f.owner.dispose();
  surface.dispose();
  expect(f.owner.pending).toBe(1);
  expect(f.owner.allocatedBytes).toBe(256);
  expect(f.releases[0]).not.toHaveBeenCalled();
  expect(f.context.unconfigure).not.toHaveBeenCalled();
  expect(() => f.owner.create(f.canvas)).toThrow();
  await expect(surface.present(f.request())).rejects.toThrow();
  gate.resolve();
  await expect(pending).rejects.toThrow('disposed');
  expect(f.owner.pending).toBe(0);
  expect(f.owner.allocatedBytes).toBe(0);
  expect(f.context.unconfigure).toHaveBeenCalledTimes(1);
  expect(f.releases[0]).toHaveBeenCalledTimes(1);
  expect(f.onIdle).toHaveBeenCalledTimes(1);
});
it('checks abort before admission and after the execution barrier', async () => {
  const f = fixture(),
    gate = deferred<void>(),
    controller = new AbortController();
  const surface = f.owner.create(f.canvas);
  controller.abort();
  await expect(surface.present(f.request(controller.signal))).rejects.toThrow();
  expect(f.execute).not.toHaveBeenCalled();
  expect(f.reserve).not.toHaveBeenCalled();
  const live = new AbortController();
  f.execute.mockImplementation(async (_request, getTexture) => {
    getTexture();
    await gate.promise;
  });
  const pending = surface.present(f.request(live.signal));
  live.abort();
  expect(f.owner.pending).toBe(1);
  gate.resolve();
  await expect(pending).rejects.toThrow();
  expect(f.owner.pending).toBe(0);
});
it('rejects a pending backing resize before texture acquisition without early cleanup', async () => {
  const f = fixture(),
    gate = deferred<void>();
  f.execute.mockImplementation(async (_request, getTexture) => {
    await gate.promise;
    getTexture();
  });
  const surface = f.owner.create(f.canvas),
    pending = surface.present(f.request());
  f.canvas.width = 16;
  expect(f.context.unconfigure).not.toHaveBeenCalled();
  gate.resolve();
  await expect(pending).rejects.toThrow();
  expect(f.context.getCurrentTexture).not.toHaveBeenCalled();
  f.execute.mockImplementation(async (_request, getTexture) => {
    getTexture();
  });
  await expect(surface.present(f.request())).resolves.toBeUndefined();
});
it('detects backing changes inside texture acquisition and after execution', async () => {
  const f = fixture(),
    surface = f.owner.create(f.canvas);
  f.context.getCurrentTexture.mockImplementationOnce(() => {
    f.canvas.width = 16;
    return {} as GPUTexture;
  });
  await expect(surface.present(f.request())).rejects.toThrow();
  f.execute.mockImplementationOnce(async () => {
    f.canvas.width = 32;
  });
  await expect(surface.present(f.request())).rejects.toThrow();
});
it('rolls configure and reservation failures back and permits a later valid request', async () => {
  const f = fixture(),
    surface = f.owner.create(f.canvas);
  f.context.configure.mockImplementationOnce(() => {
    throw new Error('configure');
  });
  await expect(surface.present(f.request())).rejects.toThrow('configure');
  expect(f.owner.allocatedBytes).toBe(0);
  expect(f.releases[0]).toHaveBeenCalledTimes(1);
  f.reserve.mockImplementationOnce(() => {
    throw new Error('reservation');
  });
  await expect(surface.present(f.request())).rejects.toThrow('reservation');
  expect(f.owner.allocatedBytes).toBe(0);
  await expect(surface.present(f.request())).resolves.toBeUndefined();
});
it('enforces actual dimensions and aggregate reservation budget', async () => {
  const f = fixture(3, 300),
    surface = f.owner.create(f.canvas);
  await expect(
    surface.present({ ...f.request(), output: { width: 7, height: 4 } })
  ).rejects.toThrow();
  f.canvas.width = 65;
  await expect(surface.present(f.request())).rejects.toThrow();
  f.canvas.width = 8;
  await surface.present(f.request());
  const secondCanvas = document.createElement('canvas');
  secondCanvas.width = 8;
  secondCanvas.height = 4;
  Object.defineProperty(secondCanvas, 'getContext', { value: vi.fn(() => ({ ...f.context })) });
  const second = f.owner.create(secondCanvas);
  await expect(second.present(f.request())).rejects.toThrow();
  expect(f.owner.allocatedBytes).toBe(256);
  expect(f.execute).toHaveBeenCalledTimes(2);
});
it('permits concurrent different surfaces and notifies idle only after both settle', async () => {
  const f = fixture(),
    gate = deferred<void>();
  const secondCanvas = document.createElement('canvas');
  secondCanvas.width = 8;
  secondCanvas.height = 4;
  Object.defineProperty(secondCanvas, 'getContext', { value: vi.fn(() => ({ ...f.context })) });
  f.execute.mockImplementation(async (_request, getTexture) => {
    getTexture();
    await gate.promise;
  });
  const first = f.owner.create(f.canvas),
    second = f.owner.create(secondCanvas);
  const a = first.present(f.request()),
    b = second.present(f.request());
  expect(f.owner.pending).toBe(2);
  expect(f.owner.allocatedBytes).toBe(512);
  first.dispose();
  second.dispose();
  expect(f.onIdle).not.toHaveBeenCalled();
  gate.resolve();
  await expect(a).rejects.toThrow();
  await expect(b).rejects.toThrow();
  expect(f.owner.allocatedBytes).toBe(0);
  expect(f.onIdle).toHaveBeenCalledTimes(1);
});
it('does not let an obsolete surface release remove a recreated canvas owner', async () => {
  const f = fixture(1),
    first = f.owner.create(f.canvas);
  first.dispose();
  const replacement = f.owner.create(f.canvas);
  await replacement.present(f.request());
  first.dispose();
  expect(() => f.owner.create(f.canvas)).toThrow();
  f.owner.dispose();
  expect(f.owner.allocatedBytes).toBe(0);
});
it('preserves exact execution failure and releases a retired target only after rejection', async () => {
  const f = fixture(),
    gate = deferred<void>(),
    failure = new Error('execution');
  f.execute.mockImplementation(async (_request, getTexture) => {
    getTexture();
    await gate.promise;
  });
  const surface = f.owner.create(f.canvas),
    pending = surface.present(f.request());
  surface.dispose();
  expect(f.releases[0]).not.toHaveBeenCalled();
  gate.reject(failure);
  await expect(pending).rejects.toBe(failure);
  expect(f.owner.allocatedBytes).toBe(0);
  expect(f.releases[0]).toHaveBeenCalledTimes(1);
});
it('refuses an unavailable WebGPU context without another context mode or reservation', () => {
  const f = fixture();
  f.getContext.mockReturnValueOnce(null);
  expect(() => f.owner.create(f.canvas)).toThrow('unavailable');
  expect(f.getContext.mock.calls).toEqual([['webgpu']]);
  expect(f.reserve).not.toHaveBeenCalled();
  expect(f.owner.allocatedBytes).toBe(0);
});

it('rejects nonfinite or invalid capacity and storage limits', () => {
  expect(() => fixture(Number.NaN)).toThrow();
  expect(() => fixture(0)).toThrow();
  expect(() => fixture(2, Number.POSITIVE_INFINITY)).toThrow();
  expect(() => fixture(2, -1)).toThrow();
});
it('configures the destination only when execution acquires its texture', async () => {
  const f = fixture();
  f.execute.mockImplementation(async (_request, getTexture) => {
    expect(f.context.configure).not.toHaveBeenCalled();
    expect(f.reserve).not.toHaveBeenCalled();
    getTexture();
    expect(f.context.configure).toHaveBeenCalledTimes(1);
  });
  await f.owner.create(f.canvas).present(f.request());
});
it('keeps the previous idle output when cancellation precedes deferred texture acquisition', async () => {
  const f = fixture(),
    surface = f.owner.create(f.canvas);
  await surface.present(f.request());
  const gate = deferred<void>(),
    controller = new AbortController();
  f.canvas.width = 16;
  f.execute.mockImplementation(async (_request, getTexture) => {
    await gate.promise;
    getTexture();
  });
  const pending = surface.present(f.request(controller.signal));
  controller.abort();
  expect(f.context.configure).toHaveBeenCalledTimes(1);
  expect(f.context.unconfigure).not.toHaveBeenCalled();
  expect(f.releases[0]).not.toHaveBeenCalled();
  gate.resolve();
  await expect(pending).rejects.toThrow();
  expect(f.context.configure).toHaveBeenCalledTimes(1);
  expect(f.context.unconfigure).not.toHaveBeenCalled();
  expect(f.owner.allocatedBytes).toBe(256);
});
it('rejects execution that reports completion without acquiring a destination', async () => {
  const f = fixture();
  f.execute.mockImplementation(async () => {});
  await expect(f.owner.create(f.canvas).present(f.request())).rejects.toThrow();
  expect(f.reserve).not.toHaveBeenCalled();
});

function offscreenFixture(maximumSurfaces = 3) {
  const f = fixture(maximumSurfaces);
  const getContext = vi.fn<(_mode?: string) => typeof f.context | null>(() => f.context);
  const backing = { width: 8, height: 4, getContext } as unknown as OffscreenCanvas;
  const bitmap = { width: 8, height: 4, close: vi.fn() };
  const snapshot = vi.fn(() => bitmap);
  Object.assign(backing, { transferToImageBitmap: snapshot });
  const createBacking = vi.fn(function (_width: number, _height: number) {
    return backing;
  });
  vi.stubGlobal('OffscreenCanvas', createBacking);
  f.getContext.mockImplementation(() => f.bitmapContext);
  let placeholderWidth = 8,
    placeholderHeight = 4;
  const widthWrite = vi.fn(() => {
    throw new Error('Placeholder width is immutable');
  });
  const heightWrite = vi.fn(() => {
    throw new Error('Placeholder height is immutable');
  });
  Object.defineProperties(f.canvas, {
    width: { get: () => placeholderWidth, set: widthWrite },
    height: { get: () => placeholderHeight, set: heightWrite },
  });
  return {
    ...f,
    backing,
    createBacking,
    bitmap,
    snapshot,
    backingGetContext: getContext,
    widthWrite,
    heightWrite,
    setPlaceholderSize(width: number, height: number) {
      placeholderWidth = width;
      placeholderHeight = height;
    },
  };
}

it('uses one standalone GPU backing and an explicit bitmaprenderer without HTML backing writes', async () => {
  const f = offscreenFixture();
  const surface = f.owner.create(f.canvas, { offscreen: true });
  expect(surface.canvas).toBe(f.canvas);
  expect(f.createBacking).toHaveBeenCalledOnce();
  expect(f.getContext.mock.calls).toEqual([['bitmaprenderer']]);
  expect(f.backingGetContext.mock.calls).toEqual([['webgpu']]);
  expect(f.context.configure).not.toHaveBeenCalled();
  expect(f.reserve).not.toHaveBeenCalled();
  f.execute.mockImplementationOnce(async (_request, getTexture) => {
    expect(f.context.configure).not.toHaveBeenCalled();
    expect(f.reserve).not.toHaveBeenCalled();
    getTexture();
    expect(f.context.configure).toHaveBeenCalledOnce();
  });
  await surface.present(f.request());
  await surface.present(f.request());
  expect(f.context.configure).toHaveBeenCalledOnce();
  expect(f.owner.allocatedBytes).toBe(256);
  surface.dispose();
  expect([f.backing.width, f.backing.height]).toEqual([0, 0]);
  expect(f.widthWrite).not.toHaveBeenCalled();
  expect(f.heightWrite).not.toHaveBeenCalled();
  expect(f.releases[0]).toHaveBeenCalledOnce();
});

it('validates disposed, duplicate, capacity and invalid-size guards before transferring a canvas', () => {
  const f = offscreenFixture(1);
  f.owner.create(f.canvas, { offscreen: true });
  expect(() => f.owner.create(f.canvas, { offscreen: true })).toThrow();
  const other = offscreenFixture();
  expect(() => f.owner.create(other.canvas, { offscreen: true })).toThrow();
  expect(other.createBacking).not.toHaveBeenCalled();
  expect(f.createBacking).toHaveBeenCalledOnce();
  other.owner.dispose();
  expect(() => other.owner.create(other.canvas, { offscreen: true })).toThrow();
  expect(other.createBacking).not.toHaveBeenCalled();
  const invalid = offscreenFixture();
  invalid.setPlaceholderSize(0, 4);
  expect(() => invalid.owner.create(invalid.canvas, { offscreen: true })).toThrow();
  expect(invalid.createBacking).not.toHaveBeenCalled();
  invalid.setPlaceholderSize(65, 4);
  expect(() => invalid.owner.create(invalid.canvas, { offscreen: true })).toThrow();
  expect(invalid.createBacking).not.toHaveBeenCalled();
});

it.each(['missing', 'throwing'] as const)(
  'classifies %s bitmaprenderer support as unavailable without HTML WebGPU or 2D fallback',
  (reason) => {
    const f = offscreenFixture();
    if (reason === 'missing') f.getContext.mockReturnValueOnce(null);
    else
      f.getContext.mockImplementationOnce(() => {
        throw new Error('Bitmap context failed');
      });
    expect(() => f.owner.create(f.canvas, { offscreen: true })).toThrow(GpuPreviewDeviceError);
    expect(f.getContext.mock.calls).toEqual([['bitmaprenderer']]);
    expect([f.backing.width, f.backing.height]).toEqual([0, 0]);
    expect(f.reserve).not.toHaveBeenCalled();
  }
);

it.each(['missing', 'throwing'] as const)(
  'zeros the owned backing after %s context creation before storage admission',
  (reason) => {
    const f = offscreenFixture();
    if (reason === 'missing') f.backingGetContext.mockReturnValueOnce(null);
    else
      f.backingGetContext.mockImplementationOnce(() => {
        throw new Error('Context failed');
      });
    expect(() => f.owner.create(f.canvas, { offscreen: true })).toThrow(GpuPreviewDeviceError);
    expect([f.backing.width, f.backing.height]).toEqual([0, 0]);
    expect(f.reserve).not.toHaveBeenCalled();
    expect(f.widthWrite).not.toHaveBeenCalled();
    expect(f.heightWrite).not.toHaveBeenCalled();
  }
);

it('defers offscreen storage retirement until execution finishes and never writes the placeholder', async () => {
  const f = offscreenFixture(),
    gate = deferred<void>();
  f.execute.mockImplementation(async (_request, getTexture) => {
    getTexture();
    await gate.promise;
  });
  const surface = f.owner.create(f.canvas, { offscreen: true });
  const pending = surface.present(f.request());
  expect(() => surface.releaseImage?.()).toThrow('pending');
  f.owner.dispose();
  expect([f.backing.width, f.backing.height]).toEqual([8, 4]);
  expect(f.context.unconfigure).not.toHaveBeenCalled();
  expect(f.releases[0]).not.toHaveBeenCalled();
  gate.resolve();
  await expect(pending).rejects.toThrow('disposed');
  expect([f.backing.width, f.backing.height]).toEqual([0, 0]);
  expect(f.context.unconfigure).toHaveBeenCalledOnce();
  expect(f.owner.allocatedBytes).toBe(0);
  expect(f.widthWrite).not.toHaveBeenCalled();
  expect(f.heightWrite).not.toHaveBeenCalled();
});

it('checks both frontend and owned GPU dimensions and rejects implicit resize', async () => {
  const f = offscreenFixture();
  const surface = f.owner.create(f.canvas, { offscreen: true });
  f.setPlaceholderSize(16, 8);
  const request = { ...f.request(), output: { width: 8, height: 4 } };
  await expect(surface.present(request)).rejects.toThrow('backing size changed');
  await expect(surface.present({ ...request, output: { width: 16, height: 8 } })).rejects.toThrow();
  expect(f.execute).not.toHaveBeenCalled();
  f.setPlaceholderSize(8, 4);
  await expect(surface.present(request)).resolves.toBeUndefined();
  expect(f.execute).toHaveBeenCalledOnce();
  expect([f.backing.width, f.backing.height]).toEqual([8, 4]);
});

it('transfers the completed GPU image to the frontend before offscreen present resolves', async () => {
  const f = offscreenFixture();
  const bitmap = { close: vi.fn() };
  const snapshot = vi.fn(() => bitmap),
    accept = vi.fn();
  Object.assign(f.backing, { transferToImageBitmap: snapshot });
  f.getContext.mockImplementation(() => ({ transferFromImageBitmap: accept }));
  const surface = f.owner.create(f.canvas, { offscreen: true });
  const gate = deferred<void>();
  f.execute.mockImplementation(async (_request, getTexture) => {
    getTexture();
    await gate.promise;
  });
  const pending = surface.present(f.request());
  expect(snapshot).not.toHaveBeenCalled();
  expect(accept).not.toHaveBeenCalled();
  gate.resolve();
  await pending;
  expect(snapshot).toHaveBeenCalledOnce();
  expect(accept).toHaveBeenCalledExactlyOnceWith(bitmap);
  expect(bitmap.close).toHaveBeenCalledOnce();
});

it('keeps the visible image and its reservation through backend retirement until frontend release', async () => {
  const f = offscreenFixture();
  const surface = f.owner.create(f.canvas, { offscreen: true });
  await surface.present(f.request());
  expect(f.bitmapContext.transferFromImageBitmap).toHaveBeenCalledExactlyOnceWith(f.bitmap);
  f.owner.dispose();
  expect(f.owner.allocatedBytes).toBe(256);
  expect(f.context.unconfigure).not.toHaveBeenCalled();
  expect(f.bitmapContext.transferFromImageBitmap).toHaveBeenCalledTimes(1);
  surface.releaseImage?.();
  surface.releaseImage?.();
  expect(f.bitmapContext.transferFromImageBitmap.mock.calls).toEqual([[f.bitmap], [null]]);
  expect(f.owner.allocatedBytes).toBe(0);
  expect(f.context.unconfigure).toHaveBeenCalledOnce();
  expect([f.backing.width, f.backing.height]).toEqual([0, 0]);
  expect(f.releases[0]).toHaveBeenCalledOnce();
  surface.dispose();
  expect(f.releases[0]).toHaveBeenCalledOnce();
});

it.each(['abort', 'dispose', 'failure'] as const)(
  'never transfers a late GPU image after %s',
  async (reason) => {
    const f = offscreenFixture(),
      gate = deferred<void>(),
      controller = new AbortController();
    const surface = f.owner.create(f.canvas, { offscreen: true });
    f.execute.mockImplementation(async (_request, getTexture) => {
      getTexture();
      await gate.promise;
    });
    const pending = surface.present(f.request(controller.signal));
    if (reason === 'abort') controller.abort();
    if (reason === 'dispose') surface.dispose();
    if (reason === 'failure') gate.reject(new Error('GPU failed'));
    else gate.resolve();
    await expect(pending).rejects.toBeDefined();
    expect(f.snapshot).not.toHaveBeenCalled();
    expect(f.bitmapContext.transferFromImageBitmap).not.toHaveBeenCalled();
    surface.dispose();
    expect(f.owner.allocatedBytes).toBe(0);
  }
);

it('defers frontend image disposal while a subsequent GPU request drains', async () => {
  const f = offscreenFixture(),
    gate = deferred<void>();
  const surface = f.owner.create(f.canvas, { offscreen: true });
  await surface.present(f.request());
  f.execute.mockImplementationOnce(async (_request, getTexture) => {
    getTexture();
    await gate.promise;
  });
  const pending = surface.present(f.request());
  surface.dispose();
  expect(f.bitmapContext.transferFromImageBitmap).toHaveBeenCalledTimes(1);
  expect(f.owner.allocatedBytes).toBe(256);
  gate.resolve();
  await expect(pending).rejects.toThrow('disposed');
  expect(f.snapshot).toHaveBeenCalledOnce();
  expect(f.bitmapContext.transferFromImageBitmap.mock.calls).toEqual([[f.bitmap], [null]]);
  expect(f.owner.allocatedBytes).toBe(0);
});

it('closes a rejected image transfer and preserves reusable GPU storage until surface retirement', async () => {
  const f = offscreenFixture(),
    failure = new Error('Transfer failed');
  f.bitmapContext.transferFromImageBitmap.mockImplementationOnce(() => {
    throw failure;
  });
  const surface = f.owner.create(f.canvas, { offscreen: true });
  await expect(surface.present(f.request())).rejects.toBe(failure);
  expect(f.bitmap.close).toHaveBeenCalledOnce();
  expect(f.owner.pending).toBe(0);
  surface.dispose();
  expect(f.owner.allocatedBytes).toBe(0);
  expect(f.releases[0]).toHaveBeenCalledOnce();
});

it('reports missing standalone OffscreenCanvas support without taking a frontend context', () => {
  const f = offscreenFixture();
  vi.stubGlobal('OffscreenCanvas', undefined);
  expect(() => f.owner.create(f.canvas, { offscreen: true })).toThrow(GpuPreviewDeviceError);
  expect(f.getContext).not.toHaveBeenCalled();
  expect(f.reserve).not.toHaveBeenCalled();
});

it('reuses the bounded idle image without transparent transfers between frontend leases', async () => {
  const f = offscreenFixture();
  const surface = f.owner.create(f.canvas, { offscreen: true });
  await surface.present(f.request());
  surface.releaseImage?.();
  surface.releaseImage?.();
  expect(f.bitmapContext.transferFromImageBitmap.mock.calls).toEqual([[f.bitmap]]);
  expect(f.owner.allocatedBytes).toBe(256);
  expect(f.releases[0]).not.toHaveBeenCalled();
  const next = { width: 8, height: 4, close: vi.fn() };
  f.snapshot.mockReturnValueOnce(next);
  await surface.present(f.request());
  expect(f.bitmapContext.transferFromImageBitmap.mock.calls).toEqual([[f.bitmap], [next]]);
  expect(next.close).toHaveBeenCalledOnce();
  expect(f.reserve).toHaveBeenCalledOnce();
  surface.releaseImage?.();
  f.owner.dispose();
  surface.dispose();
  expect(f.bitmapContext.transferFromImageBitmap.mock.calls).toEqual([[f.bitmap], [next], [null]]);
  expect(f.owner.allocatedBytes).toBe(0);
  expect(f.releases[0]).toHaveBeenCalledOnce();
});

it('clears an idle image on backend retirement only after its next request drains', async () => {
  const f = offscreenFixture(),
    gate = deferred<void>();
  const surface = f.owner.create(f.canvas, { offscreen: true });
  await surface.present(f.request());
  surface.releaseImage?.();
  f.execute.mockImplementationOnce(async (_request, getTexture) => {
    getTexture();
    await gate.promise;
  });
  const pending = surface.present(f.request());
  f.owner.dispose();
  expect(f.bitmapContext.transferFromImageBitmap.mock.calls).toEqual([[f.bitmap]]);
  expect(f.owner.allocatedBytes).toBe(256);
  gate.resolve();
  await expect(pending).rejects.toThrow('disposed');
  expect(f.bitmapContext.transferFromImageBitmap.mock.calls).toEqual([[f.bitmap], [null]]);
  expect(f.owner.allocatedBytes).toBe(0);
  expect(f.context.unconfigure).toHaveBeenCalledOnce();
});

it('retires the retained idle image after a failed replacement without publishing it again', async () => {
  const f = offscreenFixture(),
    failure = new Error('Replacement failed');
  const surface = f.owner.create(f.canvas, { offscreen: true });
  await surface.present(f.request());
  surface.releaseImage?.();
  f.bitmapContext.transferFromImageBitmap.mockImplementationOnce(() => {
    throw failure;
  });
  await expect(surface.present(f.request())).rejects.toBe(failure);
  expect(f.bitmap.close).toHaveBeenCalledTimes(2);
  expect(f.owner.allocatedBytes).toBe(256);
  f.owner.dispose();
  expect(f.bitmapContext.transferFromImageBitmap.mock.calls).toEqual([
    [f.bitmap],
    [f.bitmap],
    [null],
  ]);
  expect(f.owner.allocatedBytes).toBe(0);
});
