import { browserTabs } from '@sniptale/platform/browser/tabs';
import { clearPinToTabSessionStorageState } from '../../../../composition/persistence/content-pin-session/index';
import { clearAnnotationForkSessionForTab } from '../../../annotation-fork-session/route';
import { clearPinnedToolbarOperationState } from '../../page-access/pinned-toolbar-operation';
import { clearBackgroundRuntimeTabState } from '../../../application/runtime-state';
import { handleTabClose } from '../../../media/lifecycle';
import { cleanupScreenshotModeAfterTabClose } from '../../tab-mode-router-screenshot';
import type { BackgroundModeState, RuntimeWiringLogger } from './shared';

export function registerTabLifecycleListeners(
  state: BackgroundModeState,
  logger: RuntimeWiringLogger
): void {
  browserTabs.subscribeToRemoved((tabId) => {
    clearPinnedToolbarOperationState(tabId);
    void (async () => {
      try {
        await handleTabClose(tabId);
      } catch (error) {
        logger.warn('Failed to stop recording after tab close', error);
      }
      try {
        await cleanupScreenshotModeAfterTabClose(
          tabId,
          state.screenshotModeState,
          state.viewportState,
          state.viewportOwnerState,
          state.webSnapshotViewerPorts
        );
        await clearBackgroundRuntimeTabState(state, tabId);
      } catch (error) {
        logger.warn('Failed to restore screenshot state after tab close', error);
      }
    })();
    void clearPinToTabSessionStorageState(tabId).catch((error) => {
      logger.warn('Failed to clear pin-to-tab state after tab close', error);
    });
    void clearAnnotationForkSessionForTab(tabId).catch((error) => {
      logger.warn('Failed to clear annotation fork drafts after tab close', error);
    });
    logger.log('Tab closed, state cleared', tabId);
  });
}
