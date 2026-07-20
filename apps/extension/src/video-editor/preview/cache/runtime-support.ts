import { createSha256Digest } from '@sniptale/platform/security/digest';

import type {
  VideoPreviewCacheRecord,
  VideoPreviewCacheSegment,
} from '../../../composition/persistence/video-preview-cache';
import { VIDEO_PREVIEW_CACHE_SCHEMA_VERSION } from '../../../composition/persistence/video-preview-cache';
import type { VideoProject } from '../../../features/video/project/types';
import type {
  VideoEditorPreviewPhase,
  VideoEditorPreviewPrepareOutcome,
} from '../../contracts/preview-runtime';
import type { VideoEditorPlaybackRange } from '../../interaction/playback/range';
import type { VideoEditorPreviewRasterSize } from '../stage/sizing/raster';
import {
  VIDEO_PREVIEW_EXACT_FRAME_CACHE_MAX_BYTES,
  createVideoPreviewExactFrameKey,
  type VideoPreviewExactFrameCache,
} from './exact-frame-cache';
import type { VideoPreviewFrameMaterializer } from './materializer';
import type { VideoPreviewCacheSegmentPlanEntry } from './segments';
import type { PreparedCachedVideoPreview } from './types';

const FULL_HD_PIXELS = 1920 * 1080;

export interface VideoPreviewCacheBuildResult {
  cachedVideo: PreparedCachedVideoPreview | null;
  outcome: Exclude<VideoEditorPreviewPrepareOutcome, 'cancelled' | 'live-ready'>;
}

export interface VideoPreviewCacheBuildParams {
  assetUrls: Record<string, string>;
  cache: VideoPreviewExactFrameCache;
  onProgress: (phase: VideoEditorPreviewPhase, completed: number, total: number) => void;
  ownerDocument: Document;
  playbackRange: VideoEditorPlaybackRange | null;
  project: VideoProject;
  rasterSize: VideoEditorPreviewRasterSize;
  signal: AbortSignal;
}

interface VideoPreviewCacheFrameRange {
  endFrame: number;
  startFrame: number;
}

export interface FreshVideoPreviewBuildContext {
  exactFrameCapacity: number;
  materializer: VideoPreviewFrameMaterializer;
  params: VideoPreviewCacheBuildParams;
  range: VideoPreviewCacheFrameRange;
  renderRevision: string;
}

export function resolveVideoPreviewFrameRange(
  project: VideoProject,
  range: VideoEditorPlaybackRange | null
): VideoPreviewCacheFrameRange {
  const start = Math.max(0, range?.start ?? 0);
  const end = Math.min(project.duration, range?.end ?? project.duration);
  const startFrame = Math.max(0, Math.round(start * project.fps));
  return {
    endFrame: Math.max(startFrame + 1, Math.round(end * project.fps) + 1),
    startFrame,
  };
}

export async function createVideoPreviewStorageKey(params: {
  project: VideoProject;
  range: VideoPreviewCacheFrameRange;
  rasterSize: VideoEditorPreviewRasterSize;
}): Promise<string> {
  return createSha256Digest(
    JSON.stringify({
      fps: params.project.fps,
      height: params.rasterSize.height,
      projectId: params.project.id,
      range: params.range,
      schemaVersion: VIDEO_PREVIEW_CACHE_SCHEMA_VERSION,
      width: params.rasterSize.width,
    })
  );
}

export function resolveExactFrameCapacity(rasterSize: VideoEditorPreviewRasterSize): number {
  const byteLength = rasterSize.width * rasterSize.height * 4;
  return Math.floor(VIDEO_PREVIEW_EXACT_FRAME_CACHE_MAX_BYTES / byteLength);
}

export function shouldBuildPersistentVideoPreview(params: {
  canPlayPersistentVideo: boolean;
  exactFrameCapacity: number;
  frameCount: number;
  rasterSize: VideoEditorPreviewRasterSize;
}): boolean {
  if (!params.canPlayPersistentVideo) return false;
  const rasterPixels = params.rasterSize.width * params.rasterSize.height;
  return rasterPixels > FULL_HD_PIXELS || params.frameCount > params.exactFrameCapacity;
}

export function segmentsToCachedVideo(params: {
  codec: string;
  fps: number;
  mimeType: string;
  range: VideoPreviewCacheFrameRange;
  segments: readonly VideoPreviewCacheSegment[];
}): PreparedCachedVideoPreview | null {
  if (params.segments.length === 0) return null;
  const sorted = params.segments.toSorted((left, right) => left.index - right.index);
  let nextFrame = params.range.startFrame;
  for (const segment of sorted) {
    if (segment.startFrame !== nextFrame) return null;
    nextFrame = segment.endFrame;
  }
  if (nextFrame !== params.range.endFrame) return null;
  return {
    codec: params.codec,
    endTime: Math.max(params.range.startFrame, params.range.endFrame - 1) / params.fps,
    mimeType: params.mimeType,
    segments: sorted.map((segment) => segment.blob),
    startTime: params.range.startFrame / params.fps,
  };
}

function createExactFrameKey(context: FreshVideoPreviewBuildContext, frameIndex: number): string {
  return createVideoPreviewExactFrameKey({
    fps: context.params.project.fps,
    frameIndex,
    height: context.params.rasterSize.height,
    renderRevision: context.renderRevision,
    width: context.params.rasterSize.width,
  });
}

export function hasExactVideoPreviewFrame(
  context: FreshVideoPreviewBuildContext,
  frameIndex: number
): boolean {
  return context.params.cache.get(createExactFrameKey(context, frameIndex)) !== null;
}

export function restoreMatchingSegments(
  record: VideoPreviewCacheRecord | null,
  plan: readonly VideoPreviewCacheSegmentPlanEntry[]
): Array<VideoPreviewCacheSegment | null> {
  if (!record) return plan.map(() => null);
  return plan.map((expected) => {
    const stored = record.segments.find((segment) => segment.index === expected.index);
    return stored &&
      stored.startFrame === expected.startFrame &&
      stored.endFrame === expected.endFrame &&
      stored.fingerprint === expected.fingerprint
      ? stored
      : null;
  });
}

export function isStoredVideoPreviewCompatible(
  record: VideoPreviewCacheRecord | null,
  params: {
    project: VideoProject;
    range: VideoPreviewCacheFrameRange;
    rasterSize: VideoEditorPreviewRasterSize;
  }
): record is VideoPreviewCacheRecord {
  return Boolean(
    record &&
    record.projectId === params.project.id &&
    record.fps === params.project.fps &&
    record.width === params.rasterSize.width &&
    record.height === params.rasterSize.height &&
    record.range.startFrame === params.range.startFrame &&
    record.range.endFrame === params.range.endFrame
  );
}

export async function cacheExactVideoPreviewFrame(
  context: FreshVideoPreviewBuildContext,
  frameIndex: number,
  canvas: HTMLCanvasElement
): Promise<boolean> {
  if (typeof createImageBitmap !== 'function') return false;
  const bitmap = await createImageBitmap(canvas);
  const { params } = context;
  return params.cache.set(createExactFrameKey(context, frameIndex), bitmap) === 'stored';
}

export function reportVideoPreviewBuildProgress(
  context: FreshVideoPreviewBuildContext,
  phase: VideoEditorPreviewPhase,
  completedFrames: number
): void {
  context.params.onProgress(
    phase,
    completedFrames,
    context.range.endFrame - context.range.startFrame
  );
}
