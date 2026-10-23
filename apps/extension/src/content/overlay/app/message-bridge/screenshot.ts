import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { setContentUiPageZoom } from '../../../platform/dom-host';
import { createBackgroundAutoStartContentActionIntentSource } from '../../../application/privileged-action-intent';
import { isLockEnabled } from '../../../selection/locker';
import type {
  RuntimeMessageBridgeParams,
  RuntimeMessageRequest,
  RuntimeMessageResponse,
} from './types';
import {
  setScreenshotSurfaceBinding,
  setScreenshotSurfaceCapabilityToken,
} from '../../viewport-selector/capability';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import { teardownDesignReviewSessionAfterUiTransition } from '../../design-review/runtime/session-teardown';
import type { ScreenshotStartContext, ScreenshotEditingMode } from '../../screenshot/types';

function disableEditingModes(params: RuntimeMessageBridgeParams): void {
  if (params.modeState.aiPickMode) {
    params.modeControls.disableAiPickMode();
    params.modeControls.setAiPickMode(false);
  }

  if (params.modeState.designReviewMode) {
    params.modeControls.disableDesignReviewMode();
    params.modeControls.setDesignReviewMode(false);
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
    request.viewport === undefined &&
    request.workingMode === undefined
  );
}

function hasModeOwnedNavigationLock(params: RuntimeMessageBridgeParams): boolean {
  return (
    params.modeState.aiPickMode ||
    params.modeState.designReviewMode ||
    params.modeState.highlighterMode ||
    params.modeState.quickEditMode
  );
}

function createAutoStartNavigationContext(
  params: RuntimeMessageBridgeParams,
  invalidatedStartContext?: ScreenshotStartContext
): ScreenshotStartContext {
  if (invalidatedStartContext) {
    return invalidatedStartContext;
  }

  return {
    navigationLockBaseline: hasModeOwnedNavigationLock(params) ? false : isLockEnabled(),
  };
}

function resolvePreparationEditingMode(
  params: RuntimeMessageBridgeParams
): ScreenshotEditingMode | null {
  if (params.modeState.aiPickMode) return 'ai-pick';
  if (params.modeState.designReviewMode) return 'design-review';
  if (params.modeState.drawingMode) return 'drawing';
  if (params.modeState.highlighterMode) return 'highlighter';
  if (params.modeState.quickEditDocumentMode) return 'quick-edit-document';
  if (params.modeState.quickEditMode) return 'quick-edit';
  return null;
}

function enableScreenshotModeState(
  request: RuntimeMessageRequest,
  params: RuntimeMessageBridgeParams
): void {
  params.modeControls.setScreenshotMode(true);
  params.modeControls.setNavigationLockEnabled(true);
  params.modeControls.setIsToolbarVisible(
    request.toolbarVisible ?? (!request.autoStartSelection && !request.autoStartCaptureType)
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

  const preparationBaseline =
    request.quickActionOverlay &&
    params.modeState.screenshotMode &&
    !params.quickAction.quickActionOverlayRef.current
      ? {
          captureAction: params.quickAction.captureActionRef.current,
          timerDelay: params.quickAction.timerDelay ?? 0,
          isToolbarVisible: params.modeState.isToolbarVisible,
          navigationLockEnabled: params.modeState.navigationLockEnabled ?? isLockEnabled(),
          editingMode: resolvePreparationEditingMode(params),
        }
      : undefined;
  const invalidatedStartContext = params.viewport.invalidateScreenshotRuns(
    preparationBaseline ? { preparationBaseline } : {}
  );
  const autoStartNavigationContext = createAutoStartNavigationContext(
    params,
    invalidatedStartContext
  );
  if (preparationBaseline && !autoStartNavigationContext.preparationBaseline) {
    autoStartNavigationContext.preparationBaseline = preparationBaseline;
  }

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

  if (typeof request.pageZoom === 'number') setContentUiPageZoom(request.pageZoom);

  setScreenshotSurfaceBinding({
    token: request.surfaceCapabilityToken ?? null,
    ...(request.surfaceLeaseGeneration === undefined
      ? {}
      : { leaseGeneration: request.surfaceLeaseGeneration }),
    ...(request.surfaceOperationGeneration === undefined
      ? {}
      : { operationGeneration: request.surfaceOperationGeneration }),
  });

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
  if (request.workingMode) params.workingModes.select(request.workingMode);
  if (request.surfaceWarning) showToast(request.surfaceWarning, 'warning', 5000);

  sendResponse({ success: true });
  return true;
}

function hideScreenshotToolbar(params: RuntimeMessageBridgeParams): void {
  setScreenshotSurfaceCapabilityToken(null);
  params.viewport.clearPendingAutoStartCapture();
  params.viewport.invalidateScreenshotRuns();
  params.modeControls.setScreenshotMode(false);
  params.modeControls.setNavigationLockEnabled(false);
  params.modeControls.setIsToolbarVisible(false);
}

function completeScreenshotToolbarTeardown(
  params: RuntimeMessageBridgeParams,
  sendResponse: (response?: RuntimeMessageResponse) => void
): void {
  void teardownDesignReviewSessionAfterUiTransition(() => {
    disableEditingModes(params);
    hideScreenshotToolbar(params);
  })
    .then(() => {
      sendResponse({ success: true });
    })
    .catch((error) => {
      sendResponse({
        error: error instanceof Error ? error.message : 'Design Review session teardown failed',
        success: false,
      });
    });
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
    completeScreenshotToolbarTeardown(params, sendResponse);
    return true;
  }

  if (request.type === MessageType.DESTROY_UI_TOOLBAR) {
    completeScreenshotToolbarTeardown(params, sendResponse);
    return true;
  }

  return false;
}
