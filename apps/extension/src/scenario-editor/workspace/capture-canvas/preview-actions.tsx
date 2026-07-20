import type { ReactNode } from 'react';
import { Circle, Focus } from 'lucide-react';
import { translate } from '../../../platform/i18n';

const ACTIVE_PREVIEW_ACTION_CLASS_NAME = [
  'border-[var(--sniptale-color-border-accent-strong)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_16%,var(--sniptale-color-surface-panel)_84%)]',
  'text-[var(--sniptale-color-text-primary)]',
].join(' ');

const IDLE_PREVIEW_ACTION_CLASS_NAME = [
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_70%,var(--sniptale-color-border-strong)_30%)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_86%,rgba(17,24,39,0.22))]',
  'text-[var(--sniptale-color-text-primary)]',
  'hover:border-[var(--sniptale-color-border-accent-strong)]',
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_12%,var(--sniptale-color-surface-panel)_88%)]',
].join(' ');

function ScenarioWorkspacePreviewToggleButton(props: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={props.active}
      onClick={props.onClick}
      className={[
        'inline-flex h-10 w-10 items-center justify-center rounded-full border',
        'shadow-[0_12px_32px_rgba(15,23,42,0.16)] backdrop-blur transition',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
        'focus-visible:outline-[var(--sniptale-color-border-accent-strong)]',
        props.active ? ACTIVE_PREVIEW_ACTION_CLASS_NAME : IDLE_PREVIEW_ACTION_CLASS_NAME,
      ].join(' ')}
      title={props.label}
      aria-label={props.label}
    >
      {props.icon}
    </button>
  );
}

export function ScenarioWorkspacePreviewActions(props: {
  clickActive: boolean;
  clickVisible: boolean;
  frameActive: boolean;
  frameVisible: boolean;
  onToggleClick: () => void;
  onToggleFrame: () => void;
}) {
  if (!props.frameVisible && !props.clickVisible) {
    return null;
  }

  return (
    <div
      data-ui="scenario.editor.workspace.preview-actions"
      className="pointer-events-none absolute bottom-4 right-4 flex items-center gap-2
        opacity-0 transition group-hover:opacity-100
        group-focus-within:opacity-100"
    >
      {props.frameVisible ? (
        <div className="pointer-events-auto">
          <ScenarioWorkspacePreviewToggleButton
            active={props.frameActive}
            icon={<Focus className="h-4 w-4" />}
            label={translate('scenario.editor.autoFrame')}
            onClick={props.onToggleFrame}
          />
        </div>
      ) : null}
      {props.clickVisible ? (
        <div className="pointer-events-auto">
          <ScenarioWorkspacePreviewToggleButton
            active={props.clickActive}
            icon={<Circle className="h-4 w-4" />}
            label={translate('scenario.editor.autoClick')}
            onClick={props.onToggleClick}
          />
        </div>
      ) : null}
    </div>
  );
}
