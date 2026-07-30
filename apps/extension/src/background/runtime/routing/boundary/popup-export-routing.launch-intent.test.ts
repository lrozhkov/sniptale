import { beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  issuePopupExportLaunchIntent,
  resetPopupExportLaunchIntentsForTests,
} from '../../../capture/annotation-export/popup-launch-intent';
import { createBackgroundRuntimeState } from '../../../application/runtime-state';
import { routePopupExportMessage } from './popup-export-routing';

beforeEach(() => {
  resetPopupExportLaunchIntentsForTests();
});

async function routeConsume(tabId: number) {
  const sendResponse = vi.fn();
  routePopupExportMessage({
    deps: createBackgroundRuntimeState(),
    message: {
      tabId,
      tabRouteCapabilityToken: 'capability-1',
      tabRouteRequestId: 'request-1',
      type: MessageType.CONSUME_POPUP_EXPORT_LAUNCH_INTENT,
    },
    resolvedTabId: tabId,
    sendResponse,
    sender: undefined,
  });
  await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
  return sendResponse.mock.calls[0]?.[0];
}

it('consumes matching popup export navigation once without page forwarding', async () => {
  issuePopupExportLaunchIntent(62);

  await expect(routeConsume(62)).resolves.toEqual({ page: 'export', success: true });
  await expect(routeConsume(62)).resolves.toEqual({ page: null, success: true });
});

it('does not consume another tab launch intent', async () => {
  issuePopupExportLaunchIntent(63);

  await expect(routeConsume(62)).resolves.toEqual({ page: null, success: true });
  await expect(routeConsume(63)).resolves.toEqual({ page: 'export', success: true });
});
