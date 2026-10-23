import { readFileSync } from 'node:fs';
import { importRawEffectDocument } from '../../../../features/video/project/effect-bundle/import/zip';
import { createEffectCatalogEntry } from '../../../../composition/persistence/effect-bundles/catalog-builder';
import { putEffectBundleBackupRestore } from '../../../../composition/persistence/effect-bundles/backup-restore';
import { createArchivePathAllocator } from '../../../../composition/archive-transfer';
import { buildEffectBundleRootInventory } from '../inventory/effect-bundles';
import { encodeBackupMetadata } from '../metadata-transport';
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

it('retains a valid catalog document without binary assets through backup and restore', async () => {
  const imported = await importRawEffectDocument(
    new Uint8Array(
      readFileSync(
        'packages/runtime-contracts/src/effect-v1/fixtures/valid/neutral-transition.sniptale-effect.json'
      )
    )
  );
  if (!imported.ok) throw new Error('Invalid asset-free transition fixture');
  const catalog = await createEffectCatalogEntry(
    { kind: 'raw-json', document: imported.artifact },
    1
  );
  expect(catalog.assets).toEqual([]);
  const [root] = await buildEffectBundleRootInventory(
    { getAll: async () => [catalog] },
    createArchivePathAllocator()
  );
  expect(root!.descriptor.objectCount).toBe(0);
  await expect(encodeBackupMetadata(root!, 1)).resolves.toBeDefined();
  const encoded = encodeEffectBundleMetadata({ entry: catalog, objectIds: [] });
  const decoded = parseEffectBundleMetadata(encoded);
  expect(decoded).toEqual(encoded);
  const { assets, ...restoredEntry } = decoded.entry;
  expect(assets).toEqual([]);
  const rows = new Map<string, unknown>();
  const store = {
    get: async (id: string) => rows.get(id),
    put: async (value: typeof catalog) => {
      rows.set(value.packId, value);
    },
  };
  await expect(
    putEffectBundleBackupRestore({ assets: [], entry: restoredEntry, store, strategy: 'replace' })
  ).resolves.toMatchObject({ imported: true, packId: catalog.packId });
  expect(rows.get(catalog.packId)).toEqual(catalog);
  await expect(
    putEffectBundleBackupRestore({
      assets: [],
      entry: {
        ...restoredEntry,
        documents: restoredEntry.documents.map((document) => ({ ...document, source: '{}' })),
      },
      store,
      strategy: 'replace',
    })
  ).rejects.toMatchObject({ code: 'catalogIntegrityFailure' });
  expect(rows.get(catalog.packId)).toEqual(catalog);
  expect(() => parseEffectBundleMetadata({ entry: { ...encoded.entry, documents: [] } })).toThrow(
    'catalog metadata'
  );
});
