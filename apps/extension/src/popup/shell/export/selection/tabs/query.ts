import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { useEffect } from 'react';

import { browserPermissions } from '@sniptale/platform/browser/permissions';
import type { PageAccessStatus } from '@sniptale/runtime-contracts/messaging/page-access';
import { browserTabs } from '@sniptale/platform/browser/tabs';
import type { ActiveTabCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/types';
import { isOwnedSnapshotViewerPage } from '../../../../../features/tab-capabilities/url';
import {
  loadPopupExportTabSelectionSession,
  savePopupExportTabSelectionSession,
} from '../../../../persistence/export-tab-session';
import { createFallbackTabItem, getTabsForCurrentWindow } from './items';
import { applyFallbackTabs, applyLoadedTabs, createTabsFingerprint } from './selection';
import type { PopupExportTabItem } from './types';

type LoadAvailableTabsArgs = {
  activeTabCapabilities: ActiveTabCapabilities;
  fingerprintRef: MutableRefObject<string | null>;
  hasHydratedSelectionRef: MutableRefObject<boolean>;
  pageAccessStatus: PageAccessStatus | null;
  markQueryResolved: () => void;
  isCancelled: () => boolean;
  setAvailableTabs: (tabs: PopupExportTabItem[]) => void;
  setSelectedTabIds: Dispatch<SetStateAction<number[]>>;
};

async function handleLoadedTabs(
  args: LoadAvailableTabsArgs,
  persistedSelectionPromise: ReturnType<typeof loadPopupExportTabSelectionSession>,
  tabs: Awaited<ReturnType<typeof browserTabs.query>>
): Promise<void> {
  if (args.isCancelled()) {
    return;
  }

  const [persistedSelection, grantedTabs] = await Promise.all([
    persistedSelectionPromise,
    filterGrantedTabs({
      activeTabCapabilities: args.activeTabCapabilities,
      pageAccessStatus: args.pageAccessStatus,
      tabs,
    }),
  ]);
  if (args.isCancelled()) {
    return;
  }

  applyLoadedTabs({
    fingerprintRef: args.fingerprintRef,
    hasHydratedSelectionRef: args.hasHydratedSelectionRef,
    nextTabs: getTabsForCurrentWindow(grantedTabs, args.activeTabCapabilities),
    persistedSelection,
    setAvailableTabs: args.setAvailableTabs,
    setSelectedTabIds: args.setSelectedTabIds,
  });
  args.markQueryResolved();
}

async function handleFallbackTabs(
  args: LoadAvailableTabsArgs,
  persistedSelectionPromise: ReturnType<typeof loadPopupExportTabSelectionSession>
): Promise<void> {
  if (args.isCancelled()) {
    return;
  }

  const persistedSelection = await persistedSelectionPromise;
  if (args.isCancelled()) {
    return;
  }

  applyFallbackTabs({
    activeTabCapabilities: args.activeTabCapabilities,
    fallbackTabs: getGrantedFallbackTabs({
      activeTabCapabilities: args.activeTabCapabilities,
      pageAccessStatus: args.pageAccessStatus,
    }),
    fingerprintRef: args.fingerprintRef,
    hasHydratedSelectionRef: args.hasHydratedSelectionRef,
    persistedSelection,
    setAvailableTabs: args.setAvailableTabs,
    setSelectedTabIds: args.setSelectedTabIds,
  });
  args.markQueryResolved();
}

function loadAvailableTabs(args: LoadAvailableTabsArgs) {
  const persistedSelectionPromise = loadPopupExportTabSelectionSession();

  void browserTabs
    .query({ currentWindow: true })
    .then((tabs) => handleLoadedTabs(args, persistedSelectionPromise, tabs))
    .catch(() => handleFallbackTabs(args, persistedSelectionPromise));
}

function createOriginPattern(url: string | undefined): string | null {
  if (!url) {
    return null;
  }

  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:'
      ? `${parsedUrl.origin}/*`
      : null;
  } catch {
    return null;
  }
}

