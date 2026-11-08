import { expect, it, vi } from 'vitest';

import { resolveVideoCompositionFrame } from '../../../features/video/composition/timeline/frame';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';

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

function createPresentation(time: number) {
  return {
    camera: resolveVideoCompositionFrame(createEmptyVideoProject(), time).camera,
    time,
  };
}

it('stores geometry without retaining or releasing frontend GPU output', () => {
  const cache = createVideoPreviewExactFrameCache(400);
  const output = { canvas: {} as HTMLCanvasElement, release: vi.fn() };
  const presentation = { ...createPresentation(2), output };
  cache.set('frame', new FakeImageBitmap(10, 10), presentation);
  expect(cache.getPresentation('frame')).toEqual(createPresentation(2));
  const lease = cache.acquire('frame');
  expect(lease?.presentation).not.toHaveProperty('output');
  cache.clear();
  lease?.release();
  expect(presentation.output).toBe(output);
  expect(output.release).not.toHaveBeenCalled();
});

it('acquires matching bitmap and geometry and touches LRU order', () => {
  const cache = createVideoPreviewExactFrameCache(800);
  const first = new FakeImageBitmap(10, 10);
  const second = new FakeImageBitmap(10, 10);
  const presentation = createPresentation(2);
  expect(cache.acquire('missing')).toBeNull();
  cache.set('first', first, presentation);
  cache.set('second', second);
  const lease = cache.acquire('first');
  expect(lease?.bitmap).toBe(first);
  expect(lease?.presentation).toBe(presentation);
  cache.set('third', new FakeImageBitmap(10, 10));
  expect(second.close).toHaveBeenCalledOnce();
  expect(first.close).not.toHaveBeenCalled();
  lease?.release();
  cache.clear();
  expect(first.close).toHaveBeenCalledOnce();
});

it('detaches cleared entries immediately but closes only after the final reader', () => {
  const cache = createVideoPreviewExactFrameCache(400);
  const bitmap = new FakeImageBitmap(10, 10);
  cache.set('frame', bitmap);
  const first = cache.acquire('frame');
  const second = cache.acquire('frame');
  expect(first?.presentation).toBeUndefined();
  cache.clear();
  expect(cache.get('frame')).toBeNull();
  expect(cache.getPresentation('frame')).toBeNull();
  expect(cache.acquire('frame')).toBeNull();
  expect(cache.byteLength).toBe(400);
  first?.release();
  first?.release();
  expect(bitmap.close).not.toHaveBeenCalled();
  second?.release();
  second?.release();
  cache.clear();
  expect(bitmap.close).toHaveBeenCalledOnce();
  expect(cache.byteLength).toBe(0);
});

it('keeps replaced entry identity and geometry separate until its reader completes', () => {
  const cache = createVideoPreviewExactFrameCache(800);
  const previous = new FakeImageBitmap(10, 10);
  const current = new FakeImageBitmap(10, 10);
  const presentation = createPresentation(1);
  cache.set('frame', previous, presentation);
  const previousLease = cache.acquire('frame');
  cache.set('frame', current, createPresentation(2));
  const currentLease = cache.acquire('frame');
  expect(previousLease?.bitmap).toBe(previous);
  expect(previousLease?.presentation).toBe(presentation);
  expect(currentLease?.bitmap).toBe(current);
  expect(currentLease?.presentation?.time).toBe(2);
  expect(cache.byteLength).toBe(800);
  previousLease?.release();
  previousLease?.release();
  expect(previous.close).toHaveBeenCalledOnce();
  expect(current.close).not.toHaveBeenCalled();
  expect(cache.byteLength).toBe(400);
  cache.clear();
  currentLease?.release();
  expect(current.close).toHaveBeenCalledOnce();
});

it('refuses admission when an evicted reader still owns the hard byte budget', () => {
  const cache = createVideoPreviewExactFrameCache(400);
  const held = new FakeImageBitmap(10, 10);
  const refused = new FakeImageBitmap(10, 10);
  cache.set('held', held);
  const lease = cache.acquire('held');
  expect(cache.set('incoming', refused)).toBe('capacity-limited');
  expect(cache.get('held')).toBeNull();
  expect(cache.get('incoming')).toBeNull();
  expect(held.close).not.toHaveBeenCalled();
  expect(refused.close).toHaveBeenCalledOnce();
  expect(cache.byteLength).toBe(400);
  lease?.release();
  expect(cache.byteLength).toBe(0);
  expect(cache.set('retry', new FakeImageBitmap(10, 10))).toBe('stored');
});

it('evicts available entries without borrowing bytes from retired readers', () => {
  const cache = createVideoPreviewExactFrameCache(800);
  const retired = new FakeImageBitmap(10, 10);
  const available = new FakeImageBitmap(10, 10);
  cache.set('retired', retired);
  const lease = cache.acquire('retired');
  cache.set('available', available);
  cache.clear();
  expect(available.close).toHaveBeenCalledOnce();
  const admitted = new FakeImageBitmap(10, 10);
  expect(cache.set('admitted', admitted)).toBe('stored');
  const refused = new FakeImageBitmap(20, 10);
  expect(cache.set('large', refused)).toBe('capacity-limited');
  expect(admitted.close).toHaveBeenCalledOnce();
  expect(refused.close).toHaveBeenCalledOnce();
  expect(retired.close).not.toHaveBeenCalled();
  expect(cache.byteLength).toBe(400);
  lease?.release();
  expect(retired.close).toHaveBeenCalledOnce();
});

it('retains a cleared bitmap through controlled asynchronous completion', async () => {
  const cache = createVideoPreviewExactFrameCache(400);
  const bitmap = new FakeImageBitmap(10, 10);
  cache.set('frame', bitmap);
  const lease = cache.acquire('frame');
  let complete: (() => void) | undefined;
  const completion = new Promise<void>((resolve) => {
    complete = resolve;
  });
  const render = completion.finally(() => lease?.release());
  cache.clear();
  expect(bitmap.close).not.toHaveBeenCalled();
  complete?.();
  await render;
  expect(bitmap.close).toHaveBeenCalledOnce();
  expect(cache.byteLength).toBe(0);
});
