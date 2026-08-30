export const MESSAGING_OWNER_MAPPINGS = [
  {
    allowCrossOwner: true,
    owner: 'background-ingress-descriptor-contracts',
    productionPrefix: 'apps/extension/src/contracts/messaging/contracts/runtime/background-ingress',
    reason:
      'Canonical background ingress metadata requires exhaustive registry and boundary proof.',
    testFiles: [
      'apps/extension/src/background/runtime/routing/action-kernel/registry.drift.test.ts',
      'apps/extension/src/background/runtime/routing/action-kernel/route-completeness.test.ts',
      'apps/extension/src/background/runtime/routing/boundary/parser.test.ts',
      'apps/extension/src/background/media/video/runtime/sender-policy.test.ts',
    ],
  },
  {
    allowCrossOwner: true,
    owner: 'shared-aggregate-promotion-contract',
    productionFile: 'apps/extension/src/contracts/aggregate-promotion.ts',
    reason: 'Boundary, port, and coordinator tests cover aggregate promotion parsing and replies.',
    testFiles: [
      'apps/extension/src/contracts/messaging/parsers/boundary.aggregate-promotion.test.ts',
      'apps/extension/src/background/application/aggregate-promotion/coordinator.test.ts',
      'apps/extension/src/background/application/aggregate-promotion/ports.test.ts',
    ],
  },
  {
    allowCrossOwner: true,
    owner: 'shared-aggregate-editor-presence-client',
    productionFile: 'apps/extension/src/workflows/aggregate-editor-presence/client.ts',
    reason: 'Editor and background port tests cover presence, replies, disconnect, and reconnect.',
    testFiles: [
      'apps/extension/src/background/application/aggregate-promotion/ports.test.ts',
      'apps/extension/src/editor/workspace/floating/document-bar.test.tsx',
    ],
  },
  {
    allowCrossOwner: true,
    owner: 'shared-messaging-runtime-contracts',
    productionFile: 'apps/extension/src/contracts/messaging/contracts/runtime-message/core.ts',
    reason:
      'Runtime message core contract changes are high-risk and need explicit parser/response proof.',
    testFiles: [
      'apps/extension/src/contracts/messaging/contracts/runtime-message.actions-capture.test.ts',
      'apps/extension/src/contracts/messaging/contracts/runtime/actions/export.job.test.ts',
    ],
  },
  {
    allowCrossOwner: true,
    owner: 'shared-messaging-popup-export-contracts',
    productionFile:
      'packages/runtime-contracts/src/messaging/contracts/runtime-message/popup-export.ts',
    reason:
      'Popup export runtime contract changes cross popup/background routing and need owner tests.',
    testFiles: [
      'apps/extension/src/contracts/messaging/contracts/runtime/actions/export.job.test.ts',
    ],
  },
];
