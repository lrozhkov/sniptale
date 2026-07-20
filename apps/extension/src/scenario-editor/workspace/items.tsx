import type { ReactNode } from 'react';
import type { ScenarioStepPatch } from '../../features/scenario/contracts/types/project';
import { InsertStepActions } from './insert-step-actions';
import { ScenarioEditorStepCard } from './step-card/ScenarioEditorStepCard';
import type { ScenarioWorkspaceWindowItem } from './helpers';

type ScenarioWorkspaceStepActions = {
  canRedoStep: (stepId: string) => boolean;
  canUndoStep: (stepId: string) => boolean;
  dragStepId: string | null;
  onDeleteStep: (stepId: string) => void;
  onDuplicateStep: (stepId: string) => Promise<void>;
  onInspectStep: (stepId: string) => void;
  onMoveStepByOffset: (stepId: string, offset: number) => void;
  onMoveStepToPosition: (stepId: string, position: number) => void;
  onOpenQuickEdit: (stepId: string) => void;
  onRedoStep: (stepId: string) => void;
  onSelectStep: (stepId: string) => void;
  onSetDragStepId: (stepId: string | null) => void;
  onUndoStep: (stepId: string) => void;
  onUpdateStep: (stepId: string, patch: ScenarioStepPatch) => void;
  selectedStepId: string | null;
};

function ScenarioWorkspacePositionedItem(props: {
  bindMeasuredHeight: (key: string) => (node: HTMLDivElement | null) => void;
  children: ReactNode;
  item: ScenarioWorkspaceWindowItem;
}) {
  return (
    <div
      ref={props.bindMeasuredHeight(props.item.key)}
      className="absolute left-0 right-0"
      style={{ top: `${props.item.start}px` }}
    >
      {props.children}
    </div>
  );
}

function buildScenarioWorkspaceDropHandler(props: {
  dragStepId: string | null;
  onMoveStepToPosition: (stepId: string, position: number) => void;
  onSetDragStepId: (stepId: string | null) => void;
}) {
  return (dropIndex: number) => {
    if (!props.dragStepId) {
      return;
    }

    props.onMoveStepToPosition(props.dragStepId, dropIndex);
    props.onSetDragStepId(null);
  };
}

function ScenarioWorkspaceInsertItem(props: {
  bindMeasuredHeight: (key: string) => (node: HTMLDivElement | null) => void;
  item: ScenarioWorkspaceWindowItem;
  onInsertImage: (index: number) => void;
  onInsert: (index: number, kind: 'section' | 'note' | 'divider') => void;
}) {
  return (
    <ScenarioWorkspacePositionedItem
      bindMeasuredHeight={props.bindMeasuredHeight}
      item={props.item}
    >
      <InsertStepActions
        index={props.item.index}
        onInsert={props.onInsert}
        onInsertImage={props.onInsertImage}
      />
    </ScenarioWorkspacePositionedItem>
  );
}

function ScenarioWorkspaceStepItem(
  props: ScenarioWorkspaceStepActions & {
    bindMeasuredHeight: (key: string) => (node: HTMLDivElement | null) => void;
    item: ScenarioWorkspaceWindowItem;
  }
) {
  const step = props.item.step;
  if (!step) {
    return null;
  }

  const handleDropAtIndex = buildScenarioWorkspaceDropHandler(props);

  return (
    <ScenarioWorkspacePositionedItem
      bindMeasuredHeight={props.bindMeasuredHeight}
      item={props.item}
    >
      <ScenarioEditorStepCard
        {...buildScenarioWorkspaceStepCardProps(props, step, handleDropAtIndex)}
      />
    </ScenarioWorkspacePositionedItem>
  );
}

function buildScenarioWorkspaceStepCardProps(
  props: Parameters<typeof ScenarioWorkspaceStepItem>[0],
  step: NonNullable<ScenarioWorkspaceWindowItem['step']>,
  onDropAtIndex: (index: number) => void
) {
  return {
    canRedo: props.canRedoStep(step.id),
    canUndo: props.canUndoStep(step.id),
    draggable: true,
    index: props.item.index,
    onDelete: () => props.onDeleteStep(step.id),
    onDragStart: () => props.onSetDragStepId(step.id),
    onDropAtIndex,
    onDuplicate: () => {
      void props.onDuplicateStep(step.id);
    },
    onInspect: () => props.onInspectStep(step.id),
    onMoveDown: () => props.onMoveStepByOffset(step.id, 1),
    onMoveUp: () => props.onMoveStepByOffset(step.id, -1),
    onOpenQuickEdit: () => props.onOpenQuickEdit(step.id),
    onRedo: () => props.onRedoStep(step.id),
    onSelect: () => props.onSelectStep(step.id),
    onUndo: () => props.onUndoStep(step.id),
    onUpdateStep: (patch: ScenarioStepPatch) => props.onUpdateStep(step.id, patch),
    selected: step.id === props.selectedStepId,
    step,
  };
}

function ScenarioWorkspaceItemView(
  props: ScenarioEditorWorkspaceViewportProps & {
    item: ScenarioWorkspaceWindowItem;
  }
) {
  return props.item.kind === 'insert' ? (
    <ScenarioWorkspaceInsertItem
      bindMeasuredHeight={props.bindMeasuredHeight}
      item={props.item}
      onInsertImage={props.onInsertImage}
      onInsert={props.onInsert}
    />
  ) : (
    <ScenarioWorkspaceStepItem
      bindMeasuredHeight={props.bindMeasuredHeight}
      canRedoStep={props.canRedoStep}
      canUndoStep={props.canUndoStep}
      dragStepId={props.dragStepId}
      item={props.item}
      onDeleteStep={props.onDeleteStep}
      onDuplicateStep={props.onDuplicateStep}
      onInspectStep={props.onInspectStep}
      onMoveStepByOffset={props.onMoveStepByOffset}
      onMoveStepToPosition={props.onMoveStepToPosition}
      onOpenQuickEdit={props.onOpenQuickEdit}
      onRedoStep={props.onRedoStep}
      onSelectStep={props.onSelectStep}
      onSetDragStepId={props.onSetDragStepId}
      onUndoStep={props.onUndoStep}
      onUpdateStep={props.onUpdateStep}
      selectedStepId={props.selectedStepId}
    />
  );
}

export type ScenarioEditorWorkspaceViewportProps = {
  bindMeasuredHeight: (key: string) => (node: HTMLDivElement | null) => void;
  items: ScenarioWorkspaceWindowItem[];
  onInsertImage: (index: number) => void;
  onInsert: (index: number, kind: 'section' | 'note' | 'divider') => void;
  workspaceHeight: number;
} & ScenarioWorkspaceStepActions;

export function ScenarioEditorWorkspaceViewport(props: ScenarioEditorWorkspaceViewportProps) {
  return (
    <div className="relative min-h-full" style={{ height: `${props.workspaceHeight}px` }}>
      {props.items.map((item) => (
        <ScenarioWorkspaceItemView key={item.key} {...props} item={item} />
      ))}
    </div>
  );
}
