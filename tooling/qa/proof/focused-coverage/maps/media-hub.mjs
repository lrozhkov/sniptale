export const MEDIA_HUB_OWNER_MAPPINGS = [
  {
    owner: 'video-editor-project-asset-import-boundary',
    productionFile: 'apps/extension/src/video-editor/project/operations/import-validation.ts',
    reason: 'Project asset import MIME, signature, and size gates are covered by assets tests.',
    testFiles: ['apps/extension/src/video-editor/project/operations/assets.test.ts'],
  },
  {
    owner: 'shared-media-hub-project-asset-storage-boundary',
    productionFile: 'apps/extension/src/features/media-hub/project-assets.ts',
    reason: 'Project asset storage budgets are covered by focused media-hub boundary tests.',
    testFiles: ['apps/extension/src/workflows/media-hub/store.project-assets.test.ts'],
  },
  {
    owner: 'shared-media-hub-project-asset-storage-boundary',
    productionFile: 'apps/extension/src/workflows/media-hub/store.ts',
    reason: 'Project asset save facade validation is covered by focused media-hub boundary tests.',
    testFiles: [
      'apps/extension/src/workflows/media-hub/store.project-assets.test.ts',
      'apps/extension/src/workflows/media-hub/store.filename-boundary.test.ts',
    ],
  },
  {
    owner: 'shared-media-hub-video-project-delete',
    productionFile: 'apps/extension/src/workflows/media-hub/video-projects.ts',
    reason:
      'Media hub video project deletion is covered by the focused editor delete facade suite.',
    testFiles: [
      'apps/extension/src/video-editor/project/operations/delete.test.ts',
      'apps/extension/src/workflows/media-hub/video-projects.test.ts',
    ],
  },
];
