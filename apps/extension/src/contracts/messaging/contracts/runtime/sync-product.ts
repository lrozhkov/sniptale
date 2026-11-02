import { parseSyncWorkspaceIdentity } from '../../../sync-workspace';
import type { SyncCheckpointReceipt } from '../../../../composition/persistence/sync-capture/checkpoint-contracts';
import { SYNC_CHECKPOINT_INTERVALS } from '../../../../composition/persistence/sync-capture/checkpoint-contracts';
import type {
  SyncCacheStatus,
  SyncCacheRootStatus,
  SyncCacheReleaseResult,
  SyncCacheTrimResult,
} from '../../../sync-cache';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  connectionUuid,
  parseConnectionAuthentication,
  parseConnectionRootUrl,
  parseSyncConnectionIdentity,
  parseSyncWorkspaceSource,
  parseSyncStoragePolicy,
} from '../../../../composition/persistence/remote-connection/model';
import { parseSyncQueueScope } from '../../../../composition/persistence/sync-capture/queue-model';
import type {
  SyncNativeEditingRoot,
  SyncLibraryBackupOptions,
  SyncCredentialLease,
  SyncProductCommand,
  SyncProductCompletion,
  SyncProductExecutorRequest,
  SyncProductJobSnapshot,
  SyncProductRequest,
  SyncProductResponse,
  SyncProductResult,
  SyncProductStatus,
  SyncPopupRuntimeStatus,
  SyncProductWork,
  SyncRemoteSelection,
  SyncWorkspaceJobSnapshot,
  SyncWorkspaceDiscovery,
  SyncWorkspaceDiscoveryIssueCode,
} from '../runtime-message/sync-connection.types';

const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const text = (value: unknown, limit = 256): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= limit;
const ordinal = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
export function parseSyncCredentialLease(input: unknown): SyncCredentialLease | null {
  if (
    !isRecord(input) ||
    !exact(input, [
      'leaseId',
      'workerEpoch',
      'protectionEpoch',
      'offscreenStartupId',
      'executorId',
      'authorization',
      'credentialId',
    ]) ||
    !connectionUuid(input['leaseId']) ||
    !connectionUuid(input['workerEpoch']) ||
    !ordinal(input['protectionEpoch']) ||
    !connectionUuid(input['offscreenStartupId']) ||
    !connectionUuid(input['executorId']) ||
    !connectionUuid(input['credentialId'])
  )
    return null;
  const authorization = parseSyncConnectionIdentity(input['authorization']);
  return authorization
    ? {
        leaseId: input['leaseId'],
        workerEpoch: input['workerEpoch'],
        protectionEpoch: input['protectionEpoch'],
        offscreenStartupId: input['offscreenStartupId'],
        executorId: input['executorId'],
        authorization,
        credentialId: input['credentialId'],
      }
    : null;
}
function authentication(value: unknown, accountId?: string) {
  if (!isRecord(value)) return null;
  return parseConnectionAuthentication(
    value,
    accountId ?? (typeof value['username'] === 'string' ? value['username'] : '')
  );
}
/** Parse an exact logical version, without accepting remote keys or native counters. */
export function parseSyncRemoteSelection(value: unknown): SyncRemoteSelection | null {
  if (
    !isRecord(value) ||
    !exact(value, ['rootKind', 'rootId', 'operationId', 'sourceDigest']) ||
    (value['rootKind'] !== 'media' &&
      value['rootKind'] !== 'video-project' &&
      value['rootKind'] !== 'video-review' &&
      value['rootKind'] !== 'scenario-project') ||
    !text(value['rootId']) ||
    !text(value['operationId']) ||
    typeof value['sourceDigest'] !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(value['sourceDigest'])
  )
    return null;
  return {
    rootKind: value['rootKind'],
    rootId: value['rootId'],
    operationId: value['operationId'],
    sourceDigest: value['sourceDigest'],
  };
}
function nativeRoot(value: unknown): SyncNativeEditingRoot | null {
  if (!isRecord(value) || !exact(value, ['rootKind', 'rootId'])) return null;
  const kind = value['rootKind'];
  if (
    (kind !== 'media' &&
      kind !== 'video-project' &&
      kind !== 'video-review' &&
      kind !== 'scenario-project') ||
    !text(value['rootId'])
  )
    return null;
  return { rootKind: kind, rootId: value['rootId'] };
}
const LIBRARY_SELECTED_LIMIT = 25000;
function librarySelectedIds(input: unknown): string[] | null {
  if (!Array.isArray(input) || input.length > LIBRARY_SELECTED_LIMIT) return null;
  const values: readonly unknown[] = input;
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (!text(value) || seen.has(value)) return null;
    seen.add(value);
    ids.push(value);
  }
  return ids;
}

