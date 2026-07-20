import {
  VIDEO_PREVIEW_CACHE_MAX_BYTES,
  VIDEO_PREVIEW_CACHE_MIME_TYPE,
  VIDEO_PREVIEW_CACHE_SCHEMA_VERSION,
  VideoPreviewCacheJobInvalidatedError,
  beginVideoPreviewCacheJob,
  cleanupVideoPreviewCache,
  commitVideoPreviewCacheRecord,
  type VideoPreviewCacheRecord,
  type VideoPreviewCacheSegment,
} from '../../../composition/persistence/video-preview-cache';
import { encodePersistentVideoPreview } from './encode';
import type { VideoPreviewCacheSegmentPlanEntry } from './segments';
import {
  cacheExactVideoPreviewFrame,
  hasExactVideoPreviewFrame,
  reportVideoPreviewBuildProgress,
  segmentsToCachedVideo,
  type FreshVideoPreviewBuildContext,
  type VideoPreviewCacheBuildResult,
} from './runtime-support';

interface PersistentBuildState {
  codec: string | null;
  completedFrames: number;
  exactFramesCached: number;
  preparedSegments: VideoPreviewCacheSegment[];
}

class PersistentPreviewCodecMismatchError extends Error {}

function countRestoredFrames(segments: readonly (VideoPreviewCacheSegment | null)[]): number {
  return segments.reduce(
    (total, segment) => total + (segment ? Math.max(0, segment.endFrame - segment.startFrame) : 0),
    0
  );
}

async function renderPersistentSegment(params: {
  context: FreshVideoPreviewBuildContext;
  segment: VideoPreviewCacheSegmentPlanEntry;
  state: PersistentBuildState;
}): Promise<VideoPreviewCacheSegment> {
  const { context, segment, state } = params;
  const encoded = await encodePersistentVideoPreview({
    canvas: context.materializer.canvas,
    endFrame: segment.endFrame,
    fps: context.params.project.fps,
    onFrame: async (frameIndex) => {
      const canvas = await context.materializer.renderFrame(
        frameIndex / context.params.project.fps,
        context.params.signal
      );
      if (
        state.exactFramesCached < context.exactFrameCapacity &&
        (hasExactVideoPreviewFrame(context, frameIndex) ||
          (await cacheExactVideoPreviewFrame(context, frameIndex, canvas)))
      ) {
        state.exactFramesCached += 1;
      }
      state.completedFrames += 1;
      reportVideoPreviewBuildProgress(context, 'preparing-video-cache', state.completedFrames);
    },
    signal: context.params.signal,
    startFrame: segment.startFrame,
  });
  if (state.codec && state.codec !== encoded.codec) {
    throw new PersistentPreviewCodecMismatchError();
  }
  state.codec = encoded.codec;
  return { ...segment, blob: encoded.blob };
}

async function buildPersistentSegments(params: {
  context: FreshVideoPreviewBuildContext;
  plan: readonly VideoPreviewCacheSegmentPlanEntry[];
  restored: readonly (VideoPreviewCacheSegment | null)[];
  state: PersistentBuildState;
  storageKey: string;
  token: Awaited<ReturnType<typeof beginVideoPreviewCacheJob>> | null;
}): Promise<'complete' | 'invalidated' | 'capacity-limited'> {
  for (const segment of params.plan) {
    const restored = params.restored[segment.index];
    if (restored) {
      params.state.preparedSegments.push(restored);
      continue;
    }
    params.state.preparedSegments.push(
      await renderPersistentSegment({
        context: params.context,
        segment,
        state: params.state,
      })
    );
    const partialRecord = createPersistentRecord(params.context, params.storageKey, params.state);
    if (partialRecord.byteLength > VIDEO_PREVIEW_CACHE_MAX_BYTES) return 'capacity-limited';
    if ((await commitPersistentRecord(partialRecord, params.token)) === 'invalidated') {
      return 'invalidated';
    }
  }
  return 'complete';
}

