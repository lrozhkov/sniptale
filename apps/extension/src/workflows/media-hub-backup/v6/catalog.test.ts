import { describe, expect, it } from 'vitest';
import type { ArchiveRootDescriptor } from '../../../composition/archive-transfer';
import { createArchiveFingerprint, encodeCatalogShards, parseCatalog } from './catalog';

function descriptor(index: number): ArchiveRootDescriptor {
  return {
    mediaSubtype: 'library-item',
    metadataPath: `_sniptale/metadata/media/media-${index}.json`,
    objectCount: 1,
    rootId: `media-${index}`,
    rootKind: 'media',
    totalBytes: index,
  };
}

describe('media backup v6 catalogs', () => {
  it('shards deterministically and parses line-by-line descriptors', () => {
    const roots = Array.from({ length: 1_001 }, (_, index) => descriptor(index));
    const shards = encodeCatalogShards(roots);
    expect(shards).toHaveLength(2);
    expect(shards[0]?.descriptors).toHaveLength(1_000);
    expect(shards[1]?.descriptors).toHaveLength(1);
    expect(shards.flatMap((shard) => parseCatalog(shard.text))).toEqual(roots);
  });

  it('rejects empty and malformed NDJSON rows', () => {
    expect(() => parseCatalog(`${JSON.stringify(descriptor(1))}\n\n`)).toThrow('empty row');
    expect(() => parseCatalog('{"rootKind":"unknown"}\n')).toThrow('row is invalid');
  });

  it('binds the fingerprint to CRC and ordered central-directory identity', async () => {
    const base = {
      catalogTexts: [`${JSON.stringify(descriptor(1))}\n`],
      entries: [
        {
          compressedSize: 10,
          crc32: 123,
          path: '_sniptale/manifest.json',
          size: 20,
        },
      ],
      manifestText: '{"version":6}',
    };
    const fingerprint = await createArchiveFingerprint(base);
    await expect(
      createArchiveFingerprint({
        ...base,
        entries: [{ ...base.entries[0]!, crc32: 124 }],
      })
    ).resolves.not.toBe(fingerprint);
  });
});
