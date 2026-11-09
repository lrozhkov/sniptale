import { capturePreparedDatabase } from '../infrastructure/indexed-db/core';
import {
  SYNC_CAPTURE_STORE,
  SYNC_CONNECTION_STORE,
  SYNC_OUTBOX_STORE,
} from '../infrastructure/indexed-db/core.stores';
import {
  SYNC_CAPTURE_SCOPE_PHASE_INDEX,
  SYNC_PENDING_SCOPE_DUE_INDEX,
  SYNC_QUEUE_SCOPE_STATUS_INDEX,
  SYNC_QUEUE_SUMMARY_INDEXES,
} from '../infrastructure/indexed-db/sync-queue-index-migration';
import {
  parseConnectionMetadata,
  sameConnectionScope,
  sameSyncConnectionIdentity,
  type SyncConnectionIdentity,
} from '../remote-connection/model';
import { parseSyncCaptureRecord } from './guards';
import {
  parseSyncQueueConnection,
  queueConnectionKey,
  queueOperationPrefix,
  sameQueueScope,
  type SyncQueueScope,
} from './queue-model';

interface SummaryIndex {
  readonly keyPath: unknown;
  count(query?: IDBValidKey | IDBKeyRange): Promise<number>;
  openKeyCursor(
    query?: IDBValidKey | IDBKeyRange
  ): Promise<{ readonly key: unknown; readonly primaryKey: IDBValidKey } | null>;
}
interface SummaryStore {
  get(key: string): Promise<unknown>;
  count(query?: IDBValidKey | IDBKeyRange): Promise<number>;
  index(name: string): SummaryIndex;
}
interface SummaryTransaction {
  objectStore(name: string): SummaryStore;
}
const phases = ['native', 'prepared', 'published'] as const;
const statuses = [
  'queued',
  'running',
  'paused',
  'cancelled',
  'failed',
  'interrupted',
  'published',
] as const;
const kinds = [
  'profile',
  'root-state',
  'pending-checkpoint',
  'sync-operation',
  'applied-operation',
] as const;
interface QueueCounts {
  queued: number;
  running: number;
  paused: number;
  cancelled: number;
  failed: number;
  interrupted: number;
  published: number;
}
export type SyncQueueSummary =
  | { knowledge: 'complete'; configured: false }
  | {
      knowledge: 'complete';
      configured: true;
      scope: SyncQueueScope;
      authorization: SyncConnectionIdentity;
      connection: 'active' | 'paused' | 'credentials-required' | 'updating-auth';
      counts: {
        pendingRoots: number;
        nativeOperations: number;
        preparedOperations: number;
        publishedOperations: number;
        queue: QueueCounts;
      };
      minimumPendingDueAt: number | null;
      enrollmentComplete: boolean;
      localPublication: 'waiting' | 'published' | 'discovering';
    }
  | { knowledge: 'unknown'; reason: 'invalid-data' | 'index-coverage' }
  | {
      knowledge: 'unavailable';
      reason: 'not-prepared' | 'database-changed' | 'storage-unavailable';
    };