function createPersistentRecord(
  context: FreshVideoPreviewBuildContext,
  storageKey: string,
  state: PersistentBuildState
): VideoPreviewCacheRecord {
  const now = Date.now();
  const { project } = context.params;
  if (!state.codec) throw new Error('Persistent preview codec identity is unavailable');
  return {
    byteLength: state.preparedSegments.reduce((total, segment) => total + segment.blob.size, 0),
    codec: state.codec,
    contentRevision: context.renderRevision,
    createdAt: now,
    fps: project.fps,
    height: context.params.rasterSize.height,
    lastAccessedAt: now,
    mimeType: VIDEO_PREVIEW_CACHE_MIME_TYPE,
    projectId: project.id,
    range: context.range,
    schemaVersion: VIDEO_PREVIEW_CACHE_SCHEMA_VERSION,
    segments: state.preparedSegments,
    storageKey,
    width: context.params.rasterSize.width,
  };
}

function capacityLimitedResult(
  context: FreshVideoPreviewBuildContext,
  state: PersistentBuildState
): VideoPreviewCacheBuildResult {
  const totalFrames = context.range.endFrame - context.range.startFrame;
  return {
    cachedVideo: null,
    outcome: state.exactFramesCached === totalFrames ? 'frame-cache-ready' : 'capacity-limited',
  };
}

async function commitPersistentRecord(
  record: VideoPreviewCacheRecord,
  token: Awaited<ReturnType<typeof beginVideoPreviewCacheJob>> | null
): Promise<'committed' | 'invalidated' | 'skipped'> {
  if (!token) return 'skipped';
  try {
    await commitVideoPreviewCacheRecord(token, record);
    return 'committed';
  } catch (error) {
    if (error instanceof VideoPreviewCacheJobInvalidatedError) return 'invalidated';
    return 'skipped';
  }
}

function createPersistentBuildState(
  codec: string | null,
  restored: readonly (VideoPreviewCacheSegment | null)[]
): PersistentBuildState {
  return {
    codec,
    completedFrames: countRestoredFrames(restored),
    exactFramesCached: 0,
    preparedSegments: [],
  };
}

async function buildSegmentsWithCodecRecovery(params: {
  codec: string | null;
  context: FreshVideoPreviewBuildContext;
  plan: readonly VideoPreviewCacheSegmentPlanEntry[];
  restored: readonly (VideoPreviewCacheSegment | null)[];
  storageKey: string;
  token: Awaited<ReturnType<typeof beginVideoPreviewCacheJob>> | null;
}): Promise<{
  state: PersistentBuildState;
  status: Awaited<ReturnType<typeof buildPersistentSegments>>;
}> {
  let state = createPersistentBuildState(params.codec, params.restored);
  reportVideoPreviewBuildProgress(params.context, 'preparing-video-cache', state.completedFrames);
  try {
    const status = await buildPersistentSegments({ ...params, state });
    return { state, status };
  } catch (error) {
    if (
      !(error instanceof PersistentPreviewCodecMismatchError) ||
      !params.restored.some((segment) => segment !== null)
    ) {
      throw error;
    }
  }
  const exactFramesCached = state.exactFramesCached;
  state = createPersistentBuildState(
    null,
    params.plan.map(() => null)
  );
  state.exactFramesCached = exactFramesCached;
  reportVideoPreviewBuildProgress(params.context, 'preparing-video-cache', 0);
  const status = await buildPersistentSegments({
    ...params,
    restored: params.plan.map(() => null),
    state,
  });
  return { state, status };
}

export async function buildPersistentVideoPreview(params: {
  codec: string | null;
  context: FreshVideoPreviewBuildContext;
  plan: readonly VideoPreviewCacheSegmentPlanEntry[];
  restored: readonly (VideoPreviewCacheSegment | null)[];
  storageKey: string;
}): Promise<VideoPreviewCacheBuildResult> {
  const token = await beginVideoPreviewCacheJob().catch(() => null);
  const { state, status } = await buildSegmentsWithCodecRecovery({ ...params, token });
  if (status !== 'complete') return capacityLimitedResult(params.context, state);
  const record = createPersistentRecord(params.context, params.storageKey, state);
  if (record.byteLength > VIDEO_PREVIEW_CACHE_MAX_BYTES) {
    return capacityLimitedResult(params.context, state);
  }
  if ((await commitPersistentRecord(record, token)) === 'invalidated') {
    return capacityLimitedResult(params.context, state);
  }
  void cleanupVideoPreviewCache().catch(() => undefined);
  const cachedVideo = segmentsToCachedVideo({
    codec: record.codec,
    fps: params.context.params.project.fps,
    mimeType: record.mimeType,
    range: params.context.range,
    segments: state.preparedSegments,
  });
  return {
    cachedVideo,
    outcome: cachedVideo ? 'video-cache-ready' : 'unavailable',
  };
}
