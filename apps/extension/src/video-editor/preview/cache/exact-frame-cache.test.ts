import { expect, it, vi } from 'vitest';

import {
  createVideoPreviewExactFrameCache,
  createVideoPreviewExactFrameKey,
} from './exact-frame-cache';

class FakeImageBitmap implements ImageBitmap {
  readonly close = vi.fn();

  constructor(
    readonly width: number,
    readonly height: number
  ) {}
}

it('keeps exact entries in LRU order and closes evicted bitmaps', () => {
  const cache = createVideoPreviewExactFrameCache(800);
  const first = new FakeImageBitmap(10, 10);
  const second = new FakeImageBitmap(10, 10);
  const third = new FakeImageBitmap(10, 10);
  cache.set('first', first);
  cache.set('second', second);
  expect(cache.get('first')).toBe(first);
  cache.set('third', third);
  expect(second.close).toHaveBeenCalledOnce();
  expect(cache.get('second')).toBeNull();
  expect(cache.byteLength).toBe(800);
});

it('keys frames by revision, raster, and exact canonical frame index', () => {
  expect(
    createVideoPreviewExactFrameKey({
      fps: 30,
      frameIndex: 12,
      height: 720,
      renderRevision: 'sha256:test',
      width: 1280,
    })
  ).toBe('preview-frame-v1:sha256:test:30:1280x720:12');
});

it('retains camera metadata with its bitmap and releases both on eviction or clear', async () => {
  const { resolveVideoCompositionFrame } =
    await import('../../../features/video/composition/timeline/frame');
  const { createEmptyVideoProject } =
    await import('../../../features/video/project/factories/creation');
  const presentation = {
    camera: resolveVideoCompositionFrame(createEmptyVideoProject(), 1).camera,
    time: 1,
  };
  const cache = createVideoPreviewExactFrameCache(400);
  cache.set('one', new FakeImageBitmap(10, 10), presentation);
  expect(cache.getPresentation('one')).toBe(presentation);
  cache.set('two', new FakeImageBitmap(10, 10), presentation);
  expect(cache.getPresentation('one')).toBeNull();
  expect(cache.getPresentation('two')).toBe(presentation);
  cache.clear();
  expect(cache.getPresentation('two')).toBeNull();
});
