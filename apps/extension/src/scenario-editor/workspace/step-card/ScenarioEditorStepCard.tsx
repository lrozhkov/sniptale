import { useRef, type DragEvent, type PointerEvent, type ReactNode } from 'react';
import type { ScenarioStep } from '../../../features/scenario/contracts/types/project';
import type { ScenarioStepPatch } from '../../project/mutation/helpers';
import { ScenarioEditorStepCardContent } from './ScenarioEditorStepCardContent';
import { ScenarioEditorStepCardHeader } from './ScenarioEditorStepCardHeader';

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest('input, textarea, [contenteditable="true"]'))
  );
}

function getScenarioStepCardSurfaceClassName(selected: boolean) {
  return [
    'mx-auto grid w-full max-w-[720px] gap-4 rounded-[28px] border px-5 py-5 transition',
    'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_96%,transparent)]',
    selected
      ? 'border-[var(--sniptale-color-border-accent-strong)] shadow-[0_18px_40px_rgba(15,23,42,0.10)]'
      : 'border-[var(--sniptale-color-border-soft)] shadow-sm',
  ].join(' ');
}

function useScenarioStepCardDragGuards(props: { onDragStart: () => void }) {
  const suppressDragRef = useRef(false);

  return {
    handlePointerDownCapture: (event: PointerEvent<HTMLElement>) => {
      suppressDragRef.current = isEditableTarget(event.target);
    },
    handlePointerReleaseCapture: () => {
      suppressDragRef.current = false;
    },
    handleDragStart: (event: DragEvent<HTMLElement>) => {
      if (suppressDragRef.current || isEditableTarget(event.target)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      props.onDragStart();
    },
  };
}

function ScenarioEditorStepCardSurface(props: {
  children: ReactNode;
  draggable: boolean;
  index: number;
  onDragStart: () => void;
  onDropAtIndex: (index: number) => void;
  onSelect: () => void;
  selected: boolean;
}) {
  const { handleDragStart, handlePointerDownCapture, handlePointerReleaseCapture } =
    useScenarioStepCardDragGuards({ onDragStart: props.onDragStart });

  return (
    <article
      draggable={props.draggable}
      onClick={props.onSelect}
      onPointerDownCapture={handlePointerDownCapture}
      onPointerUpCapture={handlePointerReleaseCapture}
      onPointerCancelCapture={handlePointerReleaseCapture}
      onDragStart={handleDragStart}
      onDragEnd={handlePointerReleaseCapture}
      onDragOver={(event) => event.preventDefault()}
      onDrop={() => props.onDropAtIndex(props.index)}
      data-ui="scenario.editor.step-card"
      data-selected={props.selected ? 'true' : undefined}
      className={getScenarioStepCardSurfaceClassName(props.selected)}
    >
      {props.children}
    </article>
  );
}

function ScenarioEditorStepCardMain(props: {
  canRedo: boolean;
  canUndo: boolean;
  index: number;
  onDelete: () => void;
  onDuplicate: () => void;
  onInspect: () => void;
  onMoveDown: () => void;
  onMoveUp: () => void;
  onOpenQuickEdit: () => void;
  onRedo: () => void;
  onUndo: () => void;
  onUpdateStep: (patch: ScenarioStepPatch) => void;
  step: ScenarioStep;
}) {
  return (
    <>
      <ScenarioEditorStepCardHeader
        canRedo={props.canRedo}
        canUndo={props.canUndo}
        index={props.index}
        onDelete={props.onDelete}
        onDuplicate={props.onDuplicate}
        onInspect={props.onInspect}
        onMoveDown={props.onMoveDown}
        onMoveUp={props.onMoveUp}
        onRedo={props.onRedo}
        onUndo={props.onUndo}
        step={props.step}
      />

      <ScenarioEditorStepCardContent
        step={props.step}
        onOpenQuickEdit={props.onOpenQuickEdit}
        onUpdateStep={props.onUpdateStep}
      />
    </>
  );
}

export function ScenarioEditorStepCard(props: {
  canRedo: boolean;
  canUndo: boolean;
  index: number;
  onInspect: () => void;
  onRedo: () => void;
  onUndo: () => void;
  selected: boolean;
  step: ScenarioStep;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onOpenQuickEdit: () => void;
  onSelect: () => void;
  onUpdateStep: (patch: ScenarioStepPatch) => void;
  draggable: boolean;
  onDragStart: () => void;
  onDropAtIndex: (index: number) => void;
}) {
  const { index, selected, step } = props;

  return (
    <ScenarioEditorStepCardSurface
      draggable={props.draggable}
      index={index}
      onDragStart={props.onDragStart}
      onDropAtIndex={props.onDropAtIndex}
      onSelect={props.onSelect}
      selected={selected}
    >
      <ScenarioEditorStepCardMain
        canRedo={props.canRedo}
        canUndo={props.canUndo}
        index={index}
        onDelete={props.onDelete}
        onDuplicate={props.onDuplicate}
        onInspect={props.onInspect}
        onMoveDown={props.onMoveDown}
        onMoveUp={props.onMoveUp}
        onOpenQuickEdit={props.onOpenQuickEdit}
        onRedo={props.onRedo}
        onUndo={props.onUndo}
        onUpdateStep={props.onUpdateStep}
        step={step}
      />
    </ScenarioEditorStepCardSurface>
  );
}
