// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  createGpuPreviewRenderer,
  GpuPreviewDeviceError,
  type GpuPreviewRenderer,
} from '../../../features/video/composition/canvas/gpu-preview';
import type { GpuPreviewTargetFactory } from '../../../features/video/composition/canvas/preview-presentation';
import { createMaterializerGpuComposer } from './materializer-gpu';
vi.mock('../../../features/video/composition/canvas/gpu-preview', async (original) => ({
  ...(await original<typeof import('../../../features/video/composition/canvas/gpu-preview')>()),
  createGpuPreviewRenderer: vi.fn(),
}));
afterEach(() => vi.resetAllMocks());
function fixture() {
  const bitmap = Object.assign(document.createElement('canvas'), { close: vi.fn() });
  const render = vi.fn<GpuPreviewRenderer['render']>(async () => bitmap);
  const dispose = vi.fn();
  const renderer = { render, dispose, allocatedBytes: 0 };
  vi.mocked(createGpuPreviewRenderer).mockResolvedValue(renderer);
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 2;
  const context = canvas.getContext('2d')!;
  const draw = vi.spyOn(context, 'drawImage');
  let cancelled = false;
  const composer = createMaterializerGpuComposer({ width: 4, height: 2 }, () => cancelled);
  return {
    bitmap,
    render,
    dispose,
    renderer,
    context,
    draw,
    composer,
    cancel: () => {
      cancelled = true;
    },
  };
}
it('paints only after completion, restores caller state and closes the completed bitmap', async () => {
  const f = fixture();
  const fence = Promise.withResolvers<ImageBitmap>();
  f.render.mockReturnValueOnce(fence.promise);
  f.context.globalAlpha = 0.25;
  f.context.globalCompositeOperation = 'destination-over';
  const run = f.composer.compose(f.context, [], new AbortController().signal);
  await vi.waitFor(() => expect(f.render).toHaveBeenCalledOnce());
  expect(f.draw).not.toHaveBeenCalled();
  expect(f.bitmap.close).not.toHaveBeenCalled();
  fence.resolve(f.bitmap);
  expect(await run).toBe(true);
  expect(f.draw).toHaveBeenCalledWith(f.bitmap, 0, 0);
  expect(f.context.globalAlpha).toBe(0.25);
  expect(f.context.globalCompositeOperation).toBe('destination-over');
  expect(f.bitmap.close).toHaveBeenCalledOnce();
  f.composer.dispose();
  await Promise.resolve();
  expect(f.dispose).toHaveBeenCalledOnce();
});
it.each(['abort', 'dispose'] as const)(
  'rejects a completed frame after %s without painting',
  async (reason) => {
    const f = fixture();
    const fence = Promise.withResolvers<ImageBitmap>();
    f.render.mockReturnValueOnce(fence.promise);
    const abort = new AbortController();
    const run = f.composer.compose(f.context, [], abort.signal);
    const rejected = expect(run).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(f.render).toHaveBeenCalledOnce());
    if (reason === 'abort') abort.abort();
    else {
      f.cancel();
      f.composer.dispose();
    }
    fence.resolve(f.bitmap);
    await rejected;
    expect(f.draw).not.toHaveBeenCalled();
    expect(f.bitmap.close).toHaveBeenCalledOnce();
  }
);
it('disposes late initialization and refuses composition after caller disposal', async () => {
  const f = fixture();
  const initialization = Promise.withResolvers<GpuPreviewRenderer | null>();
  vi.mocked(createGpuPreviewRenderer).mockReturnValueOnce(initialization.promise);
  const run = f.composer.compose(f.context, [], new AbortController().signal);
  const rejected = expect(run).rejects.toMatchObject({ name: 'AbortError' });
  f.cancel();
  f.composer.dispose();
  initialization.resolve(f.renderer);
  await rejected;
  expect(f.dispose).toHaveBeenCalledOnce();
  expect(f.render).not.toHaveBeenCalled();
  expect(f.draw).not.toHaveBeenCalled();
});
it('remembers GPU absence without retrying initialization', async () => {
  const f = fixture();
  vi.mocked(createGpuPreviewRenderer).mockResolvedValueOnce(null);
  const signal = new AbortController().signal;
  expect(await f.composer.compose(f.context, [], signal)).toBe(false);
  expect(await f.composer.compose(f.context, [], signal)).toBe(false);
  expect(createGpuPreviewRenderer).toHaveBeenCalledOnce();
  expect(f.draw).not.toHaveBeenCalled();
  f.composer.dispose();
});
it('delegates only device failure and disposes the failed backend', async () => {
  const f = fixture();
  f.render.mockRejectedValueOnce(new GpuPreviewDeviceError('Device lost'));
  const signal = new AbortController().signal;
  expect(await f.composer.compose(f.context, [], signal)).toBe(false);
  expect(await f.composer.compose(f.context, [], signal)).toBe(false);
  expect(f.dispose).toHaveBeenCalledOnce();
  expect(f.draw).not.toHaveBeenCalled();
});
it('propagates planning failure and permits a later successful render', async () => {
  const f = fixture();
  const error = new Error('Invalid composition geometry');
  f.render.mockRejectedValueOnce(error);
  const signal = new AbortController().signal;
  await expect(f.composer.compose(f.context, [], signal)).rejects.toBe(error);
  expect(f.dispose).not.toHaveBeenCalled();
  expect(await f.composer.compose(f.context, [], signal)).toBe(true);
  expect(f.bitmap.close).toHaveBeenCalledOnce();
  f.composer.dispose();
});
it('restores context and closes the bitmap when publication fails', async () => {
  const f = fixture();
  const error = new Error('Canvas lost');
  f.draw.mockImplementationOnce(() => {
    throw error;
  });
  f.context.globalAlpha = 0.5;
  await expect(f.composer.compose(f.context, [], new AbortController().signal)).rejects.toBe(error);
  expect(f.context.globalAlpha).toBe(0.5);
  expect(f.bitmap.close).toHaveBeenCalledOnce();
  f.composer.dispose();
});

