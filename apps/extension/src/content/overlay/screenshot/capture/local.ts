import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import type { CaptureActionType } from '../../../../contracts/settings';
import type { ContentPrivilegedActionIntentSource } from '../../../application/privileged-action-intent';
import { persistSelectionCapture } from '../persistence';
import { assertCurrentScreenshotRun, isCurrentScreenshotRun } from '../mode';
import type { ScreenshotControllerRuntime, ScreenshotSuccessFeedbackOptions } from '../types';

type ScreenshotType = 'visible' | 'full' | 'selection';

export async function persistLocalCaptureDataUrl(args: {
  actionType: CaptureActionType;
  contentIntentSource?: ContentPrivilegedActionIntentSource | undefined;
  dataUrl: string;
  mode: ScreenshotType;
  runtime: ScreenshotControllerRuntime;
  runToken?: number | undefined;
  showSuccessToast: boolean;
}): Promise<void> {
  assertCurrentScreenshotRun(args.runtime, args.runToken);
  const result = await persistSelectionCapture({
    actionType: args.actionType,
    assertFresh: () => assertCurrentScreenshotRun(args.runtime, args.runToken),
    contentIntentSource: args.contentIntentSource,
    dataUrl: args.dataUrl,
    mode: args.mode,
    sessionActivePresetId: args.runtime.capturePersistence.sessionActivePresetId,
    setSaveDialogState: args.runtime.capturePersistence.setSaveDialogState,
  });
  assertCurrentScreenshotRun(args.runtime, args.runToken);

  if (args.showSuccessToast && result.successMessage) {
    showToast(result.successMessage, 'success');
  }
}

export async function saveScenarioLocalCapture(args: {
  dataUrl: string;
  ensureBeforeSave: boolean;
  mode: ScreenshotType;
  runtime: ScreenshotControllerRuntime;
  runToken?: number | undefined;
  shouldSaveScenarioStep: boolean;
}): Promise<void> {
  if (!args.shouldSaveScenarioStep || !args.runtime.scenario?.saveSelectionCapture) {
    return;
  }

  assertCurrentScreenshotRun(args.runtime, args.runToken);
  if (args.ensureBeforeSave) {
    await args.runtime.scenario.ensureCaptureReady?.();
  }
  assertCurrentScreenshotRun(args.runtime, args.runToken);
  await args.runtime.scenario.saveSelectionCapture(args.dataUrl, args.mode, () =>
    isCurrentScreenshotRun(args.runtime, args.runToken)
  );
  assertCurrentScreenshotRun(args.runtime, args.runToken);
}

export async function runAdapterViewportScreenshot(
  type: Extract<ScreenshotType, 'visible' | 'full'>,
  runtime: ScreenshotControllerRuntime,
  actionType: CaptureActionType,
  shouldSaveScenarioStep: boolean,
  options: ScreenshotSuccessFeedbackOptions
): Promise<void> {
  assertCurrentScreenshotRun(runtime, options.runToken);
  const dataUrl = await runtime.captureAdapter?.captureViewport(type);
  if (!dataUrl) {
    throw new Error('Web snapshot viewer did not produce screenshot data.');
  }

  assertCurrentScreenshotRun(runtime, options.runToken);
  await persistLocalCaptureDataUrl({
    actionType,
    contentIntentSource: options.contentIntentSource,
    dataUrl,
    mode: type,
    runtime,
    runToken: options.runToken,
    showSuccessToast: options.showSuccessToast !== false,
  });
  await saveScenarioLocalCapture({
    dataUrl,
    ensureBeforeSave: false,
    mode: type,
    runtime,
    runToken: options.runToken,
    shouldSaveScenarioStep,
  });
  if (shouldSaveScenarioStep) {
    assertCurrentScreenshotRun(runtime, options.runToken);
    await runtime.scenario?.refreshSession?.(() =>
      isCurrentScreenshotRun(runtime, options.runToken)
    );
  }
}
