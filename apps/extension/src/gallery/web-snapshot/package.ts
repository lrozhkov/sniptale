import JSZip from 'jszip';
import {
  assertSafeWebSnapshotPackagePath,
  WEB_SNAPSHOT_PACKAGE_PATHS,
} from '../../features/web-snapshot/manifest';
import {
  assertZipEntryCanInflate,
  assertZipPackageInflationProfile,
} from '@sniptale/platform/data/zip-profile';

const MAX_PREVIEW_PACKAGE_BYTES = 100 * 1024 * 1024;
const MAX_PREVIEW_FILE_COUNT = 500;
const MAX_PREVIEW_SCREENSHOT_BYTES = 25 * 1024 * 1024;

function assertPreviewPackageEntries(zip: JSZip): void {
  assertZipPackageInflationProfile(Object.values(zip.files), {
    assertPath: assertSafeWebSnapshotPackagePath,
    createEntryError: (path) =>
      new Error(
        path === WEB_SNAPSHOT_PACKAGE_PATHS.screenshot
          ? 'Web snapshot screenshot is too large.'
          : 'Web snapshot package is too large.'
      ),
    createFileCountError: () => new Error('Web snapshot package contains too many files.'),
    createTotalError: () => new Error('Web snapshot package is too large.'),
    maxFileCount: MAX_PREVIEW_FILE_COUNT,
    maxTotalBytes: MAX_PREVIEW_PACKAGE_BYTES,
    resolveEntryMaxBytes: (path) =>
      path === WEB_SNAPSHOT_PACKAGE_PATHS.screenshot
        ? MAX_PREVIEW_SCREENSHOT_BYTES
        : MAX_PREVIEW_PACKAGE_BYTES,
  });
}

function createScreenshotBlob(bytes: Uint8Array): Blob {
  const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  copy.set(bytes);
  return new Blob([copy]);
}

export async function loadWebSnapshotScreenshotBlob(packageBlob: Blob): Promise<Blob> {
  if (packageBlob.size > MAX_PREVIEW_PACKAGE_BYTES) {
    throw new Error('Web snapshot package is too large.');
  }

  const zip = await JSZip.loadAsync(await packageBlob.arrayBuffer());
  assertPreviewPackageEntries(zip);

  const screenshotFile = zip.file(WEB_SNAPSHOT_PACKAGE_PATHS.screenshot);

  if (!screenshotFile) {
    throw new Error('Web snapshot screenshot is missing.');
  }

  assertZipEntryCanInflate(
    screenshotFile,
    MAX_PREVIEW_SCREENSHOT_BYTES,
    () => new Error('Web snapshot screenshot is too large.')
  );
  const screenshotBytes = await screenshotFile.async('uint8array');
  if (screenshotBytes.byteLength > MAX_PREVIEW_SCREENSHOT_BYTES) {
    throw new Error('Web snapshot screenshot is too large.');
  }

  return createScreenshotBlob(screenshotBytes);
}
