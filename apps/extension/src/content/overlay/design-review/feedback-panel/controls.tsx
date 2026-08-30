import { Search } from 'lucide-react';
import type { RefObject } from 'react';
import { translate } from '../../../../platform/i18n';
import { FeedbackFilter, type FeedbackActionFilter } from './filter';

export function FeedbackPanelControls(props: {
  filter: FeedbackActionFilter;
  filterMenuRef: RefObject<HTMLDivElement | null>;
  filterOpen: boolean;
  filterRootRef: RefObject<HTMLDivElement | null>;
  filterTriggerRef: RefObject<HTMLButtonElement | null>;
  onFilterChange: (filter: FeedbackActionFilter) => void;
  onFilterOpenChange: (open: boolean) => void;
  onQueryChange: (query: string) => void;
  query: string;
}) {
  return (
    <div className="flex gap-2 border-b border-solid border-[color:var(--sniptale-color-border-soft)] px-3 pb-3">
      <label className="relative min-w-0 flex-1">
        <Search className="absolute left-3 top-3 text-[var(--sniptale-color-text-dim)]" size={16} />
        <span className="sr-only">{translate('content.designReview.panelSearch')}</span>
        <input
          className={[
            'h-10 w-full rounded-[9px] border bg-transparent pl-9 pr-3 text-xs outline-none',
            'border-[color:var(--sniptale-color-border-soft)]',
            'focus:border-[color:var(--sniptale-color-accent)]',
          ].join(' ')}
          placeholder={translate('content.designReview.panelSearch')}
          value={props.query}
          onChange={(event) => props.onQueryChange(event.target.value)}
        />
      </label>
      <FeedbackFilter
        filter={props.filter}
        menuRef={props.filterMenuRef}
        onChange={props.onFilterChange}
        onOpenChange={props.onFilterOpenChange}
        open={props.filterOpen}
        rootRef={props.filterRootRef}
        triggerRef={props.filterTriggerRef}
      />
    </div>
  );
}
