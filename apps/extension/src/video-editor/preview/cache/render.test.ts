// @vitest-environment jsdom
import { resolveVideoCompositionFrame } from '../../../features/video/composition/timeline/frame';

import { afterEach, expect, it, vi } from 'vitest';
import {
  createGpuPreviewRenderer,
  GpuPreviewDeviceError,
  type GpuPreviewRenderer,
} from '../../../features/video/composition/canvas/gpu-preview';
import type { GpuPreviewTargetFactory } from '../../../features/video/composition/canvas/preview-presentation';

import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { createVideoPreviewExactFrameCache } from './exact-frame-cache';
import { createVideoPreviewExactFrameRenderer, renderPreviewSceneWithExactCache } from './render';

vi.mock('../../../features/video/composition/canvas/gpu-preview', async (original) => ({
  ...(await original<typeof import('../../../features/video/composition/canvas/gpu-preview')>()),
  createGpuPreviewRenderer: vi.fn(),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.mocked(createGpuPreviewRenderer).mockReset();
});

class FakeImageBitmap implements ImageBitmap {
  readonly close = vi.fn();

  constructor(
    readonly width: number,
    readonly height: number
  ) {}
}

it('presents only an exact cache hit without invoking the renderer', async () => {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const context = { clearRect: vi.fn(), drawImage: vi.fn(), setTransform: vi.fn() };
  Object.defineProperty(canvas, 'getContext', { value: () => context });
  const bitmap = new FakeImageBitmap(1280, 720);
  const cache = createVideoPreviewExactFrameCache(1280 * 720 * 4);
  const acquire = vi.spyOn(cache, 'acquire');
  const presentation = {
    camera: resolveVideoCompositionFrame(createEmptyVideoProject(), 1).camera,
    time: 1,
  };
  cache.set('preview-frame-v1:sha256:revision:30:1280x720:30', bitmap, presentation);
  const render = vi.fn();

  await renderPreviewSceneWithExactCache({
    cache,
    job: {
      canvas,
      currentTime: 1,
      imageBank: {},
      previewMode: 'cache',
      previewRasterSize: { height: 720, width: 1280 },
      project: createEmptyVideoProject('Cache', 1920, 1080),
      renderRevision: Promise.resolve('sha256:revision'),
      stage: null,
      videoRefs: { current: {} },
    },
    render,
  });

  expect(acquire).toHaveBeenCalledWith('preview-frame-v1:sha256:revision:30:1280x720:30');
  expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1280, 720);
  expect(render).not.toHaveBeenCalled();
});

it('does not cache a retained old frame when the renderer defers an unavailable video frame', async () => {
  const capture = vi.fn().mockResolvedValue(new FakeImageBitmap(1280, 720));
  vi.stubGlobal('createImageBitmap', capture);
  try {
    const cache = createVideoPreviewExactFrameCache(1024);
    const set = vi.spyOn(cache, 'set');
    const result = await renderPreviewSceneWithExactCache({
      cache,
      render: vi.fn().mockResolvedValue(false),
      job: {
        canvas: document.createElement('canvas'),
        currentTime: 1,
        imageBank: {},
        previewMode: 'cache',
        previewRasterSize: { width: 1280, height: 720 },
        project: createEmptyVideoProject(),
        renderRevision: Promise.resolve('revision'),
        stage: null,
        videoRefs: { current: {} },
      },
    });
    expect(result).toBe(false);
    expect(capture).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});

it('refuses cached pixels without a camera and retains the newly rendered pose', async () => {
  const canvas = document.createElement('canvas');
  const draw = vi.spyOn(canvas.getContext('2d')!, 'drawImage').mockImplementation(() => {});
  canvas.width = canvas.height = 2;
  const cache = createVideoPreviewExactFrameCache(64);
  const project = createEmptyVideoProject('Camera receipt', 2, 2);
  const presentation = {
    camera: { ...resolveVideoCompositionFrame(project, 1).camera, scale: 2.4, viewportX: 123 },
    time: 1,
  };
  const key = 'preview-frame-v1:revision:30:2x2:30';
  cache.set(key, new FakeImageBitmap(2, 2));
  const render = vi.fn(async () => presentation);
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => new FakeImageBitmap(2, 2))
  );
  try {
    const args = {
      cache,
      render,
      job: {
        canvas,
        currentTime: 1,
        imageBank: {},
        previewMode: 'cache' as const,
        previewRasterSize: { width: 2, height: 2 },
        project,
        renderRevision: Promise.resolve('revision'),
        stage: null,
        videoRefs: { current: {} },
      },
    };
    await expect(renderPreviewSceneWithExactCache(args)).resolves.toBe(presentation);
    expect(cache.getPresentation(key)).toBe(presentation);
    await expect(renderPreviewSceneWithExactCache(args)).resolves.toBe(presentation);
    expect(render).toHaveBeenCalledOnce();
  } finally {
    draw.mockRestore();
    vi.unstubAllGlobals();
  }
});

