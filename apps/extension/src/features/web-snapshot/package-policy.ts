import { FULL_PAGE_QUALITY_ABSOLUTE_LIMITS } from '../../contracts/full-page-capture';

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

export function resolveWebSnapshotEntryByteLimit(path: string, mimeType?: string): number {
  if (path === 'manifest.json') return WEB_SNAPSHOT_PACKAGE_POLICY.maxManifestBytes;
  if (path === 'page-screenshot.png') return WEB_SNAPSHOT_PACKAGE_POLICY.maxScreenshotBytes;
  if (
    path === 'snapshot/index.html' ||
    path.startsWith('diagnostics/') ||
    mimeType?.startsWith('text/')
  ) {
    return WEB_SNAPSHOT_PACKAGE_POLICY.maxTextEntryBytes;
  }
  return WEB_SNAPSHOT_PACKAGE_POLICY.maxAssetEntryBytes;
}
