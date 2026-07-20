import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { useMemo, useRef, useState } from 'react';

import type { PageAccessStatus } from '@sniptale/runtime-contracts/messaging/page-access';
import type { ActiveTabCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/types';
import {
  createFallbackTabItem,
  filterTabs,
  getSelectableTabIds,
  getSelectedTabIdsInOrder,
} from './items';
import { useAvailableTabQuery, usePersistedTabSelection } from './query';
import type { PopupExportTabItem, PopupExportTabSelectionState } from './types';

function createSelectAllTabsHandler(args: {
  availableTabs: PopupExportTabItem[];
  filteredTabs: PopupExportTabItem[];
  isFilterActive: boolean;
  setSelectedTabIds: Dispatch<SetStateAction<number[]>>;
}) {
  return () => {
    const selectableFilteredTabIds = getSelectableTabIds(args.filteredTabs);

    args.setSelectedTabIds((currentSelected) => {
      if (args.isFilterActive) {
        return selectableFilteredTabIds;
      }

      const selectableAllTabIds = getSelectableTabIds(args.availableTabs);
      const areAllTabsSelected =
        selectableAllTabIds.length > 0 &&
        selectableAllTabIds.every((tabId) => currentSelected.includes(tabId));

      return areAllTabsSelected ? [] : selectableAllTabIds;
    });
  };
}

function createToggleTabSelectionHandler(args: {
  hasHydratedSelectionRef: MutableRefObject<boolean>;
  setSelectedTabIds: Dispatch<SetStateAction<number[]>>;
}) {
  return (tabId: number) => {
    args.hasHydratedSelectionRef.current = true;
    args.setSelectedTabIds((currentSelected) =>
      currentSelected.includes(tabId)
        ? currentSelected.filter((selectedTabId) => selectedTabId !== tabId)
        : [...currentSelected, tabId]
    );
  };
}

function createTabSelectionState(args: {
  availableTabs: PopupExportTabItem[];
  filterQuery: string;
  filteredTabs: PopupExportTabItem[];
  isFilterActive: boolean;
  selectedTabIds: number[];
  selectedTabIdsInOrder: number[];
  setFilterQuery: Dispatch<SetStateAction<string>>;
  toggleSelectAllTabs: () => void;
  toggleTabSelection: (tabId: number) => void;
}): PopupExportTabSelectionState {
  return {
    availableTabs: args.availableTabs,
    filterQuery: args.filterQuery,
    filteredTabs: args.filteredTabs,
    isFilterActive: args.isFilterActive,
    selectedCount: args.selectedTabIds.length,
    selectedTabIds: args.selectedTabIds,
    selectedTabIdsInOrder: args.selectedTabIdsInOrder,
    setFilterQuery: args.setFilterQuery,
    toggleSelectAllTabs: args.toggleSelectAllTabs,
    toggleTabSelection: args.toggleTabSelection,
  };
}

function useTabSelectionBaseState(args: {
  activeTabCapabilities: ActiveTabCapabilities;
  isActive: boolean;
  pageAccessStatus: PageAccessStatus | null;
}) {
  const [availableTabs, setAvailableTabs] = useState<PopupExportTabItem[]>(() =>
    createFallbackTabItem(args.activeTabCapabilities)
  );
  const [filterQuery, setFilterQuery] = useState('');
  const [selectedTabIds, setSelectedTabIds] = useState<number[]>([]);
  const fingerprintRef = useRef<string | null>(null);
  const hasHydratedSelectionRef = useRef(false);
  const hasResolvedQueryRef = useRef(false);
  useAvailableTabQuery({
    activeTabCapabilities: args.activeTabCapabilities,
    fingerprintRef,
    hasHydratedSelectionRef,
    hasResolvedQueryRef,
    isActive: args.isActive,
    pageAccessStatus: args.pageAccessStatus,
    setAvailableTabs,
    setSelectedTabIds,
  });
  return {
    availableTabs,
    filterQuery,
    hasHydratedSelectionRef,
    hasResolvedQueryRef,
    selectedTabIds,
    setFilterQuery,
    setSelectedTabIds,
  };
}

function useTabSelectionDerivedState(args: {
  availableTabs: PopupExportTabItem[];
  filterQuery: string;
  hasHydratedSelectionRef: MutableRefObject<boolean>;
  hasResolvedQueryRef: MutableRefObject<boolean>;
  isActive: boolean;
  selectedTabIds: number[];
  setSelectedTabIds: Dispatch<SetStateAction<number[]>>;
}) {
  const filteredTabs = useMemo(
    () => filterTabs(args.availableTabs, args.filterQuery),
    [args.availableTabs, args.filterQuery]
  );
  const selectedTabIdsInOrder = useMemo(
    () => getSelectedTabIdsInOrder(args.availableTabs, args.selectedTabIds),
    [args.availableTabs, args.selectedTabIds]
  );
  const isFilterActive = args.filterQuery.trim().length > 0;
  const toggleSelectAllTabs = createSelectAllTabsHandler({
    availableTabs: args.availableTabs,
    filteredTabs,
    isFilterActive,
    setSelectedTabIds: args.setSelectedTabIds,
  });
  const toggleTabSelection = createToggleTabSelectionHandler({
    hasHydratedSelectionRef: args.hasHydratedSelectionRef,
    setSelectedTabIds: args.setSelectedTabIds,
  });
  usePersistedTabSelection({
    availableTabs: args.availableTabs,
    hasResolvedQueryRef: args.hasResolvedQueryRef,
    isActive: args.isActive,
    selectedTabIdsInOrder,
  });

  return {
    filteredTabs,
    isFilterActive,
    selectedTabIdsInOrder,
    toggleSelectAllTabs,
    toggleTabSelection,
  };
}

function useTabSelectionController(args: {
  activeTabCapabilities: ActiveTabCapabilities;
  isActive: boolean;
  pageAccessStatus: PageAccessStatus | null;
}) {
  const baseState = useTabSelectionBaseState(args);
  const derivedState = useTabSelectionDerivedState({
    availableTabs: baseState.availableTabs,
    filterQuery: baseState.filterQuery,
    hasHydratedSelectionRef: baseState.hasHydratedSelectionRef,
    hasResolvedQueryRef: baseState.hasResolvedQueryRef,
    isActive: args.isActive,
    selectedTabIds: baseState.selectedTabIds,
    setSelectedTabIds: baseState.setSelectedTabIds,
  });

  return {
    availableTabs: baseState.availableTabs,
    filterQuery: baseState.filterQuery,
    filteredTabs: derivedState.filteredTabs,
    isFilterActive: derivedState.isFilterActive,
    selectedTabIds: baseState.selectedTabIds,
    selectedTabIdsInOrder: derivedState.selectedTabIdsInOrder,
    setFilterQuery: baseState.setFilterQuery,
    toggleSelectAllTabs: derivedState.toggleSelectAllTabs,
    toggleTabSelection: derivedState.toggleTabSelection,
  };
}

export function usePopupExportTabSelection(args: {
  activeTabCapabilities: ActiveTabCapabilities;
  isActive: boolean;
  pageAccessStatus?: PageAccessStatus | null;
}): PopupExportTabSelectionState {
  const state = useTabSelectionController({
    ...args,
    pageAccessStatus: args.pageAccessStatus ?? null,
  });

  return createTabSelectionState({
    availableTabs: state.availableTabs,
    filterQuery: state.filterQuery,
    filteredTabs: state.filteredTabs,
    isFilterActive: state.isFilterActive,
    selectedTabIds: state.selectedTabIds,
    selectedTabIdsInOrder: state.selectedTabIdsInOrder,
    setFilterQuery: state.setFilterQuery,
    toggleSelectAllTabs: state.toggleSelectAllTabs,
    toggleTabSelection: state.toggleTabSelection,
  });
}
