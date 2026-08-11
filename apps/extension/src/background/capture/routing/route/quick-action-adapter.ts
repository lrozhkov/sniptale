import { browserTabs } from '@sniptale/platform/browser/tabs';
import { isOwnedSnapshotViewerPage } from '../../../../features/tab-capabilities/url';
import { createRouteErrorResponse } from '../../../routing-contracts/response';
import { handleTriggerQuickAction } from '../actions.quick-action';
import type { CaptureRouteAdapterContext } from './types';
import { loadQuickActionRuntimeContext } from '../../quick-actions/flow/load';

export function routeQuickActionMessage(args: CaptureRouteAdapterContext): boolean {
  if (args.routeArgs.message.type !== 'TRIGGER_QUICK_ACTION') {
    return false;
  }
  const message = args.routeArgs.message;
  void loadQuickActionRuntimeContext(message.actionId)
    .then(async (runtimeContext) => {
      await authorizePageAccess(args, runtimeContext.captureMode);
      handleTriggerQuickAction(message, args.context, runtimeContext);
    })
    .catch((error: unknown) => {
      args.context.sendResponse(createRouteErrorResponse(error));
    });
  return true;
}

async function authorizePageAccess(
  args: CaptureRouteAdapterContext,
  captureMode: string
): Promise<void> {
  if (captureMode === 'desktop') {
    return;
  }
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
