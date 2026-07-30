import { browserAction } from '@sniptale/platform/browser/action';
import { browserTabs } from '@sniptale/platform/browser/tabs';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
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

async function openPopupExport(tabId: number): Promise<void> {
  const tab = await browserTabs.get(tabId);
  if (tab.active !== true || typeof tab.windowId !== 'number') {
    throw new Error('The originating tab is no longer active.');
  }

  const launchIntent = issuePopupExportLaunchIntent(tabId);
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
  sendResponse: SendResponse;
}): boolean {
  if (
    args.message.type !== MessageType.DOWNLOAD_BROWSER_ANNOTATIONS &&
    args.message.type !== MessageType.OPEN_EXPORT_MODAL
  ) {
    return false;
  }

  const work =
    args.message.type === MessageType.DOWNLOAD_BROWSER_ANNOTATIONS
      ? downloadBrowserAnnotations(args.message.text).then((downloadId) => ({
          downloadId,
          success: true as const,
        }))
      : openPopupExport(args.resolvedTabId).then(() => ({ success: true as const }));

  void work.then(args.sendResponse).catch((error) => {
    args.sendResponse(createRouteErrorResponse(error));
  });
  return true;
}
