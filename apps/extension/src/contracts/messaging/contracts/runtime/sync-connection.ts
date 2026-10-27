import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { MessageContractError } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  connectionUuid,
  parseSyncConnectionIdentity,
} from '../../../../composition/persistence/remote-connection/model';
import {
  parseSyncQueueScope,
  queueIdentity,
  queueOrdinal,
  queueUuid,
  SYNC_QUEUE_FAILURE_CODES,
  SYNC_QUEUE_STAGES,
} from '../../../../composition/persistence/sync-capture/queue-model';
import type {
  RuntimeSyncConnectionRequestByType,
  RuntimeSyncConnectionResponseByType,
  SyncConnectionRuntimeRequest,
  SyncExecutorBinding,
  SyncExecutorJobSnapshot,
  SyncExecutorSnapshot,
} from '../runtime-message/sync-connection.types';
import type { PartialRuntimeRegistry } from '../runtime-message.registry';

function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return (
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
  );
}
function positive(value: unknown): value is number {
  return queueOrdinal(value) && value > 0;
}
function token(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 4096;
}
function member<T extends string>(values: readonly T[], value: unknown): value is T {
  return values.some((candidate) => candidate === value);
}
function binding(input: unknown): SyncExecutorBinding | null {
  if (!isRecord(input) || !exact(input, ['scope', 'authorization'])) return null;
  const scope = parseScope(input['scope']);
  const authorization = parseSyncConnectionIdentity(input['authorization']);
  return scope && authorization ? { scope, authorization } : null;
}
function parseScope(input: unknown) {
  if (!isRecord(input) || !exact(input, ['spaceId', 'connectionGeneration', 'profileCreatedAt']))
    return null;
  return parseSyncQueueScope(input);
}
function job(input: unknown): SyncExecutorJobSnapshot | null {
  if (
    !isRecord(input) ||
    !exact(input, ['operationId', 'expectedRevision', 'state', 'stage', 'failureCode', 'runId']) ||
    !queueIdentity(input['operationId']) ||
    !positive(input['expectedRevision']) ||
    !member(['running', 'published', 'failed', 'interrupted', 'busy'] as const, input['state']) ||
    !member(SYNC_QUEUE_STAGES, input['stage']) ||
    !(input['failureCode'] === null || member(SYNC_QUEUE_FAILURE_CODES, input['failureCode'])) ||
    !(input['runId'] === null || queueUuid(input['runId']))
  )
    return null;
  return {
    operationId: input['operationId'],
    expectedRevision: input['expectedRevision'],
    state: input['state'],
    stage: input['stage'],
    failureCode: input['failureCode'],
    runId: input['runId'],
  };
}
/** Parse the complete disposable projection without admitting provider or source payloads. */
export function parseSyncExecutorSnapshot(input: unknown): SyncExecutorSnapshot | null {
  if (
    !isRecord(input) ||
    !exact(input, [
      'offscreenStartupId',
      'executorId',
      'executorRevision',
      'phase',
      'binding',
      'jobs',
    ]) ||
    !connectionUuid(input['offscreenStartupId']) ||
    !connectionUuid(input['executorId']) ||
    !positive(input['executorRevision']) ||
    !member(['idle', 'running', 'stopping', 'stopped', 'failed'] as const, input['phase']) ||
    !Array.isArray(input['jobs']) ||
    input['jobs'].length > 128
  )
    return null;
  const parsedBinding = input['binding'] === null ? null : binding(input['binding']);
  if (input['binding'] !== null && !parsedBinding) return null;
  const jobs: SyncExecutorJobSnapshot[] = [];
  const identities = new Set<string>();
  for (const value of input['jobs']) {
    const parsed = job(value);
    if (!parsed || identities.has(parsed.operationId)) return null;
    identities.add(parsed.operationId);
    jobs.push(parsed);
  }
  if (jobs.filter((item) => item.state === 'running').length > 2) return null;
  return {
    offscreenStartupId: input['offscreenStartupId'],
    executorId: input['executorId'],
    executorRevision: input['executorRevision'],
    phase: input['phase'],
    binding: parsedBinding,
    jobs,
  };
}
function canonicalOrigin(input: unknown): input is string {
  if (typeof input !== 'string' || input.length > 4096) return false;
  try {
    const url = new URL(input);
    return url.protocol === 'https:' && url.hostname !== '' && url.origin === input;
  } catch {
    return false;
  }
}
/** Receive unknown IPC values and reconstruct only the selected safe command. */
export function parseSyncConnectionRuntimeMessage(
  input: unknown
): SyncConnectionRuntimeRequest | null {
  if (!isRecord(input) || !connectionUuid(input['requestId'])) return null;
  const requestId = input['requestId'];
  if (input['type'] === MessageType.SYNC_CONNECTION_ORIGIN_PERMISSION) {
    const authorization = parseSyncConnectionIdentity(input['authorization']);
    if (
      !exact(input, ['type', 'requestId', 'authorization', 'origin']) ||
      !authorization ||
      !canonicalOrigin(input['origin'])
    )
      return null;
    return { type: input['type'], requestId, authorization, origin: input['origin'] };
  }
  if (!token(input['capabilityToken']) || !connectionUuid(input['offscreenStartupId'])) return null;
  const common = {
    capabilityToken: input['capabilityToken'],
    requestId,
    offscreenStartupId: input['offscreenStartupId'],
  };
  const envelope = ['type', 'capabilityToken', 'requestId', 'offscreenStartupId'];
  if (input['type'] === MessageType.OFFSCREEN_SYNC_INSPECT) {
    if (!exact(input, [...envelope, 'challenge']) || !connectionUuid(input['challenge']))
      return null;
    return { type: input['type'], ...common, challenge: input['challenge'] };
  }
  if (!connectionUuid(input['executorId']) || !positive(input['executorRevision'])) return null;
  const target = { executorId: input['executorId'], executorRevision: input['executorRevision'] };
  if (input['type'] === MessageType.OFFSCREEN_SYNC_STOP) {
    if (!exact(input, [...envelope, 'executorId', 'executorRevision'])) return null;
    return { type: input['type'], ...common, ...target };
  }
  if (input['type'] === MessageType.OFFSCREEN_SYNC_START) {
    const scope = parseScope(input['scope']);
    const authorization = parseSyncConnectionIdentity(input['authorization']);
    if (
      !exact(input, [
        ...envelope,
        'executorId',
        'executorRevision',
        'scope',
        'authorization',
        'operationId',
        'expectedRevision',
      ]) ||
      !scope ||
      !authorization ||
      !queueIdentity(input['operationId']) ||
      !positive(input['expectedRevision'])
    )
      return null;
    return {
      type: input['type'],
      ...common,
      ...target,
      scope,
      authorization,
      operationId: input['operationId'],
      expectedRevision: input['expectedRevision'],
    };
  }
  return null;
}
function invalid(): never {
  throw new MessageContractError('Invalid sync runtime contract');
}
function response<T extends keyof RuntimeSyncConnectionResponseByType>(
  type: T,
  input: unknown
): RuntimeSyncConnectionResponseByType[T] {
  if (!isRecord(input)) return invalid();
  if (input['success'] === false) {
    const error =
      type === MessageType.SYNC_CONNECTION_ORIGIN_PERMISSION
        ? 'Sync origin permission query refused'
        : 'Sync executor command refused';
    if (!exact(input, ['success', 'error']) || input['error'] !== error) return invalid();
    return { success: false, error };
  }
  // Per-command functions below preserve each response's concrete payload type.
  return invalid();
}
function contract<T extends keyof RuntimeSyncConnectionRequestByType>(
  type: T,
  parseSuccess: (input: Record<string, unknown>) => RuntimeSyncConnectionResponseByType[T] | null
) {
  return {
    parseRequest(input: unknown): RuntimeSyncConnectionRequestByType[T] {
      const parsed = parseSyncConnectionRuntimeMessage(input);
      if (!parsed || parsed.type !== type) return invalid();
      // Narrow through the exhaustive concrete registry rather than a boundary cast.
      return requestFor(type, parsed);
    },
    parseResponse(input: unknown): RuntimeSyncConnectionResponseByType[T] {
      if (!isRecord(input) || input['success'] !== true) return response(type, input);
      return parseSuccess(input) ?? invalid();
    },
  };
}
function requestFor<T extends keyof RuntimeSyncConnectionRequestByType>(
  type: T,
  parsed: SyncConnectionRuntimeRequest
): RuntimeSyncConnectionRequestByType[T] {
  // A keyed guard retains the discriminant relation without casting untrusted input.
  function matches(
    value: SyncConnectionRuntimeRequest
  ): value is RuntimeSyncConnectionRequestByType[T] {
    return value.type === type;
  }
  return matches(parsed) ? parsed : invalid();
}
export const runtimeSyncConnectionMessageContracts = {
  [MessageType.OFFSCREEN_SYNC_START]: contract(MessageType.OFFSCREEN_SYNC_START, (value) =>
    exact(value, ['success', 'result', 'executorId', 'executorRevision']) &&
    value['result'] === 'accepted' &&
    connectionUuid(value['executorId']) &&
    positive(value['executorRevision'])
      ? {
          success: true,
          result: 'accepted',
          executorId: value['executorId'],
          executorRevision: value['executorRevision'],
        }
      : null
  ),
  [MessageType.OFFSCREEN_SYNC_INSPECT]: contract(MessageType.OFFSCREEN_SYNC_INSPECT, (value) => {
    const snapshot = parseSyncExecutorSnapshot(value['snapshot']);
    return exact(value, ['success', 'challenge', 'snapshot']) &&
      connectionUuid(value['challenge']) &&
      snapshot
      ? { success: true, challenge: value['challenge'], snapshot }
      : null;
  }),
  [MessageType.OFFSCREEN_SYNC_STOP]: contract(MessageType.OFFSCREEN_SYNC_STOP, (value) =>
    exact(value, ['success', 'result', 'executorId', 'executorRevision']) &&
    value['result'] === 'stopped' &&
    connectionUuid(value['executorId']) &&
    positive(value['executorRevision'])
      ? {
          success: true,
          result: 'stopped',
          executorId: value['executorId'],
          executorRevision: value['executorRevision'],
        }
      : null
  ),
  [MessageType.SYNC_CONNECTION_ORIGIN_PERMISSION]: contract(
    MessageType.SYNC_CONNECTION_ORIGIN_PERMISSION,
    (value) =>
      exact(value, ['success', 'allowed']) && typeof value['allowed'] === 'boolean'
        ? { success: true, allowed: value['allowed'] }
        : null
  ),
} satisfies PartialRuntimeRegistry;
