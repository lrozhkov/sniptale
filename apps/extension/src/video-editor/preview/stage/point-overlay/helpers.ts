import type React from 'react';

import { translate } from '../../../../platform/i18n';
import {
  createMotionPathPointTarget,
  resolveMotionPathStopScale,
} from '../../../../features/video/project/motion/path-targets';
import {
  VideoMotionCameraMode,
  VideoMotionFocusMode,
} from '../../../../features/video/project/types/index';
import type { VideoEditorPlacementMode } from '../../../contracts/placement';
import { clampStagePoint, getProjectCenter } from '../../../interaction/placement-geometry';
import {
  createActionPointPlacementMode,
  createMotionFocusPlacementMode,
} from '../../../project/selection/placement';
import { VideoEditorPlacementModeKind } from '../../../contracts/placement';
import { resolveMotionPath, updateMotionPathStop } from '../../../project/motion-path/core';
import {
  getCompositionPointStageStyle,
  mapClientPointToCompositionPoint,
} from '../canvas/geometry';
import type { PreviewStageCanvasProps } from '../types';
import type { PointOverlayParams, PointPlacementParams, StagePoint } from './types';

export const POINT_HANDLE_CLASS_NAME = [
  'pointer-events-auto absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2',
  'border-[color:var(--sniptale-color-text-primary-strong)] bg-[var(--sniptale-color-accent-emphasis)]',
  'shadow-[0_0_0_3px_var(--sniptale-color-surface-panel)]',
].join(' ');

export const POINT_HINT_CLASS_NAME = [
  'pointer-events-none absolute left-3 top-3 rounded-[10px] px-3 py-2 text-xs font-medium',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_90%,transparent)]',
  'text-[var(--sniptale-color-text-primary)] shadow-[0_10px_24px_rgba(0,0,0,0.18)]',
].join(' ');

export function resolvePointFromPointer(
  clientX: number,
  clientY: number,
  stage: HTMLDivElement,
  project: PreviewStageCanvasProps['project'],
  camera: PreviewStageCanvasProps['camera']
): StagePoint | null {
  const point = mapClientPointToCompositionPoint({
    camera,
    clientX,
    clientY,
    lockToViewport: false,
    project,
    stage,
  });
  if (!point) {
    return null;
  }

  return clampStagePoint(project, point);
}

export function updatePlacementPoint(
  placementMode: VideoEditorPlacementMode,
  point: StagePoint,
  params: PointPlacementParams
): void {
  switch (placementMode.kind) {
    case VideoEditorPlacementModeKind.ACTION_POINT:
      params.onUpdateActionEventDetails(placementMode.actionEventId, { point });
      return;
    case VideoEditorPlacementModeKind.MOTION_FOCUS:
      params.onUpdateMotionRegion(placementMode.motionRegionId, { focusPoint: point });
      return;
    case VideoEditorPlacementModeKind.MOTION_AREA:
    case VideoEditorPlacementModeKind.MOTION_PATH_STOP_AREA:
      return;
    case VideoEditorPlacementModeKind.MOTION_PATH_STOP_POINT:
      updateMotionPathStopPoint(params, placementMode.motionRegionId, placementMode.stopId, point);
      return;
    case VideoEditorPlacementModeKind.OBJECT_TRACK_ANCHOR:
      params.onUpsertObjectTrackCorrectionAnchor?.(placementMode.objectTrackId, {
        confidence: 1,
        time: params.currentTime ?? 0,
        x: point.x,
        y: point.y,
      });
      return;
  }
}

export function updateSelectedPoint(params: PointOverlayParams, point: StagePoint): void {
  if (!params.placementMode) {
    return;
  }

  updatePlacementPoint(params.placementMode, point, params);
}

export function getPointHandleStyle(
  project: PreviewStageCanvasProps['project'],
  point: StagePoint,
  camera: PreviewStageCanvasProps['camera'],
  stage: HTMLDivElement
): React.CSSProperties {
  return getCompositionPointStageStyle(project, point, camera, false, stage);
}

export function getSelectedPoint(params: PointOverlayParams): StagePoint | null {
  if (
    params.selectedMotionRegion &&
    params.selectedMotionRegion.cameraMode !== VideoMotionCameraMode.PATH &&
    params.selectedMotionRegion.focusMode === VideoMotionFocusMode.MANUAL
  ) {
    return params.selectedMotionRegion.focusPoint ?? getProjectCenter(params.project);
  }

  if (params.selectedActionEvent) {
    return params.selectedActionEvent.point ?? getProjectCenter(params.project);
  }

  return null;
}

export function getSelectedPointTarget(
  params: PointOverlayParams
): VideoEditorPlacementMode | null {
  if (
    params.selectedMotionRegion &&
    params.selectedMotionRegion.cameraMode !== VideoMotionCameraMode.PATH &&
    params.selectedMotionRegion.focusMode === VideoMotionFocusMode.MANUAL
  ) {
    return createMotionFocusPlacementMode(params.selectedMotionRegion.id);
  }

  if (params.selectedActionEvent) {
    return createActionPointPlacementMode(params.selectedActionEvent.id);
  }

  return null;
}

export function getPlacementHint(placementMode: VideoEditorPlacementMode | null): string | null {
  if (!placementMode) {
    return null;
  }

  switch (placementMode.kind) {
    case VideoEditorPlacementModeKind.ACTION_POINT:
      return translate('videoEditor.sidebar.actionPointPickHint');
    case VideoEditorPlacementModeKind.MOTION_FOCUS:
      return translate('videoEditor.sidebar.motionFocusPickHint');
    case VideoEditorPlacementModeKind.MOTION_AREA:
    case VideoEditorPlacementModeKind.MOTION_PATH_STOP_AREA:
    case VideoEditorPlacementModeKind.MOTION_PATH_STOP_POINT:
      return null;
    case VideoEditorPlacementModeKind.OBJECT_TRACK_ANCHOR:
      return translate('videoEditor.sidebar.objectTrackAnchorPickHint');
  }
}

export function canRenderSelectedPoint(params: PointOverlayParams): boolean {
  if (params.selectedMotionRegion) {
    return (
      params.selectedMotionRegion.cameraMode !== VideoMotionCameraMode.PATH &&
      params.selectedMotionRegion.focusMode === VideoMotionFocusMode.MANUAL
    );
  }

  return params.selectedActionEvent !== null;
}

function updateMotionPathStopPoint(
  params: PointPlacementParams,
  motionRegionId: string,
  stopId: string,
  point: StagePoint
) {
  if (!params.selectedMotionRegion || params.selectedMotionRegion.id !== motionRegionId) {
    return;
  }

  const path = resolveMotionPath(params.project, params.selectedMotionRegion);
  const nextPath = updateMotionPathStop(path, stopId, (stop) => ({
    ...stop,
    target: createMotionPathPointTarget(
      params.project,
      point,
      resolveMotionPathStopScale(params.project, stop)
    ),
  }));

  params.onUpdateMotionRegion(motionRegionId, {
    cameraMode: VideoMotionCameraMode.PATH,
    path: nextPath,
  });
}
