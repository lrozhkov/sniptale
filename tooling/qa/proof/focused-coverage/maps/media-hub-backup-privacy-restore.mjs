export const MEDIA_HUB_BACKUP_PRIVACY_RESTORE_OWNER_MAPPINGS = [
  {
    owner: 'scenario-archive-retained-publication',
    productionFile:
      'apps/extension/src/workflows/media-hub-backup/v6/root-publication/scenario-project-publication.ts',
    exclusive: true,
    allowCrossOwner: true,
    reason:
      'Scenario publication remaps retained states. Native tests check identity fences and retries.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/v6/root-publication/scenario-project.test.ts',
      'apps/extension/src/workflows/media-hub-backup/v6/root-publication/scenario-project.security.test.ts',
      'apps/extension/src/workflows/media-hub-backup/v6/root-publication/scenario-project.frozen-roundtrip.test.ts',
      'apps/extension/src/composition/persistence/scenario/backup-restore.test.ts',
      'apps/extension/src/composition/persistence/scenario/aggregate-mutations.identity.test.ts',
      'apps/extension/src/workflows/media-hub-backup/v6/restore.test.ts',
    ],
  },
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
