import JSZip from 'jszip';
import {
  isWebSnapshotManifest,
  WEB_SNAPSHOT_PACKAGE_PATHS,
} from '../../features/web-snapshot/manifest';
import { assertSafeArchivePath } from '../../composition/archive-transfer/path';
import {
  collectWebSnapshotQueryRoots,
  isWebSnapshotXhtml,
  sanitizeWebSnapshotCssText,
  sanitizeWebSnapshotHtml,
  sanitizeWebSnapshotXhtml,
  serializeWebSnapshotXhtmlDocument,
} from '../../features/web-snapshot/public';
import {
  getWebSnapshotRecord,
  getWebSnapshotScreenshotFile,
} from '../../composition/persistence/web-snapshots';
import type { WebSnapshotManifest } from '@sniptale/runtime-contracts/web-snapshot';
import { MAX_PAGE_PACKAGE_ENTRIES } from '@sniptale/runtime-contracts/page-package';
import { assertZipPackageInflationProfile } from '@sniptale/platform/data/zip-profile';
import { createViewerAssetObjectUrls } from './asset-objects';
import type { LoadedWebSnapshotAsset } from './asset-objects';
import { validateRetainedWebSnapshotScreenshot } from '../../features/web-snapshot/screenshot-validation';
import { withOfflineSnapshotPolicy } from './document-policy';
import { hashWebSnapshotAssetBytes } from '../../features/web-snapshot/asset-manifest';
import {
  resolveWebSnapshotEntryByteLimit,
  WEB_SNAPSHOT_PACKAGE_POLICY,
} from '../../features/web-snapshot/package-policy';

export interface LoadedWebSnapshotPackage {
  assets: LoadedWebSnapshotAsset[];
  documentUrl: string | null;
  html: string;
  manifest: WebSnapshotManifest;
  objectUrls: string[];
  screenshotUrl: string;
}

