export const PRIVACY_ERASURE_VIDEO_PREVIEW_OWNER_MAPPINGS = [
  {
    allowCrossOwner: true,
    owner: 'local-data-erasure-video-preview-cache-owner',
    productionPrefix: 'apps/extension/src/composition/persistence/video-preview-cache/',
    reason:
      'The advisory derived-video database has direct boundary, mutation, retention, and erasure proof.',
    testFiles: [
      'apps/extension/src/composition/persistence/video-preview-cache/database.test.ts',
      'apps/extension/src/composition/persistence/video-preview-cache/model.test.ts',
      'apps/extension/src/composition/persistence/video-preview-cache/mutations.test.ts',
      'apps/extension/src/composition/persistence/video-preview-cache/retention.test.ts',
      'apps/extension/src/composition/persistence/infrastructure/indexed-db/mutation-inventory.test.ts',
      'apps/extension/src/composition/persistence/privacy-erasure/cleanup.default.test.ts',
      'apps/extension/src/composition/persistence/privacy-erasure/cleanup.test.ts',
    ],
  },
];
