import type { Dispatch, SetStateAction } from 'react';
import { useState } from 'react';

import { translate } from '../../../../platform/i18n/popup';
import { ExportDataTypeSection } from '../data-type/section';
import { ExportPagesSection } from '../pages/section';
import type { PopupExportTabItem } from '../selection/tabs/types';
import type { PopupPagePackagePreferenceState } from '../session/types';
import {
  PackageDestinationSwitch,
  type PopupPackageDestination,
} from '../data-type/package-controls';

type ExportReadySectionProps = {
  availableTabs: PopupExportTabItem[];
  disabled: boolean;
  filterQuery: string;
  filteredTabs: PopupExportTabItem[];
  hasLoadedPreferences: boolean;
  includeAnnotations: boolean;
  includeBasicLogs: boolean;
  includeCssDiagnostics: boolean;
  includeFiles: boolean;
  includeFullPageScreenshot: boolean;
  includePageDiagnostics: boolean;
  includeImages: boolean;
  includeJson: boolean;
  includeMarkdown: boolean;
  includeWebCopy: boolean;
  isFilterActive: boolean;
  selectedCount: number;
  selectedTabIds: number[];
  setIncludeAnnotations: Dispatch<SetStateAction<boolean>>;
  setIncludeBasicLogs: Dispatch<SetStateAction<boolean>>;
  setIncludeCssDiagnostics: Dispatch<SetStateAction<boolean>>;
  setFilterQuery: (value: string) => void;
  setIncludeFiles: Dispatch<SetStateAction<boolean>>;
  setIncludeFullPageScreenshot: Dispatch<SetStateAction<boolean>>;
  setIncludePageDiagnostics: Dispatch<SetStateAction<boolean>>;
  setIncludeImages: Dispatch<SetStateAction<boolean>>;
  setIncludeJson: Dispatch<SetStateAction<boolean>>;
  setIncludeMarkdown: Dispatch<SetStateAction<boolean>>;
  setIncludeWebCopy: Dispatch<SetStateAction<boolean>>;
  savePreferences: PopupPagePackagePreferenceState;
  onRequestWebCopySetup: () => void;
  webSnapshotEnabled: boolean;
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
  destination: PopupPackageDestination,
  packagePreferences: PopupPagePackagePreferenceState,
  isEditingDataTypes: boolean,
  onClose: () => void,
  onOpen: () => void
) {
  return (
    <ExportDataTypeSection
      disabled={props.disabled}
      destination={destination}
      includeAnnotations={props.includeAnnotations}
      includeBasicLogs={props.includeBasicLogs}
      includeCssDiagnostics={props.includeCssDiagnostics}
      includeFiles={props.includeFiles}
      includeFullPageScreenshot={props.includeFullPageScreenshot}
      includePageDiagnostics={props.includePageDiagnostics}
      includeImages={props.includeImages}
      includeJson={props.includeJson}
      includeMarkdown={props.includeMarkdown}
      isExpanded={isEditingDataTypes}
      isOpen={isEditingDataTypes}
      onClose={onClose}
      onOpen={onOpen}
      onRequestWebCopySetup={props.onRequestWebCopySetup}
      packagePreferences={packagePreferences}
      setIncludeAnnotations={props.setIncludeAnnotations}
      setIncludeBasicLogs={props.setIncludeBasicLogs}
      setIncludeCssDiagnostics={props.setIncludeCssDiagnostics}
      setIncludeFiles={props.setIncludeFiles}
      setIncludeFullPageScreenshot={props.setIncludeFullPageScreenshot}
      setIncludePageDiagnostics={props.setIncludePageDiagnostics}
      setIncludeImages={props.setIncludeImages}
      setIncludeJson={props.setIncludeJson}
      setIncludeMarkdown={props.setIncludeMarkdown}
      webSnapshotEnabled={props.webSnapshotEnabled}
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
  destination: PopupPackageDestination,
  packagePreferences: PopupPagePackagePreferenceState,
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
            destination,
            packagePreferences,
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
  const [destination, setDestination] = useState<PopupPackageDestination>('export');
  const exportPreferences: PopupPagePackagePreferenceState = {
    actions: {
      setIncludeAnnotations: props.setIncludeAnnotations,
      setIncludeBasicLogs: props.setIncludeBasicLogs,
      setIncludeCssDiagnostics: props.setIncludeCssDiagnostics,
      setIncludeFiles: props.setIncludeFiles,
      setIncludeFullPageScreenshot: props.setIncludeFullPageScreenshot,
      setIncludePageDiagnostics: props.setIncludePageDiagnostics,
      setIncludeImages: props.setIncludeImages,
      setIncludeJson: props.setIncludeJson,
      setIncludeMarkdown: props.setIncludeMarkdown,
    },
    includeWebCopy: props.includeWebCopy,
    setIncludeWebCopy: props.setIncludeWebCopy,
    values: {
      includeAnnotations: props.includeAnnotations,
      includeBasicLogs: props.includeBasicLogs,
      includeCssDiagnostics: props.includeCssDiagnostics,
      includeFiles: props.includeFiles,
      includeFullPageScreenshot: props.includeFullPageScreenshot,
      includePageDiagnostics: props.includePageDiagnostics,
      includeImages: props.includeImages,
      includeJson: props.includeJson,
      includeMarkdown: props.includeMarkdown,
    },
  };
  const packagePreferences = destination === 'export' ? exportPreferences : props.savePreferences;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <PackageDestinationSwitch
        destination={destination}
        disabled={props.disabled}
        onChange={(nextDestination) => {
          setDestination(nextDestination);
          setActiveDrawer(null);
        }}
      />
      {renderReadySections(
        {
          ...props,
          ...packagePreferences.values,
          ...packagePreferences.actions,
          includeWebCopy: packagePreferences.includeWebCopy,
          setIncludeWebCopy: packagePreferences.setIncludeWebCopy,
        },
        destination,
        packagePreferences,
        activeDrawer,
        setActiveDrawer
      )}
      {renderReadyHint(props)}
    </div>
  );
}
