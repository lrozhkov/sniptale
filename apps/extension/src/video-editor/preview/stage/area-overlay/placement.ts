import type React from 'react';

import { VideoEditorPlacementModeKind } from '../../../contracts/placement';
import { createSquareArea } from '../../../interaction/placement-geometry';
import { updateMotionArea } from '../../../interaction/motion-area';
import { resolveAreaPointFromPointer } from './geometry';

import type { AreaOverlayParams } from './types';

type AreaPlacementMode = Extract<
  NonNullable<AreaOverlayParams['placementMode']>,
  { kind: typeof VideoEditorPlacementModeKind.MOTION_AREA }
>;

export function handleStageAreaPlacement(
  event: React.PointerEvent<HTMLDivElement>,
  params: AreaOverlayParams
): boolean {
  const placementMode = params.placementMode;
  if (placementMode?.kind !== VideoEditorPlacementModeKind.MOTION_AREA) {
    return false;
  }

  const stage = params.stageRef.current;
  if (!stage) {
    params.onClearPlacementMode();
    return true;
  }

  const anchorPoint = resolveAreaPointFromPointer(
    event.clientX,
    event.clientY,
    stage,
    params.project,
    params.camera
  );
  if (!anchorPoint) {
    params.onClearPlacementMode();
    return true;
  }

  event.preventDefault();
  event.stopPropagation();

  const area = createSquareArea(anchorPoint, anchorPoint);
  applyAreaPlacement(params, placementMode, area);
  startAreaPlacementSession(params, placementMode, stage, anchorPoint);
  return true;
}

function applyAreaPlacement(
  params: AreaOverlayParams,
  placementMode: AreaPlacementMode,
  area: ReturnType<typeof createSquareArea>
) {
  updateMotionArea(placementMode.motionRegionId, area, params.onUpdateMotionRegion);
}

function startAreaPlacementSession(
  params: AreaOverlayParams,
  placementMode: AreaPlacementMode,
  stage: HTMLDivElement,
  anchorPoint: ReturnType<typeof resolveAreaPointFromPointer>
) {
  const handleMove = (moveEvent: PointerEvent) => {
    const nextPoint = resolveAreaPointFromPointer(
      moveEvent.clientX,
      moveEvent.clientY,
      stage,
      params.project,
      params.camera
    );
    if (!nextPoint || !anchorPoint) {
      return;
    }

    applyAreaPlacement(params, placementMode, createSquareArea(anchorPoint, nextPoint));
  };
  const handleEnd = () => {
    window.removeEventListener('pointermove', handleMove);
    window.removeEventListener('pointerup', handleEnd);
    params.onClearPlacementMode();
  };

  window.addEventListener('pointermove', handleMove);
  window.addEventListener('pointerup', handleEnd);
}
