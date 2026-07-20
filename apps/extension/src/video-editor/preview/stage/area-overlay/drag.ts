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
    params.camera
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
      args.params.camera
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
    const snapped = snapStagePoint({
      point: snapPoint,
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
      applyAreaSnap(draggedArea, snapped.point, args.mode),
      args.params.onUpdateMotionRegion
    );
  };
}

function getAreaResizeSnapPoint(area: ReturnType<typeof buildDraggedArea>) {
  return {
    x: area.x + area.width,
    y: area.y + area.height,
  };
}

function applyAreaSnap(
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
