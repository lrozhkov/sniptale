export const MEDIA_HUB_BACKUP_PRIVACY_RESTORE_OWNER_MAPPINGS = [
  {
    owner: 'media-hub-backup-v6-atomic-publication',
    productionPrefix: 'apps/extension/src/workflows/media-hub-backup/v6/root-publication/',
    allowCrossOwner: true,
    reason:
      'Atomic domain transactions cover imported metadata, ownership, assets, delete intents, and restore checkpoints.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/v6/root-publication/effect-bundle.test.ts',
      'apps/extension/src/workflows/media-hub-backup/v6/restore.test.ts',
      'apps/extension/src/composition/persistence/projects/backup-restore.test.ts',
      'apps/extension/src/composition/persistence/scenario/backup-restore.test.ts',
      'apps/extension/src/composition/persistence/recordings/backup-restore.test.ts',
      'apps/extension/src/composition/persistence/web-snapshots/backup-restore.test.ts',
    ],
  },
];
