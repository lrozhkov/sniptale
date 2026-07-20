type RuntimeAuthorityRestartClass =
  | 'disposable-fail-closed'
  | 'durable-lease'
  | 'reconstructible'
  | 'transaction-bound';

type RuntimeAuthorityRestartSemantics = {
  authority: string;
  ownerModule: string;
  proofModule: string;
  restartBehavior: string;
  restartClass: RuntimeAuthorityRestartClass;
};

export const runtimeAuthorityRestartSemantics = [
  {
    authority: 'AI secret unlock requests',
    ownerModule: 'apps/extension/src/background/ai/settings/secret-unlock-route.ts',
    proofModule: 'apps/extension/src/background/ai/settings/secret-unlock-route.lifecycle.test.ts',
    restartBehavior:
      'Pending unlock request metadata is recovered from session storage; decrypted key material ' +
      'remains memory-only and reports restart-required after restart.',
    restartClass: 'reconstructible',
  },
  {
    authority: 'Debugger activation proofs',
    ownerModule: 'apps/extension/src/background/debugger/session/activation.ts',
    proofModule: 'apps/extension/src/background/debugger/session/attach.test.ts',
    restartBehavior: 'One-shot debugger activation proofs fail closed before attach side effects.',
    restartClass: 'disposable-fail-closed',
  },
  {
    authority: 'HAR active sessions and timers',
    ownerModule: 'apps/extension/src/background/diagnostics/export-har-collector/session-state.ts',
    proofModule:
      'apps/extension/src/background/diagnostics/export-har-collector/session-state.test.ts',
    restartBehavior: 'Active debugger-backed HAR sessions are transaction-bound to the worker.',
    restartClass: 'transaction-bound',
  },
  {
    authority: 'HAR start capabilities',
    ownerModule:
      'apps/extension/src/background/diagnostics/export-har-collector/start-capability.ts',
    proofModule:
      'apps/extension/src/background/diagnostics/export-har-collector/session-start-capability.test.ts',
    restartBehavior:
      'Disposable HAR start capabilities fail closed and callers request a fresh token.',
    restartClass: 'disposable-fail-closed',
  },
  {
    authority: 'LLM session tokens',
    ownerModule: 'apps/extension/src/background/ai/llm/session-tokens.ts',
    proofModule: 'apps/extension/src/background/ai/llm/session-tokens.test.ts',
    restartBehavior: 'Disposable one-shot tokens fail closed and callers request a fresh session.',
    restartClass: 'disposable-fail-closed',
  },
  {
    authority: 'Popup tab-route capabilities',
    ownerModule:
      'apps/extension/src/background/runtime/routing/capabilities/popup-tab/route-capabilities.ts',
    proofModule:
      'apps/extension/src/background/runtime/routing/capabilities/popup-tab/route-capabilities.test.ts',
    restartBehavior: 'Disposable popup capabilities fail closed and popup flows reissue.',
    restartClass: 'disposable-fail-closed',
  },
  {
    authority: 'Content privileged action capabilities',
    ownerModule:
      'apps/extension/src/background/routing-contracts/capabilities/content-action/capability-store.ts',
    proofModule:
      'apps/extension/src/background/routing-contracts/capabilities/content-action/capability-store.test.ts',
    restartBehavior:
      'Disposable content action capabilities and auto-start grants fail closed after restart.',
    restartClass: 'disposable-fail-closed',
  },
  {
    authority: 'Content privileged action activation keys',
    ownerModule:
      'apps/extension/src/background/routing-contracts/capabilities/content-action/activation-store.ts',
    proofModule:
      'apps/extension/src/background/routing-contracts/capabilities/content-action/activation.test.ts',
    restartBehavior:
      'Disposable content action activation keys fail closed and content-owned flows request a ' +
      'fresh trusted activation.',
    restartClass: 'disposable-fail-closed',
  },
  {
    authority: 'Content privileged action runtime proofs',
    ownerModule:
      'apps/extension/src/background/routing-contracts/capabilities/content-action/proof-store.ts',
    proofModule:
      'apps/extension/src/background/routing-contracts/capabilities/content-action/capabilities.proof.test.ts',
    restartBehavior:
      'Disposable content action runtime tokens and proofs fail closed after worker restart.',
    restartClass: 'disposable-fail-closed',
  },
  {
    authority: 'Gallery image update capabilities',
    ownerModule: 'apps/extension/src/background/capture/routing/gallery-update-capabilities.ts',
    proofModule:
      'apps/extension/src/background/capture/routing/gallery-update-capabilities.owner.test.ts',
    restartBehavior: 'Disposable editor image-update tokens fail closed after worker restart.',
    restartClass: 'disposable-fail-closed',
  },
  {
    authority: 'Web snapshot staged blobs',
    ownerModule: 'apps/extension/src/background/capture/routing/web-snapshot/staged-blobs.ts',
    proofModule: 'apps/extension/src/background/capture/routing/web-snapshot/staged-blobs.test.ts',
    restartBehavior: 'In-flight chunks are transaction-bound; missing staged blobs fail fast.',
    restartClass: 'transaction-bound',
  },
  {
    authority: 'Recording download staged chunks',
    ownerModule:
      'apps/extension/src/background/capture/routing/recording-download/staged-recordings.ts',
    proofModule:
      'apps/extension/src/background/capture/routing/recording-download/staged-recordings.test.ts',
    restartBehavior:
      'In-flight recording chunks are transaction-bound; final save fails closed when staging state is absent.',
    restartClass: 'transaction-bound',
  },
  {
    authority: 'Popup export staged archives',
    ownerModule: 'apps/extension/src/background/capture/popup-export/staged-archives.ts',
    proofModule: 'apps/extension/src/background/capture/popup-export/staged-archives.test.ts',
    restartBehavior: 'In-flight archive chunks are transaction-bound and final save fails closed.',
    restartClass: 'transaction-bound',
  },
  {
    authority: 'Video recording control lease',
    ownerModule: 'apps/extension/src/background/media/video/recording-control-lease/index.ts',
    proofModule: 'apps/extension/src/background/media/video/recording-control-lease.test.ts',
    restartBehavior: 'Recording control authority is storage-backed and hydrated before controls.',
    restartClass: 'durable-lease',
  },
  {
    authority: 'Project export ledger and capabilities',
    ownerModule: 'apps/extension/src/background/media/video/runtime/export-capabilities.ts',
    proofModule:
      'apps/extension/src/background/media/video/runtime/handlers/export/project-export.capability-reissue.test.ts',
    restartBehavior: 'Export jobs reconcile through the ledger and reissue owner-scoped controls.',
    restartClass: 'durable-lease',
  },
  {
    authority: 'Tab-mode runtime state',
    ownerModule: 'apps/extension/src/background/application/runtime-state/index.ts',
    proofModule: 'apps/extension/src/background/application/runtime-state/index.test.ts',
    restartBehavior: 'Mode maps are reconstructible from content/UI status re-requests.',
    restartClass: 'reconstructible',
  },
] as const satisfies readonly RuntimeAuthorityRestartSemantics[];
