import type { IDBPTransaction } from 'idb';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { SYNC_QUEUE_SCOPE_STATUS_INDEX } from '../infrastructure/indexed-db/sync-queue-index-migration';
import { SYNC_OUTBOX_STORE } from '../infrastructure/indexed-db/core.stores';
import {
  parseSyncConnectionIdentity,
  sameSyncConnectionIdentity,
  type SyncConnectionIdentity,
} from '../remote-connection/model';
import type { CaptureOperation, CapturedChange, CaptureRootKind } from './contracts';
import { readSyncPendingCheckpointSummaryInTransaction } from './queue-summary';
import {
  parseSyncQueueScope,
  parseSyncQueueOperation,
  queueOperationKey,
  queueOperationPrefix,
  sameQueueScope,
  queueOrdinal,
  queueIdentity,
  type SyncQueueScope,
  type SyncQueueOperation,
} from './queue-model';

type QueueTransaction = IDBPTransaction<unknown, string[], 'readwrite' | 'readonly'>;
type QueueCaptureReader = (
  tx: QueueTransaction,
  scope: SyncQueueScope,
  id: string
) => Promise<{ operation: SyncQueueOperation; capture: CaptureOperation }>;

interface QueuePageAdmission {
  readCapture: QueueCaptureReader;
  readAuthorization: (
    tx: QueueTransaction,
    scope: SyncQueueScope
  ) => Promise<SyncConnectionIdentity | null>;
  retryConnectionMatches: (
    row: SyncQueueOperation,
    authorization: SyncConnectionIdentity | null
  ) => boolean;
}