class CoverageError extends Error {}
function count(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new CoverageError();
  return value;
}
function total(values: readonly number[]): number {
  return count(values.reduce((sum, value) => sum + count(value), 0));
}
function requireEqual(left: number, right: number): void {
  if (count(left) !== count(right)) throw new CoverageError();
}
/** Fixed discriminator successor includes every trailing native key type, including nested arrays. */
function enumPrefix(...prefix: string[]): IDBKeyRange {
  const last = prefix.at(-1);
  if (last === undefined) throw new CoverageError();
  return IDBKeyRange.bound(prefix, [...prefix.slice(0, -1), `${last}\u0000`], false, true);
}
/** Both canonical queue key prefixes end with a colon. The successor includes every suffix. */
function queuePrefix(prefix: string): IDBKeyRange {
  return IDBKeyRange.bound(prefix, `${prefix.slice(0, -1)};`, false, true);
}
function scoped(scope: SyncQueueScope): [string, number, number] {
  return [scope.spaceId, scope.connectionGeneration, scope.profileCreatedAt];
}
function checkedIndex(store: SummaryStore, name: string): SummaryIndex {
  const index = store.index(name);
  const definition = SYNC_QUEUE_SUMMARY_INDEXES.find((item) => item.indexName === name);
  const keyPath: unknown = index.keyPath;
  if (
    !definition ||
    !Array.isArray(keyPath) ||
    keyPath.length !== definition.keyPath.length ||
    !definition.keyPath.every((part, offset) => keyPath[offset] === part)
  )
    throw new CoverageError();
  return index;
}
/** Read canonical pending counts and deadlines from keys only in the caller's native snapshot. */
export async function readSyncPendingCheckpointSummaryInTransaction(
  tx: SummaryTransaction,
  scope: SyncQueueScope
): Promise<{ pendingRoots: number; minimumPendingDueAt: number | null }> {
  const captures = tx.objectStore(SYNC_CAPTURE_STORE);
  const pendingIndex = checkedIndex(captures, SYNC_PENDING_SCOPE_DUE_INDEX);
  const kindIndex = captures.index('kind');
  requireEqual(await captures.count(), await kindIndex.count());
  requireEqual(
    await kindIndex.count('pending-checkpoint'),
    await pendingIndex.count(enumPrefix('pending-checkpoint'))
  );
  const scopeTuple = scoped(scope);
  // There is no greatest IndexedDB array key. Advance the numeric lifetime boundary instead.
  // MAX_SAFE_INTEGER + 1 is exact as a query boundary and is never stored as an ordinal.
  const pendingPrefix: IDBValidKey[] = ['pending-checkpoint', ...scopeTuple];
  const allPending = IDBKeyRange.bound(
    pendingPrefix,
    ['pending-checkpoint', scope.spaceId, scope.connectionGeneration, scope.profileCreatedAt + 1],
    false,
    true
  );
  const numericPending = IDBKeyRange.bound(
    [...pendingPrefix, 0],
    [...pendingPrefix, Number.MAX_SAFE_INTEGER]
  );
  const pendingRoots = count(await pendingIndex.count(allPending));
  requireEqual(pendingRoots, await pendingIndex.count(numericPending));
  const earliest = await pendingIndex.openKeyCursor(numericPending);
  let minimumPendingDueAt: number | null = null;
  if (earliest) {
    const key: unknown = earliest.key;
    if (
      !Array.isArray(key) ||
      key.length !== 5 ||
      key[0] !== 'pending-checkpoint' ||
      key[1] !== scope.spaceId ||
      key[2] !== scope.connectionGeneration ||
      key[3] !== scope.profileCreatedAt ||
      typeof key[4] !== 'number' ||
      !Number.isSafeInteger(key[4]) ||
      key[4] < 0
    )
      throw new CoverageError();
    minimumPendingDueAt = key[4];
  }
  if ((pendingRoots === 0) !== (earliest === null)) throw new CoverageError();
  return { pendingRoots, minimumPendingDueAt };
}
/** Advisory local publication metadata. Remote catalog freshness belongs to the automatic sync owner. */
export async function readSyncQueueSummaryInTransaction(
  tx: SummaryTransaction
): Promise<SyncQueueSummary> {
  try {
    const captures = tx.objectStore(SYNC_CAPTURE_STORE);
    const outbox = tx.objectStore(SYNC_OUTBOX_STORE);
    const rawProfile: unknown = await captures.get('profile');
    const rawMetadata: unknown = await tx.objectStore(SYNC_CONNECTION_STORE).get('connection');
    if (rawProfile === undefined && rawMetadata === undefined)
      return { knowledge: 'complete', configured: false };
    const profile = parseSyncCaptureRecord(rawProfile);
    const metadata = parseConnectionMetadata(rawMetadata);
    if (profile?.kind === 'profile' && !profile.enabled && rawMetadata === undefined)
      return { knowledge: 'complete', configured: false };
    if (!profile || profile.kind !== 'profile' || !profile.enabled || !metadata)
      return { knowledge: 'unknown', reason: 'invalid-data' };
    const scope: SyncQueueScope = {
      spaceId: profile.spaceId,
      connectionGeneration: profile.connectionGeneration,
      profileCreatedAt: profile.createdAt,
    };
    if (!sameConnectionScope(scope, metadata.binding))
      return { knowledge: 'unknown', reason: 'invalid-data' };
    const rawControl: unknown = await outbox.get(queueConnectionKey(scope));
    const control = rawControl === undefined ? null : parseSyncQueueConnection(rawControl);
    if (rawControl !== undefined && (!control || !sameQueueScope(control, scope)))
      return { knowledge: 'unknown', reason: 'invalid-data' };
    const operationIndex = checkedIndex(captures, SYNC_CAPTURE_SCOPE_PHASE_INDEX);
    const queueIndex = checkedIndex(outbox, SYNC_QUEUE_SCOPE_STATUS_INDEX);
    const kindIndex = captures.index('kind');
    requireEqual(await captures.count(), await kindIndex.count());
    const kindCounts = await Promise.all(kinds.map((kind) => kindIndex.count(kind)));
    requireEqual(await kindIndex.count(), total(kindCounts));
    const operationCount = count(kindCounts[3]!);
    const globalPhases = await Promise.all(
      phases.map((phase) => operationIndex.count(enumPrefix('sync-operation', phase)))
    );
    requireEqual(operationCount, total(globalPhases));
    const globalStatuses = await Promise.all(
      statuses.map((status) => queueIndex.count(enumPrefix('queue-operation', status)))
    );
    requireEqual(await outbox.count(queuePrefix('queue-operation-v1:')), total(globalStatuses));
    const scopeTuple = scoped(scope);
    const phaseCounts = await Promise.all(
      phases.map((phase) =>
        operationIndex.count(IDBKeyRange.only(['sync-operation', phase, ...scopeTuple]))
      )
    );
    const statusCounts = await Promise.all(
      statuses.map((status) =>
        queueIndex.count(IDBKeyRange.only(['queue-operation', status, ...scopeTuple]))
      )
    );
    requireEqual(await outbox.count(queuePrefix(queueOperationPrefix(scope))), total(statusCounts));
    const { pendingRoots, minimumPendingDueAt } =
      await readSyncPendingCheckpointSummaryInTransaction(tx, scope);
    const queue: QueueCounts = {
      queued: count(statusCounts[0]!),
      running: count(statusCounts[1]!),
      paused: count(statusCounts[2]!),
      cancelled: count(statusCounts[3]!),
      failed: count(statusCounts[4]!),
      interrupted: count(statusCounts[5]!),
      published: count(statusCounts[6]!),
    };
    const nativeOperations = count(phaseCounts[0]!);
    const preparedOperations = count(phaseCounts[1]!);
    const publishedOperations = count(phaseCounts[2]!);
    const enrollmentComplete =
      control?.enrollmentProgress?.source === 'complete' &&
      sameSyncConnectionIdentity(control.enrollmentProgress.authorization, metadata.identity);
    const waiting =
      pendingRoots > 0 ||
      nativeOperations > 0 ||
      preparedOperations > 0 ||
      statuses.some((status) => status !== 'published' && queue[status] > 0);
    return {
      knowledge: 'complete',
      configured: true,
      scope,
      authorization: metadata.identity,
      connection:
        metadata.phase === 'updating-auth'
          ? 'updating-auth'
          : metadata.phase === 'paused' || control?.paused
            ? 'paused'
            : metadata.credentialId === null
              ? 'credentials-required'
              : 'active',
      counts: { pendingRoots, nativeOperations, preparedOperations, publishedOperations, queue },
      minimumPendingDueAt,
      enrollmentComplete,
      localPublication: waiting ? 'waiting' : enrollmentComplete ? 'published' : 'discovering',
    };
  } catch (error) {
    return {
      knowledge: 'unknown',
      reason:
        error instanceof CoverageError ||
        (error instanceof DOMException && error.name === 'NotFoundError')
          ? 'index-coverage'
          : 'invalid-data',
    };
  }
}
/** Capture once; a status observation never prepares storage or reopens a replacement database. */
export async function readSyncQueueSummary(): Promise<SyncQueueSummary> {
  const db = capturePreparedDatabase();
  if (!db) return { knowledge: 'unavailable', reason: 'not-prepared' };
  try {
    const tx = db.transaction(
      [SYNC_CAPTURE_STORE, SYNC_CONNECTION_STORE, SYNC_OUTBOX_STORE],
      'readonly'
    );
    const result = await readSyncQueueSummaryInTransaction(tx);
    await tx.done;
    return capturePreparedDatabase() === db
      ? result
      : { knowledge: 'unavailable', reason: 'database-changed' };
  } catch {
    return { knowledge: 'unavailable', reason: 'storage-unavailable' };
  }
}
