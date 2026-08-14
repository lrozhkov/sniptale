import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { TabResponseByType } from '../../../../contracts/messaging/tab';
import { sendRuntimeMessage } from '../../../../platform/runtime-messaging';
import { browserPermissions } from '@sniptale/platform/browser/permissions';
import { getActiveTabId } from '../../tab-access';
import { requestPopupExportPreview } from './preview-request';
import { sendPopupExportTabMessage } from './tab-message-routing';
import type { PopupExportRuntimeDeps } from './types';
type PopupExportSaveWebSnapshotResponse =
  TabResponseByType[typeof MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT];

export function getDefaultPopupExportRuntimeDeps(): PopupExportRuntimeDeps {
  return {
    clearTimeout: (timeoutId) => window.clearTimeout(timeoutId),
    createRequestId: () => crypto.randomUUID(),
    getActiveTabId: getActiveTabId as PopupExportRuntimeDeps['getActiveTabId'],
    requestPreview: async (tabId, fallbackKey) => requestPopupExportPreview(tabId, fallbackKey),
    scheduleTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
    sendSaveWebSnapshotMessage: (tabId, message) =>
      sendPopupExportTabMessage(tabId, message) as Promise<PopupExportSaveWebSnapshotResponse>,
    requestAllUrlsPermission: () => browserPermissions.request({ origins: ['<all_urls>'] }),
    sendStartJobMessage: (message) => sendRuntimeMessage(message),
    sendGetJobStatusMessage: (message) => sendRuntimeMessage(message),
    sendCancelJobMessage: (message) => sendRuntimeMessage(message),
    sendAckJobStatusMessage: (message) => sendRuntimeMessage(message),
    writeClipboardText: (text: string) => globalThis.navigator.clipboard.writeText(text),
  };
}
