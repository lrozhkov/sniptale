import type { IDBPTransaction } from 'idb';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { initDB } from '../infrastructure/indexed-db/core';
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
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { parseSyncCaptureRecord } from './guards';
import { matchesCapture, parsePrepared, preparedOutgoingOperationKey } from './outgoing';
import { matchesOutgoingDispatchPrepared, parseOutgoingDispatchAttempt } from './outgoing-attempts';
import {
  parseVerifiedOutgoingResult,
  verifiedOutgoingResultKey,
  matchesVerifiedOutgoingResult,
} from './outgoing-results';
import {
  parseSyncQueueScope,
  parseSyncQueueConnection,
  parseSyncQueueOperation,
  queueConnectionKey,
  queueOperationKey,
  queueOperationPrefix,
  sameQueueScope,
  queueHash,
  queueOrdinal,
  queueIdentity,
  queueUuid,
  recordQueueTransition,
  SYNC_QUEUE_STAGES,
  SYNC_QUEUE_FAILURE_CODES,
  type SyncQueueScope,
  type SyncQueueConnection,
  type SyncQueueOperation,
  type SyncQueueRun,
  type SyncQueueStage,
  type SyncQueueFailureCode,
} from './queue-model';
export type {
  SyncQueueScope,
  SyncQueueConnection,
  SyncQueueOperation,
  SyncQueueRun,
  SyncQueueStage,
  SyncQueueFailureCode,
} from './queue-model';

