import { describe, expect, it } from 'vitest';
import { encodeEffectBundleMetadata, parseEffectBundleMetadata } from './effect-bundle';

const entry = {
  assets: [
    {
      blob: new Blob(['image'], { type: 'image/png' }),
      byteLength: 5,
      kind: 'image' as const,
      mimeType: 'image/png',
      sha256: 'a'.repeat(64),
    },
  ],
  createdAt: 1,
  description: { en: '', ru: '' },
  documents: [
    {
      assets: [{ id: 'image', sha256: 'a'.repeat(64) }],
      id: 'effect',
      kind: 'standalone' as const,
      schemaVersion: 'sniptale.effect.v1' as const,
      sha256: 'b'.repeat(64),
      source: '{}',
    },
  ],
  enabled: true,
  label: { en: 'Bundle', ru: 'Набор' },
  packId: 'bundle-one',
  retainedByteLength: 5,
  source: 'bundle-zip' as const,
  sourceSha256: 'c'.repeat(64),
  updatedAt: 2,
  version: '1',
};

describe('effect bundle v6 root codec', () => {
  it('replaces every Blob with a portable object reference', () => {
    const encoded = encodeEffectBundleMetadata({ entry, objectIds: ['object-1'] });
    expect(encoded.entry.assets).toEqual([
      expect.objectContaining({ objectId: 'object-1', byteLength: 5 }),
    ]);
    expect(JSON.stringify(encoded)).not.toContain('blob');
    expect(parseEffectBundleMetadata(encoded)).toEqual(encoded);
  });

  it('rejects missing object identities and invalid catalog metadata', () => {
    expect(() => encodeEffectBundleMetadata({ entry, objectIds: [] })).toThrow('incomplete');
    const encoded = encodeEffectBundleMetadata({ entry, objectIds: ['object-1'] });
    expect(() =>
      parseEffectBundleMetadata({
        ...encoded,
        entry: { ...encoded.entry, assets: [{ ...encoded.entry.assets[0]!, objectId: '' }] },
      })
    ).toThrow('asset metadata');
  });
});
