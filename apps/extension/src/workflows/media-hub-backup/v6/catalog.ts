import type { ArchiveRootDescriptor } from '../../../composition/archive-transfer';
import {
  MAX_CATALOG_SHARD_BYTES,
  MAX_CATALOG_SHARD_ROOTS,
  type ArchiveCentralDirectoryIdentity,
} from './contracts';
import { parseArchiveRootDescriptor } from './codec';

interface EncodedCatalogShard {
  descriptors: ArchiveRootDescriptor[];
  text: string;
}

export function encodeCatalogShards(
  descriptors: Iterable<ArchiveRootDescriptor>
): EncodedCatalogShard[] {
  const encoder = new TextEncoder();
  const shards: EncodedCatalogShard[] = [];
  let current: ArchiveRootDescriptor[] = [];
  let lines: string[] = [];
  let bytes = 0;
  const flush = () => {
    if (current.length === 0) return;
    shards.push({ descriptors: current, text: `${lines.join('\n')}\n` });
    current = [];
    lines = [];
    bytes = 0;
  };
  for (const descriptor of descriptors) {
    const line = JSON.stringify(descriptor);
    const lineBytes = encoder.encode(`${line}\n`).byteLength;
    if (lineBytes > MAX_CATALOG_SHARD_BYTES) {
      throw new Error('Media backup catalog row exceeds its byte budget.');
    }
    if (
      current.length > 0 &&
      (current.length >= MAX_CATALOG_SHARD_ROOTS || bytes + lineBytes > MAX_CATALOG_SHARD_BYTES)
    ) {
      flush();
    }
    current.push(descriptor);
    lines.push(line);
    bytes += lineBytes;
  }
  flush();
  return shards;
}

export function parseCatalog(text: string): ArchiveRootDescriptor[] {
  if (new TextEncoder().encode(text).byteLength > MAX_CATALOG_SHARD_BYTES) {
    throw new Error('Media backup catalog exceeds its byte budget.');
  }
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines.length > MAX_CATALOG_SHARD_ROOTS) {
    throw new Error('Media backup catalog exceeds its root budget.');
  }
  return lines.map((line) => {
    if (line.length === 0) throw new Error('Media backup catalog contains an empty row.');
    try {
      return parseArchiveRootDescriptor(JSON.parse(line) as unknown);
    } catch (error) {
      throw new Error('Media backup catalog row is invalid.', { cause: error });
    }
  });
}

export async function createArchiveFingerprint(args: {
  catalogTexts: readonly string[];
  entries: readonly ArchiveCentralDirectoryIdentity[];
  manifestText: string;
}): Promise<string> {
  if (typeof crypto.subtle?.digest !== 'function') {
    throw new Error('Secure media backup fingerprinting is unavailable.');
  }
  const identity = JSON.stringify({
    catalogs: args.catalogTexts,
    entries: args.entries.map((entry) => [
      entry.path,
      entry.compressedSize,
      entry.size,
      entry.crc32,
    ]),
    manifest: args.manifestText,
  });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
