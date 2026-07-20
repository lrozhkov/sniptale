import { GripVertical, Info, Trash2 } from 'lucide-react';
import { translate } from '../../../../platform/i18n';
import type { ScenarioRecorderSidebarStep } from './types';
import {
  handleStepActionClick,
  SCENARIO_RECORDER_RAIL_BUTTON_CLASS_NAME,
} from './step-card.helpers';
import { ScenarioRecorderStepPreview } from './step-card.preview';

function ScenarioRecorderDeleteButton(props: { onDelete: () => void }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        props.onDelete();
      }}
      data-ui="content.scenario.sidebar.step-delete"
      className="flex h-7 w-7 items-center justify-center
        rounded-full border border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_78%,transparent)]
        bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_48%,transparent)]
        text-[var(--sniptale-color-danger)] transition-colors
        hover:border-[color:color-mix(in_srgb,var(--sniptale-color-danger)_24%,var(--sniptale-color-border-soft)_76%)]
        hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-danger-soft)_36%,transparent)]"
      title={translate('scenario.content.deleteStep')}
      aria-label={translate('scenario.content.deleteStep')}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

function ScenarioRecorderStepActions(props: {
  onDeleteStep: (stepId: string) => void;
  onInspectStep: (step: ScenarioRecorderSidebarStep) => void;
  step: ScenarioRecorderSidebarStep;
}) {
  return (
    <div
      data-ui="content.scenario.sidebar.step-rail-actions"
      className="flex max-h-0 flex-col items-center gap-1 overflow-hidden opacity-0
        transition-all duration-300 ease-out
        group-hover:max-h-[120px] group-hover:opacity-100"
    >
      <button
        type="button"
        onClick={handleStepActionClick}
        draggable
        className={`${SCENARIO_RECORDER_RAIL_BUTTON_CLASS_NAME} cursor-grab text-[var(--sniptale-color-text-muted)]`}
        title={translate('scenario.content.reorderStep')}
        aria-label={translate('scenario.content.reorderStep')}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      {props.step.metadata ? (
        <button
          type="button"
          onClick={(event) => {
            handleStepActionClick(event);
            props.onInspectStep(props.step);
          }}
          data-ui="content.scenario.sidebar.step-info"
          className={`${SCENARIO_RECORDER_RAIL_BUTTON_CLASS_NAME} text-[var(--sniptale-color-text-secondary)]`}
          title={translate('scenario.content.viewMetadata')}
          aria-label={translate('scenario.content.viewMetadata')}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      ) : null}
      <ScenarioRecorderDeleteButton onDelete={() => props.onDeleteStep(props.step.id)} />
    </div>
  );
}

export function ScenarioRecorderStepRail(props: {
  onDeleteStep: (stepId: string) => void;
  onInspectStep: (step: ScenarioRecorderSidebarStep) => void;
  step: ScenarioRecorderSidebarStep;
  stepNumber: number;
}) {
  return (
    <div
      data-ui="content.scenario.sidebar.step-rail"
      className="flex flex-col items-center gap-2 pt-0.5"
    >
      <div
        className="flex h-7 w-7 items-center justify-center rounded-full border
          border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_76%,transparent)]
          bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_58%,transparent)]
          text-xs font-semibold text-[var(--sniptale-color-text-primary)]"
      >
        {props.stepNumber}
      </div>
      <ScenarioRecorderStepActions
        onDeleteStep={props.onDeleteStep}
        onInspectStep={props.onInspectStep}
        step={props.step}
      />
    </div>
  );
}

export function ScenarioRecorderStepBody(props: {
  onPreviewOpen: (step: ScenarioRecorderSidebarStep) => void;
  step: ScenarioRecorderSidebarStep;
}) {
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-start justify-between gap-3 overflow-hidden">
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="line-clamp-2 text-sm font-medium text-[var(--sniptale-color-text-primary)]">
            {props.step.title || props.step.id}
          </div>
        </div>
      </div>
      <div
        className="max-h-0 overflow-hidden opacity-0 transition-all duration-300 ease-out
          group-hover:mt-2 group-hover:max-h-[176px] group-hover:opacity-100"
      >
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            props.onPreviewOpen(props.step);
          }}
          className="block w-full cursor-zoom-in"
          data-ui="content.scenario.sidebar.step-preview-button"
        >
          <ScenarioRecorderStepPreview
            className="h-[168px]"
            previewDataUrl={props.step.previewDataUrl}
          />
        </button>
      </div>
    </div>
  );
}
