import { sha256 } from '@noble/hashes/sha2.js';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  parseSyncConnectionIdentity,
  type SyncConnectionIdentity,
} from '../remote-connection/model';

/** Exact native enrollment lifetime; this contains no transport configuration. */
export interface SyncQueueScope {
  spaceId: string;
  connectionGeneration: number;
  profileCreatedAt: number;
}
export type SyncQueueStage =
  | 'queued'
  | 'preparing'
  | 'checking'
  | 'writing'
  | 'publishing'
  | 'verifying'
  | 'published';
type SyncQueueStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'cancelled'
  | 'failed'
  | 'interrupted'
  | 'published';
export type SyncQueueFailureCode =
  | 'temporary'
  | 'authentication'
  | 'access-denied'
  | 'storage-full'
  | 'source'
  | 'internal'
  | 'interrupted';
export const SYNC_QUEUE_FAILURE_CODES: readonly SyncQueueFailureCode[] = [
  'temporary',
  'authentication',
  'access-denied',
  'storage-full',
  'source',
  'internal',
  'interrupted',
];
type SyncQueueTransitionCode =
  | 'enqueued'
  | 'paused'
  | 'resumed'
  | 'retried'
  | 'cancelled'
  | 'started'
  | 'advanced'
  | 'failed'
  | 'interrupted'
  | 'published';