function gpuCacheFixture() {
  const project = createEmptyVideoProject('GPU cache', 2, 2);
  const canvas = document.createElement('canvas');
  const front = document.createElement('canvas');
  canvas.width = canvas.height = front.width = front.height = 2;
  const release = vi.fn();
  const presentation = {
    camera: resolveVideoCompositionFrame(project, 1).camera,
    time: 1,
    output: { canvas: front, release },
  };
  const cache = createVideoPreviewExactFrameCache(64);
  const job = {
    canvas,
    project,
    currentTime: 1,
    imageBank: {},
    previewMode: 'cache' as const,
    previewRasterSize: { width: 2, height: 2 },
    renderRevision: Promise.resolve('revision'),
    stage: null,
    videoRefs: { current: {} },
  };
  return { cache, job, front, release, presentation };
}

it('captures a completed GPU canvas and keeps its frontend lease for accepted publication', async () => {
  const f = gpuCacheFixture();
  const bitmap = new FakeImageBitmap(2, 2);
  const capture = vi.fn(async (_source: ImageBitmapSource) => bitmap);
  vi.stubGlobal('createImageBitmap', capture);
  try {
    const result = await renderPreviewSceneWithExactCache({
      cache: f.cache,
      job: f.job,
      render: vi.fn(async () => f.presentation),
    });
    expect(capture).toHaveBeenCalledOnce();
    expect(capture.mock.calls[0]![0]).toBe(f.front);
    expect(result).toBe(f.presentation);
    expect(f.release).not.toHaveBeenCalled();
    expect(f.cache.getPresentation('preview-frame-v1:revision:30:2x2:30')?.output).toBeUndefined();
    f.presentation.output.release();
    f.cache.clear();
    expect(bitmap.close).toHaveBeenCalledOnce();
  } finally {
    vi.unstubAllGlobals();
  }
});