async function canExportTab(args: {
  activeTabCapabilities: ActiveTabCapabilities;
  pageAccessStatus: PageAccessStatus | null;
  tab: chrome.tabs.Tab;
}): Promise<boolean> {
  if (isOwnedSnapshotViewerPage(args.tab.url)) {
    return true;
  }

  const tabId = args.tab.id;
  if (
    typeof tabId === 'number' &&
    args.pageAccessStatus?.currentTabActive === true &&
    tabId === args.activeTabCapabilities.tabId
  ) {
    return true;
  }

  const originPattern = createOriginPattern(args.tab.url);
  if (!originPattern) {
    return false;
  }

  return browserPermissions.contains({ origins: [originPattern] });
}

async function filterGrantedTabs(args: {
  activeTabCapabilities: ActiveTabCapabilities;
  pageAccessStatus: PageAccessStatus | null;
  tabs: chrome.tabs.Tab[];
}): Promise<chrome.tabs.Tab[]> {
  const decisions = await Promise.all(
    args.tabs.map(async (tab) => ({
      allowed: await canExportTab({ ...args, tab }).catch(() => false),
      tab,
    }))
  );

  return decisions.filter((decision) => decision.allowed).map((decision) => decision.tab);
}

function getGrantedFallbackTabs(args: {
  activeTabCapabilities: ActiveTabCapabilities;
  pageAccessStatus: PageAccessStatus | null;
}): PopupExportTabItem[] {
  if (isOwnedSnapshotViewerPage(args.activeTabCapabilities.url)) {
    return createFallbackTabItem(args.activeTabCapabilities);
  }

  return args.pageAccessStatus?.currentTabActive === true
    ? createFallbackTabItem(args.activeTabCapabilities)
    : [];
}

export function useAvailableTabQuery(args: {
  activeTabCapabilities: ActiveTabCapabilities;
  fingerprintRef: MutableRefObject<string | null>;
  hasHydratedSelectionRef: MutableRefObject<boolean>;
  hasResolvedQueryRef: MutableRefObject<boolean>;
  isActive: boolean;
  pageAccessStatus: PageAccessStatus | null;
  setAvailableTabs: (tabs: PopupExportTabItem[]) => void;
  setSelectedTabIds: Dispatch<SetStateAction<number[]>>;
}) {
  useEffect(() => {
    if (!args.isActive) {
      return;
    }

    let cancelled = false;
    loadAvailableTabs({
      activeTabCapabilities: args.activeTabCapabilities,
      fingerprintRef: args.fingerprintRef,
      hasHydratedSelectionRef: args.hasHydratedSelectionRef,
      markQueryResolved: () => {
        args.hasResolvedQueryRef.current = true;
      },
      isCancelled: () => cancelled,
      pageAccessStatus: args.pageAccessStatus,
      setAvailableTabs: args.setAvailableTabs,
      setSelectedTabIds: args.setSelectedTabIds,
    });

    return () => {
      cancelled = true;
    };
  }, [
    args.activeTabCapabilities,
    args.fingerprintRef,
    args.hasHydratedSelectionRef,
    args.hasResolvedQueryRef,
    args.isActive,
    args.pageAccessStatus,
    args.setAvailableTabs,
    args.setSelectedTabIds,
  ]);
}

export function usePersistedTabSelection(args: {
  availableTabs: PopupExportTabItem[];
  hasResolvedQueryRef: MutableRefObject<boolean>;
  isActive: boolean;
  selectedTabIdsInOrder: number[];
}) {
  useEffect(() => {
    if (!args.isActive || !args.hasResolvedQueryRef.current) {
      return;
    }

    void savePopupExportTabSelectionSession({
      selectedTabIds: args.selectedTabIdsInOrder,
      tabsFingerprint: createTabsFingerprint(args.availableTabs),
    });
  }, [args.availableTabs, args.hasResolvedQueryRef, args.isActive, args.selectedTabIdsInOrder]);
}
