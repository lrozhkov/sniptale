import { createVisualCursorTrackBuilder } from './visual-track';
import type { VideoObjectTrack } from '../../../features/video/project/object-tracks';
import {
  VideoProjectClipType,
  type VideoProject,
  type VideoProjectAsset,
  type VideoProjectVideoClip,
} from '../../../features/video/project/types/index';
import {
  createCursorDetectionSamplingPlan,
  CURSOR_DETECTION_TARGET_FPS,
  mapCursorProjectAnchorToSource,
  mapCursorSourceSampleToProject,
  mergeVisualCursorTrackRange,
  VISUAL_CURSOR_TRACK_ID,
} from './model/analysis';
import { decodeDetectionFrames, type CursorDetectionDecodeResult } from './decode';
import type { CursorDetectionJobState } from './state';

type CursorDetectionJobParams = {
  assetUrls: Record<string, string>;
  clipId: string;
  onProgress: (state: CursorDetectionJobState) => void;
  project: VideoProject;
  range?: { end: number; start: number };
  signal: AbortSignal;
};

type CursorDetectionJobContext = {
  asset: VideoProjectAsset;
  assetUrl: string;
  clip: VideoProjectVideoClip;
  existingTrack: VideoObjectTrack | null;
  range: { end: number; start: number };
};

export async function runCursorDetectionJob(
  params: CursorDetectionJobParams
): Promise<VideoObjectTrack> {
  const context = resolveCursorDetectionJobContext(params);
  const samplingPlan = createCursorDetectionSamplingPlan({
    clip: context.clip,
    ...(params.range ? { range: params.range } : {}),
  });
  params.onProgress(createRunningState(context.clip.id, 0, samplingPlan.length));
  const sourceTrackBuilder = createVisualCursorTrackBuilder({
    manualAnchors: createSourceAnchors(context),
    trackId: VISUAL_CURSOR_TRACK_ID,
  });
  const analysisSize = await decodeDetectionFrames({
    asset: context.asset,
    assetUrl: context.assetUrl,
    onFrame: sourceTrackBuilder.addFrame,
    samplingPlan,
    signal: params.signal,
    onProgress: (processedFrames) =>
      params.onProgress(createRunningState(context.clip.id, processedFrames, samplingPlan.length)),
  });

  const mappedTrack = createProjectCursorTrack(sourceTrackBuilder.toTrack(), context, analysisSize);

  return mergeVisualCursorTrackRange({
    detectedTrack: mappedTrack,
    existingTrack: context.existingTrack,
    projectEndTime: mappedTrack.analysis.projectEndTime,
    projectStartTime: mappedTrack.analysis.projectStartTime,
  });
}

function resolveCursorDetectionJobContext(
  params: CursorDetectionJobParams
): CursorDetectionJobContext {
  const clip = params.project.clips.find(
    (candidate): candidate is VideoProjectVideoClip =>
      candidate.id === params.clipId && candidate.type === VideoProjectClipType.VIDEO
  );
  if (!clip) {
    throw new Error('Selected clip is not a video clip.');
  }

  const asset = params.project.assets.find((candidate) => candidate.id === clip.assetId);
  const assetUrl = params.assetUrls[clip.assetId];
  if (!asset || !assetUrl) {
    throw new Error('Video asset URL is not available.');
  }

  return {
    asset,
    assetUrl,
    clip,
    existingTrack:
      params.project.objectTracks?.find((track) => track.id === VISUAL_CURSOR_TRACK_ID) ?? null,
    range: resolveRange(clip, params.range),
  };
}

function createSourceAnchors(context: CursorDetectionJobContext) {
  const sourceAnchors = [];
  for (const anchor of context.existingTrack?.correctionAnchors ?? []) {
    if (isTimeInsideRange(anchor.time, context.range)) {
      sourceAnchors.push(
        mapCursorProjectAnchorToSource({
          anchor,
          asset: context.asset,
          clip: context.clip,
        })
      );
    }
  }
  return sourceAnchors;
}

function createProjectCursorTrack(
  detectedTrack: VideoObjectTrack,
  context: CursorDetectionJobContext,
  analysisSize: CursorDetectionDecodeResult
) {
  const sourceWidth = Math.max(1, context.asset.metadata.width);
  const sourceHeight = Math.max(1, context.asset.metadata.height);
  const scaleX = sourceWidth / Math.max(1, analysisSize.width);
  const scaleY = sourceHeight / Math.max(1, analysisSize.height);
  const sourceSamples = detectedTrack.samples.map((sample) => ({
    ...sample,
    ...(sample.height === undefined ? {} : { height: sample.height * scaleY }),
    ...(sample.width === undefined ? {} : { width: sample.width * scaleX }),
    x: sample.x * scaleX,
    y: sample.y * scaleY,
  }));
  return {
    ...detectedTrack,
    analysis: {
      ...detectedTrack.analysis,
      mode: 'coarseKeyframes' as const,
      projectEndTime: context.range.end,
      projectStartTime: context.range.start,
      sampleFps: CURSOR_DETECTION_TARGET_FPS,
      sourceAssetId: context.clip.assetId,
      sourceClipId: context.clip.id,
    },
    hidden: true,
    role: 'cameraCursor' as const,
    samples: sourceSamples.map((sample) =>
      mapCursorSourceSampleToProject({ asset: context.asset, clip: context.clip, sample })
    ),
  };
}

function createRunningState(
  clipId: string,
  processedFrames: number,
  totalFrames: number
): CursorDetectionJobState {
  return {
    clipId,
    error: null,
    processedFrames,
    progress: totalFrames === 0 ? 0 : processedFrames / totalFrames,
    status: 'running',
    totalFrames,
    trackId: VISUAL_CURSOR_TRACK_ID,
  };
}

function resolveRange(
  clip: VideoProjectVideoClip,
  range: { end: number; start: number } | undefined
) {
  const start = Math.max(clip.startTime, range?.start ?? clip.startTime);
  const end = Math.min(
    clip.startTime + clip.duration,
    range?.end ?? clip.startTime + clip.duration
  );
  return { end, start };
}

function isTimeInsideRange(time: number, range: { end: number; start: number }): boolean {
  return time >= range.start && time <= range.end;
}
