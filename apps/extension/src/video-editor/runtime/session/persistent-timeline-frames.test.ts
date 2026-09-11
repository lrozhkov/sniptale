import { afterEach, expect, it, vi } from 'vitest';
import {
  loadCachedTimelineFrames,
  createPersistentTimelineFrameLoader,
} from './persistent-timeline-frames';
import type { TimelineThumbnailStore } from '../../../composition/persistence/video-preview-cache/thumbnails';
import type { TimelineVideoFrameLoadPlan } from './timeline-frame-loader';
const token = { databaseInstanceId: 'instance', jobId: 'job' };
const plan: TimelineVideoFrameLoadPlan = {
  projectId: 'project',
  sourceKey: 'source',
  assetUrl: 'blob:source',
  samples: [
    { cacheKey: 'a', sourceTime: 0 },
    { cacheKey: 'b', sourceTime: 2 },
  ],
};
function store() {
  return {
    begin: vi.fn().mockResolvedValue(token),
    load: vi.fn().mockResolvedValue([]),
    commit: vi.fn().mockResolvedValue(undefined),
  } satisfies TimelineThumbnailStore;
}
const blob = new Blob(['webp'], { type: 'image/webp' });
afterEach(() => vi.unstubAllGlobals());
it('restores persisted frames with a new source URL without decoding or rewriting', async () => {
  const cache = store();
  const decode = vi.fn();
  cache.load.mockResolvedValue(
    plan.samples.map((sample) => ({
      ...sample,
      blob,
      projectId: 'project',
      sourceKey: 'source',
      createdAt: 0,
    }))
  );
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:restored') });
  const frames = await loadCachedTimelineFrames(
    { ...plan, assetUrl: 'blob:reopened' },
    cache,
    decode
  );
  expect(frames).toHaveLength(2);
  expect(decode).not.toHaveBeenCalled();
  expect(cache.commit).not.toHaveBeenCalled();
});
it('decodes and commits only misses; storage write failure leaves usable frames', async () => {
  const cache = store();
  cache.load.mockResolvedValue([{ sourceTime: 0, blob }]);
  cache.commit.mockRejectedValue(new Error('quota'));
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:cached') });
  const decode = vi
    .fn()
    .mockResolvedValue([{ cacheKey: 'b', sourceTime: 2, url: 'blob:new', blob }]);
  expect(await loadCachedTimelineFrames(plan, cache, decode)).toEqual([
    { cacheKey: 'a', sourceTime: 0, url: 'blob:cached' },
    { cacheKey: 'b', sourceTime: 2, url: 'blob:new', blob },
  ]);
  expect(decode.mock.calls[0]![0].samples).toEqual([plan.samples[1]]);
  expect(cache.commit.mock.calls[0]![1]).toHaveLength(1);
});
it('decodes when storage is unavailable and discards cancelled decoder results', async () => {
  const cache = store();
  cache.load.mockRejectedValue(new Error('unavailable'));
  cache.begin.mockRejectedValue(new Error('unavailable'));
  const abort = new AbortController();
  const revoke = vi.fn();
  vi.stubGlobal('URL', { revokeObjectURL: revoke });
  const decode = vi.fn().mockImplementation(async () => {
    abort.abort();
    return [{ cacheKey: 'a', sourceTime: 0, url: 'blob:cancelled', blob }];
  });
  expect(await loadCachedTimelineFrames({ ...plan, signal: abort.signal }, cache, decode)).toEqual(
    []
  );
  expect(revoke).toHaveBeenCalledWith('blob:cancelled');
  expect(cache.commit).not.toHaveBeenCalled();
});
it('retains the nonpersistent decoder path for callers without a source identity', async () => {
  const cache = store();
  const decode = vi.fn().mockResolvedValue([]);
  await loadCachedTimelineFrames({ assetUrl: 'blob:x', samples: [] }, cache, decode);
  expect(cache.begin).not.toHaveBeenCalled();
  expect(decode).toHaveBeenCalledOnce();
});

it('does not renew admission for subsequent batches after generation invalidation', async () => {
  const cache = store();
  let generation = token;
  const writes: number[] = [];
  cache.begin.mockImplementation(async () => generation);
  cache.commit.mockImplementation(async (admitted, frames) => {
    if (admitted === generation)
      writes.push(...frames.map((frame: { sourceTime: number }) => frame.sourceTime));
  });
  const decode = vi.fn().mockImplementation(async (batch: TimelineVideoFrameLoadPlan) => {
    if (decode.mock.calls.length === 1)
      generation = { databaseInstanceId: 'erased-generation', jobId: 'new-job' };
    return batch.samples.map((sample) => ({ ...sample, url: 'blob:decoded', blob }));
  });
  const loader = createPersistentTimelineFrameLoader(cache, decode);
  await loader(plan);
  await loader({ ...plan, samples: [{ cacheKey: 'next', sourceTime: 4 }] });
  expect(cache.begin).toHaveBeenCalledTimes(1);
  expect(writes).toEqual([]);
});