it('holds an untransferred GPU output until cancelled snapshot work settles', async () => {
  const f = gpuCacheFixture();
  const controller = new AbortController();
  const snapshot = Promise.withResolvers<ImageBitmap>();
  const bitmap = new FakeImageBitmap(2, 2);
  const capture = vi.fn(() => snapshot.promise);
  vi.stubGlobal('createImageBitmap', capture);
  const set = vi.spyOn(f.cache, 'set');
  try {
    const run = renderPreviewSceneWithExactCache({
      cache: f.cache,
      job: { ...f.job, signal: controller.signal },
      render: vi.fn(async () => f.presentation),
    });
    await vi.waitFor(() => expect(capture).toHaveBeenCalledOnce());
    controller.abort();
    expect(f.release).not.toHaveBeenCalled();
    snapshot.resolve(bitmap);
    expect(await run).toBe(false);
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(f.release).toHaveBeenCalledOnce();
    expect(set).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});

it('borrows cached pixels through GPU use without Canvas publication or a fresh scene render', async () => {
  const f = gpuCacheFixture();
  const bitmap = new FakeImageBitmap(2, 2);
  const metadata = { camera: f.presentation.camera, time: 1 };
  f.cache.set('preview-frame-v1:revision:30:2x2:30', bitmap, metadata);
  const draw = vi.spyOn(f.job.canvas.getContext('2d')!, 'drawImage');
  const render = vi.fn();
  const presentCached = vi.fn(async () => {
    f.cache.clear();
    expect(bitmap.close).not.toHaveBeenCalled();
    return f.presentation;
  });
  const params = { cache: f.cache, job: f.job, render, presentCached };
  const result = await renderPreviewSceneWithExactCache(params);
  expect(presentCached).toHaveBeenCalledExactlyOnceWith(bitmap, metadata, f.job);
  expect(result).toBe(f.presentation);
  expect(draw).not.toHaveBeenCalled();
  expect(render).not.toHaveBeenCalled();
  expect(bitmap.close).toHaveBeenCalledOnce();
  expect(f.release).not.toHaveBeenCalled();
  f.presentation.output.release();
});

function cachedGpuProducerFixture(time = 1) {
  const f = gpuCacheFixture();
  const bitmap = new FakeImageBitmap(2, 2);
  const metadata = { camera: f.presentation.camera, time };
  f.cache.set('preview-frame-v1:revision:30:2x2:30', bitmap, metadata);
  const present = vi.fn(async (_request: Parameters<GpuPreviewRenderer['render']>[0]) => {});
  const backend: GpuPreviewRenderer = {
    allocatedBytes: 0,
    render: vi.fn(),
    dispose: vi.fn(),
  };
  vi.mocked(createGpuPreviewRenderer).mockResolvedValue(backend);
  const acquire = vi.fn<GpuPreviewTargetFactory>(() => ({
    canvas: f.front,
    release: f.release,
    surface: { canvas: f.front, present, dispose: vi.fn() },
  }));
  const job = { ...f.job, acquireGpuOutput: acquire };
  return {
    ...f,
    bitmap,
    metadata,
    present,
    backend,
    acquire,
    job,
    owner: createVideoPreviewExactFrameRenderer(),
    render: vi.fn(),
  };
}

it('publishes cached GPU pixels with the stored camera and keeps the provider until frontend release', async () => {
  vi.stubGlobal('VideoFrame', undefined);
  const f = cachedGpuProducerFixture();
  const draw = vi.spyOn(f.job.canvas.getContext('2d')!, 'drawImage');
  const result = await f.owner.render({ cache: f.cache, job: f.job, render: f.render });
  expect(result).toMatchObject({
    camera: f.metadata.camera,
    time: 1,
    renderer: { backend: 'gpu' },
  });
  expect(result && result.output?.canvas).toBe(f.front);
  expect(f.present.mock.calls[0]![0].layers[0]!.source).toBe(f.bitmap);
  expect(f.present.mock.calls[0]![0].layers[0]!.cache?.revision).toBe(f.bitmap);
  expect(f.backend.render).not.toHaveBeenCalled();
  expect(draw).not.toHaveBeenCalled();
  expect(f.render).not.toHaveBeenCalled();
  f.owner.clear();
  expect(f.backend.dispose).not.toHaveBeenCalled();
  if (result) result.output?.release();
  expect(f.release).toHaveBeenCalledOnce();
  expect(f.backend.dispose).toHaveBeenCalledOnce();
  f.owner.dispose();
  f.cache.clear();
  expect(f.bitmap.close).toHaveBeenCalledOnce();
});

it('pins a cleared cached bitmap through cancelled GPU work and retires its provider after the fence', async () => {
  const f = cachedGpuProducerFixture();
  const controller = new AbortController();
  const fence = Promise.withResolvers<void>();
  f.present.mockReturnValueOnce(fence.promise);
  const run = f.owner.render({
    cache: f.cache,
    job: { ...f.job, signal: controller.signal },
    render: f.render,
  });
  const rejected = expect(run).rejects.toMatchObject({ name: 'AbortError' });
  await vi.waitFor(() => expect(f.present).toHaveBeenCalledOnce());
  f.cache.clear();
  controller.abort();
  f.owner.dispose();
  expect(f.bitmap.close).not.toHaveBeenCalled();
  expect(f.release).not.toHaveBeenCalled();
  expect(f.backend.dispose).not.toHaveBeenCalled();
  fence.resolve();
  await rejected;
  expect(f.bitmap.close).toHaveBeenCalledOnce();
  expect(f.release).toHaveBeenCalledOnce();
  expect(f.backend.dispose).toHaveBeenCalledOnce();
  expect(f.render).not.toHaveBeenCalled();
});

it.each(['unavailable', 'legacy', 'device-failed'] as const)(
  'retains Canvas cache presentation for %s without fresh source rendering',
  async (kind) => {
    const f = cachedGpuProducerFixture();
    const frames = kind === 'unavailable' ? composedFrames() : [];
    if (kind === 'device-failed')
      f.present.mockRejectedValueOnce(new GpuPreviewDeviceError('Device lost'));
    else vi.mocked(createGpuPreviewRenderer).mockResolvedValueOnce(null);
    const draw = vi.spyOn(f.job.canvas.getContext('2d')!, 'drawImage').mockImplementation(() => {});
    const result = await f.owner.render({
      cache: f.cache,
      job: { ...f.job, previewRenderer: kind === 'legacy' ? 'legacy' : 'gpu' },
      render: f.render,
    });
    expect(result).toMatchObject({
      camera: f.metadata.camera,
      time: 1,
      renderer: {
        backend: 'legacy',
        ...(kind === 'legacy' ? {} : { fallback: kind }),
      },
    });
    expect(draw).toHaveBeenCalledOnce();
    expect(f.acquire).toHaveBeenCalledTimes(kind === 'device-failed' ? 1 : 0);
    expect(f.bitmap.close).not.toHaveBeenCalled();
    expect(f.render).not.toHaveBeenCalled();
    expect(createGpuPreviewRenderer).toHaveBeenCalledTimes(kind === 'legacy' ? 0 : 1);
    if (kind === 'unavailable') expect(frames[0]!.close).toHaveBeenCalledOnce();
    f.owner.dispose();
    f.cache.clear();
  }
);

it('releases a failed GPU snapshot result without publishing or caching stale pixels', async () => {
  const f = gpuCacheFixture();
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => {
      throw new Error('Snapshot failed');
    })
  );
  const set = vi.spyOn(f.cache, 'set');
  try {
    await expect(
      renderPreviewSceneWithExactCache({
        cache: f.cache,
        job: f.job,
        render: vi.fn(async () => f.presentation),
      })
    ).rejects.toThrow('Snapshot failed');
    expect(f.release).toHaveBeenCalledOnce();
    expect(set).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});

