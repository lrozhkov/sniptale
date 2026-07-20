export const MEDIA_HUB_BACKUP_RESTORE_OWNER_MAPPINGS = [
  {
    owner: 'media-hub-backup-restore-prepare',
    productionFile: 'apps/extension/src/workflows/media-hub-backup/restore/prepare/index.ts',
    exclusive: true,
    reason: 'Backup asset preparation boundaries are covered by restore preparation tests.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/restore/prepare/index.test.ts',
      'apps/extension/src/workflows/media-hub-backup/restore/prepare/web-snapshot.test.ts',
    ],
  },
  {
    owner: 'media-hub-backup-web-snapshot-restore',
    productionFile: 'apps/extension/src/workflows/media-hub-backup/restore/web-snapshot.ts',
    reason: 'Nested web snapshot backup package restore is covered by focused package tests.',
    testFiles: ['apps/extension/src/workflows/media-hub-backup/restore/web-snapshot.test.ts'],
  },
  {
    owner: 'media-hub-backup-restore-write-transaction',
    productionFile: 'apps/extension/src/workflows/media-hub-backup/restore/write/transaction.ts',
    reason:
      'Backup import transaction stores and write preflight are covered by restore writer tests.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/restore/write/index.test.ts',
      'apps/extension/src/workflows/media-hub-backup/restore/write/transaction.test.ts',
    ],
  },
  {
    owner: 'media-hub-backup-project-prepare',
    productionFile: 'apps/extension/src/workflows/media-hub-backup/restore/project/prepare.ts',
    reason: 'Backup project restore preparation is covered by project preparation suites.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/restore/project/prepare.test.ts',
      'apps/extension/src/workflows/media-hub-backup/restore/project/prepare-v3.test.ts',
      'apps/extension/src/workflows/media-hub-backup/restore/project/prepare-v3.metadata.test.ts',
    ],
  },
  {
    owner: 'media-hub-backup-project-ids',
    productionFile: 'apps/extension/src/workflows/media-hub-backup/restore/project/ids.ts',
    reason: 'Backup project child-id collection and remapping are covered by preparation tests.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/restore/project/prepare.test.ts',
      'apps/extension/src/workflows/media-hub-backup/restore/project/prepare-v3.test.ts',
    ],
  },
  {
    owner: 'media-hub-backup-project-remap',
    productionFile: 'apps/extension/src/workflows/media-hub-backup/restore/project/remap.ts',
    reason: 'Backup project remapping is covered by restore preparation and writer tests.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/restore/project/prepare.test.ts',
      'apps/extension/src/workflows/media-hub-backup/restore/project/prepare-v3.test.ts',
      'apps/extension/src/workflows/media-hub-backup/restore/projects/index.test.ts',
    ],
  },
  {
    owner: 'media-hub-backup-project-writers',
    productionFile: 'apps/extension/src/workflows/media-hub-backup/restore/project/writers.ts',
    reason: 'Backup project DB writers are covered by restore writer and atomic preflight tests.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/restore/projects/index.test.ts',
      'apps/extension/src/workflows/media-hub-backup/restore/projects/atomic.test.ts',
    ],
  },
  {
    owner: 'media-hub-backup-project-conflicts',
    productionFile: 'apps/extension/src/workflows/media-hub-backup/restore/project/conflicts.ts',
    reason: 'Backup project child conflict handling is covered by preparation conflict tests.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/restore/project/conflicts.test.ts',
      'apps/extension/src/workflows/media-hub-backup/restore/project/prepare.test.ts',
      'apps/extension/src/workflows/media-hub-backup/restore/project/prepare-v3.test.ts',
    ],
  },
  {
    owner: 'media-hub-backup-project-prepare-v3',
    productionFile: 'apps/extension/src/workflows/media-hub-backup/restore/project/prepare-v3.ts',
    reason: 'V3 backup project remapping is covered by the v3 project preparation suite.',
    testFiles: ['apps/extension/src/workflows/media-hub-backup/restore/project/prepare-v3.test.ts'],
  },
];
