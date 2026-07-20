import JSZip from 'jszip';
import {
  assertSafeWebSnapshotPackagePath,
  isWebSnapshotManifest,
  WEB_SNAPSHOT_PACKAGE_PATHS,
} from '../../features/web-snapshot/manifest';
import { sanitizeWebSnapshotHtml } from '../../features/web-snapshot/public';
import { getWebSnapshotRecord } from '../../composition/persistence/web-snapshots';
import type { WebSnapshotManifest } from '@sniptale/runtime-contracts/web-snapshot';
import { assertZipPackageInflationProfile } from '@sniptale/platform/data/zip-profile';
import { createViewerAssetObjectUrls } from './asset-objects';

export interface LoadedWebSnapshotPackage {
  html: string;
  manifest: WebSnapshotManifest;
  objectUrls: string[];
}

const MAX_VIEWER_FILE_COUNT = 500;
const MAX_VIEWER_COMPRESSED_PACKAGE_BYTES = 100 * 1024 * 1024;
const MAX_VIEWER_TOTAL_INFLATED_BYTES = 250 * 1024 * 1024;
const MAX_VIEWER_ASSET_BYTES = 25 * 1024 * 1024;
const MAX_VIEWER_TEXT_ENTRY_BYTES = 10 * 1024 * 1024;
const URL_ATTRIBUTES = ['href', 'poster', 'src'] as const;
const REQUIRED_VIEWER_PACKAGE_PATHS = new Set([
  WEB_SNAPSHOT_PACKAGE_PATHS.manifest,
  WEB_SNAPSHOT_PACKAGE_PATHS.snapshotHtml,
  WEB_SNAPSHOT_PACKAGE_PATHS.screenshot,
]);

function normalizeSnapshotAssetPath(value: string): string {
  return value.replace(/^\.\.\//, '');
}

function rewriteSrcset(value: string, urlsByPath: Map<string, string>): string {
  return value
    .split(',')
    .map((candidate) => candidate.trim())
    .filter(Boolean)
    .flatMap((candidate) => {
      const [url = '', ...descriptorParts] = candidate.split(/\s+/);
      const objectUrl = urlsByPath.get(normalizeSnapshotAssetPath(url));
      return objectUrl ? [`${objectUrl} ${descriptorParts.join(' ')}`.trim()] : [];
    })
    .join(', ');
}

function rewriteAssetReferences(html: string, urlsByPath: Map<string, string>): string {
  const document = new DOMParser().parseFromString(html, 'text/html');
  for (const element of Array.from(
    document.querySelectorAll('[src], [srcset], [href], [poster]')
  )) {
    for (const attribute of URL_ATTRIBUTES) {
      const value = element.getAttribute(attribute);
      const objectUrl = value ? urlsByPath.get(normalizeSnapshotAssetPath(value)) : undefined;
      if (objectUrl) {
        element.setAttribute(attribute, objectUrl);
      }
    }

    const srcset = element.getAttribute('srcset');
    if (srcset) {
      const rewritten = rewriteSrcset(srcset, urlsByPath);
      if (rewritten) {
        element.setAttribute('srcset', rewritten);
      } else {
        element.removeAttribute('srcset');
      }
    }
  }

  return `<!doctype html>${document.documentElement.outerHTML}`;
}

function getViewerEntryPath(file: JSZip.JSZipObject): string {
  const originalPath = file.unsafeOriginalName ?? file.name;
  assertSafeWebSnapshotPackagePath(originalPath);
  assertSafeWebSnapshotPackagePath(file.name);
  return file.name;
}

function resolveViewerEntryByteLimit(path: string): number {
  return path === WEB_SNAPSHOT_PACKAGE_PATHS.manifest ||
    path === WEB_SNAPSHOT_PACKAGE_PATHS.snapshotHtml ||
    path.startsWith('logs/')
    ? MAX_VIEWER_TEXT_ENTRY_BYTES
    : MAX_VIEWER_ASSET_BYTES;
}

async function readViewerPackageEntries(zip: JSZip): Promise<Map<string, Uint8Array>> {
  const files = Object.values(zip.files).filter((file) => !file.dir);
  assertZipPackageInflationProfile(files, {
    assertPath: assertSafeWebSnapshotPackagePath,
    createEntryError: () => new Error('Web snapshot package entry is too large.'),
    createFileCountError: () => new Error('Web snapshot package contains too many files.'),
    createTotalError: () => new Error('Web snapshot package inflated content is too large.'),
    maxFileCount: MAX_VIEWER_FILE_COUNT,
    maxTotalBytes: MAX_VIEWER_TOTAL_INFLATED_BYTES,
    resolveEntryMaxBytes: resolveViewerEntryByteLimit,
  });

  const bytesByPath = new Map<string, Uint8Array>();
  let totalBytes = 0;
  for (const file of files) {
    const path = getViewerEntryPath(file);
    const bytes = await file.async('uint8array');
    const entryLimit = resolveViewerEntryByteLimit(path);
    if (bytes.byteLength > entryLimit) {
      throw new Error('Web snapshot package entry is too large.');
    }

    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_VIEWER_TOTAL_INFLATED_BYTES) {
      throw new Error('Web snapshot package inflated content is too large.');
    }

    bytesByPath.set(path, bytes);
  }

  for (const requiredPath of REQUIRED_VIEWER_PACKAGE_PATHS) {
    if (!bytesByPath.has(requiredPath)) {
      throw new Error('Web snapshot package is missing a required entry.');
    }
  }

  return bytesByPath;
}

