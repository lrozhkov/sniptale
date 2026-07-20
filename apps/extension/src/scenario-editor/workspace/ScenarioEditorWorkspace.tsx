import { useEffect, useState } from 'react';
import type {
  ScenarioProject,
  ScenarioStepPatch,
} from '../../features/scenario/contracts/types/project';
import type { ScenarioEditorInsertImagePayload } from '../project/state/types';
import {
  ScenarioEditorWorkspaceViewport,
  type ScenarioEditorWorkspaceViewportProps,
} from './items';
import { ScenarioImageInsertOverlay } from './ScenarioImageInsertOverlay';
import { useScenarioWorkspaceVirtualization } from './useScenarioWorkspaceVirtualization';

type ScenarioEditorWorkspaceProps = {
  canRedoStep: (stepId: string) => boolean;
  canUndoStep: (stepId: string) => boolean;
  onDeleteStep: (stepId: string) => void;
  onDuplicateStep: (stepId: string) => Promise<void>;
  onInspectStep: (stepId: string) => void;
  onInsertImage: (index: number, payload: ScenarioEditorInsertImagePayload) => Promise<void>;
  project: ScenarioProject;
  onInsert: (index: number, kind: 'section' | 'note' | 'divider') => void;
  onMoveStepByOffset: (stepId: string, offset: number) => void;
  onMoveStepToPosition: (stepId: string, position: number) => void;
  onOpenQuickEdit: (stepId: string) => void;
  onSelectStep: (stepId: string) => void;
  onUpdateStep: (stepId: string, patch: ScenarioStepPatch) => void;
  onVisibleStepChange: (stepId: string | null) => void;
  onRedoStep: (stepId: string) => void;
  onUndoStep: (stepId: string) => void;
  selectedStepId: string | null;
};

function useSelectedWorkspaceStepScroll(args: {
  scrollContainerNodeRef: { current: HTMLDivElement | null };
  selectedStepId: string | null;
  workspaceWindow: ReturnType<typeof useScenarioWorkspaceVirtualization>['workspaceWindow'];
}) {
  const [lastScrolledStepId, setLastScrolledStepId] = useState<string | null>(null);

  useEffect(() => {
    if (
      !args.selectedStepId ||
      !args.scrollContainerNodeRef.current ||
      args.selectedStepId === lastScrolledStepId
    ) {
      return;
    }

    const targetItem = args.workspaceWindow.items.find(
      (item) => item.kind === 'step' && item.step != null && item.step.id === args.selectedStepId
    );
    if (!targetItem) {
      return;
    }

    const scrollContainer = args.scrollContainerNodeRef.current;
    const itemEnd = targetItem.start + targetItem.size;
    const viewportTop = scrollContainer.scrollTop;
    const viewportBottom = viewportTop + scrollContainer.clientHeight;
    const isTargetVisible = targetItem.start < viewportBottom && itemEnd > viewportTop;
    if (isTargetVisible) {
      setLastScrolledStepId(args.selectedStepId);
      return;
    }

    scrollContainer.scrollTo({
      top: Math.max(0, targetItem.start - 24),
      behavior: 'smooth',
    });
    setLastScrolledStepId(args.selectedStepId);
  }, [
    args.scrollContainerNodeRef,
    args.selectedStepId,
    args.workspaceWindow.items,
    lastScrolledStepId,
  ]);
}

function useVisibleWorkspaceStep(args: {
  onVisibleStepChange: (stepId: string | null) => void;
  visibleItems: ReturnType<typeof useScenarioWorkspaceVirtualization>['visibleItems'];
}) {
  const { onVisibleStepChange, visibleItems } = args;

  useEffect(() => {
    const firstVisibleStep =
      visibleItems.find((item) => item.kind === 'step' && item.step)?.step?.id ?? null;
    onVisibleStepChange(firstVisibleStep);
  }, [onVisibleStepChange, visibleItems]);
}

function useScenarioEditorWorkspaceState(args: {
  onVisibleStepChange: (stepId: string | null) => void;
  selectedStepId: string | null;
  steps: ScenarioProject['steps'];
}) {
  const [dragStepId, setDragStepId] = useState<string | null>(null);
  const [imageInsertIndex, setImageInsertIndex] = useState<number | null>(null);
  const virtualization = useScenarioWorkspaceVirtualization(args.steps);

  useSelectedWorkspaceStepScroll({
    scrollContainerNodeRef: virtualization.scrollContainerNodeRef,
    selectedStepId: args.selectedStepId,
    workspaceWindow: virtualization.workspaceWindow,
  });
  useVisibleWorkspaceStep({
    onVisibleStepChange: args.onVisibleStepChange,
    visibleItems: virtualization.visibleItems,
  });

  return {
    ...virtualization,
    dragStepId,
    imageInsertIndex,
    setDragStepId,
    setImageInsertIndex,
  };
}