/** Parse only canonical export choices. The archive count ceiling also bounds this message. */
export function parseSyncLibraryBackupOptions(value: unknown): SyncLibraryBackupOptions | null {
  if (
    !isRecord(value) ||
    (value['scope'] !== 'all' && value['scope'] !== 'selected') ||
    !exact(value, [
      'includeDrafts',
      'includeSourceMetadata',
      'includeTelemetry',
      'includeWebSnapshots',
      'scope',
      ...(value['scope'] === 'selected' ? ['selected'] : []),
    ]) ||
    typeof value['includeDrafts'] !== 'boolean' ||
    typeof value['includeSourceMetadata'] !== 'boolean' ||
    typeof value['includeTelemetry'] !== 'boolean' ||
    typeof value['includeWebSnapshots'] !== 'boolean'
  )
    return null;
  let selected: SyncLibraryBackupOptions['selected'];
  if (value['scope'] === 'selected') {
    const input = value['selected'];
    if (
      !isRecord(input) ||
      !exact(input, ['mediaAssetIds', 'scenarioProjectIds', 'videoProjectIds'])
    )
      return null;
    const mediaAssetIds = librarySelectedIds(input['mediaAssetIds']);
    const scenarioProjectIds = librarySelectedIds(input['scenarioProjectIds']);
    const videoProjectIds = librarySelectedIds(input['videoProjectIds']);
    if (!mediaAssetIds || !scenarioProjectIds || !videoProjectIds) return null;
    const count = mediaAssetIds.length + scenarioProjectIds.length + videoProjectIds.length;
    if (count === 0 || count > LIBRARY_SELECTED_LIMIT) return null;
    selected = { mediaAssetIds, scenarioProjectIds, videoProjectIds };
  }
  return {
    includeDrafts: value['includeDrafts'],
    includeSourceMetadata: value['includeSourceMetadata'],
    includeTelemetry: value['includeTelemetry'],
    includeWebSnapshots: value['includeWebSnapshots'],
    scope: value['scope'],
    ...(selected ? { selected } : {}),
  };
}

