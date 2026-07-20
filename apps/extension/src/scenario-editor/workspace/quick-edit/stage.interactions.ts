import type { PointerEvent as ReactPointerEvent } from 'react';
import type { resolveScenarioStageLayout } from '../../../features/scenario/stage/layout';
import type { ScenarioPoint } from '@sniptale/runtime-contracts/scenario/types/geometry';
import type { ScenarioCaptureStep } from '../../../features/scenario/contracts/types/project';
import { updateScenarioOverlay } from './helpers';
import { createOverlayAtPoint } from './overlay-placement';
import {
  isRectOverlay,
  moveArrowEndpointByStageDelta,
  moveOverlayByStageDelta,
  resizeRectOverlayByStageDelta,
  type ScenarioQuickEditTool,
  unprojectStagePoint,
} from './stage.helpers';
import type { ScenarioQuickEditDragState } from './stage.types';

type OverlayDragState = Extract<ScenarioQuickEditDragState, { overlayId: string }>;

export function buildQuickEditDragPatch(
  dragState: ScenarioQuickEditDragState,
  layout: NonNullable<ReturnType<typeof resolveScenarioStageLayout>>,
  event: Pick<PointerEvent, 'clientX' | 'clientY'>
): Partial<ScenarioCaptureStep> | null {
  const deltaX = event.clientX - dragState.origin.x;
  const deltaY = event.clientY - dragState.origin.y;

  if (dragState.kind === 'pan') {
    return {
      imageTransform: {
        ...dragState.snapshot.imageTransform,
        x: dragState.snapshot.imageTransform.x + deltaX,
        y: dragState.snapshot.imageTransform.y + deltaY,
      },
    };
  }

  return buildQuickEditOverlayPatch(dragState, layout, deltaX, deltaY);
}

function buildQuickEditOverlayPatch(
  dragState: OverlayDragState,
  layout: NonNullable<ReturnType<typeof resolveScenarioStageLayout>>,
  deltaX: number,
  deltaY: number
): Partial<ScenarioCaptureStep> | null {
  const overlay = dragState.snapshot.overlays.find((item) => item.id === dragState.overlayId);
  if (!overlay) {
    return null;
  }

  const nextOverlay =
    dragState.kind === 'move-overlay'
      ? moveOverlayByStageDelta(layout, overlay, deltaX, deltaY)
      : dragState.kind === 'resize-overlay' && 'rect' in overlay
        ? resizeRectOverlayByStageDelta(layout, overlay, dragState.handle, deltaX, deltaY)
        : dragState.kind === 'move-arrow-endpoint' && overlay.kind === 'arrow'
          ? moveArrowEndpointByStageDelta(layout, overlay, dragState.endpoint, deltaX, deltaY)
          : overlay;

  return {
    overlays: updateScenarioOverlay(
      dragState.snapshot.overlays,
      dragState.overlayId,
      () => nextOverlay
    ),
  };
}

export function createOverlayFromTool(args: {
  activeTool: Exclude<ScenarioQuickEditTool, 'select' | 'pan'>;
  event: ReactPointerEvent;
  layout: NonNullable<ReturnType<typeof resolveScenarioStageLayout>>;
  onActiveToolChange: (tool: ScenarioQuickEditTool) => void;
  onSelectOverlay: (overlayId: string | null) => void;
  onStepChange: (patch: Partial<ScenarioCaptureStep>) => void;
  setDragState: (value: ScenarioQuickEditDragState | null) => void;
  stagePoint: ScenarioPoint;
  step: ScenarioCaptureStep;
}) {
  const nextOverlay = createOverlayAtPoint(
    args.step,
    args.activeTool,
    unprojectStagePoint(args.layout, args.stagePoint)
  );
  const nextOverlays = [...args.step.overlays, nextOverlay];
  const nextStep = {
    ...args.step,
    overlays: nextOverlays,
  };

  args.onStepChange({ overlays: nextOverlays });
  args.onSelectOverlay(nextOverlay.id);
  args.setDragState(
    createOverlayDragState({
      activeTool: args.activeTool,
      event: args.event,
      nextOverlay,
      nextStep,
    })
  );
  args.onActiveToolChange('select');
}

function createOverlayDragState(args: {
  activeTool: ScenarioQuickEditTool;
  event: ReactPointerEvent;
  nextOverlay: ScenarioCaptureStep['overlays'][number];
  nextStep: ScenarioCaptureStep;
}): ScenarioQuickEditDragState {
  if (args.activeTool === 'arrow') {
    return {
      kind: 'move-arrow-endpoint',
      endpoint: 'end',
      origin: { x: args.event.clientX, y: args.event.clientY },
      overlayId: args.nextOverlay.id,
      snapshot: args.nextStep,
    };
  }

  if (isRectOverlay(args.nextOverlay)) {
    return {
      kind: 'resize-overlay',
      handle: 'se',
      origin: { x: args.event.clientX, y: args.event.clientY },
      overlayId: args.nextOverlay.id,
      snapshot: args.nextStep,
    };
  }

  return {
    kind: 'move-overlay',
    origin: { x: args.event.clientX, y: args.event.clientY },
    overlayId: args.nextOverlay.id,
    snapshot: args.nextStep,
  };
}