function ScenarioEditorWorkspaceSurface(props: {
  bindMeasuredHeight: ScenarioEditorWorkspaceViewportProps['bindMeasuredHeight'];
  canRedoStep: ScenarioEditorWorkspaceViewportProps['canRedoStep'];
  canUndoStep: ScenarioEditorWorkspaceViewportProps['canUndoStep'];
  dragStepId: ScenarioEditorWorkspaceViewportProps['dragStepId'];
  onDeleteStep: ScenarioEditorWorkspaceViewportProps['onDeleteStep'];
  onDuplicateStep: ScenarioEditorWorkspaceViewportProps['onDuplicateStep'];
  onInspectStep: ScenarioEditorWorkspaceViewportProps['onInspectStep'];
  onInsertImage: ScenarioEditorWorkspaceViewportProps['onInsertImage'];
  onInsert: ScenarioEditorWorkspaceViewportProps['onInsert'];
  onMoveStepByOffset: ScenarioEditorWorkspaceViewportProps['onMoveStepByOffset'];
  onMoveStepToPosition: ScenarioEditorWorkspaceViewportProps['onMoveStepToPosition'];
  onOpenQuickEdit: ScenarioEditorWorkspaceViewportProps['onOpenQuickEdit'];
  onRedoStep: ScenarioEditorWorkspaceViewportProps['onRedoStep'];
  onSelectStep: ScenarioEditorWorkspaceViewportProps['onSelectStep'];
  onSetDragStepId: ScenarioEditorWorkspaceViewportProps['onSetDragStepId'];
  onUndoStep: ScenarioEditorWorkspaceViewportProps['onUndoStep'];
  onUpdateStep: ScenarioEditorWorkspaceViewportProps['onUpdateStep'];
  scrollContainerRef: ReturnType<typeof useScenarioWorkspaceVirtualization>['scrollContainerRef'];
  selectedStepId: ScenarioEditorWorkspaceViewportProps['selectedStepId'];
  visibleItems: ReturnType<typeof useScenarioWorkspaceVirtualization>['visibleItems'];
  workspaceHeight: ScenarioEditorWorkspaceViewportProps['workspaceHeight'];
}) {
  return (
    <div ref={props.scrollContainerRef} className="h-full min-h-0 overflow-auto px-8 py-8">
      <ScenarioEditorWorkspaceViewport
        bindMeasuredHeight={props.bindMeasuredHeight}
        canRedoStep={props.canRedoStep}
        canUndoStep={props.canUndoStep}
        dragStepId={props.dragStepId}
        items={props.visibleItems}
        onDeleteStep={props.onDeleteStep}
        onDuplicateStep={props.onDuplicateStep}
        onInspectStep={props.onInspectStep}
        onInsertImage={props.onInsertImage}
        onInsert={props.onInsert}
        onMoveStepByOffset={props.onMoveStepByOffset}
        onMoveStepToPosition={props.onMoveStepToPosition}
        onOpenQuickEdit={props.onOpenQuickEdit}
        onSelectStep={props.onSelectStep}
        onSetDragStepId={props.onSetDragStepId}
        onUpdateStep={props.onUpdateStep}
        onRedoStep={props.onRedoStep}
        onUndoStep={props.onUndoStep}
        selectedStepId={props.selectedStepId}
        workspaceHeight={props.workspaceHeight}
      />
    </div>
  );
}

export function ScenarioEditorWorkspace(props: ScenarioEditorWorkspaceProps) {
  const {
    bindMeasuredHeight,
    scrollContainerRef,
    visibleItems,
    workspaceHeight,
    dragStepId,
    imageInsertIndex,
    setDragStepId,
    setImageInsertIndex,
  } = useScenarioEditorWorkspaceState({
    onVisibleStepChange: props.onVisibleStepChange,
    selectedStepId: props.selectedStepId,
    steps: props.project.steps,
  });

  return (
    <>
      <ScenarioEditorWorkspaceSurface
        bindMeasuredHeight={bindMeasuredHeight}
        canRedoStep={props.canRedoStep}
        canUndoStep={props.canUndoStep}
        dragStepId={dragStepId}
        onDeleteStep={props.onDeleteStep}
        onDuplicateStep={props.onDuplicateStep}
        onInspectStep={props.onInspectStep}
        onInsertImage={setImageInsertIndex}
        onInsert={props.onInsert}
        onMoveStepByOffset={props.onMoveStepByOffset}
        onMoveStepToPosition={props.onMoveStepToPosition}
        onOpenQuickEdit={props.onOpenQuickEdit}
        onSelectStep={props.onSelectStep}
        onSetDragStepId={setDragStepId}
        onUpdateStep={props.onUpdateStep}
        onRedoStep={props.onRedoStep}
        onUndoStep={props.onUndoStep}
        scrollContainerRef={scrollContainerRef}
        selectedStepId={props.selectedStepId}
        visibleItems={visibleItems}
        workspaceHeight={workspaceHeight}
      />
      <ScenarioImageInsertOverlay
        imageInsertIndex={imageInsertIndex}
        onClose={() => setImageInsertIndex(null)}
        onInsertImage={props.onInsertImage}
      />
    </>
  );
}
