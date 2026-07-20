import { hideAllToasts } from '@sniptale/ui/product-feedback/toast-service';
import { restoreVisibleUiState, showScreenshotError, showSelectionError } from '../feedback';
import { runSelectionScreenshot, runViewportScreenshot } from '../capture/run';
import {
  closeQuickActionCapture,
  completeScreenshotRun,
  isStaleScreenshotRunError,
  shouldExitAfterQuickActionCapture,
} from '../mode';
import type { CreateScreenshotControllerActionsArgs } from './action-types';
import type { ScreenshotType } from '../countdown/controller';
import type { ContentPrivilegedActionIntentSource } from '../../../application/privileged-action-intent';

export async function runImmediateScreenshot(
  type: ScreenshotType,
  args: CreateScreenshotControllerActionsArgs,
  runToken: number,
  contentIntentSource?: ContentPrivilegedActionIntentSource
) {
  hideAllToasts();

  try {
    if (type === 'selection') {
      if (contentIntentSource) {
        await runSelectionScreenshot(args.runtime, { contentIntentSource, runToken });
      } else {
        await runSelectionScreenshot(args.runtime, { runToken });
      }
    } else {
      if (contentIntentSource) {
        await runViewportScreenshot(type, args.runtime, { contentIntentSource, runToken });
      } else {
        await runViewportScreenshot(type, args.runtime, { runToken });
      }
    }

    if (shouldExitAfterQuickActionCapture(args.params.quickActionOverlayRef)) {
      closeQuickActionCapture(args.params, args.runtime, runToken);
      return;
    }

    restoreVisibleUiState(args.runtime, runToken);
  } catch (error) {
    restoreVisibleUiState(args.runtime, runToken);
    if (isStaleScreenshotRunError(error)) {
      return;
    }

    if (type === 'selection') {
      showSelectionError(error);
      return;
    }

    showScreenshotError(error);
  } finally {
    completeScreenshotRun(args.runtime, runToken);
  }
}
