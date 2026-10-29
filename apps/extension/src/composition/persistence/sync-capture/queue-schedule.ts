import type { IDBPTransaction } from 'idb';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { capturePreparedDatabase, initDB } from '../infrastructure/indexed-db/core';
import { runWithPersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import {
  SYNC_CAPTURE_STORE,
  SYNC_CONNECTION_STORE,
  SYNC_OUTBOX_STORE,
} from '../infrastructure/indexed-db/core.stores';
import {
  parseSyncConnectionIdentity,
  sameSyncConnectionIdentity,
  type SyncConnectionIdentity,
} from '../remote-connection/model';
import { checkSyncConnectionAdmission } from '../remote-connection/store';
import { requireSyncQueueScopeInTransaction } from './queue';
import {
  parseSyncQueueScope,
  parseSyncQueueConnection,
  parseSyncQueueOperation,
  queueConnectionKey,
  queueOperationKey,
  queueOperationPrefix,
  queueOrdinal,
  queueNativeCursorKey,
  queueIdentity,
  queueUuid,
  sameQueueScope,
  queueRetrySchedule,
  type SyncQueueConnection,
  type SyncQueueOperation,
  type SyncQueueScope,
  type SyncQueueScheduleProgress,
} from './queue-model';

type ScheduleTransaction = IDBPTransaction<unknown, string[], 'readwrite' | 'readonly'>;
/** Exact scheduling evidence. Discovery does not grant permission to execute. */
export interface SyncQueueDueCandidate {
  scope: SyncQueueScope;
  authorization: SyncConnectionIdentity;
  operationId: string;
  revision: number;
  nextDueAt: number;
  runId: string | null;
  runAuthorization: SyncConnectionIdentity | null;
  status: SyncQueueOperation['status'];
}
function inputs(scopeInput: unknown, authorizationInput: unknown) {
  const scope = parseSyncQueueScope(structuredClone(scopeInput));
  const authorization = parseSyncConnectionIdentity(structuredClone(authorizationInput));
  if (!scope || !authorization) throw new Error('Invalid sync queue schedule.');
  return { scope, authorization };
}
function pageLimit(limit: number, maximum: number): void {
  if (!queueOrdinal(limit) || limit < 1 || limit > maximum)
    throw new Error('Invalid sync queue schedule limit.');
}
async function readConnection(
  tx: ScheduleTransaction,
  scope: SyncQueueScope
): Promise<SyncQueueConnection> {
  const raw: unknown = await tx.objectStore(SYNC_OUTBOX_STORE).get(queueConnectionKey(scope));
  if (raw === undefined)
    return {
      ...scope,
      version: 1,
      kind: 'queue-connection',
      key: queueConnectionKey(scope),
      revision: 0,
      paused: false,
      scheduleProgress: null,
      eventSequence: 0,
      pendingTransitions: [],
      droppedTransitions: 0,
    };
  const row = parseSyncQueueConnection(raw);
  if (!row || !sameQueueScope(row, scope)) throw new Error('Invalid sync queue connection.');
  return row;
}
function progressFor(
  connection: SyncQueueConnection,
  authorization: SyncConnectionIdentity
): SyncQueueScheduleProgress | null {
  const progress = connection.scheduleProgress;
  return progress && sameSyncConnectionIdentity(progress.authorization, authorization)
    ? progress
    : null;
}
function newProgress(authorization: SyncConnectionIdentity): SyncQueueScheduleProgress {
  return { authorization, revision: 0, afterKey: null, complete: false, dueAfter: null };
}
function advanceProgress(progress: SyncQueueScheduleProgress): SyncQueueScheduleProgress {
  if (!Number.isSafeInteger(progress.revision + 1))
    throw new Error('Sync queue schedule revision exhausted.');
  return { ...progress, revision: progress.revision + 1 };
}
async function mutate<T>(
  scope: SyncQueueScope,
  authorization: SyncConnectionIdentity,
  operation: (
    tx: IDBPTransaction<unknown, string[], 'readwrite'>,
    connection: SyncQueueConnection
  ) => Promise<T>
): Promise<T> {
  // Erasure closes this captured handle. Delayed work cannot reopen a replacement database.
  const db = capturePreparedDatabase();
  if (!db) throw new Error('Sync queue schedule database is not prepared.');
  return runWithPersistenceMutationPermit(async () => {
    const tx = db.transaction(
      [SYNC_CAPTURE_STORE, SYNC_CONNECTION_STORE, SYNC_OUTBOX_STORE],
      'readwrite'
    );
    try {
      await requireSyncQueueScopeInTransaction(tx, scope);
      await checkSyncConnectionAdmission(tx, scope, authorization);
      const result = await operation(tx, await readConnection(tx, scope));
      await tx.done;
      return result;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* The transaction can already be closed. */
      }
      await tx.done.catch(() => undefined);
      throw error;
    }
  });
}
/** Read schedule metadata without initializing or repairing native rows. */
export async function loadSyncQueueScheduleProgress(
  value: SyncQueueScope,
  identity: SyncConnectionIdentity
): Promise<SyncQueueScheduleProgress | null> {
  const { scope, authorization } = inputs(value, identity);
  const db = await initDB();
  const tx = db.transaction(
    [SYNC_CAPTURE_STORE, SYNC_CONNECTION_STORE, SYNC_OUTBOX_STORE],
    'readonly'
  );
  await requireSyncQueueScopeInTransaction(tx, scope);
  await checkSyncConnectionAdmission(tx, scope, authorization);
  const progress = progressFor(await readConnection(tx, scope), authorization);
  await tx.done;
  return progress;
}
function initializedOperation(
  row: SyncQueueOperation,
  raw: unknown,
  authorization: SyncConnectionIdentity
): SyncQueueOperation | null {
  if (row.authorization && row.authorization.incarnation !== authorization.incarnation) return null;
  const legacy =
    isRecord(raw) && !Object.hasOwn(raw, 'nextDueAt') && !Object.hasOwn(raw, 'automaticRetryCount');
  const bound = {
    ...row,
    authorization: row.status === 'running' ? row.authorization : authorization,
  };
  if (row.status === 'paused' || row.status === 'cancelled' || row.status === 'published')
    return { ...bound, nextDueAt: null };
  if (!legacy && row.nextDueAt !== null) return bound;
  if (row.status === 'queued') return { ...bound, nextDueAt: Date.now() };
  if (row.status === 'running') return { ...bound, nextDueAt: Date.now() + 30_000 };
  if (
    legacy &&
    ((row.status === 'failed' && row.failureCode === 'temporary') || row.status === 'interrupted')
  )
    return { ...bound, ...queueRetrySchedule(row) };
  return bound;
}
/** Initialize at most 64 native keys, atomically retaining their continuation and malformed evidence. */
export async function initializeSyncQueueSchedulePage(
  value: SyncQueueScope,
  identity: SyncConnectionIdentity,
  expectedRevision: number | null,
  limit = 64
): Promise<SyncQueueScheduleProgress> {
  const { scope, authorization } = inputs(value, identity);
  pageLimit(limit, 64);
  if (expectedRevision !== null && !queueOrdinal(expectedRevision))
    throw new Error('Invalid sync queue schedule revision.');
  return mutate(scope, authorization, async (tx, connection) => {
    const previous = progressFor(connection, authorization);
    if ((previous?.revision ?? null) !== expectedRevision)
      throw new Error('Stale sync queue schedule.');
    const progress = advanceProgress(previous ?? newProgress(authorization));
    if (!progress.complete) {
      const prefix = queueOperationPrefix(scope);
      const store = tx.objectStore(SYNC_OUTBOX_STORE);
      let cursor = await store.openCursor(
        IDBKeyRange.bound(
          progress.afterKey ?? prefix,
          `${prefix}\uffff`,
          progress.afterKey !== null
        )
      );
      let scanned = 0;
      while (cursor && scanned < limit) {
        if (typeof cursor.primaryKey !== 'string')
          throw new Error('Invalid sync queue native key.');
        progress.afterKey = cursor.primaryKey;
        const raw: unknown = cursor.value;
        const row = parseSyncQueueOperation(raw);
        if (row && sameQueueScope(row, scope) && row.key === cursor.primaryKey) {
          const initialized = initializedOperation(row, raw, authorization);
          if (initialized) await store.put(initialized);
        }
        scanned += 1;
        if (scanned === limit) break;
        cursor = await cursor.continue();
      }
      progress.complete = cursor === null;
    }
    await tx.objectStore(SYNC_OUTBOX_STORE).put({ ...connection, scheduleProgress: progress });
    return progress;
  });
}
function candidateFor(
  scope: SyncQueueScope,
  authorization: SyncConnectionIdentity,
  row: SyncQueueOperation
): SyncQueueDueCandidate | null {
  if (
    row.nextDueAt === null ||
    !row.authorization ||
    row.authorization.incarnation !== authorization.incarnation ||
    !['queued', 'running', 'failed', 'interrupted'].includes(row.status) ||
    (row.status === 'failed' && row.failureCode !== 'temporary')
  )
    return null;
  return {
    scope,
    authorization,
    operationId: row.operationId,
    revision: row.revision,
    nextDueAt: row.nextDueAt,
    runId: row.runId,
    runAuthorization: row.authorization,
    status: row.status,
  };
}
/** Advance durable due continuation after at most 16 entries plus one end-of-window lookahead. */
export async function discoverDueSyncQueueOperations(
  value: SyncQueueScope,
  identity: SyncConnectionIdentity,
  limit = 16
): Promise<{ candidates: SyncQueueDueCandidate[]; progress: SyncQueueScheduleProgress }> {
  const { scope, authorization } = inputs(value, identity);
  pageLimit(limit, 16);
  return mutate(scope, authorization, async (tx, connection) => {
    const progress = advanceProgress(
      progressFor(connection, authorization) ?? newProgress(authorization)
    );
    const candidates: SyncQueueDueCandidate[] = [];
    const now = Date.now();
    if (progress.dueAfter && progress.dueAfter.dueAt > now) progress.dueAfter = null;
    if (!connection.paused) {
      const bucket = [
        scope.spaceId,
        scope.connectionGeneration,
        scope.profileCreatedAt,
        authorization.incarnation,
      ];
      const after = progress.dueAfter;
      const range = IDBKeyRange.bound(
        after ? [...bucket, after.dueAt, after.key] : [...bucket, 0],
        [...bucket, now + 1],
        after !== null,
        true
      );
      let cursor = await tx.objectStore(SYNC_OUTBOX_STORE).index('syncQueueDue').openCursor(range);
      let scanned = 0;
      while (cursor && scanned < limit) {
        const key: unknown = cursor.key;
        if (
          !Array.isArray(key) ||
          typeof key[4] !== 'number' ||
          !Number.isFinite(key[4]) ||
          key[4] < 0 ||
          !queueNativeCursorKey(key[5])
        )
          throw new Error('Invalid sync queue due index key.');
        if (key[4] > now) break;
        progress.dueAfter = { dueAt: key[4], key: key[5] };
        const row = parseSyncQueueOperation(cursor.value);
        if (
          row &&
          sameQueueScope(row, scope) &&
          row.key === cursor.primaryKey &&
          row.nextDueAt === key[4]
        ) {
          const candidate = candidateFor(scope, authorization, row);
          if (candidate) candidates.push(candidate);
        }
        scanned += 1;
        cursor = await cursor.continue();
      }
      const remainingKey: unknown = cursor?.key;
      if (
        !cursor ||
        (Array.isArray(remainingKey) &&
          typeof remainingKey[4] === 'number' &&
          remainingKey[4] > now)
      )
        progress.dueAfter = null;
    }
    await tx.objectStore(SYNC_OUTBOX_STORE).put({ ...connection, scheduleProgress: progress });
    return { candidates, progress };
  });
}
/** Defer a busy exact candidate without invalidating its running callbacks or command revision. */
export async function deferDueSyncQueueOperation(value: SyncQueueDueCandidate): Promise<boolean> {
  const detached = structuredClone(value);
  const { scope, authorization } = inputs(detached.scope, detached.authorization);
  if (
    !queueIdentity(detached.operationId) ||
    !queueOrdinal(detached.revision) ||
    !queueOrdinal(detached.nextDueAt) ||
    !(detached.runId === null || queueUuid(detached.runId))
  )
    throw new Error('Invalid sync queue due candidate.');
  return mutate(scope, authorization, async (tx, connection) => {
    if (connection.paused) return false;
    const store = tx.objectStore(SYNC_OUTBOX_STORE);
    const row = parseSyncQueueOperation(
      await store.get(queueOperationKey(scope, detached.operationId))
    );
    const runAuthorization =
      detached.runAuthorization === null
        ? null
        : parseSyncConnectionIdentity(detached.runAuthorization);
    if (
      (detached.runAuthorization !== null && !runAuthorization) ||
      !row ||
      !sameQueueScope(row, scope) ||
      row.revision !== detached.revision ||
      row.nextDueAt !== detached.nextDueAt ||
      row.runId !== detached.runId ||
      row.status !== detached.status ||
      (row.authorization === null
        ? runAuthorization !== null
        : runAuthorization === null ||
          !sameSyncConnectionIdentity(row.authorization, runAuthorization)) ||
      !row.authorization ||
      row.authorization.incarnation !== authorization.incarnation ||
      row.nextDueAt === null ||
      row.nextDueAt > Date.now()
    )
      return false;
    await store.put({ ...row, nextDueAt: Date.now() + 30_000 });
    const progress = advanceProgress(
      progressFor(connection, authorization) ?? newProgress(authorization)
    );
    await store.put({ ...connection, scheduleProgress: progress });
    return true;
  });
}
