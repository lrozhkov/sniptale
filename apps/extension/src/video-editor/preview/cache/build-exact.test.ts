import { resolveVideoCompositionFrame } from '../../../features/video/composition/timeline/frame';
// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { buildExactVideoPreviewFrames } from './build-exact';
import { createVideoPreviewExactFrameCache } from './exact-frame-cache';
import { cacheExactVideoPreviewFrame, type FreshVideoPreviewBuildContext } from './runtime-support';

const gpuOutputs = vi.hoisted(() => ({ acquire: vi.fn(), dispose: vi.fn() }));
const createGpuOutputs = vi.hoisted(() => vi.fn());
vi.mock('./materializer-gpu-outputs', () => ({
  createMaterializerGpuOutputs: createGpuOutputs,
}));

function createContext(
  renderFrame: FreshVideoPreviewBuildContext['materializer']['renderFrame'],
  cache: FreshVideoPreviewBuildContext['params']['cache']
): FreshVideoPreviewBuildContext {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 2;
  const project = { ...createEmptyVideoProject('Exact resume', 2, 2), duration: 0.1, fps: 10 };
  return {
    exactFrameCapacity: 2,
    materializer: {
      canvas,
      dispose: vi.fn(),
      updateProject: () => false,
      renderFrame,
      renderFrameWithPresentation: async (time, signal) => ({
        canvas: await renderFrame(time, signal),
        presentation: { camera: resolveVideoCompositionFrame(project, time).camera, time },
      }),
    },
    params: {
      assetUrls: {},
      cache,
      onProgress: vi.fn(),
      ownerDocument: document,
      playbackRange: null,
      project,
      rasterSize: { height: 2, width: 2 },
      signal: new AbortController().signal,
    },
    range: { endFrame: 2, startFrame: 0 },
    renderRevision: `sha256:${'a'.repeat(64)}`,
  };
}

beforeEach(() => {
  createGpuOutputs.mockReset().mockReturnValue(gpuOutputs);
  gpuOutputs.dispose.mockReset();
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(() => Promise.resolve({ close: vi.fn(), height: 2, width: 2 }))
  );
});

it('preserves completed exact frames across cancellation and resumes at the missing terminal frame', async () => {
  const cache = createVideoPreviewExactFrameCache(32);
  const firstCanvas = document.createElement('canvas');
  const firstRender = vi
    .fn()
    .mockResolvedValueOnce(firstCanvas)
    .mockRejectedValueOnce(new DOMException('paused', 'AbortError'));

  await expect(buildExactVideoPreviewFrames(createContext(firstRender, cache))).rejects.toThrow(
    'paused'
  );

  const resumedRender = vi.fn(async () => document.createElement('canvas'));
  await expect(
    buildExactVideoPreviewFrames(createContext(resumedRender, cache))
  ).resolves.toMatchObject({ outcome: 'frame-cache-ready' });
  expect(resumedRender).toHaveBeenCalledOnce();
  expect(resumedRender).toHaveBeenCalledWith(0.1, expect.any(AbortSignal));
});

it('stores the materialized camera with a warm exact frame', async () => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 2;
  const cache = createVideoPreviewExactFrameCache(32);
  const context = createContext(async () => canvas, cache);
  const presentation = {
    camera: {
      ...resolveVideoCompositionFrame(context.params.project, 0).camera,
      viewportX: 123,
      scale: 2.4,
    },
    time: 0,
  };
  context.materializer.renderFrameWithPresentation = vi.fn(async (time) => ({
    canvas,
    presentation: { ...presentation, time },
  }));
  await buildExactVideoPreviewFrames(context);
  const key = 'preview-frame-v1:' + context.renderRevision + ':10:2x2:0';
  expect(cache.getPresentation(key)).toEqual(presentation);
});

it.each([undefined, 'gpu'] as const)(
  'acquires private GPU output for the %s renderer and disposes it after capture',
  async (previewRenderer) => {
    const context = createContext(vi.fn(), createVideoPreviewExactFrameCache(32));
    if (previewRenderer === undefined) delete context.params.previewRenderer;
    else context.params.previewRenderer = previewRenderer;
    context.range.endFrame = 1;
    const output = { canvas: document.createElement('canvas'), release: vi.fn() };
    const bitmap = { close: vi.fn(), height: 2, width: 2 };
    let complete!: (value: ImageBitmap) => void;
    vi.mocked(createImageBitmap).mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        })
    );
    const render = vi.fn(async () => ({
      canvas: context.materializer.canvas,
      presentation: {
        camera: resolveVideoCompositionFrame(context.params.project, 0).camera,
        time: 0,
        output,
      },
    }));
    context.materializer.renderFrameWithPresentation = render;
    const build = buildExactVideoPreviewFrames(context);
    await vi.waitFor(() => expect(createImageBitmap).toHaveBeenCalledOnce());
    expect(render).toHaveBeenCalledWith(0, context.params.signal, undefined, gpuOutputs.acquire);
    expect(createGpuOutputs).toHaveBeenCalledWith(document);
    expect(createImageBitmap).toHaveBeenCalledWith(output.canvas);
    expect(output.release).not.toHaveBeenCalled();
    expect(gpuOutputs.dispose).not.toHaveBeenCalled();
    complete(bitmap as unknown as ImageBitmap);
    await expect(build).resolves.toMatchObject({ outcome: 'frame-cache-ready' });
    expect(output.release).toHaveBeenCalledOnce();
    expect(gpuOutputs.dispose).toHaveBeenCalledOnce();
    expect(output.release.mock.invocationCallOrder[0]).toBeLessThan(
      gpuOutputs.dispose.mock.invocationCallOrder[0]!
    );
  }
);

