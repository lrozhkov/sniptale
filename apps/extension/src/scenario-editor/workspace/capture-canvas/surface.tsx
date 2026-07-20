import type { ReactNode } from 'react';
import { Minus, PenSquare, Plus, RotateCcw } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import {
  SCENARIO_STAGE_HEIGHT,
  SCENARIO_STAGE_WIDTH,
} from '../../../features/scenario/stage/layout';
import type { ScenarioCaptureStep } from '../../../features/scenario/contracts/types/project';
import { ScenarioWorkspacePreviewActions } from './preview-actions';
import { resolveWorkspaceStagePoint, type ScenarioWorkspacePanDragState } from './helpers';
import { ScenarioWorkspacePreview } from './preview';
import { CAPTURE_CANVAS_ACTION_CLASS_NAME } from './surface.constants';

function ScenarioWorkspaceCanvasActionButton(props: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={CAPTURE_CANVAS_ACTION_CLASS_NAME}
      title={props.label}
      aria-label={props.label}
    >
      {props.icon}
    </button>
  );
}

function ScenarioWorkspaceCanvasActions(props: {
  onDecreaseZoom: () => void;
  onIncreaseZoom: () => void;
  onOpenEditor: () => void;
  onResetView: () => void;
}) {
  return (
    <div
      className="pointer-events-none absolute right-4 top-4 flex items-center gap-2
        opacity-0 transition group-hover:opacity-100"
    >
      <div className="pointer-events-auto flex items-center gap-2">
        <ScenarioWorkspaceCanvasActionButton
          icon={<Plus className="h-4 w-4" />}
          label={translate('scenario.editor.zoomIn')}
          onClick={props.onIncreaseZoom}
        />
        <ScenarioWorkspaceCanvasActionButton
          icon={<Minus className="h-4 w-4" />}
          label={translate('scenario.editor.zoomOut')}
          onClick={props.onDecreaseZoom}
        />
        <ScenarioWorkspaceCanvasActionButton
          icon={<RotateCcw className="h-4 w-4" />}
          label={translate('scenario.editor.resetView')}
          onClick={props.onResetView}
        />
        <ScenarioWorkspaceCanvasActionButton
          icon={<PenSquare className="h-4 w-4" />}
          label={translate('scenario.editor.quickEdit')}
          onClick={props.onOpenEditor}
        />
      </div>
    </div>
  );
}

export function ScenarioWorkspaceStageShell(props: {
  clickPreviewActive: boolean;
  clickPreviewVisible: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  dragging: boolean;
  framePreviewActive: boolean;
  framePreviewVisible: boolean;
  onDecreaseZoom: () => void;
  onIncreaseZoom: () => void;
  onOpenEditor: () => void;
  onResetView: () => void;
  onToggleClickPreview: () => void;
  onToggleFramePreview: () => void;
  scale: number;
  setDragState: (value: ScenarioWorkspacePanDragState | null) => void;
  stageRef: React.RefObject<HTMLDivElement | null>;
  step: ScenarioCaptureStep;
}) {
  return (
    <div ref={props.containerRef} className="mx-auto w-full max-w-[720px]">
      <div
        className="group relative"
        style={{ height: `${SCENARIO_STAGE_HEIGHT * props.scale}px` }}
      >
        <ScenarioWorkspaceStageSurface
          dragging={props.dragging}
          onOpenEditor={props.onOpenEditor}
          scale={props.scale}
          setDragState={props.setDragState}
          stageRef={props.stageRef}
          step={props.step}
        />
        <ScenarioWorkspaceCanvasActions
          onDecreaseZoom={props.onDecreaseZoom}
          onIncreaseZoom={props.onIncreaseZoom}
          onOpenEditor={props.onOpenEditor}
          onResetView={props.onResetView}
        />
        <ScenarioWorkspacePreviewActions
          clickActive={props.clickPreviewActive}
          clickVisible={props.clickPreviewVisible}
          frameActive={props.framePreviewActive}
          frameVisible={props.framePreviewVisible}
          onToggleClick={props.onToggleClickPreview}
          onToggleFrame={props.onToggleFramePreview}
        />
      </div>
    </div>
  );
}

function ScenarioWorkspaceStageSurface(props: {
  dragging: boolean;
  onOpenEditor: () => void;
  scale: number;
  setDragState: (value: ScenarioWorkspacePanDragState | null) => void;
  stageRef: React.RefObject<HTMLDivElement | null>;
  step: ScenarioCaptureStep;
}) {
  return (
    <div
      ref={props.stageRef}
      onDoubleClick={props.onOpenEditor}
      onPointerDown={(event) => handleWorkspaceStagePointerDown(props, event)}
      onDragStart={(event) => event.preventDefault()}
      className={`relative touch-none ${props.dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      style={{
        width: `${SCENARIO_STAGE_WIDTH}px`,
        height: `${SCENARIO_STAGE_HEIGHT}px`,
        transform: `scale(${props.scale})`,
        transformOrigin: 'top left',
      }}
    >
      <WorkspaceStageArtwork step={props.step} />
    </div>
  );
}

function handleWorkspaceStagePointerDown(
  props: {
    dragging: boolean;
    setDragState: (value: ScenarioWorkspacePanDragState | null) => void;
    stageRef: React.RefObject<HTMLDivElement | null>;
    step: ScenarioCaptureStep;
  },
  event: React.PointerEvent<HTMLDivElement>
) {
  event.preventDefault();
  event.stopPropagation();

  if (!resolveWorkspaceStagePoint(props.stageRef, event)) {
    return;
  }

  props.setDragState({
    origin: { x: event.clientX, y: event.clientY },
    snapshot: props.step,
  });
}

function WorkspaceStageArtwork(props: { step: ScenarioCaptureStep }) {
  return <ScenarioWorkspacePreview step={props.step} />;
}
