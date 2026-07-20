export const PRIVACY_ERASURE_RUNTIME_OWNER_MAPPINGS = [
  {
    allowCrossOwner: true,
    owner: 'local-data-erasure-media-strict-viewport-owner',
    productionFile:
      'apps/extension/src/background/media/video/runtime/manager/controls.stop/effects.ts',
    reason: 'Privacy stop awaits strict viewport clear/detach and verifies debugger ownership.',
    testFiles: [
      'apps/extension/src/background/media/video/runtime/manager/controls.stop/effects.test.ts',
      'apps/extension/src/background/media/video/runtime/manager/controls.stop/effects.privacy-erasure.test.ts',
      'apps/extension/src/background/media/video/runtime/manager/controls.stop/flow.privacy-erasure.test.ts',
    ],
  },
  {
    allowCrossOwner: true,
    owner: 'local-data-erasure-offscreen-page-storage-owner',
    productionPrefix: 'apps/extension/src/offscreen/runtime/',
    reason:
      'The isolated offscreen boundary erases page-local storage without persistence bootstrap.',
    testFiles: [
      'apps/extension/src/offscreen/runtime/bootstrap.test.ts',
      'apps/extension/src/offscreen/runtime/index.test.ts',
      'apps/extension/src/offscreen/runtime/routing.export.test.ts',
      'apps/extension/src/offscreen/runtime/routing.privacy-erasure.test.ts',
    ],
  },
  {
    allowCrossOwner: true,
    owner: 'local-data-erasure-offscreen-lifecycle-owner',
    productionFile: 'apps/extension/src/background/media/video/runtime/offscreen-startup-id.ts',
    reason: 'Privacy-erasure offscreen startup URLs are covered by isolated creation proof.',
    testFiles: [
      'apps/extension/src/background/media/video/runtime/offscreen-manager.creation.test.ts',
    ],
  },
];
