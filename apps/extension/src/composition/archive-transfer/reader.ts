import { Reader, TextWriter, ZipReader, type Entry } from '@zip.js/zip.js';
import type { ArchiveEntrySource, ArchiveReader } from './contracts';
import { MAX_MEDIA_ARCHIVE_CENTRAL_DIRECTORY_BYTES } from './contracts';
import { assertSafeArchivePath } from './path';
import {
  admitArchiveEntry,
  assertArchiveFileSize,
  assertArchiveTextSize,
  createArchiveBudget,
} from './profile';

class BoundedArchiveBlobReader extends Reader<Blob> {
  readonly #blob: Blob;

  constructor(blob: Blob) {
    super(blob);
    this.#blob = blob;
    this.size = blob.size;
  }

  async readUint8Array(offset: number, length: number): Promise<Uint8Array> {
    if (
      !Number.isSafeInteger(offset) ||
      !Number.isSafeInteger(length) ||
      offset < 0 ||
      length < 0 ||
      length > MAX_MEDIA_ARCHIVE_CENTRAL_DIRECTORY_BYTES
    ) {
      throw new Error('Media archive central directory exceeds its byte budget.');
    }
    return new Uint8Array(await this.#blob.slice(offset, offset + length).arrayBuffer());
  }
}

export function createBoundedArchiveBlobReader(file: Blob): Reader<Blob> {
  return new BoundedArchiveBlobReader(file);
}

function createEntrySource(entry: Entry): ArchiveEntrySource {
  const size = entry.uncompressedSize;
  return {
    compressedSize: entry.compressedSize,
    directory: entry.directory,
    path: entry.filename,
    size,
    async pipeTo(writable, signal) {
      if (entry.directory || !('getData' in entry)) {
        throw new Error(`Archive entry is not a file: ${entry.filename}.`);
      }
      await entry.getData(writable, {
        checkCrc32: true,
        checkLocalDirectory: true,
        ...(signal ? { signal } : {}),
      });
    },
    async text(maxBytes) {
      assertArchiveTextSize(size, maxBytes);
      if (entry.directory || !('getData' in entry)) {
        throw new Error(`Archive entry is not readable: ${entry.filename}.`);
      }
      return entry.getData(new TextWriter(), {
        checkCrc32: true,
        checkLocalDirectory: true,
      });
    },
  };
}

export async function openArchiveReader(file: Blob): Promise<ArchiveReader> {
  assertArchiveFileSize(file.size);
  const zip = new ZipReader(createBoundedArchiveBlobReader(file), {
    checkAmbiguity: true,
    checkCrc32: true,
    strictness: 'strict',
  });
  try {
    const budget = createArchiveBudget();
    const entries = new Map<string, ArchiveEntrySource>();
    for await (const rawEntry of zip.getEntriesGenerator({ checkAmbiguity: true })) {
      if (rawEntry.directory) throw new Error('Media archive directory entries are not supported.');
      assertSafeArchivePath(rawEntry.filename);
      if (entries.has(rawEntry.filename)) {
        throw new Error(`Duplicate media archive path: ${rawEntry.filename}.`);
      }
      admitArchiveEntry(budget, rawEntry.uncompressedSize);
      entries.set(rawEntry.filename, createEntrySource(rawEntry));
    }
    return {
      entries: () => Array.from(entries.values()),
      entry: (path) => entries.get(path) ?? null,
      close: () => zip.close(),
    };
  } catch (error) {
    await zip.close().catch(() => undefined);
    throw error;
  }
}
