import { browserTabs } from '@sniptale/platform/browser/tabs';
import { isOwnedSnapshotViewerPage } from '../../../../features/tab-capabilities/url';
import { createRouteErrorResponse } from '../../../routing-contracts/response';
import { handleTriggerQuickAction } from '../actions.quick-action';
import type { CaptureRouteAdapterContext } from './types';
import {
  loadQuickActionRuntimeContext,
  loadScreenshotCaptureRuntimeContext,
} from '../../quick-actions/flow/load';

export function routeQuickActionMessage(args: CaptureRouteAdapterContext): boolean {
  if (
    args.routeArgs.message.type !== 'TRIGGER_QUICK_ACTION' &&
    args.routeArgs.message.type !== 'TRIGGER_SCREENSHOT_CAPTURE'
  ) {
    return false;
  }
  const message = args.routeArgs.message;
  const runtimeContextPromise =
    message.type === 'TRIGGER_QUICK_ACTION'
      ? loadQuickActionRuntimeContext(message.actionId)
      : loadScreenshotCaptureRuntimeContext(message.config);
  void runtimeContextPromise
    .then(async (runtimeContext) => {
      await authorizePageAccess(args, runtimeContext.captureMode);
      handleTriggerQuickAction(
        message.type === 'TRIGGER_QUICK_ACTION' ? message : { actionId: 'popup-screenshot-setup' },
        args.context,
        runtimeContext
      );
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
