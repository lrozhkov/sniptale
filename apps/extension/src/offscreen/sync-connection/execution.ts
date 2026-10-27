import {
  initDB,
  SYNC_CAPTURE_STORE,
} from '../../composition/persistence/infrastructure/indexed-db/core';
import {
  loadSyncConnection,
  loadSyncConnectionAuthentication,
} from '../../composition/persistence/remote-connection/store';
import {
  sameConnectionScope,
  sameSyncConnectionIdentity,
} from '../../composition/persistence/remote-connection/model';
import { loadSyncQueueOperation } from '../../composition/persistence/sync-capture/queue';
import { createSyncConnectionRequests } from '../../workflows/sync-transfer/connection-requests';
import { runSyncQueueOperation } from '../../workflows/sync-transfer/queue';
import { createDiagnosticPortWriter } from '../../platform/runtime-messaging/diagnostic-capture';
import { SyncRemoteError } from '../../workflows/sync-transfer/remote-store';
import { createWebdavRemoteStore } from '../../workflows/sync-transfer/webdav';
import type { SyncExecutorBinding } from '../../contracts/messaging/contracts/runtime-message/sync-connection.types';
import type { SyncExecutionInput, SyncExecutionResult } from './executor';

function terminalSnapshot(
  result: Awaited<ReturnType<typeof runSyncQueueOperation>>,
  stage: SyncExecutionResult['snapshot']['stage']
): SyncExecutionResult['snapshot'] {
  if (result.status === 'busy') return { state: 'busy', stage, runId: null, failureCode: null };
  const row = result.operation;
  let state: SyncExecutionResult['snapshot']['state'] = 'failed';
  if (row.status === 'published') state = 'published';
  if (row.status === 'interrupted') state = 'interrupted';
  return { state, stage: row.stage, runId: row.runId, failureCode: row.failureCode };
}
function refusedSnapshot(error: unknown, aborted: boolean): SyncExecutionResult['snapshot'] {
  if (aborted)
    return { state: 'interrupted', stage: 'queued', failureCode: 'interrupted', runId: null };
  let failureCode: SyncExecutionResult['snapshot']['failureCode'] = 'internal';
  if (
    error instanceof SyncRemoteError &&
    (error.code === 'authentication' || error.code === 'access-denied')
  )
    failureCode = error.code;
  return { state: 'failed', stage: 'queued', failureCode, runId: null };
}

/** Own one native queue workflow and all of its HTTP requests until containment. */
export function createSyncQueueExecution(
  input: SyncExecutionInput,
  hasOriginPermission: (origin: string) => Promise<boolean>
) {
  const { operationId, expectedRevision, signal } = input;
  const selection: SyncExecutorBinding = structuredClone({
    scope: input.scope,
    authorization: input.authorization,
  });
  const requests = createSyncConnectionRequests({
    identity: selection.authorization,
    hasOriginPermission,
  });
  async function current() {
    signal.throwIfAborted();
    const connection = await loadSyncConnection();
    if (
      !connection ||
      connection.phase !== 'active' ||
      !sameConnectionScope(connection.binding, selection.scope) ||
      !sameSyncConnectionIdentity(connection.identity, selection.authorization)
    )
      throw new SyncRemoteError('authentication');
    signal.throwIfAborted();
    return connection;
  }
  return {
    drain: requests.close,
    async run(): Promise<SyncExecutionResult> {
      let snapshot: SyncExecutionResult['snapshot'] = {
        state: 'failed',
        stage: 'queued',
        failureCode: 'internal',
        runId: null,
      };
      try {
        const connection = await current();
        const operation = await loadSyncQueueOperation(selection.scope, operationId);
        if (operation.revision !== expectedRevision)
          throw new Error('Sync queue selection refused.');
        const db = await initDB();
        const capture: unknown = await db.get(SYNC_CAPTURE_STORE, operation.captureKey);
        const remote = await createWebdavRemoteStore(
          {
            rootUrl: connection.binding.rootUrl,
            authentication: () => loadSyncConnectionAuthentication(selection.authorization),
            request: requests.request,
          },
          signal
        );
        const result = await runSyncQueueOperation({
          ...selection,
          operationId,
          expectedRevision,
          capture,
          remote,
          signal,
          authorize: async () => {
            await current();
          },
        });
        snapshot = terminalSnapshot(result, operation.stage);
      } catch (error) {
        snapshot = refusedSnapshot(error, signal.aborted);
      }
      try {
        await requests.close();
        if (!signal.aborted) {
          const history = createDiagnosticPortWriter();
          history.send({
            kind: 'sync-queue',
            input: { scope: selection.scope, source: { kind: 'operation', operationId } },
          });
          history.send({
            kind: 'sync-queue',
            input: { scope: selection.scope, source: { kind: 'connection' } },
          });
        }
        return { snapshot, containment: 'contained' };
      } catch {
        return { snapshot, containment: 'unsafe' };
      }
    },
  };
}
