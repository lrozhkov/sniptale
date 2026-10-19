import { regionMotionBlurAmount } from './blur';
import { motionBlurPhaseSetting } from '../../project/motion/blur';
import { resolveActiveMotionRegion, resolveConnectingMotionRegions } from './camera-interval';
import type { CameraOutputViewport } from '../../project/export/output-dimensions';
import { resolveProjectFollowingCamera, resolveProjectCameraEdges } from './project-follow';
import { resolveVideoProjectActionOccurrences } from '../../project/action-occurrences';
import { resolveVideoCompositionActionSourceMapping } from '../timeline/frame/actions';
import { mapSourceNormalizedPointToVisualLayer } from '../draw/fitted-media';
import { getMotionFocusAreaCenter, resolveMotionOverlayZoomMode } from '../../project/motion/index';
import { getMotionAnimationTime } from '../../project/motion/timing';
import {
  VideoMotionFocusMode,
  type VideoProject,
  type VideoProjectCursorSample,
  type VideoProjectMotionRegion,
} from '../../project/types/index';
import { isVideoProjectUtilityLaneVisible } from '../../project/utility-lanes';
import { createDefaultCameraState, getDefaultFocusPoint } from './defaults';
import { applyTemporalEasing, lerpNumber, lerpPoint } from './math';

import { resolveCameraViewportFrame } from './viewport';
import type { VideoCompositionActionState, VideoCompositionCameraState } from '../types';

export { applyTemporalEasing };

function resolveMotionProgress(
  region: VideoProjectMotionRegion,
  currentTime: number,
  connectedIn: boolean,
  connectedOut: boolean
): number {
  const localTime = getMotionAnimationTime(region, currentTime - region.startTime);
  const animationDuration = region.animation?.duration ?? region.duration;
  const zoomInDuration = Math.min(region.zoomInDuration, animationDuration);
  if (!connectedIn && zoomInDuration > 0 && localTime < zoomInDuration) {
    return applyTemporalEasing(localTime / zoomInDuration, region.easing);
  }

  const zoomOutStart = Math.max(0, animationDuration - region.zoomOutDuration);
  if (!connectedOut && region.zoomOutDuration > 0 && localTime > zoomOutStart) {
    const progress = (localTime - zoomOutStart) / region.zoomOutDuration;
    return 1 - applyTemporalEasing(progress, region.easing);
  }

  return 1;
}

function resolveActionFocusPoint(
  project: VideoProject,
  region: VideoProjectMotionRegion,
  currentTime: number
) {
  const target = region.targetAction;
  const occurrence =
    target &&
    resolveVideoProjectActionOccurrences(project).find(
      (item) => item.eventId === target.eventId && item.clipId === target.clipId
    );
  if (!occurrence) return region.focusPoint ?? getDefaultFocusPoint(project);
  const point = occurrence.event.presentation?.point ?? occurrence.event.point;
  if (!point) return region.focusPoint ?? getDefaultFocusPoint(project);
  if (occurrence.clipId === null) return point;
  const clip = project.clips.find((item) => item.id === occurrence.clipId);
  if (project.tracks.find((track) => track.id === clip?.trackId)?.role === 'CAMERA')
    return region.focusPoint ?? getDefaultFocusPoint(project);
  const mapping = resolveVideoCompositionActionSourceMapping(project, occurrence, currentTime);
  return (
    (mapping && mapSourceNormalizedPointToVisualLayer({ ...mapping, point })) ??
    region.focusPoint ??
    getDefaultFocusPoint(project)
  );
}