type QueueTransaction = IDBPTransaction<unknown, string[], 'readwrite' | 'readonly'>;
function scopeInput(value: unknown): SyncQueueScope {
  const scope = parseSyncQueueScope(structuredClone(value));
  if (!scope) throw new Error('Invalid sync queue scope.');
  return scope;
}
function nextRevision(revision: number): number {
  if (!queueOrdinal(revision) || !Number.isSafeInteger(revision + 1))
    throw new Error('Sync queue revision exhausted.');
  return revision + 1;
}
function defaultConnection(scope: SyncQueueScope): SyncQueueConnection {
  return {
    ...scope,
    version: 1,
    kind: 'queue-connection',
    key: queueConnectionKey(scope),
    revision: 0,
    paused: false,
    eventSequence: 0,
    pendingTransitions: [],
    droppedTransitions: 0,
  };
}
async function checkProfile(tx: QueueTransaction, scope: SyncQueueScope): Promise<void> {
  const profile = parseSyncCaptureRecord(await tx.objectStore(SYNC_CAPTURE_STORE).get('profile'));
  if (
    !profile ||
    profile.kind !== 'profile' ||
    profile.spaceId !== scope.spaceId ||
    profile.connectionGeneration !== scope.connectionGeneration ||
    profile.createdAt !== scope.profileCreatedAt
  )
    throw new Error('Sync queue profile changed.');
}
async function readConnection(
  tx: QueueTransaction,
  scope: SyncQueueScope
): Promise<SyncQueueConnection> {
  const raw: unknown = await tx.objectStore(SYNC_OUTBOX_STORE).get(queueConnectionKey(scope));
  if (raw === undefined) return defaultConnection(scope);
  const row = parseSyncQueueConnection(raw);
  if (!row || !sameQueueScope(row, scope)) throw new Error('Invalid sync queue connection.');
  return row;
}
async function readOperation(
  tx: QueueTransaction,
  scope: SyncQueueScope,
  id: string
): Promise<SyncQueueOperation> {
  const row = parseSyncQueueOperation(
    await tx.objectStore(SYNC_OUTBOX_STORE).get(queueOperationKey(scope, id))
  );
  if (!row || !sameQueueScope(row, scope) || row.operationId !== id)
    throw new Error('Invalid sync queue operation.');
  const capture = parseSyncCaptureRecord(
    await tx.objectStore(SYNC_CAPTURE_STORE).get(row.captureKey)
  );
  if (
    !capture ||
    capture.kind !== 'captured-change' ||
    capture.operationId !== row.operationId ||
    capture.spaceId !== row.spaceId ||
    capture.connectionGeneration !== row.connectionGeneration ||
    capture.rootKey !== row.rootKey ||
    capture.generation !== row.generation ||
    queueHash(JSON.stringify(capture)) !== row.captureSha256
  )
    throw new Error('Sync queue capture changed.');
  return row;
}
async function withSyncQueueTransaction<T>(
  mutate: (tx: IDBPTransaction<unknown, string[], 'readwrite'>) => Promise<T>
): Promise<T> {
  return runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(
      [SYNC_CAPTURE_STORE, SYNC_OUTBOX_STORE, SYNC_CONNECTION_STORE],
      'readwrite'
    );
    try {
      const result = await mutate(tx);
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
async function mutateQueue<T>(
  scope: SyncQueueScope,
  mutate: (tx: IDBPTransaction<unknown, string[], 'readwrite'>) => Promise<T>
): Promise<T> {
  return withSyncQueueTransaction(async (tx) => {
    await checkProfile(tx, scope);
    return mutate(tx);
  });
}
/** Read validated control and retained native capture joins without writes. */
export async function loadSyncQueue(
  value: SyncQueueScope
): Promise<{ connection: SyncQueueConnection; operations: SyncQueueOperation[] }> {
  const scope = scopeInput(value);
  const db = await initDB();
  const tx = db.transaction([SYNC_CAPTURE_STORE, SYNC_OUTBOX_STORE], 'readonly');
  await checkProfile(tx, scope);
  const connection = await readConnection(tx, scope);
  const prefix = queueOperationPrefix(scope);
  const rows: unknown[] = await tx
    .objectStore(SYNC_OUTBOX_STORE)
    .getAll(IDBKeyRange.bound(prefix, `${prefix}\uffff`), 129);
  const operations: SyncQueueOperation[] = [];
  for (const raw of rows) {
    if (isRecord(raw) && typeof raw['key'] === 'string' && !raw['key'].startsWith(prefix)) continue;
    const row = parseSyncQueueOperation(raw);
    if (!row || !sameQueueScope(row, scope)) throw new Error('Invalid sync queue operation.');
    operations.push(await readOperation(tx, scope, row.operationId));
  }
  if (operations.length > 128) throw new Error('Sync queue operation limit.');
  await tx.done;
  return { connection, operations };
}
/** Admit a native source inside a caller-owned queue transaction. This operation writes no rows. */
export async function readSyncQueueSourceInTransaction(
  tx: QueueTransaction,
  value: SyncQueueScope,
  operationId: string | null
): Promise<SyncQueueConnection | SyncQueueOperation> {
  const scope = scopeInput(value);
  if (operationId !== null && !queueIdentity(operationId))
    throw new Error('Invalid sync queue operation identity.');
  await checkProfile(tx, scope);
  return operationId === null ? readConnection(tx, scope) : readOperation(tx, scope, operationId);
}
/** Continuation within one enrollment lifetime. Pages are live reads, not a shared snapshot. */
interface SyncQueueCursor {
  scope: SyncQueueScope;
  afterOperationId: string;
}
/** Read one exact retained capture join without scanning unrelated operations. */
export async function loadSyncQueueOperation(
  value: SyncQueueScope,
  operationId: string
): Promise<SyncQueueOperation> {
  const scope = scopeInput(value);
  if (!queueIdentity(operationId)) throw new Error('Invalid sync queue operation identity.');
  const db = await initDB();
  const tx = db.transaction([SYNC_CAPTURE_STORE, SYNC_OUTBOX_STORE], 'readonly');
  await checkProfile(tx, scope);
  const operation = await readOperation(tx, scope, operationId);
  await tx.done;
  return operation;
}
function pageInput(scope: SyncQueueScope, options: unknown) {
  const input: unknown = structuredClone(options);
  if (!isRecord(input)) throw new Error('Invalid sync queue page.');
  const limit = input['limit'] === undefined ? 50 : input['limit'];
  if (!queueOrdinal(limit) || limit < 1 || limit > 128)
    throw new Error('Invalid sync queue page limit.');
  const cursor = input['cursor'];
  let afterOperationId: string | null = null;
  if (cursor !== undefined && cursor !== null) {
    const cursorScope = isRecord(cursor) ? parseSyncQueueScope(cursor['scope']) : null;
    if (
      !isRecord(cursor) ||
      !cursorScope ||
      !sameQueueScope(scope, cursorScope) ||
      !queueIdentity(cursor['afterOperationId'])
    )
      throw new Error('Invalid sync queue cursor.');
    afterOperationId = cursor['afterOperationId'];
  }
  return { limit, afterOperationId };
}
/** Read bounded native pages. Refresh from the beginning to discover earlier insertions. */
export async function loadSyncQueuePage(value: SyncQueueScope, options: unknown = {}) {
  const scope = scopeInput(value);
  const { limit, afterOperationId } = pageInput(scope, options);
  const db = await initDB();
  const tx = db.transaction([SYNC_CAPTURE_STORE, SYNC_OUTBOX_STORE], 'readonly');
  await checkProfile(tx, scope);
  const connection = await readConnection(tx, scope);
  const prefix = queueOperationPrefix(scope);
  const range = IDBKeyRange.bound(
    afterOperationId === null ? prefix : queueOperationKey(scope, afterOperationId),
    `${prefix}\uffff`,
    afterOperationId !== null
  );
  const rows: unknown[] = await tx.objectStore(SYNC_OUTBOX_STORE).getAll(range, limit + 1);
  const operations: SyncQueueOperation[] = [];
  for (const raw of rows) {
    const row = parseSyncQueueOperation(raw);
    if (!row || !sameQueueScope(row, scope)) throw new Error('Invalid sync queue operation.');
    operations.push(await readOperation(tx, scope, row.operationId));
  }
  await tx.done;
  const more = operations.length > limit;
  if (more) operations.pop();
  const last = operations.at(-1);
  const nextCursor: SyncQueueCursor | null =
    more && last ? { scope, afterOperationId: last.operationId } : null;
  return { connection, operations, nextCursor };
}
/** Freeze the exact retained native capture identity; repeated enqueue is idempotent. */
export async function enqueueSyncQueueOperation(value: unknown): Promise<SyncQueueOperation> {
  const capture = parseSyncCaptureRecord(structuredClone(value));
  if (!capture || capture.kind !== 'captured-change')
    throw new Error('Invalid sync queue capture.');
  return withSyncQueueTransaction(async (tx) => {
    const profile = parseSyncCaptureRecord(await tx.objectStore(SYNC_CAPTURE_STORE).get('profile'));
    const current = parseSyncCaptureRecord(
      await tx.objectStore(SYNC_CAPTURE_STORE).get(capture.key)
    );
    if (
      !profile ||
      profile.kind !== 'profile' ||
      profile.spaceId !== capture.spaceId ||
      profile.connectionGeneration !== capture.connectionGeneration ||
      !current ||
      JSON.stringify(current) !== JSON.stringify(capture)
    )
      throw new Error('Sync queue capture changed.');
    const scope = {
      spaceId: profile.spaceId,
      connectionGeneration: profile.connectionGeneration,
      profileCreatedAt: profile.createdAt,
    };
    const connection = await readConnection(tx, scope);
    const store = tx.objectStore(SYNC_OUTBOX_STORE);
    const key = queueOperationKey(scope, capture.operationId);
    const raw: unknown = await store.get(key);
    if (raw !== undefined) {
      const accepted = await readOperation(tx, scope, capture.operationId);
      return accepted;
    }
    const row: SyncQueueOperation = recordQueueTransition(
      {
        ...scope,
        version: 1,
        kind: 'queue-operation',
        key,
        operationId: capture.operationId,
        captureKey: capture.key,
        captureSha256: queueHash(JSON.stringify(capture)),
        rootKey: capture.rootKey,
        generation: capture.generation,
        revision: 1,
        status: 'queued',
        stage: 'queued',
        runId: null,
        authorization: null,
        writeStarted: false,
        outcome: 'none',
        attemptId: null,
        failureCode: null,
        eventSequence: 0,
        pendingTransitions: [],
        droppedTransitions: 0,
      },
      'enqueued'
    );
    await store.add(row);
    await store.put(
      recordQueueTransition(
        { ...connection, revision: nextRevision(connection.revision) },
        'enqueued'
      )
    );
    return row;
  });
}

/** Pause controls future admissions without changing capture enrollment or active run identity. */
export async function commandSyncQueue(
  value: SyncQueueScope,
  expectedRevision: number,
  command: 'pause' | 'resume'
): Promise<SyncQueueConnection> {
  const scope = scopeInput(value);
  if (!queueOrdinal(expectedRevision) || (command !== 'pause' && command !== 'resume'))
    throw new Error('Invalid sync queue command.');
  return mutateQueue(scope, async (tx) => {
    const current = await readConnection(tx, scope);
    if (current.revision !== expectedRevision) throw new Error('Stale sync queue command.');
    const row = recordQueueTransition(
      { ...current, paused: command === 'pause', revision: nextRevision(current.revision) },
      command === 'pause' ? 'paused' : 'resumed'
    );
    await tx.objectStore(SYNC_OUTBOX_STORE).put(row);
    return row;
  });
}
/** Operation controls fence delayed callbacks and retain every source row. */
export async function commandSyncQueueOperation(
  value: SyncQueueScope,
  id: string,
  expectedRevision: number,
  command: 'pause' | 'resume' | 'retry' | 'cancel'
): Promise<SyncQueueOperation> {
  const scope = scopeInput(value);
  if (
    !queueIdentity(id) ||
    !queueOrdinal(expectedRevision) ||
    !['pause', 'resume', 'retry', 'cancel'].includes(command)
  )
    throw new Error('Invalid sync queue operation command.');
  return mutateQueue(scope, async (tx) => {
    const current = await readOperation(tx, scope, id);
    if (current.revision !== expectedRevision)
      throw new Error('Stale sync queue operation command.');
    if (
      current.status === 'published' ||
      current.status === 'cancelled' ||
      (command === 'resume' && current.status !== 'paused') ||
      (command === 'retry' && !['failed', 'interrupted'].includes(current.status))
    )
      throw new Error('Sync queue operation command refused.');
    const status = command === 'pause' ? 'paused' : command === 'cancel' ? 'cancelled' : 'queued';
    const row = recordQueueTransition(
      {
        ...current,
        revision: nextRevision(current.revision),
        status,
        runId: null,
        outcome: current.writeStarted ? 'unknown' : current.outcome,
      },
      command === 'pause'
        ? 'paused'
        : command === 'cancel'
          ? 'cancelled'
          : command === 'retry'
            ? 'retried'
            : 'resumed'
    );
    await tx.objectStore(SYNC_OUTBOX_STORE).put(row);
    return row;
  });
}
/** Claim only while holding the native live operation lock in the workflow caller. */
export async function beginSyncQueueRun(
  value: SyncQueueScope,
  id: string,
  expectedRevision: number,
  authorization?: SyncConnectionIdentity
): Promise<SyncQueueRun> {
  const scope = scopeInput(value);
  const acceptedAuthorization =
    authorization === undefined
      ? null
      : parseSyncConnectionIdentity(structuredClone(authorization));
  if (authorization !== undefined && !acceptedAuthorization)
    throw new Error('Invalid sync queue authorization.');
  if (!queueIdentity(id) || !queueOrdinal(expectedRevision))
    throw new Error('Invalid sync queue run claim.');
  return mutateQueue(scope, async (tx) => {
    const connection = await readConnection(tx, scope);
    const current = await readOperation(tx, scope, id);
    if (connection.paused || current.revision !== expectedRevision || current.status !== 'queued')
      throw new Error('Sync queue run claim refused.');
    await checkSyncConnectionAdmission(tx, scope, acceptedAuthorization);
    const runId = crypto.randomUUID();
    const row = recordQueueTransition(
      {
        ...current,
        status: 'running',
        stage: 'preparing',
        runId,
        authorization: acceptedAuthorization,
        revision: nextRevision(current.revision),
        writeStarted: false,
        attemptId: null,
        failureCode: null,
      },
      'started'
    );
    await tx.objectStore(SYNC_OUTBOX_STORE).put(row);
    return {
      scope,
      operationId: id,
      runId,
      revision: row.revision,
      authorization: acceptedAuthorization,
    };
  });
}
function runInput(value: SyncQueueRun): SyncQueueRun {
  const detached = structuredClone(value);
  const scope = scopeInput(detached.scope);
  const authorization =
    detached.authorization === null ? null : parseSyncConnectionIdentity(detached.authorization);
  if (
    (detached.authorization !== null && !authorization) ||
    !queueIdentity(detached.operationId) ||
    !queueUuid(detached.runId) ||
    !queueOrdinal(detached.revision)
  )
    throw new Error('Invalid sync queue run.');
  return { ...detached, scope, authorization };
}
async function readRun(tx: QueueTransaction, run: SyncQueueRun): Promise<SyncQueueOperation> {
  const row = await readOperation(tx, run.scope, run.operationId);
  if (
    row.status !== 'running' ||
    row.runId !== run.runId ||
    row.revision !== run.revision ||
    (row.authorization === null
      ? run.authorization !== null
      : run.authorization === null ||
        !sameSyncConnectionIdentity(row.authorization, run.authorization))
  )
    throw new Error('Stale sync queue run.');
  return row;
}
/** Admit one subsequent stage or effect. Repeated writes retain one command revision. */
export async function advanceSyncQueueRun(
  value: SyncQueueRun,
  stage: SyncQueueStage,
  attemptId?: string
): Promise<SyncQueueOperation> {
  const run = runInput(value);
  if (
    !SYNC_QUEUE_STAGES.includes(stage) ||
    stage === 'queued' ||
    stage === 'published' ||
    (attemptId !== undefined && !queueUuid(attemptId))
  )
    throw new Error('Invalid sync queue stage.');
  return mutateQueue(run.scope, async (tx) => {
    const connection = await readConnection(tx, run.scope);
    const current = await readRun(tx, run);
    await checkSyncConnectionAdmission(tx, run.scope, current.authorization);
    if (
      connection.paused ||
      SYNC_QUEUE_STAGES.indexOf(stage) < SYNC_QUEUE_STAGES.indexOf(current.stage) ||
      (current.attemptId !== null && attemptId !== undefined && attemptId !== current.attemptId)
    )
      throw new Error('Sync queue stage admission refused.');
    if (stage === current.stage && (attemptId === undefined || attemptId === current.attemptId))
      return current;
    const row = recordQueueTransition(
      {
        ...current,
        stage,
        writeStarted: current.writeStarted || stage === 'writing' || stage === 'publishing',
        attemptId: attemptId ?? current.attemptId,
      },
      'advanced'
    );
    await tx.objectStore(SYNC_OUTBOX_STORE).put(row);
    return row;
  });
}
/** Preserve uncertainty after an issued effect; source evidence remains immutable. */
export async function failSyncQueueRun(
  value: SyncQueueRun,
  failureCode: SyncQueueFailureCode = 'internal'
): Promise<SyncQueueOperation> {
  const run = runInput(value);
  if (!SYNC_QUEUE_FAILURE_CODES.includes(failureCode))
    throw new Error('Invalid sync queue failure code.');
  return mutateQueue(run.scope, async (tx) => {
    const current = await readRun(tx, run);
    const row = recordQueueTransition(
      {
        ...current,
        failureCode,
        status: 'failed',
        revision: nextRevision(current.revision),
        runId: null,
        outcome: current.writeStarted ? 'unknown' : current.outcome,
      },
      'failed'
    );
    await tx.objectStore(SYNC_OUTBOX_STORE).put(row);
    return row;
  });
}
/** Explicit recovery requires the caller's native live lock and the exact abandoned run. */
export async function recoverSyncQueueRun(value: SyncQueueRun): Promise<SyncQueueOperation> {
  const run = runInput(value);
  return mutateQueue(run.scope, async (tx) => {
    const current = await readRun(tx, run);
    const row = recordQueueTransition(
      {
        ...current,
        failureCode: 'interrupted',
        status: 'interrupted',
        revision: nextRevision(current.revision),
        runId: null,
        outcome: current.writeStarted ? 'unknown' : current.outcome,
      },
      'interrupted'
    );
    await tx.objectStore(SYNC_OUTBOX_STORE).put(row);
    return row;
  });
}
/** Observed publication is distinct from acknowledged native dispatch and grants no release authority. */
type SyncQueueCompletionWitness =
  | { kind: 'verified'; result: unknown }
  | { kind: 'observed'; prepared: unknown; attempt: unknown };

async function readQueuePreparation(tx: QueueTransaction, current: SyncQueueOperation) {
  const prepared = parsePrepared(
    await tx
      .objectStore(SYNC_OUTBOX_STORE)
      .get(preparedOutgoingOperationKey(current.spaceId, current.operationId))
  );
  const capture = parseSyncCaptureRecord(
    await tx.objectStore(SYNC_CAPTURE_STORE).get(current.captureKey)
  );
  if (
    !prepared ||
    !capture ||
    capture.kind !== 'captured-change' ||
    !matchesCapture(prepared, capture) ||
    prepared.captureSha256 !== current.captureSha256 ||
    prepared.operationId !== current.operationId ||
    prepared.spaceId !== current.spaceId ||
    prepared.connectionGeneration !== current.connectionGeneration
  )
    throw new Error('Sync queue completion source changed.');
  return prepared;
}

type AcceptedQueueWitness =
  | { kind: 'verified'; result: NonNullable<ReturnType<typeof parseVerifiedOutgoingResult>> }
  | {
      kind: 'observed';
      prepared: NonNullable<ReturnType<typeof parsePrepared>>;
      attempt: NonNullable<ReturnType<typeof parseOutgoingDispatchAttempt>>;
    };
async function readQueueCompletionAttempt(
  tx: QueueTransaction,
  prepared: NonNullable<ReturnType<typeof parsePrepared>>,
  witness: AcceptedQueueWitness
) {
  const store = tx.objectStore(SYNC_OUTBOX_STORE);
  const result = witness.kind === 'verified' ? witness.result : null;
  const observedPrepared = witness.kind === 'observed' ? witness.prepared : null;
  let attempt = witness.kind === 'observed' ? witness.attempt : null;
  if (result) {
    const stored = parseVerifiedOutgoingResult(
      await store.get(
        verifiedOutgoingResultKey(
          prepared.spaceId,
          prepared.connectionGeneration,
          prepared.operationId
        )
      )
    );
    attempt = parseOutgoingDispatchAttempt(await store.get(result.attemptKey));
    if (
      !stored ||
      JSON.stringify(stored) !== JSON.stringify(result) ||
      !attempt ||
      !matchesOutgoingDispatchPrepared(attempt, prepared) ||
      !matchesVerifiedOutgoingResult(result, prepared, attempt)
    )
      throw new Error('Sync queue verified result changed.');
  } else if (
    !observedPrepared ||
    !attempt ||
    JSON.stringify(observedPrepared) !== JSON.stringify(prepared) ||
    !matchesOutgoingDispatchPrepared(attempt, prepared)
  ) {
    throw new Error('Sync queue observed publication changed.');
  }
  if (!attempt) throw new Error('Invalid sync queue publication attempt.');
  let physical: unknown;
  try {
    physical = JSON.parse(attempt.recordText);
  } catch {
    throw new Error('Invalid sync queue publication bytes.');
  }
  if (!isRecord(physical) || physical['operationText'] !== prepared.recordText)
    throw new Error('Sync queue publication logical bytes changed.');
  return attempt;
}

/** Complete an exact active run from native receipt joins or checked observed physical publication. */
export async function completeSyncQueueRun(
  value: SyncQueueRun,
  witness: SyncQueueCompletionWitness
): Promise<SyncQueueOperation> {
  const run = runInput(value);
  const detached: unknown = structuredClone(witness);
  if (!isRecord(detached)) throw new Error('Invalid sync queue completion.');
  const result =
    detached['kind'] === 'verified' ? parseVerifiedOutgoingResult(detached['result']) : null;
  const observedPrepared =
    detached['kind'] === 'observed' ? parsePrepared(detached['prepared']) : null;
  const observedAttempt =
    detached['kind'] === 'observed' ? parseOutgoingDispatchAttempt(detached['attempt']) : null;
  let acceptedWitness: AcceptedQueueWitness;
  if (result) acceptedWitness = { kind: 'verified', result };
  else if (
    observedPrepared &&
    observedAttempt &&
    matchesOutgoingDispatchPrepared(observedAttempt, observedPrepared)
  )
    acceptedWitness = { kind: 'observed', prepared: observedPrepared, attempt: observedAttempt };
  else throw new Error('Invalid sync queue completion witness.');
  return mutateQueue(run.scope, async (tx) => {
    const current = await readRun(tx, run);
    await checkSyncConnectionAdmission(tx, run.scope, current.authorization);
    const store = tx.objectStore(SYNC_OUTBOX_STORE);
    const prepared = await readQueuePreparation(tx, current);
    const attempt = await readQueueCompletionAttempt(tx, prepared, acceptedWitness);
    const row = recordQueueTransition(
      {
        ...current,
        status: 'published',
        stage: 'published',
        outcome: result ? 'verified' : 'observed',
        runId: null,
        revision: nextRevision(current.revision),
        attemptId: attempt.attemptId,
        failureCode: null,
      },
      'published'
    );
    await store.put(row);
    return row;
  });
}
