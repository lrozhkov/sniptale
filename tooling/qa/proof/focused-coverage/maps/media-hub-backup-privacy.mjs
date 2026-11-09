import * as exportPrivacyOwnerMap from './media-hub-backup-privacy-export.mjs';
import * as restorePrivacyOwnerMap from './media-hub-backup-privacy-restore.mjs';

export const MEDIA_HUB_BACKUP_PRIVACY_OWNER_MAPPINGS = [
  ...exportPrivacyOwnerMap.MEDIA_HUB_BACKUP_PRIVACY_EXPORT_OWNER_MAPPINGS,
  ...restorePrivacyOwnerMap.MEDIA_HUB_BACKUP_PRIVACY_RESTORE_OWNER_MAPPINGS,
  {
    owner: 'common-protection-portable-exclusion',
    productionPrefix: 'apps/extension/src/composition/persistence/secret-protection/',
    allowCrossOwner: true,
    reason:
      'Shared protection records and native journal must remain absent from supported portable artifacts.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/v6/privacy.test.ts',
      'apps/extension/src/workflows/settings-transfer/backup.test.ts',
      'apps/extension/src/workflows/settings-transfer/settings-coverage.test.ts',
    ],
  },
];
