import { browserTabs } from '@sniptale/platform/browser/tabs';
import { clearPinToTabSessionStorageState } from '../../../../composition/persistence/content-pin-session/index';
import { clearBackgroundRuntimeTabState } from '../../../application/runtime-state';
import { handleTabClose } from '../../../media/lifecycle';
import type { BackgroundModeState, RuntimeWiringLogger } from './shared';

export function registerTabLifecycleListeners(
  state: BackgroundModeState,
  logger: RuntimeWiringLogger
): void {
  browserTabs.subscribeToRemoved((tabId) => {
    void clearBackgroundRuntimeTabState(state, tabId).catch((error) => {
      logger.warn('Failed to clear persisted tab state after tab close', error);
    });
    void clearPinToTabSessionStorageState(tabId).catch((error) => {
      logger.warn('Failed to clear pin-to-tab state after tab close', error);
    });
    logger.log('Tab closed, state cleared', tabId);

    handleTabClose(tabId);
  });
}
