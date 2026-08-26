import {
  BlobReader,
  BlobWriter,
  TextReader,
  TextWriter,
  ZipReader,
  ZipWriter,
  type Entry,
  type FileEntry,
} from '@zip.js/zip.js';
import type { WebSnapshotManifest } from '@sniptale/runtime-contracts/web-snapshot';
import { sanitizeProvenanceUrl } from '@sniptale/platform/security/provenance-url';
import {
  assertSafeWebSnapshotPackagePath,
  isWebSnapshotManifest,
  parseWebSnapshotManifestJson,
  WEB_SNAPSHOT_PACKAGE_PATHS,
} from './manifest';

const MAX_WEB_SNAPSHOT_PACKAGE_BYTES = 100 * 1024 * 1024;
const MAX_WEB_SNAPSHOT_PACKAGE_FILE_COUNT = 500;
const MAX_WEB_SNAPSHOT_PACKAGE_INFLATED_BYTES = 250 * 1024 * 1024;
const MAX_WEB_SNAPSHOT_PACKAGE_ENTRY_BYTES = 25 * 1024 * 1024;
const MAX_WEB_SNAPSHOT_MANIFEST_BYTES = 1024 * 1024;

interface SanitizedWebSnapshotPackage {
  changed: boolean;
  manifest: WebSnapshotManifest;
  packageBlob: Blob;
  size: number;
}

interface WebSnapshotPackageProvenanceOptions {
  includeSourceMetadata?: boolean;
  maxPackageBytes?: number;
  requireManifestMatch?: boolean;
}

interface OpenWebSnapshotPackage {
  entries: Entry[];
  reader: ZipReader<Blob>;
}

function requireReadableEntry(entry: Entry): asserts entry is FileEntry {
  if (entry.directory || !('getData' in entry)) {
    throw new Error(`Web snapshot package entry is not readable: ${entry.filename}.`);
  }
}

async function readEntryBlob(entry: Entry, mimeType: string): Promise<Blob> {
  requireReadableEntry(entry);
  return entry.getData(new BlobWriter(mimeType), {
    checkCrc32: true,
    checkLocalDirectory: true,
  });
}

export function sanitizeWebSnapshotManifestProvenance(
  manifest: WebSnapshotManifest,
  options: WebSnapshotPackageProvenanceOptions = {}
): WebSnapshotManifest {
  if (options.includeSourceMetadata === false) {
    return {
      ...manifest,
      source: {
        ...manifest.source,
        faviconUrl: null,
        title: null,
        url: null,
      },
    };
  }

  return {
    ...manifest,
    source: {
      ...manifest.source,
      faviconUrl: sanitizeProvenanceUrl(manifest.source.faviconUrl),
      url: sanitizeProvenanceUrl(manifest.source.url),
    },
  };
}

