import { applySourceWindowCameraMode } from './source-window';
import { resolveManualMotionFocusPoint, resolveMotionTargetScale } from './focus-target';
import { resolveSourceWindowCamera, resolveMotionSourceWindow } from './source-window';
import { projectMotionSourcePhases } from '../../project/motion/source-binding';
import { evaluateMotionSpatial, motionCameraProjection } from './spatial';
import { invertQuickEditProjection, projectQuickEditPoint } from './spatial-geometry';
import { cameraTransitionProgress } from '../../project/motion/transitions';
import { motionTransitionSettings } from '../../project/motion/timing';
import { regionMotionBlurAmount } from './blur';
import { motionBlurPhaseSetting } from '../../project/motion/blur';
import { resolveActiveMotionRegion, resolveConnectingMotionRegions } from './camera-interval';
import type { CameraOutputViewport } from '../../project/export/output-dimensions';
import {
  resolveProjectFollowingCamera,
  resolveProjectCameraEdges,
  resolveProjectWindowCameraEndpoint,
} from './project-follow';
import {
  resolveMotionOverlayZoomMode,
  resolveMotionConnectionVideo,
} from '../../project/motion/index';
import { getMotionAnimationTime } from '../../project/motion/timing';
import {
  VideoMotionFocusMode,
  type VideoProject,
  type VideoProjectCursorSample,
  type VideoProjectMotionRegion,
} from '../../project/types/index';
import { isVideoProjectUtilityLaneVisible } from '../../project/utility-lanes';
import { createDefaultCameraState } from './defaults';
import { applyTemporalEasing, motionConnectionProgress, lerpNumber, lerpPoint } from './math';

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
  const enter = motionTransitionSettings(region, 'enter');
  const exit = motionTransitionSettings(region, 'exit');
  const zoomInDuration = Math.min(enter.duration, animationDuration);
  if (!connectedIn && zoomInDuration > 0 && localTime < zoomInDuration) {
    return enter.explicit
      ? cameraTransitionProgress(localTime / zoomInDuration, enter.type)
      : applyTemporalEasing(localTime / zoomInDuration, region.easing);
  }

  const zoomOutStart = Math.max(0, animationDuration - exit.duration);
  if (!connectedOut && exit.duration > 0 && localTime > zoomOutStart) {
    const progress = (localTime - zoomOutStart) / exit.duration;
    return (
      1 -
      (exit.explicit
        ? cameraTransitionProgress(progress, exit.type)
        : applyTemporalEasing(progress, region.easing))
    );
  }

  return 1;
}

function resolveMotionFocusPoint(
  project: VideoProject,
  region: VideoProjectMotionRegion,
  _cursorSample: VideoProjectCursorSample | null,
  currentTime: number,
  output?: CameraOutputViewport
) {
  return region.focusMode === VideoMotionFocusMode.CURSOR
    ? resolveProjectFollowingCamera(project, region, currentTime, output).focusPoint
    : resolveManualMotionFocusPoint(project, region, currentTime);
}

