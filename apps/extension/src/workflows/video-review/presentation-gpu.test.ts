import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createPresentationGpu } from './presentation-gpu';
import {
  GpuPreviewDeviceError,
  type GpuPreviewRenderer,
} from '../../features/video/composition/canvas/gpu-preview';

function fixture() {
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
  };
  const bitmap = { close: vi.fn() };
  const backend = {
    render: vi.fn<GpuPreviewRenderer['render']>(async () => bitmap as unknown as ImageBitmap),
    dispose: vi.fn(),
    allocatedBytes: 0,
  };
  const create = vi.fn(async () => backend as unknown as GpuPreviewRenderer);
  const owner = createPresentationGpu(create);
  const release = vi.fn();
  const prepare = vi.fn(() => ({ layers: [], release }));
  const request = {
    output: { width: 64, height: 36 },
    context: context as unknown as CanvasRenderingContext2D,
    signal: new AbortController().signal,
    prepare,
  };
  return { context, bitmap, backend, create, owner, release, prepare, request };
}
beforeEach(() => {
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({ reset: vi.fn(), fillRect: vi.fn() }),
    }),
  });
});
afterEach(() => vi.unstubAllGlobals());

it('copies only a completed GPU bitmap and releases its inputs and result exactly once', async () => {
  const f = fixture();
  expect(await f.owner.render(f.request)).toBe(true);
  expect(f.backend.render).toHaveBeenCalledWith(
    expect.objectContaining({
      output: f.request.output,
      logical: f.request.output,
      signal: f.request.signal,
    })
  );
  expect(f.context.drawImage).toHaveBeenCalledWith(f.bitmap, 0, 0);
  expect(f.release).toHaveBeenCalledOnce();
  expect(f.bitmap.close).toHaveBeenCalledOnce();
  f.owner.dispose();
  expect(f.backend.dispose).toHaveBeenCalledOnce();
});

it('builds GPU color layers from one primitive and preserves color alpha and requested opacity', async () => {
  const f = fixture();
  await f.owner.render({
    ...f.request,
    prepare: (primitives) => ({
      layers: [
        primitives.color('#ff000080', 0.25),
        primitives.color('#000000', 0.5),
        primitives.raster(() => undefined),
      ],
      release: f.release,
    }),
  });
  const layers = f.backend.render.mock.calls[0]![0].layers;
  expect(layers[0]).toMatchObject({
    opacity: 0.25,
    tint: [1, 0, 0, 128 / 255],
    rect: { x: 0, y: 0, width: 64, height: 36 },
  });
  expect(layers[1]).toMatchObject({ opacity: 0.5, tint: [0, 0, 0, 1] });
  expect(layers[0]!.source).toBe(layers[1]!.source);
  f.owner.dispose();
});

it.each(['unavailable', 'device'] as const)(
  'permits %s fallback before acquiring source pixels and stays disabled',
  async (kind) => {
    const create = vi.fn(async () => {
      if (kind === 'device') throw new GpuPreviewDeviceError('device');
      return null;
    });
    const f = fixture();
    f.owner.dispose();
    const owner = createPresentationGpu(create);
    expect(await owner.render(f.request)).toBe(false);
    expect(await owner.render(f.request)).toBe(false);
    expect(f.prepare).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledOnce();
    owner.dispose();
  }
);

it('releases a typed failed GPU transaction before permitting legacy retry', async () => {
  const f = fixture();
  f.backend.render.mockRejectedValueOnce(new GpuPreviewDeviceError('device'));
  expect(await f.owner.render(f.request)).toBe(false);
  expect(f.release).toHaveBeenCalledOnce();
  expect(f.backend.dispose).toHaveBeenCalledOnce();
  expect(f.context.drawImage).not.toHaveBeenCalled();
  f.owner.dispose();
});

it('propagates malformed scene errors rather than selecting hardware fallback', async () => {
  const f = fixture();
  f.backend.render.mockRejectedValueOnce(new Error('invalid geometry'));
  await expect(f.owner.render(f.request)).rejects.toThrow('invalid geometry');
  expect(f.release).toHaveBeenCalledOnce();
  expect(f.context.drawImage).not.toHaveBeenCalled();
  f.owner.dispose();
});

it('holds source leases and backend through canceled GPU completion and discards the late bitmap', async () => {
  const f = fixture();
  const controller = new AbortController();
  let complete!: (value: typeof f.bitmap) => void;
  f.backend.render.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = (value) => resolve(value as unknown as ImageBitmap);
      })
  );
  const pending = f.owner.render({ ...f.request, signal: controller.signal });
  await vi.waitFor(() => expect(f.backend.render).toHaveBeenCalledOnce());
  controller.abort();
  f.owner.dispose();
  expect(f.release).not.toHaveBeenCalled();
  expect(f.backend.dispose).not.toHaveBeenCalled();
  complete(f.bitmap);
  await expect(pending).rejects.toThrow();
  expect(f.context.drawImage).not.toHaveBeenCalled();
  expect(f.bitmap.close).toHaveBeenCalledOnce();
  expect(f.release).toHaveBeenCalledOnce();
  expect(f.backend.dispose).toHaveBeenCalledOnce();
});

it('retires a backend that finishes initialization after disposal without acquiring sources', async () => {
  const f = fixture();
  let complete!: (value: GpuPreviewRenderer) => void;
  const owner = createPresentationGpu(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      })
  );
  const controller = new AbortController();
  const pending = owner.render({ ...f.request, signal: controller.signal });
  controller.abort();
  owner.dispose();
  complete(f.backend as unknown as GpuPreviewRenderer);
  await expect(pending).rejects.toThrow();
  expect(f.prepare).not.toHaveBeenCalled();
  expect(f.backend.dispose).toHaveBeenCalledOnce();
});
