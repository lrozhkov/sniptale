export const AUDIT_MEDIA_OWNER_MAPPINGS = [
  {
    owner: 'audit-media-hub-backup-boundaries',
    productionPrefix: 'apps/extension/src/workflows/media-hub-backup/',
    exclusive: true,
    reason: 'Audit backup import/export boundary changes are covered by focused backup suites.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/v6/codec.test.ts',
      'apps/extension/src/workflows/media-hub-backup/v6/export.test.ts',
      'apps/extension/src/workflows/media-hub-backup/v6/inspect.test.ts',
      'apps/extension/src/workflows/media-hub-backup/v6/restore.test.ts',
      'apps/extension/src/workflows/media-hub-backup/v6/staging.test.ts',
    ],
  },
  {
    owner: 'audit-media-hub-assembly',
    productionPrefix: 'apps/extension/src/features/media-hub/',
    exclusive: true,
    allowCrossOwner: true,
    reason: 'Media hub assembly backup surface is covered by focused backup tests.',
    testFiles: [
      'apps/extension/src/gallery/library/actions/backup.test.ts',
      'apps/extension/src/workflows/media-hub/assembly.test.ts',
      'apps/extension/src/workflows/media-hub/cleanup.inventory.test.ts',
      'apps/extension/src/workflows/media-hub/cleanup.test.ts',
      'apps/extension/src/features/media-hub/events/index.test.ts',
      'apps/extension/src/workflows/media-hub-backup/v6/restore.test.ts',
    ],
  },
];
