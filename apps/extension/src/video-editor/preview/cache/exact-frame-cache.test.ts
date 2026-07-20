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
