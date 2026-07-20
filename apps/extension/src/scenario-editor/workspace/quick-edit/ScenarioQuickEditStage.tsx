import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { measureImageBlob } from '@sniptale/platform/browser/media/image-dimensions';
import { getScenarioAssetBlob } from '../../../composition/persistence/scenario/store/public';
import { resolveScenarioStageLayout } from '../../../features/scenario/stage/layout';
import type { ScenarioCaptureStep } from '../../../features/scenario/contracts/types/project';
import { type ScenarioQuickEditTool } from './stage.helpers';
import type { ScenarioQuickEditDragState } from './stage.types';
import { didScenarioDragMove } from '../../project/capture-step-draft/drag-move';
import { useScenarioCaptureStepDraft } from '../../project/capture-step-draft/useScenarioCaptureStepDraft';
import { createPointerPreviewScheduler, toPointerPreviewPoint } from '../drag-preview/frame';
import { buildQuickEditDragPatch } from './stage.interactions';
import { ScenarioQuickEditStageSurface } from './stage.surface';

function useScenarioQuickEditAssetDimensions(assetId: string) {
  const [assetDimensions, setAssetDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAssetDimensions(null);

    void getScenarioAssetBlob(assetId)
      .then((blob) => (blob ? measureImageBlob(blob) : null))
      .then((dimensions) => {
        if (!cancelled) {
          setAssetDimensions(dimensions);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAssetDimensions(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [assetId]);

  return assetDimensions;
}

function useScenarioQuickEditDragSession(args: {
  dragState: ScenarioQuickEditDragState | null;
  layout: ReturnType<typeof resolveScenarioStageLayout> | null;
  onDragCommit: (patch: Partial<ScenarioCaptureStep>) => void;
  onDragPreview: (patch: Partial<ScenarioCaptureStep> | null) => void;
  setDragState: (value: ScenarioQuickEditDragState | null) => void;
}) {
  const { dragState, layout, onDragCommit, onDragPreview, setDragState } = args;

  useEffect(() => {
    if (!dragState || !layout) {
      return;
    }

    const previewScheduler = createPointerPreviewScheduler((point) => {
      const patch = buildQuickEditDragPatch(dragState, layout, point);
      if (patch) {
        startTransition(() => {
          onDragPreview(patch);
        });
      }
    });

    const handlePointerMove = (event: PointerEvent) => {
      previewScheduler.schedule(toPointerPreviewPoint(event));
    };

    const handlePointerUp = createQuickEditPointerUpHandler({
      dragState,
      layout,
      onDragCommit,
      onDragPreview,
      previewScheduler,
      setDragState,
    });
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });

    return () => {
      previewScheduler.cancel();
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      startTransition(() => {
        onDragPreview(null);
      });
    };
  }, [dragState, layout, onDragCommit, onDragPreview, setDragState]);
}

function createQuickEditPointerUpHandler(args: {
  dragState: ScenarioQuickEditDragState;
  layout: ReturnType<typeof resolveScenarioStageLayout>;
  onDragCommit: (patch: Partial<ScenarioCaptureStep>) => void;
  onDragPreview: (patch: Partial<ScenarioCaptureStep> | null) => void;
  previewScheduler: ReturnType<typeof createPointerPreviewScheduler>;
  setDragState: (value: ScenarioQuickEditDragState | null) => void;
}) {
  return (event: PointerEvent) => {
    args.previewScheduler.cancel();

    if (didScenarioDragMove(args.dragState.origin, event)) {
      const patch = buildQuickEditDragPatch(
        args.dragState,
        args.layout,
        toPointerPreviewPoint(event)
      );
      if (patch) {
        args.onDragCommit(patch);
      }
    }

    startTransition(() => {
      args.onDragPreview(null);
    });
    args.setDragState(null);
  };
}

export function ScenarioQuickEditStage(props: {
  activeTool: ScenarioQuickEditTool;
  onActiveToolChange: (tool: ScenarioQuickEditTool) => void;
  onSelectOverlay: (overlayId: string | null) => void;
  onStepChange: (patch: Partial<ScenarioCaptureStep>) => void;
  selectedOverlayId: string | null;
  step: ScenarioCaptureStep;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [dragState, setDragState] = useState<ScenarioQuickEditDragState | null>(null);
  const { draftStep, setDraftPatch } = useScenarioCaptureStepDraft(props.step);
  const assetDimensions = useScenarioQuickEditAssetDimensions(draftStep.assetId);
  const layout = useMemo(
    () => (assetDimensions ? resolveScenarioStageLayout(draftStep, assetDimensions) : null),
    [assetDimensions, draftStep]
  );

  useScenarioQuickEditDragSession({
    dragState,
    layout,
    onDragCommit: props.onStepChange,
    onDragPreview: setDraftPatch,
    setDragState,
  });

  return (
    <ScenarioQuickEditStageSurface
      activeTool={props.activeTool}
      layout={layout}
      onActiveToolChange={props.onActiveToolChange}
      onSelectOverlay={props.onSelectOverlay}
      onStepChange={props.onStepChange}
      selectedOverlayId={props.selectedOverlayId}
      setDragState={setDragState}
      stageRef={stageRef}
      step={draftStep}
    />
  );
}
