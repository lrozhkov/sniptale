import {
  motionFocusAreaPoint,
  resizeOrientedMotionArea,
} from '../../../../features/video/project/motion/focus-area';
import { motionWindowFocusToComposition } from '../../../../features/video/composition/motion/source-window';
import { buildDraggedArea } from '../../../interaction/placement-geometry';
import { updateMotionArea } from '../../../interaction/motion-area';
import { resolveAreaPointFromPointer } from './geometry';
import { DEFAULT_PREVIEW_STAGE_SNAP_SETTINGS, snapStagePoint } from '../canvas/snap';
import type { AreaDragParams } from './types';

function attachAreaPointerSession(params: {
  cleanup: () => void;
  handleMove: (event: PointerEvent) => void;
}) {
  window.addEventListener('pointermove', params.handleMove);
  window.addEventListener('pointerup', params.cleanup);
}

export function beginAreaDrag({ area, event, mode, params }: AreaDragParams) {
  const stage = params.stageRef.current;
  const motionRegionId = params.selectedMotionRegion?.id;
  if (!stage || !motionRegionId) {
    return;
  }

  const startPoint = resolveAreaPointFromPointer(
    event.clientX,
    event.clientY,
    stage,
    params.project,
    params.camera,
    params.selectedMotionRegion ?? undefined,
    params.currentTime ?? 0
  );
  if (!startPoint) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const handleMove = createAreaDragMoveHandler({
    area,
    mode,
    motionRegionId,
    params,
    stage,
    startPoint,
  });

  const cleanup = () => {
    window.removeEventListener('pointermove', handleMove);
    window.removeEventListener('pointerup', cleanup);
    params.onGuideChange?.([]);
  };

  attachAreaPointerSession({ cleanup, handleMove });
}

function createAreaDragMoveHandler(args: {
  area: AreaDragParams['area'];
  mode: AreaDragParams['mode'];
  motionRegionId: string;
  params: AreaDragParams['params'];
  stage: HTMLDivElement;
  startPoint: NonNullable<ReturnType<typeof resolveAreaPointFromPointer>>;
}) {
  return (moveEvent: PointerEvent) => {
    const nextPoint = resolveAreaPointFromPointer(
      moveEvent.clientX,
      moveEvent.clientY,
      args.stage,
      args.params.project,
      args.params.camera,
      args.params.selectedMotionRegion ?? undefined,
      args.params.currentTime ?? 0
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
    const snapPoint = args.mode === 'move' ? draggedArea : getAreaResizeSnapPoint(draggedArea);
    const region = args.params.selectedMotionRegion;
    const time = args.params.currentTime ?? 0;
    const snapped = snapStagePoint({
      point: region
        ? motionWindowFocusToComposition(args.params.project, region, snapPoint, time)
        : snapPoint,
      project: args.params.project,
      settings: args.params.grid
        ? {
            gridEnabled: args.params.grid.enabled,
            gridSize: args.params.grid.size,
            gridSnapEnabled: args.params.grid.snapEnabled,
            magnetEnabled: args.params.grid.magnetEnabled,
          }
        : DEFAULT_PREVIEW_STAGE_SNAP_SETTINGS,
    });
    args.params.onGuideChange?.(snapped.guides);
    updateMotionArea(
      args.motionRegionId,
      applyAreaSnap(
        draggedArea,
        region
          ? motionWindowFocusToComposition(args.params.project, region, snapped.point, time, true)
          : snapped.point,
        args.mode
      ),
      args.params.onUpdateMotionRegion
    );
  };
}

function getAreaResizeSnapPoint(area: ReturnType<typeof buildDraggedArea>) {
  return motionFocusAreaPoint(area, 1, 1);
}

function applyAreaSnap(
  area: ReturnType<typeof buildDraggedArea>,
  point: { x: number; y: number },
  mode: 'move' | 'resize'
) {
  if (mode === 'move') {
    return { ...area, x: point.x, y: point.y };
  }

  if (area.axes) {
    const corner = motionFocusAreaPoint(area, 1, 1);
    return resizeOrientedMotionArea(area, 'se', { x: point.x - corner.x, y: point.y - corner.y });
  }
  return {
    ...area,
    height: Math.max(48, point.y - area.y),
    width: Math.max(48, point.x - area.x),
  };
}
