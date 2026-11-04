import { resolveVideoCompositionFrame } from '../../../features/video/composition/timeline/frame';
// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';

import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { createVideoPreviewExactFrameCache } from './exact-frame-cache';
import { renderPreviewSceneWithExactCache } from './render';

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
  const cache = createVideoPreviewExactFrameCache(1024);
  vi.spyOn(cache, 'get').mockReturnValue(bitmap);
  const presentation = {
    camera: resolveVideoCompositionFrame(createEmptyVideoProject(), 1).camera,
    time: 1,
  };
  vi.spyOn(cache, 'getPresentation').mockReturnValue(presentation);
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

  expect(cache.get).toHaveBeenCalledWith('preview-frame-v1:sha256:revision:30:1280x720:30');
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
