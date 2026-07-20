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
