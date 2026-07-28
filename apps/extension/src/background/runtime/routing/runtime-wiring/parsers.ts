import { isStringLiteralValue } from '@sniptale/runtime-contracts/validation/string-literals';

const INSTALL_REASONS = ['install', 'update', 'chrome_update', 'shared_module_update'] as const;

export function parseInstalledDetails(
  details: unknown
): Pick<chrome.runtime.InstalledDetails, 'reason'> | null {
  if (typeof details !== 'object' || details === null || !('reason' in details)) {
    return null;
  }

  return isStringLiteralValue(details.reason, INSTALL_REASONS) ? { reason: details.reason } : null;
}

export function parseTopLevelNavigation(
  details: unknown
): Pick<chrome.webNavigation.WebNavigationFramedCallbackDetails, 'frameId' | 'tabId'> | null {
  if (
    typeof details !== 'object' ||
    details === null ||
    !('frameId' in details) ||
    !('tabId' in details)
  ) {
    return null;
  }

  if (typeof details.frameId !== 'number' || typeof details.tabId !== 'number') {
    return null;
  }

  return details.frameId === 0 ? { frameId: details.frameId, tabId: details.tabId } : null;
}

type TopLevelDocumentNavigation = {
  documentId: string;
  frameId: 0;
  tabId: number;
};

export function parseTopLevelDocumentNavigation(
  details: unknown
): TopLevelDocumentNavigation | null {
  const navigation = parseTopLevelNavigation(details);
  if (
    !navigation ||
    typeof details !== 'object' ||
    details === null ||
    !('documentId' in details)
  ) {
    return null;
  }
  return typeof details.documentId === 'string' && details.documentId.length > 0
    ? { documentId: details.documentId, frameId: 0, tabId: navigation.tabId }
    : null;
}
