import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { PopupExportTabItem } from '../selection/tabs/types';

function getSelectableVisibleCount(tabs: PopupExportTabItem[]): number {
  return tabs.filter((tab) => tab.disabledReason === null && tab.tabId !== null).length;
}

function getSelectableSelectedCount(tabs: PopupExportTabItem[], selectedTabIds: number[]): number {
  return tabs.filter((tab) => {
    return tab.disabledReason === null && tab.tabId !== null && selectedTabIds.includes(tab.tabId);
  }).length;
}

export function getSelectedTabs(
  availableTabs: PopupExportTabItem[],
  selectedTabIds: number[]
): PopupExportTabItem[] {
  return availableTabs.filter(
    (tab) => typeof tab.tabId === 'number' && selectedTabIds.includes(tab.tabId)
  );
}

export function getShouldShowClearAll(args: {
  filteredTabs: PopupExportTabItem[];
  isFilterActive: boolean;
  selectedTabIds: number[];
}): boolean {
  const selectableVisibleCount = getSelectableVisibleCount(args.filteredTabs);
  const selectableSelectedCount = getSelectableSelectedCount(
    args.filteredTabs,
    args.selectedTabIds
  );
  return (
    !args.isFilterActive &&
    selectableVisibleCount > 0 &&
    selectableVisibleCount === selectableSelectedCount
  );
}

export function useScrollCurrentRowIntoView(
  isOpen: boolean,
  filteredTabs: PopupExportTabItem[]
): MutableRefObject<HTMLLabelElement | null> {
  const currentRowRef = useRef<HTMLLabelElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    currentRowRef.current?.scrollIntoView({
      block: 'nearest',
    });
  }, [filteredTabs, isOpen]);
  return currentRowRef;
}
