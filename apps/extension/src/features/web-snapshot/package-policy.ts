import { FULL_PAGE_QUALITY_ABSOLUTE_LIMITS } from '../../contracts/full-page-capture';
import type { ArchiveResourceProfile } from '../../composition/archive-transfer';
import { MAX_PAGE_PACKAGE_ENTRIES } from '@sniptale/runtime-contracts/page-package';

const MEBIBYTE = 1024 * 1024;

/** Canonical hostile-archive admission policy shared by save, Library, backup, and Viewer. */
export const WEB_SNAPSHOT_PACKAGE_POLICY = {
  maxArchiveBytes: 250 * MEBIBYTE,
  maxAssetEntryBytes: 25 * MEBIBYTE,
  maxManifestBytes: MEBIBYTE,
  maxScreenshotBytes: FULL_PAGE_QUALITY_ABSOLUTE_LIMITS.maxFileSizeMiB * MEBIBYTE,
  maxTextEntryBytes: 10 * MEBIBYTE,
  maxTotalInflatedBytes: 250 * MEBIBYTE,
} as const;

export const WEB_SNAPSHOT_ARCHIVE_RESOURCE_PROFILE: ArchiveResourceProfile = {
  maxArchiveBytes: WEB_SNAPSHOT_PACKAGE_POLICY.maxArchiveBytes,
  maxEntries: MAX_PAGE_PACKAGE_ENTRIES + 1,
  maxEntryBytes: WEB_SNAPSHOT_PACKAGE_POLICY.maxScreenshotBytes,
  maxInflatedBytes: WEB_SNAPSHOT_PACKAGE_POLICY.maxTotalInflatedBytes,
};

export function resolveWebSnapshotEntryByteLimit(path: string, mimeType?: string): number {
  if (path === 'manifest.json') return WEB_SNAPSHOT_PACKAGE_POLICY.maxManifestBytes;
  if (path === 'page-screenshot.png' || path === 'page-viewport-preview.png') {
    return WEB_SNAPSHOT_PACKAGE_POLICY.maxScreenshotBytes;
  }
  if (
    path === 'snapshot/index.html' ||
    path.startsWith('diagnostics/') ||
    mimeType?.startsWith('text/')
  ) {
    return WEB_SNAPSHOT_PACKAGE_POLICY.maxTextEntryBytes;
  }
  return WEB_SNAPSHOT_PACKAGE_POLICY.maxAssetEntryBytes;
}
