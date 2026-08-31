export const MEDIA_HUB_BACKUP_RESTORE_OWNER_MAPPINGS = [
  {
    owner: 'media-hub-backup-v6-resumable-restore',
    productionPrefix: 'apps/extension/src/workflows/media-hub-backup/v6/',
    reason:
      'V6 tests cover inspection, streaming staging, durable checkpoints, root publication, and crash recovery.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/v6/inspect.test.ts',
      'apps/extension/src/workflows/media-hub-backup/v6/restore-session.test.ts',
      'apps/extension/src/workflows/media-hub-backup/v6/restore.test.ts',
      'apps/extension/src/workflows/media-hub-backup/v6/staging.test.ts',
      'apps/extension/src/workflows/media-hub-backup/v6/root-publication/effect-bundle.test.ts',
    ],
  },
];
