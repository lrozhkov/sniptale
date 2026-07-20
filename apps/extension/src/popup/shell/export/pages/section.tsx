import { translate } from '../../../../platform/i18n';
import { ExportPagesDrawerList, ExportPagesHeader } from './drawer';
import { getSelectedTabs, getShouldShowClearAll, useScrollCurrentRowIntoView } from './helpers';
import { ExportPagesSummary } from './summary';
import { ExportSelectionSectionShell } from '../selection/section-shell';
import type { PopupExportTabItem } from '../selection/tabs/types';

type ExportPagesSectionProps = {
  availableTabs: PopupExportTabItem[];
  className?: string;
  filterQuery: string;
  filteredTabs: PopupExportTabItem[];
  isExpanded: boolean;
  isFilterActive: boolean;
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
  selectedCount: number;
  selectedTabIds: number[];
  setFilterQuery: (value: string) => void;
  toggleSelectAllTabs: () => void;
  toggleTabSelection: (tabId: number) => void;
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
      title={translate('popup.export.tabsSectionLabel')}
      drawerLabel={translate('popup.export.tabsSectionLabel')}
      isExpanded={props.isExpanded}
      isOpen={props.isOpen}
      onOpen={props.onOpen}
      onClose={props.onClose}
      bodyClassName="flex min-h-0 flex-1 flex-col pt-1"
      {...(props.className === undefined ? {} : { className: props.className })}
    >
      {props.isOpen ? (
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
        <ExportPagesSummary selectedTabs={selectedTabs} onRemove={props.toggleTabSelection} />
      )}
    </ExportSelectionSectionShell>
  );
}
