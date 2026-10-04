import { Grip, FileStack, ChevronDown, ChevronsDown } from 'lucide-react';
import type { MouseEvent, MouseEventHandler } from 'react';
import { translate } from '../../../../platform/i18n';

export function ScenarioRecorderSidebarHeader(props: {
  dragging: boolean;
  onCollapse: (event: MouseEvent<HTMLButtonElement>) => void;
  onMouseDown: MouseEventHandler<HTMLDivElement>;
  onProjectMenuToggle: () => void;
  projectMenuOpen: boolean;
  projectName: string | null;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-[14px] bg-[var(--sniptale-color-surface-hover)] p-2">
      <div
        data-ui="content.scenario.sidebar.drag-handle"
        onMouseDown={props.onMouseDown}
        title={translate('scenario.content.project')}
        className="flex h-8 w-5 shrink-0 cursor-grab items-center justify-center active:cursor-grabbing"
      >
        <Grip
          aria-hidden="true"
          className="h-4 w-4 text-[var(--sniptale-color-text-muted-strong)]"
        />
      </div>
      <button
        type="button"
        onClick={props.onProjectMenuToggle}
        aria-expanded={props.projectMenuOpen}
        data-ui="content.scenario.sidebar.project-button"
        title={translate('scenario.content.projectButton')}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left text-sm font-semibold
          text-[var(--sniptale-color-text-primary)] hover:text-[var(--sniptale-color-accent-emphasis)]
          focus-visible:outline-2 focus-visible:outline-[var(--sniptale-color-border-accent-strong)]"
      >
        <FileStack aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">
          {props.projectName || translate('scenario.content.noProject')}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 ${props.projectMenuOpen ? 'rotate-180' : ''}`}
        />
      </button>
      <button
        type="button"
        onClick={props.onCollapse}
        aria-label={translate('scenario.content.collapsePanel')}
        title={translate('scenario.content.collapsePanel')}
        data-ui="content.scenario.sidebar.collapse"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-0 bg-transparent
          text-[var(--sniptale-color-text-secondary)] hover:text-[var(--sniptale-color-text-primary)]
          focus-visible:outline-2 focus-visible:outline-[var(--sniptale-color-border-accent-strong)]"
      >
        <ChevronsDown aria-hidden="true" size={16} />
      </button>
    </div>
  );
}