it('keeps the previous cached GPU front alive while a new raster uses another provider', async () => {
  const f = cachedGpuProducerFixture();
  const first = await f.owner.render({ cache: f.cache, job: f.job, render: f.render });
  const backend: GpuPreviewRenderer = { ...f.backend, dispose: vi.fn() };
  vi.mocked(createGpuPreviewRenderer).mockResolvedValueOnce(backend);
  const nextBitmap = new FakeImageBitmap(4, 2);
  const project = { ...f.job.project, width: 4, height: 2 };
  const camera = resolveVideoCompositionFrame(project, 1).camera;
  f.cache.set('preview-frame-v1:resize:30:4x2:30', nextBitmap, { camera, time: 1 });
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 2;
  const release = vi.fn();
  f.acquire.mockReturnValueOnce({
    canvas,
    release,
    surface: { canvas, present: vi.fn(async () => {}), dispose: vi.fn() },
  });
  const second = await f.owner.render({
    cache: f.cache,
    render: f.render,
    job: {
      ...f.job,
      project,
      previewRasterSize: { width: 4, height: 2 },
      renderRevision: Promise.resolve('resize'),
    },
  });
  expect(second && second.output?.canvas).toBe(canvas);
  expect(second && second.camera).toBe(camera);
  expect(f.acquire.mock.lastCall![0]).toEqual({ width: 4, height: 2 });
  expect(f.backend.dispose).not.toHaveBeenCalled();
  if (first) first.output?.release();
  expect(f.backend.dispose).toHaveBeenCalledOnce();
  f.owner.dispose();
  expect(backend.dispose).not.toHaveBeenCalled();
  if (second) second.output?.release();
  expect(release).toHaveBeenCalledOnce();
  expect(backend.dispose).toHaveBeenCalledOnce();
  f.cache.clear();
});

it('releases an untransferred cached GPU result when cancellation arrives at callback handoff', async () => {
  const f = gpuCacheFixture();
  const controller = new AbortController();
  const bitmap = new FakeImageBitmap(2, 2);
  f.cache.set('preview-frame-v1:revision:30:2x2:30', bitmap, {
    camera: f.presentation.camera,
    time: 1,
  });
  const render = vi.fn();
  const result = await renderPreviewSceneWithExactCache({
    cache: f.cache,
    render,
    job: { ...f.job, signal: controller.signal },
    presentCached: async () => {
      f.cache.clear();
      controller.abort();
      return f.presentation;
    },
  });
  expect(result).toBe(false);
  expect(f.release).toHaveBeenCalledOnce();
  expect(bitmap.close).toHaveBeenCalledOnce();
  expect(render).not.toHaveBeenCalled();
});

function composedFrames() {
  const frames: ComposedFrame[] = [];
  class ComposedFrame {
    readonly close = vi.fn();
    readonly timestamp: number;
    constructor(
      readonly source: ImageBitmap,
      init: VideoFrameInit
    ) {
      this.timestamp = init.timestamp ?? 0;
      frames.push(this);
    }
  }
  vi.stubGlobal('VideoFrame', ComposedFrame);
  return frames;
}

