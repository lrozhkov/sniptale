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
  activeSourceMode: 'tabs' | 'urls';
  availableTabs: PopupExportTabItem[];
  filterQuery: string;
  filteredTabs: PopupExportTabItem[];
  isFilterActive: boolean;
  selectedCount: number;
  selectedTabIds: number[];
  selectedTabIdsInOrder: number[];
  selectedUrls: string[];
  setActiveSourceMode: (mode: 'tabs' | 'urls') => void;
  setFilterQuery: (value: string) => void;
  setUrlInput: (value: string) => void;
  toggleSelectAllTabs: () => void;
  toggleTabSelection: (tabId: number) => void;
  removeSelectedUrl: (url: string) => void;
  urlInput: string;
  urlInputInvalid: string[];
  urlInputOverflow: number;
}
