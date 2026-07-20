export const CAST_CLEANUP_RUNTIME_OWNER_MAPPINGS = [
  {
    owner: 'action-kernel-background-owned-route-adapter',
    productionFile: 'apps/extension/src/background/runtime/routing/action-kernel/owned-route.ts',
    reason:
      'Background-owned action authorization and dispatch are covered by action-kernel content capability tests.',
    testFiles: [
      'apps/extension/src/background/runtime/routing/action-kernel/handlers.content-action-capabilities.test.ts',
      'apps/extension/src/background/runtime/routing/action-kernel/registry.drift.test.ts',
    ],
  },
  {
    owner: 'action-kernel-tab-route-adapter',
    productionFile: 'apps/extension/src/background/runtime/routing/action-kernel/tab-route.ts',
    reason: 'Tab route action dispatch is covered by action-kernel and tab-routing adapter tests.',
    testFiles: [
      'apps/extension/src/background/runtime/routing/action-kernel/index.test.ts',
      'apps/extension/src/background/runtime/routing/tab-dispatch/adapter.test.ts',
    ],
  },
  {
    owner: 'action-kernel-video-runtime-route-adapter',
    productionFile:
      'apps/extension/src/background/runtime/routing/action-kernel/video-runtime-route.ts',
    reason: [
      'Video runtime action authorization and preauthorization handoff are covered by',
      'action-kernel project export tests.',
    ].join(' '),
    testFiles: [
      'apps/extension/src/background/runtime/routing/action-kernel/handlers.project-export.test.ts',
      'apps/extension/src/background/runtime/routing/action-kernel/registry.drift.test.ts',
    ],
  },
  {
    owner: 'runtime-envelope-boundary',
    productionFile:
      'apps/extension/src/background/runtime/routing/message-guards/guards/envelope.ts',
    reason: 'Runtime envelope shape narrowing is covered by the envelope guard suite.',
    testFiles: [
      'apps/extension/src/background/runtime/routing/message-guards/guards/envelope.test.ts',
    ],
  },
  {
    owner: 'popup-tab-route-capabilities-boundary',
    productionFile:
      'apps/extension/src/background/runtime/routing/capabilities/popup-tab/route-capabilities.ts',
    reason:
      'Popup tab route capability parsing and replay protection are covered by routing capability tests.',
    testFiles: [
      'apps/extension/src/background/runtime/routing/capabilities/popup-tab/route-capabilities.test.ts',
    ],
  },
  {
    owner: 'background-llm-route-response-boundary',
    productionFile: 'apps/extension/src/background/ai/llm/route-response.ts',
    reason: 'LLM route error normalization is covered by the route response suite.',
    testFiles: ['apps/extension/src/background/ai/llm/route-response.test.ts'],
  },
  {
    owner: 'background-llm-service-history-boundary',
    productionFile: 'apps/extension/src/background/ai/llm/service-history.ts',
    reason: 'LLM history orchestration and safe error classification are covered owner-locally.',
    testFiles: [
      'apps/extension/src/background/ai/llm/service-history-error-code.test.ts',
      'apps/extension/src/background/ai/llm/service-history.test.ts',
    ],
  },
  {
    owner: 'video-recording-lease-storage-boundary',
    productionFile: 'apps/extension/src/background/storage/video/recording-control-lease.ts',
    reason:
      'Persisted recording lease parsing is covered by recording control lease storage tests.',
    testFiles: ['apps/extension/src/background/storage/video/recording-control-lease.test.ts'],
  },
  {
    owner: 'video-project-export-capabilities-boundary',
    productionFile: 'apps/extension/src/background/storage/video/project-export-capabilities.ts',
    reason: 'Project export capability storage parsing is covered by export capability tests.',
    testFiles: ['apps/extension/src/background/storage/video/project-export-capabilities.test.ts'],
  },
  {
    owner: 'video-runtime-diagnostics-boundary',
    productionFile: 'apps/extension/src/background/media/video/runtime/router.ts',
    reason: 'Runtime diagnostic payload mapping is covered by router diagnostics tests.',
    testFiles: [
      'apps/extension/src/background/media/video/runtime/router.branches.test.ts',
      'apps/extension/src/background/media/video/runtime/router.diagnostics.test.ts',
    ],
  },
  {
    owner: 'runtime-video-diagnostics-contract',
    productionFile: 'apps/extension/src/contracts/messaging/contracts/runtime/video/export.ts',
    reason: 'Runtime video diagnostic contract parsing is covered by runtime video export tests.',
    testFiles: ['apps/extension/src/contracts/messaging/contracts/runtime/video/export.test.ts'],
  },
  {
    owner: 'runtime-message-contract-types',
    productionFile: 'apps/extension/src/contracts/messaging/contracts/types.ts',
    reason:
      'Runtime diagnostic message type compatibility is covered by contract and router tests.',
    testFiles: [
      'apps/extension/src/contracts/messaging/contracts/runtime/video/export.test.ts',
      'apps/extension/src/background/media/video/runtime/router.diagnostics.test.ts',
    ],
  },
  {
    owner: 'legacy-video-runtime-message-types',
    productionFile: 'apps/extension/src/contracts/video/types/messages.ts',
    reason: 'Legacy video runtime union compatibility is covered by diagnostic router tests.',
    testFiles: ['apps/extension/src/background/media/video/runtime/router.diagnostics.test.ts'],
  },
];
