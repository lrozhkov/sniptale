import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createBackgroundAutoStartContentActionIntentSource } from '../../../application/privileged-action-intent';
import { isLockEnabled } from '../../../selection/locker';
import type {
  RuntimeMessageBridgeParams,
  RuntimeMessageRequest,
  RuntimeMessageResponse,
} from './types';

function disableEditingModes(params: RuntimeMessageBridgeParams): void {
  if (params.modeState.aiPickMode) {
    params.modeControls.disableAiPickMode();
    params.modeControls.setAiPickMode(false);
  }

  if (params.modeState.highlighterMode) {
    params.modeControls.disableHighlighterMode();
    params.modeControls.setHighlighterMode(false);
  }

  if (params.modeState.quickEditMode) {
    params.modeControls.disableQuickEditMode();
    params.modeControls.setQuickEditDocumentMode(false);
    params.modeControls.setQuickEditMode(false);
  }
}

function applyQuickActionOverlay(
  request: RuntimeMessageRequest,
  params: RuntimeMessageBridgeParams
): void {
  if (!request.quickActionOverlay) {
    return;
  }

  params.quickAction.setQuickActionOverlay(request.quickActionOverlay);
  params.quickAction.setCaptureAction(request.quickActionOverlay.afterCapture);
  params.quickAction.setTimerDelay(request.quickActionOverlay.delaySeconds ?? 0);
}

function isPlainPopupPreparationOpenFlow(request: RuntimeMessageRequest): boolean {
  return (
    request.quickActionOverlay === undefined &&
    request.autoStartSelection !== true &&
    request.autoStartCaptureType === undefined &&
    request.viewport === undefined
  );
}

function hasModeOwnedNavigationLock(params: RuntimeMessageBridgeParams): boolean {
  return (
    params.modeState.aiPickMode ||
    params.modeState.highlighterMode ||
    params.modeState.quickEditMode
  );
}

function createAutoStartNavigationContext(
  params: RuntimeMessageBridgeParams,
  invalidatedStartContext?: { navigationLockBaseline?: boolean | undefined }
) {
  if (invalidatedStartContext) {
    return invalidatedStartContext;
  }

  return {
    navigationLockBaseline: hasModeOwnedNavigationLock(params) ? false : isLockEnabled(),
  };
}

function enableScreenshotModeState(
  request: RuntimeMessageRequest,
  params: RuntimeMessageBridgeParams
): void {
  params.modeControls.setScreenshotMode(true);
  params.modeControls.setNavigationLockEnabled(true);
  params.modeControls.setIsToolbarVisible(
    !request.autoStartSelection && !request.autoStartCaptureType
  );
  params.viewport.setCurrentViewport(request.viewport ?? null);
  applyQuickActionOverlay(request, params);
}

function resolveAutoStartIntentSource(request: RuntimeMessageRequest) {
  return request.contentIntentGrant
    ? createBackgroundAutoStartContentActionIntentSource(request.contentIntentGrant.grantToken)
    : undefined;
}

function queueAutoStartCaptureIfNeeded(
  request: RuntimeMessageRequest,
  params: RuntimeMessageBridgeParams
): void {
  if (!request.autoStartSelection && !request.autoStartCaptureType) {
    return;
  }

  const invalidatedStartContext = params.viewport.invalidateScreenshotRuns();
  const autoStartNavigationContext = createAutoStartNavigationContext(
    params,
    invalidatedStartContext
  );

  if (request.autoStartSelection) {
    params.viewport.queueAutoStartCapture(
      'selection',
      resolveAutoStartIntentSource(request),
      autoStartNavigationContext
    );
    return;
  }

  if (request.autoStartCaptureType) {
    params.viewport.queueAutoStartCapture(
      request.autoStartCaptureType,
      resolveAutoStartIntentSource(request),
      autoStartNavigationContext
    );
  }
}

function handleEnableScreenshotMode(
  request: RuntimeMessageRequest,
  params: RuntimeMessageBridgeParams,
  sendResponse: (response?: RuntimeMessageResponse) => void
): boolean {
  if (request.type !== MessageType.ENABLE_SCREENSHOT_MODE) {
    return false;
  }

  if (
    params.modeState.screenshotMode &&
    params.modeState.isToolbarVisible &&
    isPlainPopupPreparationOpenFlow(request)
  ) {
    sendResponse({ success: true });
    return true;
  }

  queueAutoStartCaptureIfNeeded(request, params);
  enableScreenshotModeState(request, params);

  sendResponse({ success: true });
  return true;
}

function hideScreenshotToolbar(params: RuntimeMessageBridgeParams): void {
  params.viewport.clearPendingAutoStartCapture();
  params.viewport.invalidateScreenshotRuns();
  params.modeControls.setScreenshotMode(false);
  params.modeControls.setNavigationLockEnabled(false);
  params.modeControls.setIsToolbarVisible(false);
}

export function handleScreenshotModeMessage(
  request: RuntimeMessageRequest,
  params: RuntimeMessageBridgeParams,
  sendResponse: (response?: RuntimeMessageResponse) => void
): boolean {
  if (handleEnableScreenshotMode(request, params, sendResponse)) {
    return true;
  }

  if (request.type === MessageType.DISABLE_SCREENSHOT_MODE) {
    disableEditingModes(params);
    hideScreenshotToolbar(params);
    sendResponse({ success: true });
    return true;
  }

  if (request.type === MessageType.DESTROY_UI_TOOLBAR) {
    hideScreenshotToolbar(params);
    sendResponse({ success: true });
    return true;
  }

  return false;
}
