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
  sameSyncConnectionIdentity,
  type SyncConnectionIdentity,
} from '../remote-connection/model';
import { checkSyncConnectionAdmission } from '../remote-connection/store';
import { parseSyncCaptureRecord } from './guards';
import {
  requireSyncQueueScopeInTransaction,
  enqueueSyncQueueCaptureInTransaction,
  readSyncQueueSourceInTransaction,
} from './queue';
import {
  parseSyncQueueScope,
  type SyncQueueScope,
  type SyncQueueCaptureProgress,
} from './queue-model';
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
function sameProgress(
  left: SyncQueueCaptureProgress | undefined,
  right: SyncQueueCaptureProgress | undefined
): boolean {
  if (!left || !right) return left === right;
  return (
    left.revision === right.revision &&
    sameSyncConnectionIdentity(left.authorization, right.authorization) &&
    (left.afterKey === null
      ? right.afterKey === null
      : right.afterKey !== null && IDBKeyRange.only(left.afterKey).includes(right.afterKey))
  );
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
    const discovery = db.transaction(
      [SYNC_CAPTURE_STORE, SYNC_CONNECTION_STORE, SYNC_OUTBOX_STORE],
      'readonly'
    );
    let keys: IDBValidKey[];
    let previous: SyncQueueCaptureProgress | undefined;
    try {
      await requireReconciliationAdmission(discovery, scope, authorization);
      const connection = await readSyncQueueSourceInTransaction(discovery, scope, null);
      if (connection.kind !== 'queue-connection') throw new Error('Invalid sync queue connection.');
      previous = connection.captureProgress;
      const afterKey =
        previous && sameSyncConnectionIdentity(previous.authorization, authorization)
          ? previous.afterKey
          : null;
      keys = await discovery
        .objectStore(SYNC_CAPTURE_STORE)
        .getAllKeys(afterKey === null ? undefined : IDBKeyRange.lowerBound(afterKey, true), 65);
      await discovery.done;
    } catch (error) {
      await abortQueueTransaction(discovery);
      throw error;
    }
    const result = { enqueued: 0, existing: 0, refused: 0 };
    const page = keys.slice(0, 64);
    for (const key of page) {
      let tx: IDBPTransaction<unknown, string[], 'readwrite'> | null = null;
      try {
        tx = db.transaction(
          [SYNC_CAPTURE_STORE, SYNC_OUTBOX_STORE, SYNC_CONNECTION_STORE],
          'readwrite'
        );
        await requireReconciliationAdmission(tx, scope, authorization);
        const capture = parseSyncCaptureRecord(await tx.objectStore(SYNC_CAPTURE_STORE).get(key));
        if (!capture) throw new Error('Invalid sync queue capture.');
        if (capture.kind !== 'sync-operation') {
          await tx.done;
          continue;
        }
        if (
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
    // Item admissions are already committed. Progress failure leaves them available for retry.
    const progressTx = db.transaction(
      [SYNC_CAPTURE_STORE, SYNC_CONNECTION_STORE, SYNC_OUTBOX_STORE],
      'readwrite'
    );
    try {
      await requireReconciliationAdmission(progressTx, scope, authorization);
      const connection = await readSyncQueueSourceInTransaction(progressTx, scope, null);
      if (connection.kind !== 'queue-connection') throw new Error('Invalid sync queue connection.');
      if (!sameProgress(previous, connection.captureProgress)) {
        await progressTx.done;
        return result;
      }
      const revision = (previous?.revision ?? 0) + 1;
      if (!Number.isSafeInteger(revision)) throw new Error('Sync capture progress exhausted.');
      await progressTx.objectStore(SYNC_OUTBOX_STORE).put({
        ...connection,
        captureProgress: {
          authorization,
          revision,
          afterKey: keys.length > 64 ? page[page.length - 1]! : null,
        },
      });
      await progressTx.done;
    } catch (error) {
      await abortQueueTransaction(progressTx);
      throw error;
    }
    return result;
  });
}
