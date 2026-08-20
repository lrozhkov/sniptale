import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ integrity: vi.fn() }));
vi.mock('../../../../composition/persistence/effect-bundles/integrity', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../composition/persistence/effect-bundles/integrity')
  >()),
  assertEffectBundleCatalogIntegrity: mocks.integrity,
}));

import { buildEffectBundleRootInventory } from './effect-bundles';

function bundle(packId: string) {
  return {
    assets: [
      {
        blob: new Blob(['image'], { type: 'image/png' }),
        byteLength: 5,
        kind: 'image',
        mimeType: 'image/png',
        sha256: 'a'.repeat(64),
      },
    ],
    createdAt: 1,
    description: { en: '', ru: '' },
    documents: [
      {
        assets: [],
        id: 'effect',
        kind: 'standalone',
        schemaVersion: 'sniptale.effect.v1',
        sha256: 'b'.repeat(64),
        source: '{}',
      },
    ],
    enabled: true,
    label: { en: packId, ru: packId },
    packId,
    retainedByteLength: 5,
    source: 'bundle-zip',
    sourceSha256: 'c'.repeat(64),
    updatedAt: 2,
    version: '1',
  };
}

describe('effect bundle v6 inventory', () => {
  it('creates sorted effect-bundle roots with file entries', async () => {
    const roots = await buildEffectBundleRootInventory({
      getAll: vi.fn().mockResolvedValue([bundle('z-bundle'), bundle('a-bundle')]),
    });
    expect(roots.map((root) => root.descriptor.rootId)).toEqual(['a-bundle', 'z-bundle']);
    expect(roots[0]?.descriptor).toMatchObject({
      mediaSubtype: 'effect-bundle',
      objectCount: 1,
      totalBytes: 5,
    });
    await expect(roots[0]?.load()).resolves.toMatchObject({
      objects: [
        {
          ref: expect.objectContaining({ mimeType: 'image/png', size: 5 }),
        },
      ],
    });
  });
});
