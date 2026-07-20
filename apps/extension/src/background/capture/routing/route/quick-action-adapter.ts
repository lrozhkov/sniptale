import { browserTabs } from '@sniptale/platform/browser/tabs';
import { isOwnedSnapshotViewerPage } from '../../../../features/tab-capabilities/url';
import { createRouteErrorResponse } from '../../../routing-contracts/response';
import { handleTriggerQuickAction } from '../actions';
import type { CaptureRouteAdapterContext } from './types';

export function routeQuickActionMessage(args: CaptureRouteAdapterContext): boolean {
  if (args.routeArgs.message.type !== 'TRIGGER_QUICK_ACTION') {
    return false;
  }
  const message = args.routeArgs.message;
  void authorizePageAccess(args)
    .then(() => {
      handleTriggerQuickAction(message, args.context);
    })
    .catch((error: unknown) => {
      args.context.sendResponse(createRouteErrorResponse(error));
    });
  return true;
}

async function authorizePageAccess(args: CaptureRouteAdapterContext): Promise<void> {
  const tabId = args.context.resolvedTabId;
  const tab = await browserTabs.get(tabId);
  if (isOwnedSnapshotViewerPage(tab.url)) {
    return;
  }

  const { pageAccessPort } = args.routeArgs;
  if (!pageAccessPort) {
    throw new Error('Page access port unavailable.');
  }

  await pageAccessPort.ensureActivePageAccessRuntime(tabId);
}
