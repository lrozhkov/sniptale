// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';

import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { createVideoPreviewExactFrameCache } from './exact-frame-cache';

const mocks = vi.hoisted(() => ({
  createMaterializer: vi.fn(),
}));

vi.mock('./materializer', async (importOriginal) => {
  const original = await importOriginal<typeof import('./materializer')>();
  const { resolveVideoCompositionFrame } =
    await import('../../../features/video/composition/timeline/frame');
  return {
    ...original,
    createVideoPreviewFrameMaterializer: (
      params: Parameters<typeof original.createVideoPreviewFrameMaterializer>[0]
    ) => {
      const materializer = mocks.createMaterializer(params);
      return {
        ...materializer,
        renderFrameWithPresentation: async (
          time: number,
          signal: AbortSignal,
          camera?: import('../../../features/video/composition/types').VideoCompositionCameraState
        ) => ({
          canvas: await materializer.renderFrame(time, signal),
          presentation: {
            camera: camera ?? resolveVideoCompositionFrame(params.project, time).camera,
            time,
          },
        }),
      };
    },
  };
});

vi.mock('./revision', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./revision')>()),
  createVideoPreviewRenderRevision: vi.fn(() => Promise.resolve(`sha256:${'a'.repeat(64)}`)),
}));

import { buildVideoPreviewCache } from './runtime';

it('keeps the materializer alive until asynchronous frame preparation settles', async () => {
  const project = { ...createEmptyVideoProject('Materializer lifetime', 2, 2), duration: 0 };
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 2;
  let resolveFrame!: (canvas: HTMLCanvasElement) => void;
  const materializer = {
    canvas,
    dispose: vi.fn(),
    renderFrame: vi.fn(
      () =>
        new Promise<HTMLCanvasElement>((resolve) => {
          resolveFrame = resolve;
        })
    ),
  };
  mocks.createMaterializer.mockReturnValue(materializer);
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(() =>
      Promise.resolve({
        close: vi.fn(),
        height: 2,
        width: 2,
      })
    )
  );

  const preparation = buildVideoPreviewCache({
    assetUrls: {},
    cache: createVideoPreviewExactFrameCache(1024),
    onProgress: vi.fn(),
    ownerDocument: document,
    playbackRange: null,
    project,
    rasterSize: { height: 2, width: 2 },
    signal: new AbortController().signal,
  });
  await vi.waitFor(() => expect(materializer.renderFrame).toHaveBeenCalledOnce());

  expect(materializer.dispose).not.toHaveBeenCalled();
  resolveFrame(canvas);
  await expect(preparation).resolves.toMatchObject({ outcome: 'frame-cache-ready' });
  expect(materializer.dispose).toHaveBeenCalledOnce();
});