/** Global outgoing operation views; automatic recovery is distinct from a manual decision. */
export type SyncQueueFilter = 'all' | 'problems' | 'action-required';
/** Continuation within one enrollment lifetime. Pages are live reads, not a shared snapshot. */
interface SyncQueueCursor {
  scope: SyncQueueScope;
  afterOperationId: string;
  filter?: SyncQueueFilter;
  order?: 'primary-key' | 'status-primary-key';
  status?: 'failed' | 'interrupted';
  authorization?: SyncConnectionIdentity | null;
}
/** Detach and validate page limits, filter selection, and enrollment-bound cursor evidence. */
export function parseSyncQueuePageInput(
  scope: SyncQueueScope,
  options: unknown
): {
  limit: number;
  cursor: SyncQueueCursor | null;
  filter: SyncQueueFilter;
  explicitFilter: boolean;
  order: NonNullable<SyncQueueCursor['order']>;
} {
  const input: unknown = structuredClone(options);
  if (!isRecord(input)) throw new Error('Invalid sync queue page.');
  const limit = input['limit'] === undefined ? 50 : input['limit'];
  if (!queueOrdinal(limit) || limit < 1 || limit > 128)
    throw new Error('Invalid sync queue page limit.');
  const filter = input['filter'] === undefined ? 'all' : input['filter'];
  if (filter !== 'all' && filter !== 'problems' && filter !== 'action-required')
    throw new Error('Invalid sync queue filter.');
  const explicitFilter = input['filter'] !== undefined;
  const order: NonNullable<SyncQueueCursor['order']> =
    filter === 'all' ? 'primary-key' : 'status-primary-key';
  const cursor = input['cursor'];
  let acceptedCursor: SyncQueueCursor | null = null;
  if (cursor !== undefined && cursor !== null) {
    const cursorScope = isRecord(cursor) ? parseSyncQueueScope(cursor['scope']) : null;
    if (
      !isRecord(cursor) ||
      !cursorScope ||
      !sameQueueScope(scope, cursorScope) ||
      !queueIdentity(cursor['afterOperationId'])
    )
      throw new Error('Invalid sync queue cursor.');
    acceptedCursor = { scope: cursorScope, afterOperationId: cursor['afterOperationId'] };
    if (explicitFilter || cursor['filter'] !== undefined) {
      const authorization =
        cursor['authorization'] === null
          ? null
          : parseSyncConnectionIdentity(cursor['authorization']);
      if (
        !explicitFilter ||
        cursor['filter'] !== filter ||
        cursor['order'] !== order ||
        (cursor['authorization'] !== null && !authorization) ||
        (filter !== 'all' && cursor['status'] !== 'failed' && cursor['status'] !== 'interrupted') ||
        (filter === 'all' && cursor['status'] !== undefined)
      )
        throw new Error('Invalid sync queue cursor.');
      acceptedCursor = { ...acceptedCursor, filter, order, authorization };
      if (cursor['status'] === 'failed' || cursor['status'] === 'interrupted')
        acceptedCursor.status = cursor['status'];
    } else if (filter !== 'all') throw new Error('Invalid sync queue cursor.');
  }
  return { limit, cursor: acceptedCursor, filter, explicitFilter, order };
}
function actionRequired(
  admission: QueuePageAdmission,
  row: SyncQueueOperation,
  authorization: SyncConnectionIdentity | null
): boolean {
  const automatic = row.status === 'interrupted' || row.failureCode === 'temporary';
  if (automatic && !admission.retryConnectionMatches(row, authorization)) return true;
  // Legacy count zero awaits schedule initialization; exhausted native retries retain count five.
  return !automatic || (row.nextDueAt === null && row.automaticRetryCount > 0);
}
async function countProblems(tx: QueueTransaction, scope: SyncQueueScope): Promise<number> {
  const store = tx.objectStore(SYNC_OUTBOX_STORE);
  const index = store.index(SYNC_QUEUE_SCOPE_STATUS_INDEX);
  const fields = ['kind', 'status', 'spaceId', 'connectionGeneration', 'profileCreatedAt'];
  const keyPath: unknown = index.keyPath;
  if (
    !Array.isArray(keyPath) ||
    keyPath.length !== fields.length ||
    !fields.every((field, offset) => keyPath[offset] === field)
  )
    throw new Error('Invalid sync queue page index.');
  const statuses = [
    'queued',
    'running',
    'paused',
    'cancelled',
    'failed',
    'interrupted',
    'published',
  ];
  const counts = await Promise.all(
    statuses.map((status) =>
      index.count(
        IDBKeyRange.only([
          'queue-operation',
          status,
          scope.spaceId,
          scope.connectionGeneration,
          scope.profileCreatedAt,
        ])
      )
    )
  );
  const prefix = queueOperationPrefix(scope);
  const total = await store.count(
    IDBKeyRange.bound(prefix, `${prefix.slice(0, -1)};`, false, true)
  );
  if (
    counts.some((count) => !queueOrdinal(count)) ||
    !queueOrdinal(total) ||
    counts.reduce((sum, count) => sum + count, 0) !== total
  )
    throw new Error('Invalid sync queue page index coverage.');
  return counts[4]! + counts[5]!;
}
async function filteredPage(
  tx: QueueTransaction,
  scope: SyncQueueScope,
  input: ReturnType<typeof parseSyncQueuePageInput>,
  authorization: SyncConnectionIdentity | null,
  admission: QueuePageAdmission
) {
  const store = tx.objectStore(SYNC_OUTBOX_STORE);
  const index = store.index(SYNC_QUEUE_SCOPE_STATUS_INDEX);
  const operations: SyncQueueOperation[] = [];
  const sources: SyncQueueSource[] = [];
  let scanned = 0;
  let last: SyncQueueCursor | null = input.cursor;
  let more = false;
  for (const status of ['failed', 'interrupted'] as const) {
    if (input.cursor?.status === 'interrupted' && status === 'failed') continue;
    const key = [
      'queue-operation',
      status,
      scope.spaceId,
      scope.connectionGeneration,
      scope.profileCreatedAt,
    ];
    let cursor = await index.openKeyCursor(IDBKeyRange.only(key));
    if (cursor && input.cursor?.status === status) {
      const after = queueOperationKey(scope, input.cursor.afterOperationId);
      if (typeof cursor.primaryKey !== 'string') throw new Error('Invalid sync queue page key.');
      if (cursor.primaryKey < after) cursor = await cursor.continuePrimaryKey(key, after);
      if (cursor?.primaryKey === after) cursor = await cursor.continue();
    }
    while (cursor) {
      if (scanned >= 128 || operations.length >= input.limit) {
        more = true;
        break;
      }
      const row = parseSyncQueueOperation(await store.get(cursor.primaryKey));
      if (
        !row ||
        !sameQueueScope(row, scope) ||
        row.status !== status ||
        row.key !== cursor.primaryKey
      )
        throw new Error('Invalid sync queue operation.');
      scanned += 1;
      last = {
        scope,
        afterOperationId: row.operationId,
        filter: input.filter,
        order: 'status-primary-key',
        status,
        authorization,
      };
      if (input.filter === 'problems' || actionRequired(admission, row, authorization)) {
        const joined = await admission.readCapture(tx, scope, row.operationId);
        operations.push(joined.operation);
        sources.push(queueSource(admission, joined.capture, joined.operation, authorization));
      }
      cursor = await cursor.continue();
    }
    if (more) break;
  }
  return { operations, sources, nextCursor: more ? last : null };
}
/** Display metadata from the exact retained capture admitted with its queue operation. */
interface SyncQueueSource {
  operationId: string;
  rootKind: CaptureRootKind;
  rootId: string;
  changeKind: CapturedChange['change']['kind'];
  label: string;
  createdAt: number;
  retryAllowed?: boolean;
  retryBlocked?: 'connection-replaced' | null;
}
function queueSource(
  admission: QueuePageAdmission,
  capture: CaptureOperation,
  operation?: SyncQueueOperation,
  authorization?: SyncConnectionIdentity | null
): SyncQueueSource {
  const retryable = operation?.status === 'failed' || operation?.status === 'interrupted';
  const controls: Pick<SyncQueueSource, 'retryAllowed' | 'retryBlocked'> =
    operation && authorization !== undefined
      ? {
          retryAllowed: retryable && admission.retryConnectionMatches(operation, authorization),
          retryBlocked:
            retryable && !admission.retryConnectionMatches(operation, authorization)
              ? 'connection-replaced'
              : null,
        }
      : {};
  return {
    operationId: capture.operationId,
    rootKind: capture.rootKind,
    rootId: capture.rootId,
    changeKind: capture.source.changeKind,
    label: capture.source.label,
    createdAt: capture.createdAt,
    ...controls,
  };
}
/** Read bounded projections using the queue owner's admitted transaction and capture joins. */
export async function readSyncQueuePageInTransaction(
  tx: QueueTransaction,
  scope: SyncQueueScope,
  input: ReturnType<typeof parseSyncQueuePageInput>,
  admission: QueuePageAdmission
) {
  const { limit } = input;
  const afterOperationId = input.cursor?.afterOperationId ?? null;
  const authorization = input.explicitFilter ? await admission.readAuthorization(tx, scope) : null;
  if (input.cursor?.filter !== undefined) {
    const expected = input.cursor.authorization;
    if (
      expected === undefined ||
      (expected === null
        ? authorization !== null
        : authorization === null || !sameSyncConnectionIdentity(expected, authorization))
    )
      throw new Error('Sync queue page connection changed.');
  }
  const problemCount = input.explicitFilter ? await countProblems(tx, scope) : null;
  const pendingSummary = input.explicitFilter
    ? await readSyncPendingCheckpointSummaryInTransaction(tx, scope)
    : null;
  const pending =
    pendingSummary === null
      ? null
      : {
          count: pendingSummary.pendingRoots,
          minimumDueAt: pendingSummary.minimumPendingDueAt,
        };
  if (input.filter !== 'all') {
    const page = await filteredPage(tx, scope, input, authorization, admission);
    return { ...page, problemCount, pending };
  }
  const prefix = queueOperationPrefix(scope);
  const range = IDBKeyRange.bound(
    afterOperationId === null ? prefix : queueOperationKey(scope, afterOperationId),
    `${prefix}\uffff`,
    afterOperationId !== null
  );
  const rows: unknown[] = await tx.objectStore(SYNC_OUTBOX_STORE).getAll(range, limit + 1);
  const operations: SyncQueueOperation[] = [];
  const sources: SyncQueueSource[] = [];
  for (const raw of rows) {
    const row = parseSyncQueueOperation(raw);
    if (!row || !sameQueueScope(row, scope)) throw new Error('Invalid sync queue operation.');
    const joined = await admission.readCapture(tx, scope, row.operationId);
    operations.push(joined.operation);
    sources.push(
      input.explicitFilter
        ? queueSource(admission, joined.capture, joined.operation, authorization)
        : queueSource(admission, joined.capture)
    );
  }
  const more = operations.length > limit;
  if (more) {
    operations.pop();
    sources.pop();
  }
  const last = operations.at(-1);
  const nextCursor: SyncQueueCursor | null =
    more && last
      ? {
          scope,
          afterOperationId: last.operationId,
          ...(input.explicitFilter
            ? { filter: input.filter, order: input.order, authorization }
            : {}),
        }
      : null;
  return { operations, nextCursor, sources, problemCount, pending };
}
