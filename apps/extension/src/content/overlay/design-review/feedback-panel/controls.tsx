import { Search } from 'lucide-react';
import { useRef, type RefObject } from 'react';
import { InspectorFieldClear } from '../../../../ui/compact-inspector-controls/text-field';
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
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex gap-2 border-b border-solid border-[color:var(--sniptale-color-border-soft)] px-3 pb-3">
      <label className="relative min-w-0 flex-1">
        <Search className="absolute left-2 top-2 text-[var(--sniptale-color-text-dim)]" size={16} />
        <span className="sr-only">{translate('content.designReview.panelSearch')}</span>
        <input
          ref={input}
          className={[
            'h-8 w-full rounded-[4px] border bg-transparent pl-8 pr-8 outline-none',
            'text-[13px] leading-[18px] font-medium',
            'border-[color:var(--sniptale-color-border-soft)]',
            'focus:border-[color:var(--sniptale-color-accent)]',
          ].join(' ')}
          placeholder={translate('content.designReview.panelSearch')}
          value={props.query}
          onChange={(event) => props.onQueryChange(event.target.value)}
        />
        {props.query ? (
          <InspectorFieldClear
            label={translate('content.designReview.panelSearch')}
            target={input}
          />
        ) : null}
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
