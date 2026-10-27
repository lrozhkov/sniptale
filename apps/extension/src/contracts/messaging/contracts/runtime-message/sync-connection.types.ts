import type { RuntimeMessageResponse } from '@sniptale/runtime-contracts/messaging/contracts/response';
import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type {
  SyncConnectionAuthentication,
  SyncConnectionIdentity,
  SyncWorkspaceSource,
} from '../../../../composition/persistence/remote-connection/model';
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

/** Fixed workspace outcome codes exclude provider details and credentials. */
export type SyncWorkspaceFailureCode =
  | 'temporary'
  | 'authentication'
  | 'access-denied'
  | 'storage-full'
  | 'invalid-workspace'
  | 'interrupted'
  | 'internal';

/** Safe projection of the selected workspace source; carries no authentication. */
export interface SyncWorkspaceJobSnapshot {
  sourceKind: SyncWorkspaceSource['kind'];
  selectionIncarnation: string;
  selectionRevision: number;
  state: 'running' | 'ready' | 'failed' | 'interrupted';
  failureCode: SyncWorkspaceFailureCode | null;
}

/** Inspect is independent of active IO; this projection conveys no durable authority. */
export interface SyncExecutorSnapshot {
  offscreenStartupId: string;
  executorId: string;
  executorRevision: number;
  phase: 'idle' | 'running' | 'stopping' | 'stopped' | 'failed';
  binding: SyncExecutorBinding | null;
  jobs: SyncExecutorJobSnapshot[];
  workspace: SyncWorkspaceJobSnapshot | null;
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
/** Bounded credentials live only in this disposable capability command. */
export interface SyncWorkspaceStartRequest extends SyncCommandEnvelope {
  type: typeof MessageType.OFFSCREEN_SYNC_WORKSPACE_START;
  executorId: string;
  executorRevision: number;
  source: SyncWorkspaceSource;
  authentication: SyncConnectionAuthentication;
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
/** Background checks the exact native selection and canonical HTTPS root origin. */
export interface SyncWorkspaceOriginPermissionRequest {
  type: typeof MessageType.SYNC_WORKSPACE_ORIGIN_PERMISSION;
  requestId: string;
  sourceKind: SyncWorkspaceSource['kind'];
  selectionIncarnation: string;
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
  | SyncWorkspaceStartRequest
  | SyncWorkspaceOriginPermissionRequest
  | SyncStartRequest
  | SyncInspectRequest
  | SyncStopRequest
  | SyncOriginPermissionRequest;
export type RuntimeSyncConnectionRequestByType = {
  [MessageType.OFFSCREEN_SYNC_WORKSPACE_START]: SyncWorkspaceStartRequest;
  [MessageType.SYNC_WORKSPACE_ORIGIN_PERMISSION]: SyncWorkspaceOriginPermissionRequest;
  [MessageType.OFFSCREEN_SYNC_START]: SyncStartRequest;
  [MessageType.OFFSCREEN_SYNC_INSPECT]: SyncInspectRequest;
  [MessageType.OFFSCREEN_SYNC_STOP]: SyncStopRequest;
  [MessageType.SYNC_CONNECTION_ORIGIN_PERMISSION]: SyncOriginPermissionRequest;
};
export type RuntimeSyncConnectionResponseByType = {
  [MessageType.OFFSCREEN_SYNC_WORKSPACE_START]: SyncStartResponse;
  [MessageType.SYNC_WORKSPACE_ORIGIN_PERMISSION]: SyncOriginPermissionResponse;
  [MessageType.OFFSCREEN_SYNC_START]: SyncStartResponse;
  [MessageType.OFFSCREEN_SYNC_INSPECT]: SyncInspectResponse;
  [MessageType.OFFSCREEN_SYNC_STOP]: SyncStopResponse;
  [MessageType.SYNC_CONNECTION_ORIGIN_PERMISSION]: SyncOriginPermissionResponse;
};
