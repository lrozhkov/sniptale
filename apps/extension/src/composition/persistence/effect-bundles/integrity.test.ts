import { expect, it } from 'vitest';

import { sha256EffectV1Bytes } from '@sniptale/runtime-contracts/effect-v1';

import type { EffectBundleCatalogEntry } from '../../../features/video/project/effect-bundle/catalog';
import { createEffectCatalogEntry } from './catalog-builder';
import { readValidBundleArtifact } from './fixture.test-support';
import { assertEffectBundleCatalogIntegrity } from './integrity';

it('accepts an unchanged materialized catalog entry', async () => {
  const entry = await createValidEntry();

  await expect(assertEffectBundleCatalogIntegrity(entry)).resolves.toBeUndefined();
});

it('rejects mismatched asset size, digest, and media signature', async () => {
  const entry = await createValidEntry();
  await expectIntegrityFailure({
    ...entry,
    assets: [{ ...entry.assets[0]!, byteLength: entry.assets[0]!.byteLength + 1 }],
  });

  const bytes = new TextEncoder().encode('not-an-image');
  await expectIntegrityFailure({
    ...entry,
    assets: [
      {
        ...entry.assets[0]!,
        blob: new Blob([bytes]),
        byteLength: bytes.byteLength,
        sha256: await sha256EffectV1Bytes(bytes),
      },
    ],
  });
});

it('rejects document digest, JSON, identity, and asset-closure mismatches', async () => {
  const entry = await createValidEntry();
  await expectIntegrityFailure({
    ...entry,
    documents: [{ ...entry.documents[0]!, sha256: '0'.repeat(64) }],
  });

  const malformedSource = '{';
  await expectIntegrityFailure(await replaceDocumentSource(entry, malformedSource));
  const parsed = JSON.parse(entry.documents[0]!.source);
  const changedSource = JSON.stringify({ ...parsed, id: 'changed-id' });
  await expectIntegrityFailure(await replaceDocumentSource(entry, changedSource));
  await expectIntegrityFailure({ ...entry, assets: [] });
});

it('rejects missing, extra, remapped, duplicate, and metadata-divergent asset edges', async () => {
  const entry = await createValidEntry();
  const documentIndex = entry.documents.findIndex(({ assets }) => assets.length > 0);
  const document = entry.documents[documentIndex]!;
  const reference = document.assets[0]!;

  await expectIntegrityFailure({
    ...entry,
    documents: entry.documents.map((value, index) =>
      index === documentIndex ? { ...value, assets: [] } : value
    ),
  });
  await expectIntegrityFailure({
    ...entry,
    documents: entry.documents.map((value, index) =>
      index === documentIndex
        ? { ...value, assets: [reference, { ...reference, id: 'extra-asset' }] }
        : value
    ),
  });
  await expectIntegrityFailure({
    ...entry,
    documents: entry.documents.map((value, index) =>
      index === documentIndex
        ? { ...value, assets: [{ ...reference, id: 'remapped-asset' }] }
        : value
    ),
  });
  await expectIntegrityFailure({ ...entry, assets: [...entry.assets, entry.assets[0]!] });
  await expectIntegrityFailure({
    ...entry,
    assets: entry.assets.map((asset, index) =>
      index === 0 ? { ...asset, kind: asset.kind === 'svg' ? 'image' : 'svg' } : asset
    ),
  });
});

async function replaceDocumentSource(
  entry: EffectBundleCatalogEntry,
  source: string
): Promise<EffectBundleCatalogEntry> {
  const bytes = new TextEncoder().encode(source);
  return {
    ...entry,
    documents: [{ ...entry.documents[0]!, sha256: await sha256EffectV1Bytes(bytes), source }],
  };
}

async function expectIntegrityFailure(entry: EffectBundleCatalogEntry): Promise<void> {
  await expect(assertEffectBundleCatalogIntegrity(entry)).rejects.toMatchObject({
    code: 'catalogIntegrityFailure',
  });
}

async function createValidEntry(): Promise<EffectBundleCatalogEntry> {
  return createEffectCatalogEntry(await readValidBundleArtifact(), 123);
}
