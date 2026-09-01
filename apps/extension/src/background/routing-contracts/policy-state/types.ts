export type PolicyStateId =
  | 'ai-settings-mutation-queue'
  | 'ai-secret-unlock-requests'
  | 'annotation-fork-sessions'
  | 'aggregate-editor-presence'
  | 'capture-download-jobs'
  | 'full-page-capture-leases'
  | 'capture-surface-leases'
  | 'content-action-activation-keys'
  | 'content-action-auto-start-grants'
  | 'content-action-capabilities'
  | 'content-action-runtime-tokens'
  | 'content-action-trusted-event-proofs'
  | 'diagnostics-erasure-exclusion'
  | 'frame-annotation-raster-jobs'
  | 'gradient-preset-mutation-queue'
  | 'surface-style-preset-mutation-queue'
  | 'llm-session-tokens'
  | 'native-ingestion-erasure-exclusion'
  | 'offscreen-command-capability-generations'
  | 'page-package-download-leases'
  | 'offscreen-media-activity-lease'
  | 'page-access-tab-activation'
  | 'persistent-data-erasure-lease'
  | 'popup-export-erasure-exclusion'
  | 'popup-export-jobs'
  | 'popup-tab-route-capabilities'
  | 'project-export-capabilities'
  | 'project-export-job-ledger'
  | 'recent-capture-editor-asset-binding'
  | 'tab-mode-runtime-state'
  | 'video-capture-surface-sessions'
  | 'video-camera-recorder-grant'
  | 'video-post-record-results'
  | 'video-recording-control-lease'
  | 'video-recording-surface-lease'
  | 'voice-input-port-session-authority';

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
