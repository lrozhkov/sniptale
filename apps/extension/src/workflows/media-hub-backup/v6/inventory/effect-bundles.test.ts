import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ integrity: vi.fn(), preferences: vi.fn() }));
vi.mock('../../../../composition/persistence/effect-bundles/integrity', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../composition/persistence/effect-bundles/integrity')
  >()),
  assertEffectBundleCatalogIntegrity: mocks.integrity,
}));

vi.mock(
  '../../../../composition/persistence/effect-bundles/preferences',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../composition/persistence/effect-bundles/preferences')
    >()),
    readEffectCatalogPreferences: mocks.preferences,
  })
);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.preferences.mockResolvedValue([]);
});

import { buildEffectBundleRootInventory } from './effect-bundles';
import { createArchivePathAllocator } from '../../../../composition/archive-transfer';

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
    const roots = await buildEffectBundleRootInventory(
      { getAll: vi.fn().mockResolvedValue([bundle('z-bundle'), bundle('a-bundle')]) },
      createArchivePathAllocator()
    );
    expect(roots.map((root) => root.descriptor.rootId)).toEqual(['a-bundle', 'z-bundle']);
    expect(roots[0]?.descriptor).toMatchObject({
      mediaSubtype: 'effect-bundle',
      objectCount: 1,
      totalBytes: 5,
    });
    await expect(roots[0]?.load()).resolves.toMatchObject({
      objects: [
        {
          ref: expect.objectContaining({
            mimeType: 'image/png',
            path: '_sniptale/assets/effect-bundle-000001-object-000001/asset-000001',
            size: 5,
          }),
        },
      ],
    });
  });
});

it('exports the canonical user preset snapshot without changing source catalog rows', async () => {
  const entry = bundle('resource-pack');
  const original = structuredClone(entry);
  const preferences = {
    presets: [
      { id: 'personal', name: 'Resource personal', values: { accent: '#e020b0', intensity: 0.5 } },
    ],
    defaultPreset: { kind: 'user', id: 'personal' },
  };
  mocks.preferences.mockResolvedValue([
    { packId: entry.packId, documents: { effect: preferences } },
  ]);
  const [root] = await buildEffectBundleRootInventory(
    { getAll: vi.fn().mockResolvedValue([entry]) },
    createArchivePathAllocator()
  );
  const snapshot = await root!.load();
  expect(snapshot.metadata).toMatchObject({
    entry: { documents: [{ id: 'effect', presetPreferences: preferences }] },
  });
  expect(entry).toEqual(original);
  expect(mocks.preferences).toHaveBeenCalledOnce();
});
