// policyStateIds: [] - validation allowlists are static parser policy, not mutable authority.
import JSZip from 'jszip';
import {
  assertSafeWebSnapshotPackagePath,
  isWebSnapshotManifest,
  parseWebSnapshotManifestJson,
  WEB_SNAPSHOT_PACKAGE_PATHS,
} from '../../features/web-snapshot/manifest';
import type {
  WebSnapshotManifest,
  WebSnapshotSaveToGalleryPayload,
} from '@sniptale/runtime-contracts/web-snapshot';
import {
  assertZipEntryCanInflate,
  assertZipPackageInflationProfile,
} from '@sniptale/platform/data/zip-profile';

const MAX_WEB_SNAPSHOT_PACKAGE_BYTES = 100 * 1024 * 1024;
const MAX_WEB_SNAPSHOT_SCREENSHOT_BYTES = 25 * 1024 * 1024;
const MAX_PACKAGE_FILE_COUNT = 500;
const MAX_PACKAGE_TOTAL_INFLATED_BYTES = 250 * 1024 * 1024;
const MAX_PACKAGE_ENTRY_BYTES = 25 * 1024 * 1024;
const MAX_PACKAGE_TEXT_ENTRY_BYTES = 10 * 1024 * 1024;
const ALLOWED_SCREENSHOT_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const REQUIRED_PACKAGE_PATHS = new Set([
  WEB_SNAPSHOT_PACKAGE_PATHS.manifest,
  WEB_SNAPSHOT_PACKAGE_PATHS.snapshotHtml,
  WEB_SNAPSHOT_PACKAGE_PATHS.screenshot,
]);

function resolveEntryByteLimit(path: string): number {
  return path === WEB_SNAPSHOT_PACKAGE_PATHS.manifest ||
    path === WEB_SNAPSHOT_PACKAGE_PATHS.snapshotHtml ||
    path.startsWith('logs/')
    ? MAX_PACKAGE_TEXT_ENTRY_BYTES
    : MAX_PACKAGE_ENTRY_BYTES;
}

function assertPackageInflatedSizeWithinLimits(zip: JSZip): void {
  assertZipPackageInflationProfile(Object.values(zip.files), {
    assertPath: assertSafeWebSnapshotPackagePath,
    createEntryError: () => new Error('Web snapshot package entry is too large'),
    createFileCountError: () => new Error('Web snapshot package contains too many files'),
    createTotalError: () => new Error('Web snapshot package inflated content is too large'),
    maxFileCount: MAX_PACKAGE_FILE_COUNT,
    maxTotalBytes: MAX_PACKAGE_TOTAL_INFLATED_BYTES,
    resolveEntryMaxBytes: resolveEntryByteLimit,
  });
}

function assertManifestMatchesPackageManifest(args: {
  packageManifest: unknown;
  payloadManifest: WebSnapshotManifest;
}): void {
  if (!isWebSnapshotManifest(args.packageManifest)) {
    throw new Error('Web snapshot package manifest is invalid');
  }

  if (
    args.packageManifest.id !== args.payloadManifest.id ||
    args.packageManifest.schemaVersion !== args.payloadManifest.schemaVersion ||
    args.packageManifest.captureMode !== args.payloadManifest.captureMode
  ) {
    throw new Error('Web snapshot package manifest does not match payload manifest');
  }
}

function assertPayloadBasics(payload: WebSnapshotSaveToGalleryPayload): void {
  if (!isWebSnapshotManifest(payload.manifest)) {
    throw new Error('Web snapshot manifest is invalid');
  }

  if (!ALLOWED_SCREENSHOT_MIME_TYPES.has(payload.screenshotMimeType)) {
    throw new Error('Web snapshot screenshot MIME type is not allowed');
  }
}

function assertPayloadTransferSizes(args: { packageBlob: Blob; screenshotBlob: Blob }): void {
  const { packageBlob, screenshotBlob } = args;
  if (packageBlob.size > MAX_WEB_SNAPSHOT_PACKAGE_BYTES) {
    throw new Error('Web snapshot package is too large');
  }
  if (screenshotBlob.size > MAX_WEB_SNAPSHOT_SCREENSHOT_BYTES) {
    throw new Error('Web snapshot screenshot is too large');
  }
}

function assertRequiredPackagePaths(paths: string[]): void {
  for (const requiredPath of REQUIRED_PACKAGE_PATHS) {
    if (!paths.includes(requiredPath)) {
      throw new Error('Web snapshot package is missing a required entry');
    }
  }
}

async function loadWebSnapshotPackageZip(packageBlob: Blob): Promise<JSZip> {
  const zip = await JSZip.loadAsync(await packageBlob.arrayBuffer());
  const paths = Object.keys(zip.files).filter((path) => !zip.files[path]?.dir);

  assertRequiredPackagePaths(paths);
  assertPackageInflatedSizeWithinLimits(zip);
  return zip;
}

async function assertPackageManifest(zip: JSZip, payloadManifest: WebSnapshotManifest) {
  const packageManifestFile = zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.manifest);
  if (packageManifestFile) {
    assertZipEntryCanInflate(
      packageManifestFile,
      MAX_PACKAGE_TEXT_ENTRY_BYTES,
      () => new Error('Web snapshot package entry is too large')
    );
  }
  const packageManifestText = await packageManifestFile?.async('string');
  assertManifestMatchesPackageManifest({
    packageManifest: packageManifestText ? parseWebSnapshotManifestJson(packageManifestText) : null,
    payloadManifest,
  });
}

export async function validateWebSnapshotPackage(args: {
  packageBlob: Blob;
  payload: WebSnapshotSaveToGalleryPayload;
  screenshotBlob: Blob;
}): Promise<void> {
  assertPayloadBasics(args.payload);
  assertPayloadTransferSizes(args);
  const zip = await loadWebSnapshotPackageZip(args.packageBlob);
  await assertPackageManifest(zip, args.payload.manifest);
}
