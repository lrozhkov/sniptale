import { initDB } from '../../composition/persistence/infrastructure/indexed-db/core';
import { tryRunWithPersistenceMutationPermit } from '../../composition/persistence/infrastructure/mutation-barrier';
import { createRuntimeLog } from '../../composition/persistence/diagnostics/runtime-log';
import type { RuntimeLogEntry } from '../../composition/persistence/diagnostics/model';
import {
  acknowledgeSyncQueueHistory,
  loadSyncQueueHistoryBatch,
  type SyncQueueHistoryBatch,
  type SyncQueueHistorySource,
} from '../../composition/persistence/sync-capture/queue-history';
import type { SyncQueueScope } from '../../composition/persistence/sync-capture/queue-model';

function journalRows(batch: SyncQueueHistoryBatch, time: string): RuntimeLogEntry[] {
  const entry = (
    message: string,
    level: RuntimeLogEntry['level'],
    dropped = 0
  ): RuntimeLogEntry => ({
    schemaVersion: 1,
    time,
    lastTime: time,
    source: 'SyncQueue',
    context: 'sync-delivery',
    message,
    level,
    repeats: 1,
    dropped,
  });
  const rows = batch.transitions.map((transition) =>
    entry(
      `sync.${transition.code} stage=${transition.stage} ` +
        `eventRef=${batch.sourceRef}:${transition.sequence} attemptRef=${transition.attemptId ?? 'none'}`,
      transition.code === 'failed' || transition.code === 'interrupted' ? 'warn' : 'info'
    )
  );
  if (batch.skipped > 0)
    rows.unshift(
      entry(
        `sync.history-gap eventRef=${batch.sourceRef}:${batch.deliveredSequence + batch.skipped}:gap ` +
          `missing=${batch.skipped}`,
        'warn',
        Math.min(1_000_000_000, batch.skipped)
      )
    );
  return rows;
}

/** Publish at least once, then acknowledge. Failure retains native markers for a later attempt. */
export async function deliverSyncQueueHistory(
  scope: SyncQueueScope,
  source: SyncQueueHistorySource
): Promise<boolean> {
  const selection = structuredClone({ scope, source });
  try {
    // Cold database admission precedes the shared mutation permit.
    await initDB();
    const result = await tryRunWithPersistenceMutationPermit(async (permit) => {
      const batch = await loadSyncQueueHistoryBatch(selection.scope, selection.source, permit);
      if (batch.throughSequence === batch.deliveredSequence) return true;
      const rows = journalRows(batch, new Date().toISOString());
      if (!(await createRuntimeLog().appendConfirmed(rows, permit))) return false;
      await acknowledgeSyncQueueHistory(batch, permit);
      return true;
    });
    return result === true;
  } catch {
    return false;
  }
}
