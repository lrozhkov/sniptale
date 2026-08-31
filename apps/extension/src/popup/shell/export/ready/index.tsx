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
import type { WebCopyResourcePreferences } from '../pages/snapshot-availability';
import { usePageCaptureTimingPreferences } from '../pages/capture-timing';
import { usePackageCaptureBehaviorPreferences } from '../data-type/capture-behavior';

type ExportReadySectionProps = {
  activeSourceMode?: 'tabs' | 'urls';
  availableTabs: PopupExportTabItem[];
  destination: PopupPackageDestination;
  disabled: boolean;
  filterQuery: string;
  filteredTabs: PopupExportTabItem[];
  hasLoadedPreferences: boolean;
  includeAnnotations: boolean;
  includeBasicLogs: boolean;
  includeCssDiagnostics: boolean;
  includeFiles: boolean;
  includeFullPageScreenshot: boolean;
  includeViewportScreenshot?: boolean;
  includePageDiagnostics: boolean;
  includeImages: boolean;
  includeJson: boolean;
  includeMarkdown: boolean;
  includeWebCopy: boolean;
  isFilterActive: boolean;
  selectedCount: number;
  selectedTabIds: number[];
  selectedUrls?: string[];
  setActiveSourceMode?: (mode: 'tabs' | 'urls') => void;
  setIncludeAnnotations: Dispatch<SetStateAction<boolean>>;
  setIncludeBasicLogs: Dispatch<SetStateAction<boolean>>;
  setIncludeCssDiagnostics: Dispatch<SetStateAction<boolean>>;
  setFilterQuery: (value: string) => void;
  setIncludeFiles: Dispatch<SetStateAction<boolean>>;
  setIncludeFullPageScreenshot: Dispatch<SetStateAction<boolean>>;
  setIncludeViewportScreenshot?: Dispatch<SetStateAction<boolean>>;
  setIncludePageDiagnostics: Dispatch<SetStateAction<boolean>>;
  setIncludeImages: Dispatch<SetStateAction<boolean>>;
  setIncludeJson: Dispatch<SetStateAction<boolean>>;
  setIncludeMarkdown: Dispatch<SetStateAction<boolean>>;
  setIncludeWebCopy: Dispatch<SetStateAction<boolean>>;
  savePreferences: PopupPagePackagePreferenceState;
  onDestinationChange: (destination: PopupPackageDestination) => void;
  webCopyResources: WebCopyResourcePreferences;
  toggleSelectAllTabs: () => void;
  toggleTabSelection: (tabId: number) => void;
  removeSelectedUrl?: (url: string) => void;
  setUrlInput?: (value: string) => void;
  urlInput?: string;
  urlInputInvalid?: string[];
  urlInputOverflow?: number;
};

function renderReadyHint(
  props: Pick<ExportReadySectionProps, 'disabled' | 'hasLoadedPreferences' | 'selectedCount'>
) {
  if (!props.hasLoadedPreferences || props.selectedCount > 0) {
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
  isSettingsOpen: boolean,
  onClose: () => void,
  onOpen: () => void,
  onOpenSettings: () => void,
  captureBehavior: ReturnType<typeof usePackageCaptureBehaviorPreferences>
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
      includeViewportScreenshot={props.includeViewportScreenshot === true}
      includePageDiagnostics={props.includePageDiagnostics}
      includeImages={props.includeImages}
      includeJson={props.includeJson}
      includeMarkdown={props.includeMarkdown}
      includeWebCopy={packagePreferences.includeWebCopy}
      isExpanded={isEditingDataTypes}
      isOpen={isEditingDataTypes}
      isSettingsOpen={isSettingsOpen}
      onClose={onClose}
      onOpen={onOpen}
      onOpenSettings={onOpenSettings}
      captureBehavior={captureBehavior.preferences}
      onCaptureBehaviorChange={captureBehavior.update}
      resourceLimits={captureBehavior.resourceLimits}
      onResourceLimitsChange={captureBehavior.updateResourceLimits}
      packagePreferences={packagePreferences}
      setIncludeAnnotations={props.setIncludeAnnotations}
      setIncludeBasicLogs={props.setIncludeBasicLogs}
      setIncludeCssDiagnostics={props.setIncludeCssDiagnostics}
      setIncludeFiles={props.setIncludeFiles}
      setIncludeFullPageScreenshot={props.setIncludeFullPageScreenshot}
      {...(props.setIncludeViewportScreenshot
        ? { setIncludeViewportScreenshot: props.setIncludeViewportScreenshot }
        : {})}
      setIncludePageDiagnostics={props.setIncludePageDiagnostics}
      setIncludeImages={props.setIncludeImages}
      setIncludeJson={props.setIncludeJson}
      setIncludeMarkdown={props.setIncludeMarkdown}
      setIncludeWebCopy={packagePreferences.setIncludeWebCopy}
      webCopyResources={props.webCopyResources}
    />
  );
}

