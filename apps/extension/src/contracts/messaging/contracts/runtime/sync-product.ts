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
} from '../../../../composition/persistence/remote-connection/model';
import { parseSyncQueueScope } from '../../../../composition/persistence/sync-capture/queue-model';
import type {
  SyncNativeEditingRoot,
  SyncProductCommand,
  SyncProductCompletion,
  SyncProductExecutorRequest,
  SyncProductJobSnapshot,
  SyncProductRequest,
  SyncProductResponse,
  SyncProductResult,
  SyncProductStatus,
  SyncProductWork,
  SyncRemoteSelection,
  SyncWorkspaceJobSnapshot,
} from '../runtime-message/sync-connection.types';

const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const text = (value: unknown, limit = 256): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= limit;
const ordinal = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
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
export function parseSyncProductWork(value: unknown): SyncProductWork | null {
  if (!isRecord(value)) return null;
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
export function parseSyncProductCommand(value: unknown): SyncProductCommand | null {
  if (!isRecord(value)) return null;
  const work = parseSyncProductWork(value);
  if (work && work.kind !== 'automatic-sync') return work;
  if (value['kind'] === 'connection-local-only' && exact(value, ['kind', 'expected'])) {
    const expected = parseSyncConnectionIdentity(value['expected']);
    return expected ? { kind: 'connection-local-only', expected } : null;
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
  if (value['kind'] === 'workspace-create' || value['kind'] === 'workspace-join') {
    const field = value['kind'] === 'workspace-create' ? 'parentUrl' : 'rootUrl';
    if (
      !exact(value, ['kind', field, 'accountId', 'authentication']) ||
      !text(value['accountId'], 1024)
    )
      return null;
    const url = parseConnectionRootUrl(value[field]);
    const auth = authentication(value['authentication'], value['accountId']);
    if (!url || !auth) return null;
    return value['kind'] === 'workspace-create'
      ? { kind: value['kind'], parentUrl: url, accountId: value['accountId'], authentication: auth }
      : { kind: value['kind'], rootUrl: url, accountId: value['accountId'], authentication: auth };
  }
  if (
    (value['kind'] === 'workspace-retry' || value['kind'] === 'workspace-enroll') &&
    exact(value, ['kind', 'source', 'authentication'])
  ) {
    const source = parseSyncWorkspaceSource(value['source']);
    const auth = authentication(value['authentication']);
    if (!source || !auth) return null;
    return value['kind'] === 'workspace-retry'
      ? { kind: 'workspace-retry', source, authentication: auth }
      : { kind: 'workspace-enroll', source, authentication: auth };
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
    exact(cmd, ['kind', 'operationRequestId', 'binding', 'work']) &&
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
    if (!scope || !authorization || !work) return null;
    command = {
      kind: 'start',
      operationRequestId: cmd['operationRequestId'],
      binding: { scope, authorization },
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
function workspaceJob(value: unknown): SyncWorkspaceJobSnapshot | null {
  if (
    !isRecord(value) ||
    !exact(value, [
      'sourceKind',
      'selectionIncarnation',
      'selectionRevision',
      'state',
      'failureCode',
      ...(Object.hasOwn(value, 'requestId') ? ['requestId'] : []),
    ]) ||
    (value['sourceKind'] !== 'allocation' && value['sourceKind'] !== 'join') ||
    !connectionUuid(value['selectionIncarnation']) ||
    !ordinal(value['selectionRevision']) ||
    value['selectionRevision'] < 1 ||
    (value['state'] !== 'running' &&
      value['state'] !== 'ready' &&
      value['state'] !== 'failed' &&
      value['state'] !== 'interrupted')
  )
    return null;
  const failure = value['failureCode'];
  if (
    failure !== null &&
    failure !== 'temporary' &&
    failure !== 'authentication' &&
    failure !== 'access-denied' &&
    failure !== 'storage-full' &&
    failure !== 'invalid-workspace' &&
    failure !== 'interrupted' &&
    failure !== 'internal'
  )
    return null;
  if (value['requestId'] !== undefined && !connectionUuid(value['requestId'])) return null;
  return {
    ...(typeof value['requestId'] === 'string' ? { requestId: value['requestId'] } : {}),
    sourceKind: value['sourceKind'],
    selectionIncarnation: value['selectionIncarnation'],
    selectionRevision: value['selectionRevision'],
    state: value['state'],
    failureCode: failure,
  };
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
      !exact(c, ['phase', 'rootUrl', 'accountId']) ||
      (c['phase'] !== 'active' && c['phase'] !== 'paused' && c['phase'] !== 'updating-auth') ||
      !parseConnectionRootUrl(c['rootUrl']) ||
      typeof c['rootUrl'] !== 'string' ||
      !text(c['accountId'], 1024)
    )
      return null;
    connection = { phase: c['phase'], rootUrl: c['rootUrl'], accountId: c['accountId'] };
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
  const parsedJob = value['workspaceJob'] === null ? null : workspaceJob(value['workspaceJob']);
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
export function parseSyncProductResult(value: unknown): SyncProductResult | null {
  if (!isRecord(value)) return null;
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
    value['error'] === 'Sync product command refused'
  )
    return { success: false, error: value['error'] };
  if (value['success'] !== true || !exact(value, ['success', 'result'])) return null;
  const result = parseSyncProductResult(value['result']);
  return result ? { success: true, result } : null;
}
