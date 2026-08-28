// policyStateIds: [] - validation limits are static parser policy, not mutable authority.
import {
  MAX_PAGE_PACKAGE_ENTRIES,
  PAGE_PACKAGE_ARCHIVE_MIME_TYPE,
  PAGE_PACKAGE_ARCHIVE_PATHS,
  parsePagePackageManifest,
  type PagePackageEntry,
  type PagePackageManifest,
} from '@sniptale/runtime-contracts/page-package';
import type { WebSnapshotSaveToGalleryPayload } from '@sniptale/runtime-contracts/web-snapshot';
import type { ArchiveEntrySource } from '../../composition/archive-transfer/contracts';
import { openArchiveReader } from '../../composition/archive-transfer/reader';
import { hashWebSnapshotAssetBytes } from '../../features/web-snapshot/asset-manifest';
import { sanitizeWebSnapshotManifestProvenance } from '../../features/web-snapshot/provenance';
import { validateRetainedWebSnapshotScreenshot } from '../../features/web-snapshot/screenshot-validation';

const MAX_WEB_SNAPSHOT_PACKAGE_BYTES = 100 * 1024 * 1024;
const MAX_WEB_SNAPSHOT_SCREENSHOT_BYTES = 25 * 1024 * 1024;
const MAX_PACKAGE_FILE_COUNT = MAX_PAGE_PACKAGE_ENTRIES + 1;
const MAX_PACKAGE_TOTAL_INFLATED_BYTES = 250 * 1024 * 1024;
const MAX_PACKAGE_ENTRY_BYTES = 25 * 1024 * 1024;
const MAX_PACKAGE_TEXT_ENTRY_BYTES = 10 * 1024 * 1024;
const MAX_PACKAGE_MANIFEST_BYTES = 1024 * 1024;

function parseRequiredManifest(value: unknown): PagePackageManifest {
  const manifest = parsePagePackageManifest(value);
  if (!manifest) throw new Error('Page Package manifest is invalid.');
  return manifest;
}

function canonicalManifestText(manifest: PagePackageManifest): string {
  return JSON.stringify(manifest);
}

function assertPayloadBasics(args: {
  packageBlob: Blob;
  payload: WebSnapshotSaveToGalleryPayload;
  screenshotBlob: Blob;
}): PagePackageManifest {
  if (
    args.packageBlob.type !== PAGE_PACKAGE_ARCHIVE_MIME_TYPE ||
    args.packageBlob.size <= 0 ||
    args.packageBlob.size > MAX_WEB_SNAPSHOT_PACKAGE_BYTES
  ) {
    throw new Error('Page Package archive is invalid or too large.');
  }
  if (
    args.payload.screenshotMimeType !== 'image/png' ||
    args.screenshotBlob.type !== 'image/png' ||
    args.screenshotBlob.size <= 0 ||
    args.screenshotBlob.size > MAX_WEB_SNAPSHOT_SCREENSHOT_BYTES
  ) {
    throw new Error('Page Package screenshot is invalid or too large.');
  }
  const manifest = parseRequiredManifest(args.payload.manifest);
  if (
    manifest.intent !== 'save' ||
    !manifest.components.some((component) => component.id === 'webCopy')
  ) {
    throw new Error('Saved Page Package profile is invalid.');
  }
  if (
    canonicalManifestText(sanitizeWebSnapshotManifestProvenance(manifest)) !==
    canonicalManifestText(manifest)
  ) {
    throw new Error('Page Package provenance is not sanitized.');
  }
  return manifest;
}

function entryByteLimit(entry: PagePackageEntry): number {
  return entry.mimeType.startsWith('text/') || entry.mimeType === 'application/json'
    ? MAX_PACKAGE_TEXT_ENTRY_BYTES
    : MAX_PACKAGE_ENTRY_BYTES;
}

async function readEntryBytes(entry: ArchiveEntrySource, maxBytes: number): Promise<Uint8Array> {
  if (entry.size < 0 || entry.size > maxBytes) {
    throw new Error(`Page Package entry is too large: ${entry.path}.`);
  }
  const bytes = new Uint8Array(entry.size);
  let offset = 0;
  await entry.pipeTo(
    new WritableStream<Uint8Array>({
      write(chunk) {
        if (offset + chunk.byteLength > bytes.byteLength) {
          throw new Error(`Page Package entry size changed while reading: ${entry.path}.`);
        }
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      },
    })
  );
  if (offset !== bytes.byteLength) {
    throw new Error(`Page Package entry size changed while reading: ${entry.path}.`);
  }
  return bytes;
}

