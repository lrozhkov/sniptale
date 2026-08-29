import { translate } from '../../../../platform/i18n/popup';
import { ExportPagesDrawerList, ExportPagesHeader } from './drawer';
import { getSelectedTabs, getShouldShowClearAll, useScrollCurrentRowIntoView } from './helpers';
import { ExportPagesSummary, ExportUrlsSummary } from './summary';
import { ExportSelectionSectionShell } from '../selection/section-shell';
import type { PopupExportTabItem } from '../selection/tabs/types';
import { ExportPageSourceSwitch, ExportUrlsEditor } from './url-editor';
import { PageCaptureTimingSettings } from './capture-timing';
import type { PagePackageCaptureTimingPolicy } from '@sniptale/runtime-contracts/page-package';

type ExportPagesSectionProps = {
  activeSourceMode: 'tabs' | 'urls';
  availableTabs: PopupExportTabItem[];
  className?: string;
  filterQuery: string;
  filteredTabs: PopupExportTabItem[];
  isExpanded: boolean;
  isFilterActive: boolean;
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
  onOpenSettings?: () => void;
  isSettingsOpen?: boolean;
  selectedCount: number;
  selectedTabIds: number[];
  selectedUrls: string[];
  setActiveSourceMode: (mode: 'tabs' | 'urls') => void;
  setFilterQuery: (value: string) => void;
  toggleSelectAllTabs: () => void;
  toggleTabSelection: (tabId: number) => void;
  removeSelectedUrl: (url: string) => void;
  setUrlInput: (value: string) => void;
  timing: PagePackageCaptureTimingPolicy;
  onTimingChange: (timing: PagePackageCaptureTimingPolicy) => void;
  urlInput: string;
  urlInputInvalid: string[];
  urlInputOverflow: number;
};

export function ExportPagesSection(props: ExportPagesSectionProps) {
  const currentRowRef = useScrollCurrentRowIntoView(props.isOpen, props.filteredTabs);
  const selectedTabs = getSelectedTabs(props.availableTabs, props.selectedTabIds);
  const shouldShowClearAll = getShouldShowClearAll({
    filteredTabs: props.filteredTabs,
    isFilterActive: props.isFilterActive,
    selectedTabIds: props.selectedTabIds,
  });

  return (
    <ExportSelectionSectionShell
      title={translate(
        props.isSettingsOpen ? 'popup.export.pageSettingsTitle' : 'popup.export.tabsSectionLabel'
      )}
      drawerLabel={translate('popup.export.tabsSectionLabel')}
      drawerDescription={translate(
        props.isSettingsOpen
          ? 'popup.export.pageSettingsDescription'
          : 'popup.export.tabsSectionDescription'
      )}
      isExpanded={props.isExpanded}
      isOpen={props.isOpen}
      onOpen={props.onOpen}
      {...(props.onOpenSettings ? { onOpenSettings: props.onOpenSettings } : {})}
      onClose={props.onClose}
      bodyClassName="flex min-h-0 flex-1 flex-col pt-1"
      {...(props.className === undefined ? {} : { className: props.className })}
    >
      {props.isSettingsOpen ? (
        <PageCaptureTimingSettings timing={props.timing} onChange={props.onTimingChange} />
      ) : props.isOpen ? (
        <>
          <ExportPageSourceSwitch
            mode={props.activeSourceMode}
            onChange={props.setActiveSourceMode}
          />
          {props.activeSourceMode === 'tabs' ? (
            <>
              <ExportPagesHeader
                filterQuery={props.filterQuery}
                selectedCount={props.selectedCount}
                setFilterQuery={props.setFilterQuery}
                shouldShowClearAll={shouldShowClearAll}
                toggleSelectAllTabs={props.toggleSelectAllTabs}
              />
              <ExportPagesDrawerList
                currentRowRef={currentRowRef}
                filteredTabs={props.filteredTabs}
                selectedTabIds={props.selectedTabIds}
                toggleTabSelection={props.toggleTabSelection}
              />
            </>
          ) : (
            <ExportUrlsEditor
              invalid={props.urlInputInvalid}
              overflow={props.urlInputOverflow}
              selectedCount={props.selectedUrls.length}
              text={props.urlInput}
              onChange={props.setUrlInput}
            />
          )}
        </>
      ) : props.activeSourceMode === 'urls' ? (
        <ExportUrlsSummary urls={props.selectedUrls} onRemove={props.removeSelectedUrl} />
      ) : (
        <ExportPagesSummary selectedTabs={selectedTabs} onRemove={props.toggleTabSelection} />
      )}
    </ExportSelectionSectionShell>
  );
}
