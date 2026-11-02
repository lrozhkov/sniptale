import { SYNC_CAPTURE_STORE } from '../infrastructure/indexed-db/core.stores';
import {
  captureRootKey,
  pendingCheckpointKey,
  DEFAULT_SYNC_CHECKPOINT_INTERVAL,
  type CaptureRootKind,
  type SyncPendingCheckpoint,
  type SyncCheckpointReceipt,
} from './contracts';
import { ordinal, parseSyncCaptureRecord } from './guards';
import type { SyncQueueScope } from './queue-model';

interface CheckpointTransaction {
  objectStore(name: string): { get(key: IDBValidKey): Promise<unknown> };
}
interface CheckpointWriteTransaction {
  objectStore(name: string): {
    get(key: IDBValidKey): Promise<unknown>;
    put(value: unknown): Promise<unknown>;
    delete(key: IDBValidKey): Promise<unknown>;
  };
}
interface Root {
  rootKind: CaptureRootKind;
  rootId: string;
}
function invalid(): never {
  throw new Error('Pending sync checkpoint is invalid or belongs to another enrollment.');
}

/** Read exact pending native work without migration, mutation or publication effects. */
export async function readCheckpointInTransaction(
  tx: CheckpointTransaction,
  scope: SyncQueueScope,
  root: Root
): Promise<SyncPendingCheckpoint | null> {
  const rootKey = captureRootKey(scope.spaceId, root.rootKind, root.rootId);
  const raw: unknown = await tx.objectStore(SYNC_CAPTURE_STORE).get(pendingCheckpointKey(rootKey));
  if (raw === undefined) return null;
  const record = parseSyncCaptureRecord(raw);
  if (
    !record ||
    record.kind !== 'pending-checkpoint' ||
    record.rootKey !== rootKey ||
    record.spaceId !== scope.spaceId ||
    record.profileCreatedAt !== scope.profileCreatedAt ||
    record.connectionGeneration !== scope.connectionGeneration
  )
    return invalid();
  return record;
}

async function pendingForReceipt(tx: CheckpointTransaction, root: Root) {
  const raw = await tx.objectStore(SYNC_CAPTURE_STORE).get('profile');
  if (raw === undefined) return null;
  const profile = parseSyncCaptureRecord(raw);
  if (!profile || profile.kind !== 'profile') throw new Error('Invalid sync capture profile.');
  if (!profile.enabled) return null;
  return readCheckpointInTransaction(
    tx,
    {
      spaceId: profile.spaceId,
      profileCreatedAt: profile.createdAt,
      connectionGeneration: profile.connectionGeneration,
    },
    root
  );
}

/**
 * Observe one caller-owned capture in the same transaction. Only a newly minted UUID is receipted.
 * The caller must commit tx.done before it returns this receipt as a successful save ACK.
 */
export async function captureCheckpointReceiptInTransaction(
  tx: CheckpointTransaction,
  root: Root,
  capture: () => Promise<unknown>
): Promise<SyncCheckpointReceipt | null> {
  const before = await pendingForReceipt(tx, root);
  await capture();
  const after = await pendingForReceipt(tx, root);
  return after && after.revision !== before?.revision
    ? { rootKind: after.rootKind, rootId: after.rootId, revision: after.revision }
    : null;
}

/** Mark accepted native work in its writer's transaction, without copying its rows or files. */
export async function deferCheckpointInTransaction(
  tx: CheckpointWriteTransaction,
  root: Root,
  now = Date.now()
): Promise<SyncPendingCheckpoint | null> {
  const store = tx.objectStore(SYNC_CAPTURE_STORE);
  const raw: unknown = await store.get('profile');
  if (raw === undefined) return null;
  const profile = parseSyncCaptureRecord(raw);
  if (!profile || profile.kind !== 'profile') return invalid();
  if (!profile.enabled) return null;
  if (!ordinal(now)) return invalid();
  const scope = {
    spaceId: profile.spaceId,
    profileCreatedAt: profile.createdAt,
    connectionGeneration: profile.connectionGeneration,
  };
  const previous = await readCheckpointInTransaction(tx, scope, root);
  const rootKey = captureRootKey(scope.spaceId, root.rootKind, root.rootId);
  const dueAt =
    previous?.dueAt ?? now + (profile.checkpointIntervalMs ?? DEFAULT_SYNC_CHECKPOINT_INTERVAL);
  const pending: SyncPendingCheckpoint = {
    version: 1,
    kind: 'pending-checkpoint',
    key: pendingCheckpointKey(rootKey),
    createdAt: previous?.createdAt ?? now,
    ...scope,
    ...root,
    rootKey,
    revision: crypto.randomUUID(),
    dueAt,
    ...(previous?.flushRequested ? { flushRequested: true } : {}),
  };
  if (!parseSyncCaptureRecord(pending)) return invalid();
  await store.put(pending);
  return pending;
}

/** Consume only the frozen revision; stale completion cannot clear later native work. */
export async function consumeCheckpointInTransaction(
  tx: CheckpointWriteTransaction,
  expected: SyncPendingCheckpoint
): Promise<boolean> {
  const profile = parseSyncCaptureRecord(await tx.objectStore(SYNC_CAPTURE_STORE).get('profile'));
  if (
    !profile ||
    profile.kind !== 'profile' ||
    !profile.enabled ||
    profile.spaceId !== expected.spaceId ||
    profile.createdAt !== expected.profileCreatedAt ||
    profile.connectionGeneration !== expected.connectionGeneration
  )
    return false;
  const current = await readCheckpointInTransaction(tx, expected, expected);
  if (!current || current.revision !== expected.revision) return false;
  await tx.objectStore(SYNC_CAPTURE_STORE).delete(current.key);
  return true;
}
