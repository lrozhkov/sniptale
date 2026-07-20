import {
  getFittedMediaContentFrame,
  mapFittedMediaFramePointToSource,
  mapSourcePointToFittedMediaFrame,
} from '../../../../features/video/composition/draw';
import {
  normalizeVideoObjectTrack,
  type VideoObjectTrack,
  type VideoObjectTrackSample,
} from '../../../../features/video/project/object-tracks';
import { VIDEO_PROJECT_VISUAL_CURSOR_TRACK_ID } from '../../../../features/video/project/object-tracks';
import type { VideoObjectTrackCorrectionAnchor } from '../../../../features/video/project/object-tracks';
import type {
  VideoProjectAsset,
  VideoProjectVideoClip,
} from '../../../../features/video/project/types/index';
import type { VideoCursorDetectionAnchor } from '../visual-track';

export const VISUAL_CURSOR_TRACK_ID = VIDEO_PROJECT_VISUAL_CURSOR_TRACK_ID;
export const CURSOR_DETECTION_TARGET_FPS = 1;
const CURSOR_DETECTION_MAX_FRAMES = 300;
export const CURSOR_DETECTION_MAX_ANALYSIS_WIDTH = 960;

interface CursorDetectionSamplePoint {
  projectTime: number;
  sourceTime: number;
}

export function createCursorDetectionSamplingPlan(params: {
  clip: Pick<
    VideoProjectVideoClip,
    'duration' | 'playbackRate' | 'sourceStart' | 'sourceDuration' | 'startTime'
  >;
  maxFrames?: number;
  range?: { end: number; start: number };
  targetFps?: number;
}): CursorDetectionSamplePoint[] {
  const targetFps = Math.max(0.25, params.targetFps ?? CURSOR_DETECTION_TARGET_FPS);
  const maxFrames = Math.max(1, Math.floor(params.maxFrames ?? CURSOR_DETECTION_MAX_FRAMES));
  const clipStart = params.clip.startTime;
  const clipEnd = params.clip.startTime + params.clip.duration;
  const start = Math.max(clipStart, params.range?.start ?? clipStart);
  const end = Math.min(clipEnd, params.range?.end ?? clipEnd);
  const duration = Math.max(0, end - start);

  if (duration <= 0) {
    return [];
  }

  const requestedInterval = 1 / targetFps;
  const requestedFrameCount = Math.max(1, Math.floor(duration / requestedInterval) + 1);
  const frameCount = Math.min(maxFrames, requestedFrameCount);
  const interval = frameCount <= 1 ? 0 : duration / (frameCount - 1);

  return Array.from({ length: frameCount }, (_, index) => {
    const projectTime = index === frameCount - 1 ? end : start + interval * index;
    return {
      projectTime,
      sourceTime: getCursorDetectionSourceTime(params.clip, projectTime),
    };
  });
}

function getCursorDetectionSourceTime(
  clip: Pick<VideoProjectVideoClip, 'duration' | 'playbackRate' | 'sourceStart' | 'startTime'>,
  projectTime: number
): number {
  const playbackRate =
    Number.isFinite(clip.playbackRate ?? 1) && (clip.playbackRate ?? 1) > 0
      ? (clip.playbackRate ?? 1)
      : 1;
  const projectOffset = Math.min(clip.duration, Math.max(0, projectTime - clip.startTime));
  return clip.sourceStart + projectOffset * playbackRate;
}

export function mapCursorSourceSampleToProject(params: {
  asset: Pick<VideoProjectAsset, 'metadata'>;
  clip: Pick<VideoProjectVideoClip, 'fitMode' | 'transform'>;
  sample: VideoObjectTrackSample;
}): VideoObjectTrackSample {
  const { contentFrame, sourceHeight, sourceWidth } = resolveCursorMappingContext(params);
  const point = mapSourcePointToFittedMediaFrame({
    fitMode: params.clip.fitMode,
    frame: params.clip.transform,
    point: params.sample,
    sourceHeight,
    sourceWidth,
  });
  const scaleX = contentFrame.width / sourceWidth;
  const scaleY = contentFrame.height / sourceHeight;

  return {
    ...params.sample,
    x: point.x,
    y: point.y,
    ...(params.sample.width === undefined ? {} : { width: params.sample.width * scaleX }),
    ...(params.sample.height === undefined ? {} : { height: params.sample.height * scaleY }),
  };
}

export function mapCursorProjectAnchorToSource(params: {
  anchor: VideoObjectTrackCorrectionAnchor;
  asset: Pick<VideoProjectAsset, 'metadata'>;
  clip: Pick<VideoProjectVideoClip, 'fitMode' | 'transform'>;
}): VideoCursorDetectionAnchor {
  const { contentFrame, sourceHeight, sourceWidth } = resolveCursorMappingContext(params);
  const point = mapFittedMediaFramePointToSource({
    fitMode: params.clip.fitMode,
    frame: params.clip.transform,
    point: params.anchor,
    sourceHeight,
    sourceWidth,
  });
  const scaleX = sourceWidth / Math.max(1, contentFrame.width);
  const scaleY = sourceHeight / Math.max(1, contentFrame.height);

  return {
    confidence: params.anchor.confidence ?? 1,
    time: params.anchor.time,
    x: Math.max(0, Math.min(sourceWidth, point.x)),
    y: Math.max(0, Math.min(sourceHeight, point.y)),
    ...(params.anchor.height === undefined ? {} : { height: params.anchor.height * scaleY }),
    ...(params.anchor.width === undefined ? {} : { width: params.anchor.width * scaleX }),
  };
}

function resolveCursorMappingContext(params: {
  asset: Pick<VideoProjectAsset, 'metadata'>;
  clip: Pick<VideoProjectVideoClip, 'fitMode' | 'transform'>;
}) {
  const sourceWidth = Math.max(1, params.asset.metadata.width);
  const sourceHeight = Math.max(1, params.asset.metadata.height);
  return {
    contentFrame: getFittedMediaContentFrame({
      fitMode: params.clip.fitMode,
      frame: params.clip.transform,
      sourceHeight,
      sourceWidth,
    }),
    sourceHeight,
    sourceWidth,
  };
}

export function mergeVisualCursorTrackRange(params: {
  detectedTrack: VideoObjectTrack;
  existingTrack: VideoObjectTrack | null;
  projectEndTime: number;
  projectStartTime: number;
}): VideoObjectTrack {
  const outsideSamples = [];
  for (const sample of params.existingTrack?.samples ?? []) {
    if (sample.time < params.projectStartTime || sample.time > params.projectEndTime) {
      outsideSamples.push(sample);
    }
  }
  const insideSamples = [];
  for (const sample of params.detectedTrack.samples) {
    if (sample.time >= params.projectStartTime && sample.time <= params.projectEndTime) {
      insideSamples.push(sample);
    }
  }

  return normalizeVideoObjectTrack({
    ...params.detectedTrack,
    ...(params.existingTrack?.correctionAnchors
      ? { correctionAnchors: params.existingTrack.correctionAnchors }
      : {}),
    samples: [...outsideSamples, ...insideSamples],
  });
}