/** Pending delivery to existing event history; overflow remains explicit. */
interface SyncQueueTransition {
  sequence: number;
  code: SyncQueueTransitionCode;
  operationRef: string | null;
  stage: SyncQueueStage;
  attemptId: string | null;
}
interface QueueHistory {
  eventSequence: number;
  pendingTransitions: SyncQueueTransition[];
  droppedTransitions: number;
}
export interface SyncQueueConnection extends SyncQueueScope, QueueHistory {
  version: 1;
  kind: 'queue-connection';
  key: string;
  revision: number;
  paused: boolean;
}
export interface SyncQueueOperation extends SyncQueueScope, QueueHistory {
  version: 1;
  kind: 'queue-operation';
  key: string;
  operationId: string;
  captureKey: string;
  captureSha256: string;
  rootKey: string;
  generation: number;
  revision: number;
  status: SyncQueueStatus;
  stage: SyncQueueStage;
  runId: string | null;
  authorization: SyncConnectionIdentity | null;
  writeStarted: boolean;
  outcome: 'none' | 'unknown' | 'verified' | 'observed';
  attemptId: string | null;
  failureCode: SyncQueueFailureCode | null;
}
/** Stage events do not change this command revision. */
export interface SyncQueueRun {
  scope: SyncQueueScope;
  operationId: string;
  runId: string;
  authorization: SyncConnectionIdentity | null;
  revision: number;
}
export const SYNC_QUEUE_STAGES: readonly SyncQueueStage[] = [
  'queued',
  'preparing',
  'checking',
  'writing',
  'publishing',
  'verifying',
  'published',
];
const statuses: readonly SyncQueueStatus[] = [
  'queued',
  'running',
  'paused',
  'cancelled',
  'failed',
  'interrupted',
  'published',
];
const codes: readonly SyncQueueTransitionCode[] = [
  'enqueued',
  'paused',
  'resumed',
  'retried',
  'cancelled',
  'started',
  'advanced',
  'failed',
  'interrupted',
  'published',
];
export function queueOrdinal(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
export function queueIdentity(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256;
}
export function queueUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value)
  );
}
function queueDigest(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value);
}
export function queueHash(value: string): string {
  return Array.from(sha256(new TextEncoder().encode(value)), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}
/** Validate untrusted scope before storage access. */
export function parseSyncQueueScope(value: unknown): SyncQueueScope | null {
  if (
    !isRecord(value) ||
    !queueIdentity(value['spaceId']) ||
    !queueOrdinal(value['connectionGeneration']) ||
    value['connectionGeneration'] < 1 ||
    !queueOrdinal(value['profileCreatedAt'])
  )
    return null;
  return {
    spaceId: value['spaceId'],
    connectionGeneration: value['connectionGeneration'],
    profileCreatedAt: value['profileCreatedAt'],
  };
}
export function queueConnectionKey(scope: SyncQueueScope): string {
  return JSON.stringify([
    'queue-connection-v1',
    scope.spaceId,
    scope.connectionGeneration,
    scope.profileCreatedAt,
  ]);
}
export function queueOperationPrefix(scope: SyncQueueScope): string {
  return `queue-operation-v1:${JSON.stringify([scope.spaceId, scope.connectionGeneration, scope.profileCreatedAt])}:`;
}
export function queueOperationKey(scope: SyncQueueScope, operationId: string): string {
  return `${queueOperationPrefix(scope)}${JSON.stringify(operationId)}`;
}
export function sameQueueScope(left: SyncQueueScope, right: SyncQueueScope): boolean {
  return (
    left.spaceId === right.spaceId &&
    left.connectionGeneration === right.connectionGeneration &&
    left.profileCreatedAt === right.profileCreatedAt
  );
}
function parseHistory(value: Record<string, unknown>): QueueHistory | null {
  const sequence = value['eventSequence'];
  const dropped = value['droppedTransitions'];
  const pending = value['pendingTransitions'];
  if (
    !queueOrdinal(sequence) ||
    !queueOrdinal(dropped) ||
    !Array.isArray(pending) ||
    pending.length > 64 ||
    sequence !== dropped + pending.length
  )
    return null;
  const transitions: SyncQueueTransition[] = [];
  for (const item of pending) {
    if (
      !isRecord(item) ||
      item['sequence'] !== dropped + transitions.length + 1 ||
      !(item['operationRef'] === null || queueDigest(item['operationRef'])) ||
      !(item['attemptId'] === null || queueUuid(item['attemptId']))
    )
      return null;
    const code = codes.find((candidate) => candidate === item['code']);
    const stage = SYNC_QUEUE_STAGES.find((candidate) => candidate === item['stage']);
    if (!code || !stage) return null;
    transitions.push({
      sequence: dropped + transitions.length + 1,
      code,
      stage,
      operationRef: item['operationRef'],
      attemptId: item['attemptId'],
    });
  }
  return { eventSequence: sequence, droppedTransitions: dropped, pendingTransitions: transitions };
}
export function parseSyncQueueConnection(value: unknown): SyncQueueConnection | null {
  const scope = parseSyncQueueScope(value);
  if (!scope || !isRecord(value)) return null;
  const history = parseHistory(value);
  if (
    !history ||
    value['version'] !== 1 ||
    value['kind'] !== 'queue-connection' ||
    value['key'] !== queueConnectionKey(scope) ||
    !queueOrdinal(value['revision']) ||
    typeof value['paused'] !== 'boolean'
  )
    return null;
  return {
    ...scope,
    ...history,
    version: 1,
    kind: 'queue-connection',
    key: value['key'],
    revision: value['revision'],
    paused: value['paused'],
  };
}
export function parseSyncQueueOperation(value: unknown): SyncQueueOperation | null {
  const scope = parseSyncQueueScope(value);
  if (!scope || !isRecord(value)) return null;
  const history = parseHistory(value);
  const authorization =
    value['authorization'] === undefined || value['authorization'] === null
      ? null
      : parseSyncConnectionIdentity(value['authorization']);
  if (value['authorization'] !== undefined && value['authorization'] !== null && !authorization)
    return null;
  const status = statuses.find((candidate) => candidate === value['status']);
  const stage = SYNC_QUEUE_STAGES.find((candidate) => candidate === value['stage']);
  const failureCode =
    value['failureCode'] === null
      ? null
      : SYNC_QUEUE_FAILURE_CODES.find((candidate) => candidate === value['failureCode']);
  if (failureCode === undefined) return null;
  const outcome = (['none', 'unknown', 'verified', 'observed'] as const).find(
    (candidate) => candidate === value['outcome']
  );
  if (
    !history ||
    !status ||
    !stage ||
    !outcome ||
    value['version'] !== 1 ||
    value['kind'] !== 'queue-operation' ||
    !queueIdentity(value['operationId']) ||
    value['key'] !== queueOperationKey(scope, value['operationId']) ||
    typeof value['captureKey'] !== 'string' ||
    value['captureKey'].length > 2048 ||
    !queueDigest(value['captureSha256']) ||
    typeof value['rootKey'] !== 'string' ||
    value['rootKey'].length > 2048 ||
    !queueOrdinal(value['generation']) ||
    value['generation'] < 1 ||
    !queueOrdinal(value['revision']) ||
    value['revision'] < 1 ||
    typeof value['writeStarted'] !== 'boolean' ||
    !(value['runId'] === null || queueUuid(value['runId'])) ||
    !(value['attemptId'] === null || queueUuid(value['attemptId'])) ||
    (status === 'running') !== (value['runId'] !== null) ||
    (status === 'published') !== (outcome === 'verified' || outcome === 'observed')
  )
    return null;
  return {
    ...scope,
    ...history,
    version: 1,
    kind: 'queue-operation',
    key: value['key'],
    operationId: value['operationId'],
    captureKey: value['captureKey'],
    captureSha256: value['captureSha256'],
    rootKey: value['rootKey'],
    generation: value['generation'],
    revision: value['revision'],
    status,
    stage,
    outcome,
    runId: value['runId'],
    authorization,
    writeStarted: value['writeStarted'],
    attemptId: value['attemptId'],
    failureCode,
  };
}
/** Append only fixed safe fields, retaining the explicit history gap. */
export function recordQueueTransition<T extends SyncQueueConnection | SyncQueueOperation>(
  row: T,
  code: SyncQueueTransitionCode
): T {
  const candidate: SyncQueueConnection | SyncQueueOperation = row;
  const operation = candidate.kind === 'queue-operation' ? candidate : null;
  const sequence = row.eventSequence + 1;
  if (!Number.isSafeInteger(sequence)) throw new Error('Sync queue sequence exhausted.');
  const pending = [
    ...row.pendingTransitions,
    {
      sequence,
      code,
      operationRef: operation ? queueHash(operation.key) : null,
      stage: operation?.stage ?? 'queued',
      attemptId: operation?.attemptId ?? null,
    },
  ];
  const overflow = Math.max(0, pending.length - 64);
  return {
    ...row,
    eventSequence: sequence,
    pendingTransitions: pending.slice(overflow),
    droppedTransitions: row.droppedTransitions + overflow,
  };
}
