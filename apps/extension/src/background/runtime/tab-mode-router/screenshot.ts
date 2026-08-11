import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { TabModeMessage } from '@sniptale/runtime-contracts/messaging/message-types';
import { createWebSnapshotViewerPorts } from '../../capture/lifecycle';
import {
  buildScreenshotModeStatusResponse,
  disableScreenshotModeForContent,
  enableScreenshotMode,
  getScreenshotPresetAvailabilities,
  handleApplyViewportPreset,
  handleReleaseViewportPreset,
} from '../tab-mode-router-screenshot';
import { respondAsyncRoute, respondAsyncSuccess } from '../../routing-contracts/response';
import type { TabModeContext } from './shared';
import { isScreenshotModeMessage } from './shared';
import { getPreauthorizedContentActionRouteMessage } from '../../capture/routes';

function handleScreenshotModeStatus(context: TabModeContext): boolean {
  return buildScreenshotModeStatusResponse(
    context.resolvedTabId,
    context.screenshotModeState,
    context.viewportState,
    context.sendResponse,
    context.senderDocumentId ?? null
  );
}

function syncWorkingModeState(
  context: TabModeContext,
  workingMode: Extract<TabModeMessage, { type: 'ENABLE_SCREENSHOT_MODE' }>['workingMode']
): void {
  if (workingMode === undefined) return;
  if (workingMode === 'highlighter') context.highlighterModeState.set(context.resolvedTabId, true);
  else context.highlighterModeState.delete(context.resolvedTabId);
  if (workingMode === 'quick-edit') context.quickEditModeState.set(context.resolvedTabId, true);
  else context.quickEditModeState.delete(context.resolvedTabId);
}

export function routeScreenshotModeMessage(
  message: TabModeMessage,
  context: TabModeContext
): boolean {
  if (!isScreenshotModeMessage(message)) {
    return false;
  }

  switch (message.type) {
    case MessageType.ENABLE_SCREENSHOT_MODE: {
      const senderBinding = getPreauthorizedContentActionRouteMessage(message);
      respondAsyncSuccess(
        enableScreenshotMode(
          context.resolvedTabId,
          context.screenshotModeState,
          context.viewportState,
          context.viewportOwnerState,
          context.webSnapshotViewerPorts ?? createWebSnapshotViewerPorts(),
          {
            ...(senderBinding ? { surfaceDocumentId: senderBinding.documentId } : {}),
            ...(message.workingMode === undefined ? {} : { workingMode: message.workingMode }),
          }
        ).then(() => syncWorkingModeState(context, message.workingMode)),
        context.sendResponse
      );
      return true;
    }

    case MessageType.DISABLE_SCREENSHOT_MODE:
      respondAsyncSuccess(
        disableScreenshotModeForContent({
          leaseGeneration: message.leaseGeneration,
          operationGeneration: message.operationGeneration,
          screenshotModeState: context.screenshotModeState,
          senderDocumentId: context.senderDocumentId,
          surfaceCapabilityToken: message.surfaceCapabilityToken,
          tabId: context.resolvedTabId,
          viewportOwnerState: context.viewportOwnerState,
          viewportState: context.viewportState,
          webSnapshotViewerPorts: context.webSnapshotViewerPorts ?? createWebSnapshotViewerPorts(),
        }),
        context.sendResponse
      );
      return true;

    case MessageType.SCREENSHOT_MODE_STATUS:
      return handleScreenshotModeStatus(context);
  }

  return false;
}

export function routeViewportMessage(message: TabModeMessage, context: TabModeContext): boolean {
  if (message.type === MessageType.APPLY_VIEWPORT_PRESET) {
    respondAsyncSuccess(
      handleApplyViewportPreset(
        context.resolvedTabId,
        message.presetId,
        message.operationGeneration,
        message.surfaceCapabilityToken,
        context.senderDocumentId,
        context.viewportState,
        context.viewportOwnerState,
        context.webSnapshotViewerPorts ?? createWebSnapshotViewerPorts()
      ),
      context.sendResponse
    );
    return true;
  }

  if (message.type === MessageType.RELEASE_VIEWPORT_PRESET) {
    respondAsyncSuccess(
      handleReleaseViewportPreset(
        context.resolvedTabId,
        message.operationGeneration,
        message.leaseGeneration,
        message.surfaceCapabilityToken,
        context.senderDocumentId,
        context.viewportState,
        context.viewportOwnerState,
        context.webSnapshotViewerPorts ?? createWebSnapshotViewerPorts()
      ),
      context.sendResponse
    );
    return true;
  }

  if (message.type === MessageType.GET_VIEWPORT_PRESET_AVAILABILITY) {
    respondAsyncRoute(
      getScreenshotPresetAvailabilities(
        context.resolvedTabId,
        message.presetIds,
        message.context ?? 'screenshot'
      ).then((availabilities) => ({ success: true as const, availabilities })),
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
