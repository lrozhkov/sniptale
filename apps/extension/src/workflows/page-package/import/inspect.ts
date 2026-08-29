import {
  MAX_PAGE_PACKAGE_ENTRIES,
  PAGE_PACKAGE_ARCHIVE_PATHS,
  parsePagePackageManifest,
  resolvePagePackageScreenshotEntry,
  type PagePackageEntry,
  type PagePackageManifest,
} from '@sniptale/runtime-contracts/page-package';
import { openArchiveReader, type ArchiveReader } from '../../../composition/archive-transfer';
import {
  assertWebSnapshotMimeSignature,
  isAllowedWebSnapshotAssetMimeType,
  validateImportedWebSnapshotAsset,
} from '../../../features/web-snapshot/public';
import {
  resolveWebSnapshotEntryByteLimit,
  WEB_SNAPSHOT_ARCHIVE_RESOURCE_PROFILE,
  WEB_SNAPSHOT_PACKAGE_POLICY,
} from '../../../features/web-snapshot/package-policy';
import { validateWebSnapshotScreenshotBlob } from '../../../features/web-snapshot/screenshot-validation';
import type { WebSnapshotImportInspection } from './contracts';
import { inspectArchiveEntrySource, readArchiveEntryBlob } from './entry-source';

const SUPPORTED_EXTENSION = '.sniptale-page-package.zip';

function assertSupportedProfile(manifest: PagePackageManifest): void {
  if (manifest.intent !== 'save' || manifest.diagnosticsLevel !== 'standard') {
    throw new Error('Only a standard Web Snapshot Page Package can be imported.');
  }
  const webCopy = manifest.components.find((component) => component.id === 'webCopy');
  if (!webCopy || webCopy.entryCount < 3) {
    throw new Error('Page Package does not contain a complete Web copy.');
  }
}

function parseManifest(text: string): PagePackageManifest {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new Error('Page Package manifest is invalid.');
  }
  const manifest = parsePagePackageManifest(value);
  if (!manifest) throw new Error('Page Package manifest is invalid or unsupported.');
  assertSupportedProfile(manifest);
  return manifest;
}

function assertExactInventory(reader: ArchiveReader, manifest: PagePackageManifest): void {
  const expected = new Map(manifest.entries.map((entry) => [entry.path, entry]));
  if (reader.entries().length !== expected.size + 1) {
    throw new Error('Page Package archive inventory does not match its manifest.');
  }
  for (const source of reader.entries()) {
    if (source.path === PAGE_PACKAGE_ARCHIVE_PATHS.manifest) continue;
    const entry = expected.get(source.path);
    if (!entry || entry.size !== source.size) {
      throw new Error('Page Package archive inventory does not match its manifest.');
    }
    expected.delete(source.path);
  }
  if (expected.size > 0) {
    throw new Error('Page Package archive inventory does not match its manifest.');
  }
}

function assertEntryPolicy(entry: PagePackageEntry): void {
  const maxBytes = resolveWebSnapshotEntryByteLimit(entry.path, entry.mimeType);
  if (entry.size > maxBytes) throw new Error(`Page Package entry is too large: ${entry.path}.`);
  if (
    entry.component === 'webCopy' &&
    entry.path.startsWith('assets/') &&
    !isAllowedWebSnapshotAssetMimeType(entry.mimeType)
  ) {
    throw new Error(`Page Package Web-copy asset MIME is not supported: ${entry.path}.`);
  }
}

async function validateDeclaredEntries(
  reader: ArchiveReader,
  manifest: PagePackageManifest,
  signal?: AbortSignal
): Promise<void> {
  for (const entry of manifest.entries) {
    signal?.throwIfAborted();
    assertEntryPolicy(entry);
    const source = reader.entry(entry.path);
    if (!source) throw new Error(`Page Package entry is missing: ${entry.path}.`);
    const inspected = await inspectArchiveEntrySource(source, signal);
    if (inspected.sha256 !== entry.sha256) {
      throw new Error(`Page Package entry digest does not match: ${entry.path}.`);
    }
    assertWebSnapshotMimeSignature(inspected.header, entry.mimeType, entry.path);
  }
}

async function validatePreviewImages(
  reader: ArchiveReader,
  manifest: PagePackageManifest,
  signal?: AbortSignal
): Promise<void> {
  const screenshot = resolvePagePackageScreenshotEntry(manifest.entries);
  if (!screenshot) throw new Error('Page Package screenshot coverage is invalid.');
  for (const path of [screenshot.path, PAGE_PACKAGE_ARCHIVE_PATHS.thumbnail]) {
    const entry = manifest.entries.find((candidate) => candidate.path === path);
    const source = reader.entry(path);
    if (!entry || !source) throw new Error(`Page Package entry is missing: ${path}.`);
    const blob = await readArchiveEntryBlob(
      source,
      entry.mimeType,
      resolveWebSnapshotEntryByteLimit(path, entry.mimeType),
      signal
    );
    if (path === screenshot.path) {
      await validateWebSnapshotScreenshotBlob(blob);
    } else {
      await validateImportedWebSnapshotAsset(blob, entry.mimeType, path);
    }
  }
}

export async function inspectWebSnapshotImport(
  file: File,
  signal?: AbortSignal
): Promise<WebSnapshotImportInspection> {
  const opened = await openValidatedWebSnapshotImport(file, signal);
  try {
    return opened.inspection;
  } finally {
    await opened.reader.close();
  }
}

export async function openValidatedWebSnapshotImport(
  file: File,
  signal?: AbortSignal
): Promise<{ inspection: WebSnapshotImportInspection; reader: ArchiveReader }> {
  if (!file.name.toLocaleLowerCase('en-US').endsWith(SUPPORTED_EXTENSION)) {
    throw new Error('Choose a .sniptale-page-package.zip file.');
  }
  if (file.size > WEB_SNAPSHOT_PACKAGE_POLICY.maxArchiveBytes) {
    throw new Error('Web Snapshot archive is too large.');
  }
  signal?.throwIfAborted();
  const reader = await openArchiveReader(file, {
    resourceProfile: WEB_SNAPSHOT_ARCHIVE_RESOURCE_PROFILE,
  });
  try {
    const manifestSource = reader.entry(PAGE_PACKAGE_ARCHIVE_PATHS.manifest);
    if (!manifestSource) throw new Error('Page Package manifest is missing.');
    const manifestText = await manifestSource.text(WEB_SNAPSHOT_PACKAGE_POLICY.maxManifestBytes);
    const manifest = parseManifest(manifestText);
    if (manifest.entries.length > MAX_PAGE_PACKAGE_ENTRIES) {
      throw new Error('Page Package contains too many files.');
    }
    assertExactInventory(reader, manifest);
    await validateDeclaredEntries(reader, manifest, signal);
    await validatePreviewImages(reader, manifest, signal);
    return {
      reader,
      inspection: {
        archiveBytes: file.size,
        capturedAt: manifest.capturedAt,
        manifest,
        resourceCount: manifest.entries.filter(
          (entry) => entry.component === 'webCopy' && entry.path.startsWith('assets/')
        ).length,
        sourceTitle: manifest.source.title,
        sourceUrl: manifest.source.url,
        warnings: manifest.warnings,
      },
    };
  } catch (error) {
    await reader.close().catch(() => undefined);
    throw error;
  }
}
