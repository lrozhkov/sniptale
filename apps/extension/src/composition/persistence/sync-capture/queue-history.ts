import type { IDBPTransaction } from 'idb';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { initDB } from '../infrastructure/indexed-db/core';
import { SYNC_CAPTURE_STORE, SYNC_OUTBOX_STORE } from '../infrastructure/indexed-db/core.stores';
import {
  isActivePersistenceMutationPermit,
  type PersistenceMutationPermit,
} from '../infrastructure/mutation-barrier';
import { readSyncQueueSourceInTransaction } from './queue';
import {
  parseSyncQueueScope,
  parseSyncQueueConnection,
  queueIdentity,
  queueOrdinal,
  queueHash,
  queueConnectionKey,
  queueOperationKey,
  type SyncQueueScope,
  type SyncQueueConnection,
  type SyncQueueOperation,
} from './queue-model';

type QueueTransaction = IDBPTransaction<unknown, string[], 'readwrite' | 'readonly'>;
function scopeInput(value: unknown): SyncQueueScope {
  const scope = parseSyncQueueScope(structuredClone(value));
  if (!scope) throw new Error('Invalid sync queue scope.');
  return scope;
}
/** Select one native transition stream without disclosing its storage key. */
export type SyncQueueHistorySource =
  | { kind: 'connection' }
  | { kind: 'operation'; operationId: string };
