import {
  DEFAULT_VIDEO_MOTION_OVERLAY_ZOOM_MODE,
  resolveMotionOverlayZoomMode,
} from '../../project/motion/index';
import { createDefaultMotionPath } from '../../project/motion/path';
import {
  type VideoMotionOverlayZoomMode,
  type VideoProject,
  type VideoProjectMotionRegion,
} from '../../project/types/index';
import {
  getDefaultFocusPoint,
  resolveIntroCamera,
  resolveOutroCamera,
  resolvePathStopState,
  resolveTravelCamera,
} from './path-camera';
import type { VideoCompositionCameraState } from '../types';

type PathWindowCameraState = {
  firstState: ReturnType<typeof resolvePathStopState>;
  lastState: ReturnType<typeof resolvePathStopState>;
  motionBlurAmount: number;
  overlayZoomMode: VideoMotionOverlayZoomMode;
};

export function resolvePathTravelCamera(params: {
  currentTime: number;
  project: VideoProject;
  region: VideoProjectMotionRegion;
}): VideoCompositionCameraState {
  const path = params.region.path ?? createDefaultMotionPath(params.project, params.region);
  const pathWindow = resolvePathWindow(params.region, params.currentTime);
  const firstStop = path.stops[0];
  const lastStop = path.stops.at(-1);

  if (!firstStop || !lastStop) {
    return createDefaultPathCamera(params.project);
  }

  const firstState = resolvePathStopState(params.project, firstStop);
  const lastState = resolvePathStopState(params.project, lastStop);
  const overlayZoomMode = resolveMotionOverlayZoomMode(params.region.overlayZoomMode);
  const motionBlurAmount = params.region.motionBlurAmount ?? 0;
  return resolvePathWindowCamera(params.project, params.region, path, pathWindow, {
    firstState,
    lastState,
    motionBlurAmount,
    overlayZoomMode,
  });
}

function resolvePathWindowCamera(
  project: VideoProject,
  region: VideoProjectMotionRegion,
  path: ReturnType<typeof createDefaultMotionPath>,
  pathWindow: ReturnType<typeof resolvePathWindow>,
  state: PathWindowCameraState
): VideoCompositionCameraState {
  const phaseParams = {
    easing: region.easing,
    motionBlurAmount: state.motionBlurAmount,
    overlayZoomMode: state.overlayZoomMode,
    regionId: region.id,
  };

  if (pathWindow.introDuration > 0 && pathWindow.localTime < pathWindow.introDuration) {
    return resolveIntroCamera(
      project,
      state.firstState,
      pathWindow.localTime / pathWindow.introDuration,
      phaseParams
    );
  }
  if (pathWindow.outroDuration > 0 && pathWindow.localTime > pathWindow.travelEnd) {
    return resolveOutroCamera(
      project,
      state.lastState,
      (pathWindow.localTime - pathWindow.travelEnd) / pathWindow.outroDuration,
      phaseParams
    );
  }
  if (pathWindow.travelEnd <= pathWindow.travelStart || path.stops.length < 2) {
    return createStaticPathCamera(
      state.firstState,
      state.motionBlurAmount,
      state.overlayZoomMode,
      region.id
    );
  }

  return resolveTravelCamera(project, path.stops, path.segments, {
    easing: region.easing,
    endTime: pathWindow.travelEnd,
    localTime: pathWindow.localTime,
    motionBlurAmount: state.motionBlurAmount,
    overlayZoomMode: state.overlayZoomMode,
    regionId: region.id,
    startTime: pathWindow.travelStart,
  });
}

function resolvePathWindow(region: VideoProjectMotionRegion, currentTime: number) {
  const introDuration = Math.min(region.zoomInDuration, region.duration);
  const outroDuration = Math.min(region.zoomOutDuration, region.duration);
  const travelStart = introDuration;
  return {
    introDuration,
    localTime: currentTime - region.startTime,
    outroDuration,
    travelEnd: Math.max(travelStart, region.duration - outroDuration),
    travelStart,
  };
}

function createDefaultPathCamera(project: VideoProject): VideoCompositionCameraState {
  return {
    focusPoint: getDefaultFocusPoint(project),
    motionBlurAmount: 0,
    overlayZoomMode: DEFAULT_VIDEO_MOTION_OVERLAY_ZOOM_MODE,
    regionId: null,
    scale: 1,
    viewportHeight: project.height,
    viewportWidth: project.width,
    viewportX: 0,
    viewportY: 0,
  };
}

function createStaticPathCamera(
  firstState: ReturnType<typeof resolvePathStopState>,
  motionBlurAmount: number,
  overlayZoomMode: VideoMotionOverlayZoomMode,
  regionId: string
): VideoCompositionCameraState {
  return {
    focusPoint: firstState.focusPoint,
    motionBlurAmount,
    overlayZoomMode,
    regionId,
    scale: firstState.scale,
    viewportHeight: firstState.viewportHeight,
    viewportWidth: firstState.viewportWidth,
    viewportX: firstState.viewportX,
    viewportY: firstState.viewportY,
  };
}
