export const PAGE_STYLE_OWNER_MAPPINGS = [
  {
    owner: 'shared-page-style-storage-boundaries',
    productionPrefix: 'apps/extension/src/composition/persistence/page-style/storage/',
    reason:
      'Page-style registry parser, write limits, and cleanup races are covered by focused storage boundary suites.',
    testFiles: [
      'apps/extension/src/composition/persistence/page-style/storage/cleanup.boundaries.test.ts',
      'apps/extension/src/composition/persistence/page-style/storage/guards.boundaries.test.ts',
      'apps/extension/src/composition/persistence/page-style/storage/guards.test.ts',
      'apps/extension/src/composition/persistence/page-style/storage/index.boundaries.test.ts',
      'apps/extension/src/composition/persistence/page-style/storage/index.test.ts',
      'apps/extension/src/composition/persistence/page-style/storage/mutations.test.ts',
    ],
  },
  {
    owner: 'shared-page-style-limit-contract',
    productionFile: 'packages/runtime-contracts/src/page-style/limits.ts',
    reason:
      'Page-style limit contracts are exercised through storage parser/write and asset boundary suites.',
    testFiles: [
      'apps/extension/src/composition/persistence/page-style/assets.test.ts',
      'apps/extension/src/composition/persistence/page-style/storage/guards.boundaries.test.ts',
      'apps/extension/src/composition/persistence/page-style/storage/index.boundaries.test.ts',
    ],
  },
  {
    owner: 'shared-page-style-asset-store',
    productionFile: 'apps/extension/src/composition/persistence/page-style/assets.ts',
    reason:
      'Page-style asset MIME, budget, and transaction boundaries are covered by the focused asset DB suite.',
    testFiles: ['apps/extension/src/composition/persistence/page-style/assets.test.ts'],
  },
];
