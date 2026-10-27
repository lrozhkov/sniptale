import type { RuntimeMessageResponse } from '@sniptale/runtime-contracts/messaging/contracts/response';
import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { SyncConnectionIdentity } from '../../../../composition/persistence/remote-connection/model';
import type {
  SyncQueueFailureCode,
  SyncQueueScope,
  SyncQueueStage,
} from '../../../../composition/persistence/sync-capture/queue-model';

/** Disposable executor binding. Native connection and queue records remain authoritative. */
export interface SyncExecutorBinding {
  scope: SyncQueueScope;
  authorization: SyncConnectionIdentity;
}

/** Safe bounded projection of an explicitly selected native operation. */
export interface SyncExecutorJobSnapshot {
  operationId: string;
  expectedRevision: number;
  state: 'running' | 'published' | 'failed' | 'interrupted' | 'busy';
  stage: SyncQueueStage;
  failureCode: SyncQueueFailureCode | null;
  runId: string | null;
}

/** Inspect is independent of active IO; this projection conveys no durable authority. */
export interface SyncExecutorSnapshot {
  offscreenStartupId: string;
  executorId: string;
  executorRevision: number;
  phase: 'idle' | 'running' | 'stopping' | 'stopped' | 'failed';
  binding: SyncExecutorBinding | null;
  jobs: SyncExecutorJobSnapshot[];
}

interface SyncCommandEnvelope {
  capabilityToken: string;
  requestId: string;
  offscreenStartupId: string;
}
export interface SyncStartRequest extends SyncCommandEnvelope, SyncExecutorBinding {
  type: typeof MessageType.OFFSCREEN_SYNC_START;
  executorId: string;
  executorRevision: number;
  operationId: string;
  expectedRevision: number;
}
export interface SyncInspectRequest extends SyncCommandEnvelope {
  type: typeof MessageType.OFFSCREEN_SYNC_INSPECT;
  challenge: string;
}
export interface SyncStopRequest extends SyncCommandEnvelope {
  type: typeof MessageType.OFFSCREEN_SYNC_STOP;
  executorId: string;
  executorRevision: number;
}
/** Background checks the exact durable identity and origin without a coordinator lock. */
export interface SyncOriginPermissionRequest {
  type: typeof MessageType.SYNC_CONNECTION_ORIGIN_PERMISSION;
  requestId: string;
  authorization: SyncConnectionIdentity;
  origin: string;
}
export type SyncStartResponse = RuntimeMessageResponse<{
  result: 'accepted';
  executorId: string;
  executorRevision: number;
}>;
export type SyncInspectResponse = RuntimeMessageResponse<{
  challenge: string;
  snapshot: SyncExecutorSnapshot;
}>;
export type SyncStopResponse = RuntimeMessageResponse<{
  result: 'stopped';
  executorId: string;
  executorRevision: number;
}>;
export type SyncOriginPermissionResponse = RuntimeMessageResponse<{ allowed: boolean }>;
export type SyncConnectionRuntimeRequest =
  | SyncStartRequest
  | SyncInspectRequest
  | SyncStopRequest
  | SyncOriginPermissionRequest;
export type RuntimeSyncConnectionRequestByType = {
  [MessageType.OFFSCREEN_SYNC_START]: SyncStartRequest;
  [MessageType.OFFSCREEN_SYNC_INSPECT]: SyncInspectRequest;
  [MessageType.OFFSCREEN_SYNC_STOP]: SyncStopRequest;
  [MessageType.SYNC_CONNECTION_ORIGIN_PERMISSION]: SyncOriginPermissionRequest;
};
export type RuntimeSyncConnectionResponseByType = {
  [MessageType.OFFSCREEN_SYNC_START]: SyncStartResponse;
  [MessageType.OFFSCREEN_SYNC_INSPECT]: SyncInspectResponse;
  [MessageType.OFFSCREEN_SYNC_STOP]: SyncStopResponse;
  [MessageType.SYNC_CONNECTION_ORIGIN_PERMISSION]: SyncOriginPermissionResponse;
};
