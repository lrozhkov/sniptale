import type { BrowserStorageAdapter } from '@sniptale/platform/browser/storage-types';
import { createLogger } from '@sniptale/platform/observability/logger';

const QUICK_ACTIONS_STORAGE_KEY = 'sniptale_quick_actions';
const logger = createLogger({ namespace: 'BackgroundNativeAppRuntime' });

export function subscribeNativeQuickActionSettingsSync(args: {
  storage: Pick<BrowserStorageAdapter, 'canObserveChanges' | 'subscribeToChanges'>;
  sync: () => Promise<void>;
}): (() => void) | null {
  if (!args.storage.canObserveChanges()) {
    return null;
  }

  return args.storage.subscribeToChanges((changes, areaName) => {
    if (areaName !== 'local' || !changes[QUICK_ACTIONS_STORAGE_KEY]) {
      return;
    }
    void args.sync().catch((error) => {
      logger.warn('Failed to sync native shortcut priority after quick action change', error);
    });
  });
}
