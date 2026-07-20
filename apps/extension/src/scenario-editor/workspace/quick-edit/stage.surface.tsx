import type { MutableRefObject, PointerEvent as ReactPointerEvent } from 'react';
import { translate } from '../../../platform/i18n';
import { ScenarioCaptureStage } from './capture-stage';
import type { resolveScenarioStageLayout } from '../../../features/scenario/stage/layout';
import {
  SCENARIO_STAGE_HEIGHT,
  SCENARIO_STAGE_WIDTH,
} from '../../../features/scenario/stage/layout';
import type { ScenarioPoint } from '@sniptale/runtime-contracts/scenario/types/geometry';
import type { ScenarioCaptureStep } from '../../../features/scenario/contracts/types/project';
import { clamp, type ScenarioQuickEditTool, zoomImageTransform } from './stage.helpers';
import type { ScenarioQuickEditDragState } from './stage.types';
import { ScenarioQuickEditStageOverlayLayer } from './ScenarioQuickEditOverlayLayer';
import { createOverlayFromTool } from './stage.interactions';

export type ScenarioQuickEditStageSurfaceProps = {
  activeTool: ScenarioQuickEditTool;
  layout: ReturnType<typeof resolveScenarioStageLayout> | null;
  onActiveToolChange: (tool: ScenarioQuickEditTool) => void;
  onSelectOverlay: (overlayId: string | null) => void;
  onStepChange: (patch: Partial<ScenarioCaptureStep>) => void;
  selectedOverlayId: string | null;
  setDragState: (value: ScenarioQuickEditDragState | null) => void;
  stageRef: MutableRefObject<HTMLDivElement | null>;
  step: ScenarioCaptureStep;
};

export function resolveStagePoint(
  stageRef: MutableRefObject<HTMLDivElement | null>,
  event: ReactPointerEvent | Pick<PointerEvent, 'clientX' | 'clientY'>
): ScenarioPoint | null {
  const stage = stageRef.current?.getBoundingClientRect();
  if (!stage) {
    return null;
  }

  return {
    x: clamp(event.clientX - stage.left, 0, SCENARIO_STAGE_WIDTH),
    y: clamp(event.clientY - stage.top, 0, SCENARIO_STAGE_HEIGHT),
  };
}

export function handleQuickEditStagePointerDown(
  props: ScenarioQuickEditStageSurfaceProps,
  event: ReactPointerEvent
) {
  event.preventDefault();
  const stagePoint = resolveStagePoint(props.stageRef, event);
  if (!stagePoint || !props.layout) {
    return;
  }

  if (props.activeTool === 'pan') {
    props.setDragState({
      kind: 'pan',
      origin: { x: event.clientX, y: event.clientY },
      snapshot: props.step,
    });
    return;
  }

  if (props.activeTool !== 'select') {
    createOverlayFromTool({
      activeTool: props.activeTool,
      event,
      layout: props.layout,
      onActiveToolChange: props.onActiveToolChange,
      onSelectOverlay: props.onSelectOverlay,
      onStepChange: props.onStepChange,
      setDragState: props.setDragState,
      stagePoint,
      step: props.step,
    });
    return;
  }

  props.onSelectOverlay(null);
  props.setDragState({
    kind: 'pan',
    origin: { x: event.clientX, y: event.clientY },
    snapshot: props.step,
  });
}

export function ScenarioQuickEditStageSurface(props: ScenarioQuickEditStageSurfaceProps) {
  return (
    <div className="mx-auto w-full max-w-[920px]">
      <div
        ref={props.stageRef}
        onPointerDown={(event) => handleQuickEditStagePointerDown(props, event)}
        onWheel={(event) => {
          event.preventDefault();
          props.onStepChange({
            imageTransform: zoomImageTransform(props.step, event.deltaY > 0 ? -0.08 : 0.08),
          });
        }}
        className="relative mx-auto h-[420px] w-[720px] touch-none"
      >
        <QuickEditStageArtwork {...props} />
      </div>
    </div>
  );
}

function QuickEditStageArtwork(props: {
  layout: ReturnType<typeof resolveScenarioStageLayout> | null;
  onSelectOverlay: (overlayId: string | null) => void;
  selectedOverlayId: string | null;
  setDragState: (value: ScenarioQuickEditDragState | null) => void;
  step: ScenarioCaptureStep;
}) {
  return (
    <>
      <ScenarioCaptureStage
        step={props.step}
        selectedOverlayId={props.selectedOverlayId}
        altLabel={translate('scenario.editor.untitledStep')}
        className="h-[420px] w-[720px]"
      />
      {props.layout ? (
        <ScenarioQuickEditStageOverlayLayer
          beginDrag={props.setDragState}
          layout={props.layout}
          onSelectOverlay={props.onSelectOverlay}
          selectedOverlayId={props.selectedOverlayId}
          step={props.step}
        />
      ) : null}
    </>
  );
}
