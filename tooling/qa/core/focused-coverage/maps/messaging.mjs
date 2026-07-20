export const MESSAGING_OWNER_MAPPINGS = [
  {
    allowCrossOwner: true,
    owner: 'shared-messaging-runtime-contracts',
    productionFile: 'apps/extension/src/contracts/messaging/contracts/runtime-message/core.ts',
    reason:
      'Runtime message core contract changes are high-risk and need explicit parser/response proof.',
    testFiles: [
      'apps/extension/src/contracts/messaging/contracts/runtime-message.actions-capture.test.ts',
      'apps/extension/src/contracts/messaging/contracts/runtime/actions/export.test.ts',
    ],
  },
  {
    allowCrossOwner: true,
    owner: 'shared-messaging-popup-export-contracts',
    productionFile:
      'packages/runtime-contracts/src/messaging/contracts/runtime-message/popup-export.ts',
    reason:
      'Popup export runtime contract changes cross popup/background routing and need owner tests.',
    testFiles: ['apps/extension/src/contracts/messaging/contracts/runtime/actions/export.test.ts'],
  },
];
