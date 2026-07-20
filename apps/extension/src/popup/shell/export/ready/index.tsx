import type { Dispatch, SetStateAction } from 'react';
import { useState } from 'react';

import { translate } from '../../../../platform/i18n';
import { ExportDataTypeSection } from '../data-type/section';
import { ExportPagesSection } from '../pages/section';
import type { PopupExportTabItem } from '../selection/tabs/types';

type ExportReadySectionProps = {
  availableTabs: PopupExportTabItem[];
  disabled: boolean;
  filterQuery: string;
  filteredTabs: PopupExportTabItem[];
  hasLoadedPreferences: boolean;
  includeBasicLogs: boolean;
  includeCssDiagnostics: boolean;
  includeFiles: boolean;
  includeFullPageScreenshot: boolean;
  includeHarDomLogs: boolean;
  includeImages: boolean;
  includeJson: boolean;
  includeMarkdown: boolean;
  isFilterActive: boolean;
  selectedCount: number;
  selectedTabIds: number[];
  setIncludeBasicLogs: Dispatch<SetStateAction<boolean>>;
  setIncludeCssDiagnostics: Dispatch<SetStateAction<boolean>>;
  setFilterQuery: (value: string) => void;
  setIncludeFiles: Dispatch<SetStateAction<boolean>>;
  setIncludeFullPageScreenshot: Dispatch<SetStateAction<boolean>>;
  setIncludeHarDomLogs: Dispatch<SetStateAction<boolean>>;
  setIncludeImages: Dispatch<SetStateAction<boolean>>;
  setIncludeJson: Dispatch<SetStateAction<boolean>>;
  setIncludeMarkdown: Dispatch<SetStateAction<boolean>>;
  toggleSelectAllTabs: () => void;
  toggleTabSelection: (tabId: number) => void;
};

function renderReadyHint(
  props: Pick<ExportReadySectionProps, 'disabled' | 'hasLoadedPreferences' | 'selectedCount'>
) {
  if (!props.hasLoadedPreferences || !props.disabled || props.selectedCount > 0) {
    return null;
  }

  return (
    <div className="px-1 text-[11px] text-[var(--sniptale-color-text-dim)]">
      {translate('popup.export.noSelectableTabsHint')}
    </div>
  );
}

function renderDataTypeSection(
  props: ExportReadySectionProps,
  isEditingDataTypes: boolean,
  onClose: () => void,
  onOpen: () => void
) {
  return (
    <ExportDataTypeSection
      disabled={props.disabled}
      includeBasicLogs={props.includeBasicLogs}
      includeCssDiagnostics={props.includeCssDiagnostics}
      includeFiles={props.includeFiles}
      includeFullPageScreenshot={props.includeFullPageScreenshot}
      includeHarDomLogs={props.includeHarDomLogs}
      includeImages={props.includeImages}
      includeJson={props.includeJson}
      includeMarkdown={props.includeMarkdown}
      isExpanded={isEditingDataTypes}
      isOpen={isEditingDataTypes}
      onClose={onClose}
      onOpen={onOpen}
      setIncludeBasicLogs={props.setIncludeBasicLogs}
      setIncludeCssDiagnostics={props.setIncludeCssDiagnostics}
      setIncludeFiles={props.setIncludeFiles}
      setIncludeFullPageScreenshot={props.setIncludeFullPageScreenshot}
      setIncludeHarDomLogs={props.setIncludeHarDomLogs}
      setIncludeImages={props.setIncludeImages}
      setIncludeJson={props.setIncludeJson}
      setIncludeMarkdown={props.setIncludeMarkdown}
    />
  );
}

function renderPagesSection(
  props: ExportReadySectionProps,
  activeDrawer: 'data-types' | 'pages' | null,
  isEditingPages: boolean,
  onClose: () => void,
  onOpen: () => void
) {
  return (
    <ExportPagesSection
      availableTabs={props.availableTabs}
      filterQuery={props.filterQuery}
      filteredTabs={props.filteredTabs}
      isExpanded={isEditingPages || !activeDrawer}
      isFilterActive={props.isFilterActive}
      isOpen={isEditingPages}
      onClose={onClose}
      onOpen={onOpen}
      selectedCount={props.selectedCount}
      selectedTabIds={props.selectedTabIds}
      setFilterQuery={props.setFilterQuery}
      toggleSelectAllTabs={props.toggleSelectAllTabs}
      toggleTabSelection={props.toggleTabSelection}
      {...(activeDrawer === null ? { className: 'pt-2.5' } : {})}
    />
  );
}

function renderReadySections(
  props: ExportReadySectionProps,
  activeDrawer: 'data-types' | 'pages' | null,
  setActiveDrawer: (nextValue: 'data-types' | 'pages' | null) => void
) {
  const isEditingDataTypes = activeDrawer === 'data-types';
  const isEditingPages = activeDrawer === 'pages';

  return (
    <>
      {!isEditingPages
        ? renderDataTypeSection(
            props,
            isEditingDataTypes,
            () => setActiveDrawer(null),
            () => setActiveDrawer('data-types')
          )
        : null}
      {!isEditingDataTypes
        ? renderPagesSection(
            props,
            activeDrawer,
            isEditingPages,
            () => setActiveDrawer(null),
            () => setActiveDrawer('pages')
          )
        : null}
    </>
  );
}

export function ExportReadySection(props: ExportReadySectionProps) {
  const [activeDrawer, setActiveDrawer] = useState<'data-types' | 'pages' | null>(null);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      {renderReadySections(props, activeDrawer, setActiveDrawer)}
      {renderReadyHint(props)}
    </div>
  );
}
