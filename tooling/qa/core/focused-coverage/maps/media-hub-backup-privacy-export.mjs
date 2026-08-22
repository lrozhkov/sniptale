export const MEDIA_HUB_BACKUP_PRIVACY_EXPORT_OWNER_MAPPINGS = [
  {
    owner: 'media-hub-backup-v6-privacy-export',
    productionPrefix: 'apps/extension/src/workflows/media-hub-backup/v6/',
    reason:
      'The v6 privacy projection and domain inventories are covered by codec, inventory, and export tests.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/v6/inventory/media.test.ts',
      'apps/extension/src/workflows/media-hub-backup/v6/inventory/effect-bundles.test.ts',
      'apps/extension/src/workflows/media-hub-backup/v6/root-codecs/editor-document.test.ts',
      'apps/extension/src/workflows/media-hub-backup/v6/root-codecs/projects.test.ts',
      'apps/extension/src/workflows/media-hub-backup/v6/export.test.ts',
    ],
  },
  {
    owner: 'media-hub-backup-v6-facade',
    productionFile: 'apps/extension/src/workflows/media-hub-backup/index.ts',
    reason: 'The stable Gallery-facing facade is covered by its identity contract test.',
    testFiles: ['apps/extension/src/workflows/media-hub-backup/index.test.ts'],
  },
];
