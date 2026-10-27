import type { IDBPTransaction } from 'idb';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { initDB } from '../infrastructure/indexed-db/core';
import { SYNC_CAPTURE_STORE, SYNC_OUTBOX_STORE } from '../infrastructure/indexed-db/core.stores';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { parseSyncCaptureRecord } from './guards';
import { requireSyncQueueScopeInTransaction } from './queue';
import {
  InvalidSyncQueueHistoryProgressError,
  readSyncQueueHistoryProgressInTransaction,
  type SyncQueueHistorySource,
} from './queue-history';
import {
  parseSyncQueueOperation,
  parseSyncQueueScope,
  queueHash,
  queueOperationKey,
  queueOperationPrefix,
  queueOrdinal,
  sameQueueScope,
  type SyncQueueScope,
} from './queue-model';

type ScanTransaction = IDBPTransaction<unknown, string[], 'readonly' | 'readwrite'>;
/** A native scan position bound to one enrollment lifetime and expected revision. */
interface SyncQueueHistoryScanState {
  scope: SyncQueueScope;
  revision: number;
  afterKey: string | null;
}
function scopeInput(value: unknown): SyncQueueScope {
  const scope = parseSyncQueueScope(structuredClone(value));
  if (!scope) throw new Error('Invalid sync queue scope.');
  return scope;
}
function validAfterKey(scope: SyncQueueScope, key: unknown): key is string | null {
  const prefix = queueOperationPrefix(scope);
  return (
    key === null ||
    (typeof key === 'string' &&
      key.length <= 4096 &&
      key.startsWith(prefix) &&
      key >= prefix &&
      key <= `${prefix}\uffff`)
  );
}
function stateInput(value: unknown): SyncQueueHistoryScanState {
  const raw: unknown = structuredClone(value);
  if (!isRecord(raw)) throw new Error('Invalid sync queue history scan state.');
  const scope = scopeInput(raw['scope']);
  if (!queueOrdinal(raw['revision']) || !validAfterKey(scope, raw['afterKey']))
    throw new Error('Invalid sync queue history scan state.');
  return { scope, revision: raw['revision'], afterKey: raw['afterKey'] };
}
function scanKey(scope: SyncQueueScope): string {
  return JSON.stringify([
    'queue-history-scan-v1',
    scope.spaceId,
    scope.connectionGeneration,
    scope.profileCreatedAt,
  ]);
}
async function readState(tx: ScanTransaction, scope: SyncQueueScope) {
  const key = scanKey(scope);
  const raw: unknown = await tx.objectStore(SYNC_OUTBOX_STORE).get(key);
  if (raw === undefined) return { scope, revision: 0, afterKey: null };
  if (
    !isRecord(raw) ||
    raw['version'] !== 1 ||
    raw['kind'] !== 'queue-history-scan' ||
    raw['key'] !== key
  )
    throw new Error('Invalid sync queue history scan state.');
  const state = stateInput(raw);
  if (!sameQueueScope(state.scope, scope))
    throw new Error('Invalid sync queue history scan scope.');
  return state;
}
function requireCurrent(current: SyncQueueHistoryScanState, expected: SyncQueueHistoryScanState) {
  if (current.revision !== expected.revision || current.afterKey !== expected.afterKey)
    throw new Error('Stale sync queue history scan state.');
}
/** Read enrollment without enabling capture or creating scan metadata. */
export async function loadSyncQueueHistoryEnrollment(): Promise<SyncQueueScope | null> {
  const db = await initDB();
  const tx = db.transaction([SYNC_CAPTURE_STORE], 'readonly');
  const raw: unknown = await tx.objectStore(SYNC_CAPTURE_STORE).get('profile');
  if (raw === undefined) {
    await tx.done;
    return null;
  }
  const profile = parseSyncCaptureRecord(raw);
  if (!profile || profile.kind !== 'profile')
    throw new Error('Invalid sync queue history enrollment.');
  await tx.done;
  return {
    spaceId: profile.spaceId,
    connectionGeneration: profile.connectionGeneration,
    profileCreatedAt: profile.createdAt,
  };
}
/** Return virtual initial progress on absence without writing a row. */
export async function loadSyncQueueHistoryScanState(
  value: SyncQueueScope
): Promise<SyncQueueHistoryScanState> {
  const scope = scopeInput(value);
  const db = await initDB();
  const tx = db.transaction([SYNC_CAPTURE_STORE, SYNC_OUTBOX_STORE], 'readonly');
  await requireSyncQueueScopeInTransaction(tx, scope);
  const state = await readState(tx, scope);
  await tx.done;
  return state;
}
/** Read bounded operation metadata; source delivery later admits the immutable capture join. */
export async function loadSyncQueueHistoryScanPage(
  value: SyncQueueHistoryScanState,
  limit = 64
): Promise<{
  sources: SyncQueueHistorySource[];
  nextAfterKey: string | null;
  more: boolean;
  invalidSources: number;
}> {
  const state = stateInput(value);
  if (!queueOrdinal(limit) || limit < 1 || limit > 128)
    throw new Error('Invalid sync queue history scan limit.');
  const db = await initDB();
  const tx = db.transaction([SYNC_CAPTURE_STORE, SYNC_OUTBOX_STORE], 'readonly');
  await requireSyncQueueScopeInTransaction(tx, state.scope);
  requireCurrent(await readState(tx, state.scope), state);
  const prefix = queueOperationPrefix(state.scope);
  const range = IDBKeyRange.bound(
    state.afterKey ?? prefix,
    `${prefix}\uffff`,
    state.afterKey !== null
  );
  const rows: unknown[] = await tx.objectStore(SYNC_OUTBOX_STORE).getAll(range, limit + 1);
  const sources: SyncQueueHistorySource[] = [];
  let invalidSources = 0;
  let lastKey: string | null = null;
  for (const raw of rows.slice(0, limit)) {
    // The store keyPath is 'key'. Impossible keys cannot safely supply a continuation.
    if (!isRecord(raw) || typeof raw['key'] !== 'string' || !validAfterKey(state.scope, raw['key']))
      throw new Error('Invalid sync queue history native key.');
    const previous = lastKey ?? state.afterKey;
    if (previous !== null && raw['key'] <= previous)
      throw new Error('Invalid sync queue history native key order.');
    lastKey = raw['key'];
    const row = parseSyncQueueOperation(raw);
    if (!row || !sameQueueScope(row, state.scope)) {
      invalidSources++;
      continue;
    }
    try {
      const delivered = await readSyncQueueHistoryProgressInTransaction(
        tx,
        queueHash(queueOperationKey(state.scope, row.operationId)),
        row.eventSequence
      );
      if (delivered < row.eventSequence)
        sources.push({ kind: 'operation', operationId: row.operationId });
    } catch (error) {
      if (!(error instanceof InvalidSyncQueueHistoryProgressError)) throw error;
      invalidSources++;
    }
  }
  await tx.done;
  const more = rows.length > limit;
  return { sources, nextAfterKey: more ? lastKey : null, more, invalidSources };
}
/** Commit a changed position under native mutation admission and enrollment-bound CAS. */
export async function saveSyncQueueHistoryScanState(
  value: SyncQueueHistoryScanState,
  nextAfterKey: string | null
): Promise<SyncQueueHistoryScanState> {
  const state = stateInput(value);
  if (!validAfterKey(state.scope, nextAfterKey))
    throw new Error('Invalid sync queue history scan position.');
  return runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction([SYNC_CAPTURE_STORE, SYNC_OUTBOX_STORE], 'readwrite');
    try {
      await requireSyncQueueScopeInTransaction(tx, state.scope);
      const current = await readState(tx, state.scope);
      requireCurrent(current, state);
      if (current.afterKey === nextAfterKey) {
        await tx.done;
        return current;
      }
      if (!Number.isSafeInteger(current.revision + 1))
        throw new Error('Sync queue history scan revision exhausted.');
      const updated = {
        scope: state.scope,
        revision: current.revision + 1,
        afterKey: nextAfterKey,
      };
      await tx.objectStore(SYNC_OUTBOX_STORE).put({
        version: 1,
        kind: 'queue-history-scan',
        key: scanKey(state.scope),
        ...updated,
      });
      await tx.done;
      return updated;
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
