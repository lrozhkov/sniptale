import { ArrowDown, ArrowUp, Copy, Info, Redo2, Trash2, Undo2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { translate } from '../../../platform/i18n';
import type { ScenarioStep } from '../../../features/scenario/contracts/types/project';

function getStepKindLabel(step: ScenarioStep): string {
  switch (step.kind) {
    case 'capture':
      return translate('scenario.editor.stepKinds.capture');
    case 'section':
      return translate('scenario.editor.stepKinds.section');
    case 'note':
      return translate('scenario.editor.stepKinds.note');
    case 'divider':
      return translate('scenario.editor.stepKinds.divider');
    default:
      return translate('scenario.editor.untitledStep');
  }
}

function StepIndexBadge(props: { index: number }) {
  return (
    <div
      className="flex h-9 w-9 items-center justify-center rounded-full
        bg-[var(--sniptale-color-surface-canvas)] text-sm font-semibold text-[var(--sniptale-color-text-primary)]"
    >
      {props.index + 1}
    </div>
  );
}

function StepKindBadge(props: { label: string }) {
  return (
    <span
      className="rounded-full border border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]
        px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--sniptale-color-text-secondary)]"
    >
      {props.label}
    </span>
  );
}

function StepActionButton(props: {
  disabled?: boolean;
  icon: ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.stopPropagation();
        if (!props.disabled) {
          props.onClick();
        }
      }}
      disabled={props.disabled}
      className="rounded-full border border-[var(--sniptale-color-border-soft)] p-2
        text-[var(--sniptale-color-text-secondary)] disabled:opacity-40"
      title={props.title}
    >
      {props.icon}
    </button>
  );
}

function StepHistoryActions(props: {
  canRedo: boolean;
  canUndo: boolean;
  onRedo: () => void;
  onUndo: () => void;
}) {
  return (
    <>
      <StepActionButton
        disabled={!props.canUndo}
        icon={<Undo2 className="h-4 w-4" />}
        title={translate('scenario.editor.undo')}
        onClick={props.onUndo}
      />
      <StepActionButton
        disabled={!props.canRedo}
        icon={<Redo2 className="h-4 w-4" />}
        title={translate('scenario.editor.redo')}
        onClick={props.onRedo}
      />
    </>
  );
}

function StepMoveActions(props: { onMoveDown: () => void; onMoveUp: () => void }) {
  return (
    <>
      <StepActionButton
        icon={<ArrowUp className="h-4 w-4" />}
        title={translate('scenario.editor.moveUp')}
        onClick={props.onMoveUp}
      />
      <StepActionButton
        icon={<ArrowDown className="h-4 w-4" />}
        title={translate('scenario.editor.moveDown')}
        onClick={props.onMoveDown}
      />
    </>
  );
}

function StepMetadataAction(props: { isCaptureStep: boolean; onInspect: () => void }) {
  if (!props.isCaptureStep) {
    return null;
  }

  return (
    <StepActionButton
      icon={<Info className="h-4 w-4" />}
      title={translate('scenario.content.viewMetadata')}
      onClick={props.onInspect}
    />
  );
}

function StepCardActions(props: {
  canRedo: boolean;
  canUndo: boolean;
  isCaptureStep: boolean;
  onDelete: () => void;
  onDuplicate: () => void;
  onInspect: () => void;
  onMoveDown: () => void;
  onMoveUp: () => void;
  onRedo: () => void;
  onUndo: () => void;
}) {
  return (
    <div className="ml-auto hidden flex-wrap items-center gap-2 group-hover:flex">
      <StepHistoryActions
        canRedo={props.canRedo}
        canUndo={props.canUndo}
        onRedo={props.onRedo}
        onUndo={props.onUndo}
      />
      <StepMoveActions onMoveDown={props.onMoveDown} onMoveUp={props.onMoveUp} />
      <StepActionButton
        icon={<Copy className="h-4 w-4" />}
        title={translate('scenario.editor.duplicateStep')}
        onClick={props.onDuplicate}
      />
      <StepMetadataAction isCaptureStep={props.isCaptureStep} onInspect={props.onInspect} />
      <StepActionButton
        icon={<Trash2 className="h-4 w-4" />}
        title={translate('scenario.editor.deleteStep')}
        onClick={props.onDelete}
      />
    </div>
  );
}

export function ScenarioEditorStepCardHeader(props: {
  canRedo: boolean;
  canUndo: boolean;
  index: number;
  onInspect: () => void;
  onRedo: () => void;
  onUndo: () => void;
  step: ScenarioStep;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const { index, step } = props;

  return (
    <div className="group flex flex-wrap items-center gap-3">
      <StepIndexBadge index={index} />
      <StepKindBadge label={getStepKindLabel(step)} />
      <StepCardActions
        canRedo={props.canRedo}
        canUndo={props.canUndo}
        isCaptureStep={step.kind === 'capture'}
        onDelete={props.onDelete}
        onDuplicate={props.onDuplicate}
        onInspect={props.onInspect}
        onMoveDown={props.onMoveDown}
        onMoveUp={props.onMoveUp}
        onRedo={props.onRedo}
        onUndo={props.onUndo}
      />
    </div>
  );
}
