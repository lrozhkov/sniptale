import type { TimelineThumbnailStore } from '../../../composition/persistence/video-preview-cache/thumbnails';
import {
  loadTimelineVideoPreviewFrames,
  type TimelineVideoFrameLoadPlan,
  type TimelineVideoFrameLoadResult,
} from './timeline-frame-loader';

/** One admission for the whole loading session: erasure invalidates every later batch too. */
export function createPersistentTimelineFrameLoader(
  store: TimelineThumbnailStore,
  decode = loadTimelineVideoPreviewFrames
) {
  let admission: ReturnType<TimelineThumbnailStore['begin']> | null = null;
  const sessionStore: TimelineThumbnailStore = {
    ...store,
    begin: () => (admission ??= store.begin()),
  };
  return (plan: TimelineVideoFrameLoadPlan) => loadCachedTimelineFrames(plan, sessionStore, decode);
}

export async function loadCachedTimelineFrames(
  plan: TimelineVideoFrameLoadPlan,
  store: TimelineThumbnailStore,
  decode: typeof loadTimelineVideoPreviewFrames
): Promise<readonly TimelineVideoFrameLoadResult[]> {
  const { projectId, sourceKey } = plan;
  if (!projectId || !sourceKey) return decode(plan);
  const token = await store.begin().catch(() => null);
  const cached = await store
    .load(
      projectId,
      sourceKey,
      plan.samples.map((sample) => sample.sourceTime)
    )
    .catch(() => []);
  if (plan.signal?.aborted) return [];
  const hits = new Map(cached.map((frame) => [frame.sourceTime, frame]));
  const missing = plan.samples.filter((sample) => !hits.has(sample.sourceTime));
  if (plan.signal?.aborted) return [];
  const loaded = missing.length ? await decode({ ...plan, samples: missing }) : [];
  if (plan.signal?.aborted) {
    loaded.forEach((frame) => URL.revokeObjectURL(frame.url));
    return [];
  }
  if (token && loaded.some((frame) => frame.blob)) {
    await store
      .commit(
        token,
        loaded.flatMap((frame) =>
          frame.blob
            ? [
                {
                  projectId,
                  sourceKey,
                  sourceTime: frame.sourceTime,
                  blob: frame.blob,
                  createdAt: Date.now(),
                },
              ]
            : []
        )
      )
      .catch(() => undefined);
  }
  if (plan.signal?.aborted) {
    loaded.forEach((frame) => URL.revokeObjectURL(frame.url));
    return [];
  }
  return plan.samples.flatMap((sample) => {
    const hit = hits.get(sample.sourceTime);
    if (hit) return [{ ...sample, url: URL.createObjectURL(hit.blob) }];
    const generated = loaded.find((frame) => frame.cacheKey === sample.cacheKey);
    return generated ? [generated] : [];
  });
}
