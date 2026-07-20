import { translate } from '../../../platform/i18n';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { browserDebugger } from '@sniptale/platform/browser/debugger';
import { browserTabs } from '@sniptale/platform/browser/tabs';
import { createLogger } from '@sniptale/platform/observability/logger';
import { sendTabMessage } from '../../../platform/runtime-messaging';
import { DEBUGGER_TIMEOUT_MS } from '../constants';
import { withTimeout } from '../infra';

const logger = createLogger({ namespace: 'BackgroundDebuggerAttachTargets' });

export type DebuggerTarget = {
  id?: string;
  tabId?: number;
  attached?: boolean;
  type?: string;
  url?: string;
};

export async function sendDevtoolsConflictToast(tabId: number): Promise<void> {
  await sendTabMessage(tabId, {
    type: MessageType.SHOW_TOAST,
    payload: {
      type: 'error',
      title: translate('background.runtime.devtoolsConflictTitle'),
      message: translate('background.runtime.devtoolsConflictMessage'),
    },
  });
}

export async function resolveTabInfo(tabId: number): Promise<chrome.tabs.Tab> {
  try {
    const tab = await browserTabs.get(tabId);
    logger.debug('Resolved tab info', { tabId, hasUrl: Boolean(tab.url) });
    return tab;
  } catch (error) {
    logger.error('Failed to get tab info', error);
    throw new Error('Failed to get tab info');
  }
}

export async function waitForTabReady(tabId: number, tab: chrome.tabs.Tab): Promise<void> {
  if (tab.status !== 'loading') {
    return;
  }

  logger.debug('Waiting for tab to finish loading', { tabId });
  await new Promise<void>((resolve) => {
    let cleanupUpdated = () => {};

    const listener = (updatedTabId: number, changeInfo: { status?: string }) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        cleanupUpdated();
        logger.debug('Tab finished loading', { tabId });
        resolve();
      }
    };

    cleanupUpdated = browserTabs.subscribeToUpdated(listener);
    setTimeout(() => {
      cleanupUpdated();
      resolve();
    }, 5000);
  });
}

export function ensureHttpUrl(tab: chrome.tabs.Tab): void {
  if (tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
    return;
  }

  const error = `Debugger can only be attached to HTTP/HTTPS pages. Current URL: ${tab.url}`;
  logger.error(error);
  throw new Error(error);
}

export async function fetchDebuggerTargets(tabId: number): Promise<{
  targets: DebuggerTarget[];
  tabTargets: DebuggerTarget[];
}> {
  const targets = await withTimeout(
    browserDebugger.getTargets(),
    DEBUGGER_TIMEOUT_MS,
    'debugger.getTargets'
  );
  const tabTargets = targets.filter((target) => target.tabId === tabId);
  return { targets, tabTargets };
}

export async function rejectExtensionConflict(
  firstClient: boolean,
  tabTargets: DebuggerTarget[]
): Promise<void> {
  if (!firstClient) {
    return;
  }

  const attachedTargets = tabTargets.filter((target) => target.attached);
  if (attachedTargets.length === 0) {
    return;
  }

  const extensionTarget = attachedTargets.find((target) =>
    target.url?.startsWith('chrome-extension://')
  );
  if (!extensionTarget) {
    return;
  }

  const error = new Error(translate('background.runtime.debuggerExtensionConflict'));
  logger.error(error.message);
  throw error;
}

export function selectPageTarget(
  tabId: number,
  targets: DebuggerTarget[],
  tabTargets: DebuggerTarget[]
): DebuggerTarget {
  const pageTarget = targets.find(
    (target) =>
      target.tabId === tabId &&
      target.type === 'page' &&
      (target.url?.startsWith('http://') || target.url?.startsWith('https://'))
  );
  if (pageTarget) {
    return pageTarget;
  }

  const targetList = tabTargets.map((target) => target.url).join(', ');
  const error = `No HTTP/HTTPS page target found for tabId ${tabId}. Targets: ${targetList}`;
  logger.error(error);
  throw new Error(error);
}