function resolveMotionFocusPoint(
  project: VideoProject,
  region: VideoProjectMotionRegion,
  _cursorSample: VideoProjectCursorSample | null,
  currentTime: number,
  output?: CameraOutputViewport
) {
  switch (region.focusMode) {
    case VideoMotionFocusMode.MANUAL:
      return region.focusPoint ?? getDefaultFocusPoint(project);
    case VideoMotionFocusMode.MANUAL_AREA:
      return region.focusArea
        ? getMotionFocusAreaCenter(region.focusArea)
        : (region.focusPoint ?? getDefaultFocusPoint(project));
    case VideoMotionFocusMode.CURSOR:
      return resolveProjectFollowingCamera(project, region, currentTime, output).focusPoint;
    case VideoMotionFocusMode.ACTION:
      return resolveActionFocusPoint(project, region, currentTime);
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
  cameraViewport?: CameraOutputViewport;
}): VideoCompositionCameraState {
  if (!isVideoProjectUtilityLaneVisible(params.project, 'camera')) {
    return createDefaultCameraState(params.project);
  }

  const activeRegion = resolveActiveMotionRegion(params.project, params.currentTime);
  if (!activeRegion) {
    return resolveConnectingCamera(params) ?? createDefaultCameraState(params.project);
  }

  const edges = resolveProjectCameraEdges(params.project, activeRegion);
  const motionBlurAmount = regionMotionBlurAmount(activeRegion, params.currentTime, edges);
  const progress = resolveMotionProgress(
    activeRegion,
    params.currentTime,
    edges.connectedIn,
    edges.connectedOut
  );
  const following =
    activeRegion.focusMode === VideoMotionFocusMode.CURSOR
      ? resolveProjectFollowingCamera(
          params.project,
          activeRegion,
          params.currentTime,
          params.cameraViewport
        )
      : null;
  const targetScale =
    following?.targetScale ?? resolveMotionTargetScale(params.project, activeRegion);
  const scale = 1 + (targetScale - 1) * progress;
  const focusPoint =
    following?.focusPoint ??
    resolveMotionFocusPoint(
      params.project,
      activeRegion,
      params.cursorSample,
      params.currentTime,
      params.cameraViewport
    );
  if (following)
    return {
      focusPoint,
      scale,
      regionId: activeRegion.id,
      motionBlurAmount,
      overlayZoomMode: resolveMotionOverlayZoomMode(activeRegion.overlayZoomMode),
      viewportHeight: params.project.height / scale,
      viewportWidth: params.project.width / scale,
      viewportX:
        ((following.pan.x / following.geometry.window.width) * params.project.width * progress) /
        scale,
      viewportY:
        ((following.pan.y / following.geometry.window.height) * params.project.height * progress) /
        scale,
    };
  const targetViewport = resolveCameraViewportFrame(params.project, focusPoint, targetScale);
  const currentViewport = resolveCameraViewportFrame(params.project, focusPoint, scale);
  // Interpolate the rendered translation, then convert it back to source coordinates.
  const viewportProgress = (targetScale * progress) / scale;

  return {
    focusPoint,
    motionBlurAmount,
    overlayZoomMode: resolveMotionOverlayZoomMode(activeRegion.overlayZoomMode),
    regionId: activeRegion.id,
    scale,
    viewportHeight: currentViewport.viewportHeight,
    viewportWidth: currentViewport.viewportWidth,
    viewportX: targetViewport.viewportX * viewportProgress,
    viewportY: targetViewport.viewportY * viewportProgress,
  };
}

function resolveConnectingCamera(
  params: Parameters<typeof resolveVideoCompositionCamera>[0]
): VideoCompositionCameraState | null {
  const connection = resolveConnectingMotionRegions(params.project, params.currentTime);
  if (connection) {
    const { source, destination } = connection;
    const start = source.startTime + source.duration;
    const progress = applyTemporalEasing(
      (params.currentTime - start) / (destination.startTime - start),
      destination.incomingConnection!.easing
    );
    const focusPoint = lerpPoint(
      resolveMotionFocusPoint(params.project, source, null, start, params.cameraViewport),
      resolveMotionFocusPoint(
        params.project,
        destination,
        null,
        destination.startTime,
        params.cameraViewport
      ),
      progress
    );
    const scale = lerpNumber(
      resolveMotionTargetScale(params.project, source),
      resolveMotionTargetScale(params.project, destination),
      progress
    );
    return {
      focusPoint,
      scale,
      ...resolveCameraViewportFrame(params.project, focusPoint, scale),
      regionId: destination.id,
      motionBlurAmount:
        destination.incomingConnection!.easing === 'INSTANT'
          ? 0
          : source.motionBlur === undefined
            ? lerpNumber(source.motionBlurAmount ?? 0, destination.motionBlurAmount ?? 0, progress)
            : motionBlurPhaseSetting(source.motionBlur, 'link').enabled
              ? motionBlurPhaseSetting(source.motionBlur, 'link').strength
              : 0,
      overlayZoomMode: resolveMotionOverlayZoomMode(destination.overlayZoomMode),
    };
  }
  return null;
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
