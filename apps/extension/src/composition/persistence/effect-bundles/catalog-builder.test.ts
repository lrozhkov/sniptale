import { expect, it } from 'vitest';

import type { ImportedEffectArtifact } from '../../../features/video/project/effect-bundle/import/artifact';
import { createEffectCatalogEntry } from './catalog-builder';
import { readValidBundleArtifact } from './fixture.test-support';

it('deduplicates byte-identical assets across bundle documents', async () => {
  const artifact = await readValidBundleArtifact();
  const document = artifact.bundle.documents[0]!;
  artifact.bundle.documents.push({ ...document, document: { ...document.document, id: 'copy' } });

  const entry = await createEffectCatalogEntry(artifact, 123);

  expect(entry.assets).toHaveLength(1);
  expect(entry.documents).toHaveLength(2);
});

it('rejects equal asset digests that carry different retained bytes', async () => {
  const artifact = await readValidBundleArtifact();
  const document = artifact.bundle.documents[0]!;
  const asset = document.assets[0]!;
  const conflicting = {
    ...document,
    assets: [{ ...asset, bytes: Uint8Array.of(...asset.bytes, 0) }],
    document: { ...document.document, id: 'conflicting' },
  };
  artifact.bundle.documents.push(conflicting);

  await expect(createEffectCatalogEntry(artifact, 123)).rejects.toMatchObject({
    code: 'catalogIntegrityFailure',
  });
});

it('materializes raw JSON catalog identity and locale fallbacks without assets', async () => {
  const artifact = await readValidBundleArtifact();
  const imported = artifact.bundle.documents[0]!;
  const document = {
    ...imported.document,
    assets: [],
    description: { ru: 'Описание' },
    id: 'raw-effect',
    label: { en: 'Raw effect' },
  };
  const raw: ImportedEffectArtifact = {
    document: {
      document: { ...imported, assets: [], document },
      sourceSha256: imported.sha256,
    },
    kind: 'raw-json',
  };

  await expect(createEffectCatalogEntry(raw, 456)).resolves.toMatchObject({
    description: { en: 'Описание', ru: 'Описание' },
    label: { en: 'Raw effect', ru: 'Raw effect' },
    packId: 'raw.raw-effect',
    source: 'raw-json',
    version: '0.0.0',
  });
});
