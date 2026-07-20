import { browserTabs } from '@sniptale/platform/browser/tabs';
import { handleQuickAction } from '../quick-actions/index';
import { createRouteErrorResponse } from '../../routing-contracts/response';
import type { CaptureRouteContext } from './types';

export function handleTriggerQuickAction(
  message: { actionId: string },
  context: CaptureRouteContext
): boolean {
  browserTabs
    .get(context.resolvedTabId)
    .then((tab) =>
      handleQuickAction({
        actionId: message.actionId,
        tabId: context.resolvedTabId,
        tab,
        viewportState: context.viewportState,
        screenshotModeState: context.screenshotModeState,
        captureGuardState: context.captureGuardState,
        pageAccessPort: context.pageAccessPort,
        webSnapshotViewerPorts: context.webSnapshotViewerPorts,
      })
    )
    .then((response) => {
      if (response.result === 'failed' || response.result === 'blocked') {
        context.sendResponse({
          success: false,
          error: response.result === 'failed' ? response.error : 'Quick action is blocked',
          result: response.result,
        });
        return;
      }

      context.sendResponse({ success: true, ...response });
    })
    .catch((error) => context.sendResponse(createRouteErrorResponse(error)));
  return true;
}