it('does not acquire WebGPU for an explicit Standard endpoint composition', async () => {
  const f = fixture();
  const composer = createMaterializerGpuComposer({ width: 4, height: 2 }, () => false, 'legacy');
  expect(await composer.compose(f.context, [], new AbortController().signal)).toBe(false);
  composer.dispose();
  expect(createGpuPreviewRenderer).not.toHaveBeenCalled();
  expect(f.draw).not.toHaveBeenCalled();
});

function presentationFixture() {
  const f = fixture();
  const present = vi.fn(async () => {});
  const release = vi.fn();
  const canvas = document.createElement('canvas');
  const acquire = vi.fn<GpuPreviewTargetFactory>(() => ({
    canvas,
    surface: { canvas, present, dispose: vi.fn() },
    release,
  }));
  return { ...f, present, release, canvas, acquire };
}
it('presents directly without bitmap rendering or Canvas publication and releases exactly once', async () => {
  const f = presentationFixture();
  const signal = new AbortController().signal;
  const layers = [
    {
      source: f.canvas,
      rect: { x: 0, y: 0, width: 4, height: 2 },
      inverse: [1, 0, 0, 0, 1, 0, 0, 0, 1] as const,
    },
  ];
  const output = await f.composer.present(layers, signal, f.acquire);
  expect(f.acquire).toHaveBeenCalledWith({ width: 4, height: 2 }, f.renderer);
  expect(f.present).toHaveBeenCalledWith({
    output: { width: 4, height: 2 },
    logical: { width: 4, height: 2 },
    layers,
    signal,
  });
  expect(output?.canvas).toBe(f.canvas);
  expect(f.render).not.toHaveBeenCalled();
  expect(f.draw).not.toHaveBeenCalled();
  f.composer.dispose();
  expect(f.dispose).not.toHaveBeenCalled();
  output?.release();
  output?.release();
  expect(f.release).toHaveBeenCalledOnce();
  expect(f.dispose).toHaveBeenCalledOnce();
});
it.each(['abort', 'dispose', 'caller'] as const)(
  'retains the target and provider through a pending GPU fence after %s',
  async (reason) => {
    const f = presentationFixture();
    const fence = Promise.withResolvers<void>();
    f.present.mockReturnValueOnce(fence.promise);
    const abort = new AbortController();
    const run = f.composer.present([], abort.signal, f.acquire);
    const rejected = expect(run).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(f.present).toHaveBeenCalledOnce());
    if (reason === 'abort') abort.abort();
    if (reason === 'caller') f.cancel();
    if (reason === 'dispose') f.composer.dispose();
    expect(f.release).not.toHaveBeenCalled();
    expect(f.dispose).not.toHaveBeenCalled();
    fence.resolve();
    await rejected;
    expect(f.release).toHaveBeenCalledOnce();
    f.composer.dispose();
    expect(f.dispose).toHaveBeenCalledOnce();
  }
);
it('retains completed leases when a later surface fails on the device', async () => {
  const f = presentationFixture();
  const signal = new AbortController().signal;
  const output = await f.composer.present([], signal, f.acquire);
  const fence = Promise.withResolvers<void>();
  f.present.mockReturnValueOnce(fence.promise);
  const run = f.composer.present([], signal, f.acquire);
  await vi.waitFor(() => expect(f.present).toHaveBeenCalledTimes(2));
  fence.reject(new GpuPreviewDeviceError('Device lost'));
  expect(await run).toBeUndefined();
  expect(f.composer.fallbackReason).toBe('device-failed');
  expect(f.release).toHaveBeenCalledOnce();
  expect(f.dispose).not.toHaveBeenCalled();
  output?.release();
  expect(f.release).toHaveBeenCalledTimes(2);
  expect(f.dispose).toHaveBeenCalledOnce();
  expect(await f.composer.present([], signal, f.acquire)).toBeUndefined();
  expect(f.acquire).toHaveBeenCalledTimes(2);
});
it('rejects late initialization and new work after disposal without requiring caller cancellation', async () => {
  const f = presentationFixture();
  const initialization = Promise.withResolvers<GpuPreviewRenderer | null>();
  vi.mocked(createGpuPreviewRenderer).mockReturnValueOnce(initialization.promise);
  const signal = new AbortController().signal;
  const run = f.composer.present([], signal, f.acquire);
  const rejected = expect(run).rejects.toMatchObject({ name: 'AbortError' });
  f.composer.dispose();
  initialization.resolve(f.renderer);
  await rejected;
  expect(f.dispose).toHaveBeenCalledOnce();
  expect(f.acquire).not.toHaveBeenCalled();
  await expect(f.composer.present([], signal, f.acquire)).rejects.toMatchObject({
    name: 'AbortError',
  });
  await expect(f.composer.compose(f.context, [], signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(createGpuPreviewRenderer).toHaveBeenCalledOnce();
});
it('remembers missing GPU and skips acquisition in legacy mode', async () => {
  const f = presentationFixture();
  const signal = new AbortController().signal;
  vi.mocked(createGpuPreviewRenderer).mockResolvedValueOnce(null);
  expect(await f.composer.present([], signal, f.acquire)).toBeUndefined();
  expect(await f.composer.present([], signal, f.acquire)).toBeUndefined();
  const legacy = createMaterializerGpuComposer({ width: 4, height: 2 }, () => false, 'legacy');
  expect(await legacy.present([], signal, f.acquire)).toBeUndefined();
  expect(createGpuPreviewRenderer).toHaveBeenCalledOnce();
  expect(f.acquire).not.toHaveBeenCalled();
});
it.each(['planning', 'capacity'] as const)(
  'propagates %s failure and permits retry',
  async (reason) => {
    const f = presentationFixture();
    const error = new Error(reason);
    if (reason === 'capacity')
      f.acquire.mockImplementationOnce(() => {
        throw error;
      });
    else f.present.mockRejectedValueOnce(error);
    const signal = new AbortController().signal;
    await expect(f.composer.present([], signal, f.acquire)).rejects.toBe(error);
    expect(f.release).toHaveBeenCalledTimes(reason === 'capacity' ? 0 : 1);
    expect(f.dispose).not.toHaveBeenCalled();
    const output = await f.composer.present([], signal, f.acquire);
    output?.release();
    f.composer.dispose();
    expect(f.dispose).toHaveBeenCalledOnce();
  }
);

it('retains the backend until both completed output leases end', async () => {
  const f = presentationFixture();
  const signal = new AbortController().signal;
  const first = await f.composer.present([], signal, f.acquire);
  const second = await f.composer.present([], signal, f.acquire);
  f.composer.dispose();
  second?.release();
  expect(f.dispose).not.toHaveBeenCalled();
  first?.release();
  expect(f.dispose).toHaveBeenCalledOnce();
  f.composer.dispose();
  expect(f.dispose).toHaveBeenCalledOnce();
});
it('defers backend disposal during the compatibility bitmap render fence', async () => {
  const f = fixture();
  const fence = Promise.withResolvers<ImageBitmap>();
  f.render.mockReturnValueOnce(fence.promise);
  const run = f.composer.compose(f.context, [], new AbortController().signal);
  const rejected = expect(run).rejects.toMatchObject({ name: 'AbortError' });
  await vi.waitFor(() => expect(f.render).toHaveBeenCalledOnce());
  f.composer.dispose();
  expect(f.dispose).not.toHaveBeenCalled();
  fence.resolve(f.bitmap);
  await rejected;
  expect(f.bitmap.close).toHaveBeenCalledOnce();
  expect(f.dispose).toHaveBeenCalledOnce();
  expect(f.draw).not.toHaveBeenCalled();
});
it('treats GPU device failure during initialization as unavailable', async () => {
  const f = presentationFixture();
  vi.mocked(createGpuPreviewRenderer).mockRejectedValueOnce(new GpuPreviewDeviceError('No device'));
  const signal = new AbortController().signal;
  expect(await f.composer.present([], signal, f.acquire)).toBeUndefined();
  expect(f.composer.fallbackReason).toBe('device-failed');
  expect(await f.composer.present([], signal, f.acquire)).toBeUndefined();
  expect(f.acquire).not.toHaveBeenCalled();
  expect(createGpuPreviewRenderer).toHaveBeenCalledOnce();
});
