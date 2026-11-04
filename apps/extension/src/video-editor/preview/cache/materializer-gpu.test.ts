// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  createGpuPreviewRenderer,
  GpuPreviewDeviceError,
  type GpuPreviewRenderer,
} from '../../../features/video/composition/canvas/gpu-preview';
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
