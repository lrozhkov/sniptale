import { createLogger } from '@sniptale/platform/observability/logger';
import { getContentRuntimeServices } from '../../../application/runtime-services/services';
import type { CaptureResponse } from '../../../../contracts/messaging/contracts/response-types';
import { CaptureMessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { cropImage } from '@sniptale/platform/browser/media/image-crop';
import {
  attachContentActionIntent,
  type ContentPrivilegedActionIntentSource,
} from '../../../application/privileged-action-intent';
import { setUIHidden } from '../../../selection/locker';
import { enableSelectionModeDeferredIfCurrent } from '../../../selection/selection-mode/lazy';
import { restoreVisibleUiState } from '../feedback';
import { persistLocalCaptureDataUrl, saveScenarioLocalCapture } from './local';
import type { ScreenshotControllerRuntime, ScreenshotSuccessFeedbackOptions } from '../types';
import {
  assertCurrentScreenshotRun,
  isCurrentScreenshotRun,
  StaleScreenshotRunError,
} from '../mode';
import {
  hideRuntimeShellForCapture,
  shouldSaveScenarioCapture,
  waitForUiHideSettle,
} from './shared';
import { CAPTURE_RESPONSE_TIMEOUT_MS, withCaptureStepTimeout } from './watchdog';

const SELECTION_CAPTURE_RETRY_ATTEMPTS = 2;
const logger = createLogger({ namespace: 'ContentScreenshotCapture' });

function logSelectionScreenshotDiag(event: string, details?: Record<string, unknown>): void {
  logger.debug(event, details ?? {});
}

async function requestSelectionCaptureFrame(args: {
  contentIntentSource: ContentPrivilegedActionIntentSource | undefined;
  runToken: number | undefined;
  runtime: ScreenshotControllerRuntime;
}): Promise<CaptureResponse | null> {
  const messageWithIntent = await attachContentActionIntent(
    {
      type: CaptureMessageType.CAPTURE_VISIBLE_FOR_CROP,
    },
    args.contentIntentSource
  );
  assertCurrentScreenshotRun(args.runtime, args.runToken);

  const response = await withCaptureStepTimeout({
    promise: getContentRuntimeServices().messaging.sendRuntimeMessage(messageWithIntent),
    step: 'selection-frame-response',
    timeoutMs: CAPTURE_RESPONSE_TIMEOUT_MS,
  });

  logSelectionScreenshotDiag('runSelectionScreenshot.capture-response', {
    error: response?.error ?? null,
    hasDataUrl: Boolean(response?.dataUrl),
    success: response?.success ?? null,
  });

  return response ?? null;
}

async function captureSelectionFrameWithRetry(
  runtime: ScreenshotControllerRuntime,
  runToken: number | undefined,
  contentIntentSource: ContentPrivilegedActionIntentSource | undefined
): Promise<string> {
  let lastError = 'Failed to capture';

  for (let attempt = 0; attempt < SELECTION_CAPTURE_RETRY_ATTEMPTS; attempt += 1) {
    assertCurrentScreenshotRun(runtime, runToken);
    const response = await requestSelectionCaptureFrame({ contentIntentSource, runToken, runtime });
    if (response?.success && response.dataUrl) {
      return response.dataUrl;
    }

    lastError = response?.error || lastError;
    if (attempt < SELECTION_CAPTURE_RETRY_ATTEMPTS - 1) {
      await waitForUiHideSettle();
      assertCurrentScreenshotRun(runtime, runToken);
    }
  }

  throw new Error(lastError);
}

async function captureRegularSelectionDataUrl(
  runtime: ScreenshotControllerRuntime,
  runToken: number | undefined,
  contentIntentSource: ContentPrivilegedActionIntentSource | undefined
): Promise<string> {
  logSelectionScreenshotDiag('runSelectionScreenshot.await-selection');
  const area = await enableSelectionModeDeferredIfCurrent(() =>
    isCurrentScreenshotRun(runtime, runToken)
  );
  assertCurrentScreenshotRun(runtime, runToken);
  logSelectionScreenshotDiag('runSelectionScreenshot.selection-resolved', { area });
  setUIHidden(true);
  await waitForUiHideSettle();
  assertCurrentScreenshotRun(runtime, runToken);

  const capturedFrameDataUrl = await captureSelectionFrameWithRetry(
    runtime,
    runToken,
    contentIntentSource
  );
  assertCurrentScreenshotRun(runtime, runToken);
  return cropImage(capturedFrameDataUrl, area);
}

async function resolveSelectionDataUrl(
  runtime: ScreenshotControllerRuntime,
  options: ScreenshotSuccessFeedbackOptions
): Promise<string> {
  const dataUrl = runtime.captureAdapter
    ? await runtime.captureAdapter.captureSelection()
    : await captureRegularSelectionDataUrl(runtime, options.runToken, options.contentIntentSource);

  assertCurrentScreenshotRun(runtime, options.runToken);
  return dataUrl;
}

async function refreshScenarioAfterSelection(
  runtime: ScreenshotControllerRuntime,
  options: ScreenshotSuccessFeedbackOptions,
  shouldSaveScenarioStep: boolean
): Promise<void> {
  if (!shouldSaveScenarioStep || !runtime.scenario?.refreshSession) {
    return;
  }

  assertCurrentScreenshotRun(runtime, options.runToken);
  await runtime.scenario.refreshSession(() => isCurrentScreenshotRun(runtime, options.runToken));
}

export async function runSelectionScreenshot(
  runtime: ScreenshotControllerRuntime,
  options: ScreenshotSuccessFeedbackOptions = {}
): Promise<void> {
  const actionType = runtime.captureActionRef.current;
  const shouldSaveScenarioStep = shouldSaveScenarioCapture(actionType, runtime);
  const showSuccessToast = options.showSuccessToast !== false;
  try {
    assertCurrentScreenshotRun(runtime, options.runToken);
    logSelectionScreenshotDiag('runSelectionScreenshot.start');
    hideRuntimeShellForCapture(runtime);
    if (runtime.captureAdapter) {
      setUIHidden(true);
    }
    await waitForUiHideSettle();
    assertCurrentScreenshotRun(runtime, options.runToken);

    const dataUrl = await resolveSelectionDataUrl(runtime, options);
    await persistLocalCaptureDataUrl({
      actionType,
      contentIntentSource: options.contentIntentSource,
      dataUrl,
      mode: 'selection',
      runtime,
      runToken: options.runToken,
      showSuccessToast,
    });

    await saveScenarioLocalCapture({
      dataUrl,
      ensureBeforeSave: true,
      mode: 'selection',
      runtime,
      runToken: options.runToken,
      shouldSaveScenarioStep,
    });

    await refreshScenarioAfterSelection(runtime, options, shouldSaveScenarioStep);

    logSelectionScreenshotDiag('runSelectionScreenshot.complete', {
      didShowSuccessMessage: showSuccessToast,
    });
  } catch (error) {
    if (!isCurrentScreenshotRun(runtime, options.runToken)) {
      throw new StaleScreenshotRunError();
    }
    restoreVisibleUiState(runtime, options.runToken);
    throw error;
  }
}
