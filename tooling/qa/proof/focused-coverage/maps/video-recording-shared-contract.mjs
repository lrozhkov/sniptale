const recordingControlContractTests = [
  'apps/extension/src/contracts/messaging/contracts/runtime/video/recording-controls.test.ts',
];

export const SHARED_CONTRACT_OWNER_MAPPINGS = [
  {
    owner: 'shared-video-recording-control-contracts',
    productionFile: 'apps/extension/src/contracts/messaging/contracts/response-types.ts',
    reason: 'Recording state response capability fields are covered by contract tests.',
    testFiles: recordingControlContractTests,
  },
  {
    owner: 'shared-video-recording-control-contracts',
    productionFile: 'apps/extension/src/contracts/messaging/contracts/runtime/video/session.ts',
    reason: 'Runtime recording control schemas are covered by recording control contract tests.',
    testFiles: recordingControlContractTests,
  },
  {
    owner: 'shared-video-recording-lifecycle-ack-contracts',
    productionFile: 'apps/extension/src/contracts/messaging/contracts/runtime/video/export.ts',
    reason: 'Recording saved lifecycle ack response shape is covered by video export contracts.',
    testFiles: ['apps/extension/src/contracts/messaging/contracts/runtime/video/export.test.ts'],
  },
  {
    owner: 'shared-video-recording-control-contracts',
    productionFile: 'apps/extension/src/contracts/messaging/video/session.ts',
    reason: 'Runtime video session type mappings are covered by session and contract tests.',
    testFiles: recordingControlContractTests,
  },
  {
    owner: 'shared-video-recording-control-contracts',
    productionFile: 'apps/extension/src/contracts/messaging/video/session-responses.ts',
    reason:
      'Runtime video session response mappings are covered by recording control contract tests.',
    testFiles: recordingControlContractTests,
  },
  {
    owner: 'shared-video-recording-control-contracts',
    productionFile: 'packages/runtime-contracts/src/video/types/messages.control.ts',
    reason: 'Video control authority fields are covered by recording control contract tests.',
    testFiles: recordingControlContractTests,
  },
];
