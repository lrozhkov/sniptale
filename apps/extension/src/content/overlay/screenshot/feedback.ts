import type { CaptureActionType } from '../../../contracts/settings';

import { translate } from '../../../platform/i18n';
import { createUserFacingErrorMessage } from '../../../platform/i18n/user-facing-error';
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
    session,
    restoreEditingMode,
    setIsCompletelyHidden,
    setIsToolbarVisible,
    setNavigationLockEnabled,
  }: Pick<
    ScreenshotControllerRuntime,
    | 'restoreEditingMode'
    | 'session'
    | 'setIsCompletelyHidden'
    | 'setIsToolbarVisible'
    | 'setNavigationLockEnabled'
  >,
  runToken?: number
) {
  if (!isCurrentScreenshotRun({ session }, runToken)) {
    return;
  }

  logger.debug('restoreVisibleUiState.start', {
    navigationLockBeforeScreenshot: session.navigationLockBaseline,
  });
  setUIHidden(false);
  setIsCompletelyHidden(false);
  setIsToolbarVisible(true);

  if (session.navigationLockBaseline) {
    enableNavigationLock(false);
  } else {
    disableNavigationLock();
  }

  setNavigationLockEnabled(session.navigationLockBaseline);
  const editingModeBaseline = session.editingModeBaseline;
  session.editingModeBaseline = null;
  if (editingModeBaseline) {
    restoreEditingMode(editingModeBaseline);
  }
  logger.debug('restoreVisibleUiState.complete', {
    editingModeRestoredTo: editingModeBaseline,
    navigationLockRestoredTo: session.navigationLockBaseline,
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
  showToast(
    createUserFacingErrorMessage({
      cause: error,
      detail: 'unexpected',
      summaryKey: 'content.toolbar.selectionErrorPrefix',
    }),
    'error'
  );
}
