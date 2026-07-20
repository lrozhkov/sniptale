import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { TabModeMessage } from '@sniptale/runtime-contracts/messaging/message-types';
import { createWebSnapshotViewerPorts } from '../../capture/lifecycle';
import {
  buildScreenshotModeStatusResponse,
  disableScreenshotMode,
  enableScreenshotMode,
  handleSetViewport,
} from '../tab-mode-router-screenshot';
import { respondAsyncSuccess } from '../../routing-contracts/response';
import type { TabModeContext } from './shared';
import { isScreenshotModeMessage } from './shared';

function handleScreenshotModeStatus(context: TabModeContext): boolean {
  return buildScreenshotModeStatusResponse(
    context.resolvedTabId,
    context.screenshotModeState,
    context.viewportState,
    context.sendResponse,
    context.senderDocumentId ?? null
  );
}

export function routeScreenshotModeMessage(
  message: TabModeMessage,
  context: TabModeContext
): boolean {
  if (!isScreenshotModeMessage(message)) {
    return false;
  }

  switch (message.type) {
    case MessageType.ENABLE_SCREENSHOT_MODE:
      respondAsyncSuccess(
        enableScreenshotMode(
          context.resolvedTabId,
          context.screenshotModeState,
          context.viewportState,
          context.viewportOwnerState,
          context.webSnapshotViewerPorts ?? createWebSnapshotViewerPorts()
        ),
        context.sendResponse
      );
      return true;

    case MessageType.DISABLE_SCREENSHOT_MODE:
      respondAsyncSuccess(
        disableScreenshotMode(
          context.resolvedTabId,
          context.screenshotModeState,
          context.viewportState,
          context.viewportOwnerState,
          context.webSnapshotViewerPorts ?? createWebSnapshotViewerPorts()
        ),
        context.sendResponse
      );
      return true;

    case MessageType.SCREENSHOT_MODE_STATUS:
      return handleScreenshotModeStatus(context);
  }

  return false;
}

export function routeViewportMessage(message: TabModeMessage, context: TabModeContext): boolean {
  if (message.type === MessageType.SET_VIEWPORT) {
    respondAsyncSuccess(
      handleSetViewport(
        context.resolvedTabId,
        message.width,
        message.height,
        context.viewportState,
        context.viewportOwnerState,
        context.webSnapshotViewerPorts ?? createWebSnapshotViewerPorts()
      ),
      context.sendResponse
    );
    return true;
  }

  if (message.type === MessageType.GET_VIEWPORT_STATUS) {
    const viewport = context.viewportState.get(context.resolvedTabId) || null;
    context.sendResponse({ success: true, viewport });
    return true;
  }

  return false;
}
