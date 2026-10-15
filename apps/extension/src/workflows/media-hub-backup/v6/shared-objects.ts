import { sha256 } from '@noble/hashes/sha2.js';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  assertSafeArchivePath,
  MAX_MEDIA_ARCHIVE_ENTRIES,
  MAX_MEDIA_ARCHIVE_INFLATED_BYTES,
  type ArchiveEntrySource,
  type ArchiveReader,
} from '../../../composition/archive-transfer';
import type { MediaHubBackupSharedObject } from './contracts';

const MIME = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/;

/** The table names physical direct entries; it never resolves another shared reference. */
export function parseBackupSharedObjects(value: unknown): MediaHubBackupSharedObject[] {
  if (!Array.isArray(value) || value.length > MAX_MEDIA_ARCHIVE_ENTRIES)
    throw new Error('Media backup shared object table is invalid.');
  const ids = new Set<string>();
  const paths = new Set<string>();
  return value.map((raw) => {
    if (
      !isRecord(raw) ||
      Object.keys(raw).length !== 5 ||
      typeof raw['id'] !== 'string' ||
      !raw['id'] ||
      raw['id'].length > 160 ||
      typeof raw['path'] !== 'string' ||
      typeof raw['sha256'] !== 'string' ||
      !/^[a-f0-9]{64}$/.test(raw['sha256']) ||
      typeof raw['mimeType'] !== 'string' ||
      !MIME.test(raw['mimeType']) ||
      typeof raw['size'] !== 'number' ||
      !Number.isSafeInteger(raw['size']) ||
      raw['size'] < 0 ||
      raw['size'] > MAX_MEDIA_ARCHIVE_INFLATED_BYTES
    )
      throw new Error('Media backup shared object is invalid.');
    assertSafeArchivePath(raw['path']);
    const pathKey = raw['path'].toLocaleLowerCase('en-US');
    if (ids.has(raw['id']) || paths.has(pathKey))
      throw new Error('Media backup shared object table contains duplicates.');
    ids.add(raw['id']);
    paths.add(pathKey);
    return {
      id: raw['id'],
      path: raw['path'],
      sha256: raw['sha256'],
      mimeType: raw['mimeType'],
      size: raw['size'],
    };
  });
}

/** Hash actual bytes in bounded chunks; metadata hashes alone never authorize reuse. */
export async function digestBackupObject(
  source: Pick<ArchiveEntrySource, 'size' | 'pipeTo'>,
  signal?: AbortSignal
): Promise<string> {
  const digest = sha256.create();
  let bytes = 0;
  await source.pipeTo(
    new WritableStream<Uint8Array>({
      write(chunk) {
        bytes += chunk.byteLength;
        if (!Number.isSafeInteger(bytes) || bytes > source.size)
          throw new Error('Media backup shared object exceeds its declared size.');
        digest.update(chunk);
      },
    }),
    signal
  );
  if (bytes !== source.size) throw new Error('Media backup shared object size does not match.');
  return Array.from(digest.digest(), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Inspection verifies every physical shared entry once, before any root staging. */
export async function verifyBackupSharedObjects(
  reader: ArchiveReader,
  objects: readonly MediaHubBackupSharedObject[]
): Promise<void> {
  for (const object of objects) {
    const entry = reader.entry(object.path);
    if (!entry || entry.size !== object.size || (await digestBackupObject(entry)) !== object.sha256)
      throw new Error('Media backup shared object digest or size does not match.');
  }
}
