import { ARCHIVE_PACKAGE_OWNER_MAPPINGS } from './archive.mjs';
import { GALLERY_BACKUP_OWNER_MAPPINGS } from './gallery-backup.mjs';
import { MEDIA_HUB_BACKUP_PACKAGE_OWNER_MAPPINGS } from './media-hub-backup-package.mjs';
import { MEDIA_HUB_BACKUP_PRIVACY_OWNER_MAPPINGS } from './media-hub-backup-privacy.mjs';
import { MEDIA_HUB_BACKUP_RESTORE_OWNER_MAPPINGS } from './media-hub-backup-restore.mjs';
import { MEDIA_HUB_OWNER_MAPPINGS } from './media-hub.mjs';
import { PRIVACY_ERASURE_OWNER_MAPPINGS } from './privacy-erasure.mjs';
import { VIDEO_PROJECT_EXPORT_OWNER_MAPPINGS } from './video-project-export.mjs';
import { WEB_SNAPSHOT_OWNER_MAPPINGS } from './web-snapshot.mjs';

export const PLATFORM_BACKUP_OWNER_MAPPINGS = [
  ...ARCHIVE_PACKAGE_OWNER_MAPPINGS,
  ...MEDIA_HUB_BACKUP_PACKAGE_OWNER_MAPPINGS,
  ...MEDIA_HUB_BACKUP_RESTORE_OWNER_MAPPINGS,
  ...VIDEO_PROJECT_EXPORT_OWNER_MAPPINGS,
  ...WEB_SNAPSHOT_OWNER_MAPPINGS,
  ...GALLERY_BACKUP_OWNER_MAPPINGS,
  ...MEDIA_HUB_BACKUP_PRIVACY_OWNER_MAPPINGS,
  ...PRIVACY_ERASURE_OWNER_MAPPINGS,
  ...MEDIA_HUB_OWNER_MAPPINGS,
  {
    owner: 'common-protection-credential-trace',
    productionFile: 'packages/platform/src/observability/message-tracer/messaging.ts',
    allowCrossOwner: true,
    reason:
      'The credential bridge must omit every secret-bearing request and response from diagnostic sinks.',
    testFiles: [
      'packages/platform/src/observability/message-tracer/messaging.test.ts',
      'packages/platform/src/observability/diagnostics/sanitizer.test.ts',
      'apps/extension/src/platform/runtime-messaging/diagnostic-capture.test.ts',
    ],
  },
];
