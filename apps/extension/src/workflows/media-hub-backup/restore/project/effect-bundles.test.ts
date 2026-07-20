import JSZip from 'jszip';
import { beforeEach, expect, it, vi } from 'vitest';

import {
  EFFECT_BUNDLE_CORPUS,
  readEffectBundleCorpusArchive,
} from '../../../../../../../tooling/test/support/effect-v1-corpus.test-support';
import { importEffectBundleZip } from '../../../../features/video/project/effect-bundle/import/zip';
import { createEffectCatalogEntry } from '../../../../composition/persistence/effect-bundles/catalog-builder';
import { assertEffectBundleCatalogIntegrity } from '../../../../composition/persistence/effect-bundles/integrity';
import type { EffectBundleCatalogEntry } from '../../../../features/video/project/effect-bundle/catalog';
import type { EffectBundleBackupDescriptor, MediaHubBackupMetadata } from '../../contracts/types';
import type { getStore } from '../../storage';
import { assertPreparedProjectBlobsAvailable } from './preflight';
import { restorePreparedEffectBundlesInTransaction } from './effect-bundle-writer';

const { getEffectBundleMock, listEffectBundlesMock } = vi.hoisted(() => ({
  getEffectBundleMock: vi.fn(),
  listEffectBundlesMock: vi.fn(),
}));

type BackupTransaction = Parameters<typeof getStore>[0];

vi.mock('../../../../composition/persistence/effect-bundles', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/effect-bundles')>()),
  getEffectBundle: getEffectBundleMock,
  listEffectBundles: listEffectBundlesMock,
}));

beforeEach(() => {
  getEffectBundleMock.mockReset().mockResolvedValue(null);
  listEffectBundlesMock.mockReset().mockResolvedValue([]);
});

it('prepares, revalidates, and writes a complete catalog entry through one transaction store', async () => {
  const { descriptor, entry, zip } = await createBackupFixture();
  const { prepareProjectDomains } = await import('./prepare');
  const prepared = await prepareProjectDomains({
    metadata: createMetadata(descriptor),
    strategy: 'replace',
  });

  await assertPreparedProjectBlobsAvailable(prepared, zip);
  const put = vi.fn();
  const store = {
    delete: vi.fn(),
    get: vi.fn(),
    index: vi.fn(() => ({ getAll: vi.fn(async () => []) })),
    put,
  };
  const tx: BackupTransaction = { objectStore: vi.fn(() => store) };
  await expect(restorePreparedEffectBundlesInTransaction(tx, prepared.effectBundles)).resolves.toBe(
    1
  );

  expect(tx.objectStore).toHaveBeenCalledWith('video_effect_bundles');
  expect(put).toHaveBeenCalledWith(
    expect.objectContaining({ assets: expect.any(Array), packId: entry.packId })
  );
  await expect(
    assertEffectBundleCatalogIntegrity(put.mock.calls[0]![0] as EffectBundleCatalogEntry)
  ).resolves.toBeUndefined();
});

it('rejects tampered catalog asset bytes before opening the write phase', async () => {
  const { descriptor, zip } = await createBackupFixture();
  const assetPath = descriptor.assets[0]!.blobPath;
  zip.file(assetPath, Uint8Array.of(1, 2, 3));
  const { prepareProjectDomains } = await import('./prepare');
  const prepared = await prepareProjectDomains({
    metadata: createMetadata(descriptor),
    strategy: 'replace',
  });

  await expect(assertPreparedProjectBlobsAvailable(prepared, zip)).rejects.toThrow();
  expect(prepared.effectBundles[0]!.restoredEntry).toBeUndefined();
});

it('applies skip, replace, and duplicate conflict strategies without blind overwrite', async () => {
  const { descriptor, entry } = await createBackupFixture();
  getEffectBundleMock.mockResolvedValue(entry);
  listEffectBundlesMock.mockResolvedValue([
    {
      createdAt: entry.createdAt,
      documentKinds: entry.documents.map(({ kind }) => kind),
      enabled: entry.enabled,
      label: entry.label,
      packId: entry.packId,
      retainedByteLength: entry.retainedByteLength,
      source: entry.source,
      status: 'ready',
      updatedAt: entry.updatedAt,
      version: entry.version,
    },
  ]);
  const { prepareProjectDomains } = await import('./prepare');

  await expect(
    prepareProjectDomains({ metadata: createMetadata(descriptor), strategy: 'skip' })
  ).resolves.toMatchObject({ effectBundles: [], skipped: 1 });
  await expect(
    prepareProjectDomains({ metadata: createMetadata(descriptor), strategy: 'replace' })
  ).resolves.toMatchObject({
    conflictsResolved: 1,
    effectBundles: [expect.objectContaining({ packId: entry.packId, replace: true })],
  });
  vi.stubGlobal('crypto', { randomUUID: () => '11111111-2222-3333-4444-555555555555' });
  await expect(
    prepareProjectDomains({ metadata: createMetadata(descriptor), strategy: 'duplicate' })
  ).resolves.toMatchObject({
    conflictsResolved: 1,
    effectBundles: [
      expect.objectContaining({ packId: expect.stringMatching(/^backup\.[a-f0-9]{12}\./u) }),
    ],
  });
  vi.unstubAllGlobals();
});

function createMetadata(descriptor: EffectBundleBackupDescriptor): MediaHubBackupMetadata {
  return { assets: [], effectBundles: [descriptor], scenarioProjects: [], videoProjects: [] };
}

async function createBackupFixture() {
  const entry = await createCatalogEntry();
  const { assets, ...entryWithoutAssets } = entry;
  const zip = new JSZip();
  const descriptor: EffectBundleBackupDescriptor = {
    assets: await Promise.all(
      assets.map(async (asset, index) => {
        const path = `effect-bundles/${entry.packId}/assets/${index}-${asset.sha256}`;
        zip.file(path, new Uint8Array(await asset.blob.arrayBuffer()));
        const { blob: _blob, ...assetEntry } = asset;
        return { blobPath: path, entry: assetEntry };
      })
    ),
    entry: entryWithoutAssets,
  };
  return { descriptor, entry, zip };
}

async function createCatalogEntry() {
  const testCase = EFFECT_BUNDLE_CORPUS.find(({ artifact }) =>
    artifact.endsWith('/asset-bearing-conformance.sniptale-bundle.zip')
  )!;
  const imported = await importEffectBundleZip(readEffectBundleCorpusArchive(testCase));
  if (!imported.ok) throw new Error('Expected locked bundle fixture to import');
  return createEffectCatalogEntry({ bundle: imported.bundle, kind: 'bundle-zip' }, 1234);
}
