import { Redo2, Undo2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { translate } from '../../../platform/i18n';
import type {
  ScenarioCaptureStep,
  ScenarioStepPatch,
} from '../../../features/scenario/contracts/types/project';
import { ScenarioQuickEditTextField } from './ScenarioQuickEditFields';

export function SidebarSectionTitle(props: { children: ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--sniptale-color-text-muted)]">
      {props.children}
    </h3>
  );
}

function QuickEditUndoRedoButtons(props: {
  canRedo: boolean;
  canUndo: boolean;
  onRedo: () => void;
  onUndo: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={props.onUndo}
        disabled={!props.canUndo}
        className="inline-flex h-9 w-9 items-center justify-center rounded-[12px] border
          border-[var(--sniptale-color-border-soft)]
          bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_24%,transparent)]
          text-[var(--sniptale-color-text-secondary)] transition hover:text-[var(--sniptale-color-text-primary)]
          disabled:opacity-40"
        title={translate('scenario.editor.undo')}
      >
        <Undo2 className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={props.onRedo}
        disabled={!props.canRedo}
        className="inline-flex h-9 w-9 items-center justify-center rounded-[12px] border
          border-[var(--sniptale-color-border-soft)]
          bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_24%,transparent)]
          text-[var(--sniptale-color-text-secondary)] transition hover:text-[var(--sniptale-color-text-primary)]
          disabled:opacity-40"
        title={translate('scenario.editor.redo')}
      >
        <Redo2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function QuickEditStepHeader(props: {
  canRedo: boolean;
  canUndo: boolean;
  onRedo: () => void;
  onUndo: () => void;
  stepTitle: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold text-[var(--sniptale-color-text-primary)]">
          {translate('scenario.editor.quickEdit')}
        </h2>
        <p className="mt-1 text-sm text-[var(--sniptale-color-text-muted)]">{props.stepTitle}</p>
      </div>
      <QuickEditUndoRedoButtons
        canRedo={props.canRedo}
        canUndo={props.canUndo}
        onRedo={props.onRedo}
        onUndo={props.onUndo}
      />
    </div>
  );
}

export function QuickEditStepFields(props: {
  canRedo: boolean;
  canUndo: boolean;
  onStepChange: (patch: Partial<ScenarioStepPatch>) => void;
  onRedo: () => void;
  onUndo: () => void;
  step: ScenarioCaptureStep;
}) {
  return (
    <div className="grid gap-3">
      <QuickEditStepHeader
        canRedo={props.canRedo}
        canUndo={props.canUndo}
        onRedo={props.onRedo}
        onUndo={props.onUndo}
        stepTitle={props.step.title || translate('scenario.editor.selectedStep')}
      />

      <ScenarioQuickEditTextField
        label={translate('scenario.editor.title')}
        value={props.step.title}
        onChange={(value) => props.onStepChange({ title: value })}
      />
      <ScenarioQuickEditTextField
        label={translate('scenario.editor.body')}
        multiline
        value={props.step.body}
        onChange={(value) => props.onStepChange({ body: value })}
      />
    </div>
  );
}
