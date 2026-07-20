import { getContentRuntimeServices } from '../../../application/runtime-services/services';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import type { CaptureResponse } from '../../../../contracts/messaging/contracts/response-types';
import type { CaptureActionType } from '../../../../contracts/settings';
import { loadSettings } from '../../../../composition/persistence/settings';
import { attachContentActionIntent } from '../../../application/privileged-action-intent';
import { setUIHidden } from '../../../selection/locker';
import { persistBackgroundCapture } from '../persistence';
import { restoreVisibleUiState } from '../feedback';
import { runAdapterViewportScreenshot } from './local';
import type { ScreenshotControllerRuntime, ScreenshotSuccessFeedbackOptions } from '../types';
import { createViewportCaptureMessage } from './viewport-message';
import { assertCurrentScreenshotRun, isCurrentScreenshotRun } from '../mode';
import {
  hideRuntimeShellForCapture,
  shouldSaveScenarioCapture,
  waitForUiHideSettle,
} from './shared';
import { CAPTURE_RESPONSE_TIMEOUT_MS, withCaptureStepTimeout } from './watchdog';

type ScreenshotType = 'visible' | 'full' | 'selection';
type ViewportScreenshotType = Extract<ScreenshotType, 'visible' | 'full'>;

export { runSelectionScreenshot } from './selection';

async function hideCaptureUiForFrame(runtime: ScreenshotControllerRuntime): Promise<void> {
  hideRuntimeShellForCapture(runtime);
  setUIHidden(true);
  await waitForUiHideSettle();
}

export async function runViewportScreenshot(
  type: ViewportScreenshotType,
  runtime: ScreenshotControllerRuntime,
  options: ScreenshotSuccessFeedbackOptions = {}
): Promise<void> {
  const actionType = runtime.captureActionRef.current;
  const shouldSaveScenarioStep = shouldSaveScenarioCapture(actionType, runtime);
  try {
    assertCurrentScreenshotRun(runtime, options.runToken);
    await hideCaptureUiForFrame(runtime);
    assertCurrentScreenshotRun(runtime, options.runToken);

    if (shouldSaveScenarioStep) {
      await runtime.scenario?.ensureCaptureReady?.();
      assertCurrentScreenshotRun(runtime, options.runToken);
    }

    if (runtime.captureAdapter) {
      await runAdapterViewportScreenshot(
        type,
        runtime,
        actionType,
        shouldSaveScenarioStep,
        options
      );
      return;
    }

    await runBackgroundViewportScreenshot(
      type,
      actionType,
      runtime,
      shouldSaveScenarioStep,
      options
    );
  } catch (error) {
    restoreVisibleUiState(runtime, options.runToken);
    throw error;
  }
}

async function runBackgroundViewportScreenshot(
  type: ViewportScreenshotType,
  actionType: CaptureActionType,
  runtime: ScreenshotControllerRuntime,
  shouldSaveScenarioStep: boolean,
  options: ScreenshotSuccessFeedbackOptions
): Promise<void> {
  assertCurrentScreenshotRun(runtime, options.runToken);
  const response = await requestBackgroundViewportCapture({
    actionType,
    options,
    runtime,
    shouldSaveScenarioStep,
    type,
  });

  if (!response?.success) {
    throw new Error(response?.error || 'Failed to capture');
  }
  assertCurrentScreenshotRun(runtime, options.runToken);

  const result = await persistBackgroundCapture({
    assertFresh: () => assertCurrentScreenshotRun(runtime, options.runToken),
    contentIntentSource: options.contentIntentSource,
    mode: type,
    response,
    sessionActivePresetId: runtime.capturePersistence.sessionActivePresetId,
    setSaveDialogState: runtime.capturePersistence.setSaveDialogState,
  });
  assertCurrentScreenshotRun(runtime, options.runToken);

  if (options.showSuccessToast !== false && result.successMessage) {
    showToast(result.successMessage, 'success');
  }

  if (shouldSaveScenarioStep && runtime.scenario?.refreshSession) {
    assertCurrentScreenshotRun(runtime, options.runToken);
    await runtime.scenario.refreshSession(() => isCurrentScreenshotRun(runtime, options.runToken));
  }
}

async function requestBackgroundViewportCapture(args: {
  actionType: CaptureActionType;
  options: ScreenshotSuccessFeedbackOptions;
  runtime: ScreenshotControllerRuntime;
  shouldSaveScenarioStep: boolean;
  type: ViewportScreenshotType;
}): Promise<CaptureResponse> {
  const useResponseTimeout = await shouldUseBackgroundResponseTimeout(args.actionType);
  assertCurrentScreenshotRun(args.runtime, args.options.runToken);

  const captureMessage = createViewportCaptureMessage(
    args.type,
    args.actionType,
    args.runtime,
    args.shouldSaveScenarioStep
  );
  const messageWithIntent = await attachContentActionIntent(
    captureMessage,
    args.options.contentIntentSource
  );
  assertCurrentScreenshotRun(args.runtime, args.options.runToken);

  const responsePromise =
    getContentRuntimeServices().messaging.sendRuntimeMessage(messageWithIntent);

  if (!useResponseTimeout) {
    return responsePromise;
  }

  return withCaptureStepTimeout({
    promise: responsePromise,
    step: `viewport-${args.type}-response`,
    timeoutMs: CAPTURE_RESPONSE_TIMEOUT_MS,
  });
}

async function shouldUseBackgroundResponseTimeout(actionType: CaptureActionType): Promise<boolean> {
  if (actionType !== 'copy' && actionType !== 'ask_preset') {
    return false;
  }

  const settings = await loadSettings();
  return !settings.saveCapturesToGallery;
}
