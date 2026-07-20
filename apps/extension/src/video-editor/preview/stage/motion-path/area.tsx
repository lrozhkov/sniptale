import type React from 'react';

import { translate } from '../../../../platform/i18n/index';
import { resolveMotionPathStopFocusArea } from '../../../../features/video/project/motion/path-targets';
import type { VideoProjectMotionPathStop } from '../../../../features/video/project/types/index';
import { AREA_HANDLE_CLASS_NAME, updateMotionPathAreaStop } from '../area-overlay/shared';
import { buildDraggedArea } from '../../../interaction/placement-geometry';
import {
  getAreaCenterStyle,
  getAreaHandleStyle,
  getAreaStyle,
  resolveAreaPointFromPointer,
} from '../area-overlay/geometry';
import { DEFAULT_PREVIEW_STAGE_SNAP_SETTINGS, snapStagePoint } from '../canvas/snap';
import {
  ACTIVE_PATH_STOP_CLASS_NAME,
  isActiveMotionPathStop,
  type MotionPathOverlayParams,
} from './shared';

const PATH_AREA_CLASS_NAME = [
  'pointer-events-auto absolute border-2',
  'border-[color:var(--sniptale-color-accent-emphasis)] bg-[color:color-mix(',
  'in_srgb,var(--sniptale-color-accent-emphasis)_8%,transparent)]',
  'shadow-[0_0_0_1px_var(--sniptale-color-surface-panel)]',
].join(' ');

const PATH_AREA_LABEL_CLASS_NAME = [
  'pointer-events-none absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center',
  'justify-center rounded-full border text-[11px] font-semibold',
  'border-[color:var(--sniptale-color-border-accent-strong)] bg-[var(--sniptale-color-accent-soft)]',
  'text-[var(--sniptale-color-accent-text)]',
].join(' ');

export function MotionPathAreaHandle(props: {
  index: number;
  motionRegionId: string;
  params: MotionPathOverlayParams;
  stage: HTMLDivElement;
  stop: VideoProjectMotionPathStop;
}) {
  const area = resolveMotionPathStopFocusArea(props.params.project, props.stop);

  return (
    <>
      <button
        type="button"
        aria-label={`${translate('videoEditor.sidebar.motionPathPickStopArea')} ${props.index + 1}`}
        data-preview-stage-area-body="true"
        className={[
          PATH_AREA_CLASS_NAME,
          isActiveMotionPathStop(props.params, props.stop.id) ? ACTIVE_PATH_STOP_CLASS_NAME : '',
        ].join(' ')}
        style={getAreaStyle(props.params.project, area, props.params.camera, props.stage)}
        onPointerDown={(event) => beginMotionPathAreaDrag(props, area, event, 'move')}
      />
      <button
        type="button"
        aria-label={`${translate('videoEditor.sidebar.resizeAreaOnStage')} ${props.index + 1}`}
        data-preview-stage-area-handle="true"
        className={[
          AREA_HANDLE_CLASS_NAME,
          isActiveMotionPathStop(props.params, props.stop.id) ? ACTIVE_PATH_STOP_CLASS_NAME : '',
        ].join(' ')}
        style={getAreaHandleStyle(props.params.project, area, props.params.camera, props.stage)}
        onPointerDown={(event) => beginMotionPathAreaDrag(props, area, event, 'resize')}
      />
      <div
        aria-hidden="true"
        className={PATH_AREA_LABEL_CLASS_NAME}
        style={getAreaCenterStyle(props.params.project, area, props.params.camera, props.stage)}
      >
        {props.index + 1}
      </div>
    </>
  );
}

