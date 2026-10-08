import { createLogger } from '@sniptale/platform/observability/logger';
import { sanitizeDiagnosticData } from '@sniptale/platform/observability/diagnostics/sanitizer';

const logger = createLogger({ namespace: 'StorageStartup' });
const SLOW_PHASE_MS = 3000;

type StorageStartupPhase =
  | 'database-admission'
  | 'database-schema-check'
  | 'database-persistence-grant'
  | 'database-open'
  | 'database-url-maintenance'
  | 'asset-recovery'
  | 'asset-writing-cleanup'
  | 'asset-backup-recovery'
  | 'asset-operation-list'
  | 'asset-ready-journal-list'
  | 'asset-physical-delete-replay'
  | 'asset-retention-snapshot'
  | 'asset-publication-replay'
  | 'offscreen-data-admission'
  | 'offscreen-data-recovery'
  | 'recording-outbox-import'
  | 'recording-outbox-reconcile'
  | 'gallery-trash-cleanup'
  | 'gallery-lifecycle-repair'
  | 'gallery-scenario-backfill'
  | 'gallery-draft-cleanup'
  | 'gallery-media-list'
  | 'gallery-scenario-list'
  | 'gallery-thumbnail-list'
  | 'gallery-storage-estimate'
  | 'gallery-video-project-list'
  | 'gallery-presentations'
  | 'gallery-scenario-exports';

/** Trace slow storage work without adding extension errors or exposing stored values. */
export async function runStorageStartupPhase<T>(
  phase: StorageStartupPhase,
  operation: () => Promise<T>
): Promise<T> {
  const start = performance.now();
  const report = (status: 'pending' | 'completed' | 'failed') => {
    const durationMs = Math.min(86_400_000, Math.max(0, Math.round(performance.now() - start)));
    logger.debug(
      `Slow storage startup phase: ${phase} ${status} ${durationMs}ms`,
      sanitizeDiagnosticData({
        phase,
        status,
        durationMs,
      })
    );
  };
  const timer = setTimeout(() => report('pending'), SLOW_PHASE_MS);
  let status: 'completed' | 'failed' = 'failed';
  try {
    const result = await operation();
    status = 'completed';
    return result;
  } finally {
    clearTimeout(timer);
    if (performance.now() - start >= SLOW_PHASE_MS) report(status);
  }
}
