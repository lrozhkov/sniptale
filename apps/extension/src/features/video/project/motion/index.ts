import {
  VideoMotionCameraMode,
  VideoMotionFocusMode,
  VideoMotionOverlayZoomMode,
  VideoTemporalEasing,
  type VideoProject,
  type VideoProjectMotionArea,
  type VideoProjectMotionRegion,
} from '../types/index';
import {
  clampFocusAreaOrigin,
  clampFocusAreaSize,
  clampNumber,
  getProjectCenter,
  normalizeMotionFocusArea,
} from './focus-area';
import {
  resolveMotionBlurAmount,
  resolveMotionCameraMode,
  resolveMotionFocusMode,
  resolveMotionPath,
  resolveMotionScale,
  resolveMotionStartTime,
} from './normalization';

export const DEFAULT_VIDEO_MOTION_OVERLAY_ZOOM_MODE = VideoMotionOverlayZoomMode.LOCK_OVERLAYS;

export function createMotionFocusAreaFromPointScale(
  project: Pick<VideoProject, 'height' | 'width'>,
  focusPoint: { x: number; y: number },
  scale: number
): VideoProjectMotionArea {
  const safeScale = clampNumber(Number.isFinite(scale) ? scale : 1, 1, 4);
  const width = clampFocusAreaSize(project.width, project.width / safeScale);
  const height = clampFocusAreaSize(project.height, project.height / safeScale);

  return (
    normalizeMotionFocusArea(project, {
      height,
      width,
      x: focusPoint.x - width / 2,
      y: focusPoint.y - height / 2,
    }) ?? {
      height,
      width,
      x: clampFocusAreaOrigin(focusPoint.x - width / 2, width, project.width),
      y: clampFocusAreaOrigin(focusPoint.y - height / 2, height, project.height),
    }
  );
}

export function getMotionFocusAreaCenter(area: VideoProjectMotionArea) {
  return {
    x: area.x + area.width / 2,
    y: area.y + area.height / 2,
  };
}

function resolveMotionDuration(project: Pick<VideoProject, 'duration'>, duration: number): number {
  return clampNumber(
    Number.isFinite(duration) ? duration : 0,
    0.1,
    Math.max(0.1, project.duration || 0.1)
  );
}

function resolveMotionFocusPoint(
  project: Pick<VideoProject, 'height' | 'width'>,
  region: VideoProjectMotionRegion
) {
  return region.focusPoint &&
    Number.isFinite(region.focusPoint.x) &&
    Number.isFinite(region.focusPoint.y)
    ? {
        x: clampNumber(region.focusPoint.x, 0, project.width),
        y: clampNumber(region.focusPoint.y, 0, project.height),
      }
    : getProjectCenter(project);
}

function resolveMotionTargetActionId(
  project: Pick<VideoProject, 'actionEvents'>,
  targetActionEventId: VideoProjectMotionRegion['targetActionEventId']
) {
  return typeof targetActionEventId === 'string' &&
    project.actionEvents.some((event) => event.id === targetActionEventId)
    ? targetActionEventId
    : null;
}

export function resolveMotionOverlayZoomMode(
  overlayZoomMode: VideoProjectMotionRegion['overlayZoomMode']
): VideoMotionOverlayZoomMode {
  return Object.values(VideoMotionOverlayZoomMode).includes(
    overlayZoomMode as VideoMotionOverlayZoomMode
  )
    ? (overlayZoomMode as VideoMotionOverlayZoomMode)
    : DEFAULT_VIDEO_MOTION_OVERLAY_ZOOM_MODE;
}

export function createVideoProjectMotionRegion(
  project: Pick<VideoProject, 'height' | 'width'>,
  startTime: number
): VideoProjectMotionRegion {
  return {
    cameraMode: VideoMotionCameraMode.STATIC,
    duration: 2.8,
    easing: VideoTemporalEasing.EASE_IN_OUT,
    focusArea: null,
    focusMode: VideoMotionFocusMode.MANUAL,
    focusPoint: getProjectCenter(project),
    id: crypto.randomUUID(),
    motionBlurAmount: 0,
    overlayZoomMode: DEFAULT_VIDEO_MOTION_OVERLAY_ZOOM_MODE,
    path: null,
    scale: 1.35,
    startTime: Math.max(0, startTime),
    targetActionEventId: null,
    zoomInDuration: 0.35,
    zoomOutDuration: 0.35,
  };
}

export function normalizeVideoProjectMotionRegion(
  project: Pick<VideoProject, 'actionEvents' | 'duration' | 'height' | 'width'>,
  region: VideoProjectMotionRegion
): VideoProjectMotionRegion {
  const duration = resolveMotionDuration(project, region.duration);
  const focusArea = normalizeMotionFocusArea(project, region.focusArea);
  const focusPoint = resolveMotionFocusPoint(project, region);
  const targetActionEventId = resolveMotionTargetActionId(project, region.targetActionEventId);
  const focusMode = resolveMotionFocusMode(region.focusMode);
  const scale = resolveMotionScale(region.scale);
  const cameraMode = resolveMotionCameraMode(region.cameraMode);
  const startTime = resolveMotionStartTime(project.duration, region.startTime, duration);
  const path = resolveMotionPath(project, region.path, cameraMode, {
    focusArea,
    focusMode,
    focusPoint,
    scale,
  });

  return {
    cameraMode,
    duration,
    easing: Object.values(VideoTemporalEasing).includes(region.easing)
      ? region.easing
      : VideoTemporalEasing.EASE_IN_OUT,
    focusArea,
    focusMode,
    focusPoint,
    id: region.id,
    motionBlurAmount: resolveMotionBlurAmount(region.motionBlurAmount),
    overlayZoomMode: resolveMotionOverlayZoomMode(region.overlayZoomMode),
    path,
    scale,
    startTime,
    targetActionEventId,
    zoomInDuration: clampNumber(
      Number.isFinite(region.zoomInDuration) ? region.zoomInDuration : 0,
      0,
      duration
    ),
    zoomOutDuration: clampNumber(
      Number.isFinite(region.zoomOutDuration) ? region.zoomOutDuration : 0,
      0,
      duration
    ),
  };
}
