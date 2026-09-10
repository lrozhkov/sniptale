import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { importEffectBundleZip, importRawEffectDocument } from '../import/zip';
import { createEffectCatalogEntry } from '../../../../../composition/persistence/effect-bundles/catalog-builder';
import { exportEffectCatalog } from './export';

it('exports and reimports all documents and assets with a valid manifest', async () => {
  const bytes = new Uint8Array(
    readFileSync(
      new URL(
        '../fixtures/corpus/valid/asset-bearing-conformance.sniptale-bundle.zip',
        import.meta.url
      )
    )
  );
  const imported = await importEffectBundleZip(bytes);
  if (!imported.ok) throw new Error('fixture');
  const catalog = await createEffectCatalogEntry(
    { kind: 'bundle-zip', bundle: imported.bundle },
    1
  );
  const exported = await exportEffectCatalog(catalog);
  const restored = await importEffectBundleZip(new Uint8Array(await exported.blob.arrayBuffer()));
  if (!restored.ok) throw new Error(JSON.stringify(restored));
  expect(restored.bundle.documents.map((document) => document.document.id)).toEqual(
    imported.bundle.documents.map((document) => document.document.id)
  );
  expect(
    restored.bundle.documents.flatMap((document) => document.assets.map((asset) => asset.sha256))
  ).toEqual(
    imported.bundle.documents.flatMap((document) => document.assets.map((asset) => asset.sha256))
  );
});
it('exports a standalone asset-free document as JSON without catalog state', async () => {
  const bytes = readFileSync(
    new URL(
      '../../../../../../../../packages/runtime-contracts/src/effect-v1/fixtures/collection/' +
        'sniptale-callout.sniptale-effect.json',
      import.meta.url
    )
  );
  const imported = await importRawEffectDocument(bytes);
  if (!imported.ok) throw new Error('fixture');
  const catalog = await createEffectCatalogEntry(
    { kind: 'raw-json', document: imported.artifact },
    1
  );
  const exported = await exportEffectCatalog(catalog);
  expect(exported.filename.endsWith('.sniptale-effect.json')).toBe(true);
  const restored = await importRawEffectDocument(new Uint8Array(await exported.blob.arrayBuffer()));
  expect(restored.ok).toBe(true);
  if (restored.ok)
    expect(restored.artifact.document.document).toEqual(imported.artifact.document.document);
});
