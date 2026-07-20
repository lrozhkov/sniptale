import { runtimeInfo } from '@sniptale/platform/browser/runtime';
import { browserTabs } from '@sniptale/platform/browser/tabs';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import { isOwnedSnapshotViewerPage } from '../../../../../features/tab-capabilities/url';
import type {
  PopupTabRouteCapabilityPayload,
  PopupTabRouteOperation,
} from '@sniptale/runtime-contracts/messaging/contracts/runtime-message/popup-export';
import {
  createCapabilityContext,
  isCapabilityContextAuthorized,
  resolveCapabilityOrigin,
  type CapabilityContext,
} from '@sniptale/platform/security/capability-context';
import { createRouteErrorResponse } from '../../../../routing-contracts/response';
import { hasActivePageAccess } from '../../../page-access/service';
import { hasPreauthorizedPopupTabRouteCapabilityRequestMessage } from './preauthorization';
import { createPrivilegedCapabilityStore } from '../../../../routing-contracts/capabilities/privileged-authority/state';

const POPUP_TAB_ROUTE_CAPABILITY_TTL_MS = 60_000;

type PopupTabRouteCapabilityRecord = {
  capabilityContext: CapabilityContext;
  operation: PopupTabRouteOperation;
  requestId: string;
  senderUrl: string;
  tabId: number;
};

type PopupTabRouteCapabilityRequest = {
  type: typeof MessageType.REQUEST_POPUP_TAB_ROUTE_CAPABILITY;
  operation: PopupTabRouteOperation;
  requestId: string;
  tabId: number;
};

const popupTabRouteCapabilities = createPrivilegedCapabilityStore<PopupTabRouteCapabilityRecord>({
  domain: 'background.privileged.popup-tab-route-capabilities',
  policyId: 'popup-tab-route-capabilities',
  storageClass: 'memory-only',
});
const popupTabRouteOperations = new Set<string>([
  MessageType.EXPORT_POPUP_PREVIEW,
  MessageType.EXPORT_POPUP_START,
  MessageType.EXPORT_POPUP_BUILD_PACKAGE,
  MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
  MessageType.EXPORT_POPUP_CANCEL,
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPopupTabRouteOperation(value: unknown): value is PopupTabRouteOperation {
  return typeof value === 'string' && popupTabRouteOperations.has(value);
}

function parsePopupTabRouteCapabilityRequest(
  message: unknown
): PopupTabRouteCapabilityRequest | null {
  if (!isRecord(message)) {
    return null;
  }

  if (
    message['type'] !== MessageType.REQUEST_POPUP_TAB_ROUTE_CAPABILITY ||
    typeof message['tabId'] !== 'number' ||
    typeof message['requestId'] !== 'string' ||
    !isPopupTabRouteOperation(message['operation'])
  ) {
    return null;
  }

  return {
    operation: message['operation'],
    requestId: message['requestId'],
    tabId: message['tabId'],
    type: MessageType.REQUEST_POPUP_TAB_ROUTE_CAPABILITY,
  };
}

export function isPopupTabRouteSenderUrl(senderUrl: string | undefined): senderUrl is string {
  const popupUrl = runtimeInfo.getURL('apps/extension/src/popup/index.html');
  return (
    senderUrl === popupUrl ||
    senderUrl?.startsWith(`${popupUrl}?`) === true ||
    senderUrl?.startsWith(`${popupUrl}#`) === true
  );
}

function createCapabilityToken(): string {
  return crypto.randomUUID();
}

function deleteExpiredCapabilities(now: number): void {
  for (const [token, record] of popupTabRouteCapabilities.entries()) {
    if (record.capabilityContext.expiresAtEpochMs <= now) {
      popupTabRouteCapabilities.delete(token);
    }
  }
}

function issuePopupTabRouteCapability(
  message: PopupTabRouteCapabilityRequest,
  senderUrl: string
): string {
  const now = Date.now();
  deleteExpiredCapabilities(now);

  const token = createCapabilityToken();
  const expiresAtEpochMs = now + POPUP_TAB_ROUTE_CAPABILITY_TTL_MS;
  popupTabRouteCapabilities.set(token, {
    capabilityContext: createCapabilityContext({
      expiresAtEpochMs,
      origin: resolveCapabilityOrigin(senderUrl),
      scopes: ['ipc:popup-export-tab-route'],
      tabId: message.tabId,
      token,
    }),
    operation: message.operation,
    requestId: message.requestId,
    senderUrl,
    tabId: message.tabId,
  });
  return token;
}

async function isPopupTabRouteTargetAuthorized(tabId: number): Promise<boolean> {
  const tab = await browserTabs.get(tabId);
  if (isOwnedSnapshotViewerPage(tab.url)) {
    return true;
  }

  return hasActivePageAccess(tabId);
}

export function routePopupTabRouteCapabilityRequest(
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: ResponseSender
): boolean {
  const capabilityRequest = parsePopupTabRouteCapabilityRequest(message);
  if (!capabilityRequest) {
    return false;
  }

  if (
    typeof message !== 'object' ||
    message === null ||
    !sender.url ||
    !hasPreauthorizedPopupTabRouteCapabilityRequestMessage(message)
  ) {
    sendResponse(createRouteErrorResponse('Unauthorized tab route capability sender'));
    return true;
  }

  void isPopupTabRouteTargetAuthorized(capabilityRequest.tabId)
    .then((authorized) => {
      if (!authorized) {
        sendResponse(createRouteErrorResponse('Page access is required for export.'));
        return;
      }

      const capabilityToken = issuePopupTabRouteCapability(capabilityRequest, sender.url!);
      sendResponse({ success: true, capabilityToken });
    })
    .catch((error: unknown) => {
      sendResponse(createRouteErrorResponse(error));
    });
  return true;
}

export function assertPopupTabRouteCapability(args: {
  message: PopupTabRouteCapabilityPayload & { type: PopupTabRouteOperation; tabId: number };
  senderUrl: string | undefined;
}): void {
  const record = popupTabRouteCapabilities.get(args.message.tabRouteCapabilityToken);
  popupTabRouteCapabilities.delete(args.message.tabRouteCapabilityToken);

  if (
    !record ||
    !isCapabilityContextAuthorized(record.capabilityContext, {
      origin: resolveCapabilityOrigin(args.senderUrl),
      scope: 'ipc:popup-export-tab-route',
      tabId: args.message.tabId,
      token: args.message.tabRouteCapabilityToken,
    })
  ) {
    throw new Error('Invalid tab route capability');
  }

  if (
    record.senderUrl !== args.senderUrl ||
    record.tabId !== args.message.tabId ||
    record.operation !== args.message.type ||
    record.requestId !== args.message.tabRouteRequestId
  ) {
    throw new Error('Invalid tab route capability');
  }
}

export function resetPopupTabRouteCapabilitiesForTests(): void {
  popupTabRouteCapabilities.clear();
}
