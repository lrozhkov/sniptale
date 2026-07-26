import { browserPermissions } from '@sniptale/platform/browser/permissions';
import { browserTabs } from '@sniptale/platform/browser/tabs';
import { clearAllPinToTabSessionStorageState } from '../../../composition/persistence/content-pin-session/index';
import {
  clearPageAccessTabActivation,
  reconcilePageAccessTabNavigation,
  unregisterRemovedPageAccessOrigins,
} from './service';
import { reconcilePersistentContentScriptRegistrations } from './registration';
import { isSupportedUrl } from './target';
import { runPinnedToolbarPermissionCleanup } from './pinned-toolbar-operation';

type PageAccessLifecycleLogger = {
  warn(message: string, error: unknown): void;
};

async function settlePermissionCleanup(operations: Promise<void>[]): Promise<void> {
  const results = await Promise.allSettled(operations);
  const failures: unknown[] = [];
  for (const result of results) {
    if (result.status === 'rejected') {
      failures.push(result.reason as unknown);
    }
  }

  if (failures.length === 1) {
    throw failures[0];
  }
  if (failures.length > 1) {
    throw new AggregateError(failures, 'Multiple pinned toolbar cleanup operations failed');
  }
}

export function initializePageAccessLifecycle(logger?: PageAccessLifecycleLogger): void {
  void reconcilePersistentContentScriptRegistrations().catch((error) => {
    logger?.warn('Failed to reconcile persistent page-access content scripts', error);
  });

  browserTabs.subscribeToRemoved((tabId) => {
    void clearPageAccessTabActivation(tabId);
  });

  browserTabs.subscribeToUpdated((tabId, changeInfo) => {
    if (typeof changeInfo.url !== 'string') {
      return;
    }

    if (isSupportedUrl(changeInfo.url)) {
      void reconcilePageAccessTabNavigation(tabId, changeInfo.url);
    } else {
      void clearPageAccessTabActivation(tabId);
    }
  });

  browserPermissions.subscribeToRemoved((permissions) => {
    const origins = permissions.origins ?? [];
    if (origins.length === 0) {
      return;
    }

    void runPinnedToolbarPermissionCleanup(() =>
      settlePermissionCleanup([
        unregisterRemovedPageAccessOrigins(origins),
        clearAllPinToTabSessionStorageState(),
      ])
    ).catch((error) => {
      logger?.warn('Failed to clean pinned toolbar state after permission removal', error);
    });
  });
}