it('does not acquire GPU output for explicit Legacy', async () => {
  const context = createContext(vi.fn(), createVideoPreviewExactFrameCache(32));
  context.params.previewRenderer = 'legacy';
  const render = vi.fn(async () => ({
    canvas: context.materializer.canvas,
    presentation: {
      camera: resolveVideoCompositionFrame(context.params.project, 0).camera,
      time: 0,
    },
  }));
  context.materializer.renderFrameWithPresentation = render;
  await buildExactVideoPreviewFrames(context);
  expect(render).toHaveBeenCalledWith(0, context.params.signal, undefined, undefined);
  expect(createGpuOutputs).not.toHaveBeenCalled();
});

it('disposes private GPU outputs after materialization fails', async () => {
  const context = createContext(vi.fn(), createVideoPreviewExactFrameCache(32));
  context.materializer.renderFrameWithPresentation = vi
    .fn()
    .mockRejectedValue(new Error('render failed'));
  await expect(buildExactVideoPreviewFrames(context)).rejects.toThrow('render failed');
  expect(gpuOutputs.dispose).toHaveBeenCalledOnce();
});

function createOutputFrame(context: FreshVideoPreviewBuildContext) {
  return {
    canvas: context.materializer.canvas,
    presentation: {
      camera: resolveVideoCompositionFrame(context.params.project, 0).camera,
      time: 0,
      output: { canvas: document.createElement('canvas'), release: vi.fn() },
    },
  };
}

it('drains a late GPU capture before aborting without a stale cache write', async () => {
  const context = createContext(vi.fn(), createVideoPreviewExactFrameCache(32));
  const controller = new AbortController();
  context.params.signal = controller.signal;
  const frame = createOutputFrame(context);
  const bitmap = { close: vi.fn(), height: 2, width: 2 };
  let complete!: (value: ImageBitmap) => void;
  vi.mocked(createImageBitmap).mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      })
  );
  const capture = cacheExactVideoPreviewFrame(context, 0, frame);
  controller.abort();
  expect(frame.presentation.output.release).not.toHaveBeenCalled();
  complete(bitmap as unknown as ImageBitmap);
  await expect(capture).rejects.toMatchObject({ name: 'AbortError' });
  expect(context.params.cache.byteLength).toBe(0);
  expect(bitmap.close).toHaveBeenCalledOnce();
  expect(frame.presentation.output.release).toHaveBeenCalledOnce();
});

it.each(['missing', 'failed', 'sync-failed', 'capacity'] as const)(
  'releases GPU output when snapshot is %s',
  async (failure) => {
    const context = createContext(vi.fn(), createVideoPreviewExactFrameCache(1));
    const frame = createOutputFrame(context);
    const bitmap = { close: vi.fn(), height: 2, width: 2 };
    if (failure === 'missing') vi.stubGlobal('createImageBitmap', undefined);
    else if (failure === 'failed')
      vi.mocked(createImageBitmap).mockRejectedValue(new Error('snapshot failed'));
    else if (failure === 'sync-failed')
      vi.mocked(createImageBitmap).mockImplementation(() => {
        throw new Error('snapshot failed');
      });
    else vi.mocked(createImageBitmap).mockResolvedValue(bitmap as unknown as ImageBitmap);
    const capture = cacheExactVideoPreviewFrame(context, 0, frame);
    if (failure === 'failed' || failure === 'sync-failed')
      await expect(capture).rejects.toThrow('snapshot failed');
    else await expect(capture).resolves.toBe(false);
    expect(frame.presentation.output.release).toHaveBeenCalledOnce();
    expect(context.params.cache.byteLength).toBe(0);
    if (failure === 'capacity') expect(bitmap.close).toHaveBeenCalledOnce();
  }
);

it('reports resident capacity after a cleared borrowed frame forces a newly built frame out', async () => {
  const cache = createVideoPreviewExactFrameCache(32);
  const old = { close: vi.fn(), height: 2, width: 2 };
  const first = { close: vi.fn(), height: 2, width: 2 };
  const last = { close: vi.fn(), height: 2, width: 2 };
  cache.set('old', old as unknown as ImageBitmap);
  const borrowed = cache.acquire('old');
  expect(borrowed).not.toBeNull();
  cache.clear();
  expect(old.close).not.toHaveBeenCalled();
  expect(cache.byteLength).toBe(16);
  vi.mocked(createImageBitmap)
    .mockResolvedValueOnce(first as unknown as ImageBitmap)
    .mockResolvedValueOnce(last as unknown as ImageBitmap);
  const context = createContext(async () => document.createElement('canvas'), cache);
  const result = await buildExactVideoPreviewFrames(context);
  const key = 'preview-frame-v1:' + context.renderRevision + ':10:2x2:';
  expect(cache.get(key + '0')).toBeNull();
  expect(cache.get(key + '1')).toBe(last);
  expect(first.close).toHaveBeenCalledOnce();
  expect(last.close).not.toHaveBeenCalled();
  expect(cache.byteLength).toBe(32);
  borrowed?.release();
  expect(old.close).toHaveBeenCalledOnce();
  expect(cache.byteLength).toBe(16);
  expect(cache.get(key + '1')).toBe(last);
  expect(last.close).not.toHaveBeenCalled();
  expect(result.outcome).toBe('capacity-limited');
});
