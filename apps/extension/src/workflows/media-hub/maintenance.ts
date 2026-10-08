import { publishMediaHubLibraryChanged } from '../../features/media-hub/events';
import { createLogger } from '@sniptale/platform/observability/logger';
import { runStorageStartupPhase } from '../../composition/persistence/infrastructure/startup-diagnostics';

const logger = createLogger({ namespace: 'LibraryAssetMaintenance' });
/** Cancellable housekeeping runs after rendering; never join it from capture or snapshot reads. */
export async function maintainLibraryAssets(
  signal: AbortSignal,
  onTrashCleanupFailure?: () => void
): Promise<void> {
  const steps = [
    async () => {
      const { maintainProvenanceUrls } =
        await import('../../composition/persistence/infrastructure/indexed-db/maintenance/provenance');
      if (!signal.aborted)
        await runStorageStartupPhase('database-url-maintenance', () =>
          maintainProvenanceUrls(signal)
        );
    },
    async () => {
      const { backfillScenarioLibraryAssets } =
        await import('../../composition/persistence/scenario/library-publication');
      if (
        !signal.aborted &&
        (await runStorageStartupPhase('gallery-scenario-backfill', backfillScenarioLibraryAssets)) >
          0
      )
        publishMediaHubLibraryChanged('sync', []);
    },
    async () => {
      const [{ loadSettings }, { cleanupDrafts }] = await Promise.all([
        import('../../composition/persistence/settings'),
        import('../../composition/persistence/library-lifecycle/cleanup'),
      ]);
      const settings = await loadSettings();
      if (signal.aborted) return;
      const result = await runStorageStartupPhase('gallery-draft-cleanup', () =>
        cleanupDrafts({ policy: settings.localStoragePolicy, signal })
      );
      if (result.deletedCount > 0) publishMediaHubLibraryChanged('cleanup', result.deletedIds);
    },
    async () => {
      const [{ loadSettings }, { cleanupLibraryTrash }] = await Promise.all([
        import('../../composition/persistence/settings'),
        import('./trash'),
      ]);
      const settings = await loadSettings();
      if (signal.aborted) return;
      const result = await runStorageStartupPhase('gallery-trash-cleanup', () =>
        cleanupLibraryTrash(settings.localStoragePolicy, Date.now(), signal)
      ).catch(() => ({ failedCount: 1 }));
      if (!signal.aborted && result.failedCount > 0) onTrashCleanupFailure?.();
    },
    async () => {
      const { recoverPendingAssetPublications } =
        await import('../../composition/persistence/asset-publication-recovery');
      if (!signal.aborted && (await recoverPendingAssetPublications()) > 0)
        publishMediaHubLibraryChanged('sync', []);
    },
    async () => {
      const { collectOrphanAssetObjectsDuringIdle } =
        await import('../../composition/persistence/asset-publication-recovery/audit');
      if (!signal.aborted) await collectOrphanAssetObjectsDuringIdle(signal);
    },
  ];
  for (const step of steps) {
    await new Promise<void>((resolve) => setTimeout(resolve, 16));
    if (signal.aborted) return;
    try {
      await step();
    } catch {
      if (!signal.aborted) logger.debug('Library maintenance deferred');
    }
  }
}
