import { useRef, useState } from 'react';
import type { ScenarioCaptureStep } from '../../../features/scenario/contracts/types/project';
import type { ScenarioStepPatch } from '../../project/mutation/helpers';
import { useScenarioCaptureStepDraft } from '../../project/capture-step-draft/useScenarioCaptureStepDraft';
import { type ScenarioWorkspacePanDragState } from './helpers';
import {
  createScenarioWorkspaceCanvasActions,
  createScenarioWorkspacePreviewToggleState,
} from './actions';
import { useScenarioWorkspaceDragSession } from './drag';
import { useScenarioWorkspaceStageScale } from './scale';
import { ScenarioWorkspaceStageShell } from './surface';
import { useScenarioWorkspaceWheelSession } from './wheel';

function useScenarioWorkspaceCaptureCanvasState(props: {
  onOpenQuickEdit: () => void;
  onUpdateStep: (patch: ScenarioStepPatch) => void;
  step: ScenarioCaptureStep;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const { draftStep, setDraftPatch } = useScenarioCaptureStepDraft(props.step);
  const [dragState, setDragState] = useState<ScenarioWorkspacePanDragState | null>(null);
  const { containerRef, scale } = useScenarioWorkspaceStageScale();

  useScenarioWorkspaceDragSession({
    dragState,
    onDragCommit: props.onUpdateStep,
    onDragPreview: setDraftPatch,
    scale,
    setDragState,
  });
  const { flushPendingZoom } = useScenarioWorkspaceWheelSession({
    onUpdateStep: props.onUpdateStep,
    setDraftPatch,
    stageRef,
    step: draftStep,
  });
  const actions = createScenarioWorkspaceCanvasActions({
    flushPendingZoom,
    onOpenQuickEdit: props.onOpenQuickEdit,
    onUpdateStep: props.onUpdateStep,
  });
  const previewToggleState = createScenarioWorkspacePreviewToggleState(draftStep);

  return {
    actions,
    containerRef,
    dragState,
    draftStep,
    previewToggleState,
    scale,
    setDragState,
    stageRef,
  };
}

export function ScenarioWorkspaceCaptureCanvas(props: {
  onOpenQuickEdit: () => void;
  onUpdateStep: (patch: ScenarioStepPatch) => void;
  step: ScenarioCaptureStep;
}) {
  const {
    actions,
    containerRef,
    dragState,
    draftStep,
    previewToggleState,
    scale,
    setDragState,
    stageRef,
  } = useScenarioWorkspaceCaptureCanvasState(props);

  return (
    <ScenarioWorkspaceStageShell
      clickPreviewActive={previewToggleState.clickPreviewActive}
      clickPreviewVisible={previewToggleState.clickPreviewVisible}
      containerRef={containerRef}
      dragging={dragState !== null}
      framePreviewActive={previewToggleState.framePreviewActive}
      framePreviewVisible={previewToggleState.framePreviewVisible}
      onDecreaseZoom={actions.onDecreaseZoom}
      onIncreaseZoom={actions.onIncreaseZoom}
      onOpenEditor={actions.onOpenEditor}
      onResetView={actions.onResetView}
      onToggleClickPreview={actions.onToggleClickPreview}
      onToggleFramePreview={actions.onToggleFramePreview}
      scale={scale}
      setDragState={setDragState}
      stageRef={stageRef}
      step={draftStep}
    />
  );
}
