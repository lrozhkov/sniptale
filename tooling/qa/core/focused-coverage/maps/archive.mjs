export const ARCHIVE_PACKAGE_OWNER_MAPPINGS = [
  {
    owner: 'shared-provenance-url-sanitizer',
    productionFile: 'packages/platform/src/security/provenance-url.ts',
    reason: 'Provenance URL sanitization policy is covered by focused security fixtures.',
    testFiles: ['packages/platform/src/security/provenance-url.test.ts'],
  },
  {
    owner: 'popup-batch-export-package-boundary',
    productionPrefix: 'apps/extension/src/popup/shell/export/runtime/start/batch-',
    reason: 'Popup batch export package boundaries are covered by request and archive hardfails.',
    testFiles: [
      'apps/extension/src/popup/shell/export/runtime/start/batch-archive.test.ts',
      'apps/extension/src/popup/shell/export/runtime/start/batch-requests.test.ts',
    ],
  },
  {
    owner: 'background-web-snapshot-package-boundary',
    productionFile: 'apps/extension/src/background/media-hub/web-snapshot.ts',
    reason: 'Web snapshot package save boundaries are covered by the focused media-hub tests.',
    testFiles: ['apps/extension/src/background/media-hub/web-snapshot.test.ts'],
  },
  {
    owner: 'scenario-project-v3-guards',
    productionFile: 'apps/extension/src/features/scenario/project/v3/guards.ts',
    reason: 'Scenario v3 project guard boundaries are covered by focused guard tests.',
    testFiles: ['apps/extension/src/features/scenario/project/v3/guards.test.ts'],
  },
  {
    owner: 'db-video-project-read-guards',
    productionFile: 'apps/extension/src/composition/persistence/projects/read-guards.ts',
    reason: 'Video project read guard behavior is covered by the focused read-guard tests.',
    testFiles: ['apps/extension/src/composition/persistence/projects/index.read-guards.test.ts'],
  },
  {
    owner: 'scenario-project-entry-raw-reader',
    productionFile: 'apps/extension/src/composition/persistence/scenario/projects/project.ts',
    reason: 'Raw scenario project entry reads are covered by backup restore preparation tests.',
    testFiles: [
      'apps/extension/src/composition/persistence/scenario/projects/project.test.ts',
      'apps/extension/src/workflows/media-hub-backup/restore/project/prepare.test.ts',
      'apps/extension/src/workflows/media-hub-backup/restore/project/prepare-v3.test.ts',
    ],
  },
  {
    owner: 'media-hub-store-filename-boundary',
    productionFile: 'apps/extension/src/workflows/media-hub/store.ts',
    reason: 'Media hub storage filename boundaries are covered by explicit unsafe-name tests.',
    testFiles: [
      'apps/extension/src/workflows/media-hub/store.filename-boundary.test.ts',
      'apps/extension/src/workflows/media-hub/store.test.ts',
      'apps/extension/src/workflows/media-hub/assembly.test.ts',
      'apps/extension/src/workflows/media-hub/cleanup.inventory.test.ts',
      'apps/extension/src/workflows/media-hub/cleanup.test.ts',
      'apps/extension/src/features/media-hub/events/index.test.ts',
      'apps/extension/src/workflows/media-hub/store.cleanup-targets.test.ts',
    ],
  },
  {
    owner: 'shared-zip-profile-entry-filenames',
    productionFile: 'packages/platform/src/data/zip-profile/entry-filenames.ts',
    reason: 'Archive leaf filename normalization is covered by focused unsafe-name fixtures.',
    testFiles: ['packages/platform/src/data/zip-profile/entry-filenames.test.ts'],
  },
];
