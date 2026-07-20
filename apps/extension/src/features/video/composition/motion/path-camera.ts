import {
  resolveMotionPathStopFocusPoint,
  resolveMotionPathStopScale,
} from '../../project/motion/path-targets';
import {
  VideoMotionPathTrajectoryPreset,
  type VideoMotionOverlayZoomMode,
  type VideoTemporalEasing,
  type VideoProject,
  type VideoProjectMotionPathSegment,
  type VideoProjectMotionPathStop,
} from '../../project/types/index';
import { applyTemporalEasing, clampProgress, lerpNumber, lerpPoint } from './math';
import { getDefaultFocusPoint } from './defaults';
import { interpolatePathFocusPoint, resolvePathSegmentIndex } from './path-trajectory';
import { resolveCameraViewportFrame } from './viewport';
import type { VideoCompositionCameraState } from '../types';

export { getDefaultFocusPoint };

export function resolvePathStopState(
  project: Pick<VideoProject, 'height' | 'width'>,
  stop: VideoProjectMotionPathStop
) {
  const focusPoint = resolveMotionPathStopFocusPoint(project, stop);
  const scale = resolveMotionPathStopScale(project, stop);

  return {
    focusPoint,
    scale,
    ...resolveCameraViewportFrame(project, focusPoint, scale),
  };
}

export function resolveIntroCamera(
  project: VideoProject,
  firstState: ReturnType<typeof resolvePathStopState>,
  progress: number,
  params: {
    easing: VideoTemporalEasing;
    motionBlurAmount: number;
    overlayZoomMode: VideoMotionOverlayZoomMode;
    regionId: string;
  }
): VideoCompositionCameraState {
  const easedProgress = applyTemporalEasing(progress, params.easing);
  const scale = lerpNumber(1, firstState.scale, easedProgress);
  const focusPoint = lerpPoint(getDefaultFocusPoint(project), firstState.focusPoint, easedProgress);
  const viewport = resolveCameraViewportFrame(project, focusPoint, scale);

  return {
    focusPoint,
    motionBlurAmount: params.motionBlurAmount,
    overlayZoomMode: params.overlayZoomMode,
    regionId: params.regionId,
    scale,
    viewportHeight: viewport.viewportHeight,
    viewportWidth: viewport.viewportWidth,
    viewportX: firstState.viewportX * easedProgress,
    viewportY: firstState.viewportY * easedProgress,
  };
}

export function resolveOutroCamera(
  project: VideoProject,
  lastState: ReturnType<typeof resolvePathStopState>,
  progress: number,
  params: {
    easing: VideoTemporalEasing;
    motionBlurAmount: number;
    overlayZoomMode: VideoMotionOverlayZoomMode;
    regionId: string;
  }
): VideoCompositionCameraState {
  const easedProgress = 1 - applyTemporalEasing(progress, params.easing);
  const scale = lerpNumber(1, lastState.scale, easedProgress);
  const viewport = resolveCameraViewportFrame(project, lastState.focusPoint, scale);

  return {
    focusPoint: lastState.focusPoint,
    motionBlurAmount: params.motionBlurAmount,
    overlayZoomMode: params.overlayZoomMode,
    regionId: params.regionId,
    scale,
    viewportHeight: viewport.viewportHeight,
    viewportWidth: viewport.viewportWidth,
    viewportX: lastState.viewportX * easedProgress,
    viewportY: lastState.viewportY * easedProgress,
  };
}

export function resolveTravelCamera(
  project: VideoProject,
  stops: VideoProjectMotionPathStop[],
  segments: VideoProjectMotionPathSegment[],
  params: {
    easing: VideoTemporalEasing;
    endTime: number;
    localTime: number;
    motionBlurAmount: number;
    overlayZoomMode: VideoMotionOverlayZoomMode;
    regionId: string;
    startTime: number;
  }
): VideoCompositionCameraState {
  const travelProgress = clampProgress(
    (params.localTime - params.startTime) / (params.endTime - params.startTime)
  );
  const { easedProgress, fromStop, segment, toStop } = resolveTravelSegment(
    stops,
    segments,
    travelProgress,
    params.easing
  );
  const fromState = resolvePathStopState(project, fromStop);
  const toState = resolvePathStopState(project, toStop);
  const focusPoint = interpolatePathFocusPoint(
    fromState.focusPoint,
    toState.focusPoint,
    easedProgress,
    segment
  );
  const scale = lerpNumber(fromState.scale, toState.scale, easedProgress);
  const viewport = resolveCameraViewportFrame(project, focusPoint, scale);

  return {
    focusPoint,
    motionBlurAmount: params.motionBlurAmount,
    overlayZoomMode: params.overlayZoomMode,
    regionId: params.regionId,
    scale,
    viewportHeight: viewport.viewportHeight,
    viewportWidth: viewport.viewportWidth,
    viewportX: viewport.viewportX,
    viewportY: viewport.viewportY,
  };
}

function resolveTravelSegment(
  stops: VideoProjectMotionPathStop[],
  segments: VideoProjectMotionPathSegment[],
  travelProgress: number,
  easing: VideoTemporalEasing
) {
  const segmentIndex = resolvePathSegmentIndex(stops, travelProgress);
  const fromStop = stops[segmentIndex] ?? stops[0]!;
  const toStop = stops[segmentIndex + 1] ?? stops[stops.length - 1]!;
  const segment = segments[segmentIndex] ?? {
    durationWeight: 1,
    easing,
    trajectoryPreset: VideoMotionPathTrajectoryPreset.LINEAR,
  };

  return {
    easedProgress: applyTemporalEasing(
      resolveTravelSegmentProgress(travelProgress, fromStop.offset, toStop.offset),
      segment.easing
    ),
    fromStop,
    segment,
    toStop,
  };
}

function resolveTravelSegmentProgress(
  travelProgress: number,
  startOffset: number,
  endOffset: number
) {
  const safeEndOffset = Math.max(startOffset, endOffset);
  if (safeEndOffset <= startOffset) {
    return 1;
  }

  return clampProgress((travelProgress - startOffset) / (safeEndOffset - startOffset));
}
