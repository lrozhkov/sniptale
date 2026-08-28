import {
  PAGE_PACKAGE_ARCHIVE_PATHS,
  parsePagePackageManifest,
  type PagePackageManifest,
} from '@sniptale/runtime-contracts/page-package';
import {
  openArchiveReader,
  type ArchiveEntrySource,
  type ArchiveReader,
} from '../../../../composition/archive-transfer';
import { hashWebSnapshotAssetBytes } from '../../../../features/web-snapshot/asset-manifest';
import type { ComposedPagePackage } from '../../../../workflows/page-package/composer';
import type { ExportResult } from '@sniptale/runtime-contracts/export';
import { sha256 } from '@noble/hashes/sha2.js';

const MAX_MANIFEST_BYTES = 1024 * 1024;

export interface StagedPagePackageDescriptor {
  jobId: string;
  manifestSha256: string;
  manifestSize: number;
  ordinal: number;
  pageId: string;
  producerStats: ExportResult['stats'];
  snapshotSessionId?: string;
  stagedBlobId: string;
  title: string | null;
  totalBytes: number;
}

interface OpenStagedPagePackage {
  pagePackage: ComposedPagePackage<ArchiveEntrySource>;
  reader: ArchiveReader;
}

function assertDescriptorMatchesManifest(
  descriptor: StagedPagePackageDescriptor,
  manifest: PagePackageManifest,
  manifestBytes: Uint8Array,
  manifestSha256: string
): void {
  if (
    descriptor.manifestSize !== manifestBytes.byteLength ||
    descriptor.manifestSha256 !== manifestSha256 ||
    descriptor.pageId !== manifest.id ||
    descriptor.title !== manifest.source.title ||
    descriptor.totalBytes !== manifest.stats.totalBytes + manifestBytes.byteLength
  ) {
    throw new Error('Staged Page Package descriptor does not match its manifest.');
  }
  if (
    (manifest.intent === 'save' && descriptor.snapshotSessionId === undefined) ||
    (manifest.intent === 'export' && descriptor.snapshotSessionId !== undefined)
  ) {
    throw new Error('Staged Page Package descriptor intent authority does not match its manifest.');
  }
}

function digestHex(bytes: Uint8Array): string {
  let value = '';
  for (const byte of bytes) value += byte.toString(16).padStart(2, '0');
  return value;
}

async function assertEntryDigest(
  source: ArchiveEntrySource,
  expectedSha256: string,
  signal: AbortSignal
): Promise<void> {
  signal.throwIfAborted();
  const digest = sha256.create();
  let bytesRead = 0;
  await source.pipeTo(
    new WritableStream<Uint8Array>({
      write(chunk) {
        bytesRead += chunk.byteLength;
        if (!Number.isSafeInteger(bytesRead) || bytesRead > source.size) {
          throw new Error(`Staged Page Package entry size changed: ${source.path}.`);
        }
        digest.update(chunk);
      },
    }),
    signal
  );
  signal.throwIfAborted();
  if (bytesRead !== source.size || digestHex(digest.digest()) !== expectedSha256) {
    throw new Error(`Staged Page Package entry digest does not match: ${source.path}.`);
  }
}

/** Opens and parses a staged Page Package as hostile archive metadata. */
export async function openStagedPagePackage(
  file: File,
  descriptor: StagedPagePackageDescriptor,
  signal: AbortSignal
): Promise<OpenStagedPagePackage> {
  signal.throwIfAborted();
  const reader = await openArchiveReader(file);
  try {
    signal.throwIfAborted();
    const manifestSource = reader.entry(PAGE_PACKAGE_ARCHIVE_PATHS.manifest);
    if (!manifestSource) throw new Error('Staged Page Package manifest is missing.');
    const manifestText = await manifestSource.text(MAX_MANIFEST_BYTES);
    signal.throwIfAborted();
    const manifestBytes = new TextEncoder().encode(manifestText);
    const manifest = parsePagePackageManifest(JSON.parse(manifestText) as unknown);
    if (!manifest) throw new Error('Staged Page Package manifest is invalid.');
    const manifestSha256 = await hashWebSnapshotAssetBytes(manifestBytes);
    assertDescriptorMatchesManifest(descriptor, manifest, manifestBytes, manifestSha256);

    const archiveEntries = reader.entries();
    const expected = new Map(manifest.entries.map((entry) => [entry.path, entry]));
    if (archiveEntries.length !== expected.size + 1) {
      throw new Error('Staged Page Package inventory does not match its manifest.');
    }
    for (const entry of archiveEntries) {
      signal.throwIfAborted();
      if (entry.path === PAGE_PACKAGE_ARCHIVE_PATHS.manifest) continue;
      const declared = expected.get(entry.path);
      if (!declared || declared.size !== entry.size) {
        throw new Error('Staged Page Package inventory does not match its manifest.');
      }
      expected.delete(entry.path);
    }
    if (expected.size > 0) {
      throw new Error('Staged Page Package inventory does not match its manifest.');
    }
    const entries = manifest.entries.map((entry) => {
      signal.throwIfAborted();
      const source = reader.entry(entry.path);
      if (!source) throw new Error(`Staged Page Package entry is missing: ${entry.path}.`);
      return { ...entry, source };
    });
    for (const entry of entries) {
      await assertEntryDigest(entry.source, entry.sha256, signal);
    }
    signal.throwIfAborted();
    return {
      reader,
      pagePackage: {
        entries,
        manifest,
        manifestBytes,
        manifestSha256,
        manifestText,
      },
    };
  } catch (error) {
    await reader.close().catch(() => undefined);
    throw error;
  }
}
