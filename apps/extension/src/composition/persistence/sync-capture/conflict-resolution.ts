import type { IDBPTransaction } from 'idb';
import { capturePreparedDatabase } from '../infrastructure/indexed-db/core';
import {
  SYNC_CAPTURE_STORE,
  SYNC_CONNECTION_STORE,
  SYNC_OUTBOX_STORE,
} from '../infrastructure/indexed-db/core.stores';
import { runWithPersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import { checkSyncConnectionAdmission } from '../remote-connection/store';
import {
  parseSyncConnectionIdentity,
  type SyncConnectionIdentity,
} from '../remote-connection/model';
import {
  captureRootKey,
  type CaptureRootKind,
  type CaptureOperation,
  type PreparedCaptureOperation,
} from './contracts';
import { parseSyncCaptureRecord, hashCaptureText } from './guards';
import { storePreparedOutgoingInTransaction } from './outgoing';
import { enqueueSyncQueueCaptureInTransaction, readSyncQueueSourceInTransaction } from './queue';
import { parseSyncQueueScope, queueIdentity, queueUuid, type SyncQueueScope } from './queue-model';

type Selection = {
  scope: SyncQueueScope;
  authorization: SyncConnectionIdentity;
  rootKind: CaptureRootKind;
  rootId: string;
  operationId: string;
};
type Transaction = IDBPTransaction<unknown, string[], 'readonly' | 'readwrite'>;
const stores = [SYNC_CAPTURE_STORE, SYNC_CONNECTION_STORE, SYNC_OUTBOX_STORE];
function key(spaceId: string, operationId: string) {
  return JSON.stringify(['resolution', spaceId, operationId]);
}
function checkedSelection(input: Selection): Selection {
  const selected = structuredClone(input);
  const scope = parseSyncQueueScope(selected.scope);
  const authorization = parseSyncConnectionIdentity(selected.authorization);
  if (
    !scope ||
    !authorization ||
    !queueUuid(selected.operationId) ||
    !queueIdentity(selected.rootId) ||
    !['media', 'video-review', 'video-project', 'scenario-project'].includes(selected.rootKind)
  )
    throw new Error('Invalid conflict resolution selection.');
  return { ...selected, scope, authorization };
}
async function context(tx: Transaction, selection: Selection) {
  await checkSyncConnectionAdmission(tx, selection.scope, selection.authorization);
  const profile = parseSyncCaptureRecord(await tx.objectStore(SYNC_CAPTURE_STORE).get('profile'));
  if (
    !profile ||
    profile.kind !== 'profile' ||
    !profile.enabled ||
    profile.createdAt !== selection.scope.profileCreatedAt ||
    profile.spaceId !== selection.scope.spaceId ||
    profile.connectionGeneration !== selection.scope.connectionGeneration
  )
    throw new Error('Conflict resolution enrollment changed.');
  const connection = await readSyncQueueSourceInTransaction(tx, selection.scope, null);
  if (connection.kind !== 'queue-connection' || connection.paused)
    throw new Error('Conflict resolution paused.');
  const rootKey = captureRootKey(selection.scope.spaceId, selection.rootKind, selection.rootId);
  const stateKey = JSON.stringify(['root-state', rootKey]);
  const raw: unknown = await tx.objectStore(SYNC_CAPTURE_STORE).get(stateKey);
  const state = raw === undefined ? null : parseSyncCaptureRecord(raw);
  if (
    raw !== undefined &&
    (!state || state.kind !== 'root-state' || state.key !== stateKey || state.rootKey !== rootKey)
  )
    throw new Error('Invalid conflict resolution root.');
  const rawOperation: unknown = await tx
    .objectStore(SYNC_CAPTURE_STORE)
    .get(key(selection.scope.spaceId, selection.operationId));
  const operation = rawOperation === undefined ? null : parseSyncCaptureRecord(rawOperation);
  if (
    rawOperation !== undefined &&
    (!operation ||
      operation.kind !== 'sync-operation' ||
      operation.key !== key(selection.scope.spaceId, selection.operationId) ||
      operation.rootKey !== rootKey ||
      operation.operationId !== selection.operationId ||
      operation.profileCreatedAt !== selection.scope.profileCreatedAt ||
      operation.connectionGeneration !== selection.scope.connectionGeneration)
  )
    throw new Error('Invalid retained conflict resolution.');
  return {
    generation: state?.kind === 'root-state' ? state.generation : 0,
    basis: state?.kind === 'root-state' ? state.basis : [],
    existing: operation?.kind === 'sync-operation' ? operation : null,
  };
}

/** Read only native ordering and a replay receipt; originals need not be resident. */
export async function loadConflictResolutionContext(input: Selection) {
  const db = capturePreparedDatabase();
  const selection = checkedSelection(input);
  if (!db) throw new Error('Conflict resolution storage unavailable.');
  const tx = db.transaction(stores, 'readonly');
  const value = await context(tx, selection);
  await tx.done;
  return value;
}

/** Atomically admit one finite decision into the existing prepared payload and queue. */
export async function commitConflictResolution(
  input: Selection & {
    expectedGeneration: number;
    expectedBasis: readonly string[];
    operation: PreparedCaptureOperation;
  }
): Promise<CaptureOperation> {
  const db = capturePreparedDatabase();
  const selected = structuredClone(input);
  const selection = checkedSelection(selected);
  const operation = parseSyncCaptureRecord(selected.operation);
  if (
    !db ||
    !operation ||
    operation.kind !== 'sync-operation' ||
    operation.phase !== 'prepared' ||
    operation.key !== key(selection.scope.spaceId, selection.operationId) ||
    operation.operationId !== selection.operationId ||
    operation.rootKey !==
      captureRootKey(selection.scope.spaceId, selection.rootKind, selection.rootId) ||
    operation.spaceId !== selection.scope.spaceId ||
    operation.rootKind !== selection.rootKind ||
    operation.rootId !== selection.rootId ||
    operation.profileCreatedAt !== selection.scope.profileCreatedAt ||
    operation.connectionGeneration !== selection.scope.connectionGeneration ||
    operation.prepared.retainedObjects === undefined ||
    operation.prepared.objects.length !== 0 ||
    operation.sourceSha256 !== hashCaptureText(operation.prepared.recordText)
  )
    throw new Error('Invalid conflict resolution operation.');
  return runWithPersistenceMutationPermit(async () => {
    const tx = db.transaction(stores, 'readwrite');
    try {
      const current = await context(tx, selection);
      if (current.existing) {
        if (current.existing.sourceSha256 !== operation.sourceSha256)
          throw new Error('Conflict resolution identity reused.');
        await tx.done;
        return current.existing;
      }
      if (
        current.generation !== selected.expectedGeneration ||
        operation.generation !== current.generation + 1 ||
        JSON.stringify(current.basis) !== JSON.stringify(selected.expectedBasis)
      )
        throw new Error('Conflict resolution native selection changed.');
      await storePreparedOutgoingInTransaction(tx, operation);
      await enqueueSyncQueueCaptureInTransaction(tx, operation);
      // The native root is unchanged. Only checked incoming publication may replace its bytes/basis.
      await tx.done;
      return operation;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* Transaction can already be closed. */
      }
      await tx.done.catch(() => undefined);
      throw error;
    }
  });
}

