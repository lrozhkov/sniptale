import {
  createVideoPreviewCacheMediaType,
  loadVideoPreviewCacheRecord,
  touchVideoPreviewCacheRecord,
  type VideoPreviewCacheSegment,
} from '../../../composition/persistence/video-preview-cache';
import { buildExactVideoPreviewFrames } from './build-exact';
import { buildPersistentVideoPreview } from './build-persistent';
import { canEncodePersistentVideoPreview } from './encode';
import { createVideoPreviewFrameMaterializer } from './materializer';
import { createVideoPreviewRenderRevision } from './revision';
import { createVideoPreviewCacheSegmentPlan } from './segments';
import {
  createVideoPreviewStorageKey,
  isStoredVideoPreviewCompatible,
  resolveExactFrameCapacity,
  resolveVideoPreviewFrameRange,
  restoreMatchingSegments,
  segmentsToCachedVideo,
  shouldBuildPersistentVideoPreview,
  type FreshVideoPreviewBuildContext,
  type VideoPreviewCacheBuildParams,
  type VideoPreviewCacheBuildResult,
} from './runtime-support';

function canPlayPersistentVideoPreview(): boolean {
  return typeof MediaSource !== 'undefined';
}

async function restorePersistentVideoPreview(params: {
  build: VideoPreviewCacheBuildParams;
  range: ReturnType<typeof resolveVideoPreviewFrameRange>;
  storageKey: string;
}) {
  const plan = await createVideoPreviewCacheSegmentPlan(params.build.project, params.range);
  const stored = await loadVideoPreviewCacheRecord(params.storageKey).catch(() => null);
  const compatible = isStoredVideoPreviewCompatible(stored, {
    project: params.build.project,
    range: params.range,
    rasterSize: params.build.rasterSize,
  })
    ? stored && MediaSource.isTypeSupported(createVideoPreviewCacheMediaType(stored.codec))
      ? stored
      : null
    : null;
  const restored = restoreMatchingSegments(compatible, plan);
  const complete = restored.every(
    (segment): segment is VideoPreviewCacheSegment => segment !== null
  );
  return {
    cachedVideo:
      compatible && complete
        ? segmentsToCachedVideo({
            codec: compatible.codec,
            fps: params.build.project.fps,
            mimeType: compatible.mimeType,
            range: params.range,
            segments: restored,
          })
        : null,
    codec: compatible?.codec ?? null,
    plan,
    restored,
  };
}

function createFreshBuildContext(
  params: VideoPreviewCacheBuildParams,
  range: ReturnType<typeof resolveVideoPreviewFrameRange>,
  renderRevision: string,
  exactFrameCapacity: number
): FreshVideoPreviewBuildContext {
  return {
    exactFrameCapacity,
    materializer: createVideoPreviewFrameMaterializer({
      assetUrls: params.assetUrls,
      ownerDocument: params.ownerDocument,
      project: params.project,
      rasterSize: params.rasterSize,
    }),
    params,
    range,
    renderRevision,
  };
}

export async function buildVideoPreviewCache(
  params: VideoPreviewCacheBuildParams
): Promise<VideoPreviewCacheBuildResult> {
  const range = resolveVideoPreviewFrameRange(params.project, params.playbackRange);
  const renderRevision = await createVideoPreviewRenderRevision(params.project);
  const storageKey = await createVideoPreviewStorageKey({
    project: params.project,
    range,
    rasterSize: params.rasterSize,
  });
  const exactFrameCapacity = resolveExactFrameCapacity(params.rasterSize);
  const persistent = shouldBuildPersistentVideoPreview({
    canPlayPersistentVideo: canPlayPersistentVideoPreview(),
    exactFrameCapacity,
    frameCount: range.endFrame - range.startFrame,
    rasterSize: params.rasterSize,
  });
  const restored = persistent
    ? await restorePersistentVideoPreview({ build: params, range, storageKey })
    : null;
  if (restored?.cachedVideo) {
    void touchVideoPreviewCacheRecord(storageKey).catch(() => undefined);
    return { cachedVideo: restored.cachedVideo, outcome: 'video-cache-ready' };
  }

  const context = createFreshBuildContext(params, range, renderRevision, exactFrameCapacity);
  try {
    const canEncode =
      persistent &&
      (await canEncodePersistentVideoPreview(params.rasterSize.width, params.rasterSize.height));
    return await (canEncode && restored
      ? buildPersistentVideoPreview({ context, ...restored, storageKey })
      : buildExactVideoPreviewFrames(context));
  } finally {
    context.materializer.dispose();
  }
}
