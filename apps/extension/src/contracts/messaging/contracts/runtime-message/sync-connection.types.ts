import type { SyncWorkspaceIdentity } from '../../../sync-workspace';
import type {
  SyncCheckpointInterval,
  SyncCheckpointReceipt,
} from '../../../../composition/persistence/sync-capture/checkpoint-contracts';
import type {
  SyncCacheStatus,
  SyncCacheRootStatus,
  SyncCacheReleaseResult,
  SyncCacheTrimResult,
} from '../../../sync-cache';
import type { RuntimeMessageResponse } from '@sniptale/runtime-contracts/messaging/contracts/response';
import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type {
  SyncConnectionAuthentication,
  SyncConnectionIdentity,
  SyncWorkspaceSource,
  SyncStoragePolicy,
} from '../../../../composition/persistence/remote-connection/model';
import type {
  SyncQueueFailureCode,
  SyncQueueScope,
  SyncQueueStage,
} from '../../../../composition/persistence/sync-capture/queue-model';

/** Private command authority. This value never enters executor snapshots or UI projections. */
export interface SyncCredentialLease {
  leaseId: string;
  workerEpoch: string;
  protectionEpoch: number;
  offscreenStartupId: string;
  executorId: string;
  authorization: SyncConnectionIdentity;
  credentialId: string;
}
export interface SyncCredentialRequest {
  type: typeof MessageType.SYNC_CONNECTION_CREDENTIAL;
  requestId: string;
  credentialLease: SyncCredentialLease;
}
export type SyncCredentialResponse = RuntimeMessageResponse<{
  authentication: SyncConnectionAuthentication;
  credentialLease: SyncCredentialLease;
}>;

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
  | 'secrets-locked'
  | 'temporary'
  | 'authentication'
  | 'access-denied'
  | 'storage-full'
  | 'invalid-workspace'
  | 'interrupted'
  | 'internal';

/** Fixed discovery failures exclude provider text and credentials. */
export type SyncWorkspaceDiscoveryIssueCode =
  | SyncWorkspaceFailureCode
  | 'bootstrap-incomplete'
  | 'unsupported-format'
  | 'metadata-limit'
  | 'pagination-cycle'
  | 'invalid-response';
/** Bounded marker observations convey no enrollment or credential authority. */
export interface SyncWorkspaceDiscovery {
  source: SyncWorkspaceSource & { kind: 'join' };
  scope: 'exact' | 'children';
  complete: boolean;
  candidates: { prefix: string; identity: SyncWorkspaceIdentity }[];
  issues: { prefix: string; code: SyncWorkspaceDiscoveryIssueCode }[];
}
/** Safe projection of the selected workspace source; carries no authentication. */
export type SyncWorkspaceJobSnapshot = {
  requestId?: string;
  selectionIncarnation: string;
  selectionRevision: number;
} & (
  | {
      sourceKind: 'allocation' | 'join';
      state: 'running' | 'ready' | 'failed' | 'interrupted';
      failureCode: SyncWorkspaceFailureCode | null;
      discovery?: never;
    }
  | {
      sourceKind: 'join';
      state: 'discovered';
      failureCode: null;
      discovery: SyncWorkspaceDiscovery;
    }
);

/** Inspect is independent of active IO; this projection conveys no durable authority. */
export interface SyncExecutorSnapshot {
  offscreenStartupId: string;
  executorId: string;
  executorRevision: number;
  phase: 'idle' | 'running' | 'stopping' | 'stopped' | 'failed';
  binding: SyncExecutorBinding | null;
  jobs: SyncExecutorJobSnapshot[];
  workspace: SyncWorkspaceJobSnapshot | null;
  products?: SyncProductJobSnapshot[];
}

