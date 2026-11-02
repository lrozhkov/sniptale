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
  parseConnectionMetadata,
  sameConnectionScope,
  sameSyncConnectionIdentity,
} from '../remote-connection/model';
import {
  ordinal,
  parseSyncCaptureRecord,
  parseSyncCheckpointInterval,
  parseSyncCheckpointReceipt,
} from './guards';
import { readCheckpointInTransaction } from './checkpoints';
import { parseSyncQueueScope, type SyncQueueScope } from './queue-model';
import { readSyncQueueSourceInTransaction, requireSyncQueueScopeInTransaction } from './queue';
import {
  captureRootKey,
  pendingCheckpointKey,
  type SyncPendingCheckpoint,
  type SyncCheckpointReceipt,
} from './contracts';

type Transaction = IDBPTransaction<unknown, string[], 'readwrite'>;
const stores = [SYNC_CAPTURE_STORE, SYNC_CONNECTION_STORE, SYNC_OUTBOX_STORE];
const prefix = '["pending-checkpoint",';
class SyncCheckpointCommandError extends Error {
  constructor(readonly code: 'invalid-data' | 'selection-changed' | 'paused') {
    super(code);
    this.name = 'SyncCheckpointCommandError';
  }
}
function invalid(): never {
  throw new SyncCheckpointCommandError('invalid-data');
}

