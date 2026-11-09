import type { DatabaseMigrationSource, UpgradeTransaction } from './upgrade/types';

export const SYNC_CAPTURE_SCOPE_PHASE_INDEX = 'syncCaptureScopePhase';
export const SYNC_PENDING_SCOPE_DUE_INDEX = 'syncPendingScopeDue';
export const SYNC_QUEUE_SCOPE_STATUS_INDEX = 'syncQueueScopeStatus';

/** Native projections contain keys only. IndexedDB populates them without source rewrites. */
export const SYNC_QUEUE_SUMMARY_INDEXES = [
  {
    storeName: 'sync_capture',
    indexName: SYNC_CAPTURE_SCOPE_PHASE_INDEX,
    keyPath: ['kind', 'phase', 'spaceId', 'connectionGeneration', 'profileCreatedAt'],
  },
  {
    storeName: 'sync_capture',
    indexName: SYNC_PENDING_SCOPE_DUE_INDEX,
    keyPath: ['kind', 'spaceId', 'connectionGeneration', 'profileCreatedAt', 'dueAt'],
  },
  {
    storeName: 'sync_outbox',
    indexName: SYNC_QUEUE_SCOPE_STATUS_INDEX,
    keyPath: ['kind', 'status', 'spaceId', 'connectionGeneration', 'profileCreatedAt'],
  },
] as const;

type IndexStore = {
  createIndex?: (name: string, keyPath: string | string[], options?: IDBIndexParameters) => unknown;
};

/** Fresh databases use the same index definitions as released versionchange upgrades. */
export function installSyncQueueSummaryStoreIndexes(
  storeName: string,
  store: IndexStore
): undefined {
  for (const definition of SYNC_QUEUE_SUMMARY_INDEXES) {
    if (definition.storeName !== storeName) continue;
    if (!store.createIndex) throw new Error('Sync queue summary index creation is unavailable.');
    store.createIndex(definition.indexName, [...definition.keyPath], { unique: false });
  }
  return undefined;
}

/** The native versionchange transaction owns population and rollback of all three indexes. */
export function installSyncQueueSummaryIndexes(transaction: UpgradeTransaction): undefined {
  for (const storeName of ['sync_capture', 'sync_outbox'])
    installSyncQueueSummaryStoreIndexes(storeName, transaction.objectStore(storeName));
  return undefined;
}

/**
 * Reserve 16 KiB per indexed category entry plus a 64 KiB schema baseline.
 * Canonical capture primary keys are at most 2048 UTF-16 units; queue keys are below 3200.
 * Scope fields, escaped tuple keys and structural reserve fit an 8 KiB logical entry budget.
 * Doubling that budget is conservative admission, not a physical-size or corrupt-row promise.
 */
export async function estimateSyncQueueSummaryIndexBytes(
  source?: DatabaseMigrationSource
): Promise<number> {
  if (!source) throw new Error('Sync queue summary migration requires source counts.');
  const captures = source.transaction('sync_capture', 'readonly').store;
  const outbox = source.transaction('sync_outbox', 'readonly').store;
  const kinds = captures.index?.('kind');
  if (!kinds?.count || !outbox.count)
    throw new Error('Sync queue summary migration source counts are unavailable.');
  const prefix = 'queue-operation-v1:';
  const counts = await Promise.all([
    kinds.count('sync-operation'),
    kinds.count('pending-checkpoint'),
    outbox.count(IDBKeyRange.bound(prefix, 'queue-operation-v1;', false, true)),
  ]);
  if (counts.some((count) => !Number.isSafeInteger(count) || count < 0))
    throw new Error('Sync queue summary migration source count is invalid.');
  const entries = counts.reduce((sum, count) => sum + count, 0);
  const bytes = 64 * 1024 + entries * 16 * 1024;
  if (!Number.isSafeInteger(entries) || !Number.isSafeInteger(bytes))
    throw new Error('Sync queue summary migration estimate exceeds the safe range.');
  return bytes;
}
