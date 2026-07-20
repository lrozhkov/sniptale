import { Search } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { useMemo, useState } from 'react';

import { translate } from '../../../../platform/i18n';
import { renderDataTypeSummaryItems } from './summary';
import {
  getExportOptionActive,
  getExportOptionConfigs,
  setExportOptionActive,
  toggleExportOption,
  type ExportOptionConfig,
  type ExportOptionKey,
  type ExportOptionToggleProps,
} from './options/data';
import { ExportSelectionSectionShell } from '../selection/section-shell';
import { cx } from '../selection/utils';

type DataTypeSectionProps = ExportOptionToggleProps & {
  isExpanded: boolean;
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
};

const rowClassName = [
  'flex items-start gap-2.5 border-b px-0.5 py-2.5',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_68%,transparent)] last:border-b-0',
].join(' ');
const checkboxClassName = 'mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--sniptale-color-accent)]';

function DataTypeDrawerRow(props: {
  active: boolean;
  description: string;
  disabled: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <label
      className={cx(
        rowClassName,
        props.disabled && 'cursor-not-allowed opacity-60',
        props.active && 'text-[var(--sniptale-color-text-primary)]'
      )}
    >
      <input
        type="checkbox"
        className={checkboxClassName}
        checked={props.active}
        disabled={props.disabled}
        onChange={props.onToggle}
      />
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-medium text-[var(--sniptale-color-text-primary)]">
          {props.label}
        </div>
        <div className="mt-0.5 text-[10px] leading-4 text-[var(--sniptale-color-text-dim)]">
          {props.description}
        </div>
      </div>
    </label>
  );
}

function filterOptions(options: ExportOptionConfig[], filterQuery: string) {
  const normalizedQuery = filterQuery.trim().toLowerCase();
  if (!normalizedQuery) {
    return options;
  }

  return options.filter((option) =>
    `${option.label} ${option.description}`.toLowerCase().includes(normalizedQuery)
  );
}

function getAllOptionsSelected(
  optionKeys: ExportOptionKey[],
  toggleProps: ExportOptionToggleProps
): boolean {
  return (
    optionKeys.length > 0 && optionKeys.every((key) => getExportOptionActive(key, toggleProps))
  );
}

function createSelectionProps(props: DataTypeSectionProps): ExportOptionToggleProps {
  const bindSetter = <T extends boolean>(setter: Dispatch<SetStateAction<T>>) => setter;

  return {
    disabled: props.disabled,
    includeBasicLogs: props.includeBasicLogs,
    includeCssDiagnostics: props.includeCssDiagnostics,
    includeFiles: props.includeFiles,
    includeFullPageScreenshot: props.includeFullPageScreenshot,
    includeHarDomLogs: props.includeHarDomLogs,
    includeImages: props.includeImages,
    includeJson: props.includeJson,
    includeMarkdown: props.includeMarkdown,
    setIncludeBasicLogs: bindSetter(props.setIncludeBasicLogs),
    setIncludeCssDiagnostics: bindSetter(props.setIncludeCssDiagnostics),
    setIncludeFiles: bindSetter(props.setIncludeFiles),
    setIncludeFullPageScreenshot: bindSetter(props.setIncludeFullPageScreenshot),
    setIncludeHarDomLogs: bindSetter(props.setIncludeHarDomLogs),
    setIncludeImages: bindSetter(props.setIncludeImages),
    setIncludeJson: bindSetter(props.setIncludeJson),
    setIncludeMarkdown: bindSetter(props.setIncludeMarkdown),
  };
}

function DataTypeFilterBar(props: {
  filterQuery: string;
  onToggleAll: () => void;
  setFilterQuery: (value: string) => void;
  shouldShowClearAll: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 pb-2">
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
          placeholder={translate('popup.export.dataTypesFilterPlaceholder')}
          className={[
            'h-8 w-full rounded-[9px] border bg-transparent pl-7 pr-2.5 text-[11px]',
            'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_92%,transparent)]',
            'text-[var(--sniptale-color-text-primary)] placeholder:text-[var(--sniptale-color-text-dim)]',
            'outline-none focus:border-[var(--sniptale-color-accent)]',
          ].join(' ')}
        />
      </div>
      <button
        type="button"
        onClick={props.onToggleAll}
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
    </div>
  );
}

function applyVisibleOptionSelection(args: {
  nextValue: boolean;
  toggleProps: ExportOptionToggleProps;
  visibleOptions: ExportOptionConfig[];
}) {
  for (const option of args.visibleOptions) {
    if (getExportOptionActive(option.key, args.toggleProps) !== args.nextValue) {
      setExportOptionActive(option.key, args.nextValue, args.toggleProps);
    }
  }
}

function renderDataTypeBody(args: {
  disabled: boolean;
  filterQuery: string;
  setFilterQuery: (value: string) => void;
  shouldShowClearAll: boolean;
  toggleProps: ExportOptionToggleProps;
  visibleOptions: ExportOptionConfig[];
}) {
  if (!args.visibleOptions.length && args.filterQuery.trim().length > 0) {
    return (
      <div className="py-1 text-[11px] text-[var(--sniptale-color-text-dim)]">
        {translate('popup.export.noSelectedDataTypes')}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DataTypeFilterBar
        filterQuery={args.filterQuery}
        onToggleAll={() =>
          applyVisibleOptionSelection({
            nextValue: !args.shouldShowClearAll,
            toggleProps: args.toggleProps,
            visibleOptions: args.visibleOptions,
          })
        }
        setFilterQuery={args.setFilterQuery}
        shouldShowClearAll={args.shouldShowClearAll}
      />
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {args.visibleOptions.map((option) => (
          <DataTypeDrawerRow
            key={option.key}
            active={getExportOptionActive(option.key, args.toggleProps)}
            description={option.description}
            disabled={args.disabled}
            label={option.label}
            onToggle={() => toggleExportOption(option.key, args.toggleProps)}
          />
        ))}
      </div>
    </div>
  );
}

export function ExportDataTypeSection(props: DataTypeSectionProps) {
  const [filterQuery, setFilterQuery] = useState('');
  const toggleProps = createSelectionProps(props);
  const options = getExportOptionConfigs();
  const visibleOptions = useMemo(() => filterOptions(options, filterQuery), [filterQuery, options]);
  const selectedItems = options.filter((option) => getExportOptionActive(option.key, toggleProps));
  const visibleKeys = visibleOptions.map((option) => option.key);
  const shouldShowClearAll = getAllOptionsSelected(visibleKeys, toggleProps);

  return (
    <ExportSelectionSectionShell
      title={translate('popup.export.dataTypesSectionLabel')}
      drawerLabel={translate('popup.export.dataTypesSectionLabel')}
      isExpanded={props.isExpanded}
      isOpen={props.isOpen}
      onOpen={props.onOpen}
      onClose={props.onClose}
      bodyClassName={cx(
        props.isOpen ? 'flex min-h-0 flex-1 flex-col pt-1' : 'max-h-[132px] overflow-hidden pt-1'
      )}
    >
      {props.isOpen
        ? renderDataTypeBody({
            disabled: props.disabled,
            filterQuery,
            setFilterQuery,
            shouldShowClearAll,
            toggleProps,
            visibleOptions,
          })
        : renderDataTypeSummaryItems(selectedItems, toggleProps)}
    </ExportSelectionSectionShell>
  );
}
