import type { PolicyStateDescriptor } from './types';
import { MINUTE_MS, SECOND_MS } from './constants';

export const capabilityPolicyStateDescriptors = [
  {
    authorityFamily: 'llm-session-issuance',
    failClosedOnRestart: true,
    id: 'llm-session-tokens',
    oneShot: true,
    ownerModule: 'apps/extension/src/background/ai/llm/session-tokens.ts',
    proofModules: ['apps/extension/src/background/ai/llm/session-tokens.test.ts'],
    requiresTtl: true,
    restartBehavior: 'Disposable one-shot tokens fail closed and callers request a fresh session.',
    restartClass: 'disposable-fail-closed',
    stateClass: 'capability',
    storageClass: 'memory-only',
    ttlMs: 2 * MINUTE_MS,
  },
  {
    authorityFamily: 'content-action-capability-issuance',
    failClosedOnRestart: true,
    id: 'content-action-capabilities',
    oneShot: true,
    ownerModule:
      'apps/extension/src/background/routing-contracts/capabilities/content-action/capability-store.ts',
    proofModules: [
      'apps/extension/src/background/routing-contracts/capabilities/content-action/capability-store.test.ts',
    ],
    requiresTtl: true,
    restartBehavior:
      'Disposable content action capabilities and auto-start grants fail closed after restart.',
    restartClass: 'disposable-fail-closed',
    stateClass: 'capability',
    storageClass: 'memory-only',
    ttlMs: MINUTE_MS,
  },
  {
    authorityFamily: 'content-action-capability-issuance',
    failClosedOnRestart: true,
    id: 'content-action-auto-start-grants',
    oneShot: false,
    ownerModule:
      'apps/extension/src/background/routing-contracts/capabilities/content-action/capability-store.ts',
    proofModules: [
      'apps/extension/src/background/routing-contracts/capabilities/content-action/capabilities.recording.test.ts',
    ],
    requiresTtl: true,
    restartBehavior:
      'Disposable content action capabilities and auto-start grants fail closed after restart.',
    restartClass: 'disposable-fail-closed',
    stateClass: 'capability',
    storageClass: 'memory-only',
    ttlMs: 5 * MINUTE_MS,
  },
  {
    authorityFamily: 'content-action-capability-issuance',
    failClosedOnRestart: true,
    id: 'content-action-activation-keys',
    oneShot: false,
    ownerModule:
      'apps/extension/src/background/routing-contracts/capabilities/content-action/activation-store.ts',
    proofModules: [
      'apps/extension/src/background/routing-contracts/capabilities/content-action/activation.test.ts',
    ],
    requiresTtl: true,
    restartBehavior: [
      'Disposable content action activation keys fail closed and content-owned flows',
      'request a fresh trusted activation.',
    ].join(' '),
    restartClass: 'disposable-fail-closed',
    stateClass: 'capability',
    storageClass: 'memory-only',
    ttlMs: 30 * SECOND_MS,
  },
  {
    authorityFamily: 'content-action-capability-issuance',
    failClosedOnRestart: true,
    id: 'content-action-runtime-tokens',
    oneShot: true,
    ownerModule:
      'apps/extension/src/background/routing-contracts/capabilities/content-action/proof-store.ts',
    proofModules: [
      'apps/extension/src/background/routing-contracts/capabilities/content-action/capabilities.proof.test.ts',
    ],
    requiresTtl: true,
    restartBehavior:
      'Disposable content action runtime tokens and proofs fail closed after worker restart.',
    restartClass: 'disposable-fail-closed',
    stateClass: 'capability',
    storageClass: 'memory-only',
    ttlMs: 5 * SECOND_MS,
  },
  {
    authorityFamily: 'content-action-capability-issuance',
    failClosedOnRestart: true,
    id: 'content-action-trusted-event-proofs',
    oneShot: true,
    ownerModule:
      'apps/extension/src/background/routing-contracts/capabilities/content-action/proof-store.ts',
    proofModules: [
      'apps/extension/src/background/routing-contracts/capabilities/content-action/capabilities.proof.test.ts',
    ],
    requiresTtl: true,
    restartBehavior:
      'Disposable content action runtime tokens and proofs fail closed after worker restart.',
    restartClass: 'disposable-fail-closed',
    stateClass: 'capability',
    storageClass: 'memory-only',
    ttlMs: 5 * SECOND_MS,
  },
  {
    authorityFamily: 'popup-tab-route-capability-issuance',
    failClosedOnRestart: true,
    id: 'popup-tab-route-capabilities',
    oneShot: true,
    ownerModule:
      'apps/extension/src/background/runtime/routing/capabilities/popup-tab/route-capabilities.ts',
    proofModules: [
      'apps/extension/src/background/runtime/routing/capabilities/popup-tab/route-capabilities.test.ts',
    ],
    requiresTtl: true,
    restartBehavior: 'Disposable popup capabilities fail closed and popup flows reissue.',
    restartClass: 'disposable-fail-closed',
    stateClass: 'capability',
    storageClass: 'memory-only',
    ttlMs: MINUTE_MS,
  },
  {
    authorityFamily: 'gallery-image-update-capability',
    failClosedOnRestart: true,
    id: 'gallery-image-update-capabilities',
    oneShot: true,
    ownerModule: 'apps/extension/src/background/capture/routing/gallery-update-capabilities.ts',
    proofModules: [
      'apps/extension/src/background/capture/routing/gallery-update-capabilities.owner.test.ts',
    ],
    requiresTtl: true,
    restartBehavior: 'Disposable editor image-update tokens fail closed after worker restart.',
    restartClass: 'disposable-fail-closed',
    stateClass: 'capability',
    storageClass: 'memory-only',
    ttlMs: MINUTE_MS,
  },
  {
    authorityFamily: 'project-export-runtime',
    failClosedOnRestart: false,
    id: 'project-export-capabilities',
    oneShot: true,
    ownerModule: 'apps/extension/src/background/media/video/runtime/export-capabilities.ts',
    proofModules: [
      'apps/extension/src/background/media/video/runtime/handlers/export/project-export.capability-reissue.test.ts',
    ],
    requiresTtl: true,
    restartBehavior: 'Export jobs reconcile through the ledger and reissue owner-scoped controls.',
    restartClass: 'durable-lease',
    stateClass: 'capability',
    storageClass: 'browser-session-storage',
    ttlMs: 5 * MINUTE_MS,
  },
] as const satisfies readonly PolicyStateDescriptor[];