const MAX_VIEWER_FILE_COUNT = MAX_PAGE_PACKAGE_ENTRIES + 1;
const URL_ATTRIBUTES = ['href', 'poster', 'src'] as const;
const REQUIRED_VIEWER_PACKAGE_PATHS = new Set([
  WEB_SNAPSHOT_PACKAGE_PATHS.manifest,
  WEB_SNAPSHOT_PACKAGE_PATHS.snapshotHtml,
  WEB_SNAPSHOT_PACKAGE_PATHS.screenshot,
  WEB_SNAPSHOT_PACKAGE_PATHS.thumbnail,
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

function rewriteElementUrlAttributes(element: Element, urlsByPath: Map<string, string>): void {
  for (const attribute of URL_ATTRIBUTES) {
    if (attribute === 'href' && element.tagName.toLowerCase() === 'a') continue;
    const value = element.getAttribute(attribute);
    const objectUrl = value ? urlsByPath.get(normalizeSnapshotAssetPath(value)) : undefined;
    if (objectUrl) element.setAttribute(attribute, objectUrl);
  }

  const srcset = element.getAttribute('srcset');
  if (!srcset) return;
  const rewritten = rewriteSrcset(srcset, urlsByPath);
  if (rewritten) element.setAttribute('srcset', rewritten);
  else element.removeAttribute('srcset');
}

function rewriteDocumentStyleAssetReferences(
  document: Document,
  urlsByPath: Map<string, string>
): void {
  for (const root of collectWebSnapshotQueryRoots(document)) {
    for (const styleElement of root.querySelectorAll('style')) {
      styleElement.textContent = rewriteCssAssetReferences(
        styleElement.textContent ?? '',
        urlsByPath
      );
    }
    for (const element of root.querySelectorAll('[style]')) {
      element.setAttribute(
        'style',
        rewriteCssAssetReferences(element.getAttribute('style') ?? '', urlsByPath)
      );
    }
  }
}

function rewriteAssetReferences(
  source: string,
  urlsByPath: Map<string, string>,
  xhtml: boolean
): string {
  const document = new DOMParser().parseFromString(
    source,
    xhtml ? 'application/xhtml+xml' : 'text/html'
  );
  if (xhtml && document.querySelector('parsererror')) {
    throw new Error('Web snapshot XHTML is invalid.');
  }
  for (const root of collectWebSnapshotQueryRoots(document)) {
    for (const element of root.querySelectorAll('[src], [srcset], [href], [poster]')) {
      rewriteElementUrlAttributes(element, urlsByPath);
    }
  }
  rewriteDocumentStyleAssetReferences(document, urlsByPath);

  return xhtml
    ? serializeWebSnapshotXhtmlDocument(document)
    : `<!doctype html>${document.documentElement.outerHTML}`;
}

function rewriteCssAssetReferences(cssText: string, urlsByPath: Map<string, string>): string {
  return sanitizeWebSnapshotCssText(cssText, (url) => {
    const trimmedUrl = url.trim();
    if (trimmedUrl.startsWith('#') || trimmedUrl.startsWith('data:')) return trimmedUrl;
    return urlsByPath.get(normalizeSnapshotAssetPath(trimmedUrl)) ?? null;
  });
}

function getViewerEntryPath(file: JSZip.JSZipObject): string {
  const originalPath = file.unsafeOriginalName ?? file.name;
  assertSafeArchivePath(originalPath);
  assertSafeArchivePath(file.name);
  return file.name;
}

function resolveViewerEntryByteLimit(path: string): number {
  return resolveWebSnapshotEntryByteLimit(path);
}

function inspectViewerPackageEntries(zip: JSZip): Map<string, JSZip.JSZipObject> {
  const files = Object.values(zip.files).filter((file) => !file.dir);
  assertZipPackageInflationProfile(files, {
    assertPath: assertSafeArchivePath,
    createEntryError: () => new Error('Web snapshot package entry is too large.'),
    createFileCountError: () => new Error('Web snapshot package contains too many files.'),
    createTotalError: () => new Error('Web snapshot package inflated content is too large.'),
    maxFileCount: MAX_VIEWER_FILE_COUNT,
    maxTotalBytes: WEB_SNAPSHOT_PACKAGE_POLICY.maxTotalInflatedBytes,
    resolveEntryMaxBytes: resolveViewerEntryByteLimit,
  });

  const filesByPath = new Map<string, JSZip.JSZipObject>();
  for (const file of files) {
    const path = getViewerEntryPath(file);
    if (filesByPath.has(path)) {
      throw new Error('Page Package archive inventory does not match its manifest.');
    }
    filesByPath.set(path, file);
  }

  for (const requiredPath of REQUIRED_VIEWER_PACKAGE_PATHS) {
    if (!filesByPath.has(requiredPath)) {
      throw new Error('Web snapshot package is missing a required entry.');
    }
  }

  return filesByPath;
}

async function readViewerEntry(
  filesByPath: Map<string, JSZip.JSZipObject>,
  path: string
): Promise<Uint8Array> {
  const file = filesByPath.get(path);
  if (!file) throw new Error('Web snapshot package is missing a required entry.');
  const bytes = await file.async('uint8array');
  if (bytes.byteLength > resolveViewerEntryByteLimit(path)) {
    throw new Error('Web snapshot package entry is too large.');
  }
  return bytes;
}

async function readViewerWebCopyEntries(
  filesByPath: Map<string, JSZip.JSZipObject>,
  manifest: WebSnapshotManifest
): Promise<Map<string, Uint8Array>> {
  const selectedPaths = manifest.entries
    .filter(
      (entry) =>
        entry.component === 'webCopy' && entry.path !== WEB_SNAPSHOT_PACKAGE_PATHS.thumbnail
    )
    .map((entry) => entry.path);
  const entries = await Promise.all(
    selectedPaths.map(async (path) => [path, await readViewerEntry(filesByPath, path)] as const)
  );
  return new Map(entries);
}

function parseViewerPackageManifest(manifestBytes: Uint8Array): WebSnapshotManifest {
  const manifestText = new TextDecoder().decode(manifestBytes);
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
  if (packageBlob.size > WEB_SNAPSHOT_PACKAGE_POLICY.maxArchiveBytes) {
    throw new Error('Web snapshot package archive is too large.');
  }
}

async function readViewerScreenshot(snapshotId: string): Promise<Blob> {
  const screenshot = await getWebSnapshotScreenshotFile(snapshotId);
  if (!screenshot || screenshot.size === 0) {
    throw new Error('Web snapshot screenshot is missing.');
  }
  return screenshot;
}

function assertManifestMatchesRecord(args: {
  packageManifest: WebSnapshotManifest;
  recordManifest: WebSnapshotManifest;
}): void {
  if (JSON.stringify(args.packageManifest) !== JSON.stringify(args.recordManifest)) {
    throw new Error('Web snapshot package manifest does not match the saved record.');
  }
}

function assertViewerInventory(
  filesByPath: Map<string, JSZip.JSZipObject>,
  manifest: WebSnapshotManifest
): void {
  if (filesByPath.size !== manifest.entries.length + 1) {
    throw new Error('Page Package archive inventory does not match its manifest.');
  }
  const expectedPaths = new Set(manifest.entries.map((entry) => entry.path));
  for (const path of filesByPath.keys()) {
    if (path === WEB_SNAPSHOT_PACKAGE_PATHS.manifest) continue;
    if (!expectedPaths.delete(path)) {
      throw new Error('Page Package archive inventory does not match its manifest.');
    }
  }
  if (expectedPaths.size > 0) {
    throw new Error('Page Package archive inventory does not match its manifest.');
  }
}

async function assertViewerWebCopyDigests(
  bytesByPath: Map<string, Uint8Array>,
  manifest: WebSnapshotManifest
): Promise<void> {
  for (const entry of manifest.entries.filter(
    (candidate) =>
      candidate.component === 'webCopy' && candidate.path !== WEB_SNAPSHOT_PACKAGE_PATHS.thumbnail
  )) {
    const bytes = bytesByPath.get(entry.path);
    if (
      !bytes ||
      bytes.byteLength !== entry.size ||
      (await hashWebSnapshotAssetBytes(bytes)) !== entry.sha256
    ) {
      throw new Error(`Page Package entry metadata does not match: ${entry.path}.`);
    }
  }
}

export async function loadWebSnapshotPackage(
  snapshotId: string
): Promise<LoadedWebSnapshotPackage> {
  const record = await getWebSnapshotRecord(snapshotId);
  if (!record) {
    throw new Error('Web snapshot was not found.');
  }

  assertCompressedViewerPackageSize(record.packageFile);
  const zip = await JSZip.loadAsync(record.packageFile);
  const filesByPath = inspectViewerPackageEntries(zip);
  const packageManifest = parseViewerPackageManifest(
    await readViewerEntry(filesByPath, WEB_SNAPSHOT_PACKAGE_PATHS.manifest)
  );
  assertManifestMatchesRecord({
    packageManifest,
    recordManifest: record.manifest,
  });
  assertViewerInventory(filesByPath, packageManifest);
  const bytesByPath = await readViewerWebCopyEntries(filesByPath, packageManifest);
  await assertViewerWebCopyDigests(bytesByPath, packageManifest);
  const screenshot = await readViewerScreenshot(snapshotId);
  await validateRetainedWebSnapshotScreenshot({
    packageBytes: readRequiredViewerEntry(bytesByPath, WEB_SNAPSHOT_PACKAGE_PATHS.screenshot),
    screenshotBlob: screenshot,
  });

  const assetEntries = Array.from(bytesByPath).filter(([path]) => path.startsWith('assets/'));
  const htmlBytes = readRequiredViewerEntry(bytesByPath, WEB_SNAPSHOT_PACKAGE_PATHS.snapshotHtml);
  const html = new TextDecoder().decode(htmlBytes);
  const { assets, objectUrls, urlsByPath } = await createViewerAssetObjectUrls(
    assetEntries,
    packageManifest
  );

  try {
    const xhtml = isWebSnapshotXhtml(html);
    const rewrittenHtml = rewriteAssetReferences(html, urlsByPath, xhtml);
    const sanitizedDocument = xhtml
      ? sanitizeWebSnapshotXhtml(rewrittenHtml, record.manifest.source.url, {
          allowedObjectUrls: objectUrls,
          offlineOnly: true,
        })
      : sanitizeWebSnapshotHtml(rewrittenHtml, record.manifest.source.url, {
          allowedObjectUrls: objectUrls,
          offlineOnly: true,
        });
    const documentUrl = xhtml
      ? URL.createObjectURL(
          new Blob([withOfflineSnapshotPolicy(sanitizedDocument, true)], {
            type: 'application/xhtml+xml',
          })
        )
      : null;
    if (documentUrl) objectUrls.push(documentUrl);
    const screenshotUrl = URL.createObjectURL(screenshot);
    objectUrls.push(screenshotUrl);
    return {
      assets,
      documentUrl,
      html: sanitizedDocument,
      manifest: record.manifest,
      objectUrls,
      screenshotUrl,
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