export function resolveVideoCompositionCamera(params: {
  actions: VideoCompositionActionState[];
  cursorSample: VideoProjectCursorSample | null;
  currentTime: number;
  project: VideoProject;
  cameraViewport?: CameraOutputViewport;
}): VideoCompositionCameraState {
  params = { ...params, project: projectMotionSourcePhases(params.project) };
  if (!isVideoProjectUtilityLaneVisible(params.project, 'camera')) {
    return createDefaultCameraState(params.project);
  }

  const activeRegion = resolveActiveMotionRegion(params.project, params.currentTime);
  if (!activeRegion) {
    const connected = resolveConnectingCamera(params);
    return connected
      ? applySourceWindowCameraMode(params.project, connected, params.currentTime)
      : createDefaultCameraState(params.project);
  }

  const edges = resolveProjectCameraEdges(params.project, activeRegion);
  const motionBlurAmount = regionMotionBlurAmount(activeRegion, params.currentTime, edges);
  const progress = resolveMotionProgress(
    activeRegion,
    params.currentTime,
    edges.connectedIn,
    edges.connectedOut
  );
  const spatial = evaluateMotionSpatial(params.project, null, activeRegion, progress);
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
  {
    const windowCamera = resolveSourceWindowCamera(
      params.project,
      activeRegion,
      params.currentTime,
      focusPoint,
      targetScale,
      progress,
      following
        ? {
            x: following.pan.x / following.geometry.window.width,
            y: following.pan.y / following.geometry.window.height,
          }
        : undefined
    );
    if (windowCamera)
      return applySourceWindowCameraMode(
        params.project,
        {
          ...windowCamera,
          regionId: activeRegion.id,
          motionBlurAmount,
          overlayZoomMode: resolveMotionOverlayZoomMode(activeRegion.overlayZoomMode),
        },
        params.currentTime
      );
  }
  if (following)
    return {
      focusPoint,
      scale,
      regionId: activeRegion.id,
      ...(spatial ? { spatial } : {}),
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
    ...(spatial ? { spatial } : {}),
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
    const progress = motionConnectionProgress(
      destination,
      (params.currentTime - start) / (destination.startTime - start)
    );
    if (destination.sourceBinding?.coordinateSpace === 'source-window') {
      const clip = resolveMotionConnectionVideo(
        params.project,
        source,
        destination,
        params.currentTime
      );
      if (!clip) return null;
      const currentTarget = {
        ...destination,
        sourceBinding: { ...destination.sourceBinding, clipId: clip.id },
      };
      const geometry = resolveMotionSourceWindow(params.project, currentTarget, params.currentTime);
      if (!geometry) return null;
      const endpoint = (region: VideoProjectMotionRegion, time: number) => {
        const target = resolveProjectWindowCameraEndpoint(
          params.project,
          region,
          time,
          params.cameraViewport
        );
        return target
          ? resolveSourceWindowCamera(
              params.project,
              { ...region, sourceBinding: { ...destination.sourceBinding!, clipId: clip.id } },
              params.currentTime,
              region.focusPoint ?? { x: params.project.width / 2, y: params.project.height / 2 },
              target.scale,
              1,
              target.pan
            )
          : null;
      };
      const from = endpoint(source, start);
      const to = endpoint(destination, destination.startTime);
      if (!from || !to) return null;
      const scale = lerpNumber(from.scale, to.scale, progress);
      const spatialReference = {
        x: geometry.window.x / params.project.width,
        y: geometry.window.y / params.project.height,
        width: geometry.window.width / params.project.width,
        height: geometry.window.height / params.project.height,
      };
      const spatial = evaluateMotionSpatial(
        params.project,
        { ...source, spatialReference },
        { ...destination, spatialReference },
        progress
      );
      return {
        sourceClipId: geometry.clipId,
        scale,
        focusPoint: lerpPoint(from.focusPoint, to.focusPoint, progress),
        viewportX:
          lerpNumber(from.viewportX * from.scale, to.viewportX * to.scale, progress) / scale,
        viewportY:
          lerpNumber(from.viewportY * from.scale, to.viewportY * to.scale, progress) / scale,
        viewportWidth: params.project.width / scale,
        viewportHeight: params.project.height / scale,
        ...(spatial
          ? {
              spatial: {
                ...spatial,
                ...(geometry.planeTransform ? { planeTransform: geometry.planeTransform } : {}),
              },
            }
          : {}),
        regionId: destination.id,
        motionBlurAmount: ['INSTANT', 'instant', 'none'].includes(
          destination.incomingConnection!.easing
        )
          ? 0
          : source.motionBlur === undefined
            ? lerpNumber(source.motionBlurAmount ?? 0, destination.motionBlurAmount ?? 0, progress)
            : motionBlurPhaseSetting(source.motionBlur, 'link').enabled
              ? motionBlurPhaseSetting(source.motionBlur, 'link').strength
              : 0,
        overlayZoomMode: resolveMotionOverlayZoomMode(destination.overlayZoomMode),
      };
    }
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
    const spatial = evaluateMotionSpatial(params.project, source, destination, progress);
    return {
      focusPoint,
      scale,
      ...(spatial ? { spatial } : {}),
      ...resolveCameraViewportFrame(params.project, focusPoint, scale),
      regionId: destination.id,
      motionBlurAmount: ['INSTANT', 'instant', 'none'].includes(
        destination.incomingConnection!.easing
      )
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
  if (
    ![point.x, point.y, camera.scale, camera.viewportX, camera.viewportY].every(Number.isFinite) ||
    camera.scale <= 0
  )
    return null;
  if (camera.spatial) {
    const matrix = motionCameraProjection(camera);
    if (!matrix || !matrix.every(Number.isFinite)) return null;
    const mapped = projectQuickEditPoint(matrix, point);
    return mapped && Number.isFinite(mapped.x) && Number.isFinite(mapped.y) ? mapped : null;
  }
  return {
    x: (point.x - camera.viewportX) * camera.scale,
    y: (point.y - camera.viewportY) * camera.scale,
  };
}

/** Axis-aligned paint bounds; interactive frames retain their full projected quadrilateral. */
export function mapCompositionRectThroughCamera(
  rect: { height: number; width: number; x: number; y: number },
  camera: VideoCompositionCameraState
) {
  const points = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ].map((point) => mapCompositionPointThroughCamera(point, camera));
  if (points.some((point) => !point)) return null;
  const xs = points.map((point) => point!.x),
    ys = points.map((point) => point!.y);
  const x = Math.min(...xs),
    y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

export function mapViewportPointToComposition(
  point: { x: number; y: number },
  camera: VideoCompositionCameraState
) {
  if (
    ![point.x, point.y, camera.scale, camera.viewportX, camera.viewportY].every(Number.isFinite) ||
    camera.scale <= 0
  )
    return null;
  if (camera.spatial) {
    const matrix = motionCameraProjection(camera);
    if (!matrix || !matrix.every(Number.isFinite)) return null;
    const inverse = invertQuickEditProjection(matrix);
    const mapped = inverse && projectQuickEditPoint(inverse, point);
    return mapped && Number.isFinite(mapped.x) && Number.isFinite(mapped.y) ? mapped : null;
  }
  return {
    x: point.x / camera.scale + camera.viewportX,
    y: point.y / camera.scale + camera.viewportY,
  };
}
