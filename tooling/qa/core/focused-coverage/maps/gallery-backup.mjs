export const GALLERY_BACKUP_OWNER_MAPPINGS = [
  {
    owner: 'gallery-backup-actions',
    productionFile: 'apps/extension/src/gallery/library/actions/backup.ts',
    reason: 'Backup export/import action behavior is covered by focused backup action tests.',
    testFiles: ['apps/extension/src/gallery/library/actions/backup.test.ts'],
  },
  {
    owner: 'gallery-backup-actions',
    productionFile: 'apps/extension/src/gallery/library/actions/helpers.ts',
    reason: 'Gallery action facade backup exports are covered by backup action tests.',
    testFiles: ['apps/extension/src/gallery/library/actions/backup.test.ts'],
  },
  {
    owner: 'gallery-selection-archive',
    productionFile: 'apps/extension/src/gallery/library/actions/selection.ts',
    reason: 'Gallery selection archive entry naming is covered by selection action tests.',
    testFiles: ['apps/extension/src/gallery/library/actions/selection.test.ts'],
  },
  {
    owner: 'gallery-backup-action-hook',
    productionFile: 'apps/extension/src/gallery/library/actions/useGalleryAppActions.ts',
    reason: 'Gallery app action hook wiring is covered by the focused hook suite.',
    testFiles: ['apps/extension/src/gallery/library/actions/useGalleryAppActions.test.ts'],
  },
  {
    owner: 'gallery-backup-action-test-support',
    productionFile: 'apps/extension/src/gallery/library/actions/test-support/index.ts',
    reason:
      'Gallery action test support state setters are covered by backup and helper action suites.',
    testFiles: [
      'apps/extension/src/gallery/library/actions/backup.test.ts',
      'apps/extension/src/gallery/library/actions/helpers.test.ts',
    ],
  },
  {
    owner: 'gallery-backup-action-test-support',
    productionPrefix: 'apps/extension/src/gallery/library/actions/test-support',
    reason:
      'Gallery action test support fixtures and grouped controller mocks are covered by action suites.',
    testFiles: [
      'apps/extension/src/gallery/library/actions/backup.test.ts',
      'apps/extension/src/gallery/library/actions/helpers.test.ts',
      'apps/extension/src/gallery/library/actions/useGalleryAppActions.test.ts',
    ],
  },
  {
    owner: 'gallery-library-test-support',
    productionFile: 'apps/extension/src/gallery/library/test-support/items.ts',
    reason: 'Gallery library item fixtures are covered by grid, preview, and action suites.',
    testFiles: [
      'apps/extension/src/gallery/library/main-content/grid.test.tsx',
      'apps/extension/src/gallery/library/preview/index.test.tsx',
      'apps/extension/src/gallery/library/actions/backup.test.ts',
    ],
  },
  {
    owner: 'gallery-backup-app-state',
    productionFile: 'apps/extension/src/gallery/state/types.ts',
    reason: 'Pending backup export state contract is covered by the adjacent state type test.',
    testFiles: ['apps/extension/src/gallery/state/types.test.ts'],
  },
  {
    owner: 'gallery-backup-app-shell',
    productionFile: 'apps/extension/src/gallery/shell/app-shell/bindings.tsx',
    reason:
      'Backup export app-shell wiring is covered by focused binding, layout, and overlay tests.',
    testFiles: ['apps/extension/src/gallery/shell/app-shell/bindings.test.tsx'],
  },
  {
    owner: 'gallery-backup-app-shell',
    productionFile: 'apps/extension/src/gallery/shell/app-shell/overlays.tsx',
    reason: 'Backup export overlay wiring is covered by focused overlay tests.',
    testFiles: ['apps/extension/src/gallery/shell/app-shell/overlays.backup-export.test.tsx'],
  },
  {
    owner: 'gallery-backup-app-shell',
    productionFile: 'apps/extension/src/gallery/shell/app-shell/types.ts',
    reason: 'Backup export app-shell prop contracts are covered by layout and binding tests.',
    testFiles: [
      'apps/extension/src/gallery/shell/app-shell/bindings.test.tsx',
      'apps/extension/src/gallery/shell/app-shell/layout.test.tsx',
    ],
  },
  {
    owner: 'gallery-backup-modal',
    productionFile: 'apps/extension/src/gallery/library/modals/backup-export-content.tsx',
    reason: 'Backup export modal disclosure and facade wiring are covered by focused modal tests.',
    testFiles: ['apps/extension/src/gallery/library/modals/backup-export-content.test.tsx'],
  },
  {
    owner: 'gallery-backup-modal',
    productionFile: 'apps/extension/src/gallery/library/modals/index.tsx',
    reason: 'Backup export modal facade wiring is covered by the gallery modal facade test.',
    testFiles: ['apps/extension/src/gallery/library/modals/gallery-modals.test.tsx'],
  },
  {
    owner: 'gallery-backup-modal',
    productionFile: 'apps/extension/src/gallery/library/modals/types.ts',
    reason: 'Backup export modal prop contracts are covered by focused modal tests.',
    testFiles: ['apps/extension/src/gallery/library/modals/backup-export-content.test.tsx'],
  },
  {
    owner: 'gallery-backup-state',
    productionFile: 'apps/extension/src/gallery/state/index.ts',
    reason: 'Pending backup export surface state is covered by adjacent gallery state tests.',
    testFiles: ['apps/extension/src/gallery/state/index.test.tsx'],
  },
  {
    owner: 'gallery-backup-state',
    productionFile: 'apps/extension/src/gallery/state/storage-workflow.ts',
    reason: 'Pending backup export storage workflow state is covered by its adjacent test.',
    testFiles: ['apps/extension/src/gallery/state/storage-workflow.test.tsx'],
  },
  {
    owner: 'gallery-backup-state',
    productionFile: 'apps/extension/src/gallery/state/useGallerySurfaceState.ts',
    reason: 'Pending backup export surface state is covered by the surface-state test.',
    testFiles: ['apps/extension/src/gallery/state/useGallerySurfaceState.test.tsx'],
  },
];
