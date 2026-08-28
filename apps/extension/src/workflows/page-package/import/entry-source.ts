import type { ArchiveEntrySource } from '../../../composition/archive-transfer';
import { sha256 } from '@noble/hashes/sha2.js';

const HEADER_BYTES = 65_536;

function digestHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function inspectArchiveEntrySource(
  source: ArchiveEntrySource,
  signal?: AbortSignal
): Promise<{ header: Uint8Array; sha256: string }> {
  const digest = sha256.create();
  const header = new Uint8Array(Math.min(source.size, HEADER_BYTES));
  let headerOffset = 0;
  let bytesRead = 0;
  await source.pipeTo(
    new WritableStream<Uint8Array>({
      write(chunk) {
        bytesRead += chunk.byteLength;
        if (!Number.isSafeInteger(bytesRead) || bytesRead > source.size) {
          throw new Error(`Page Package entry exceeded its declared size: ${source.path}.`);
        }
        digest.update(chunk);
        if (headerOffset < header.byteLength) {
          const count = Math.min(header.byteLength - headerOffset, chunk.byteLength);
          header.set(chunk.subarray(0, count), headerOffset);
          headerOffset += count;
        }
      },
    }),
    signal
  );
  if (bytesRead !== source.size) {
    throw new Error(`Page Package entry did not match its declared size: ${source.path}.`);
  }
  return { header, sha256: digestHex(digest.digest()) };
}

export async function readArchiveEntryBlob(
  source: ArchiveEntrySource,
  mimeType: string,
  maxBytes: number,
  signal?: AbortSignal
): Promise<Blob> {
  if (source.size > maxBytes) throw new Error(`Page Package entry is too large: ${source.path}.`);
  const chunks: ArrayBuffer[] = [];
  let bytesRead = 0;
  await source.pipeTo(
    new WritableStream<Uint8Array>({
      write(chunk) {
        bytesRead += chunk.byteLength;
        if (!Number.isSafeInteger(bytesRead) || bytesRead > source.size || bytesRead > maxBytes) {
          throw new Error(`Page Package entry exceeded its byte budget: ${source.path}.`);
        }
        const copy = new Uint8Array(chunk.byteLength);
        copy.set(chunk);
        chunks.push(copy.buffer);
      },
    }),
    signal
  );
  if (bytesRead !== source.size) {
    throw new Error(`Page Package entry did not match its declared size: ${source.path}.`);
  }
  return new Blob(chunks, { type: mimeType });
}
