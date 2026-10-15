import { createMaintenanceLog } from '../../composition/persistence/library-lifecycle/maintenance-log';
import type { MaintenanceLogOperation } from '../../composition/persistence/library-lifecycle/maintenance-log-model';
import { publishMediaHubLibraryChanged } from '../../features/media-hub/events';
import { createLogger } from '@sniptale/platform/observability/logger';
import { runStorageStartupPhase } from '../../composition/persistence/infrastructure/startup-diagnostics';
import { tryAssetResourceCleanup } from '../../composition/persistence/assets/resource-sessions';

const maintenanceLog = createMaintenanceLog();
const logger = createLogger({ namespace: 'LibraryAssetMaintenance' });
/** Cancellable housekeeping runs after rendering; never join it from capture or snapshot reads. */
export async function maintainLibraryAssets(
  signal: AbortSignal,
  onTrashCleanupFailure?: () => void
): Promise<void> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (!locks) {
    if (typeof chrome === 'undefined') await runLibraryMaintenance(signal, onTrashCleanupFailure);
    return;
  }
  await locks.request(
    'sniptale:library-maintenance',
    { mode: 'exclusive', ifAvailable: true },
    async (lock) => {
      if (lock) await runLibraryMaintenance(signal, onTrashCleanupFailure);
    }
  );
}

async function runLibraryMaintenance(
  signal: AbortSignal,
  onTrashCleanupFailure?: () => void
): Promise<void> {
  const steps: Array<[MaintenanceLogOperation, () => Promise<void>]> = [
    [
      'usage-index',
      async () => {
        const { maintainProjectUsageIndex } =
          await import('../../composition/persistence/media-library/usage-index-maintenance');
        if (await maintainProjectUsageIndex(signal)) publishMediaHubLibraryChanged('sync', []);
      },
    ],
    [
      'provenance',
      async () => {
        const { maintainProvenanceUrls } =
          await import('../../composition/persistence/infrastructure/indexed-db/maintenance/provenance');
        if (!signal.aborted)
          await runStorageStartupPhase('database-url-maintenance', () =>
            maintainProvenanceUrls(signal)
          );
      },
    ],
    [
      'scenario-backfill',
      async () => {
        const { backfillScenarioLibraryAssets } =
          await import('../../composition/persistence/scenario/library-publication');
        if (
          !signal.aborted &&
          (await runStorageStartupPhase(
            'gallery-scenario-backfill',
            backfillScenarioLibraryAssets
          )) > 0
        )
          publishMediaHubLibraryChanged('sync', []);
      },
    ],
    [
      'drafts',
      async () => {
        const [{ loadSettings }, { cleanupDrafts, DraftCleanupError }] = await Promise.all([
          import('../../composition/persistence/settings'),
          import('../../composition/persistence/library-lifecycle/cleanup'),
        ]);
        const settings = await loadSettings();
        if (signal.aborted) return;
        const result = await runStorageStartupPhase('gallery-draft-cleanup', () =>
          cleanupDrafts({ policy: settings.localStoragePolicy, signal })
        ).catch((error: unknown) => {
          if (error instanceof DraftCleanupError) {
            if (error.result.movedCount > 0)
              publishMediaHubLibraryChanged('cleanup', error.result.movedIds);
            void maintenanceLog.append({
              operation: 'drafts',
              code: 'failed',
              counts: {
                moved: error.result.movedCount,
                retained: error.result.retainedCount,
                failed: 1,
              },
            });
          }
          throw error;
        });
        if (result.movedCount > 0) {
          void maintenanceLog.append({
            operation: 'drafts',
            code: 'moved-to-trash',
            counts: { moved: result.movedCount, retained: result.retainedCount },
          });
          publishMediaHubLibraryChanged('cleanup', result.movedIds);
        }
      },
    ],
    [
      'trash',
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
        if (result.failedCount > 0) {
          if (!signal.aborted) onTrashCleanupFailure?.();
          throw new Error('Trash maintenance failed');
        }
      },
    ],
    [
      'publication-recovery',
      async () => {
        const { recoverPendingAssetPublications } =
          await import('../../composition/persistence/asset-publication-recovery');
        if (!signal.aborted && (await recoverPendingAssetPublications()) > 0)
          publishMediaHubLibraryChanged('sync', []);
      },
    ],
    [
      'orphans',
      async () => {
        const { collectOrphanAssetObjectsDuringIdle } =
          await import('../../composition/persistence/asset-publication-recovery/audit');
        if (!signal.aborted) await collectOrphanAssetObjectsDuringIdle(signal);
      },
    ],
  ];
  for (const [operation, step] of steps) {
    await new Promise<void>((resolve) => setTimeout(resolve, 16));
    if (signal.aborted) return;
    if (operation !== 'publication-recovery' && !(await tryAssetResourceCleanup(async () => true)))
      continue;
    const started = performance.now();
    void maintenanceLog.append({ operation, code: 'started' });
    try {
      await step();
      void maintenanceLog.append({
        operation,
        code: signal.aborted ? 'cancelled' : 'completed',
        durationMs: Math.round(performance.now() - started),
      });
    } catch {
      void maintenanceLog.append({
        operation,
        code: signal.aborted ? 'cancelled' : 'failed',
        durationMs: Math.round(performance.now() - started),
      });
      if (!signal.aborted) logger.debug('Library maintenance deferred');
      if (operation === 'drafts') return;
    }
  }
}