/** The resolution owner issues this exact capture identity independently from file mappings. */
export function isConflictResolutionPrepared(
  prepared: Pick<
    import('./outgoing').PreparedOutgoingOperation,
    'captureKey' | 'spaceId' | 'operationId'
  >
): boolean {
  return prepared.captureKey === key(prepared.spaceId, prepared.operationId);
}

/** Refuse a stale decision before publishing; native publication still repeats its own CAS. */
export async function assertConflictResolutionCurrent(
  prepared: import('./outgoing').PreparedOutgoingOperation
): Promise<void> {
  if (!isConflictResolutionPrepared(prepared)) return;
  const db = capturePreparedDatabase();
  if (!db) throw new Error('Conflict resolution storage unavailable.');
  const tx = db.transaction([SYNC_CAPTURE_STORE], 'readonly');
  const raw: unknown = await tx
    .objectStore(SYNC_CAPTURE_STORE)
    .get(JSON.stringify(['root-state', prepared.rootKey]));
  const state = raw === undefined ? null : parseSyncCaptureRecord(raw);
  await tx.done;
  if (
    (raw !== undefined &&
      (!state || state.kind !== 'root-state' || state.rootKey !== prepared.rootKey)) ||
    (state?.kind === 'root-state' ? state.generation : 0) !== prepared.generation - 1
  )
    throw Object.assign(new Error('Conflict resolution native selection changed.'), {
      code: 'selection-changed',
    });
}
