import { Search } from 'lucide-react';
import type { MutableRefObject } from 'react';

import { translate } from '../../../../platform/i18n';
import { cx } from '../selection/utils';
import type { PopupExportTabItem } from '../selection/tabs/types';

const rowClassName = [
  'flex items-start gap-2.5 border-b px-0.5 py-2.5',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_68%,transparent)] last:border-b-0',
].join(' ');
const checkboxClassName = 'mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--sniptale-color-accent)]';

function ExportPagesFilterInput(props: {
  filterQuery: string;
  setFilterQuery: (value: string) => void;
}) {
  return (
    <div className="relative min-w-0 flex-1">
      <Search
        className={[
          'pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2',
          'text-[var(--sniptale-color-text-dim)]',
        ].join(' ')}
      />
      <input
        type="text"
        value={props.filterQuery}
        onChange={(event) => props.setFilterQuery(event.currentTarget.value)}
        placeholder={translate('popup.export.tabsFilterPlaceholder')}
        className={[
          'h-8 w-full rounded-[9px] border bg-transparent pl-7 pr-2.5 text-[11px]',
          'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_92%,transparent)]',
          'text-[var(--sniptale-color-text-primary)] placeholder:text-[var(--sniptale-color-text-dim)]',
          'outline-none focus:border-[var(--sniptale-color-accent)]',
        ].join(' ')}
      />
    </div>
  );
}

export function ExportPagesHeader(props: {
  filterQuery: string;
  selectedCount: number;
  setFilterQuery: (value: string) => void;
  shouldShowClearAll: boolean;
  toggleSelectAllTabs: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 pb-2">
      <ExportPagesFilterInput
        filterQuery={props.filterQuery}
        setFilterQuery={props.setFilterQuery}
      />
      <button
        type="button"
        onClick={props.toggleSelectAllTabs}
        className={[
          'shrink-0 rounded-[9px] px-1.5 py-1 text-[10px] font-medium',
          'text-[var(--sniptale-color-text-primary)] transition-colors',
          'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_72%,transparent)]',
          'outline-none focus-visible:outline-none',
        ].join(' ')}
      >
        {props.shouldShowClearAll
          ? translate('popup.export.clearAllTabsButton')
          : translate('popup.export.selectAllTabsButton')}
      </button>
      <div className="shrink-0 px-1 text-[10px] font-medium text-[var(--sniptale-color-text-secondary)]">
        {props.selectedCount}
      </div>
    </div>
  );
}

function ExportPagesDrawerRow(props: {
  currentRowRef?: (node: HTMLLabelElement | null) => void;
  isSelected: boolean;
  onToggle: () => void;
  tab: PopupExportTabItem;
}) {
  const isDisabled = props.tab.disabledReason !== null || props.tab.tabId === null;

  return (
    <label
      ref={props.currentRowRef}
      title={props.tab.disabledReason ?? props.tab.url ?? props.tab.title}
      className={cx(
        rowClassName,
        isDisabled && 'cursor-not-allowed opacity-60',
        props.isSelected && 'text-[var(--sniptale-color-text-primary)]'
      )}
    >
      <input
        type="checkbox"
        className={checkboxClassName}
        checked={props.isSelected}
        disabled={isDisabled}
        onChange={props.onToggle}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-medium text-[var(--sniptale-color-text-primary)]">
          {props.tab.title}
        </div>
        <div className="mt-0.5 truncate text-[10px] leading-4 text-[var(--sniptale-color-text-dim)]">
          {props.tab.url ?? translate('popup.common.noActiveTab')}
        </div>
      </div>
      {props.tab.isCurrent ? (
        <span
          className={[
            'shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase',
            'tracking-[0.08em] text-[var(--sniptale-color-text-secondary)]',
          ].join(' ')}
        >
          {translate('popup.export.currentTabBadge')}
        </span>
      ) : null}
    </label>
  );
}

export function ExportPagesDrawerList(props: {
  currentRowRef: MutableRefObject<HTMLLabelElement | null>;
  filteredTabs: PopupExportTabItem[];
  selectedTabIds: number[];
  toggleTabSelection: (tabId: number) => void;
}) {
  return (
    <div className="mt-1 min-h-0 flex-1 overflow-y-auto pr-1">
      {props.filteredTabs.map((tab) => (
        <ExportPagesDrawerRow
          key={`${tab.tabId ?? 'fallback'}-${tab.url ?? tab.title}`}
          tab={tab}
          isSelected={tab.tabId !== null && props.selectedTabIds.includes(tab.tabId)}
          onToggle={() => {
            if (typeof tab.tabId === 'number') {
              props.toggleTabSelection(tab.tabId);
            }
          }}
          {...(tab.isCurrent
            ? {
                currentRowRef: (node: HTMLLabelElement | null) => {
                  props.currentRowRef.current = node;
                },
              }
            : {})}
        />
      ))}
    </div>
  );
}
