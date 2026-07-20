export type PolicyStateId =
  | 'ai-settings-mutation-queue'
  | 'ai-secret-unlock-requests'
  | 'capture-download-jobs'
  | 'content-action-activation-keys'
  | 'content-action-auto-start-grants'
  | 'content-action-capabilities'
  | 'content-action-runtime-tokens'
  | 'content-action-trusted-event-proofs'
  | 'diagnostics-erasure-exclusion'
  | 'gallery-image-update-capabilities'
  | 'llm-session-tokens'
  | 'native-ingestion-erasure-exclusion'
  | 'page-access-tab-activation'
  | 'persistent-data-erasure-lease'
  | 'popup-export-staged-archives'
  | 'popup-tab-route-capabilities'
  | 'project-export-capabilities'
  | 'project-export-job-ledger'
  | 'recording-download-staged-chunks'
  | 'tab-mode-runtime-state'
  | 'video-recording-control-lease'
  | 'web-snapshot-staged-blobs';

export type PolicyStateClass =
  | 'capability'
  | 'job-state'
  | 'runtime-state'
  | 'staged-artifact'
  | 'unlock-request';

export type PolicyStateStorageClass =
  | 'browser-local-storage'
  | 'browser-session-storage'
  | 'indexed-db'
  | 'memory-only'
  | 'state-manager';

export type PolicyStateRestartClass =
  | 'disposable-fail-closed'
  | 'durable-lease'
  | 'reconstructible'
  | 'transaction-bound';

export type PolicyStateDescriptor = {
  readonly authorityFamily: string;
  readonly failClosedOnRestart: boolean;
  readonly id: PolicyStateId;
  readonly oneShot: boolean;
  readonly ownerModule: string;
  readonly proofModules: readonly string[];
  readonly requiresTtl: boolean;
  readonly restartBehavior: string;
  readonly restartClass: PolicyStateRestartClass;
  readonly stateClass: PolicyStateClass;
  readonly storageClass: PolicyStateStorageClass;
  readonly ttlMs?: number;
};