export async function sanitizeWebSnapshotPackageProvenance(
  packageBlob: Blob,
  manifestOverride?: WebSnapshotManifest,
  options: WebSnapshotPackageProvenanceOptions = {}
): Promise<SanitizedWebSnapshotPackage> {
  const maxPackageBytes = options.maxPackageBytes ?? MAX_WEB_SNAPSHOT_PACKAGE_BYTES;
  const opened = await openWebSnapshotPackage(packageBlob, maxPackageBytes);
  try {
    const packageManifest = await readWebSnapshotPackageManifest(opened.entries);
    if (options.requireManifestMatch && manifestOverride) {
      const normalizedPackage = withPackageSize(
        sanitizeWebSnapshotManifestProvenance(packageManifest, options),
        packageBlob.size
      );
      const normalizedOverride = withPackageSize(
        sanitizeWebSnapshotManifestProvenance(manifestOverride, options),
        packageBlob.size
      );
      if (JSON.stringify(normalizedPackage) !== JSON.stringify(normalizedOverride)) {
        throw new Error('Web snapshot package manifest does not match archive metadata.');
      }
    }
    const outputManifest = sanitizeWebSnapshotManifestProvenance(
      manifestOverride ?? packageManifest,
      options
    );
    const packageOutputManifest = sanitizeWebSnapshotManifestProvenance(
      applyProvenanceOverride(packageManifest, manifestOverride),
      options
    );
    const normalizedPackageManifest = withPackageSize(packageOutputManifest, packageBlob.size);
    const normalizedOutputManifest = withPackageSize(outputManifest, packageBlob.size);
    const manifestChanged =
      JSON.stringify(packageManifest) !== JSON.stringify(normalizedPackageManifest);

    if (!manifestChanged) {
      return {
        changed: false,
        manifest: normalizedOutputManifest,
        packageBlob,
        size: packageBlob.size,
      };
    }

    const sanitized = await generatePackageWithManifest(
      opened.entries,
      normalizedPackageManifest,
      maxPackageBytes
    );
    return {
      changed: true,
      manifest: withPackageSize(outputManifest, sanitized.packageBlob.size),
      packageBlob: sanitized.packageBlob,
      size: sanitized.packageBlob.size,
    };
  } finally {
    await opened.reader.close();
  }
}

export async function readWebSnapshotPackageScreenshotBytes(
  packageBlob: Blob
): Promise<Uint8Array> {
  const opened = await openWebSnapshotPackage(packageBlob, MAX_WEB_SNAPSHOT_PACKAGE_BYTES);
  try {
    const screenshot = opened.entries.find(
      (entry) => !entry.directory && entry.filename === WEB_SNAPSHOT_PACKAGE_PATHS.screenshot
    );
    if (!screenshot) throw new Error('Web snapshot package is missing screenshot.');
    const blob = await readEntryBlob(screenshot, 'application/octet-stream');
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    await opened.reader.close();
  }
}

function applyProvenanceOverride(
  packageManifest: WebSnapshotManifest,
  manifestOverride: WebSnapshotManifest | undefined
): WebSnapshotManifest {
  if (!manifestOverride) return packageManifest;
  return {
    ...packageManifest,
    source: {
      ...packageManifest.source,
      faviconUrl: manifestOverride.source.faviconUrl,
      url: manifestOverride.source.url,
    },
  };
}

function entryMaxBytes(entryPath: string): number {
  return entryPath === WEB_SNAPSHOT_PACKAGE_PATHS.manifest
    ? MAX_WEB_SNAPSHOT_MANIFEST_BYTES
    : MAX_WEB_SNAPSHOT_PACKAGE_ENTRY_BYTES;
}

function assertSafeDirectoryPath(path: string): void {
  if (
    path.startsWith('/') ||
    path.includes('\\') ||
    path.split('/').some((segment) => segment === '..' || segment === '.' || segment === '')
  ) {
    throw new Error('Web snapshot package contains an unsafe path.');
  }
}

async function openWebSnapshotPackage(
  packageBlob: Blob,
  maxPackageBytes: number
): Promise<OpenWebSnapshotPackage> {
  if (packageBlob.size > maxPackageBytes) throw new Error('Web snapshot package is too large.');
  const reader = new ZipReader(new BlobReader(packageBlob), {
    checkAmbiguity: true,
    checkCrc32: true,
    strictness: 'strict',
  });
  try {
    const entries: Entry[] = [];
    const paths = new Set<string>();
    let inflatedBytes = 0;
    for await (const entry of reader.getEntriesGenerator({ checkAmbiguity: true })) {
      if (entry.encrypted || entry.symlink) {
        throw new Error('Web snapshot package contains an unsupported entry.');
      }
      const validatedPath = entry.directory ? entry.filename.replace(/\/$/u, '') : entry.filename;
      if (entry.directory) {
        assertSafeDirectoryPath(validatedPath);
        continue;
      }
      assertSafeWebSnapshotPackagePath(validatedPath);
      const canonicalPath = entry.filename.toLocaleLowerCase('en-US');
      if (paths.has(canonicalPath)) {
        throw new Error(`Web snapshot package contains a duplicate path: ${entry.filename}.`);
      }
      if (entry.uncompressedSize > entryMaxBytes(entry.filename)) {
        throw new Error(
          entry.filename === WEB_SNAPSHOT_PACKAGE_PATHS.manifest
            ? 'Web snapshot package manifest is too large.'
            : 'Web snapshot package entry is too large.'
        );
      }
      inflatedBytes += entry.uncompressedSize;
      if (inflatedBytes > MAX_WEB_SNAPSHOT_PACKAGE_INFLATED_BYTES) {
        throw new Error('Web snapshot package inflated size is too large.');
      }
      paths.add(canonicalPath);
      entries.push(entry);
      if (entries.length > MAX_WEB_SNAPSHOT_PACKAGE_FILE_COUNT) {
        throw new Error('Web snapshot package has too many files.');
      }
    }
    return { entries, reader };
  } catch (error) {
    await reader.close().catch(() => undefined);
    throw error;
  }
}