it('submits an owned composed frame at the stored presentation time without a bitmap texture key', async () => {
  const f = cachedGpuProducerFixture(1.0000006);
  const frames = composedFrames();
  const result = await f.owner.render({ cache: f.cache, job: f.job, render: f.render });
  expect(frames).toHaveLength(1);
  expect(frames[0]!.source).toBe(f.bitmap);
  expect(frames[0]!.timestamp).toBe(1000001);
  expect(f.present.mock.calls[0]![0].layers[0]!.source).toBe(frames[0]);
  expect(f.present.mock.calls[0]![0].layers[0]!).not.toHaveProperty('cache');
  expect(frames[0]!.close).toHaveBeenCalledOnce();
  expect([f.bitmap.width, f.bitmap.height]).toEqual([2, 2]);
  expect(f.bitmap.close).not.toHaveBeenCalled();
  if (result) result.output?.release();
  f.owner.dispose();
  f.cache.clear();
});

it.each(['complete', 'cancel', 'scene-error', 'device-error'] as const)(
  'retains composed frame and cached reader through the final GPU fence on %s',
  async (outcome) => {
    const f = cachedGpuProducerFixture();
    const frames = composedFrames();
    const controller = new AbortController();
    const fence = Promise.withResolvers<void>();
    const failure =
      outcome === 'device-error'
        ? new GpuPreviewDeviceError('Device lost')
        : new Error('Scene failed');
    f.present.mockReturnValueOnce(fence.promise);
    vi.spyOn(f.job.canvas.getContext('2d')!, 'drawImage').mockImplementation(() => {});
    const pending = f.owner.render({
      cache: f.cache,
      job: { ...f.job, signal: controller.signal },
      render: f.render,
    });
    const settled =
      outcome === 'cancel'
        ? expect(pending).rejects.toMatchObject({ name: 'AbortError' })
        : outcome === 'scene-error'
          ? expect(pending).rejects.toBe(failure)
          : undefined;
    await vi.waitFor(() => expect(f.present).toHaveBeenCalledOnce());
    expect(frames).toHaveLength(1);
    f.cache.clear();
    if (outcome === 'cancel') {
      controller.abort();
      f.owner.dispose();
    }
    expect(frames[0]!.close).not.toHaveBeenCalled();
    expect(f.bitmap.close).not.toHaveBeenCalled();
    expect(f.release).not.toHaveBeenCalled();
    if (outcome === 'scene-error' || outcome === 'device-error') fence.reject(failure);
    else fence.resolve();
    if (settled) await settled;
    else {
      const result = await pending;
      expect(result && result.renderer?.backend).toBe(
        outcome === 'device-error' ? 'legacy' : 'gpu'
      );
      if (result) result.output?.release();
    }
    expect(frames[0]!.close).toHaveBeenCalledOnce();
    expect(f.bitmap.close).toHaveBeenCalledOnce();
    expect(f.release).toHaveBeenCalledOnce();
    expect(f.render).not.toHaveBeenCalled();
    f.owner.dispose();
  }
);

it.each(['legacy', 'no-target'] as const)(
  'does not construct a frame for %s cache presentation',
  async (route) => {
    const f = cachedGpuProducerFixture();
    const frames = composedFrames();
    vi.spyOn(f.job.canvas.getContext('2d')!, 'drawImage').mockImplementation(() => {});
    const { acquireGpuOutput: _target, ...withoutTarget } = f.job;
    const job =
      route === 'legacy' ? { ...f.job, previewRenderer: 'legacy' as const } : withoutTarget;
    await f.owner.render({ cache: f.cache, job, render: f.render });
    expect(frames).toEqual([]);
    expect(createGpuPreviewRenderer).not.toHaveBeenCalled();
    f.owner.dispose();
    f.cache.clear();
  }
);

it('propagates a composed-frame constructor failure while releasing the cache reader', async () => {
  const f = cachedGpuProducerFixture();
  const failure = new Error('Composed frame constructor failed');
  vi.stubGlobal(
    'VideoFrame',
    class {
      constructor() {
        throw failure;
      }
    }
  );
  await expect(f.owner.render({ cache: f.cache, job: f.job, render: f.render })).rejects.toBe(
    failure
  );
  expect(f.present).not.toHaveBeenCalled();
  expect(f.render).not.toHaveBeenCalled();
  f.owner.dispose();
  f.cache.clear();
  expect(f.bitmap.close).toHaveBeenCalledOnce();
});
