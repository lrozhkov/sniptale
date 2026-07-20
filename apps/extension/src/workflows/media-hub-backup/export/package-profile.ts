import type JSZip from 'jszip';

import type { MediaHubBackupManifest } from '../contracts/types';
import { MAX_BACKUP_FILE_COUNT } from '../manifest';

const MAX_MEDIA_HUB_BACKUP_PACKAGE_ENTRIES = MAX_BACKUP_FILE_COUNT;

export function assertMediaHubBackupZipLimits(zip: JSZip, manifest: MediaHubBackupManifest): void {
  const entryCount = Object.keys(zip.files).length;
  if (entryCount > MAX_MEDIA_HUB_BACKUP_PACKAGE_ENTRIES) {
    throw new Error('Media hub backup package has too many entries.');
  }
  if (
    manifest.assetCount + manifest.effectBundleCount + manifest.thumbnailCount >
    MAX_MEDIA_HUB_BACKUP_PACKAGE_ENTRIES
  ) {
    throw new Error('Media hub backup manifest exceeds package entry budget.');
  }
}
