import type {
  DesignSystemRegistryEntry,
  DesignSystemUsageContext,
} from '../../../catalog/registry/types';

export type DesignSystemPageScopeFilter = 'all' | 'shared-ui' | 'product-ui';
export type DesignSystemPageKindFilter = 'all' | DesignSystemRegistryEntry['kind'];
export type DesignSystemPageUsageFilterMode = 'any' | 'all';

export interface DesignSystemPageFilters {
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  usageSearchQuery: string;
  setUsageSearchQuery: (value: string) => void;
  scopeFilter: DesignSystemPageScopeFilter;
  setScopeFilter: (value: DesignSystemPageScopeFilter) => void;
  kindFilter: DesignSystemPageKindFilter;
  setKindFilter: (value: DesignSystemPageKindFilter) => void;
  usageFilterMode: DesignSystemPageUsageFilterMode;
  setUsageFilterMode: (value: DesignSystemPageUsageFilterMode) => void;
  selectedUsageIds: string[];
  toggleUsageFilter: (usageId: string) => void;
  clearFilters: () => void;
}

export interface DesignSystemPageFilterState extends DesignSystemPageFilters {
  usageOptions: DesignSystemUsageContext[];
  filteredUsageOptions: DesignSystemUsageContext[];
  selectedUsageOptions: DesignSystemUsageContext[];
  hasActiveFilters: boolean;
  filteredEntries: DesignSystemRegistryEntry[];
  sharedEntries: DesignSystemRegistryEntry[];
  productEntries: DesignSystemRegistryEntry[];
  toggleUsageFilter: (usageId: string) => void;
  clearFilters: () => void;
}

interface DesignSystemPageCatalogState {
  sharedEntries: DesignSystemRegistryEntry[];
  productEntries: DesignSystemRegistryEntry[];
  filteredEntriesCount: number;
  filteredVariants: number;
  filteredUsageContexts: number;
  totalVariants: number;
  totalUsageContexts: number;
}

interface DesignSystemPageExplorerState {
  expandedEntryId: string | null;
  setExpandedEntryId: (componentId: string) => void;
  isFilterPanelOpen: boolean;
  setIsFilterPanelOpen: (open: boolean) => void;
  toggleFilterPanel: () => void;
}

export type DesignSystemPageState = DesignSystemPageFilterState &
  DesignSystemPageCatalogState &
  DesignSystemPageExplorerState;
