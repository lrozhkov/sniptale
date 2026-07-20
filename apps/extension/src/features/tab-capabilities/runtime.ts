import { isOwnedSnapshotViewerPage, isRestrictedBrowserPage } from './url';
import { TabRuntimeCapability } from '@sniptale/runtime-contracts/tab-capabilities/types';

export function classifyTabRuntimeCapability(tab?: chrome.tabs.Tab | null): TabRuntimeCapability {
  if (!tab?.id) {
    return TabRuntimeCapability.Restricted;
  }

  if (isOwnedSnapshotViewerPage(tab.url)) {
    return TabRuntimeCapability.OwnedSnapshotViewer;
  }

  return isRestrictedBrowserPage(tab.url)
    ? TabRuntimeCapability.Restricted
    : TabRuntimeCapability.Regular;
}
