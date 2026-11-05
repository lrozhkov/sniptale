// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createGpuPreviewPresentationOwner } from './gpu-preview-presentation';
import { deferred } from './gpu-preview.test-support';

const owners: ReturnType<typeof createGpuPreviewPresentationOwner>[] = [];
afterEach(() => {
  for (const owner of owners.splice(0)) owner.dispose();
  vi.restoreAllMocks();
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
  const getContext = vi.fn<(_mode?: string) => typeof context | null>(() => context);
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
    unavailable: () => new Error('unavailable'),
  });
  owners.push(owner);
  const request = (signal = new AbortController().signal) => ({
    output: { width: canvas.width, height: canvas.height },
    logical: { width: 8, height: 4 },
    layers: [],
    signal,
  });
  return { owner, context, canvas, getContext, reserve, releases, execute, onIdle, request };
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
