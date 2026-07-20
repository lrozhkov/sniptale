import { browserPermissions } from '@sniptale/platform/browser/permissions';
import { browserTabs } from '@sniptale/platform/browser/tabs';
import { clearAllPinToTabSessionStorageState } from '../../../composition/persistence/content-pin-session/index';
import { clearPageAccessTabActivation, unregisterRemovedPageAccessOrigins } from './service';
import { reconcilePersistentContentScriptRegistrations } from './registration';

type PageAccessLifecycleLogger = {
  warn(message: string, error: unknown): void;
};

export function initializePageAccessLifecycle(logger?: PageAccessLifecycleLogger): void {
  void reconcilePersistentContentScriptRegistrations().catch((error) => {
    logger?.warn('Failed to reconcile persistent page-access content scripts', error);
  });

  browserTabs.subscribeToRemoved((tabId) => {
    void clearPageAccessTabActivation(tabId);
  });

  browserTabs.subscribeToUpdated((tabId, changeInfo) => {
    if (changeInfo.status === 'loading' || typeof changeInfo.url === 'string') {
      void clearPageAccessTabActivation(tabId);
    }
  });

  browserPermissions.subscribeToRemoved((permissions) => {
    const origins = permissions.origins ?? [];
    if (origins.length === 0) {
      return;
    }

    void unregisterRemovedPageAccessOrigins(origins);
    void clearAllPinToTabSessionStorageState();
  });
}
