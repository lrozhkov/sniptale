import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import {
  getQuickActionSuccessMessage,
  restoreVisibleUiState,
  showScreenshotError,
  showSelectionError,
} from '../feedback';
import { runSelectionScreenshot, runViewportScreenshot } from '../capture/run';
import {
  closeQuickActionCapture,
  completeScreenshotRun,
  isCurrentScreenshotRun,
  isStaleScreenshotRunError,
  shouldExitAfterQuickActionCapture,
  syncCaptureAction,
} from '../mode';
import type { CreateScreenshotControllerActionsArgs } from './action-types';
import type { ScreenshotType } from '../types';
import type { ContentPrivilegedActionIntentSource } from '../../../application/privileged-action-intent';
import type { CaptureActionType } from '../../../../contracts/settings';

async function runCountdownCapture(
  type: ScreenshotType,
  args: CreateScreenshotControllerActionsArgs,
  runToken: number,
  contentIntentSource: ContentPrivilegedActionIntentSource | undefined,
  showSuccessToast: boolean
): Promise<void> {
  if (type === 'selection') {
    await runSelectionScreenshot(args.runtime, {
      contentIntentSource,
      runToken,
      showSuccessToast,
    });
    return;
  }

  await runViewportScreenshot(type, args.runtime, {
    contentIntentSource,
    runToken,
    showSuccessToast,
  });
}

async function closeQuickActionCountdownCapture(args: {
  controllerArgs: CreateScreenshotControllerActionsArgs;
  quickActionAfterCapture: CaptureActionType | null;
  runToken: number;
}): Promise<void> {
  await closeQuickActionCapture(
    args.controllerArgs.params,
    args.controllerArgs.runtime,
    args.runToken
  );
  const quickActionSuccessMessage = args.quickActionAfterCapture
    ? getQuickActionSuccessMessage(args.quickActionAfterCapture)
    : null;
  if (quickActionSuccessMessage) {
    showToast(quickActionSuccessMessage, 'success');
  }
}

function reportCountdownCaptureError(error: unknown, type: ScreenshotType): void {
  if (isStaleScreenshotRunError(error)) {
    return;
  }

  if (type === 'selection') {
    showSelectionError(error);
  } else {
    showScreenshotError(error);
  }
}

function clearCountdownStateIfOwned(
  args: CreateScreenshotControllerActionsArgs,
  runToken: number
): void {
  if (args.session.countdownRunToken !== null) {
    if (args.session.countdownRunToken !== runToken) {
      return;
    }
    args.session.countdownRunToken = null;
  }

  args.setCountdown(null);
  args.session.pendingType = null;
}

export async function executeCountdownScreenshot(
  type: ScreenshotType,
  args: CreateScreenshotControllerActionsArgs,
  runToken: number,
  contentIntentSource?: ContentPrivilegedActionIntentSource
): Promise<void> {
  if (!isCurrentScreenshotRun(args.runtime, runToken)) {
    clearCountdownStateIfOwned(args, runToken);
    return;
  }

  await syncCaptureAction(args.params);
  let didCloseQuickAction = false;
  const quickActionAfterCapture = args.params.quickActionOverlayRef.current?.afterCapture ?? null;
  const shouldCloseQuickAction = shouldExitAfterQuickActionCapture(
    args.params.quickActionOverlayRef
  );

  try {
    await runCountdownCapture(type, args, runToken, contentIntentSource, !shouldCloseQuickAction);
    if (!isCurrentScreenshotRun(args.runtime, runToken)) {
      return;
    }

    if (shouldCloseQuickAction) {
      await closeQuickActionCountdownCapture({
        controllerArgs: args,
        quickActionAfterCapture,
        runToken,
      });
      didCloseQuickAction = true;
      return;
    }
  } catch (error) {
    reportCountdownCaptureError(error, type);
  } finally {
    if (!didCloseQuickAction) {
      restoreVisibleUiState(args.runtime, runToken);
    }
    completeScreenshotRun(args.runtime, runToken);
    clearCountdownStateIfOwned(args, runToken);
  }
}
