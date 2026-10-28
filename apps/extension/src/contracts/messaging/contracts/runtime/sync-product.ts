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
      value['rootKind'] !== 'video-review') ||
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
export function parseSyncProductWork(value: unknown): SyncProductWork | null {
  if (!isRecord(value)) return null;
  if (value['kind'] === 'catalog-refresh')
    return exact(value, ['kind', 'bypassCache']) && typeof value['bypassCache'] === 'boolean'
      ? { kind: value['kind'], bypassCache: value['bypassCache'] }
      : null;
  if (
    (value['kind'] === 'replica-prepare' || value['kind'] === 'thumbnail-read') &&
    exact(value, ['kind', 'selection'])
  ) {
    const selection = parseSyncRemoteSelection(value['selection']);
    return selection ? { kind: value['kind'], selection } : null;
  }
  return null;
}
export function parseSyncProductCommand(value: unknown): SyncProductCommand | null {
  if (!isRecord(value)) return null;
  const work = parseSyncProductWork(value);
  if (work) return work;
  if (value['kind'] === 'status' && exact(value, ['kind'])) return { kind: 'status' };
  if (value['kind'] === 'workspace-abandon' && exact(value, ['kind', 'source'])) {
    const source = parseSyncWorkspaceSource(value['source']);
    return source ? { kind: 'workspace-abandon', source } : null;
  }
  if (
    (value['kind'] === 'inspect' || value['kind'] === 'cancel') &&
    exact(value, [
      'kind',
      'requestId',
      ...(Object.hasOwn(value, 'advisory') ? ['advisory'] : []),
    ]) &&
    (!Object.hasOwn(value, 'advisory') || value['advisory'] === true) &&
    connectionUuid(value['requestId'])
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
    (value['kind'] !== 'catalog-refresh' &&
      value['kind'] !== 'replica-prepare' &&
      value['kind'] !== 'thumbnail-read') ||
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
function completion(value: unknown): SyncProductCompletion | null {
  if (!isRecord(value)) return null;
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
  if (!isRecord(value) || !exact(value, ['connection', 'workspace', 'workspaceJob'])) return null;
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
  return { connection, workspace, workspaceJob: parsedJob };
}
export function parseSyncProductResult(value: unknown): SyncProductResult | null {
  if (!isRecord(value)) return null;
  if (
    value['kind'] === 'accepted' &&
    exact(value, [
      'kind',
      'requestId',
      ...(Object.hasOwn(value, 'advisory') ? ['advisory'] : []),
    ]) &&
    (!Object.hasOwn(value, 'advisory') || value['advisory'] === true) &&
    connectionUuid(value['requestId'])
  )
    return { kind: 'accepted', requestId: value['requestId'] };
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
