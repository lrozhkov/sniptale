import JSZip from 'jszip';
import {
  PAGE_PACKAGE_ARCHIVE_MIME_TYPE,
  PAGE_PACKAGE_ARCHIVE_PATHS,
  resolvePagePackageScreenshotEntry,
  type PagePackageComponentId,
  type PagePackageEntry,
  type PagePackageManifest,
} from '@sniptale/runtime-contracts/page-package';
import { hashWebSnapshotAssetBlob } from './asset-manifest';
import { createPagePackageManifestFixture } from './manifest.test-support';

export interface PagePackageFixtureEntry {
  blob: Blob;
  component: PagePackageComponentId;
  path: string;
}

export function createPagePackagePngBytes(): Uint8Array {
  return Uint8Array.from([
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 4, 0,
    0, 0, 181, 28, 12, 2, 0, 0, 0, 11, 73, 68, 65, 84, 120, 218, 99, 100, 248, 15, 0, 1, 5, 1, 1,
    39, 24, 227, 102, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
  ]);
}

function createPagePackageWebpBytes(): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes.set(new TextEncoder().encode('RIFF'), 0);
  bytes.set(new TextEncoder().encode('WEBPVP8X'), 8);
  return bytes;
}

export function createPagePackageTestBlobFromBytes(bytes: Uint8Array, type: string): Blob {
  const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  copy.set(bytes);
  return new Blob([copy], { type });
}

export async function readPagePackageTestBlobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') {
    return new Uint8Array(await blob.arrayBuffer());
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read test blob.'));
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.readAsArrayBuffer(blob);
  });
}

export async function readPagePackageTestBlobText(blob: Blob): Promise<string> {
  return new TextDecoder().decode(await readPagePackageTestBlobBytes(blob));
}

function defaultEntries(): PagePackageFixtureEntry[] {
  return [
    {
      blob: new Blob(['<!doctype html><main>Snapshot</main>'], { type: 'text/html' }),
      component: 'webCopy',
      path: PAGE_PACKAGE_ARCHIVE_PATHS.snapshotHtml,
    },
    {
      blob: createPagePackageTestBlobFromBytes(createPagePackagePngBytes(), 'image/png'),
      component: 'webCopy',
      path: PAGE_PACKAGE_ARCHIVE_PATHS.screenshot,
    },
    {
      blob: createPagePackageTestBlobFromBytes(createPagePackageWebpBytes(), 'image/webp'),
      component: 'webCopy',
      path: PAGE_PACKAGE_ARCHIVE_PATHS.thumbnail,
    },
    {
      blob: new Blob([''], { type: 'text/plain' }),
      component: 'diagnostics',
      path: 'diagnostics/standard/errors.log',
    },
  ];
}

export async function createPagePackageArchiveFixture(
  args: {
    entries?: readonly PagePackageFixtureEntry[] | undefined;
    manifest?: Partial<PagePackageManifest> | undefined;
  } = {}
): Promise<{
  entries: readonly PagePackageFixtureEntry[];
  manifest: PagePackageManifest;
  packageBlob: Blob;
  screenshotBlob: Blob;
}> {
  const sourceEntries = args.entries ? [...args.entries] : defaultEntries();
  const entries: PagePackageEntry[] = [];
  for (const entry of sourceEntries) {
    entries.push({
      component: entry.component,
      mimeType: entry.blob.type,
      path: entry.path,
      sha256: await hashWebSnapshotAssetBlob(entry.blob),
      size: entry.blob.size,
    });
  }
  const manifest = createPagePackageManifestFixture({
    diagnosticsLevel: entries.some((entry) => entry.component === 'diagnostics')
      ? 'standard'
      : 'none',
    ...args.manifest,
    entries,
  });
  const zip = new JSZip();
  for (const entry of sourceEntries) {
    zip.file(entry.path, await readPagePackageTestBlobBytes(entry.blob), { createFolders: false });
  }
  zip.file(PAGE_PACKAGE_ARCHIVE_PATHS.manifest, `${JSON.stringify(manifest, null, 2)}\n`, {
    createFolders: false,
  });
  const archive = await zip.generateAsync({ type: 'uint8array' });
  const screenshotSelection = resolvePagePackageScreenshotEntry(entries);
  const screenshotBlob = screenshotSelection
    ? (sourceEntries.find((entry) => entry.path === screenshotSelection.path)?.blob ??
      new Blob([], { type: 'image/png' }))
    : new Blob([], { type: 'image/png' });
  return {
    entries: sourceEntries,
    manifest,
    packageBlob: createPagePackageTestBlobFromBytes(archive, PAGE_PACKAGE_ARCHIVE_MIME_TYPE),
    screenshotBlob,
  };
}
