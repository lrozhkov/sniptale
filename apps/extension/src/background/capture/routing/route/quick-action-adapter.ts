import { browserTabs } from '@sniptale/platform/browser/tabs';
import { isOwnedSnapshotViewerPage } from '../../../../features/tab-capabilities/url';
import { createRouteErrorResponse } from '../../../routing-contracts/response';
import { handleTriggerQuickAction } from '../actions.quick-action';
import type { CaptureRouteCommandContext } from './types';
import {
  loadQuickActionRuntimeContext,
  loadScreenshotCaptureRuntimeContext,
} from '../../quick-actions/flow/load';
import { reserveDesktopQuickAction } from '../../quick-actions/desktop/workflow';

export function routeQuickActionMessage(args: CaptureRouteCommandContext): boolean {
  if (
    args.routeArgs.message.type !== 'TRIGGER_QUICK_ACTION' &&
    args.routeArgs.message.type !== 'PREPARE_DESKTOP_SCREENSHOT_CAPTURE' &&
    args.routeArgs.message.type !== 'TRIGGER_SCREENSHOT_CAPTURE'
  ) {
    return false;
  }
  const message = args.routeArgs.message;
  if (message.type === 'PREPARE_DESKTOP_SCREENSHOT_CAPTURE') {
    void loadDesktopScreenshotPreparationContext(message)
      .then(async (runtimeContext) => {
        const preparation = await reserveDesktopQuickAction({
          context: runtimeContext,
          tabId: args.context.resolvedTabId,
        });
        args.context.sendResponse({
          success: true,
          result: 'ready',
          imageFormat: runtimeContext.imageFormat,
          imageQuality: runtimeContext.imageQuality,
          ...preparation,
        });
      })
      .catch((error: unknown) => args.context.sendResponse(createRouteErrorResponse(error)));
    return true;
  }
  const runtimeContextPromise =
    message.type === 'TRIGGER_QUICK_ACTION'
      ? loadQuickActionRuntimeContext(message.actionId)
      : loadScreenshotCaptureRuntimeContext(message.config);
  void runtimeContextPromise
    .then(async (runtimeContext) => {
      await authorizePageAccess(args, runtimeContext.captureMode);
      handleTriggerQuickAction(
        message.type === 'TRIGGER_QUICK_ACTION'
          ? message
          : {
              actionId: 'popup-screenshot-setup',
              ...(message.desktopSelection === undefined
                ? {}
                : { desktopSelection: message.desktopSelection }),
            },
        args.context,
        runtimeContext
      );
    })
    .catch((error: unknown) => {
      args.context.sendResponse(createRouteErrorResponse(error));
    });
  return true;
}

async function loadDesktopScreenshotPreparationContext(
  message: Extract<
    CaptureRouteCommandContext['routeArgs']['message'],
    { type: 'PREPARE_DESKTOP_SCREENSHOT_CAPTURE' }
  >
) {
  const runtimeContext =
    message.actionId !== undefined
      ? await loadQuickActionRuntimeContext(message.actionId)
      : message.config !== undefined
        ? await loadScreenshotCaptureRuntimeContext(message.config)
        : null;
  if (!runtimeContext || runtimeContext.captureMode !== 'desktop') {
    throw new Error('Desktop screenshot preparation requires a desktop capture configuration');
  }
  return runtimeContext;
}

async function authorizePageAccess(
  args: CaptureRouteCommandContext,
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
  await pageAccessPort.waitForContentToolbarReady?.(tabId);
}
