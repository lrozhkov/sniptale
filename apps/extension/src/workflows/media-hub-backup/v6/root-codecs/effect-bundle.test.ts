import { assertMetadataJson } from '../codec';
import { expect, it } from 'vitest';
import {
  readValidAnimationSourceEntry,
  createValidGlPresetSourceEntry,
} from '../../../../composition/persistence/effect-bundles/fixture.test-support';
import {
  encodeEffectBundleMetadata,
  parseEffectBundleMetadata,
  visualCatalogMetadataRootId,
} from './effect-bundle';
it(
  'encodes exact bounded source roles without source bytes or ' +
    'catalogue preference duplication in resource metadata',
  async () => {
    const entry = await readValidAnimationSourceEntry(),
      encoded = encodeEffectBundleMetadata({
        entry,
        objectIds: entry.documents.map((_, i) => `source-${i}`),
      });
    expect(encoded.kind).toBe('animation');
    if (encoded.kind !== 'animation') throw Error('Wrong kind');
    expect(visualCatalogMetadataRootId(encoded)).toBe(`animation:${entry.packId}`);
    expect(encoded.entry.documents[0]).toEqual({
      id: entry.documents[0]!.id,
      sha256: entry.documents[0]!.sha256,
      byteLength: new TextEncoder().encode(entry.documents[0]!.source).byteLength,
      objectId: 'source-0',
    });
    expect(JSON.stringify(encoded)).not.toContain(entry.documents[0]!.source);
    expect(parseEffectBundleMetadata(JSON.parse(JSON.stringify(encoded)))).toEqual(encoded);
  }
);
it('retains GL pinned source identity and refuses shader fields and source bytes in the header', () => {
  const entry = createValidGlPresetSourceEntry('Future', '99.0.0'),
    encoded = encodeEffectBundleMetadata({ entry, objectIds: ['source'] });
  expect(visualCatalogMetadataRootId(encoded)).toBe(`transition:${entry.id}`);
  expect(() =>
    parseEffectBundleMetadata({ ...encoded, entry: { ...encoded.entry, source: entry.source } })
  ).toThrow();
  expect(() => parseEffectBundleMetadata({ ...encoded, shader: 'untrusted' })).toThrow();
  expect(() =>
    parseEffectBundleMetadata({
      ...encoded,
      entry: { ...encoded.entry, id: `gl.${'0'.repeat(64)}` },
    })
  ).toThrow();
});
it(
  'refuses legacy metadata, incomplete inventories, wrong preference ' +
    'identities and duplicate document roles',
  async () => {
    const entry = await readValidAnimationSourceEntry();
    expect(() => encodeEffectBundleMetadata({ entry, objectIds: [] })).toThrow();
    expect(() =>
      parseEffectBundleMetadata({
        entry: { packId: 'legacy', documents: [{}], version: '1', assets: [] },
      })
    ).toThrow();
    const metadata = encodeEffectBundleMetadata({ entry, objectIds: ['source'] });
    expect(() =>
      parseEffectBundleMetadata({
        ...metadata,
        preference: {
          format: 'sniptale-visual-preferences',
          version: 1,
          kind: 'transition',
          packId: entry.packId,
          documents: {},
        },
      })
    ).toThrow();
    if (metadata.kind !== 'animation') throw Error('Wrong kind');
    expect(() =>
      parseEffectBundleMetadata({
        ...metadata,
        entry: {
          ...metadata.entry,
          documents: [...metadata.entry.documents, ...metadata.entry.documents],
          retainedByteLength: 2 * metadata.entry.retainedByteLength,
        },
      })
    ).toThrow();
  }
);

it(
  'retains valid unavailable preference references named assetId ' +
    'without violating typed archive metadata',
  async () => {
    const entry = await readValidAnimationSourceEntry(),
      preference = {
        format: 'sniptale-visual-preferences' as const,
        version: 1 as const,
        kind: 'animation' as const,
        packId: entry.packId,
        documents: { assetId: { sourceSha256: 'a'.repeat(64), enabled: false } },
      };
    const wire = encodeEffectBundleMetadata({ entry, objectIds: ['source'], preference });
    expect(() => assertMetadataJson(wire)).not.toThrow();
    expect(parseEffectBundleMetadata(wire).preference).toEqual(preference);
  }
);