/** Detached delivery selection. Sequence gaps count markers outside bounded retention. */
export interface SyncQueueHistoryBatch {
  scope: SyncQueueScope;
  source: SyncQueueHistorySource;
  sourceRef: string;
  deliveredSequence: number;
  throughSequence: number;
  skipped: number;
  transitions: SyncQueueOperation['pendingTransitions'];
}
function historySourceInput(value: unknown): SyncQueueHistorySource {
  const source: unknown = structuredClone(value);
  if (isRecord(source)) {
    if (source['kind'] === 'connection') return { kind: 'connection' };
    if (source['kind'] === 'operation' && queueIdentity(source['operationId']))
      return { kind: 'operation', operationId: source['operationId'] };
  }
  throw new Error('Invalid sync queue history source.');
}
function historySourceRef(scope: SyncQueueScope, source: SyncQueueHistorySource): string {
  return queueHash(
    source.kind === 'connection'
      ? queueConnectionKey(scope)
      : queueOperationKey(scope, source.operationId)
  );
}
function historyCursorKey(sourceRef: string): string {
  return JSON.stringify(['queue-history-delivery-v1', sourceRef]);
}
async function readHistorySource(
  tx: QueueTransaction,
  scope: SyncQueueScope,
  source: SyncQueueHistorySource
): Promise<SyncQueueConnection | SyncQueueOperation> {
  return source.kind === 'connection'
    ? readSyncQueueSourceInTransaction(tx, scope, null)
    : readSyncQueueSourceInTransaction(tx, scope, source.operationId);
}
/** Invalid persisted delivery progress; source evidence must remain unchanged. */
export class InvalidSyncQueueHistoryProgressError extends Error {
  constructor() {
    super('Invalid sync queue history cursor.');
  }
}
/** Read and validate canonical delivery progress inside the caller-owned transaction. */
export async function readSyncQueueHistoryProgressInTransaction(
  tx: QueueTransaction,
  sourceRef: string,
  eventSequence: number
): Promise<number> {
  const key = historyCursorKey(sourceRef);
  const raw: unknown = await tx.objectStore(SYNC_OUTBOX_STORE).get(key);
  if (raw === undefined) return 0;
  if (
    !isRecord(raw) ||
    raw['version'] !== 1 ||
    raw['kind'] !== 'queue-history-delivery' ||
    raw['key'] !== key ||
    raw['sourceRef'] !== sourceRef ||
    !queueOrdinal(raw['deliveredSequence']) ||
    raw['deliveredSequence'] > eventSequence
  )
    throw new InvalidSyncQueueHistoryProgressError();
  return raw['deliveredSequence'];
}
function historyBatchInput(value: unknown): SyncQueueHistoryBatch {
  const raw: unknown = structuredClone(value);
  if (!isRecord(raw)) throw new Error('Invalid sync queue history batch.');
  const scope = scopeInput(raw['scope']);
  const source = historySourceInput(raw['source']);
  if (
    typeof raw['sourceRef'] !== 'string' ||
    raw['sourceRef'] !== historySourceRef(scope, source) ||
    !queueOrdinal(raw['deliveredSequence']) ||
    !queueOrdinal(raw['throughSequence']) ||
    !queueOrdinal(raw['skipped']) ||
    raw['throughSequence'] < raw['deliveredSequence'] ||
    !Number.isSafeInteger(raw['deliveredSequence'] + raw['skipped'])
  )
    throw new Error('Invalid sync queue history batch.');
  // Reuse the native marker parser for fixed codes, bounds and contiguous sequence validation.
  const history = parseSyncQueueConnection({
    ...scope,
    version: 1,
    kind: 'queue-connection',
    key: queueConnectionKey(scope),
    revision: 0,
    paused: false,
    eventSequence: raw['throughSequence'],
    droppedTransitions: raw['deliveredSequence'] + raw['skipped'],
    pendingTransitions: raw['transitions'],
  });
  if (!history) throw new Error('Invalid sync queue history batch.');
  return {
    scope,
    source,
    sourceRef: raw['sourceRef'],
    deliveredSequence: raw['deliveredSequence'],
    throughSequence: raw['throughSequence'],
    skipped: raw['skipped'],
    transitions: history.pendingTransitions,
  };
}
/** Read a bounded undelivered suffix without creating or repairing persisted rows. */
export async function loadSyncQueueHistoryBatch(
  value: SyncQueueScope,
  selectedSource: SyncQueueHistorySource,
  permit?: PersistenceMutationPermit
): Promise<SyncQueueHistoryBatch> {
  const scope = scopeInput(value);
  const source = historySourceInput(selectedSource);
  const sourceRef = historySourceRef(scope, source);
  const db = await initDB(permit);
  const tx = db.transaction([SYNC_CAPTURE_STORE, SYNC_OUTBOX_STORE], 'readonly');
  const row = await readHistorySource(tx, scope, source);
  const deliveredSequence = await readSyncQueueHistoryProgressInTransaction(
    tx,
    sourceRef,
    row.eventSequence
  );
  await tx.done;
  return {
    scope,
    source,
    sourceRef,
    deliveredSequence,
    throughSequence: row.eventSequence,
    skipped: Math.max(0, row.droppedTransitions - deliveredSequence),
    transitions: row.pendingTransitions.filter((item) => item.sequence > deliveredSequence),
  };
}
/** Advance only confirmed delivery under the caller's still-active erasure admission. */
export async function acknowledgeSyncQueueHistory(
  value: SyncQueueHistoryBatch,
  permit: PersistenceMutationPermit
): Promise<void> {
  const batch = historyBatchInput(value);
  if (!isActivePersistenceMutationPermit(permit))
    throw new Error('Sync queue history mutation permit required.');
  const db = await initDB(permit);
  if (!isActivePersistenceMutationPermit(permit))
    throw new Error('Sync queue history mutation permit required.');
  const tx = db.transaction([SYNC_CAPTURE_STORE, SYNC_OUTBOX_STORE], 'readwrite');
  try {
    const row = await readHistorySource(tx, batch.scope, batch.source);
    if (
      queueHash(row.key) !== batch.sourceRef ||
      batch.throughSequence > row.eventSequence ||
      (batch.skipped > 0 && batch.deliveredSequence + batch.skipped > row.droppedTransitions)
    )
      throw new Error('Sync queue history source changed.');
    for (const selected of batch.transitions) {
      const retained = row.pendingTransitions.find((item) => item.sequence === selected.sequence);
      if (retained && JSON.stringify(retained) !== JSON.stringify(selected))
        throw new Error('Sync queue history source changed.');
    }
    const current = await readSyncQueueHistoryProgressInTransaction(
      tx,
      batch.sourceRef,
      row.eventSequence
    );
    if (batch.deliveredSequence > current) throw new Error('Sync queue history cursor changed.');
    if (!isActivePersistenceMutationPermit(permit))
      throw new Error('Sync queue history mutation permit required.');
    if (batch.throughSequence > current) {
      await tx.objectStore(SYNC_OUTBOX_STORE).put({
        version: 1,
        kind: 'queue-history-delivery',
        key: historyCursorKey(batch.sourceRef),
        sourceRef: batch.sourceRef,
        deliveredSequence: batch.throughSequence,
      });
    }
    await tx.done;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* The transaction can already be closed. */
    }
    await tx.done.catch(() => undefined);
    throw error;
  }
}