function beginMotionPathAreaDrag(
  props: {
    motionRegionId: string;
    params: MotionPathOverlayParams;
    stop: VideoProjectMotionPathStop;
    stage: HTMLDivElement;
  },
  area: ReturnType<typeof resolveMotionPathStopFocusArea>,
  event: React.PointerEvent<HTMLElement>,
  mode: 'move' | 'resize'
) {
  const motionRegion = props.params.selectedMotionRegion;
  if (!motionRegion || motionRegion.id !== props.motionRegionId) {
    return;
  }

  const startPoint = resolveAreaPointFromPointer(
    event.clientX,
    event.clientY,
    props.stage,
    props.params.project,
    props.params.camera
  );
  if (!startPoint) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  startMotionPathAreaDragSession(props, area, mode, motionRegion, startPoint);
}

function startMotionPathAreaDragSession(
  props: {
    params: MotionPathOverlayParams;
    stage: HTMLDivElement;
    stop: VideoProjectMotionPathStop;
  },
  area: ReturnType<typeof resolveMotionPathStopFocusArea>,
  mode: 'move' | 'resize',
  motionRegion: NonNullable<MotionPathOverlayParams['selectedMotionRegion']>,
  startPoint: NonNullable<ReturnType<typeof resolveAreaPointFromPointer>>
) {
  const handleMove = createMotionPathAreaMoveHandler({
    area,
    mode,
    motionRegion,
    props,
    startPoint,
  });
  const cleanup = () => {
    window.removeEventListener('pointermove', handleMove);
    window.removeEventListener('pointerup', cleanup);
    props.params.onGuideChange?.([]);
  };

  window.addEventListener('pointermove', handleMove);
  window.addEventListener('pointerup', cleanup);
}

function createMotionPathAreaMoveHandler(args: {
  area: ReturnType<typeof resolveMotionPathStopFocusArea>;
  mode: 'move' | 'resize';
  motionRegion: NonNullable<MotionPathOverlayParams['selectedMotionRegion']>;
  props: {
    params: MotionPathOverlayParams;
    stage: HTMLDivElement;
    stop: VideoProjectMotionPathStop;
  };
  startPoint: NonNullable<ReturnType<typeof resolveAreaPointFromPointer>>;
}) {
  return (moveEvent: PointerEvent) => {
    const nextPoint = resolveAreaPointFromPointer(
      moveEvent.clientX,
      moveEvent.clientY,
      args.props.stage,
      args.props.params.project,
      args.props.params.camera
    );
    if (!nextPoint) {
      return;
    }

    const draggedArea = buildDraggedArea(
      args.area,
      nextPoint.x - args.startPoint.x,
      nextPoint.y - args.startPoint.y,
      args.mode
    );
    const snapPoint = args.mode === 'move' ? draggedArea : getPathAreaResizeSnapPoint(draggedArea);
    const snapped = snapStagePoint({
      point: snapPoint,
      project: args.props.params.project,
      settings: getMotionPathSnapSettings(args.props.params),
    });
    args.props.params.onGuideChange?.(snapped.guides);

    updateMotionPathAreaStop({
      area: applyPathAreaSnap(draggedArea, snapped.point, args.mode),
      motionRegion: args.motionRegion,
      onUpdateMotionRegion: args.props.params.onUpdateMotionRegion,
      project: args.props.params.project,
      stopId: args.props.stop.id,
    });
  };
}

function getMotionPathSnapSettings(params: MotionPathOverlayParams) {
  return params.grid
    ? {
        gridEnabled: params.grid.enabled,
        gridSize: params.grid.size,
        gridSnapEnabled: params.grid.snapEnabled,
        magnetEnabled: params.grid.magnetEnabled,
      }
    : DEFAULT_PREVIEW_STAGE_SNAP_SETTINGS;
}

function getPathAreaResizeSnapPoint(area: ReturnType<typeof buildDraggedArea>) {
  return {
    x: area.x + area.width,
    y: area.y + area.height,
  };
}

function applyPathAreaSnap(
  area: ReturnType<typeof buildDraggedArea>,
  point: { x: number; y: number },
  mode: 'move' | 'resize'
) {
  if (mode === 'move') {
    return { ...area, x: point.x, y: point.y };
  }

  return {
    ...area,
    height: Math.max(48, point.y - area.y),
    width: Math.max(48, point.x - area.x),
  };
}
