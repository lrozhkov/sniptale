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
    authority: 'Page Package job',
    ownerModule: 'apps/extension/src/background/capture/page-package/job/index.ts',
    proofModule: 'apps/extension/src/background/capture/page-package/job/index.test.ts',
    restartBehavior: 'Unfinished memory-only work becomes interrupted after worker restart.',
    restartClass: 'reconstructible',
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
