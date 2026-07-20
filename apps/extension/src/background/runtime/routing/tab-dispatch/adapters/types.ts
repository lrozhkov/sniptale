import type { TabRouteArgs } from '../../boundary/shared';

type TabRoutingLogger = {
  error: (...value: unknown[]) => void;
  warn: (...value: unknown[]) => void;
};

export type UnresolvedTabRouteArgs = {
  deps: TabRouteArgs['deps'];
  logger: TabRoutingLogger;
  message: TabRouteArgs['message'];
  resolvedTabId: number | undefined;
  sendResponse: TabRouteArgs['sendResponse'];
  sender: chrome.runtime.MessageSender | undefined;
};

export type ResolvedTabRouteArgs = TabRouteArgs & {
  logger: Pick<TabRoutingLogger, 'error'>;
};
