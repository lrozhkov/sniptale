import { translate } from '../../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import { clearAllHighlights } from '../../../selection/highlighter';
import type { UseToolbarModeControllerParams } from './types';

const logger = createLogger({ namespace: 'ContentToolbarModeController' });

function createClearHighlightsHandler() {
  return () => {
    clearAllHighlights();
    showToast(translate('content.toolbar.allFramesCleared'), 'info');
  };
}

function createNavigationLockToggle(
  setNavigationLockEnabled: UseToolbarModeControllerParams['setNavigationLockEnabled']
) {
  return (enabled: boolean) => {
    setNavigationLockEnabled(enabled);
    showToast(
      enabled
        ? translate('content.toolbar.navigationDisabled')
        : translate('content.toolbar.navigationEnabled'),
      'info'
    );
  };
}

function createToolbarHideHandler(
  setIsToolbarVisible: UseToolbarModeControllerParams['setIsToolbarVisible']
) {
  return () => {
    logger.log('handleHideToolbar called - hiding toolbar but keeping screenshotMode');
    setIsToolbarVisible(false);
  };
}

export function createToolbarStaticHandlers(
  setIsToolbarVisible: UseToolbarModeControllerParams['setIsToolbarVisible'],
  setNavigationLockEnabled: UseToolbarModeControllerParams['setNavigationLockEnabled']
) {
  return {
    handleClearHighlights: createClearHighlightsHandler(),
    handleHideToolbar: createToolbarHideHandler(setIsToolbarVisible),
    handleToggleNavigationLock: createNavigationLockToggle(setNavigationLockEnabled),
  };
}
