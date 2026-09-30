import { Grip, FileStack, ChevronDown } from 'lucide-react';
import type { MouseEventHandler } from 'react';
import { translate } from '../../../../platform/i18n';

function ScenarioRecorderSidebarProjectSummary(props: {
  projectName: string | null;
  onProjectMenuToggle: () => void;
  projectMenuOpen: boolean;
}) {
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
      <button
        type="button"
        onClick={props.onProjectMenuToggle}
        aria-expanded={props.projectMenuOpen}
        data-ui="content.scenario.sidebar.project-button"
        title={translate('scenario.content.projectButton')}
        className="mt-1 flex w-full min-w-0 items-center gap-1 rounded-lg text-left text-sm font-semibold
          text-[var(--sniptale-color-text-primary)] hover:text-[var(--sniptale-color-accent-emphasis)]
          focus-visible:outline-2 focus-visible:outline-[var(--sniptale-color-border-accent-strong)]"
      >
        <span className="min-w-0 flex-1 truncate">
          {props.projectName || translate('scenario.content.noProject')}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0" />
      </button>
    </div>
  );
}

export function ScenarioRecorderSidebarHeader(props: {
  dragging: boolean;
  onMouseDown: MouseEventHandler<HTMLDivElement>;
  onProjectMenuToggle: () => void;
  projectMenuOpen: boolean;
  projectName: string | null;
}) {
  return (
    <div
      className="min-w-0 rounded-[18px] border
        border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_82%,transparent)]
        bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_42%,transparent)] p-3
        transition-colors hover:border-[color:color-mix(in_srgb,var(--sniptale-color-border-strong)_70%,transparent)]"
    >
      <div
        data-ui="content.scenario.sidebar.drag-handle"
        onMouseDown={props.onMouseDown}
        className="mb-1 flex h-5 cursor-grab items-center justify-end active:cursor-grabbing"
      >
        <Grip className="h-3 w-3" />
      </div>
      <div
        className={
          props.dragging
            ? 'text-[var(--sniptale-color-text-primary)]'
            : 'text-[var(--sniptale-color-text-muted-strong)]'
        }
      >
        <ScenarioRecorderSidebarProjectSummary
          projectName={props.projectName}
          onProjectMenuToggle={props.onProjectMenuToggle}
          projectMenuOpen={props.projectMenuOpen}
        />
      </div>
    </div>
  );
}
