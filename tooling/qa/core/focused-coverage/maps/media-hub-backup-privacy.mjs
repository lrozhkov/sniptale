import * as exportPrivacyOwnerMap from './media-hub-backup-privacy-export.mjs';
import * as restorePrivacyOwnerMap from './media-hub-backup-privacy-restore.mjs';

export const MEDIA_HUB_BACKUP_PRIVACY_OWNER_MAPPINGS = [
  ...exportPrivacyOwnerMap.MEDIA_HUB_BACKUP_PRIVACY_EXPORT_OWNER_MAPPINGS,
  ...restorePrivacyOwnerMap.MEDIA_HUB_BACKUP_PRIVACY_RESTORE_OWNER_MAPPINGS,
];
