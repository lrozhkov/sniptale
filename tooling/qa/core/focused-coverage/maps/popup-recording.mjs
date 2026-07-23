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
    owner: 'popup-recording-start-handler',
    productionFile: 'apps/extension/src/popup/shell/runtime/start/run.ts',
    exclusive: true,
    reason:
      'Popup start guarding and workflow parameter wiring are covered by the runtime start suite.',
    testFiles: ['apps/extension/src/popup/shell/runtime/start.test.tsx'],
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
    owner: 'popup-runtime-effects',
    productionFile: 'apps/extension/src/popup/shell/runtime/effects.ts',
    exclusive: true,
    reason: 'Popup persistence and media-device orchestration have adjacent effect proof.',
    testFiles: [
      'apps/extension/src/popup/shell/runtime/effects.test.tsx',
      'apps/extension/src/popup/shell/runtime/media-device-effects.test.tsx',
    ],
  },
  {
    owner: 'popup-runtime-state',
    productionFile: 'apps/extension/src/popup/shell/runtime/state.ts',
    exclusive: true,
    reason: 'Popup state ownership and action/effect composition have adjacent state proof.',
    testFiles: ['apps/extension/src/popup/shell/runtime/state.test.tsx'],
  },
  {
    owner: 'popup-recording-control-capability',
    productionPrefix: 'apps/extension/src/popup/shell/runtime',
    reason:
      'Popup recording control capability propagation is covered by start, effect, state, and transport suites.',
    testFiles: [
      'apps/extension/src/popup/shell/runtime/effects.test.tsx',
      'apps/extension/src/popup/shell/runtime/actions.test.tsx',
      'apps/extension/src/popup/shell/runtime/start-recording.test.ts',
      'apps/extension/src/popup/shell/runtime/start-recording.capability.test.ts',
      'apps/extension/src/popup/shell/runtime/start-recording.multi-source.test.ts',
      'apps/extension/src/popup/shell/runtime/start-recording.webcam.test.ts',
      'apps/extension/src/popup/shell/runtime/state.test.tsx',
      'apps/extension/src/popup/shell/runtime/transport/pause.test.tsx',
      'apps/extension/src/popup/shell/runtime/transport/stop.test.tsx',
    ],
  },
  {
    owner: 'popup-recording-bootstrap-capability',
    productionPrefix: 'apps/extension/src/popup/shell/bootstrap',
    reason: 'Popup bootstrap recording capability hydration is covered by bootstrap suites.',
    testFiles: [
      'apps/extension/src/popup/shell/bootstrap/index.test.ts',
      'apps/extension/src/popup/shell/lifecycle/bootstrap.test.ts',
    ],
  },
  {
    owner: 'popup-recording-lifecycle-capability',
    productionPrefix: 'apps/extension/src/popup/shell/lifecycle',
    reason: 'Popup lifecycle capability hydration is covered by bootstrap/setup/index suites.',
    testFiles: [
      'apps/extension/src/popup/shell/lifecycle/bootstrap.test.ts',
      'apps/extension/src/popup/shell/lifecycle/index.test.ts',
      'apps/extension/src/popup/shell/lifecycle/setup.test.ts',
    ],
  },
];
