import {
  PAGE_PACKAGE_ARCHIVE_PATHS,
  parsePagePackageManifest,
  type PagePackageManifest,
} from '@sniptale/runtime-contracts/page-package';

/** Product-domain path facade. The archive contract itself is Page Package v1. */
export const WEB_SNAPSHOT_PACKAGE_PATHS = PAGE_PACKAGE_ARCHIVE_PATHS;

export function parseWebSnapshotManifestJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error('Page Package manifest is invalid.');
  }
}

export function isWebSnapshotManifest(value: unknown): value is PagePackageManifest {
  return parsePagePackageManifest(value) !== null;
}
