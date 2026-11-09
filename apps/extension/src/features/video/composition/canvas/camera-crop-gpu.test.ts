// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createCameraCropGpuRenderer } from './camera-crop-gpu';
import { DEFAULT_CAMERA_APPEARANCE } from '../../project/camera/appearance';
import { VideoMediaFitMode } from '../../project/types';
import { GpuPreviewDeviceError, type GpuPreviewRenderer } from './gpu-preview';
import * as cameraShape from '../draw/media-shadow';

const owned: ReturnType<typeof createCameraCropGpuRenderer>[] = [];
const captures: { close: ReturnType<typeof vi.fn> }[] = [];
beforeEach(() => {
  captures.length = 0;
  vi.stubGlobal(
    'VideoFrame',
    class {
      close = vi.fn();
      constructor() {
        captures.push(this);
      }
    }
  );
});
afterEach(() => {
  for (const renderer of owned.splice(0)) renderer.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function fixture() {
  const media = document.createElement('video');
  Object.defineProperties(media, {
    readyState: { configurable: true, value: 2 },
    videoWidth: { configurable: true, value: 640 },
    videoHeight: { configurable: true, value: 360 },
  });
  media.currentTime = 1;
  media.src = 'blob:source';
  const context = {
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    drawImage: vi.fn(),
    fillStyle: '',
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D
  );
  const backend = {
    allocatedBytes: 0,
    render: vi.fn<GpuPreviewRenderer['render']>(),
    createSurface: vi.fn<NonNullable<GpuPreviewRenderer['createSurface']>>(),
    dispose: vi.fn(),
  } satisfies GpuPreviewRenderer;
  const createBackend = vi.fn(async (): Promise<GpuPreviewRenderer | null> => backend);
  const renderer = createCameraCropGpuRenderer(createBackend);
  owned.push(renderer);
  const size = { width: 200, height: 150 };
  const targets: { canvas: HTMLCanvasElement; release: ReturnType<typeof vi.fn> }[] = [];
  const present = vi.fn<
    GpuPreviewRenderer['render'] extends (request: infer T) => unknown
      ? (request: T) => Promise<void>
      : never
  >(async () => {});
  const acquire = vi.fn(() => {
    const canvas = document.createElement('canvas'),
      release = vi.fn();
    targets.push({ canvas, release });
    return { canvas, release, surface: { canvas, present, dispose: vi.fn() } };
  });
  const input = {
    media,
    size,
    appearance: { ...DEFAULT_CAMERA_APPEARANCE, zoom: 2, panX: 0.25, panY: -0.5 },
    mirrored: false,
    fitMode: VideoMediaFitMode.COVER,
    signal: new AbortController().signal,
    acquire,
  };
  return {
    media,
    context,
    backend,
    createBackend,
    renderer,
    size,
    targets,
    present,
    acquire,
    input,
  };
}

it.each(['rounded', 'soft', 'ellipse', 'circle'] as const)(
  'uses canonical source and silhouette geometry for %s without rasterizing video',
  async (shape) => {
    const f = fixture();
    const trace = vi.spyOn(cameraShape, 'traceCameraShape');
    const appearance = { ...f.input.appearance, shape, roundness: 25 };
    const output = await f.renderer.render({ ...f.input, appearance });
    if (!output) throw Error('Expected GPU crop');
    expect(f.acquire).toHaveBeenCalledExactlyOnceWith(f.size, f.backend);
    const request = f.present.mock.calls[0]![0],
      layer = request.layers[0]!;
    expect(request.output).toEqual(f.size);
    expect(request.logical).toEqual(f.size);
    expect(request.layers).toHaveLength(1);
    expect(layer.source).toBe(captures[0]);
    expect(layer.inverse).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect(layer.rect).toEqual({
      x: expect.closeTo(shape === 'circle' ? -214.583333333333 : -208.333333333333, 9),
      y: -37.5,
      width: expect.closeTo(533.333333333333, 9),
      height: 300,
    });
    expect(layer.alphaMask?.rect).toEqual({ x: 0, y: 0, ...f.size });
    expect(trace).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      shape === 'circle' ? { x: 25, y: 0, width: 150, height: 150 } : { x: 0, y: 0, ...f.size },
      appearance
    );
    expect(f.context.drawImage).not.toHaveBeenCalled();
    expect(f.backend.render).not.toHaveBeenCalled();
    expect(captures[0]!.close).toHaveBeenCalledOnce();
    expect(f.targets[0]!.release).not.toHaveBeenCalled();
    output.release();
    output.release();
    expect(f.targets[0]!.release).toHaveBeenCalledOnce();
  }
);

it('preserves stretch dimensions and reflects source pixels about the crop window', async () => {
  const f = fixture();
  const output = await f.renderer.render({
    ...f.input,
    mirrored: true,
    fitMode: VideoMediaFitMode.STRETCH,
  });
  if (!output) throw Error('Expected GPU crop');
  const layer = f.present.mock.calls[0]![0].layers[0]!;
  expect(layer.rect).toEqual({ x: -125, y: -37.5, width: 400, height: 300 });
  expect(layer.inverse).toEqual([-1, 0, 200, 0, 1, 0, 0, 0, 1]);
  output.release();
});

it('retains the mask across pan and zoom and replaces only changed silhouette or backing', async () => {
  const f = fixture();
  const trace = vi.spyOn(cameraShape, 'traceCameraShape');
  const first = await f.renderer.render(f.input);
  if (!first) throw Error('Expected GPU crop');
  first.release();
  const second = await f.renderer.render({
    ...f.input,
    appearance: { ...f.input.appearance, zoom: 3, panX: -0.5 },
  });
  if (!second) throw Error('Expected GPU crop');
  second.release();
  const a = f.present.mock.calls[0]![0].layers[0]!.alphaMask;
  const b = f.present.mock.calls[1]![0].layers[0]!.alphaMask;
  expect(a?.source).toBe(b?.source);
  expect(a?.cache).toEqual(b?.cache);
  expect(trace).toHaveBeenCalledOnce();
  const third = await f.renderer.render({
    ...f.input,
    appearance: { ...f.input.appearance, roundness: 75 },
  });
  if (!third) throw Error('Expected GPU crop');
  third.release();
  expect(f.present.mock.calls[2]![0].layers[0]!.alphaMask?.source).not.toBe(a?.source);
  expect(trace).toHaveBeenCalledTimes(2);
  const fourth = await f.renderer.render({ ...f.input, size: { width: 100, height: 75 } });
  if (!fourth) throw Error('Expected GPU crop');
  fourth.release();
  expect(trace).toHaveBeenCalledTimes(3);
  expect(f.createBackend).toHaveBeenCalledOnce();
});

it('retains source until completion and disposed provider through publication', async () => {
  const f = fixture(),
    fence = Promise.withResolvers<void>(),
    began = Promise.withResolvers<void>();
  f.present.mockImplementation(async () => {
    began.resolve();
    await fence.promise;
  });
  const pending = f.renderer.render(f.input);
  await began.promise;
  expect(captures[0]!.close).not.toHaveBeenCalled();
  expect(f.targets[0]!.release).not.toHaveBeenCalled();
  fence.resolve();
  const output = await pending;
  if (!output) throw Error('Expected GPU crop');
  expect(captures[0]!.close).toHaveBeenCalledOnce();
  f.renderer.dispose();
  expect(f.backend.dispose).not.toHaveBeenCalled();
  expect(f.targets[0]!.release).not.toHaveBeenCalled();
  output.release();
  output.release();
  expect(f.backend.dispose).toHaveBeenCalledOnce();
  expect(f.targets[0]!.release).toHaveBeenCalledOnce();
});

it.each(['abort', 'dispose', 'seek', 'clock', 'source'] as const)(
  'releases an obsolete crop after completion on %s',
  async (operation) => {
    const f = fixture(),
      fence = Promise.withResolvers<void>(),
      began = Promise.withResolvers<void>();
    f.present.mockImplementation(async () => {
      began.resolve();
      await fence.promise;
    });
    const controller = new AbortController();
    const pending = f.renderer.render({ ...f.input, signal: controller.signal });
    await began.promise;
    if (operation === 'abort') controller.abort();
    else if (operation === 'dispose') f.renderer.dispose();
    else if (operation === 'seek') Object.defineProperty(f.media, 'seeking', { value: true });
    else if (operation === 'clock') f.media.currentTime = 2;
    else f.media.src = 'blob:replacement';
    expect(f.targets[0]!.release).not.toHaveBeenCalled();
    expect(captures[0]!.close).not.toHaveBeenCalled();
    fence.resolve();
    expect(await pending).toBe(false);
    expect(f.targets[0]!.release).toHaveBeenCalledOnce();
    expect(captures[0]!.close).toHaveBeenCalledOnce();
    if (operation === 'dispose') expect(f.backend.dispose).toHaveBeenCalledOnce();
  }
);

it('refuses overlapping transactions without consuming another source or surface', async () => {
  const f = fixture(),
    fence = Promise.withResolvers<void>(),
    began = Promise.withResolvers<void>();
  f.present.mockImplementation(async () => {
    began.resolve();
    await fence.promise;
  });
  const pending = f.renderer.render(f.input);
  await began.promise;
  await expect(f.renderer.render(f.input)).rejects.toThrow('in flight');
  expect(captures).toHaveLength(1);
  fence.resolve();
  const output = await pending;
  if (output) output.release();
});

it('returns unavailable without capturing source pixels when the GPU backend is absent', async () => {
  const f = fixture();
  f.createBackend.mockResolvedValueOnce(null);
  expect(await f.renderer.render(f.input)).toBeUndefined();
  expect(f.renderer.fallbackReason).toBe('unavailable');
  expect(captures).toHaveLength(0);
  expect(f.acquire).not.toHaveBeenCalled();
});

it('returns device failure fallback after the current transaction settles and preserves a retained front', async () => {
  const f = fixture();
  const previous = await f.renderer.render(f.input);
  if (!previous) throw Error('Expected GPU crop');
  f.present.mockRejectedValueOnce(new GpuPreviewDeviceError('lost'));
  expect(await f.renderer.render(f.input)).toBeUndefined();
  expect(f.renderer.fallbackReason).toBe('device-failed');
  expect(captures[1]!.close).toHaveBeenCalledOnce();
  expect(f.targets[1]!.release).toHaveBeenCalledOnce();
  expect(f.backend.dispose).not.toHaveBeenCalled();
  previous.release();
  expect(f.backend.dispose).toHaveBeenCalledOnce();
});

it('propagates an ordinary scene error and permits a later valid request', async () => {
  const f = fixture(),
    failure = new Error('invalid composition');
  f.present.mockRejectedValueOnce(failure);
  await expect(f.renderer.render(f.input)).rejects.toBe(failure);
  expect(f.targets[0]!.release).toHaveBeenCalledOnce();
  expect(captures[0]!.close).toHaveBeenCalledOnce();
  expect(f.renderer.fallbackReason).toBeUndefined();
  const output = await f.renderer.render(f.input);
  if (!output) throw Error('Expected GPU crop');
  output.release();
});

it('skips aborted or unreadable media before backend setup and rejects invalid output before allocation', async () => {
  const f = fixture(),
    controller = new AbortController();
  controller.abort();
  expect(await f.renderer.render({ ...f.input, signal: controller.signal })).toBe(false);
  Object.defineProperty(f.media, 'readyState', { configurable: true, value: 1 });
  expect(await f.renderer.render(f.input)).toBe(false);
  expect(f.createBackend).not.toHaveBeenCalled();
  Object.defineProperty(f.media, 'readyState', { configurable: true, value: 2 });
  await expect(
    f.renderer.render({ ...f.input, size: { width: 0, height: 150 } })
  ).rejects.toThrow();
  expect(f.acquire).not.toHaveBeenCalled();
});

it('uses the Canvas reserve when the backend cannot create direct surfaces', async () => {
  const f = fixture();
  f.createBackend.mockResolvedValueOnce({
    allocatedBytes: 0,
    render: f.backend.render,
    dispose: f.backend.dispose,
  });
  expect(await f.renderer.render(f.input)).toBeUndefined();
  expect(f.renderer.fallbackReason).toBe('unavailable');
  expect(captures).toHaveLength(0);
  expect(f.acquire).not.toHaveBeenCalled();
  expect(f.backend.dispose).toHaveBeenCalledOnce();
});

it('retires a backend that finishes initialization after disposal without capturing source', async () => {
  const f = fixture(),
    initialization = Promise.withResolvers<GpuPreviewRenderer | null>();
  f.createBackend.mockReturnValueOnce(initialization.promise);
  const pending = f.renderer.render(f.input);
  f.renderer.dispose();
  expect(f.backend.dispose).not.toHaveBeenCalled();
  initialization.resolve(f.backend);
  expect(await pending).toBe(false);
  expect(f.backend.dispose).toHaveBeenCalledOnce();
  expect(captures).toHaveLength(0);
  expect(f.acquire).not.toHaveBeenCalled();
});

it('releases a captured source when silhouette preparation fails without selecting Canvas fallback', async () => {
  const f = fixture();
  vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValueOnce(null);
  await expect(f.renderer.render(f.input)).rejects.toThrow('silhouette');
  expect(captures[0]!.close).toHaveBeenCalledOnce();
  expect(f.acquire).not.toHaveBeenCalled();
  expect(f.renderer.fallbackReason).toBeUndefined();
});

it('prefers an immutable source with its orientation and display dimensions', async () => {
  const f = fixture();
  const frame = new VideoFrame(f.media);
  Object.defineProperty(frame, 'timestamp', { value: 300000 });
  Object.defineProperty(f.media, 'readyState', { value: 1 });
  const source = {
    sourceWidth: 300,
    sourceHeight: 600,
    orientation: { rotation: 90 as const, flip: true },
    toVideoFrame: vi.fn(() => frame),
    draw: vi.fn(),
  };
  const input = { ...f.input, source };
  const output = await f.renderer.render(input);
  expect(source.toVideoFrame).toHaveBeenCalledOnce();
  expect(f.present.mock.calls[0]![0].layers[0]!.rect).toEqual({
    x: -125,
    y: -162.5,
    width: 400,
    height: 800,
  });
  expect(f.present.mock.calls[0]![0].layers[0]).toMatchObject({
    source: frame,
    orientation: source.orientation,
  });
  expect(f.present.mock.calls[0]![0].layers[0]!.source).toHaveProperty('timestamp', 300000);
  expect(captures).toHaveLength(1);
  expect(source.draw).not.toHaveBeenCalled();
  if (output) output.release();
});
