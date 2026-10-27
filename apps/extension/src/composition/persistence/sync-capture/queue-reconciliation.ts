import type { IDBPTransaction } from 'idb';
import { capturePreparedDatabase } from '../infrastructure/indexed-db/core';
import {
  SYNC_CAPTURE_STORE,
  SYNC_CONNECTION_STORE,
  SYNC_OUTBOX_STORE,
} from '../infrastructure/indexed-db/core.stores';
import { runWithPersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import {
  parseSyncConnectionIdentity,
  type SyncConnectionIdentity,
} from '../remote-connection/model';
import { checkSyncConnectionAdmission } from '../remote-connection/store';
import { MAX_PENDING_CAPTURES } from './contracts';
import { parseSyncCaptureRecord } from './guards';
import { requireSyncQueueScopeInTransaction, enqueueSyncQueueCaptureInTransaction } from './queue';
import { parseSyncQueueScope, type SyncQueueScope } from './queue-model';
type QueueTransaction = IDBPTransaction<unknown, string[], 'readwrite' | 'readonly'>;
async function abortQueueTransaction(tx: QueueTransaction): Promise<void> {
  try {
    tx.abort();
  } catch {
    /* The transaction can already be closed. */
  }
  await tx.done.catch(() => undefined);
}
async function requireReconciliationAdmission(
  tx: QueueTransaction,
  scope: SyncQueueScope,
  authorization: SyncConnectionIdentity
): Promise<void> {
  await requireSyncQueueScopeInTransaction(tx, scope);
  const profile = parseSyncCaptureRecord(await tx.objectStore(SYNC_CAPTURE_STORE).get('profile'));
  if (!profile || profile.kind !== 'profile' || !profile.enabled)
    throw new Error('Sync capture profile disabled.');
  await checkSyncConnectionAdmission(tx, scope, authorization);
}
/** Reconcile bounded retained captures under current enrollment without transport or source writes. */
export async function reconcileSyncQueueCaptures(
  scopeInputValue: unknown,
  authorizationInput: unknown
): Promise<{ enqueued: number; existing: number; refused: number }> {
  // Capture before any wait. Erasure closes this handle; this command must never reopen it.
  const db = capturePreparedDatabase();
  const scope = parseSyncQueueScope(structuredClone(scopeInputValue));
  if (!scope) throw new Error('Invalid sync queue scope.');
  const authorization = parseSyncConnectionIdentity(structuredClone(authorizationInput));
  if (!db || !authorization) throw new Error('Sync capture reconciliation refused.');
  return runWithPersistenceMutationPermit(async () => {
    const discovery = db.transaction([SYNC_CAPTURE_STORE, SYNC_CONNECTION_STORE], 'readonly');
    let keys: unknown[];
    try {
      await requireReconciliationAdmission(discovery, scope, authorization);
      keys = await discovery
        .objectStore(SYNC_CAPTURE_STORE)
        .index('kind')
        .getAllKeys('captured-change', MAX_PENDING_CAPTURES + 1);
      await discovery.done;
    } catch (error) {
      await abortQueueTransaction(discovery);
      throw error;
    }
    if (keys.length > MAX_PENDING_CAPTURES) throw new Error('Sync capture reconciliation limit.');
    const result = { enqueued: 0, existing: 0, refused: 0 };
    for (const key of keys) {
      if (typeof key !== 'string') {
        result.refused += 1;
        continue;
      }
      let tx: IDBPTransaction<unknown, string[], 'readwrite'> | null = null;
      try {
        tx = db.transaction(
          [SYNC_CAPTURE_STORE, SYNC_OUTBOX_STORE, SYNC_CONNECTION_STORE],
          'readwrite'
        );
        await requireReconciliationAdmission(tx, scope, authorization);
        const capture = parseSyncCaptureRecord(await tx.objectStore(SYNC_CAPTURE_STORE).get(key));
        if (
          !capture ||
          capture.kind !== 'captured-change' ||
          capture.key !== key ||
          capture.spaceId !== scope.spaceId ||
          capture.connectionGeneration !== scope.connectionGeneration
        )
          throw new Error('Invalid sync queue capture.');
        const admission = await enqueueSyncQueueCaptureInTransaction(tx, capture);
        await tx.done;
        if (admission.existing) result.existing += 1;
        else result.enqueued += 1;
      } catch {
        if (tx) await abortQueueTransaction(tx);
        // One refused source must not suppress independent retained captures.
        result.refused += 1;
      }
    }
    return result;
  });
}
