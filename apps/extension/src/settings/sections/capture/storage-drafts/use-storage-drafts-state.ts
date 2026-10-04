import { useCallback, useEffect, useState } from 'react';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import {
  cleanupDrafts,
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
        const result = await cleanupDrafts({ includeUnexpired, policy: policyState.policy });
        await refreshUsage();
        const message = translate('settings.storageDrafts.cleanupDone').replace(
          '{count}',
          String(result.deletedCount)
        );
        showToast(message, 'success');
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
