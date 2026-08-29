import { Search } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { useMemo, useState } from 'react';

import { translate } from '../../../../platform/i18n/popup';
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
import type { PopupPagePackagePreferenceState } from '../session/types';
import type { PopupPackageDestination } from './package-controls';
import type { WebCopyResourcePreferences } from '../pages/snapshot-availability';
import type { FullPageCapturePreferences } from '../../../../contracts/full-page-capture';
import { DEFAULT_FULL_PAGE_CAPTURE_PREFERENCES } from '../../../../contracts/full-page-capture';
import { PackageCaptureBehaviorSettings } from './capture-behavior';
import {
  DEFAULT_EXPORT_RESOURCE_LIMITS,
  type ExportResourceLimits,
} from '@sniptale/runtime-contracts/export';

type DataTypeSectionProps = ExportOptionToggleProps & {
  destination: PopupPackageDestination;
  isExpanded: boolean;
  isOpen: boolean;
  isSettingsOpen?: boolean;
  onClose: () => void;
  onOpen: () => void;
  onOpenSettings?: () => void;
  captureBehavior?: FullPageCapturePreferences;
  onCaptureBehaviorChange?: (preferences: FullPageCapturePreferences) => void;
  resourceLimits?: ExportResourceLimits;
  onResourceLimitsChange?: (limits: ExportResourceLimits) => void;
  packagePreferences: PopupPagePackagePreferenceState;
  webCopyResources: WebCopyResourcePreferences;
};

const rowClassName = [
  'flex items-start gap-2.5 border-b px-0.5 py-2.5',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_68%,transparent)] last:border-b-0',
].join(' ');
const checkboxClassName = 'mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--sniptale-color-accent)]';
const REQUIRED_LIBRARY_OPTION_KEYS = new Set<ExportOptionKey>(['webCopy', 'fullPageScreenshot']);
const REQUIRED_WEB_COPY_OPTION_KEYS = new Set<ExportOptionKey>(['fullPageScreenshot']);

function isRequiredLibraryOption(
  destination: PopupPackageDestination,
  key: ExportOptionKey
): boolean {
  return destination === 'save' && REQUIRED_LIBRARY_OPTION_KEYS.has(key);
}

function isRequiredOption(
  destination: PopupPackageDestination,
  key: ExportOptionKey,
  toggleProps: ExportOptionToggleProps
): boolean {
  return (
    isRequiredLibraryOption(destination, key) ||
    (key === 'fullPageScreenshot' && toggleProps.includeWebCopy)
  );
}

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
          <span>{props.label}</span>
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
    includeWebCopy: props.packagePreferences.includeWebCopy,
    includeAnnotations: props.includeAnnotations,
    includeBasicLogs: props.includeBasicLogs,
    includeCssDiagnostics: props.includeCssDiagnostics,
    includeFiles: props.includeFiles,
    includeFullPageScreenshot: props.includeFullPageScreenshot,
    includeViewportScreenshot: props.includeViewportScreenshot === true,
    includePageDiagnostics: props.includePageDiagnostics,
    includeImages: props.includeImages,
    includeJson: props.includeJson,
    includeMarkdown: props.includeMarkdown,
    setIncludeAnnotations: bindSetter(props.setIncludeAnnotations),
    setIncludeBasicLogs: bindSetter(props.setIncludeBasicLogs),
    setIncludeCssDiagnostics: bindSetter(props.setIncludeCssDiagnostics),
    setIncludeFiles: bindSetter(props.setIncludeFiles),
    setIncludeFullPageScreenshot: bindSetter(props.setIncludeFullPageScreenshot),
    ...(props.setIncludeViewportScreenshot
      ? { setIncludeViewportScreenshot: bindSetter(props.setIncludeViewportScreenshot) }
      : {}),
    setIncludePageDiagnostics: bindSetter(props.setIncludePageDiagnostics),
    setIncludeImages: bindSetter(props.setIncludeImages),
    setIncludeJson: bindSetter(props.setIncludeJson),
    setIncludeMarkdown: bindSetter(props.setIncludeMarkdown),
    setIncludeWebCopy: props.packagePreferences.setIncludeWebCopy,
  };
}

