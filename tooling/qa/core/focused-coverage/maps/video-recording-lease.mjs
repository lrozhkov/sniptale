export const VIDEO_RECORDING_LEASE_OWNER_MAPPINGS = [
  {
    owner: 'background-video-recording-control-lease',
    productionFile: 'apps/extension/src/background/media/video/recording-control-lease/index.ts',
    reason:
      'Recording control lease durability and hydration are covered by the focused lease suite.',
    testFiles: [
      'apps/extension/src/background/media/video/recording-control-lease.test.ts',
      'apps/extension/src/background/media/video/recording-control-lease.conditional-cleanup.test.ts',
    ],
  },
  {
    owner: 'background-video-recording-control-lease',
    productionPrefix: 'apps/extension/src/background/media/video/recording-control-lease/',
    reason:
      'Recording control lease owner internals are covered by focused lease and storage suites.',
    testFiles: [
      'apps/extension/src/background/media/video/recording-control-lease.test.ts',
      'apps/extension/src/background/media/video/recording-control-lease.conditional-cleanup.test.ts',
      'apps/extension/src/background/storage/video/recording-control-lease.test.ts',
    ],
  },
];