function readViewerPackageManifest(bytesByPath: Map<string, Uint8Array>): WebSnapshotManifest {
  const manifestText = new TextDecoder().decode(
    readRequiredViewerEntry(bytesByPath, WEB_SNAPSHOT_PACKAGE_PATHS.manifest)
  );
  let manifest: unknown;
  try {
    manifest = JSON.parse(manifestText) as unknown;
  } catch {
    throw new Error('Web snapshot package manifest is invalid.');
  }

  if (!isWebSnapshotManifest(manifest)) {
    throw new Error('Web snapshot package manifest is invalid.');
  }

  return manifest;
}

function readRequiredViewerEntry(bytesByPath: Map<string, Uint8Array>, path: string): Uint8Array {
  const bytes = bytesByPath.get(path);
  if (!bytes) {
    throw new Error('Web snapshot package is missing a required entry.');
  }

  return bytes;
}

function assertCompressedViewerPackageSize(packageBlob: Blob): void {
  if (packageBlob.size > MAX_VIEWER_COMPRESSED_PACKAGE_BYTES) {
    throw new Error('Web snapshot package archive is too large.');
  }
}

function assertManifestMatchesRecord(args: {
  packageManifest: WebSnapshotManifest;
  recordManifest: WebSnapshotManifest;
}): void {
  if (
    args.packageManifest.id !== args.recordManifest.id ||
    args.packageManifest.schemaVersion !== args.recordManifest.schemaVersion ||
    args.packageManifest.captureMode !== args.recordManifest.captureMode
  ) {
    throw new Error('Web snapshot package manifest does not match the saved record.');
  }
}

export async function loadWebSnapshotPackage(
  snapshotId: string
): Promise<LoadedWebSnapshotPackage> {
  const record = await getWebSnapshotRecord(snapshotId);
  if (!record) {
    throw new Error('Web snapshot was not found.');
  }

  assertCompressedViewerPackageSize(record.packageBlob);
  const zip = await JSZip.loadAsync(record.packageBlob);
  const bytesByPath = await readViewerPackageEntries(zip);
  const packageManifest = readViewerPackageManifest(bytesByPath);
  assertManifestMatchesRecord({ packageManifest, recordManifest: record.manifest });

  const assetEntries = Array.from(bytesByPath).filter(([path]) => path.startsWith('assets/'));
  const htmlBytes = readRequiredViewerEntry(bytesByPath, WEB_SNAPSHOT_PACKAGE_PATHS.snapshotHtml);
  const html = new TextDecoder().decode(htmlBytes);
  const { objectUrls, urlsByPath } = await createViewerAssetObjectUrls(
    assetEntries,
    packageManifest
  );

  try {
    const sanitizedHtml = sanitizeWebSnapshotHtml(html, record.manifest.source.url);
    const rewrittenHtml = rewriteAssetReferences(sanitizedHtml, urlsByPath);
    return {
      html: sanitizeWebSnapshotHtml(rewrittenHtml, record.manifest.source.url, {
        allowedObjectUrls: objectUrls,
        offlineOnly: true,
      }),
      manifest: record.manifest,
      objectUrls,
    };
  } catch (error) {
    revokeWebSnapshotObjectUrls(objectUrls);
    throw error;
  }
}

export function revokeWebSnapshotObjectUrls(urls: string[]): void {
  for (const url of urls) {
    URL.revokeObjectURL(url);
  }
}