function DataTypeFilterBar(props: {
  disabled: boolean;
  destination: PopupPackageDestination;
  filterQuery: string;
  onToggleAll: () => void;
  options: ExportOptionConfig[];
  setFilterQuery: (value: string) => void;
  shouldShowClearAll: boolean;
  toggleProps: ExportOptionToggleProps;
}) {
  const [isFilterFocused, setIsFilterFocused] = useState(false);
  return (
    <div className="flex h-8 items-center gap-1 pb-2" data-ui="popup.export.quick-selection">
      <div className={cx('relative min-w-0', isFilterFocused ? 'flex-1' : 'w-[66px] shrink-0')}>
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
            'transition-[width] duration-150',
            'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_92%,transparent)]',
            'text-[var(--sniptale-color-text-primary)] placeholder:text-[var(--sniptale-color-text-dim)]',
            'outline-none focus:border-[var(--sniptale-color-accent)]',
          ].join(' ')}
          onBlur={() => setIsFilterFocused(false)}
          onFocus={() => setIsFilterFocused(true)}
        />
      </div>
      <button
        type="button"
        onClick={props.onToggleAll}
        className={[
          'h-8 shrink-0 rounded-[9px] px-1.5 text-[10px] font-medium',
          'text-[var(--sniptale-color-text-primary)] transition-colors',
          'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_72%,transparent)]',
          'outline-none focus-visible:outline-none',
        ].join(' ')}
      >
        {props.shouldShowClearAll
          ? translate('popup.export.clearAllTabsButton')
          : translate('popup.export.selectAllTabsButton')}
      </button>
      {!isFilterFocused ? (
        <QuickSelection
          destination={props.destination}
          disabled={props.disabled}
          options={props.options}
          toggleProps={props.toggleProps}
        />
      ) : null}
    </div>
  );
}

function applyVisibleOptionSelection(args: {
  destination: PopupPackageDestination;
  nextValue: boolean;
  toggleProps: ExportOptionToggleProps;
  visibleOptions: ExportOptionConfig[];
}) {
  for (const option of args.visibleOptions) {
    if (!args.nextValue && isRequiredOption(args.destination, option.key, args.toggleProps)) {
      continue;
    }
    if (getExportOptionActive(option.key, args.toggleProps) !== args.nextValue) {
      setExportOptionActive(option.key, args.nextValue, args.toggleProps);
    }
  }
}

function applyQuickSelection(
  preset: 'web-copy' | 'materials',
  destination: PopupPackageDestination,
  options: ExportOptionConfig[],
  toggleProps: ExportOptionToggleProps
) {
  for (const option of options) {
    const nextValue =
      isRequiredOption(destination, option.key, toggleProps) ||
      (preset === 'web-copy' && option.key === 'webCopy') ||
      (preset === 'materials' && ['json', 'markdown', 'files', 'images'].includes(option.key));
    if (getExportOptionActive(option.key, toggleProps) !== nextValue) {
      setExportOptionActive(option.key, nextValue, toggleProps);
    }
  }
}

function QuickSelection(props: {
  destination: PopupPackageDestination;
  disabled: boolean;
  options: ExportOptionConfig[];
  toggleProps: ExportOptionToggleProps;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      {(['web-copy', 'materials'] as const).map((preset) => (
        <button
          key={preset}
          type="button"
          disabled={props.disabled}
          className={[
            'h-8 min-w-0 rounded-[7px] border px-1.5 text-[9px]',
            'border-[var(--sniptale-color-border-soft)]',
            'text-[var(--sniptale-color-text-secondary)]',
            'hover:border-[var(--sniptale-color-accent)]',
            'hover:text-[var(--sniptale-color-text-primary)]',
          ].join(' ')}
          onClick={() =>
            applyQuickSelection(preset, props.destination, props.options, props.toggleProps)
          }
        >
          {translate(
            preset === 'web-copy'
              ? 'popup.export.packagePresetWebCopy'
              : 'popup.export.packagePresetMaterials'
          )}
        </button>
      ))}
    </div>
  );
}

