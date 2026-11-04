import { resolveVideoCompositionFrame } from '../../../features/video/composition/timeline/frame';
// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { buildExactVideoPreviewFrames } from './build-exact';
import { createVideoPreviewExactFrameCache } from './exact-frame-cache';
import type { FreshVideoPreviewBuildContext } from './runtime-support';

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