function renderPagesSection(
  props: ExportReadySectionProps,
  activeDrawer: 'data-types' | 'pages' | 'page-settings' | null,
  isEditingPages: boolean,
  onClose: () => void,
  onOpen: () => void,
  onOpenSettings: () => void,
  timing: ReturnType<typeof usePageCaptureTimingPreferences>
) {
  return (
    <ExportPagesSection
      activeSourceMode={props.activeSourceMode ?? 'tabs'}
      availableTabs={props.availableTabs}
      filterQuery={props.filterQuery}
      filteredTabs={props.filteredTabs}
      isExpanded={isEditingPages || activeDrawer === 'page-settings' || !activeDrawer}
      isFilterActive={props.isFilterActive}
      isOpen={isEditingPages || activeDrawer === 'page-settings'}
      isSettingsOpen={activeDrawer === 'page-settings'}
      onClose={onClose}
      onOpen={onOpen}
      onOpenSettings={onOpenSettings}
      selectedCount={props.selectedCount}
      selectedTabIds={props.selectedTabIds}
      selectedUrls={props.selectedUrls ?? []}
      setActiveSourceMode={props.setActiveSourceMode ?? (() => undefined)}
      setFilterQuery={props.setFilterQuery}
      toggleSelectAllTabs={props.toggleSelectAllTabs}
      toggleTabSelection={props.toggleTabSelection}
      removeSelectedUrl={props.removeSelectedUrl ?? (() => undefined)}
      setUrlInput={props.setUrlInput ?? (() => undefined)}
      timing={timing.timing}
      onTimingChange={timing.update}
      urlInput={props.urlInput ?? ''}
      urlInputInvalid={props.urlInputInvalid ?? []}
      urlInputOverflow={props.urlInputOverflow ?? 0}
      {...(activeDrawer === null ? { className: 'pt-2.5' } : {})}
    />
  );
}

function renderReadySections(
  props: ExportReadySectionProps,
  destination: PopupPackageDestination,
  packagePreferences: PopupPagePackagePreferenceState,
  activeDrawer: 'data-types' | 'package-settings' | 'pages' | 'page-settings' | null,
  setActiveDrawer: (
    nextValue: 'data-types' | 'package-settings' | 'pages' | 'page-settings' | null
  ) => void,
  timing: ReturnType<typeof usePageCaptureTimingPreferences>,
  captureBehavior: ReturnType<typeof usePackageCaptureBehaviorPreferences>
) {
  const isEditingDataTypes = activeDrawer === 'data-types' || activeDrawer === 'package-settings';
  const isEditingPages = activeDrawer === 'pages' || activeDrawer === 'page-settings';

  return (
    <>
      {!isEditingPages
        ? renderDataTypeSection(
            props,
            destination,
            packagePreferences,
            isEditingDataTypes,
            activeDrawer === 'package-settings',
            () => setActiveDrawer(null),
            () => setActiveDrawer('data-types'),
            () => setActiveDrawer('package-settings'),
            captureBehavior
          )
        : null}
      {!isEditingDataTypes
        ? renderPagesSection(
            props,
            activeDrawer,
            isEditingPages,
            () => setActiveDrawer(null),
            () => setActiveDrawer('pages'),
            () => setActiveDrawer('page-settings'),
            timing
          )
        : null}
    </>
  );
}

export function ExportReadySection(props: ExportReadySectionProps) {
  const [activeDrawer, setActiveDrawer] = useState<
    'data-types' | 'package-settings' | 'pages' | 'page-settings' | null
  >(null);
  const timing = usePageCaptureTimingPreferences();
  const captureBehavior = usePackageCaptureBehaviorPreferences();
  const exportPreferences: PopupPagePackagePreferenceState = {
    actions: {
      setIncludeAnnotations: props.setIncludeAnnotations,
      setIncludeBasicLogs: props.setIncludeBasicLogs,
      setIncludeCssDiagnostics: props.setIncludeCssDiagnostics,
      setIncludeFiles: props.setIncludeFiles,
      setIncludeFullPageScreenshot: props.setIncludeFullPageScreenshot,
      ...(props.setIncludeViewportScreenshot
        ? { setIncludeViewportScreenshot: props.setIncludeViewportScreenshot }
        : {}),
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
      includeViewportScreenshot: props.includeViewportScreenshot === true,
      includePageDiagnostics: props.includePageDiagnostics,
      includeImages: props.includeImages,
      includeJson: props.includeJson,
      includeMarkdown: props.includeMarkdown,
    },
  };
  const packagePreferences =
    props.destination === 'export' ? exportPreferences : props.savePreferences;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <PackageDestinationSwitch
        destination={props.destination}
        disabled={!props.hasLoadedPreferences}
        onChange={(nextDestination) => {
          props.onDestinationChange(nextDestination);
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
        props.destination,
        packagePreferences,
        activeDrawer,
        setActiveDrawer,
        timing,
        captureBehavior
      )}
      {renderReadyHint(props)}
    </div>
  );
}
