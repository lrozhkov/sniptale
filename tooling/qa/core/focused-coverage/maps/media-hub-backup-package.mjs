export const MEDIA_HUB_BACKUP_PACKAGE_OWNER_MAPPINGS = [
  {
    owner: 'media-hub-backup-manifest-profile',
    productionFile: 'apps/extension/src/workflows/media-hub-backup/manifest/index.ts',
    reason: 'Backup manifest ZIP profile limits are covered by manifest and quota tests.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/manifest/index.test.ts',
      'apps/extension/src/workflows/media-hub-backup/import/quota.test.ts',
    ],
  },
  {
    owner: 'media-hub-backup-project-writer-test-support',
    productionFile:
      'apps/extension/src/workflows/media-hub-backup/restore/projects/test-support.ts',
    reason: 'Backup project writer fixtures are covered by writer and atomic tests.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/restore/projects/index.test.ts',
      'apps/extension/src/workflows/media-hub-backup/restore/projects/atomic.test.ts',
    ],
  },
  {
    owner: 'media-hub-backup-project-export',
    productionFile: 'apps/extension/src/workflows/media-hub-backup/export/index.ts',
    reason: 'Backup project export path boundaries are covered by project export tests.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/export/index.test.ts',
      'apps/extension/src/workflows/media-hub-backup/export/blob/boundary.test.ts',
      'apps/extension/src/workflows/media-hub-backup/export/blob/budget.test.ts',
      'apps/extension/src/workflows/media-hub-backup/export/projects/index.test.ts',
      'apps/extension/src/workflows/media-hub-backup/export/projects/boundary.test.ts',
    ],
  },
  {
    owner: 'media-hub-backup-export-manifest',
    productionFile: 'apps/extension/src/workflows/media-hub-backup/export/manifest.ts',
    reason:
      'Backup export manifest counts and JSON boundary behavior are covered by focused export suites.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/export/resource-boundary.test.ts',
      'apps/extension/src/workflows/media-hub-backup/export/privacy-options.test.ts',
      'apps/extension/src/workflows/media-hub-backup/export/index.test.ts',
    ],
  },
  {
    owner: 'media-hub-backup-asset-archive',
    productionFile: 'apps/extension/src/workflows/media-hub-backup/archive/index.ts',
    reason:
      'Backup media asset archive writes are covered by archive, export, and blob budget tests.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/archive/index.test.ts',
      'apps/extension/src/workflows/media-hub-backup/export/blob/boundary.test.ts',
      'apps/extension/src/workflows/media-hub-backup/export/blob/budget.test.ts',
      'apps/extension/src/workflows/media-hub-backup/export/index.test.ts',
    ],
  },
  {
    owner: 'media-hub-backup-export-blob-boundary',
    productionPrefix: 'apps/extension/src/workflows/media-hub-backup/export/blob/',
    reason: 'Backup export blob boundaries share focused budget and export proofs.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/export/blob/boundary.test.ts',
      'apps/extension/src/workflows/media-hub-backup/export/blob/budget.test.ts',
      'apps/extension/src/workflows/media-hub-backup/export/index.test.ts',
      'apps/extension/src/workflows/media-hub-backup/export/projects/index.test.ts',
    ],
  },
  {
    owner: 'media-hub-backup-project-export-descriptors',
    productionFile:
      'apps/extension/src/workflows/media-hub-backup/export/projects/video-descriptors.ts',
    reason: 'Backup project descriptor export boundaries are covered by project export tests.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/export/blob/budget.test.ts',
      'apps/extension/src/workflows/media-hub-backup/export/projects/index.test.ts',
      'apps/extension/src/workflows/media-hub-backup/export/projects/boundary.test.ts',
    ],
  },
  {
    owner: 'media-hub-backup-scenario-project-export-descriptors',
    productionFile:
      'apps/extension/src/workflows/media-hub-backup/export/projects/scenario-descriptors.ts',
    reason:
      'Scenario backup project descriptor export boundaries are covered by project export tests.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/export/projects/index.test.ts',
      'apps/extension/src/workflows/media-hub-backup/export/projects/boundary.test.ts',
    ],
  },
  {
    owner: 'media-hub-backup-project-export-support',
    productionPrefix: 'apps/extension/src/workflows/media-hub-backup/export/projects/',
    reason: 'Backup project export support files are covered by project export tests.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/export/blob/budget.test.ts',
      'apps/extension/src/workflows/media-hub-backup/export/projects/index.test.ts',
      'apps/extension/src/workflows/media-hub-backup/export/projects/boundary.test.ts',
    ],
  },
  {
    owner: 'media-hub-backup-project-metadata',
    productionFile: 'apps/extension/src/workflows/media-hub-backup/metadata/projects.ts',
    reason: 'Backup project metadata import boundaries are covered by project metadata tests.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/metadata/projects.test.ts',
      'apps/extension/src/workflows/media-hub-backup/restore/project/prepare-v3.metadata.test.ts',
    ],
  },
  {
    owner: 'media-hub-backup-scenario-export-thumbnail-metadata',
    productionFile:
      'apps/extension/src/workflows/media-hub-backup/metadata/scenario-export-thumbnails.ts',
    reason: 'Scenario export thumbnail ownership is covered by backup metadata tests.',
    testFiles: ['apps/extension/src/workflows/media-hub-backup/metadata/projects.test.ts'],
  },
  {
    owner: 'media-hub-backup-project-references',
    productionFile: 'apps/extension/src/workflows/media-hub-backup/metadata/project-references.ts',
    reason: 'Backup project reference integrity is covered by metadata boundary tests.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/metadata/projects.test.ts',
      'apps/extension/src/workflows/media-hub-backup/restore/project/prepare-v3.metadata.test.ts',
    ],
  },
  {
    owner: 'media-hub-backup-path-segments',
    productionFile: 'apps/extension/src/workflows/media-hub-backup/metadata/path-segments.ts',
    reason: 'Backup path segment validation is covered by export and metadata boundary tests.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/export/projects/boundary.test.ts',
      'apps/extension/src/workflows/media-hub-backup/restore/project/prepare-v3.metadata.test.ts',
    ],
  },
  {
    owner: 'media-hub-backup-metadata',
    productionFile: 'apps/extension/src/workflows/media-hub-backup/metadata/index.ts',
    reason: 'Backup metadata import boundaries are covered by focused metadata parser tests.',
    testFiles: ['apps/extension/src/workflows/media-hub-backup/metadata/index.test.ts'],
  },
];
