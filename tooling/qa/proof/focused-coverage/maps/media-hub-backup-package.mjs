export const MEDIA_HUB_BACKUP_PACKAGE_OWNER_MAPPINGS = [
  {
    owner: 'media-hub-backup-v6-container',
    productionPrefix: 'apps/extension/src/workflows/media-hub-backup/v6/',
    reason:
      'The v6 manifest, sharded catalogs, streaming export, inspection, and root codecs share the v6 contract suite.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/v6/catalog.test.ts',
      'apps/extension/src/workflows/media-hub-backup/v6/codec.test.ts',
      'apps/extension/src/workflows/media-hub-backup/v6/export.test.ts',
      'apps/extension/src/workflows/media-hub-backup/v6/inspect.test.ts',
      'apps/extension/src/workflows/media-hub-backup/v6/restore.test.ts',
    ],
  },
  {
    owner: 'archive-transfer-zip64',
    productionPrefix: 'apps/extension/src/composition/archive-transfer/',
    reason:
      'ZIP64 reader, writer, path, output budget, and direct file sink are covered by their contract suites.',
    testFiles: [
      'apps/extension/src/composition/archive-transfer/archive.test.ts',
      'apps/extension/src/composition/archive-transfer/file-sink.test.ts',
      'apps/extension/src/composition/archive-transfer/output.test.ts',
      'apps/extension/src/composition/archive-transfer/path.test.ts',
      'apps/extension/src/composition/archive-transfer/profile.test.ts',
    ],
  },
];