function assertManifestMatchesPayload(
  packageManifest: PagePackageManifest,
  payloadManifest: PagePackageManifest
): void {
  if (canonicalManifestText(packageManifest) !== canonicalManifestText(payloadManifest)) {
    throw new Error('Page Package archive manifest does not match payload manifest.');
  }
}

function assertExactArchiveInventory(args: {
  archiveEntries: readonly { path: string; size: number }[];
  manifest: PagePackageManifest;
}): void {
  const expected = new Map(args.manifest.entries.map((entry) => [entry.path, entry]));
  if (args.archiveEntries.length !== expected.size + 1) {
    throw new Error('Page Package archive inventory does not match its manifest.');
  }
  let totalBytes = 0;
  for (const archiveEntry of args.archiveEntries) {
    totalBytes += archiveEntry.size;
    if (totalBytes > MAX_PACKAGE_TOTAL_INFLATED_BYTES) {
      throw new Error('Page Package inflated content is too large.');
    }
    if (archiveEntry.path === PAGE_PACKAGE_ARCHIVE_PATHS.manifest) continue;
    const declared = expected.get(archiveEntry.path);
    if (!declared || declared.size !== archiveEntry.size) {
      throw new Error('Page Package archive inventory does not match its manifest.');
    }
    expected.delete(archiveEntry.path);
  }
  if (expected.size > 0) {
    throw new Error('Page Package archive inventory does not match its manifest.');
  }
}

async function validateArchiveEntries(args: {
  entriesByPath: Map<string, ArchiveEntrySource>;
  manifest: PagePackageManifest;
  screenshotBlob: Blob;
}): Promise<void> {
  let packageScreenshotBytes: Uint8Array | null = null;
  for (const declared of args.manifest.entries) {
    const archiveEntry = args.entriesByPath.get(declared.path);
    if (!archiveEntry) throw new Error(`Page Package entry is missing: ${declared.path}.`);
    const bytes = await readEntryBytes(archiveEntry, entryByteLimit(declared));
    if ((await hashWebSnapshotAssetBytes(bytes)) !== declared.sha256) {
      throw new Error(`Page Package entry digest does not match: ${declared.path}.`);
    }
    if (declared.path === PAGE_PACKAGE_ARCHIVE_PATHS.screenshot) {
      packageScreenshotBytes = bytes;
    }
  }
  if (!packageScreenshotBytes) throw new Error('Page Package screenshot is missing.');
  await validateRetainedWebSnapshotScreenshot({
    packageBytes: packageScreenshotBytes,
    screenshotBlob: args.screenshotBlob,
  });
}

export async function validateWebSnapshotPackage(args: {
  packageBlob: Blob;
  payload: WebSnapshotSaveToGalleryPayload;
  screenshotBlob: Blob;
}): Promise<void> {
  const payloadManifest = assertPayloadBasics(args);
  const reader = await openArchiveReader(args.packageBlob);
  try {
    const entries = reader.entries();
    if (entries.length > MAX_PACKAGE_FILE_COUNT) {
      throw new Error('Page Package contains too many files.');
    }
    const manifestEntry = reader.entry(PAGE_PACKAGE_ARCHIVE_PATHS.manifest);
    if (!manifestEntry) throw new Error('Page Package manifest is missing.');
    const packageManifest = parseRequiredManifest(
      JSON.parse(await manifestEntry.text(MAX_PACKAGE_MANIFEST_BYTES)) as unknown
    );
    assertManifestMatchesPayload(packageManifest, payloadManifest);
    assertExactArchiveInventory({ archiveEntries: entries, manifest: packageManifest });
    const entriesByPath = new Map(
      entries.flatMap((entry) => {
        const source = reader.entry(entry.path);
        return source ? [[entry.path, source] as const] : [];
      })
    );
    await validateArchiveEntries({
      entriesByPath,
      manifest: packageManifest,
      screenshotBlob: args.screenshotBlob,
    });
  } finally {
    await reader.close();
  }
}