async function generatePackageWithManifest(
  entries: readonly Entry[],
  manifest: WebSnapshotManifest,
  maxPackageBytes: number
): Promise<{ manifest: WebSnapshotManifest; packageBlob: Blob }> {
  let nextManifest = manifest;
  let packageBlob = await writePackage(entries, nextManifest, maxPackageBytes);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const sizedManifest = withPackageSize(nextManifest, packageBlob.size);
    if (JSON.stringify(sizedManifest) === JSON.stringify(nextManifest)) {
      return { manifest: nextManifest, packageBlob };
    }
    nextManifest = sizedManifest;
    packageBlob = await writePackage(entries, nextManifest, maxPackageBytes);
  }
  throw new Error('Web snapshot package manifest size did not stabilize.');
}

async function writePackage(
  entries: readonly Entry[],
  manifest: WebSnapshotManifest,
  maxPackageBytes: number
): Promise<Blob> {
  const output = new BlobWriter('application/zip');
  const writer = new ZipWriter(output, { bufferedWrite: false, useWebWorkers: false });
  try {
    for (const entry of entries) {
      if (entry.filename === WEB_SNAPSHOT_PACKAGE_PATHS.manifest) {
        await writer.add(entry.filename, new TextReader(JSON.stringify(manifest, null, 2)), {
          bufferedWrite: false,
          level: 0,
          useWebWorkers: false,
        });
        continue;
      }
      const blob = await readEntryBlob(entry, 'application/octet-stream');
      await writer.add(entry.filename, new BlobReader(blob), {
        bufferedWrite: false,
        level: entry.compressionMethod === 0 ? 0 : 6,
        useWebWorkers: false,
      });
    }
    const packageBlob = await writer.close();
    if (packageBlob.size > maxPackageBytes) throw new Error('Web snapshot package is too large.');
    return packageBlob;
  } catch (error) {
    await writer.close().catch(() => undefined);
    throw error;
  }
}

function withPackageSize(manifest: WebSnapshotManifest, packageSize: number): WebSnapshotManifest {
  return { ...manifest, stats: { ...manifest.stats, packageSize } };
}

async function readWebSnapshotPackageManifest(
  entries: readonly Entry[]
): Promise<WebSnapshotManifest> {
  const manifestEntry = entries.find(
    (entry) => entry.filename === WEB_SNAPSHOT_PACKAGE_PATHS.manifest
  );
  if (!manifestEntry) throw new Error('Web snapshot package manifest is missing.');
  requireReadableEntry(manifestEntry);
  const text = await manifestEntry.getData(new TextWriter(), {
    checkCrc32: true,
    checkLocalDirectory: true,
  });
  const manifest = parseWebSnapshotManifestJson(text);
  if (!isWebSnapshotManifest(manifest))
    throw new Error('Web snapshot package manifest is invalid.');
  return manifest;
}
