import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import type { PopupExportTabSelectionSession } from '../../../../persistence/export-tab-session';
import type { ActiveTabCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/types';
import { createFallbackTabItem } from './items';
import type { PopupExportTabItem } from './types';

function getDefaultSelectedTabIds(nextTabs: PopupExportTabItem[]) {
  const currentTab = nextTabs.find(
    (tab) => tab.isCurrent && tab.disabledReason === null && typeof tab.tabId === 'number'
  );

  return currentTab?.tabId != null ? [currentTab.tabId] : [];
}

export function createTabsFingerprint(nextTabs: PopupExportTabItem[]): string {
  return nextTabs.map((tab) => `${tab.tabId ?? 'fallback'}:${tab.isCurrent ? 1 : 0}`).join('|');
}

function getInitialSelectedTabIds(args: {
  currentSelected: number[];
  fingerprintRef: MutableRefObject<string | null>;
  hasHydratedSelectionRef: { current: boolean };
  nextTabs: PopupExportTabItem[];
  persistedSelection: PopupExportTabSelectionSession | null;
}) {
  const remainingSelected = args.currentSelected.filter((tabId) =>
    args.nextTabs.some((tab) => tab.tabId === tabId && tab.disabledReason === null)
  );
  const nextFingerprint = createTabsFingerprint(args.nextTabs);

  if (args.fingerprintRef.current === nextFingerprint) {
    return remainingSelected;
  }

  if (args.persistedSelection?.tabsFingerprint === nextFingerprint) {
    args.fingerprintRef.current = nextFingerprint;
    args.hasHydratedSelectionRef.current = true;
    return args.persistedSelection.selectedTabIds.filter((tabId) =>
      args.nextTabs.some((tab) => tab.tabId === tabId && tab.disabledReason === null)
    );
  }

  args.fingerprintRef.current = nextFingerprint;
  args.hasHydratedSelectionRef.current = true;
  return getDefaultSelectedTabIds(args.nextTabs);
}

function getFallbackSelectedTabIds(args: {
  currentSelected: number[];
  fallbackTabs: PopupExportTabItem[];
  fingerprintRef: MutableRefObject<string | null>;
  hasHydratedSelectionRef: { current: boolean };
  persistedSelection: PopupExportTabSelectionSession | null;
}) {
  const fallbackTabId =
    args.fallbackTabs[0]?.disabledReason === null ? args.fallbackTabs[0]?.tabId : null;
  return getInitialSelectedTabIds({
    currentSelected:
      fallbackTabId == null ? [] : args.currentSelected.filter((tabId) => tabId === fallbackTabId),
    fingerprintRef: args.fingerprintRef,
    hasHydratedSelectionRef: args.hasHydratedSelectionRef,
    nextTabs: args.fallbackTabs,
    persistedSelection: args.persistedSelection,
  });
}

export function applyLoadedTabs(args: {
  fingerprintRef: MutableRefObject<string | null>;
  hasHydratedSelectionRef: MutableRefObject<boolean>;
  nextTabs: PopupExportTabItem[];
  persistedSelection: PopupExportTabSelectionSession | null;
  setAvailableTabs: (tabs: PopupExportTabItem[]) => void;
  setSelectedTabIds: Dispatch<SetStateAction<number[]>>;
}) {
  args.setAvailableTabs(args.nextTabs);
  args.setSelectedTabIds((currentSelected) =>
    getInitialSelectedTabIds({
      currentSelected,
      fingerprintRef: args.fingerprintRef,
      hasHydratedSelectionRef: args.hasHydratedSelectionRef,
      nextTabs: args.nextTabs,
      persistedSelection: args.persistedSelection,
    })
  );
}

export function applyFallbackTabs(args: {
  activeTabCapabilities: ActiveTabCapabilities;
  fallbackTabs?: PopupExportTabItem[];
  fingerprintRef: MutableRefObject<string | null>;
  hasHydratedSelectionRef: MutableRefObject<boolean>;
  persistedSelection: PopupExportTabSelectionSession | null;
  setAvailableTabs: (tabs: PopupExportTabItem[]) => void;
  setSelectedTabIds: Dispatch<SetStateAction<number[]>>;
}) {
  const fallbackTabs = args.fallbackTabs ?? createFallbackTabItem(args.activeTabCapabilities);
  args.setAvailableTabs(fallbackTabs);
  args.setSelectedTabIds((currentSelected) =>
    getFallbackSelectedTabIds({
      currentSelected,
      fallbackTabs,
      fingerprintRef: args.fingerprintRef,
      hasHydratedSelectionRef: args.hasHydratedSelectionRef,
      persistedSelection: args.persistedSelection,
    })
  );
}
