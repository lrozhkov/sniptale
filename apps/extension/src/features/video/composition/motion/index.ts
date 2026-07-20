import { getMotionFocusAreaCenter, resolveMotionOverlayZoomMode } from '../../project/motion/index';
import {
  VideoMotionCameraMode,
  VideoMotionFocusMode,
  type VideoProject,
  type VideoProjectCursorSample,
  type VideoProjectMotionRegion,
} from '../../project/types/index';
import { isVideoProjectUtilityLaneVisible } from '../../project/utility-lanes';
import { createDefaultCameraState, getDefaultFocusPoint } from './defaults';
import { applyTemporalEasing } from './math';
import { resolvePathTravelCamera } from './path';
import { resolveCameraViewportFrame } from './viewport';
import type { VideoCompositionActionState, VideoCompositionCameraState } from '../types';

export { applyTemporalEasing };

function resolveActiveMotionRegion(
  project: VideoProject,
  currentTime: number
): VideoProjectMotionRegion | null {
  let activeRegion: VideoProjectMotionRegion | null = null;
  for (const region of project.motionRegions ?? []) {
    if (currentTime < region.startTime || currentTime > region.startTime + region.duration) {
      continue;
    }
    if (!activeRegion || region.startTime > activeRegion.startTime) {
      activeRegion = region;
    }
  }
  return activeRegion;
}

function resolveMotionProgress(region: VideoProjectMotionRegion, currentTime: number): number {
  const localTime = currentTime - region.startTime;
  const zoomInDuration = Math.min(region.zoomInDuration, region.duration);
  if (zoomInDuration > 0 && localTime < zoomInDuration) {
    return applyTemporalEasing(localTime / zoomInDuration, region.easing);
  }

  const zoomOutStart = Math.max(0, region.duration - region.zoomOutDuration);
  if (region.zoomOutDuration > 0 && localTime > zoomOutStart) {
    const progress = (localTime - zoomOutStart) / region.zoomOutDuration;
    return 1 - applyTemporalEasing(progress, region.easing);
  }

  return 1;
}

function resolveActionFocusPoint(
  project: VideoProject,
  region: VideoProjectMotionRegion,
  actions: VideoCompositionActionState[]
) {
  const actionEvents = isVideoProjectUtilityLaneVisible(project, 'actions')
    ? project.actionEvents
    : [];
  const targetedAction =
    (region.targetActionEventId
      ? actionEvents.find((event) => event.id === region.targetActionEventId)
      : null) ??
    actions.find((action) => action.point !== null)?.event ??
    null;

  return targetedAction?.point ?? region.focusPoint ?? getDefaultFocusPoint(project);
}

function resolveMotionFocusPoint(
  project: VideoProject,
  region: VideoProjectMotionRegion,
  cursorSample: VideoProjectCursorSample | null,
  actions: VideoCompositionActionState[]
) {
  switch (region.focusMode) {
    case VideoMotionFocusMode.MANUAL:
      return region.focusPoint ?? getDefaultFocusPoint(project);
    case VideoMotionFocusMode.MANUAL_AREA:
      return region.focusArea
        ? getMotionFocusAreaCenter(region.focusArea)
        : (region.focusPoint ?? getDefaultFocusPoint(project));
    case VideoMotionFocusMode.CURSOR:
      return cursorSample ?? region.focusPoint ?? getDefaultFocusPoint(project);
    case VideoMotionFocusMode.ACTION:
      return resolveActionFocusPoint(project, region, actions);
  }
}

function resolveMotionTargetScale(
  project: VideoProject,
  activeRegion: VideoProjectMotionRegion
): number {
  if (activeRegion.focusMode !== VideoMotionFocusMode.MANUAL_AREA || !activeRegion.focusArea) {
    return activeRegion.scale;
  }

  return Math.min(
    4,
    Math.max(
      1,
      Math.min(
        project.width / Math.max(1, activeRegion.focusArea.width),
        project.height / Math.max(1, activeRegion.focusArea.height)
      )
    )
  );
}

export function resolveVideoCompositionCamera(params: {
  actions: VideoCompositionActionState[];
  cursorSample: VideoProjectCursorSample | null;
  currentTime: number;
  project: VideoProject;
}): VideoCompositionCameraState {
  if (!isVideoProjectUtilityLaneVisible(params.project, 'camera')) {
    return createDefaultCameraState(params.project);
  }

  const activeRegion = resolveActiveMotionRegion(params.project, params.currentTime);
  if (!activeRegion) {
    return createDefaultCameraState(params.project);
  }

  if (activeRegion.cameraMode === VideoMotionCameraMode.PATH) {
    return resolvePathTravelCamera({
      currentTime: params.currentTime,
      project: params.project,
      region: activeRegion,
    });
  }

  const progress = resolveMotionProgress(activeRegion, params.currentTime);
  const targetScale = resolveMotionTargetScale(params.project, activeRegion);
  const scale = 1 + (targetScale - 1) * progress;
  const focusPoint = resolveMotionFocusPoint(
    params.project,
    activeRegion,
    params.cursorSample,
    params.actions
  );
  const targetViewport = resolveCameraViewportFrame(params.project, focusPoint, targetScale);
  const currentViewport = resolveCameraViewportFrame(params.project, focusPoint, scale);

  return {
    focusPoint,
    motionBlurAmount: activeRegion.motionBlurAmount ?? 0,
    overlayZoomMode: resolveMotionOverlayZoomMode(activeRegion.overlayZoomMode),
    regionId: activeRegion.id,
    scale,
    viewportHeight: currentViewport.viewportHeight,
    viewportWidth: currentViewport.viewportWidth,
    viewportX: targetViewport.viewportX * progress,
    viewportY: targetViewport.viewportY * progress,
  };
}

export function mapCompositionPointThroughCamera(
  point: { x: number; y: number },
  camera: VideoCompositionCameraState
) {
  return {
    x: (point.x - camera.viewportX) * camera.scale,
    y: (point.y - camera.viewportY) * camera.scale,
  };
}

export function mapCompositionRectThroughCamera(
  rect: { height: number; width: number; x: number; y: number },
  camera: VideoCompositionCameraState
) {
  const point = mapCompositionPointThroughCamera(rect, camera);
  return {
    height: rect.height * camera.scale,
    width: rect.width * camera.scale,
    x: point.x,
    y: point.y,
  };
}

export function mapViewportPointToComposition(
  point: { x: number; y: number },
  camera: VideoCompositionCameraState
) {
  return {
    x: point.x / camera.scale + camera.viewportX,
    y: point.y / camera.scale + camera.viewportY,
  };
}
