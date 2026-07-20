import { Image as ImageIcon, Info, NotebookPen, RotateCcw, Trash2 } from 'lucide-react';
import type { MouseEvent, ReactNode } from 'react';
import { translate } from '../../../platform/i18n';
import type { ScenarioStep } from '../../../features/scenario/contracts/types/project';
import type { ScenarioNavigatorStepController } from './types';
import { getStepLabel } from './step-row.helpers';

function ScenarioNavigatorActionButton(props: {
  children: ReactNode;
  danger?: boolean;
  label: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={[
        'inline-flex h-7 w-7 items-center justify-center rounded-full border',
        'border-[var(--sniptale-color-border-soft)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_22%,transparent)]',
        'text-[var(--sniptale-color-text-secondary)] transition',
        props.danger
          ? 'hover:border-[var(--sniptale-color-danger)] hover:text-[var(--sniptale-color-danger)]'
          : 'hover:text-[var(--sniptale-color-text-primary)]',
      ].join(' ')}
      title={props.label}
      aria-label={props.label}
    >
      {props.children}
    </button>
  );
}

export function ScenarioNavigatorThumbnail(props: {
  step: ScenarioStep;
  thumbnailUrl: string | null;
}) {
  if (props.thumbnailUrl) {
    return (
      <img
        src={props.thumbnailUrl}
        alt=""
        className="h-[48px] w-[72px] shrink-0 rounded-[8px] object-cover"
      />
    );
  }

  return (
    <div
      className="flex h-[48px] w-[72px] shrink-0 items-center justify-center rounded-[8px]
        bg-[var(--sniptale-color-surface-canvas)] text-[var(--sniptale-color-text-muted)]"
    >
      {props.step.kind === 'capture' ? (
        <ImageIcon className="h-4 w-4" />
      ) : (
        <NotebookPen className="h-4 w-4" />
      )}
    </div>
  );
}

export function ScenarioNavigatorStepText(props: {
  eyebrow: string;
  index: number;
  preview: string;
  step: ScenarioStep;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-0.5 text-[11px] font-semibold text-[var(--sniptale-color-text-muted)]">
        {props.eyebrow}
      </div>
      <div
        className={[
          'line-clamp-2 break-words text-sm font-semibold leading-5',
          'text-[var(--sniptale-color-text-primary)]',
        ].join(' ')}
      >
        {getStepLabel(props.step, props.index)}
      </div>
      {props.preview ? (
        <div
          className="line-clamp-2 break-words pt-0.5 text-xs leading-4
            text-[var(--sniptale-color-text-secondary)]"
        >
          {props.preview}
        </div>
      ) : null}
    </div>
  );
}

export function ScenarioNavigatorStepActions(props: {
  controller: ScenarioNavigatorStepController;
  step: ScenarioStep;
}) {
  return (
    <div className="flex shrink-0 items-start gap-1.5">
      {props.step.kind === 'capture' ? (
        <ScenarioNavigatorActionButton
          label={translate('scenario.content.viewMetadata')}
          onClick={(event) => {
            event.stopPropagation();
            props.controller.ui.setInspectedStepId(props.step.id);
          }}
        >
          <Info className="h-3 w-3" />
        </ScenarioNavigatorActionButton>
      ) : null}
      <ScenarioNavigatorActionButton
        danger
        label={translate('scenario.editor.deleteStep')}
        onClick={(event) => {
          event.stopPropagation();
          props.controller.stepActions.deleteStep(props.step.id);
        }}
      >
        <Trash2 className="h-3 w-3" />
      </ScenarioNavigatorActionButton>
    </div>
  );
}

export function ScenarioNavigatorTrashActions(props: {
  onRestore: () => void;
  step: ScenarioStep;
  ui: Pick<ScenarioNavigatorStepController['ui'], 'setInspectedStepId'>;
}) {
  return (
    <div className="flex shrink-0 items-start gap-1.5">
      {props.step.kind === 'capture' ? (
        <ScenarioNavigatorActionButton
          label={translate('scenario.content.viewMetadata')}
          onClick={(event) => {
            event.stopPropagation();
            props.ui.setInspectedStepId(props.step.id);
          }}
        >
          <Info className="h-3 w-3" />
        </ScenarioNavigatorActionButton>
      ) : null}
      <ScenarioNavigatorActionButton
        label={translate('scenario.editor.restoreStep')}
        onClick={(event) => {
          event.stopPropagation();
          props.onRestore();
        }}
      >
        <RotateCcw className="h-3 w-3" />
      </ScenarioNavigatorActionButton>
    </div>
  );
}