async function visitPending(
  tx: Transaction,
  scope: SyncQueueScope,
  update: (row: SyncPendingCheckpoint) => Promise<void>
): Promise<void> {
  let after: string | null = null;
  for (;;) {
    const keys = await tx
      .objectStore(SYNC_CAPTURE_STORE)
      .getAllKeys(IDBKeyRange.bound(after ?? prefix, `${prefix}\uffff`, after !== null), 64);
    for (const key of keys) {
      if (typeof key !== 'string' || !key.startsWith(prefix)) return invalid();
      const row = parseSyncCaptureRecord(await tx.objectStore(SYNC_CAPTURE_STORE).get(key));
      if (!row || row.kind !== 'pending-checkpoint' || row.key !== key) return invalid();
      if (row.spaceId !== scope.spaceId) continue;
      if (
        row.profileCreatedAt !== scope.profileCreatedAt ||
        row.connectionGeneration !== scope.connectionGeneration
      )
        return invalid();
      await update(row);
    }
    if (keys.length < 64) return;
    const last = keys.at(-1);
    if (typeof last !== 'string') return invalid();
    after = last;
  }
}
async function runCommand<T>(
  scopeInput: unknown,
  execute: (tx: Transaction, scope: SyncQueueScope) => Promise<T>
) {
  // Erasure may close this handle while the command waits. Never reopen a replacement database.
  const db = capturePreparedDatabase();
  const scope = parseSyncQueueScope(structuredClone(scopeInput));
  if (!db || !scope) return invalid();
  return runWithPersistenceMutationPermit(async () => {
    const tx = db.transaction(stores, 'readwrite');
    try {
      await requireSyncQueueScopeInTransaction(tx, scope);
      const result = await execute(tx, scope);
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

/** Read the effective device policy without initializing storage or changing native rows. */
export async function readSyncCheckpointInterval(scopeInput: unknown) {
  const db = capturePreparedDatabase();
  const scope = parseSyncQueueScope(structuredClone(scopeInput));
  if (!db || !scope) return invalid();
  const tx = db.transaction([SYNC_CAPTURE_STORE], 'readonly');
  try {
    await requireSyncQueueScopeInTransaction(tx, scope);
    const profile = parseSyncCaptureRecord(await tx.objectStore(SYNC_CAPTURE_STORE).get('profile'));
    if (!profile || profile.kind !== 'profile') return invalid();
    await tx.done;
    return profile.checkpointIntervalMs ?? 0;
  } catch (error) {
    await tx.done.catch(() => undefined);
    throw error;
  }
}

/** Change the device policy and all current pending deadlines atomically, without network IO. */
export async function updateSyncCheckpointInterval(scopeInput: unknown, intervalInput: unknown) {
  const intervalMs = parseSyncCheckpointInterval(intervalInput);
  if (intervalMs === null) return invalid();
  return runCommand(scopeInput, async (tx, scope) => {
    const store = tx.objectStore(SYNC_CAPTURE_STORE);
    const profile = parseSyncCaptureRecord(await store.get('profile'));
    if (!profile || profile.kind !== 'profile') return invalid();
    if (profile.checkpointIntervalMs === intervalMs) return { intervalMs, updated: 0 };
    let updated = 0;
    await visitPending(tx, scope, async (row) => {
      if (row.flushRequested) return;
      const dueAt = row.createdAt + intervalMs;
      if (!ordinal(dueAt)) return invalid();
      if (dueAt === row.dueAt) return;
      await store.put({ ...row, dueAt, revision: crypto.randomUUID() });
      updated++;
    });
    await store.put({ ...profile, checkpointIntervalMs: intervalMs });
    return { intervalMs, updated };
  });
}
function parseExitSelection(value: unknown): SyncCheckpointReceipt | null {
  if (value === undefined) return null;
  return parseSyncCheckpointReceipt(value) ?? invalid();
}

/** Make current pending work due; exact exit selection cannot affect a replacement revision. */
export async function requestSyncCheckpointFlush(
  scopeInput: unknown,
  identityInput: unknown,
  selectionInput?: unknown
) {
  const authorization = parseSyncConnectionIdentity(structuredClone(identityInput));
  const selection = parseExitSelection(structuredClone(selectionInput));
  if (!authorization) return invalid();
  const now = Date.now();
  if (!ordinal(now)) return invalid();
  return runCommand(scopeInput, async (tx, scope) => {
    await checkSyncConnectionAdmission(tx, scope, authorization);
    const connection = await readSyncQueueSourceInTransaction(tx, scope, null);
    if (connection.kind !== 'queue-connection') return invalid();
    if (connection.paused) throw new SyncCheckpointCommandError('paused');
    const result = { updated: 0, alreadyDue: 0 };
    const update = async (row: SyncPendingCheckpoint) => {
      if (row.dueAt <= now) {
        if (!row.flushRequested)
          await tx.objectStore(SYNC_CAPTURE_STORE).put({ ...row, flushRequested: true });
        result.alreadyDue++;
        return;
      }
      const dueAt = Math.max(row.createdAt, now);
      await tx
        .objectStore(SYNC_CAPTURE_STORE)
        .put({ ...row, dueAt, revision: crypto.randomUUID(), flushRequested: true });
      result.updated++;
    };
    if (selection) {
      const key = pendingCheckpointKey(
        captureRootKey(scope.spaceId, selection.rootKind, selection.rootId)
      );
      const row = parseSyncCaptureRecord(await tx.objectStore(SYNC_CAPTURE_STORE).get(key));
      if (
        !row ||
        row.kind !== 'pending-checkpoint' ||
        row.key !== key ||
        row.profileCreatedAt !== scope.profileCreatedAt ||
        row.connectionGeneration !== scope.connectionGeneration ||
        row.revision !== selection.revision
      )
        throw new SyncCheckpointCommandError('selection-changed');
      await update(row);
    } else await visitPending(tx, scope, update);
    return result;
  });
}

/**
 * Record only the acknowledged revision as due. Local intent is allowed while transport is paused.
 * Native scheduling, secret and HTTP admission remain responsible for all execution decisions.
 */
export async function requestSyncCheckpointExit(
  scopeInput: unknown,
  identityInput: unknown,
  receiptInput: unknown
): Promise<{ outcome: 'requested' | 'already-due' | 'stale' | 'not-pending' }> {
  const authorization = parseSyncConnectionIdentity(structuredClone(identityInput));
  const receipt = parseSyncCheckpointReceipt(structuredClone(receiptInput));
  if (!authorization || !receipt) return invalid();
  const now = Date.now();
  if (!ordinal(now)) return invalid();
  return runCommand(scopeInput, async (tx, scope) => {
    const connection = parseConnectionMetadata(
      await tx.objectStore(SYNC_CONNECTION_STORE).get('connection')
    );
    if (
      !connection ||
      !sameConnectionScope(connection.binding, scope) ||
      !sameSyncConnectionIdentity(connection.identity, authorization)
    )
      throw new SyncCheckpointCommandError('selection-changed');
    const row = await readCheckpointInTransaction(tx, scope, receipt);
    if (!row) return { outcome: 'not-pending' };
    if (row.revision !== receipt.revision) return { outcome: 'stale' };
    if (row.dueAt <= now) {
      if (!row.flushRequested)
        await tx.objectStore(SYNC_CAPTURE_STORE).put({ ...row, flushRequested: true });
      return { outcome: 'already-due' };
    }
    await tx.objectStore(SYNC_CAPTURE_STORE).put({
      ...row,
      dueAt: Math.max(row.createdAt, now),
      revision: crypto.randomUUID(),
      flushRequested: true,
    });
    return { outcome: 'requested' };
  });
}
