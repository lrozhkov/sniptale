export const MEDIA_HUB_BACKUP_PRIVACY_RESTORE_OWNER_MAPPINGS = [
  {
    owner: 'media-hub-backup-project-restore-test-support',
    productionFile:
      'apps/extension/src/workflows/media-hub-backup/restore/projects/test-support.ts',
    reason: 'Project restore fixtures are covered by the focused project restore suite.',
    testFiles: ['apps/extension/src/workflows/media-hub-backup/restore/projects/index.test.ts'],
  },
  {
    owner: 'media-hub-backup-restore-facade',
    productionFile: 'apps/extension/src/workflows/media-hub-backup/restore/index.ts',
    exclusive: true,
    reason: 'Backup restore transaction orchestration is covered by import restore tests.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/restore/import/index.test.ts',
      'apps/extension/src/workflows/media-hub-backup/restore/import/telemetry.test.ts',
    ],
  },
  {
    owner: 'media-hub-backup-restore-batches',
    productionFile: 'apps/extension/src/workflows/media-hub-backup/restore/batches.ts',
    exclusive: true,
    reason:
      'Backup restore batching and compensation are covered by focused orchestration and bounded-memory suites.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/restore/index.test.ts',
      'apps/extension/src/workflows/media-hub-backup/restore/bounded-memory.test.ts',
    ],
  },
  {
    owner: 'media-hub-backup-project-restore-facade',
    productionFile: 'apps/extension/src/workflows/media-hub-backup/restore/projects/index.ts',
    reason: 'Project restore transaction dispatch is covered by project restore tests.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/restore/projects/index.test.ts',
      'apps/extension/src/workflows/media-hub-backup/restore/projects/atomic.test.ts',
    ],
  },
  {
    owner: 'media-hub-backup-project-replace',
    productionFile: 'apps/extension/src/workflows/media-hub-backup/restore/project/replace.ts',
    reason: 'Project replacement cleanup is covered by the focused replace cleanup suite.',
    testFiles: ['apps/extension/src/workflows/media-hub-backup/restore/project/replace.test.ts'],
  },
  {
    owner: 'media-hub-backup-local-inspection',
    productionFile: 'apps/extension/src/workflows/media-hub-backup/inspect/local/index.ts',
    reason: 'Local backup inspection counts are covered by the focused inspect-local suite.',
    testFiles: ['apps/extension/src/workflows/media-hub-backup/inspect/local/index.test.ts'],
  },
  {
    owner: 'media-hub-backup-local-inspection',
    productionFile: 'apps/extension/src/workflows/media-hub-backup/inspect/local/projects.ts',
    reason:
      'Local backup project-owned inventory composition is covered by the focused inspect-local suite.',
    testFiles: ['apps/extension/src/workflows/media-hub-backup/inspect/local/index.test.ts'],
  },
  {
    owner: 'media-hub-backup-local-inspection',
    productionFile: 'apps/extension/src/workflows/media-hub-backup/inspect/local/video-projects.ts',
    reason: 'Video project backup inventory counts are covered by the inspect-local suite.',
    testFiles: ['apps/extension/src/workflows/media-hub-backup/inspect/local/index.test.ts'],
  },
  {
    owner: 'media-hub-backup-local-inspection',
    productionFile:
      'apps/extension/src/workflows/media-hub-backup/inspect/local/scenario-projects.ts',
    reason: 'Scenario project backup inventory counts are covered by the inspect-local suite.',
    testFiles: ['apps/extension/src/workflows/media-hub-backup/inspect/local/index.test.ts'],
  },
  {
    owner: 'media-hub-backup-types',
    productionFile: 'apps/extension/src/workflows/media-hub-backup/contracts/types.ts',
    reason:
      'Backup option, manifest, and project asset descriptor contracts are covered by focused tests.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/export/privacy-options.test.ts',
      'apps/extension/src/workflows/media-hub-backup/manifest/privacy-options.test.ts',
      'apps/extension/src/workflows/media-hub-backup/restore/project/assets-boundary.test.ts',
      'apps/extension/src/workflows/media-hub-backup/restore/project/prepare.test.ts',
    ],
  },
  {
    owner: 'media-hub-backup-project-asset-restore-boundary',
    productionFile: 'apps/extension/src/workflows/media-hub-backup/restore/project/blobs.ts',
    reason: 'Project asset blob restore validation is covered by restore boundary tests.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/restore/project/assets-boundary.test.ts',
    ],
  },
  {
    owner: 'media-hub-backup-project-asset-restore-boundary',
    productionFile: 'apps/extension/src/workflows/media-hub-backup/restore/project/writers.ts',
    reason: 'Video project asset restore dispatch is covered by restore boundary tests.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/restore/project/assets-boundary.test.ts',
    ],
  },
  {
    owner: 'media-hub-backup-project-asset-restore-boundary',
    productionFile: 'apps/extension/src/workflows/media-hub-backup/restore/write/index.ts',
    exclusive: true,
    reason: 'Top-level project asset restore validation is covered by restore boundary tests.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/restore/write/index.test.ts',
      'apps/extension/src/workflows/media-hub-backup/restore/write/web-snapshot.test.ts',
      'apps/extension/src/workflows/media-hub-backup/restore/atomic.test.ts',
      'apps/extension/src/workflows/media-hub-backup/restore/project/assets-boundary.test.ts',
    ],
  },
  {
    owner: 'media-hub-backup-storage-adapter',
    productionFile: 'apps/extension/src/workflows/media-hub-backup/storage/index.ts',
    reason: 'Backup transaction adapter contract is covered by the focused storage suite.',
    testFiles: ['apps/extension/src/workflows/media-hub-backup/storage/index.test.ts'],
  },
];
