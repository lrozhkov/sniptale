export const MEDIA_HUB_BACKUP_PRIVACY_EXPORT_OWNER_MAPPINGS = [
  {
    owner: 'media-hub-backup-export-privacy-options',
    productionFile: 'apps/extension/src/workflows/media-hub-backup/export/options.ts',
    reason:
      'Backup export option normalization and data-class flags are covered by privacy export tests.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/export/privacy-options.test.ts',
      'apps/extension/src/workflows/media-hub-backup/export/telemetry.test.ts',
      'apps/extension/src/workflows/media-hub-backup/export/projects/privacy-options.test.ts',
    ],
  },
  {
    owner: 'media-hub-backup-export-privacy-options',
    productionFile: 'apps/extension/src/workflows/media-hub-backup/export/filters.ts',
    reason: 'Backup export filtering and metadata stripping are covered by privacy export tests.',
    testFiles: ['apps/extension/src/workflows/media-hub-backup/export/privacy-options.test.ts'],
  },
  {
    owner: 'media-hub-backup-export-privacy-options',
    productionFile: 'apps/extension/src/workflows/media-hub-backup/export/privacy.ts',
    reason:
      'Backup source metadata scrubbers are covered by media and project privacy export tests.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/export/privacy.test.ts',
      'apps/extension/src/workflows/media-hub-backup/export/privacy-options.test.ts',
      'apps/extension/src/workflows/media-hub-backup/export/projects/privacy-options.test.ts',
    ],
  },
  {
    owner: 'media-hub-backup-export',
    productionFile: 'apps/extension/src/workflows/media-hub-backup/export/index.ts',
    reason: 'Backup export manifest/data-class behavior is covered by privacy export tests.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/export/privacy-options.test.ts',
      'apps/extension/src/workflows/media-hub-backup/export/projects/privacy-options.test.ts',
    ],
  },
  {
    owner: 'media-hub-backup-project-descriptors',
    productionFile:
      'apps/extension/src/workflows/media-hub-backup/export/projects/video-descriptors.ts',
    reason: 'Video project descriptor privacy options are covered by project privacy tests.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/export/projects/privacy-options.test.ts',
    ],
  },
  {
    owner: 'media-hub-backup-project-descriptors',
    productionFile:
      'apps/extension/src/workflows/media-hub-backup/export/projects/scenario-descriptors.ts',
    reason: 'Scenario project descriptor privacy options are covered by project privacy tests.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/export/projects/privacy-options.test.ts',
    ],
  },
  {
    owner: 'media-hub-backup-project-test-support',
    productionFile: 'apps/extension/src/workflows/media-hub-backup/export/projects/test-support.ts',
    reason: 'Shared project backup fixtures are covered by project privacy tests.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/export/projects/privacy-options.test.ts',
    ],
  },
  {
    owner: 'media-hub-backup-archive-privacy-options',
    productionFile: 'apps/extension/src/workflows/media-hub-backup/archive/index.ts',
    reason:
      'Backup archive asset privacy options, including nested web snapshots, are covered by archive provenance tests.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/archive/web-snapshot-provenance.test.ts',
      'apps/extension/src/workflows/media-hub-backup/export/privacy-options.test.ts',
    ],
  },
  {
    owner: 'media-hub-backup-manifest-privacy-options',
    productionFile: 'apps/extension/src/workflows/media-hub-backup/manifest/privacy-options.ts',
    reason: 'Backup manifest privacy fields are covered by focused manifest privacy tests.',
    testFiles: ['apps/extension/src/workflows/media-hub-backup/manifest/privacy-options.test.ts'],
  },
  {
    owner: 'media-hub-backup-manifest',
    productionFile: 'apps/extension/src/workflows/media-hub-backup/manifest/index.ts',
    reason: 'Backup manifest parsing remains covered by manifest privacy tests.',
    testFiles: ['apps/extension/src/workflows/media-hub-backup/manifest/privacy-options.test.ts'],
  },
  {
    owner: 'media-hub-backup-facade',
    productionFile: 'apps/extension/src/workflows/media-hub-backup/index.ts',
    reason: 'Backup facade exports are covered by the stable facade test.',
    testFiles: ['apps/extension/src/workflows/media-hub-backup/index.test.ts'],
  },
  {
    owner: 'media-hub-backup-project-asset-restore-boundary',
    productionFile: 'apps/extension/src/workflows/media-hub-backup/metadata/projects.ts',
    reason: 'Project asset backup metadata narrowing is covered by restore boundary tests.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/restore/project/assets-boundary.test.ts',
      'apps/extension/src/workflows/media-hub-backup/restore/project/prepare.test.ts',
    ],
  },
];
