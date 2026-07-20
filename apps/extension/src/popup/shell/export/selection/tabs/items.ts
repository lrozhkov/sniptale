import { translate } from '../../../../../platform/i18n';
import { getTabCapabilities } from '../../../../../features/tab-capabilities/capabilities';
import { type ActiveTabCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/types';
import type { PopupExportFallbackTab, PopupExportTabItem } from './types';

function buildTabLabel(args: { title: string | null; url: string | null }) {
  return args.title?.trim() || args.url || translate('popup.common.noActiveTab');
}

function toPopupExportTabItem(
  tab: chrome.tabs.Tab,
  activeTabId: number | null
): PopupExportTabItem | null {
  const capabilities = getTabCapabilities(tab);
  if (capabilities.isRestrictedPage) {
    return null;
  }

  const tabId = tab.id ?? null;
  return {
    disabledReason: capabilities.export.reason,
    favIconUrl: tab.favIconUrl ?? null,
    isCurrent: tabId !== null && tabId === activeTabId,
    tabId,
    title: buildTabLabel({ title: tab.title ?? null, url: tab.url ?? null }),
    url: tab.url ?? null,
  };
}

export function createFallbackTabItem(tab: PopupExportFallbackTab): PopupExportTabItem[] {
  return [
    {
      disabledReason: tab.export.reason,
      favIconUrl: null,
      isCurrent: true,
      tabId: tab.tabId,
      title: buildTabLabel({ title: tab.title, url: tab.url }),
      url: tab.url,
    },
  ];
}

export function filterTabs(tabs: PopupExportTabItem[], filterQuery: string): PopupExportTabItem[] {
  const normalizedQuery = filterQuery.trim().toLowerCase();
  if (normalizedQuery.length === 0) {
    return tabs;
  }

  return tabs.filter((tab) =>
    [tab.title, tab.url ?? ''].some((value) => value.toLowerCase().includes(normalizedQuery))
  );
}

export function getSelectableTabIds(tabs: PopupExportTabItem[]): number[] {
  return tabs
    .filter((tab) => tab.disabledReason === null && typeof tab.tabId === 'number')
    .map((tab) => tab.tabId as number);
}

export function getSelectedTabIdsInOrder(
  availableTabs: PopupExportTabItem[],
  selectedTabIds: number[]
) {
  return availableTabs
    .filter((tab) => typeof tab.tabId === 'number' && selectedTabIds.includes(tab.tabId))
    .map((tab) => tab.tabId as number);
}

export function getTabsForCurrentWindow(
  tabs: chrome.tabs.Tab[],
  activeTabCapabilities: ActiveTabCapabilities
) {
  return tabs.length > 0
    ? tabs
        .map((tab) => toPopupExportTabItem(tab, activeTabCapabilities.tabId))
        .filter((tab): tab is PopupExportTabItem => tab !== null)
    : createFallbackTabItem(activeTabCapabilities);
}
