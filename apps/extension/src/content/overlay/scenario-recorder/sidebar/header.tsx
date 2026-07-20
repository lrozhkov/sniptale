import { Grip, FileStack } from 'lucide-react';
import type { MouseEventHandler } from 'react';
import { translate } from '../../../../platform/i18n';

function ScenarioRecorderSidebarProjectSummary(props: { projectName: string | null }) {
  return (
    <div className="min-w-0 overflow-hidden">
      <div
        className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]
          text-[var(--sniptale-color-text-muted-strong)]"
      >
        <FileStack className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{translate('scenario.content.project')}</span>
        <Grip className="ml-auto h-3 w-3 shrink-0" />
      </div>
      <strong
        title={props.projectName || translate('scenario.content.noProject')}
        className="mt-1 block max-w-full truncate text-sm font-semibold text-[var(--sniptale-color-text-primary)]"
      >
        {props.projectName || translate('scenario.content.noProject')}
      </strong>
    </div>
  );
}

export function ScenarioRecorderSidebarHeader(props: {
  dragging: boolean;
  onMouseDown: MouseEventHandler<HTMLDivElement>;
  projectName: string | null;
}) {
  return (
    <div
      data-ui="content.scenario.sidebar.drag-handle"
      onMouseDown={props.onMouseDown}
      className="min-w-0 rounded-[18px] border
        border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_82%,transparent)]
        bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_42%,transparent)] p-3
        transition-colors hover:border-[color:color-mix(in_srgb,var(--sniptale-color-border-strong)_70%,transparent)]
        cursor-grab active:cursor-grabbing"
    >
      <div
        className={
          props.dragging
            ? 'text-[var(--sniptale-color-text-primary)]'
            : 'text-[var(--sniptale-color-text-muted-strong)]'
        }
      >
        <ScenarioRecorderSidebarProjectSummary projectName={props.projectName} />
      </div>
    </div>
  );
}
