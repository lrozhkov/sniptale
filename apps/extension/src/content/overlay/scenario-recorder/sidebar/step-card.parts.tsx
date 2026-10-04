import { ArrowUp, ArrowDown, Info, Trash2 } from 'lucide-react';
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

type StepActionProps = {
  onDeleteStep: (stepId: string) => void;
  onInspectStep: (step: ScenarioRecorderSidebarStep) => void;
  onMoveStep: (stepId: string, toIndex: number) => void;
  moveUpIndex: number | null;
  moveDownIndex: number | null;
  step: ScenarioRecorderSidebarStep;
};

function ScenarioRecorderStepActions(props: StepActionProps) {
  return (
    <div
      data-ui="content.scenario.sidebar.step-rail-actions"
      className="flex max-h-0 flex-col items-center gap-1 overflow-hidden opacity-0
        transition-all duration-300 ease-out
        group-hover:max-h-[160px] group-hover:opacity-100
        group-focus-within:max-h-[160px] group-focus-within:opacity-100"
    >
      {(['up', 'down'] as const).map((direction) => {
        const destination = direction === 'up' ? props.moveUpIndex : props.moveDownIndex;
        const label = translate(
          direction === 'up' ? 'scenario.content.moveStepUp' : 'scenario.content.moveStepDown'
        );
        return (
          <button
            key={direction}
            type="button"
            disabled={destination === null}
            data-ui={`content.scenario.sidebar.step-move-${direction}`}
            className={`${SCENARIO_RECORDER_RAIL_BUTTON_CLASS_NAME}
              text-[var(--sniptale-color-text-secondary)] disabled:opacity-40 focus-visible:outline-2
              focus-visible:outline-[var(--sniptale-color-border-accent-strong)]`}
            title={label}
            aria-label={label}
            onClick={(event) => {
              handleStepActionClick(event);
              if (destination !== null) props.onMoveStep(props.step.id, destination);
            }}
          >
            {direction === 'up' ? (
              <ArrowUp aria-hidden="true" size={14} />
            ) : (
              <ArrowDown aria-hidden="true" size={14} />
            )}
          </button>
        );
      })}
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

export function ScenarioRecorderStepRail(props: StepActionProps) {
  return (
    <div
      data-ui="content.scenario.sidebar.step-rail"
      className="flex flex-col items-center gap-2 pt-0.5"
    >
      {props.step.numberLabel !== null && (
        <div
          data-ui="content.scenario.sidebar.step-number"
          className="flex min-h-7 min-w-7 max-w-20 items-center justify-center rounded-full border
            px-1.5 text-center [overflow-wrap:anywhere]
            border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_76%,transparent)]
            bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_58%,transparent)]
            text-xs font-semibold text-[var(--sniptale-color-text-primary)]"
        >
          {props.step.numberLabel}
        </div>
      )}
      <ScenarioRecorderStepActions
        onMoveStep={props.onMoveStep}
        moveUpIndex={props.moveUpIndex}
        moveDownIndex={props.moveDownIndex}
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
            {props.step.title ||
              `${translate('scenario.content.step')} ${props.step.numberLabel ?? ''}`}
          </div>
        </div>
      </div>
      <div
        className="max-h-0 overflow-hidden opacity-0 transition-all duration-300 ease-out
          group-hover:mt-2 group-hover:max-h-[176px] group-hover:opacity-100
          group-focus-within:mt-2 group-focus-within:max-h-[176px] group-focus-within:opacity-100"
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
