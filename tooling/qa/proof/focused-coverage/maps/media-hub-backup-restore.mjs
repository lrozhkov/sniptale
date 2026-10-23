export const MEDIA_HUB_BACKUP_RESTORE_OWNER_MAPPINGS = [
  {
    owner: 'media-hub-backup-resource-catalog-publication',
    exclusive: true,
    productionFile:
      'apps/extension/src/workflows/media-hub-backup/v6/root-publication/effect-bundle.ts',
    allowCrossOwner: true,
    reason:
      'Resource catalog restore must validate before its transaction, preserve fresh conflicts, detach bytes and commit its checkpoint atomically.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/v6/codec.test.ts',
      'apps/extension/src/workflows/media-hub-backup/v6/export.test.ts',
      'apps/extension/src/workflows/media-hub-backup/v6/inspect.test.ts',
      'apps/extension/src/workflows/media-hub-backup/v6/restore.test.ts',
      'apps/extension/src/workflows/media-hub-backup/v6/staging.test.ts',
      'apps/extension/src/workflows/media-hub-backup/v6/root-publication/effect-bundle.test.ts',
      'apps/extension/src/workflows/media-hub-backup/v6/root-codecs/effect-bundle.test.ts',
      'apps/extension/src/workflows/media-hub-backup/v6/inventory/effect-bundles.test.ts',
      'apps/extension/src/composition/persistence/effect-bundles/backup-restore.test.ts',
      'apps/extension/src/composition/persistence/effect-bundles/integrity.test.ts',
      'apps/extension/src/composition/persistence/effect-bundles/preferences.test.ts',
    ],
  },
  {
    owner: 'media-hub-backup-presentation-bytes',
    exclusive: true,
    productionFile:
      'apps/extension/src/workflows/media-hub-backup/v6/root-publication/presentation.ts',
    reason:
      'Inline presentation bytes must survive staging cleanup for media, Native and Scenario publication.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/v6/codec.test.ts',
      'apps/extension/src/workflows/media-hub-backup/v6/export.test.ts',
      'apps/extension/src/workflows/media-hub-backup/v6/inspect.test.ts',
      'apps/extension/src/workflows/media-hub-backup/v6/restore.test.ts',
      'apps/extension/src/workflows/media-hub-backup/v6/staging.test.ts',
      'apps/extension/src/workflows/media-hub-backup/v6/root-publication/presentation.test.ts',
      'apps/extension/src/workflows/media-hub-backup/v6/root-publication/media.test.ts',
      'apps/extension/src/workflows/media-hub-backup/v6/root-publication/media.stored-image.test.ts',
      'apps/extension/src/workflows/media-hub-backup/v6/root-publication/video-project.test.ts',
      'apps/extension/src/workflows/media-hub-backup/v6/root-publication/scenario-project.test.ts',
    ],
  },
  {
    owner: 'media-hub-backup-native-resource-publication',
    exclusive: true,
    productionFile:
      'apps/extension/src/workflows/media-hub-backup/v6/root-publication/video-project.ts',
    allowCrossOwner: true,
    reason:
      'Native resource restore must preserve bytes and references through publication, concurrent saves, identity recreation and retry.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/v6/codec.test.ts',
      'apps/extension/src/workflows/media-hub-backup/v6/export.test.ts',
      'apps/extension/src/workflows/media-hub-backup/v6/inspect.test.ts',
      'apps/extension/src/workflows/media-hub-backup/v6/restore.test.ts',
      'apps/extension/src/workflows/media-hub-backup/v6/staging.test.ts',
      'apps/extension/src/workflows/media-hub-backup/v6/root-publication/video-project.test.ts',
      'apps/extension/src/workflows/media-hub-backup/v6/root-publication/video-project.references.test.ts',
      'apps/extension/src/composition/persistence/projects/backup-restore.test.ts',
      'apps/extension/src/composition/persistence/projects/index.stale-save.test.ts',
    ],
  },
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
