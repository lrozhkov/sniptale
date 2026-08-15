export const POPUP_RECORDING_OWNER_MAPPINGS = [
  {
    owner: 'popup-recording-start-workflow',
    productionFile: 'apps/extension/src/popup/shell/runtime/start-recording.ts',
    exclusive: true,
    reason:
      'Popup recording message construction, permission order, and responses have focused workflow suites.',
    testFiles: [
      'apps/extension/src/popup/shell/runtime/start-recording.test.ts',
      'apps/extension/src/popup/shell/runtime/start-recording.camera.test.ts',
      'apps/extension/src/popup/shell/runtime/start-recording.capability.test.ts',
      'apps/extension/src/popup/shell/runtime/start-recording.multi-source.test.ts',
      'apps/extension/src/popup/shell/runtime/start-recording.webcam.test.ts',
    ],
  },
  {
    owner: 'popup-runtime-refresh-actions',
    productionFile: 'apps/extension/src/popup/shell/runtime/actions.ts',
    exclusive: true,
    reason:
      'Popup device refresh, gallery refresh, and active-tab actions have adjacent hook proof.',
    testFiles: ['apps/extension/src/popup/shell/runtime/actions.test.tsx'],
  },
  {
    owner: 'popup-video-route',
    productionFile: 'apps/extension/src/popup/recording/video/route.tsx',
    exclusive: true,
    reason: 'Video route bootstrap and coherent recording snapshot adoption have adjacent proof.',
    testFiles: ['apps/extension/src/popup/recording/video/route.test.tsx'],
  },
  {
    owner: 'popup-video-route-runtime',
    productionFile: 'apps/extension/src/popup/recording/video/runtime.ts',
    exclusive: true,
    reason: 'Video-only state ownership and deferred device work have adjacent hook proof.',
    testFiles: ['apps/extension/src/popup/recording/video/runtime.test.tsx'],
  },
  {
    owner: 'popup-video-persistence-effects',
    productionFile: 'apps/extension/src/popup/shell/runtime/video-persistence-effects.ts',
    exclusive: true,
    reason: 'Video settings and UI-state persistence have adjacent owner-local effect proof.',
    testFiles: ['apps/extension/src/popup/shell/runtime/video-persistence-effects.test.tsx'],
  },
  {
    owner: 'popup-video-runtime-assembly',
    productionFile: 'apps/extension/src/popup/shell/runtime/assembly/index.ts',
    exclusive: true,
    reason: 'The narrow Video runtime projection has adjacent negative-shape proof.',
    testFiles: ['apps/extension/src/popup/shell/runtime/assembly/index.test.ts'],
  },
  {
    owner: 'popup-recording-control-capability',
    productionPrefix: 'apps/extension/src/popup/shell/runtime',
    reason:
      'Popup recording control capability propagation is covered by start, effect, state, and transport suites.',
    testFiles: [
      'apps/extension/src/popup/shell/runtime/actions.test.tsx',
      'apps/extension/src/popup/shell/runtime/start-recording.test.ts',
      'apps/extension/src/popup/shell/runtime/start-recording.capability.test.ts',
      'apps/extension/src/popup/shell/runtime/start-recording.multi-source.test.ts',
      'apps/extension/src/popup/shell/runtime/start-recording.webcam.test.ts',
      'apps/extension/src/popup/shell/runtime/transport/pause.test.tsx',
      'apps/extension/src/popup/shell/runtime/transport/stop.test.tsx',
    ],
  },
  {
    owner: 'popup-recording-bootstrap-capability',
    productionPrefix: 'apps/extension/src/popup/shell/bootstrap',
    reason: 'Popup bootstrap recording capability hydration is covered by bootstrap suites.',
    testFiles: [
      'apps/extension/src/popup/shell/bootstrap/recording-state.test.ts',
      'apps/extension/src/popup/shell/bootstrap/video.test.ts',
      'apps/extension/src/popup/shell/startup/coordinator.test.ts',
    ],
  },
  {
    owner: 'popup-recording-lifecycle-capability',
    productionPrefix: 'apps/extension/src/popup/shell/message-sync',
    reason: 'Cross-route recording synchronization is covered by the message and shell suites.',
    testFiles: [
      'apps/extension/src/popup/shell/message-sync/index.test.ts',
      'apps/extension/src/popup/shell/app/index.test.tsx',
    ],
  },
];