function WebCopyResourceControls(props: {
  disabled: boolean;
  resources: WebCopyResourcePreferences;
}) {
  const items = [
    {
      checked: props.resources.authenticatedSameOriginAssetsEnabled,
      description: translate('popup.export.webCopyCurrentSiteDescription'),
      label: translate('popup.export.webCopyCurrentSiteLabel'),
      pending: props.resources.pending === 'authenticated',
      setChecked: props.resources.setAuthenticatedSameOriginAssetsEnabled,
    },
    {
      checked: props.resources.anonymousCrossOriginAssetsEnabled,
      description: translate('popup.export.webCopyExternalSitesDescription'),
      label: translate('popup.export.webCopyExternalSitesLabel'),
      pending: props.resources.pending === 'anonymous',
      setChecked: props.resources.setAnonymousCrossOriginAssetsEnabled,
    },
    {
      checked: props.resources.externalAssetRedirectsEnabled,
      description: translate('popup.export.webCopyExternalRedirectsDescription'),
      disabled: !props.resources.anonymousCrossOriginAssetsEnabled,
      indent: true,
      label: translate('popup.export.webCopyExternalRedirectsLabel'),
      pending: props.resources.pending === 'external-redirects',
      setChecked: props.resources.setExternalAssetRedirectsEnabled,
    },
    {
      checked: props.resources.externalLinksEnabled,
      description: translate('popup.export.webCopyExternalLinksDescription'),
      label: translate('popup.export.webCopyExternalLinksLabel'),
      pending: props.resources.pending === 'external-links',
      setChecked: props.resources.setExternalLinksEnabled,
    },
  ];
  return (
    <div className="ml-5 pl-3">
      {items.map((item) => (
        <label
          key={item.label}
          className={['flex items-start gap-2 py-1.5', item.indent ? 'ml-4' : ''].join(' ')}
        >
          <input
            type="checkbox"
            className={checkboxClassName}
            checked={item.checked}
            disabled={
              props.disabled ||
              item.disabled === true ||
              item.pending ||
              props.resources.pending !== null
            }
            onChange={(event) => void item.setChecked(event.currentTarget.checked)}
          />
          <span className="min-w-0">
            <span className="block text-[11px] font-medium text-[var(--sniptale-color-text-primary)]">
              {item.label}
            </span>
            <span className="block text-[10px] leading-4 text-[var(--sniptale-color-text-dim)]">
              {item.description}
            </span>
          </span>
        </label>
      ))}
      {props.resources.error ? (
        <div role="status" className="pb-1 text-[10px] text-[var(--sniptale-color-danger)]">
          {translate('popup.export.webCopyResourceSettingsError')}
        </div>
      ) : null}
    </div>
  );
}

function OptionGroupLabel({ group }: { group: ExportOptionConfig['group'] }) {
  return (
    <div
      className={[
        'sticky top-0 z-[1] bg-[var(--sniptale-color-surface-panel)] pb-1 pt-2',
        'text-[9px] font-semibold uppercase tracking-[0.08em]',
        'text-[var(--sniptale-color-text-muted-strong)]',
      ].join(' ')}
    >
      {translate(
        group === 'web-copy'
          ? 'popup.export.packagePresetWebCopy'
          : group === 'content'
            ? 'popup.export.contentGroupLabel'
            : 'popup.export.diagnosticsGroupLabel'
      )}
    </div>
  );
}

