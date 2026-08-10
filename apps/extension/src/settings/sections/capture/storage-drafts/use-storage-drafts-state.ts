import { useCallback, useEffect, useState } from 'react';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import type { LocalStoragePolicy } from '../../../../contracts/settings';
import { loadSettings, patchSettings } from '../../../../composition/persistence/settings';
import {
  cleanupDrafts,
  DEFAULT_LOCAL_STORAGE_POLICY,
  getLibraryStorageUsage,
} from '../../../../composition/persistence/library-lifecycle';
import { getStorageEstimateInfo } from '../../../../features/media-hub/storage-capacity';
import { translate } from '../../../../platform/i18n';

export type StorageUsageState = {
  available: number;
  drafts: number;
  library: number;
  total: number;
};

export function useStorageDraftsState() {
  const [policy, setPolicy] = useState<LocalStoragePolicy>(DEFAULT_LOCAL_STORAGE_POLICY);
  const [usage, setUsage] = useState<StorageUsageState | null>(null);
  const [busy, setBusy] = useState(true);

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
    void Promise.all([loadSettings(), refreshUsage()])
      .then(([settings]) => setPolicy(settings.localStoragePolicy))
      .catch(() => showToast(translate('settings.storageDrafts.error'), 'error'))
      .finally(() => setBusy(false));
  }, [refreshUsage]);

  const updatePolicy = useCallback(async (patch: Partial<LocalStoragePolicy>) => {
    setBusy(true);
    try {
      const next = await patchSettings({ localStoragePolicy: patch });
      setPolicy(next.localStoragePolicy);
    } catch {
      showToast(translate('settings.storageDrafts.error'), 'error');
    } finally {
      setBusy(false);
    }
  }, []);

  const runCleanup = useCallback(
    async (includeUnexpired: boolean) => {
      setBusy(true);
      try {
        const result = await cleanupDrafts({ includeUnexpired, policy });
        await refreshUsage();
        const message = translate('settings.storageDrafts.cleanupDone').replace(
          '{count}',
          String(result.deletedCount)
        );
        showToast(message, 'success');
      } catch {
        showToast(translate('settings.storageDrafts.error'), 'error');
      } finally {
        setBusy(false);
      }
    },
    [policy, refreshUsage]
  );

  return { busy, policy, runCleanup, updatePolicy, usage };
}
