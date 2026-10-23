import {
  EFFECT_BUNDLE_CORPUS,
  readEffectBundleCorpusArchive,
} from '../../../../../../tooling/test/support/effect-v1-corpus.test-support';
import { importEffectBundleZip } from '../../../features/video/project/effect-bundle/import/zip';
import { createEffectCatalogEntry } from './catalog-builder';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ integrity: vi.fn() }));
vi.mock('./integrity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./integrity')>()),
  assertEffectBundleCatalogIntegrity: mocks.integrity,
}));

import { prepareEffectBundleBackupRestore } from './backup-restore';
import { parseEffectBundleCatalogEntry } from './entry';

const metadata = {
  createdAt: 1,
  description: { en: '', ru: '' },
  documents: [
    {
      assets: [],
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
const assets = [
  {
    blob: new Blob(['image'], { type: 'image/png' }),
    byteLength: 5,
    kind: 'image' as const,
    mimeType: 'image/png',
    sha256: 'a'.repeat(64),
  },
];

function store(existing?: unknown) {
  return {
    get: vi.fn().mockResolvedValue(existing),
    put: vi.fn(async (_entry: unknown) => {}),
  };
}

beforeEach(() => vi.resetAllMocks());

describe('effect bundle prepared backup restore', () => {
  it('puts a canonical restored entry without opening or completing a transaction', async () => {
    const target = store();
    const publish = await prepareEffectBundleBackupRestore({ assets, entry: metadata });
    await expect(publish({ store: target, strategy: 'replace' })).resolves.toEqual({
      conflicted: false,
      imported: true,
      packId: 'bundle-one',
    });
    expect(target.put).toHaveBeenCalledWith(
      expect.objectContaining({ assets, packId: 'bundle-one' })
    );
  });

  it('supports skip and duplicate without overwriting the conflict', async () => {
    const existing = { ...metadata, assets };
    const skipped = store(existing);
    const publish = await prepareEffectBundleBackupRestore({ assets, entry: metadata });
    await expect(publish({ store: skipped, strategy: 'skip' })).resolves.toEqual({
      conflicted: true,
      imported: false,
      packId: 'bundle-one',
    });
    expect(skipped.put).not.toHaveBeenCalled();

    const duplicated = store(existing);
    await expect(
      publish({
        createId: () => 'duplicate-id',
        store: duplicated,
        strategy: 'duplicate',
      })
    ).resolves.toEqual({
      conflicted: true,
      imported: true,
      packId: 'bundle-one-duplicate-id',
    });
    expect(duplicated.put).toHaveBeenCalledWith(
      expect.objectContaining({ packId: 'bundle-one-duplicate-id' })
    );
  });
});

it.each(['insert', 'delete', 'recreate'] as const)(
  'reads the current conflict after delayed integrity preparation: %s',
  async (change) => {
    let release: () => void = () => {
      throw new Error('Missing integrity release');
    };
    mocks.integrity.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    const source = {
      ...metadata,
      documents: metadata.documents.map((document) => ({ ...document })),
    };
    const pending = prepareEffectBundleBackupRestore({ assets, entry: source });
    const existing = { ...metadata, assets };
    let head: unknown = change === 'insert' ? undefined : existing;
    const target = {
      get: vi.fn(async () => head),
      put: vi.fn(async (_entry: unknown) => {}),
    };
    await vi.waitFor(() => expect(mocks.integrity).toHaveBeenCalledOnce());
    expect(target.get).not.toHaveBeenCalled();
    source.documents[0]!.source = 'Changed after capture';
    head = change === 'delete' ? undefined : { ...existing, version: 'fresh-identity' };
    release();
    const publish = await pending;
    expect(target.put).not.toHaveBeenCalled();
    await expect(
      publish({ store: target, strategy: 'duplicate', createId: () => 'copy' })
    ).resolves.toMatchObject({
      conflicted: change !== 'delete',
      imported: true,
      packId: change === 'delete' ? metadata.packId : `${metadata.packId}-copy`,
    });
    expect(target.put.mock.calls[0]?.[0]).toMatchObject({ documents: [{ source: '{}' }] });
    expect(head).toEqual(
      change === 'delete' ? undefined : { ...existing, version: 'fresh-identity' }
    );
  }
);

it('retries a refused publication through a fresh store without repeating preparation', async () => {
  const publish = await prepareEffectBundleBackupRestore({ assets, entry: metadata });
  const refused = store();
  refused.put.mockRejectedValueOnce(new Error('Storage refused'));
  await expect(publish({ store: refused, strategy: 'replace' })).rejects.toThrow('Storage refused');
  const fresh = store({ ...metadata, assets });
  await expect(publish({ store: fresh, strategy: 'skip' })).resolves.toMatchObject({
    conflicted: true,
    imported: false,
  });
  expect(fresh.put).not.toHaveBeenCalled();
  expect(mocks.integrity).toHaveBeenCalledOnce();
});

it.each(['valid', 'resource', 'source', 'closure'] as const)(
  'prepares actual resource catalog integrity before publication: %s',
  async (mode) => {
    const specimen = EFFECT_BUNDLE_CORPUS.find(
      (item) => item.accepted && item.artifact.includes('asset-bearing-conformance')
    )!;
    const imported = await importEffectBundleZip(readEffectBundleCorpusArchive(specimen));
    if (!imported.ok) throw new Error('Invalid actual catalog corpus');
    const catalog = await createEffectCatalogEntry(
      { kind: 'bundle-zip', bundle: imported.bundle },
      1
    );
    const original = structuredClone(catalog);
    const { assertEffectBundleCatalogIntegrity } =
      await vi.importActual<typeof import('./integrity')>('./integrity');
    mocks.integrity.mockImplementation(assertEffectBundleCatalogIntegrity);
    if (mode === 'source') catalog.documents[0]!.source += ' ';
    if (mode === 'closure') catalog.documents[0]!.assets[0]!.id = 'missing-resource';
    if (mode === 'resource') {
      const asset = catalog.assets[0]!;
      const bytes = new Uint8Array(await asset.blob.arrayBuffer());
      bytes[bytes.length - 1] = bytes[bytes.length - 1] === 0 ? 1 : 0;
      asset.blob = new Blob([bytes], { type: asset.mimeType });
    }
    const { assets: resources, ...entry } = catalog;
    const target = store(original);
    const pending = prepareEffectBundleBackupRestore({ assets: resources, entry });
    if (mode === 'valid') {
      const publish = await pending;
      expect(target.get).not.toHaveBeenCalled();
      await publish({ store: target, strategy: 'replace' });
      expect(target.put).toHaveBeenCalledOnce();
      const published = parseEffectBundleCatalogEntry(target.put.mock.calls[0]?.[0]);
      if (!published) throw new Error('Missing published catalog');
      await expect(assertEffectBundleCatalogIntegrity(published)).resolves.toBeUndefined();
    } else {
      await expect(pending).rejects.toMatchObject({ code: 'catalogIntegrityFailure' });
      expect(target.get).not.toHaveBeenCalled();
      expect(target.put).not.toHaveBeenCalled();
      await expect(assertEffectBundleCatalogIntegrity(original)).resolves.toBeUndefined();
    }
  }
);
