import type { SyncConnectionAuthentication } from '../../composition/persistence/remote-connection/model';
import { readCurrentExecutionConnection } from './connection-admission';
import { loadSyncQueueOperation } from '../../composition/persistence/sync-capture/queue';
import { createSyncConnectionRequests } from '../../workflows/sync-transfer/connection-requests';
import { refreshPersistedSyncCatalog } from '../../workflows/sync-transfer/catalog-refresh';
import { releasePublishedOutgoing } from '../../workflows/sync-transfer/outgoing';
import { runSyncQueueOperation } from '../../workflows/sync-transfer/queue';
import { createDiagnosticPortWriter } from '../../platform/runtime-messaging/diagnostic-capture';
import { SyncRemoteError } from '../../workflows/sync-transfer/remote-store';
import { createWebdavRemoteStore } from '../../workflows/sync-transfer/webdav';
import type {
  SyncExecutorBinding,
  SyncWorkspaceDiscovery,
  SyncWorkspaceDiscoveryIssueCode,
} from '../../contracts/messaging/contracts/runtime-message/sync-connection.types';
import {
  isSyncWorkspaceDiscoveryPrefix,
  parseSyncWorkspaceJobSnapshot,
} from '../../contracts/messaging/contracts/runtime/sync-product';
import type {
  SyncExecutionInput,
  SyncExecutionResult,
  SyncWorkspaceExecutionInput,
  SyncWorkspaceExecutionResult,
} from './executor';
import {
  verifySyncWorkspaceIdentity,
  type SyncWorkspaceDiscovery as WorkspaceDiscovery,
} from '../../workflows/sync-transfer/workspace';
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
function refusedSnapshot(error: unknown, signal: AbortSignal): SyncExecutionResult['snapshot'] {
  if (
    signal.aborted &&
    signal.reason instanceof SyncRemoteError &&
    signal.reason.code === 'secrets-locked'
  )
    return { state: 'failed', stage: 'queued', failureCode: 'secrets-locked', runId: null };
  if (signal.aborted)
    return { state: 'interrupted', stage: 'queued', failureCode: 'interrupted', runId: null };
  let failureCode: SyncExecutionResult['snapshot']['failureCode'] = 'internal';
  if (
    error instanceof SyncRemoteError &&
    (error.code === 'secrets-locked' ||
      error.code === 'authentication' ||
      error.code === 'access-denied')
  )
    failureCode = error.code;
  return { state: 'failed', stage: 'queued', failureCode, runId: null };
}