interface SyncCommandEnvelope {
  capabilityToken: string;
  requestId: string;
  offscreenStartupId: string;
}
export interface SyncStartRequest extends SyncCommandEnvelope, SyncExecutorBinding {
  credentialLease?: SyncCredentialLease;
  type: typeof MessageType.OFFSCREEN_SYNC_START;
  executorId: string;
  executorRevision: number;
  operationId: string;
  expectedRevision: number;
}
/** Bounded credentials live only in this disposable capability command. */
export interface SyncWorkspaceStartRequest extends SyncCommandEnvelope {
  operation?: 'discover';
  type: typeof MessageType.OFFSCREEN_SYNC_WORKSPACE_START;
  executorId: string;
  executorRevision: number;
  source: SyncWorkspaceSource;
  authentication: SyncConnectionAuthentication;
}
export interface SyncInspectRequest extends SyncCommandEnvelope {
  /** Advisory traffic cannot consume reserved foreground control capacity. */
  advisory?: true;
  type: typeof MessageType.OFFSCREEN_SYNC_INSPECT;
  challenge: string;
}
export interface SyncStopRequest extends SyncCommandEnvelope {
  reason?: 'secrets-locked';
  type: typeof MessageType.OFFSCREEN_SYNC_STOP;
  executorId: string;
  executorRevision: number;
}
/** Background checks the exact durable identity and origin without a coordinator lock. */
export interface SyncOriginPermissionRequest {
  credentialLease?: SyncCredentialLease;
  advisory?: true;
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
export type SyncOriginPermissionResponse = RuntimeMessageResponse<{
  allowed: boolean;
  reason?: 'secrets-locked';
}>;
export type SyncConnectionRuntimeRequest =
  | SyncCredentialRequest
  | SyncProductRequest
  | SyncProductExecutorRequest
  | SyncWorkspaceStartRequest
  | SyncWorkspaceOriginPermissionRequest
  | SyncStartRequest
  | SyncInspectRequest
  | SyncStopRequest
  | SyncOriginPermissionRequest;
export type RuntimeSyncConnectionRequestByType = {
  [MessageType.SYNC_CONNECTION_CREDENTIAL]: SyncCredentialRequest;
  [MessageType.SYNC_PRODUCT_COMMAND]: SyncProductRequest;
  [MessageType.OFFSCREEN_SYNC_PRODUCT_COMMAND]: SyncProductExecutorRequest;
  [MessageType.OFFSCREEN_SYNC_WORKSPACE_START]: SyncWorkspaceStartRequest;
  [MessageType.SYNC_WORKSPACE_ORIGIN_PERMISSION]: SyncWorkspaceOriginPermissionRequest;
  [MessageType.OFFSCREEN_SYNC_START]: SyncStartRequest;
  [MessageType.OFFSCREEN_SYNC_INSPECT]: SyncInspectRequest;
  [MessageType.OFFSCREEN_SYNC_STOP]: SyncStopRequest;
  [MessageType.SYNC_CONNECTION_ORIGIN_PERMISSION]: SyncOriginPermissionRequest;
};
export type RuntimeSyncConnectionResponseByType = {
  [MessageType.SYNC_CONNECTION_CREDENTIAL]: SyncCredentialResponse;
  [MessageType.SYNC_PRODUCT_COMMAND]: SyncProductResponse;
  [MessageType.OFFSCREEN_SYNC_PRODUCT_COMMAND]: SyncProductResponse;
  [MessageType.OFFSCREEN_SYNC_WORKSPACE_START]: SyncStartResponse;
  [MessageType.SYNC_WORKSPACE_ORIGIN_PERMISSION]: SyncOriginPermissionResponse;
  [MessageType.OFFSCREEN_SYNC_START]: SyncStartResponse;
  [MessageType.OFFSCREEN_SYNC_INSPECT]: SyncInspectResponse;
  [MessageType.OFFSCREEN_SYNC_STOP]: SyncStopResponse;
  [MessageType.SYNC_CONNECTION_ORIGIN_PERMISSION]: SyncOriginPermissionResponse;
};

/** Exact version selected from a remote card; contains no native admission authority. */
export interface SyncRemoteSelection {
  rootKind: 'media' | 'video-project' | 'video-review' | 'scenario-project';
  rootId: string;
  operationId: string;
  sourceDigest: string;
}

/** Display-only remote metadata. This is never a native Library entry. */
export interface SyncRemoteCatalogCard {
  source: 'remote';
  /** Exact native causal receipt exists; this conveys no physical availability authority. */
  materialized?: true;
  selection: SyncRemoteSelection;
  label: string;
  tags: string[];
  kind: 'image' | 'video' | 'audio' | 'video-project' | 'video-review' | 'scenario';
  mimeType: string | null;
  size: number;
  createdAt: number;
  updatedAt: number;
  conflict: boolean;
  /** The exact competing heads visible when the user selects a retained version. */
  versions?: { selection: SyncRemoteSelection; label: string; deleted: boolean }[];
  unavailable: boolean;
  deleted: boolean;
}

export type SyncNativeEditingRoot = Pick<SyncRemoteSelection, 'rootKind' | 'rootId'>;

/** Canonical structural projection of the existing Library export choices, without download authority. */
export interface SyncLibraryBackupOptions {
  includeDrafts: boolean;
  includeSourceMetadata: boolean;
  includeTelemetry: boolean;
  includeWebSnapshots: boolean;
  scope: 'all' | 'selected';
  selected?: {
    mediaAssetIds: string[];
    scenarioProjectIds: string[];
    videoProjectIds: string[];
  };
}

export type SyncProductWork =
  | {
      kind: 'library-backup-prepare';
      expected: SyncConnectionIdentity;
      options: SyncLibraryBackupOptions;
    }
  | { kind: 'backup-prepare'; root: SyncNativeEditingRoot }
  | { kind: 'native-release'; root: SyncNativeEditingRoot }
  | { kind: 'cache-trim' }
  | { kind: 'native-prepare'; root: SyncNativeEditingRoot }
  | { kind: 'scenario-export-prepare'; projectId: string; exportId: string }
  | { kind: 'automatic-sync' }
  | { kind: 'catalog-refresh'; bypassCache: boolean }
  | { kind: 'replica-prepare'; selection: SyncRemoteSelection; preserveNative?: true }
  | { kind: 'thumbnail-read'; selection: SyncRemoteSelection }
  | {
      kind: 'conflict-resolve';
      selection: SyncRemoteSelection;
      expectedHeads: string[];
      resolutionId: string;
    };
export type SyncProductCommand =
  | { kind: 'checkpoint-policy' }
  | { kind: 'checkpoint-interval'; intervalMs: SyncCheckpointInterval }
  | { kind: 'checkpoint-flush' }
  | { kind: 'checkpoint-exit'; receipt: SyncCheckpointReceipt }
  | { kind: 'checkpoint-wake' }
  | { kind: 'cache-status' }
  | { kind: 'cache-budget'; budgetBytes: number; revision: number }
  | { kind: 'cache-root-status'; root: SyncNativeEditingRoot }
  | { kind: 'cache-pin'; root: SyncNativeEditingRoot; pinned: boolean }
  | {
      kind: 'workspace-create';
      parentUrl: string;
      accountId: string;
      authentication: SyncConnectionAuthentication;
    }
  | {
      kind: 'workspace-discover';
      rootUrl: string;
      accountId: string;
      authentication: SyncConnectionAuthentication;
      previous: SyncWorkspaceSource | null;
    }
  | {
      kind: 'workspace-join';
      source: SyncWorkspaceSource & { kind: 'join' };
      prefix: string;
      expected: SyncWorkspaceIdentity;
      authentication: SyncConnectionAuthentication;
    }
  | {
      kind: 'workspace-retry';
      operation?: 'discover';
      source: SyncWorkspaceSource;
      authentication: SyncConnectionAuthentication;
    }
  | {
      kind: 'workspace-enroll';
      source: SyncWorkspaceSource;
      authentication: SyncConnectionAuthentication;
      storagePolicy: SyncStoragePolicy;
    }
  | { kind: 'workspace-abandon'; source: SyncWorkspaceSource }
  | { kind: 'status' }
  | { kind: 'runtime-status' }
  | {
      kind: 'connection-authentication';
      expected: SyncConnectionIdentity;
      authentication: SyncConnectionAuthentication;
    }
  | { kind: 'connection-resume'; expected: SyncConnectionIdentity }
  | { kind: 'connection-local-only'; expected: SyncConnectionIdentity }
  | Exclude<SyncProductWork, { kind: 'automatic-sync' }>
  | { kind: 'inspect'; requestId: string; advisory?: true }
  | { kind: 'cancel'; requestId: string; advisory?: true };
export type SyncProductFailureCode =
  | SyncWorkspaceFailureCode
  | 'selection-changed'
  | 'unavailable'
  | 'invalid-data';
export type SyncProductCompletion =
  | { kind: 'library-backup'; expected: SyncConnectionIdentity; options: SyncLibraryBackupOptions }
  | { kind: 'native-release'; root: SyncNativeEditingRoot; result: SyncCacheReleaseResult }
  | { kind: 'cache-trim'; result: SyncCacheTrimResult }
  | { kind: 'native'; root: SyncNativeEditingRoot }
  | { kind: 'scenario-export'; projectId: string; exportId: string }
  | { kind: 'automatic'; applied: number; deferred: number; remaining: boolean }
  | { kind: 'resolution'; operationId: string }
  | { kind: 'catalog'; count: number }
  | { kind: 'replica'; selection: SyncRemoteSelection }
  | { kind: 'thumbnail'; dataUrl: string | null; width: number; height: number };
export interface SyncProductJobSnapshot {
  requestId: string;
  kind: SyncProductWork['kind'];
  state: 'running' | 'ready' | 'failed' | 'interrupted';
  failureCode: SyncProductFailureCode | null;
}
export interface SyncProductStatus {
  connection: {
    expected: SyncConnectionIdentity;
    phase: 'active' | 'paused' | 'updating-auth';
    rootUrl: string;
    accountId: string;
  } | null;
  workspace: {
    source: SyncWorkspaceSource;
    phase: 'planned' | 'allocating' | 'allocated' | 'checking' | 'ready';
    rootUrl: string;
    accountId: string;
  } | null;
  workspaceJob: SyncWorkspaceJobSnapshot | null;
  products: SyncProductJobSnapshot[];
}
/** Public popup observation excludes native identities and execution authority. */
export interface SyncPopupRuntimeStatus {
  configuration: 'configured' | 'unconfigured' | 'unknown';
  connection: 'active' | 'paused' | 'credentials-required' | 'updating-auth' | null;
  localPublication: 'waiting' | 'published' | 'discovering' | 'unknown';
  activity: 'idle' | 'running' | 'stopping' | 'unknown';
  remote:
    | { knowledge: 'unknown' }
    | { knowledge: 'observed-pass'; outcome: 'complete' | 'deferred' };
  protection: 'not-enrolled' | 'unlocked' | 'locked' | 'unknown';
  issue:
    | SyncProductFailureCode
    | 'queue-problem'
    | 'permission-required'
    | 'index-coverage'
    | 'not-ready'
    | null;
  repair:
    | 'connection'
    | 'security'
    | 'queue'
    | 'queue-problems'
    | 'queue-action-required'
    | 'storage'
    | null;
}
export type SyncProductResult =
  | { kind: 'checkpoint-policy'; intervalMs: SyncCheckpointInterval }
  | { kind: 'checkpoint-flushed'; updated: number; alreadyDue: number }
  | { kind: 'checkpoint-woken' }
  | {
      kind: 'checkpoint-exit';
      outcome: 'requested' | 'already-due' | 'stale' | 'not-pending' | 'unconfigured';
    }
  | { kind: 'local-only'; history: 'delivered' | 'incomplete' }
  | {
      kind: 'local-only-refused';
      code: 'missing-bytes' | 'local-changed' | 'pending-outgoing' | 'invalid-data';
    }
  | { kind: 'cache-status'; status: SyncCacheStatus }
  | { kind: 'cache-budget'; budgetBytes: number; revision: number }
  | { kind: 'cache-root'; status: SyncCacheRootStatus }
  | { kind: 'accepted'; requestId: string }
  | { kind: 'status'; status: SyncProductStatus }
  | { kind: 'runtime-status'; status: SyncPopupRuntimeStatus }
  | { kind: 'enrolled' }
  | {
      kind: 'operation';
      job: SyncProductJobSnapshot | null;
      completion: SyncProductCompletion | null;
    }
  | { kind: 'cancelled'; outcome: 'cancelled' | 'already-completed' | 'refused' };
export interface SyncProductRequest {
  type: typeof MessageType.SYNC_PRODUCT_COMMAND;
  requestId: string;
  command: SyncProductCommand;
}
export type SyncProductResponse = RuntimeMessageResponse<{ result: SyncProductResult }>;
/** Background supplies the exact native connection, never the product page. */
export interface SyncProductExecutorRequest extends SyncCommandEnvelope {
  advisory?: true;
  type: typeof MessageType.OFFSCREEN_SYNC_PRODUCT_COMMAND;
  executorId: string;
  executorRevision: number;
  command:
    | {
        kind: 'start';
        credentialLease?: SyncCredentialLease;
        operationRequestId: string;
        binding: SyncExecutorBinding;
        work: SyncProductWork;
      }
    | { kind: 'inspect'; operationRequestId: string }
    | { kind: 'cancel'; operationRequestId: string };
}
