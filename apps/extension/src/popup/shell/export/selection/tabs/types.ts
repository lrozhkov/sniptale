import type { ActiveTabCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/types';

export interface PopupExportTabItem {
  disabledReason: string | null;
  favIconUrl?: string | null;
  isCurrent: boolean;
  tabId: number | null;
  title: string;
  url: string | null;
}

export type PopupExportFallbackTab = Pick<
  ActiveTabCapabilities,
  'export' | 'tabId' | 'title' | 'url'
>;

export interface PopupExportTabSelectionState {
  availableTabs: PopupExportTabItem[];
  filterQuery: string;
  filteredTabs: PopupExportTabItem[];
  isFilterActive: boolean;
  selectedCount: number;
  selectedTabIds: number[];
  selectedTabIdsInOrder: number[];
  setFilterQuery: (value: string) => void;
  toggleSelectAllTabs: () => void;
  toggleTabSelection: (tabId: number) => void;
}