/** Own one native queue workflow and all of its HTTP requests until containment. */
export function createSyncQueueExecution(
  input: SyncExecutionInput,
  hasOriginPermission: (origin: string) => Promise<boolean>,
  credentials?: {
    resolveAuthentication(): Promise<SyncConnectionAuthentication>;
    checkProtection(): Promise<boolean>;
  }
) {
  const { operationId, expectedRevision, signal } = input;
  const selection: SyncExecutorBinding = structuredClone({
    scope: input.scope,
    authorization: input.authorization,
  });
  const requests = createSyncConnectionRequests({
    identity: selection.authorization,
    hasOriginPermission,
    ...(credentials ? { checkProtection: credentials.checkProtection } : {}),
  });
  async function current() {
    const connection = await readCurrentExecutionConnection(selection, signal);
    if (!connection) throw new SyncRemoteError('authentication');
    return connection;
  }

  return {
    drain: requests.close,
    async run(): Promise<SyncExecutionResult> {
      let snapshot: SyncExecutionResult['snapshot'];
      try {
        const connection = await current();
        const operation = await loadSyncQueueOperation(selection.scope, operationId);
        if (operation.revision !== expectedRevision)
          throw new Error('Sync queue selection refused.');
        const remote = await createWebdavRemoteStore(
          {
            rootUrl: connection.binding.rootUrl,
            authentication: () => {
              if (!credentials)
                return Promise.reject(new Error('Sync credential callback unavailable'));
              return credentials.resolveAuthentication();
            },
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
        snapshot = refusedSnapshot(error, signal);
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

function discoveryIssueCode(
  code: WorkspaceDiscovery['issues'][number]['code']
): SyncWorkspaceDiscoveryIssueCode {
  switch (code) {
    case 'secrets-locked':
    case 'temporary':
    case 'authentication':
    case 'access-denied':
    case 'storage-full':
    case 'bootstrap-incomplete':
    case 'unsupported-format':
    case 'metadata-limit':
    case 'pagination-cycle':
    case 'invalid-response':
      return code;
    case 'transport':
    case 'unavailable':
      return 'temporary';
    case 'cancelled':
      return 'interrupted';
    case 'binding-mismatch':
    case 'collision':
    case 'invalid-binding':
    case 'invalid-configuration':
    case 'invalid-key':
    case 'invalid-marker':
    case 'marker-missing':
    case 'missing':
    case 'unsupported-cursor':
    case 'workspace-changed':
      return 'invalid-workspace';
    default:
      throw new Error('Unsupported workspace discovery issue.');
  }
}
function projectDiscovery(
  source: SyncWorkspaceDiscovery['source'],
  observed: WorkspaceDiscovery
): SyncWorkspaceDiscovery {
  const issues: SyncWorkspaceDiscovery['issues'] = observed.issues
    .slice(0, 321)
    .map((issue) =>
      isSyncWorkspaceDiscoveryPrefix(issue.prefix)
        ? { prefix: issue.prefix, code: discoveryIssueCode(issue.code) }
        : { prefix: '', code: 'invalid-response' }
    );
  const candidates = observed.candidates
    .slice(0, 64)
    .filter((candidate) => isSyncWorkspaceDiscoveryPrefix(candidate.prefix));
  const limited = observed.issues.length > 321 || observed.candidates.length > 64;
  const invalid = candidates.length !== Math.min(observed.candidates.length, 64);
  if (limited || invalid) {
    if (issues.length === 321) issues.pop();
    issues.push({ prefix: '', code: limited ? 'metadata-limit' : 'invalid-response' });
  }
  const snapshot = parseSyncWorkspaceJobSnapshot({
    sourceKind: 'join',
    selectionIncarnation: source.identity.incarnation,
    selectionRevision: source.identity.revision,
    state: 'discovered',
    failureCode: null,
    discovery: {
      source,
      scope: observed.scope,
      complete: observed.complete && issues.length === 0,
      candidates,
      issues,
    },
  });
  if (snapshot?.state !== 'discovered') throw new SyncRemoteError('invalid-response');
  return snapshot.discovery;
}

/** Adapt the existing workspace owners without duplicating its protocol or request lifetime. */
export function createSyncWorkspaceExecution(
  input: SyncWorkspaceExecutionInput,
  hasOriginPermission: (origin: string) => Promise<boolean>
) {
  const operation = input.operation;
  if (
    (operation !== undefined && operation !== 'discover') ||
    (operation === 'discover' && input.source.kind !== 'join')
  )
    throw new SyncRemoteError('invalid-configuration');
  const options = {
    identity: input.source.identity,
    authentication: input.authentication,
    hasOriginPermission,
  };
  const creation =
    input.source.kind === 'allocation'
      ? createWebdavWorkspaceCreation(options)
      : createWebdavWorkspaceJoin({
          ...options,
          ...(operation ? { operation: operation } : {}),
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
        const result = await creation.run();
        if (stopped) snapshot = { state: 'interrupted', failureCode: 'interrupted' };
        else if (operation === 'discover') {
          if (!result || !('operation' in result) || result.operation !== 'discover')
            throw new SyncRemoteError('invalid-response');
          snapshot = {
            state: 'discovered',
            failureCode: null,
            discovery: projectDiscovery(result.source, result.discovery),
          };
        } else snapshot = { state: 'ready', failureCode: null };
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
        if (stopped) snapshot = { state: 'interrupted', failureCode: 'interrupted' };
        return { snapshot, containment: 'contained' };
      } catch {
        return { snapshot, containment: 'unsafe' };
      }
    },
  };
}
