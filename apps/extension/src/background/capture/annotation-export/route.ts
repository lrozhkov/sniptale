import { browserAction } from '@sniptale/platform/browser/action';
import { browserPermissions } from '@sniptale/platform/browser/permissions';
import { browserTabs } from '@sniptale/platform/browser/tabs';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { loadPopupPagePackagePreferences } from '../../../composition/persistence/popup-export-preferences';
import { executeDownloadBlob } from '../download/download-router';
import { createRouteErrorResponse } from '../../routing-contracts/response';
import type { RouteCaptureMessage, SendResponse } from '../routing/types';
import { issuePopupExportLaunchIntent, revokePopupExportLaunchIntent } from './popup-launch-intent';

const BROWSER_ANNOTATIONS_FILENAME = 'browser-annotations.md';
const BROWSER_ANNOTATIONS_MIME_TYPE = 'text/markdown;charset=utf-8';

async function downloadBrowserAnnotations(text: string): Promise<number> {
  const downloadId = await executeDownloadBlob(
    new Blob([text], { type: BROWSER_ANNOTATIONS_MIME_TYPE }),
    BROWSER_ANNOTATIONS_FILENAME
  );
  if (typeof downloadId !== 'number') {
    throw new Error('Browser annotations download did not return an id.');
  }
  return downloadId;
}

async function canStartExportFromThisGesture(): Promise<boolean> {
  try {
    const preferences = await loadPopupPagePackagePreferences();
    const needsAllSitesAccess =
      preferences.export.includeFullPageScreenshot ||
      preferences.export.includeViewportScreenshot === true ||
      preferences.export.includeWebCopy;
    if (!needsAllSitesAccess) return true;
    if (await browserPermissions.contains({ origins: ['<all_urls>'] })) return true;
    return browserPermissions.request({ origins: ['<all_urls>'] });
  } catch {
    return false;
  }
}

async function openPopupExport(
  tabId: number,
  startExport: boolean,
  sourceDocumentId: string | null
): Promise<void> {
  const tab = await browserTabs.get(tabId);
  if (tab.active !== true || typeof tab.windowId !== 'number') {
    throw new Error('The originating tab is no longer active.');
  }

  const launchIntent = issuePopupExportLaunchIntent(
    tabId,
    Date.now(),
    startExport,
    sourceDocumentId
  );
  try {
    await browserAction.openPopup({ windowId: tab.windowId });
  } catch (error) {
    revokePopupExportLaunchIntent(launchIntent);
    throw error;
  }
}

export function routeToolbarAnnotationExportMessage(args: {
  message: RouteCaptureMessage;
  resolvedTabId: number;
  sender?: Pick<chrome.runtime.MessageSender, 'documentId' | 'frameId'> | undefined;
  sendResponse: SendResponse;
}): boolean {
  if (
    args.message.type !== MessageType.DOWNLOAD_BROWSER_ANNOTATIONS &&
    args.message.type !== MessageType.OPEN_EXPORT_MODAL
  ) {
    return false;
  }

  const message = args.message;
  const work =
    message.type === MessageType.DOWNLOAD_BROWSER_ANNOTATIONS
      ? downloadBrowserAnnotations(message.text).then((downloadId) => ({
          downloadId,
          success: true as const,
        }))
      : (async () => {
          if (message.type !== MessageType.OPEN_EXPORT_MODAL) return { success: true as const };
          const sourceDocumentId =
            args.sender?.frameId === 0 && typeof args.sender.documentId === 'string'
              ? args.sender.documentId
              : null;
          const startExport =
            message.startExport === true &&
            sourceDocumentId !== null &&
            (await canStartExportFromThisGesture());
          await openPopupExport(args.resolvedTabId, startExport, sourceDocumentId);
          return { success: true as const };
        })();

  void work.then(args.sendResponse).catch((error) => {
    args.sendResponse(createRouteErrorResponse(error));
  });
  return true;
}
