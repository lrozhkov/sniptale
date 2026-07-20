type RuntimeStateAuthorityClass =
  | 'disposable-capability'
  | 'durable-job'
  | 'durable-lease'
  | 'durable-persistence'
  | 'runtime-session'
  | 'transaction-bound';

export type RuntimeStateAuthorityFlowId =
  | 'ai-egress-lease'
  | 'capture-download'
  | 'diagnostics-session'
  | 'editor-bootstrap'
  | 'offscreen-command'
  | 'page-access-activation'
  | 'page-style-runtime'
  | 'popup-export'
  | 'privacy-erasure'
  | 'project-export'
  | 'scenario-mutation'
  | 'video-recording'
  | 'web-snapshot-save';

export type RuntimeStateAuthorityFlow = {
  advisoryState: readonly string[];
  authorityClass: RuntimeStateAuthorityClass;
  authoritativeState: readonly string[];
  cleanupOwnerModule: string;
  correlationKeys: readonly string[];
  disposableState: readonly string[];
  flowId: RuntimeStateAuthorityFlowId;
  freshnessReplayPolicy: string;
  name: string;
  ownerModule: string;
  proofModules: readonly string[];
  restartBehavior: string;
  writeFailurePolicy: string;
};