export function parseSyncProductWork(value: unknown): SyncProductWork | null {
  if (!isRecord(value)) return null;
  if (value['kind'] === 'library-backup-prepare' && exact(value, ['kind', 'expected', 'options'])) {
    const expected = parseSyncConnectionIdentity(value['expected']);
    const options = parseSyncLibraryBackupOptions(value['options']);
    return expected && options ? { kind: 'library-backup-prepare', expected, options } : null;
  }
  if (
    value['kind'] === 'scenario-export-prepare' &&
    exact(value, ['kind', 'projectId', 'exportId']) &&
    text(value['projectId']) &&
    text(value['exportId'])
  )
    return {
      kind: 'scenario-export-prepare',
      projectId: value['projectId'],
      exportId: value['exportId'],
    };
  if (
    (value['kind'] === 'native-prepare' ||
      value['kind'] === 'native-release' ||
      value['kind'] === 'backup-prepare') &&
    exact(value, ['kind', 'root'])
  ) {
    const root = nativeRoot(value['root']);
    return root ? { kind: value['kind'], root } : null;
  }
  if (value['kind'] === 'cache-trim' && exact(value, ['kind'])) return { kind: 'cache-trim' };
  if (value['kind'] === 'automatic-sync' && exact(value, ['kind']))
    return { kind: 'automatic-sync' };
  if (
    value['kind'] === 'conflict-resolve' &&
    exact(value, ['kind', 'selection', 'expectedHeads', 'resolutionId'])
  ) {
    const selection = parseSyncRemoteSelection(value['selection']);
    const heads = value['expectedHeads'];
    return selection &&
      connectionUuid(value['resolutionId']) &&
      Array.isArray(heads) &&
      heads.length >= 2 &&
      heads.length <= 32 &&
      heads.every((head: unknown) => text(head)) &&
      new Set(heads).size === heads.length &&
      heads.includes(selection.operationId)
      ? {
          kind: 'conflict-resolve',
          selection,
          expectedHeads: heads,
          resolutionId: value['resolutionId'],
        }
      : null;
  }
  if (value['kind'] === 'catalog-refresh')
    return exact(value, ['kind', 'bypassCache']) && typeof value['bypassCache'] === 'boolean'
      ? { kind: value['kind'], bypassCache: value['bypassCache'] }
      : null;
  if (
    (value['kind'] === 'replica-prepare' || value['kind'] === 'thumbnail-read') &&
    (exact(value, ['kind', 'selection']) ||
      (value['kind'] === 'replica-prepare' &&
        value['preserveNative'] === true &&
        exact(value, ['kind', 'selection', 'preserveNative'])))
  ) {
    const selection = parseSyncRemoteSelection(value['selection']);
    return selection
      ? {
          kind: value['kind'],
          selection,
          ...(value['kind'] === 'replica-prepare' && value['preserveNative'] === true
            ? { preserveNative: true as const }
            : {}),
        }
      : null;
  }
  return null;
}
function parseCacheBudget(
  value: Record<string, unknown>
): Extract<SyncProductCommand, { kind: 'cache-budget' }> | null {
  return exact(value, ['kind', 'budgetBytes', 'revision']) &&
    ordinal(value['budgetBytes']) &&
    ordinal(value['revision'])
    ? { kind: 'cache-budget', budgetBytes: value['budgetBytes'], revision: value['revision'] }
    : null;
}
function hasProductRequestIdentity(
  value: Record<string, unknown>
): value is Record<string, unknown> & { requestId: string } {
  return (
    exact(value, [
      'kind',
      'requestId',
      ...(Object.hasOwn(value, 'advisory') ? ['advisory'] : []),
    ]) &&
    (!Object.hasOwn(value, 'advisory') || value['advisory'] === true) &&
    connectionUuid(value['requestId'])
  );
}
function checkpointReceipt(value: unknown): SyncCheckpointReceipt | null {
  if (
    !isRecord(value) ||
    !exact(value, ['rootKind', 'rootId', 'revision']) ||
    !connectionUuid(value['revision'])
  )
    return null;
  const root = nativeRoot({ rootKind: value['rootKind'], rootId: value['rootId'] });
  return root ? { ...root, revision: value['revision'] } : null;
}
export function parseSyncProductCommand(value: unknown): SyncProductCommand | null {
  if (!isRecord(value)) return null;
  const work = parseSyncProductWork(value);
  if (work && work.kind !== 'automatic-sync') return work;
  if (
    value['kind'] === 'connection-authentication' &&
    exact(value, ['kind', 'expected', 'authentication'])
  ) {
    const expected = parseSyncConnectionIdentity(value['expected']);
    const auth = authentication(value['authentication']);
    return expected && auth
      ? { kind: 'connection-authentication', expected, authentication: auth }
      : null;
  }
  if (
    (value['kind'] === 'connection-local-only' || value['kind'] === 'connection-resume') &&
    exact(value, ['kind', 'expected'])
  ) {
    const expected = parseSyncConnectionIdentity(value['expected']);
    return expected ? { kind: value['kind'], expected } : null;
  }
  if (value['kind'] === 'checkpoint-exit' && exact(value, ['kind', 'receipt'])) {
    const receipt = checkpointReceipt(value['receipt']);
    return receipt ? { kind: 'checkpoint-exit', receipt } : null;
  }
  if (value['kind'] === 'checkpoint-wake' && exact(value, ['kind']))
    return { kind: 'checkpoint-wake' };
  if (value['kind'] === 'checkpoint-policy' && exact(value, ['kind']))
    return { kind: 'checkpoint-policy' };
  if (value['kind'] === 'checkpoint-flush' && exact(value, ['kind']))
    return { kind: 'checkpoint-flush' };
  if (value['kind'] === 'checkpoint-interval' && exact(value, ['kind', 'intervalMs'])) {
    const intervalMs = SYNC_CHECKPOINT_INTERVALS.find(
      (interval) => interval === value['intervalMs']
    );
    return intervalMs === undefined ? null : { kind: 'checkpoint-interval', intervalMs };
  }
  if (value['kind'] === 'cache-status' && exact(value, ['kind'])) return { kind: 'cache-status' };
  if (value['kind'] === 'cache-budget') return parseCacheBudget(value);
  if (value['kind'] === 'cache-root-status' && exact(value, ['kind', 'root'])) {
    const root = nativeRoot(value['root']);
    return root ? { kind: 'cache-root-status', root } : null;
  }
  if (
    value['kind'] === 'cache-pin' &&
    exact(value, ['kind', 'root', 'pinned']) &&
    typeof value['pinned'] === 'boolean'
  ) {
    const root = nativeRoot(value['root']);
    return root ? { kind: 'cache-pin', root, pinned: value['pinned'] } : null;
  }
  if (value['kind'] === 'status' && exact(value, ['kind'])) return { kind: 'status' };
  if (value['kind'] === 'runtime-status' && exact(value, ['kind']))
    return { kind: 'runtime-status' };
  if (value['kind'] === 'workspace-abandon' && exact(value, ['kind', 'source'])) {
    const source = parseSyncWorkspaceSource(value['source']);
    return source ? { kind: 'workspace-abandon', source } : null;
  }
  if (
    (value['kind'] === 'inspect' || value['kind'] === 'cancel') &&
    hasProductRequestIdentity(value)
  )
    return value['kind'] === 'inspect'
      ? {
          kind: 'inspect',
          requestId: value['requestId'],
          ...(value['advisory'] === true ? { advisory: true } : {}),
        }
      : {
          kind: 'cancel',
          requestId: value['requestId'],
          ...(value['advisory'] === true ? { advisory: true } : {}),
        };
  if (value['kind'] === 'workspace-create' || value['kind'] === 'workspace-discover') {
    const field = value['kind'] === 'workspace-create' ? 'parentUrl' : 'rootUrl';
    const fields = [
      'kind',
      field,
      'accountId',
      'authentication',
      ...(value['kind'] === 'workspace-discover' ? ['previous'] : []),
    ];
    if (!exact(value, fields) || !text(value['accountId'], 1024)) return null;
    const url = parseConnectionRootUrl(value[field]);
    const auth = authentication(value['authentication'], value['accountId']);
    if (!url || !auth) return null;
    if (value['kind'] === 'workspace-create')
      return {
        kind: 'workspace-create',
        parentUrl: url,
        accountId: value['accountId'],
        authentication: auth,
      };
    const previous =
      value['previous'] === null ? null : parseSyncWorkspaceSource(value['previous']);
    if (value['previous'] !== null && previous?.kind !== 'join') return null;
    return {
      kind: 'workspace-discover',
      rootUrl: url,
      accountId: value['accountId'],
      authentication: auth,
      previous,
    };
  }
  if (
    value['kind'] === 'workspace-join' &&
    exact(value, ['kind', 'source', 'prefix', 'expected', 'authentication'])
  ) {
    const source = parseSyncWorkspaceSource(value['source']);
    const expected = workspaceIdentity(value['expected']);
    const auth = authentication(value['authentication']);
    if (
      source?.kind !== 'join' ||
      !isSyncWorkspaceDiscoveryPrefix(value['prefix']) ||
      !expected ||
      !auth
    )
      return null;
    return {
      kind: 'workspace-join',
      source: { kind: 'join', identity: source.identity },
      prefix: value['prefix'],
      expected,
      authentication: auth,
    };
  }
  if (
    value['kind'] === 'workspace-retry' &&
    exact(value, [
      'kind',
      'source',
      'authentication',
      ...(Object.hasOwn(value, 'operation') ? ['operation'] : []),
    ])
  ) {
    const source = parseSyncWorkspaceSource(value['source']);
    const auth = authentication(value['authentication']);
    if (
      !source ||
      !auth ||
      (Object.hasOwn(value, 'operation') &&
        (value['operation'] !== 'discover' || source.kind !== 'join'))
    )
      return null;
    return {
      kind: 'workspace-retry',
      source,
      authentication: auth,
      ...(value['operation'] === 'discover' ? { operation: 'discover' } : {}),
    };
  }
  if (
    value['kind'] === 'workspace-enroll' &&
    exact(value, ['kind', 'source', 'authentication', 'storagePolicy'])
  ) {
    const source = parseSyncWorkspaceSource(value['source']);
    const auth = authentication(value['authentication']);
    const storagePolicy = parseSyncStoragePolicy(value['storagePolicy']);
    return source && auth && storagePolicy
      ? { kind: 'workspace-enroll', source, authentication: auth, storagePolicy }
      : null;
  }
  return null;
}
export function parseSyncProductRequest(value: unknown): SyncProductRequest | null {
  if (
    !isRecord(value) ||
    !exact(value, ['type', 'requestId', 'command']) ||
    value['type'] !== MessageType.SYNC_PRODUCT_COMMAND ||
    !connectionUuid(value['requestId'])
  )
    return null;
  const command = parseSyncProductCommand(value['command']);
  return command ? { type: value['type'], requestId: value['requestId'], command } : null;
}
export function parseSyncProductExecutorRequest(value: unknown): SyncProductExecutorRequest | null {
  if (
    !isRecord(value) ||
    !exact(value, [
      'type',
      'requestId',
      'capabilityToken',
      'offscreenStartupId',
      'executorId',
      'executorRevision',
      'command',
      ...(Object.hasOwn(value, 'advisory') ? ['advisory'] : []),
    ]) ||
    (Object.hasOwn(value, 'advisory') && value['advisory'] !== true) ||
    value['type'] !== MessageType.OFFSCREEN_SYNC_PRODUCT_COMMAND ||
    !connectionUuid(value['requestId']) ||
    !connectionUuid(value['offscreenStartupId']) ||
    !connectionUuid(value['executorId']) ||
    !ordinal(value['executorRevision']) ||
    value['executorRevision'] < 1 ||
    !text(value['capabilityToken'], 4096) ||
    !isRecord(value['command'])
  )
    return null;
  const cmd = value['command'];
  if (!connectionUuid(cmd['operationRequestId'])) return null;
  let command: SyncProductExecutorRequest['command'];
  if (
    cmd['kind'] === 'start' &&
    exact(cmd, [
      'kind',
      'operationRequestId',
      'binding',
      'work',
      ...(Object.hasOwn(cmd, 'credentialLease') ? ['credentialLease'] : []),
    ]) &&
    isRecord(cmd['binding']) &&
    exact(cmd['binding'], ['scope', 'authorization'])
  ) {
    const rawScope = cmd['binding']['scope'];
    if (
      !isRecord(rawScope) ||
      !exact(rawScope, ['spaceId', 'connectionGeneration', 'profileCreatedAt'])
    )
      return null;
    const scope = parseSyncQueueScope(rawScope);
    const authorization = parseSyncConnectionIdentity(cmd['binding']['authorization']);
    const work = parseSyncProductWork(cmd['work']);
    const credentialLease = parseSyncCredentialLease(cmd['credentialLease']);
    if (
      !scope ||
      !authorization ||
      !work ||
      (Object.hasOwn(cmd, 'credentialLease') && !credentialLease)
    )
      return null;
    command = {
      kind: 'start',
      operationRequestId: cmd['operationRequestId'],
      binding: { scope, authorization },
      ...(credentialLease ? { credentialLease } : {}),
      work,
    };
  } else if (
    (cmd['kind'] === 'inspect' || cmd['kind'] === 'cancel') &&
    exact(cmd, ['kind', 'operationRequestId'])
  )
    command =
      cmd['kind'] === 'inspect'
        ? { kind: 'inspect', operationRequestId: cmd['operationRequestId'] }
        : { kind: 'cancel', operationRequestId: cmd['operationRequestId'] };
  else return null;
  return {
    type: value['type'],
    requestId: value['requestId'],
    capabilityToken: value['capabilityToken'],
    ...(value['advisory'] === true ? { advisory: true } : {}),
    offscreenStartupId: value['offscreenStartupId'],
    executorId: value['executorId'],
    executorRevision: value['executorRevision'],
    command,
  };
}
export function parseSyncProductJob(value: unknown): SyncProductJobSnapshot | null {
  if (
    !isRecord(value) ||
    !exact(value, ['requestId', 'kind', 'state', 'failureCode']) ||
    !connectionUuid(value['requestId']) ||
    (value['kind'] !== 'backup-prepare' &&
      value['kind'] !== 'native-release' &&
      value['kind'] !== 'cache-trim' &&
      value['kind'] !== 'native-prepare' &&
      value['kind'] !== 'scenario-export-prepare' &&
      value['kind'] !== 'library-backup-prepare' &&
      value['kind'] !== 'catalog-refresh' &&
      value['kind'] !== 'replica-prepare' &&
      value['kind'] !== 'thumbnail-read' &&
      value['kind'] !== 'conflict-resolve' &&
      value['kind'] !== 'automatic-sync') ||
    (value['state'] !== 'running' &&
      value['state'] !== 'ready' &&
      value['state'] !== 'failed' &&
      value['state'] !== 'interrupted')
  )
    return null;
  const failureCode = value['failureCode'];
  if (
    failureCode !== null &&
    failureCode !== 'temporary' &&
    failureCode !== 'authentication' &&
    failureCode !== 'secrets-locked' &&
    failureCode !== 'access-denied' &&
    failureCode !== 'storage-full' &&
    failureCode !== 'invalid-workspace' &&
    failureCode !== 'interrupted' &&
    failureCode !== 'internal' &&
    failureCode !== 'selection-changed' &&
    failureCode !== 'unavailable' &&
    failureCode !== 'invalid-data'
  )
    return null;
  return { requestId: value['requestId'], kind: value['kind'], state: value['state'], failureCode };
}
function cacheStatus(value: unknown): SyncCacheStatus | null {
  if (
    !isRecord(value) ||
    !exact(value, [
      'budgetBytes',
      'budgetRevision',
      'residentBytes',
      'missingBytes',
      'pinnedBytes',
      'pinnedRoots',
      'overBudgetBytes',
    ]) ||
    !ordinal(value['budgetBytes']) ||
    !ordinal(value['budgetRevision']) ||
    !ordinal(value['residentBytes']) ||
    !ordinal(value['missingBytes']) ||
    !ordinal(value['pinnedBytes']) ||
    !ordinal(value['pinnedRoots']) ||
    !ordinal(value['overBudgetBytes'])
  )
    return null;
  return {
    budgetBytes: value['budgetBytes'],
    budgetRevision: value['budgetRevision'],
    residentBytes: value['residentBytes'],
    missingBytes: value['missingBytes'],
    pinnedBytes: value['pinnedBytes'],
    pinnedRoots: value['pinnedRoots'],
    overBudgetBytes: value['overBudgetBytes'],
  };
}
function cacheRootStatus(value: unknown): SyncCacheRootStatus | null {
  if (
    !isRecord(value) ||
    !exact(value, ['root', 'configured', 'pinned', 'ready', 'releaseAllowed']) ||
    typeof value['configured'] !== 'boolean' ||
    typeof value['pinned'] !== 'boolean' ||
    typeof value['ready'] !== 'boolean' ||
    typeof value['releaseAllowed'] !== 'boolean'
  )
    return null;
  const root = nativeRoot(value['root']);
  return root
    ? {
        root,
        configured: value['configured'],
        pinned: value['pinned'],
        ready: value['ready'],
        releaseAllowed: value['releaseAllowed'],
      }
    : null;
}
function cacheRelease(value: unknown): SyncCacheReleaseResult | null {
  if (
    !isRecord(value) ||
    !exact(value, ['released', 'releasedBytes', 'absent', 'unavailable', 'busy', 'protected']) ||
    !ordinal(value['released']) ||
    !ordinal(value['releasedBytes']) ||
    !ordinal(value['absent']) ||
    !ordinal(value['unavailable']) ||
    !ordinal(value['busy']) ||
    !ordinal(value['protected'])
  )
    return null;
  return {
    released: value['released'],
    releasedBytes: value['releasedBytes'],
    absent: value['absent'],
    unavailable: value['unavailable'],
    busy: value['busy'],
    protected: value['protected'],
  };
}
function cacheTrim(value: unknown): SyncCacheTrimResult | null {
  if (
    !isRecord(value) ||
    !exact(value, ['released', 'releasedBytes', 'unavailable', 'busy', 'protected', 'status']) ||
    !ordinal(value['released']) ||
    !ordinal(value['releasedBytes']) ||
    !ordinal(value['unavailable']) ||
    !ordinal(value['busy']) ||
    !ordinal(value['protected'])
  )
    return null;
  const status = cacheStatus(value['status']);
  return status
    ? {
        released: value['released'],
        releasedBytes: value['releasedBytes'],
        unavailable: value['unavailable'],
        busy: value['busy'],
        protected: value['protected'],
        status,
      }
    : null;
}
function completion(value: unknown): SyncProductCompletion | null {
  if (!isRecord(value)) return null;
  if (value['kind'] === 'library-backup' && exact(value, ['kind', 'expected', 'options'])) {
    const expected = parseSyncConnectionIdentity(value['expected']);
    const options = parseSyncLibraryBackupOptions(value['options']);
    return expected && options ? { kind: 'library-backup', expected, options } : null;
  }
  if (
    value['kind'] === 'scenario-export' &&
    exact(value, ['kind', 'projectId', 'exportId']) &&
    text(value['projectId']) &&
    text(value['exportId'])
  )
    return {
      kind: 'scenario-export',
      projectId: value['projectId'],
      exportId: value['exportId'],
    };
  if (value['kind'] === 'cache-trim' && exact(value, ['kind', 'result'])) {
    const result = cacheTrim(value['result']);
    return result ? { kind: 'cache-trim', result } : null;
  }
  if (value['kind'] === 'native-release' && exact(value, ['kind', 'root', 'result'])) {
    const root = nativeRoot(value['root']);
    const result = cacheRelease(value['result']);
    return root && result ? { kind: 'native-release', root, result } : null;
  }
  if (value['kind'] === 'native' && exact(value, ['kind', 'root'])) {
    const root = nativeRoot(value['root']);
    return root ? { kind: 'native', root } : null;
  }
  if (
    value['kind'] === 'automatic' &&
    exact(value, ['kind', 'applied', 'deferred', 'remaining']) &&
    ordinal(value['applied']) &&
    ordinal(value['deferred']) &&
    value['applied'] + value['deferred'] <= 2 &&
    typeof value['remaining'] === 'boolean'
  )
    return {
      kind: 'automatic',
      applied: value['applied'],
      deferred: value['deferred'],
      remaining: value['remaining'],
    };
  if (
    value['kind'] === 'resolution' &&
    exact(value, ['kind', 'operationId']) &&
    connectionUuid(value['operationId'])
  )
    return { kind: 'resolution', operationId: value['operationId'] };
  if (
    value['kind'] === 'catalog' &&
    exact(value, ['kind', 'count']) &&
    ordinal(value['count']) &&
    value['count'] <= 10000
  )
    return { kind: 'catalog', count: value['count'] };
  if (value['kind'] === 'replica' && exact(value, ['kind', 'selection'])) {
    const selection = parseSyncRemoteSelection(value['selection']);
    return selection ? { kind: 'replica', selection } : null;
  }
  if (
    value['kind'] === 'thumbnail' &&
    exact(value, ['kind', 'dataUrl', 'width', 'height']) &&
    ordinal(value['width']) &&
    ordinal(value['height']) &&
    value['width'] <= 8192 &&
    value['height'] <= 8192 &&
    value['width'] * value['height'] <= 16 * 1024 * 1024 &&
    (value['dataUrl'] === null
      ? value['width'] === 0 && value['height'] === 0
      : value['width'] > 0 && value['height'] > 0) &&
    (value['dataUrl'] === null ||
      (typeof value['dataUrl'] === 'string' &&
        value['dataUrl'].length <= 1400000 &&
        /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/u.test(value['dataUrl'])))
  )
    return {
      kind: 'thumbnail',
      dataUrl: value['dataUrl'],
      width: value['width'],
      height: value['height'],
    };
  return null;
}
/** Accept a decoded root or immediate child prefix without URL normalization. */
export function isSyncWorkspaceDiscoveryPrefix(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 4096) return false;
  if (value === '') return true;
  if (!value.endsWith('/')) return false;
  const name = value.slice(0, -1);
  if (
    !name ||
    name === '.' ||
    name === '..' ||
    /[\\/?#:]/u.test(name) ||
    Array.from(name).some((character) => {
      const code = character.charCodeAt(0);
      return code <= 0x1f || code === 0x7f;
    }) ||
    /%(?:25)*(?:2e|2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/iu.test(name)
  )
    return false;
  try {
    encodeURIComponent(name);
    return true;
  } catch {
    return false;
  }
}
function workspaceIdentity(value: unknown) {
  try {
    return parseSyncWorkspaceIdentity(value);
  } catch {
    return null;
  }
}
const WORKSPACE_FAILURE_CODES = [
  'temporary',
  'secrets-locked',
  'authentication',
  'access-denied',
  'storage-full',
  'invalid-workspace',
  'interrupted',
  'internal',
] as const;
const DISCOVERY_ISSUE_CODES: readonly SyncWorkspaceDiscoveryIssueCode[] = [
  ...WORKSPACE_FAILURE_CODES,
  'bootstrap-incomplete',
  'unsupported-format',
  'metadata-limit',
  'pagination-cycle',
  'invalid-response',
];
/** Reconstruct a bounded discovery observation without native or credential payloads. */
function parseSyncWorkspaceDiscovery(value: unknown): SyncWorkspaceDiscovery | null {
  if (
    !isRecord(value) ||
    !exact(value, ['source', 'scope', 'complete', 'candidates', 'issues']) ||
    (value['scope'] !== 'exact' && value['scope'] !== 'children') ||
    typeof value['complete'] !== 'boolean' ||
    !Array.isArray(value['candidates']) ||
    value['candidates'].length > 64 ||
    !Array.isArray(value['issues']) ||
    value['issues'].length > 321
  )
    return null;
  const source = parseSyncWorkspaceSource(value['source']);
  if (source?.kind !== 'join') return null;
  const candidates: SyncWorkspaceDiscovery['candidates'] = [];
  for (const item of value['candidates']) {
    if (
      !isRecord(item) ||
      !exact(item, ['prefix', 'identity']) ||
      !isSyncWorkspaceDiscoveryPrefix(item['prefix'])
    )
      return null;
    const identity = workspaceIdentity(item['identity']);
    if (!identity) return null;
    candidates.push({ prefix: item['prefix'], identity });
  }
  const issues: SyncWorkspaceDiscovery['issues'] = [];
  for (const item of value['issues']) {
    if (
      !isRecord(item) ||
      !exact(item, ['prefix', 'code']) ||
      !isSyncWorkspaceDiscoveryPrefix(item['prefix'])
    )
      return null;
    const code = DISCOVERY_ISSUE_CODES.find((candidate) => candidate === item['code']);
    if (!code) return null;
    issues.push({ prefix: item['prefix'], code });
  }
  return {
    source: { kind: 'join', identity: source.identity },
    scope: value['scope'],
    complete: value['complete'],
    candidates,
    issues,
  };
}
/** Shared strict workspace snapshot parser for product and executor observations. */
export function parseSyncWorkspaceJobSnapshot(value: unknown): SyncWorkspaceJobSnapshot | null {
  if (
    !isRecord(value) ||
    !exact(value, [
      'sourceKind',
      'selectionIncarnation',
      'selectionRevision',
      'state',
      'failureCode',
      ...(Object.hasOwn(value, 'requestId') ? ['requestId'] : []),
      ...(value['state'] === 'discovered' ? ['discovery'] : []),
    ]) ||
    (value['sourceKind'] !== 'allocation' && value['sourceKind'] !== 'join') ||
    !connectionUuid(value['selectionIncarnation']) ||
    !ordinal(value['selectionRevision']) ||
    value['selectionRevision'] < 1 ||
    (value['requestId'] !== undefined && !connectionUuid(value['requestId']))
  )
    return null;
  const common = {
    ...(typeof value['requestId'] === 'string' ? { requestId: value['requestId'] } : {}),
    selectionIncarnation: value['selectionIncarnation'],
    selectionRevision: value['selectionRevision'],
  };
  if (value['state'] === 'discovered') {
    const discovery = parseSyncWorkspaceDiscovery(value['discovery']);
    if (
      value['sourceKind'] !== 'join' ||
      value['failureCode'] !== null ||
      !discovery ||
      discovery.source.identity.incarnation !== common.selectionIncarnation ||
      discovery.source.identity.revision !== common.selectionRevision
    )
      return null;
    return { ...common, sourceKind: 'join', state: 'discovered', failureCode: null, discovery };
  }
  const state = (['running', 'ready', 'failed', 'interrupted'] as const).find(
    (candidate) => candidate === value['state']
  );
  const failureCode =
    value['failureCode'] === null
      ? null
      : WORKSPACE_FAILURE_CODES.find((candidate) => candidate === value['failureCode']);
  return state && failureCode !== undefined
    ? { ...common, sourceKind: value['sourceKind'], state, failureCode }
    : null;
}
function status(value: unknown): SyncProductStatus | null {
  if (!isRecord(value) || !exact(value, ['connection', 'workspace', 'workspaceJob', 'products']))
    return null;
  let connection: SyncProductStatus['connection'] = null;
  let workspace: SyncProductStatus['workspace'] = null;
  if (value['connection'] !== null) {
    const c = value['connection'];
    if (
      !isRecord(c) ||
      !exact(c, ['phase', 'rootUrl', 'accountId', 'expected']) ||
      !parseSyncConnectionIdentity(c['expected']) ||
      (c['phase'] !== 'active' && c['phase'] !== 'paused' && c['phase'] !== 'updating-auth') ||
      !parseConnectionRootUrl(c['rootUrl']) ||
      typeof c['rootUrl'] !== 'string' ||
      !text(c['accountId'], 1024)
    )
      return null;
    const expected = parseSyncConnectionIdentity(c['expected']);
    if (!expected) return null;
    connection = { expected, phase: c['phase'], rootUrl: c['rootUrl'], accountId: c['accountId'] };
  }
  if (value['workspace'] !== null) {
    const w = value['workspace'];
    if (
      !isRecord(w) ||
      !exact(w, ['source', 'phase', 'rootUrl', 'accountId']) ||
      (w['phase'] !== 'planned' &&
        w['phase'] !== 'allocating' &&
        w['phase'] !== 'allocated' &&
        w['phase'] !== 'checking' &&
        w['phase'] !== 'ready') ||
      typeof w['rootUrl'] !== 'string' ||
      !parseConnectionRootUrl(w['rootUrl']) ||
      !text(w['accountId'], 1024)
    )
      return null;
    const source = parseSyncWorkspaceSource(w['source']);
    if (!source) return null;
    workspace = { source, phase: w['phase'], rootUrl: w['rootUrl'], accountId: w['accountId'] };
  }
  const parsedJob =
    value['workspaceJob'] === null ? null : parseSyncWorkspaceJobSnapshot(value['workspaceJob']);
  if (value['workspaceJob'] !== null && !parsedJob) return null;
  const rawProducts = value['products'];
  if (!Array.isArray(rawProducts) || rawProducts.length > 128) return null;
  const products: SyncProductJobSnapshot[] = [];
  const ids = new Set<string>();
  for (const raw of rawProducts) {
    const product = parseSyncProductJob(raw);
    if (
      !product ||
      product.kind === 'thumbnail-read' ||
      product.kind === 'automatic-sync' ||
      ids.has(product.requestId)
    )
      return null;
    ids.add(product.requestId);
    products.push(product);
  }
  return { connection, workspace, workspaceJob: parsedJob, products };
}
export function parseSyncPopupRuntimeStatus(value: unknown): SyncPopupRuntimeStatus | null {
  if (
    !isRecord(value) ||
    !exact(value, [
      'configuration',
      'connection',
      'localPublication',
      'activity',
      'remote',
      'protection',
      'issue',
      'repair',
    ])
  )
    return null;
  const configuration = (['configured', 'unconfigured', 'unknown'] as const).find(
    (item) => item === value['configuration']
  );
  const connection = (
    ['active', 'paused', 'credentials-required', 'updating-auth', null] as const
  ).find((item) => item === value['connection']);
  const localPublication = (['waiting', 'published', 'discovering', 'unknown'] as const).find(
    (item) => item === value['localPublication']
  );
  const activity = (['idle', 'running', 'stopping', 'unknown'] as const).find(
    (item) => item === value['activity']
  );
  const protection = (['not-enrolled', 'unlocked', 'locked', 'unknown'] as const).find(
    (item) => item === value['protection']
  );
  const issue = (
    [
      null,
      'secrets-locked',
      'temporary',
      'authentication',
      'access-denied',
      'storage-full',
      'invalid-workspace',
      'interrupted',
      'internal',
      'selection-changed',
      'unavailable',
      'invalid-data',
      'queue-problem',
      'permission-required',
      'index-coverage',
      'not-ready',
    ] as const
  ).find((item) => item === value['issue']);
  const repair = (
    [
      null,
      'connection',
      'security',
      'queue',
      'queue-problems',
      'queue-action-required',
      'storage',
    ] as const
  ).find((item) => item === value['repair']);
  if (
    !configuration ||
    connection === undefined ||
    !localPublication ||
    !activity ||
    !protection ||
    issue === undefined ||
    repair === undefined
  )
    return null;
  const rawRemote = value['remote'];
  if (!isRecord(rawRemote)) return null;
  let remote: SyncPopupRuntimeStatus['remote'];
  if (rawRemote['knowledge'] === 'unknown' && exact(rawRemote, ['knowledge']))
    remote = { knowledge: 'unknown' };
  else if (
    rawRemote['knowledge'] === 'observed-pass' &&
    exact(rawRemote, ['knowledge', 'outcome']) &&
    (rawRemote['outcome'] === 'complete' || rawRemote['outcome'] === 'deferred')
  )
    remote = { knowledge: 'observed-pass', outcome: rawRemote['outcome'] };
  else return null;
  return {
    configuration,
    connection,
    localPublication,
    activity,
    remote,
    protection,
    issue,
    repair,
  };
}
export function parseSyncProductResult(value: unknown): SyncProductResult | null {
  if (!isRecord(value)) return null;
  if (value['kind'] === 'checkpoint-exit' && exact(value, ['kind', 'outcome'])) {
    const outcome = (
      ['requested', 'already-due', 'stale', 'not-pending', 'unconfigured'] as const
    ).find((candidate) => candidate === value['outcome']);
    return outcome ? { kind: 'checkpoint-exit', outcome } : null;
  }
  if (value['kind'] === 'checkpoint-woken' && exact(value, ['kind']))
    return { kind: 'checkpoint-woken' };
  if (value['kind'] === 'checkpoint-policy' && exact(value, ['kind', 'intervalMs'])) {
    const intervalMs = SYNC_CHECKPOINT_INTERVALS.find(
      (interval) => interval === value['intervalMs']
    );
    return intervalMs === undefined ? null : { kind: 'checkpoint-policy', intervalMs };
  }
  if (
    value['kind'] === 'checkpoint-flushed' &&
    exact(value, ['kind', 'updated', 'alreadyDue']) &&
    ordinal(value['updated']) &&
    ordinal(value['alreadyDue'])
  )
    return {
      kind: 'checkpoint-flushed',
      updated: value['updated'],
      alreadyDue: value['alreadyDue'],
    };
  if (value['kind'] === 'accepted' && hasProductRequestIdentity(value))
    return { kind: 'accepted', requestId: value['requestId'] };
  if (value['kind'] === 'cache-status' && exact(value, ['kind', 'status'])) {
    const status = cacheStatus(value['status']);
    return status ? { kind: 'cache-status', status } : null;
  }
  if (value['kind'] === 'cache-root' && exact(value, ['kind', 'status'])) {
    const status = cacheRootStatus(value['status']);
    return status ? { kind: 'cache-root', status } : null;
  }
  if (value['kind'] === 'cache-budget') return parseCacheBudget(value);
  if (value['kind'] === 'local-only-refused' && exact(value, ['kind', 'code'])) {
    const code = value['code'];
    return code === 'missing-bytes' ||
      code === 'local-changed' ||
      code === 'pending-outgoing' ||
      code === 'invalid-data'
      ? { kind: 'local-only-refused', code }
      : null;
  }
  if (
    value['kind'] === 'local-only' &&
    exact(value, ['kind', 'history']) &&
    (value['history'] === 'delivered' || value['history'] === 'incomplete')
  )
    return { kind: 'local-only', history: value['history'] };
  if (value['kind'] === 'enrolled' && exact(value, ['kind'])) return { kind: 'enrolled' };
  if (value['kind'] === 'runtime-status' && exact(value, ['kind', 'status'])) {
    const parsed = parseSyncPopupRuntimeStatus(value['status']);
    return parsed ? { kind: 'runtime-status', status: parsed } : null;
  }
  if (value['kind'] === 'status' && exact(value, ['kind', 'status'])) {
    const parsed = status(value['status']);
    return parsed ? { kind: 'status', status: parsed } : null;
  }
  if (
    value['kind'] === 'cancelled' &&
    exact(value, ['kind', 'outcome']) &&
    (value['outcome'] === 'cancelled' ||
      value['outcome'] === 'already-completed' ||
      value['outcome'] === 'refused')
  )
    return { kind: 'cancelled', outcome: value['outcome'] };
  if (value['kind'] === 'operation' && exact(value, ['kind', 'job', 'completion'])) {
    const job = value['job'] === null ? null : parseSyncProductJob(value['job']);
    const done = value['completion'] === null ? null : completion(value['completion']);
    return (value['job'] === null || job) && (value['completion'] === null || done)
      ? { kind: 'operation', job, completion: done }
      : null;
  }
  return null;
}
/** Strict response parser excludes raw provider errors, native refs and authentication. */
export function parseSyncProductResponse(value: unknown): SyncProductResponse | null {
  if (!isRecord(value)) return null;
  if (
    value['success'] === false &&
    exact(value, ['success', 'error']) &&
    (value['error'] === 'Sync product command refused' || value['error'] === 'secrets-locked')
  )
    return { success: false, error: value['error'] };
  if (value['success'] !== true || !exact(value, ['success', 'result'])) return null;
  const result = parseSyncProductResult(value['result']);
  return result ? { success: true, result } : null;
}
