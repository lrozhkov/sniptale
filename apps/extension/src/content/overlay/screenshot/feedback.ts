import type { CaptureActionType } from '../../../contracts/settings';

import { translate } from '../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import { disableNavigationLock, enableNavigationLock, setUIHidden } from '../../selection/locker';
import { isCurrentScreenshotRun } from './mode';
import type { ScreenshotControllerRuntime } from './types';

const logger = createLogger({ namespace: 'ContentScreenshotFeedback' });

export function getQuickActionSuccessMessage(actionType: CaptureActionType): string | null {
  if (actionType === 'copy') {
    return translate('content.runtime.quickActionCopiedToClipboard');
  }

  if (actionType === 'download_default' || actionType === 'ask_system') {
    return translate('content.runtime.quickActionSaved');
  }

  return null;
}

export function restoreVisibleUiState(
  {
    navigationLockStateBeforeScreenshot,
    screenshotRunGenerationRef,
    setIsCompletelyHidden,
    setIsToolbarVisible,
    setNavigationLockEnabled,
  }: Pick<
    ScreenshotControllerRuntime,
    | 'navigationLockStateBeforeScreenshot'
    | 'screenshotRunGenerationRef'
    | 'setIsCompletelyHidden'
    | 'setIsToolbarVisible'
    | 'setNavigationLockEnabled'
  >,
  runToken?: number
) {
  if (!isCurrentScreenshotRun({ screenshotRunGenerationRef }, runToken)) {
    return;
  }

  logger.debug('restoreVisibleUiState.start', {
    navigationLockBeforeScreenshot: navigationLockStateBeforeScreenshot.current,
  });
  setUIHidden(false);
  setIsCompletelyHidden(false);
  setIsToolbarVisible(true);

  if (navigationLockStateBeforeScreenshot.current) {
    enableNavigationLock(false);
  } else {
    disableNavigationLock();
  }

  setNavigationLockEnabled(navigationLockStateBeforeScreenshot.current);
  logger.debug('restoreVisibleUiState.complete', {
    navigationLockRestoredTo: navigationLockStateBeforeScreenshot.current,
  });
}

export function showSelectionError(error: unknown): void {
  if (error instanceof Error && error.message === 'Cancelled by user') {
    showToast(translate('content.toolbar.selectionCancelled'), 'info');
    return;
  }

  logger.error('Selection error', error);
  showToast(translate('content.toolbar.selectionErrorPrefix'), 'error');
}

export function showScreenshotError(error: unknown): void {
  logger.error('Screenshot error', error);
  const errorMessage =
    error instanceof Error ? error.message : translate('content.toolbar.unknownErrorWithArticle');

  showToast(`${translate('content.toolbar.selectionErrorPrefix')} ${errorMessage}`, 'error');
}
