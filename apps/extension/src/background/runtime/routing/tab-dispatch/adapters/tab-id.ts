import { browserTabs } from '@sniptale/platform/browser/tabs';
import { isOwnedSnapshotViewerPage } from '../../../../../features/tab-capabilities/url';
import { isPageStyleRuntimeMessage } from '../../../../capture/routes';
import { createRouteErrorResponse } from '../../../../routing-contracts/response';
import { isPopupExportViewerMessage, isTabModeMessage } from '../../message-guards/guards/tab';
import { authorizeIPCMessage } from '../../authorization/index';
import { isPopupTabRouteSenderUrl } from '../../capabilities/popup-tab/route-capabilities';
import type { TabRouteArgs } from '../../boundary/shared';
import type { UnresolvedTabRouteArgs } from './types';

function readTabId(value: unknown): number | undefined {
  if (typeof value !== 'object' || value === null || !('tabId' in value)) {
    return undefined;
  }

  const { tabId } = value;
  return typeof tabId === 'number' ? tabId : undefined;
}

export function normalizeResolvedTabMessage(
  message: TabRouteArgs['message'],
  resolvedTabId: number
): TabRouteArgs['message'] {
  if (readTabId(message) === undefined) {
    return message;
  }

  return { ...message, tabId: resolvedTabId } as TabRouteArgs['message'];
}

export async function resolveTabIdPromise(
  message: unknown,
  sender: chrome.runtime.MessageSender
): Promise<number | undefined> {
  const tabId = readTabId(message);
  const isPopupSender = isPopupTabRouteSenderUrl(sender.url);

  if (
    tabId !== undefined &&
    isPopupSender &&
    assertPopupExportTabRouteCapability({ message, sender })
  ) {
    return tabId;
  }

  if (typeof sender.tab?.id === 'number') {
    return sender.tab.id;
  }

  if (isPopupSender && isPopupCurrentTabMessage(message)) {
    return resolveActivePopupTabId();
  }

  if (tabId !== undefined && isPopupSender) {
    return tabId;
  }

  if (
    tabId !== undefined &&
    !isPopupSender &&
    assertPopupExportTabRouteCapability({ message, sender })
  ) {
    return undefined;
  }

  if (isOwnedSnapshotViewerPage(sender.url)) {
    const [senderTab] = await browserTabs.query({ url: sender.url });
    return senderTab?.id;
  }

  return undefined;
}

async function resolveActivePopupTabId(): Promise<number | undefined> {
  const [activeTab] = await browserTabs.query({ active: true, currentWindow: true });
  return activeTab?.id;
}

function isPopupCurrentTabMessage(message: unknown): boolean {
  if (
    typeof message !== 'object' ||
    message === null ||
    typeof readMessageType(message) !== 'string'
  ) {
    return false;
  }

  const runtimeMessage = message as { type: string };
  return isTabModeMessage(runtimeMessage) || isPageStyleRuntimeMessage(runtimeMessage);
}

function readMessageType(message: object): unknown {
  return 'type' in message ? message.type : undefined;
}

function assertPopupExportTabRouteCapability(args: {
  message: unknown;
  sender: chrome.runtime.MessageSender;
}): boolean {
  if (
    typeof args.message !== 'object' ||
    args.message === null ||
    !isPopupExportViewerMessage(args.message as { type: string })
  ) {
    return false;
  }

  const authorization = authorizeIPCMessage({
    kind: 'popup-export-tab-route',
    message: args.message,
    senderUrl: args.sender.url,
  });
  if (!authorization.authorized) {
    throw new Error(authorization.reason);
  }
  return true;
}

export function rejectMissingResolvedTabId(args: UnresolvedResolvedTabArgs): boolean {
  if (typeof args.resolvedTabId === 'number') {
    return false;
  }

  args.logger.error('Unable to resolve tab ID for runtime message', { type: args.message.type });
  args.sendResponse(createRouteErrorResponse('No tab ID'));
  return true;
}

type UnresolvedResolvedTabArgs = Pick<
  UnresolvedTabRouteArgs,
  'logger' | 'message' | 'resolvedTabId' | 'sendResponse'
>;
