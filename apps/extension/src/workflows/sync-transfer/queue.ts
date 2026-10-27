import {
  initDB,
  SYNC_CAPTURE_STORE,
} from '../../composition/persistence/infrastructure/indexed-db/core';
import { parseSyncCaptureRecord } from '../../composition/persistence/sync-capture/guards';
import {
  advanceSyncQueueRun,
  beginSyncQueueRun,
  completeSyncQueueRun,
  failSyncQueueRun,
  loadSyncQueueOperation,
  recoverSyncQueueRun,
  type SyncQueueOperation,
  type SyncQueueRun,
  type SyncQueueScope,
  type SyncQueueStage,
} from '../../composition/persistence/sync-capture/queue';
import type { SyncQueueFailureCode } from '../../composition/persistence/sync-capture/queue-model';
import { loadVerifiedOutgoingResult } from '../../composition/persistence/sync-capture/outgoing-results';
import type { SyncConnectionIdentity } from '../../composition/persistence/remote-connection/model';
import type { scanSyncCatalog } from './catalog';
import {
  dispatchPreparedOutgoing,
  findObservedOutgoingPublication,
  prepareCapturedOutgoing,
} from './outgoing';
import { SyncRemoteError, type SyncRemoteStore } from './remote-store';
import { SyncWorkspaceError } from './workspace';
import { hashSyncText } from './wire-record';

type QueueResult = { status: 'busy' } | { status: 'finished'; operation: SyncQueueOperation };
type Catalog = Awaited<ReturnType<typeof scanSyncCatalog>>;

function lockName(scope: SyncQueueScope, operationId: string): string {
  const identity = JSON.stringify([
    scope.spaceId,
    scope.connectionGeneration,
    scope.profileCreatedAt,
    operationId,
  ]);
  return `sniptale-sync-operation:${hashSyncText(identity)}`;
}
function failureCode(error: unknown): SyncQueueFailureCode {
  if (error instanceof SyncWorkspaceError) {
    if (error.code === 'unavailable') return 'temporary';
    if (error.code === 'cancelled') return 'interrupted';
    return 'invalid-workspace';
  }
  if (error instanceof SyncRemoteError) {
    switch (error.code) {
      case 'authentication':
        return 'authentication';
      case 'access-denied':
        return 'access-denied';
      case 'storage-full':
        return 'storage-full';
      case 'transport':
      case 'temporary':
        return 'temporary';
      case 'cancelled':
        return 'interrupted';
      case 'collision':
      case 'invalid-configuration':
      case 'invalid-key':
      case 'invalid-response':
      case 'metadata-limit':
      case 'missing':
      case 'unsupported-cursor':
        return 'internal';
    }
  }
  return 'internal';
}

/** Recover only after the native live runner lock is available. No timer establishes this fact. */
export async function recoverInterruptedSyncQueueOperation(
  scope: SyncQueueScope,
  operationId: string,
  expectedRevision: number
): Promise<QueueResult> {
  const frozen = structuredClone(scope);
  return navigator.locks.request(
    lockName(frozen, operationId),
    { mode: 'exclusive', ifAvailable: true },
    async (lock) => {
      if (!lock) return { status: 'busy' };
      const row = await loadSyncQueueOperation(frozen, operationId);
      if (row.status !== 'running' || row.revision !== expectedRevision || !row.runId)
        throw new Error('Sync queue recovery refused.');
      const recovered = await recoverSyncQueueRun({
        scope: frozen,
        operationId,
        revision: row.revision,
        runId: row.runId,
        authorization: row.authorization,
      });
      return { status: 'finished', operation: recovered };
    }
  );
}

