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
import { refreshPersistedSyncCatalog } from '../../workflows/sync-transfer/catalog-refresh';
import { releasePublishedOutgoing } from '../../workflows/sync-transfer/outgoing';
import { runSyncQueueOperation } from '../../workflows/sync-transfer/queue';
import { createDiagnosticPortWriter } from '../../platform/runtime-messaging/diagnostic-capture';
import { SyncRemoteError } from '../../workflows/sync-transfer/remote-store';
import { createWebdavRemoteStore } from '../../workflows/sync-transfer/webdav';
import type { SyncExecutorBinding } from '../../contracts/messaging/contracts/runtime-message/sync-connection.types';
import type {
  SyncExecutionInput,
  SyncExecutionResult,
  SyncWorkspaceExecutionInput,
  SyncWorkspaceExecutionResult,
} from './executor';
import { verifySyncWorkspaceIdentity } from '../../workflows/sync-transfer/workspace';
import { createWebdavWorkspaceCreation } from '../../workflows/sync-transfer/webdav-workspace';
import { createWebdavWorkspaceJoin } from '../../workflows/sync-transfer/webdav-workspace-join';

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

/** Read one current binding without granting another execution or credential lifetime. */
export async function readCurrentExecutionConnection(
  selection: SyncExecutorBinding,
  signal: AbortSignal
) {
  signal.throwIfAborted();
  const connection = await loadSyncConnection();
  if (
    !connection ||
    connection.phase !== 'active' ||
    !sameConnectionScope(connection.binding, selection.scope) ||
    !sameSyncConnectionIdentity(connection.identity, selection.authorization)
  )
    return null;
  signal.throwIfAborted();
  return connection;
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
    const connection = await readCurrentExecutionConnection(selection, signal);
    if (!connection) throw new SyncRemoteError('authentication');
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
        const remote = await createWebdavRemoteStore(
          {
            rootUrl: connection.binding.rootUrl,
            authentication: () => loadSyncConnectionAuthentication(selection.authorization),
            request: requests.request,
          },
          signal
        );
        let workspaceVerification: ReturnType<typeof verifySyncWorkspaceIdentity> | null = null;
        const result = await runSyncQueueOperation({
          ...selection,
          operationId,
          expectedRevision,
          remote,
          signal,
          loadCatalog: (admitted) =>
            refreshPersistedSyncCatalog(
              admitted,
              selection.scope.spaceId,
              selection.scope.connectionGeneration,
              signal
            ),
          authorize: async () => {
            const selected = await current();
            if (selected.workspace) {
              workspaceVerification ??= verifySyncWorkspaceIdentity(
                remote,
                selected.workspace,
                signal
              );
              await workspaceVerification;
              await current();
            }
          },
        });
        snapshot = terminalSnapshot(result, operation.stage);
        if (snapshot.state === 'published') {
          try {
            await current();
            await releasePublishedOutgoing(
              selection.scope.spaceId,
              operationId,
              selection.authorization,
              remote,
              signal
            );
          } catch {
            // Verified publication survives advisory retirement refusal or a protected reader.
          }
        }
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

/** Adapt the existing workspace owners without duplicating its protocol or request lifetime. */
export function createSyncWorkspaceExecution(
  input: SyncWorkspaceExecutionInput,
  hasOriginPermission: (origin: string) => Promise<boolean>
) {
  const create =
    input.source.kind === 'allocation' ? createWebdavWorkspaceCreation : createWebdavWorkspaceJoin;
  const creation = create({
    identity: input.source.identity,
    authentication: input.authentication,
    hasOriginPermission,
  });
  let stopped = false;
  return {
    drain() {
      stopped = true;
      return creation.close();
    },
    async run(): Promise<SyncWorkspaceExecutionResult> {
      let snapshot: SyncWorkspaceExecutionResult['snapshot'];
      try {
        await creation.run();
        snapshot = { state: 'ready', failureCode: null };
      } catch (error) {
        let failureCode: SyncWorkspaceExecutionResult['snapshot']['failureCode'] = 'internal';
        if (stopped) failureCode = 'interrupted';
        else if (error instanceof Error && 'code' in error) {
          switch (error.code) {
            case 'authentication':
            case 'access-denied':
            case 'storage-full':
              failureCode = error.code;
              break;
            case 'temporary':
            case 'transport':
            case 'unavailable':
              failureCode = 'temporary';
              break;
            case 'cancelled':
              failureCode = 'interrupted';
              break;
            case 'allocation-refused':
            case 'foreign-metadata':
            case 'invalid-configuration':
            case 'marker-missing':
            case 'invalid-marker':
            case 'invalid-binding':
            case 'unsupported-format':
            case 'binding-mismatch':
            case 'workspace-changed':
            case 'metadata-limit':
            case 'collision':
            case 'invalid-response':
              failureCode = 'invalid-workspace';
              break;
          }
        }
        snapshot = { state: failureCode === 'interrupted' ? 'interrupted' : 'failed', failureCode };
      }
      try {
        await creation.close();
        return { snapshot, containment: 'contained' };
      } catch {
        return { snapshot, containment: 'unsafe' };
      }
    },
  };
}
