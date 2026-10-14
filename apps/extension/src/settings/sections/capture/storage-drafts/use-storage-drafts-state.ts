import { useCallback, useEffect, useState } from 'react';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import {
  cleanupDrafts,
  DraftCleanupError,
  type DraftCleanupResult,
  getLibraryStorageUsage,
} from '../../../../composition/persistence/library-lifecycle';
import { getStorageEstimateInfo } from '../../../../features/media-hub/storage-capacity';
import { translate } from '../../../../platform/i18n';
import { useStoragePolicyState } from './use-storage-policy-state';

export type StorageUsageState = {
  available: number;
  drafts: number;
  library: number;
  total: number;
};

export function useStorageDraftsState() {
  const policyState = useStoragePolicyState();
  const [usage, setUsage] = useState<StorageUsageState | null>(null);
  const [cleanupBusy, setCleanupBusy] = useState(false);

  const refreshUsage = useCallback(async () => {
    const [breakdown, estimate] = await Promise.all([
      getLibraryStorageUsage(),
      getStorageEstimateInfo(),
    ]);
    setUsage({
      available: estimate.remaining,
      drafts: breakdown.draftsBytes,
      library: breakdown.libraryBytes,
      total: estimate.usage,
    });
  }, []);

  useEffect(() => {
    void refreshUsage().catch(() => showToast(translate('settings.storageDrafts.error'), 'error'));
  }, [refreshUsage]);

  const runCleanup = useCallback(
    async (includeUnexpired: boolean) => {
      setCleanupBusy(true);
      try {
        let result: DraftCleanupResult;
        let failed = false;
        try {
          result = await cleanupDrafts({ includeUnexpired, policy: policyState.policy });
        } catch (error) {
          if (!(error instanceof DraftCleanupError)) throw error;
          result = error.result;
          failed = true;
        }
        const message = translate(
          failed ? 'settings.storageDrafts.cleanupPartial' : 'settings.storageDrafts.cleanupDone'
        )
          .replace('{count}', String(result.movedCount))
          .replace('{retained}', String(result.retainedCount));
        showToast(message, failed ? 'error' : 'success');
        await refreshUsage().catch(() =>
          showToast(translate('settings.storageDrafts.usageRefreshFailed'), 'error')
        );
      } catch {
        showToast(translate('settings.storageDrafts.error'), 'error');
      } finally {
        setCleanupBusy(false);
      }
    },
    [policyState.policy, refreshUsage]
  );

  return {
    ...policyState,
    busy: policyState.busy || cleanupBusy,
    runCleanup,
    usage,
  };
}
