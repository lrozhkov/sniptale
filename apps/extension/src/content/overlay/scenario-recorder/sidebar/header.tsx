import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { Grip, FileStack, ChevronDown, ChevronsDown, X } from 'lucide-react';
import type { MouseEvent, MouseEventHandler } from 'react';
import { translate } from '../../../../platform/i18n';

export function ScenarioRecorderSidebarHeader(props: {
  dragging: boolean;
  onCollapse: (event: MouseEvent<HTMLButtonElement>) => void;
  onClose: (event: MouseEvent<HTMLButtonElement>) => void;
  onMouseDown: MouseEventHandler<HTMLDivElement>;
  onProjectMenuToggle: () => void;
  projectMenuOpen: boolean;
  projectName: string | null;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-[4px] bg-[var(--sniptale-color-surface-hover)] p-2">
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
      <ProductActionButton
        tone="secondary"
        type="button"
        onClick={props.onProjectMenuToggle}
        aria-expanded={props.projectMenuOpen}
        data-ui="content.scenario.sidebar.project-button"
        title={props.projectName || translate('scenario.content.noProject')}
        aria-label={translate('scenario.content.projectButton')}
        className="min-w-0 flex-1 !justify-start [&>.sniptale-command-content]:w-full"
      >
        <FileStack aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">
          {props.projectName || translate('scenario.content.noProject')}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 ${props.projectMenuOpen ? 'rotate-180' : ''}`}
        />
      </ProductActionButton>
      <ProductActionButton
        tone="secondary"
        type="button"
        onClick={props.onCollapse}
        aria-label={translate('scenario.content.collapsePanel')}
        title={translate('scenario.content.collapsePanel')}
        data-ui="content.scenario.sidebar.collapse"
        data-command-chrome="true"
        className="size-8 shrink-0"
      >
        <ChevronsDown aria-hidden="true" size={16} />
      </ProductActionButton>
      <ProductActionButton
        tone="secondary"
        type="button"
        onClick={props.onClose}
        aria-label={translate('scenario.content.closePanel')}
        title={translate('scenario.content.closePanel')}
        data-ui="content.scenario.sidebar.close"
        data-command-chrome="true"
        className="size-8 shrink-0"
      >
        <X aria-hidden="true" size={16} />
      </ProductActionButton>
    </div>
  );
}
