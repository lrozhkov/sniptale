import { resolvePointFromPointer, updatePlacementPoint } from './helpers';
import { DEFAULT_PREVIEW_STAGE_SNAP_SETTINGS, snapStagePoint } from '../canvas/snap';
import type { PointDragParams } from './types';

export function beginPointHandleDrag(params: PointDragParams): void {
  const stage = params.stageRef.current;
  if (!stage) {
    return;
  }

  params.event.preventDefault();
  params.event.stopPropagation();
  updatePlacementPoint(params.target, params.point, params);

  const handlePointerMove = (event: PointerEvent) => {
    const nextPoint = resolvePointFromPointer(
      event.clientX,
      event.clientY,
      stage,
      params.project,
      params.camera
    );
    if (nextPoint) {
      const snapped = snapStagePoint({
        point: nextPoint,
        project: params.project,
        settings: params.grid
          ? {
              gridEnabled: params.grid.enabled,
              gridSize: params.grid.size,
              gridSnapEnabled: params.grid.snapEnabled,
              magnetEnabled: params.grid.magnetEnabled,
            }
          : DEFAULT_PREVIEW_STAGE_SNAP_SETTINGS,
      });
      params.onGuideChange?.(snapped.guides);
      updatePlacementPoint(params.target, snapped.point, params);
    }
  };

  const cleanup = () => {
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', cleanup);
    params.onGuideChange?.([]);
  };

  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', cleanup);
}