/** Execute one explicitly admitted operation. The production lifecycle must also gate each HTTP request. */
export async function runSyncQueueOperation(input: {
  scope: SyncQueueScope;
  operationId: string;
  expectedRevision: number;
  authorization?: SyncConnectionIdentity;
  remote: SyncRemoteStore;
  signal: AbortSignal;
  authorize: () => Promise<void>;
  catalog?: Catalog;
}): Promise<QueueResult> {
  const scope = structuredClone(input.scope);
  const operationId = input.operationId;
  const expectedRevision = input.expectedRevision;
  const authorization = input.authorization ? structuredClone(input.authorization) : undefined;
  const catalog = input.catalog ? structuredClone(input.catalog) : undefined;
  const { signal, remote, authorize } = input;
  signal.throwIfAborted();
  return navigator.locks.request(
    lockName(scope, operationId),
    { mode: 'exclusive', ifAvailable: true },
    async (lock) => {
      if (!lock) return { status: 'busy' };
      const current = await loadSyncQueueOperation(scope, operationId);
      if (current.revision !== expectedRevision) throw new Error('Stale sync queue execution.');
      if (current.status === 'published') return { status: 'finished', operation: current };
      const db = await initDB();
      const tx = db.transaction([SYNC_CAPTURE_STORE], 'readonly');
      const capture = parseSyncCaptureRecord(
        await tx.objectStore(SYNC_CAPTURE_STORE).get(current.captureKey)
      );
      await tx.done;
      if (
        !capture ||
        capture.kind !== 'sync-operation' ||
        capture.operationId !== operationId ||
        capture.spaceId !== scope.spaceId ||
        capture.connectionGeneration !== scope.connectionGeneration ||
        capture.profileCreatedAt !== scope.profileCreatedAt ||
        capture.sourceSha256 !== current.captureSha256
      )
        throw new Error('Invalid sync queue source.');
      const run = await beginSyncQueueRun(scope, operationId, expectedRevision, authorization);
      try {
        const accepted = await loadVerifiedOutgoingResult(
          scope.spaceId,
          scope.connectionGeneration,
          operationId
        );
        if (accepted)
          return {
            status: 'finished',
            operation: await completeSyncQueueRun(run, { kind: 'verified', result: accepted }),
          };
        const prepared = await prepareCapturedOutgoing(capture);
        const observed = await findObservedOutgoingPublication(prepared, catalog);
        if (observed)
          return {
            status: 'finished',
            operation: await completeSyncQueueRun(run, {
              kind: 'observed',
              prepared,
              attempt: observed,
            }),
          };
        await advanceSyncQueueRun(run, 'checking');
        const admitted = admitRemote(remote, run, signal, authorize);
        await dispatchPreparedOutgoing(scope.spaceId, operationId, admitted, signal, {
          ...(catalog ? { catalog } : {}),
          admitAttempt: async (attempt) => {
            await advanceSyncQueueRun(run, 'checking', attempt.attemptId);
          },
        });
        const result = await loadVerifiedOutgoingResult(
          scope.spaceId,
          scope.connectionGeneration,
          operationId
        );
        if (!result) throw new Error('Sync queue publication evidence missing.');
        return {
          status: 'finished',
          operation: await completeSyncQueueRun(run, { kind: 'verified', result }),
        };
      } catch (error) {
        return finishFailure(run, signal.aborted ? 'interrupted' : failureCode(error));
      }
    }
  );
}

function admitRemote(
  remote: SyncRemoteStore,
  run: SyncQueueRun,
  signal: AbortSignal,
  authorize: () => Promise<void>
): SyncRemoteStore {
  const admit = async (stage: SyncQueueStage) => {
    signal.throwIfAborted();
    await authorize();
    signal.throwIfAborted();
    await advanceSyncQueueRun(run, stage);
    signal.throwIfAborted();
  };
  return {
    list: async (prefix, options) => {
      await admit('checking');
      return remote.list(prefix, options);
    },
    stat: async (key, abort) => {
      await admit('checking');
      return remote.stat(key, abort);
    },
    read: async (key, abort) => {
      await admit(key.startsWith('.sniptale/') ? 'verifying' : 'writing');
      return remote.read(key, abort);
    },
    write: async (key, body, abort) => {
      await admit(key.startsWith('.sniptale/') ? 'publishing' : 'writing');
      return remote.write(key, body, abort);
    },
  };
}
async function finishFailure(run: SyncQueueRun, code: SyncQueueFailureCode): Promise<QueueResult> {
  try {
    return { status: 'finished', operation: await failSyncQueueRun(run, code) };
  } catch {
    const current = await loadSyncQueueOperation(run.scope, run.operationId);
    if (current.runId === run.runId && current.revision === run.revision)
      throw new Error('Sync queue failure could not persist.');
    return { status: 'finished', operation: current };
  }
}
