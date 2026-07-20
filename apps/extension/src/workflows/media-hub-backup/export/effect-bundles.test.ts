import { expect, it, vi } from 'vitest';

import {
  EFFECT_BUNDLE_CORPUS,
  readEffectBundleCorpusArchive,
} from '../../../../../../tooling/test/support/effect-v1-corpus.test-support';
import { importEffectBundleZip } from '../../../features/video/project/effect-bundle/import/zip';
import { createEffectCatalogEntry } from '../../../composition/persistence/effect-bundles/catalog-builder';
import { createBackupExportBudget } from './blob/budget';
import { buildEffectBundleDescriptors } from './effect-bundles';

it('exports only revalidated catalog authority with separately retained asset blobs', async () => {
  const entry = await createCatalogEntry();
  const zip = { file: vi.fn() };
  const descriptors = await buildEffectBundleDescriptors({
    budget: createBackupExportBudget(),
    db: { getAll: async () => [entry] },
    zip,
  });

  expect(descriptors).toEqual([
    expect.objectContaining({
      assets: [
        expect.objectContaining({
          blobPath: expect.stringMatching(
            /^effect-bundles\/sniptale\.effect-v1\.conformance\/assets\/0-[a-f0-9]{64}$/u
          ),
        }),
      ],
      entry: expect.objectContaining({ packId: 'sniptale.effect-v1.conformance' }),
    }),
  ]);
  expect(zip.file).toHaveBeenCalledWith(descriptors[0]!.assets[0]!.blobPath, entry.assets[0]!.blob);
  expect(descriptors[0]!.entry).not.toHaveProperty('assets');
});

it('fails export instead of silently omitting a malformed catalog row', async () => {
  await expect(
    buildEffectBundleDescriptors({
      budget: createBackupExportBudget(),
      db: { getAll: async () => [{ packId: 'broken' }] },
      zip: { file: vi.fn() },
    })
  ).rejects.toThrow('EffectV1 catalog backup source is invalid.');
});

async function createCatalogEntry() {
  const testCase = EFFECT_BUNDLE_CORPUS.find(({ artifact }) =>
    artifact.endsWith('/asset-bearing-conformance.sniptale-bundle.zip')
  )!;
  const imported = await importEffectBundleZip(readEffectBundleCorpusArchive(testCase));
  if (!imported.ok) throw new Error('Expected locked bundle fixture to import');
  return createEffectCatalogEntry({ bundle: imported.bundle, kind: 'bundle-zip' }, 1234);
}