function renderDataTypeBody(args: {
  destination: PopupPackageDestination;
  disabled: boolean;
  filterQuery: string;
  setFilterQuery: (value: string) => void;
  shouldShowClearAll: boolean;
  toggleProps: ExportOptionToggleProps;
  options: ExportOptionConfig[];
  visibleOptions: ExportOptionConfig[];
  webCopyResources: WebCopyResourcePreferences;
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
        disabled={args.disabled}
        destination={args.destination}
        filterQuery={args.filterQuery}
        onToggleAll={() =>
          applyVisibleOptionSelection({
            destination: args.destination,
            nextValue: !args.shouldShowClearAll,
            toggleProps: args.toggleProps,
            visibleOptions: args.visibleOptions,
          })
        }
        options={args.options}
        setFilterQuery={args.setFilterQuery}
        shouldShowClearAll={args.shouldShowClearAll}
        toggleProps={args.toggleProps}
      />
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {args.visibleOptions.map((option, index) => (
          <div key={option.key}>
            {index === 0 || args.visibleOptions[index - 1]?.group !== option.group ? (
              <OptionGroupLabel group={option.group} />
            ) : null}
            <DataTypeDrawerRow
              active={getExportOptionActive(option.key, args.toggleProps)}
              description={option.description}
              disabled={
                args.disabled || isRequiredOption(args.destination, option.key, args.toggleProps)
              }
              label={option.label}
              onToggle={() => toggleExportOption(option.key, args.toggleProps)}
            />
            {option.key === 'webCopy' && getExportOptionActive(option.key, args.toggleProps) ? (
              <WebCopyResourceControls disabled={args.disabled} resources={args.webCopyResources} />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ExportDataTypeSection(props: DataTypeSectionProps) {
  const [filterQuery, setFilterQuery] = useState('');
  const toggleProps = createSelectionProps(props);
  const options = useMemo(() => getExportOptionConfigs(), []);
  const visibleOptions = useMemo(() => filterOptions(options, filterQuery), [filterQuery, options]);
  const selectedItems = options.filter((option) => getExportOptionActive(option.key, toggleProps));
  const visibleKeys = visibleOptions.map((option) => option.key);
  const shouldShowClearAll = getAllOptionsSelected(visibleKeys, toggleProps);

  return (
    <ExportSelectionSectionShell
      title={translate(
        props.isSettingsOpen
          ? 'popup.export.packageCaptureSettingsTitle'
          : 'popup.export.dataTypesSectionLabel'
      )}
      drawerLabel={translate(
        props.isSettingsOpen
          ? 'popup.export.packageCaptureSettingsTitle'
          : 'popup.export.dataTypesSectionLabel'
      )}
      drawerDescription={translate(
        props.isSettingsOpen
          ? 'popup.export.packageCaptureSettingsDescription'
          : 'popup.export.dataTypesSectionDescription'
      )}
      isExpanded={props.isExpanded}
      isOpen={props.isOpen}
      onOpen={props.onOpen}
      onClose={props.onClose}
      {...(props.onOpenSettings ? { onOpenSettings: props.onOpenSettings } : {})}
      settingsAriaLabel={translate('popup.export.packageCaptureSettingsTitle')}
      bodyClassName={cx(props.isOpen ? 'flex min-h-0 flex-1 flex-col pt-1' : 'pt-1')}
    >
      {props.isSettingsOpen ? (
        <PackageCaptureBehaviorSettings
          preferences={props.captureBehavior ?? DEFAULT_FULL_PAGE_CAPTURE_PREFERENCES}
          onChange={props.onCaptureBehaviorChange ?? (() => undefined)}
          resourceLimits={props.resourceLimits ?? DEFAULT_EXPORT_RESOURCE_LIMITS}
          onResourceLimitsChange={props.onResourceLimitsChange ?? (() => undefined)}
        />
      ) : props.isOpen ? (
        renderDataTypeBody({
          destination: props.destination,
          disabled: props.disabled,
          filterQuery,
          setFilterQuery,
          shouldShowClearAll,
          toggleProps,
          options,
          visibleOptions,
          webCopyResources: props.webCopyResources,
        })
      ) : (
        renderDataTypeSummaryItems(
          selectedItems,
          toggleProps,
          props.destination === 'save'
            ? REQUIRED_LIBRARY_OPTION_KEYS
            : props.includeWebCopy
              ? REQUIRED_WEB_COPY_OPTION_KEYS
              : new Set()
        )
      )}
    </ExportSelectionSectionShell>
  );
}
