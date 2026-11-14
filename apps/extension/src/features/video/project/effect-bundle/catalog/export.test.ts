import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import JSZip from 'jszip';
import { importAnimationArtifactBytes } from '../lottie-profile';
import {
  createAnimationImportWorkerResponse,
  parseAnimationImportWorkerResponse,
} from '../import/worker/protocol';
import { createAnimationCatalogEntry } from '../../../../../composition/persistence/effect-bundles/catalog-builder';
import type { EffectBundleCatalogEntry } from './index';
import { exportEffectCatalog } from './export';

async function fixture(names = ['callout', 'title']) {
  const documents = [];
  for (const name of names) {
    const result = await importAnimationArtifactBytes(
      new Uint8Array(
        readFileSync(
          name === 'callout'
            ? 'apps/extension/src/features/video/project/effect-bundle/' +
                'fixtures/retained/callout.sniptale-animation.json'
            : `apps/extension/public/video-effects/animations/${name}.sniptale-animation.json`
        )
      )
    );
    if (!result.ok) throw new Error(JSON.stringify(result));
    const entry = result.documents[0]!;
    documents.push({
      id: entry.template.id,
      source: entry.source,
      sha256: entry.sha256,
      kind: 'standalone' as const,
      schemaVersion: 'sniptale.animation.v1' as const,
      assets: [],
      enabled: false,
    });
  }
  const catalog: EffectBundleCatalogEntry = {
    packId: 'animation.portable-proof',
    label: { en: 'Portable proof', ru: 'Проверка пакета' },
    description: { en: 'Authored package', ru: 'Авторский пакет' },
    documents,
    assets: [],
    source: 'raw-json',
    sourceSha256: 'a'.repeat(64),
    retainedByteLength: documents.reduce(
      (sum, entry) => sum + new TextEncoder().encode(entry.source).byteLength,
      0
    ),
    enabled: false,
    createdAt: 1,
    updatedAt: 2,
    version: '1',
  };
  return catalog;
}

it.each([['callout'], ['callout', 'title']])(
  'exports a complete %j package and reimports metadata, controls and embedded fonts',
  async (...names) => {
    const catalog = await fixture(names),
      before = structuredClone(catalog);
    const exported = await exportEffectCatalog(catalog);
    expect(exported.filename).toBe('animation.portable-proof.sniptale-animations.zip');
    const bytes = new Uint8Array(await exported.blob.arrayBuffer());
    const result = await importAnimationArtifactBytes(bytes);
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(result.package).toEqual({
      packId: catalog.packId,
      label: catalog.label,
      description: catalog.description,
    });
    expect(result.documents.map((entry) => entry.source)).toEqual(
      catalog.documents.map((entry) => entry.source)
    );
    for (const document of result.documents) {
      expect(document.template.resources.some((resource) => resource.mimeType === 'font/ttf')).toBe(
        true
      );
      expect(document.template.controls.length).toBeGreaterThan(1);
      expect(document.template.controlPresets?.length).toBeGreaterThan(1);
    }
    const rebuilt = await createAnimationCatalogEntry(result, 3);
    expect(rebuilt.packId).toBe(catalog.packId);
    expect(rebuilt.label).toEqual(catalog.label);
    expect(rebuilt.description).toEqual(catalog.description);
    expect(rebuilt.documents.map((entry) => entry.source)).toEqual(
      catalog.documents.map((entry) => entry.source)
    );
    const zip = await JSZip.loadAsync(bytes),
      manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
    expect(Object.keys(manifest).sort()).toEqual(['documents', 'format', 'metadata', 'version']);
    expect(Object.keys(manifest.metadata).sort()).toEqual(['description', 'label', 'packId']);
    expect(Object.keys(manifest.documents[0]).sort()).toEqual([
      'byteLength',
      'id',
      'path',
      'sha256',
    ]);
    expect(catalog).toEqual(before);
  }
);

it('refuses incomplete or corrupt catalogues instead of exporting a subset', async () => {
  const catalog = await fixture();
  const { source: discarded, ...unloaded } = catalog.documents[0]!;
  void discarded;
  for (const invalid of [
    { ...catalog, documents: [] },
    { ...catalog, source: 'builtin' as const },
    {
      ...catalog,
      documents: catalog.documents.map((entry, index) => (index === 0 ? unloaded : entry)),
    },
    {
      ...catalog,
      documents: catalog.documents.map((entry, index) =>
        index === 0 ? { ...entry, sha256: '0'.repeat(64) } : entry
      ),
    },
    { ...catalog, documents: [catalog.documents[0]!, catalog.documents[0]!] },
  ])
    await expect(exportEffectCatalog(invalid)).rejects.toThrow();
});

it.each(['missing', 'extra', 'digest', 'identity', 'version', 'preference'])(
  'refuses a whole pack with %s corruption before publication',
  async (mutation) => {
    const catalog = await fixture(),
      exported = await exportEffectCatalog(catalog);
    const zip = await JSZip.loadAsync(await exported.blob.arrayBuffer());
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
    if (mutation === 'missing') zip.remove(manifest.documents[0].path);
    if (mutation === 'extra') zip.file('private.txt', 'not declared');
    if (mutation === 'digest') manifest.documents[0].sha256 = '0'.repeat(64);
    if (mutation === 'identity') manifest.documents[0].id = 'other';
    if (mutation === 'version') manifest.version = 2;
    if (mutation === 'preference') manifest.metadata.enabled = true;
    zip.file('manifest.json', JSON.stringify(manifest));
    const result = await importAnimationArtifactBytes(
      await zip.generateAsync({ type: 'uint8array', compression: 'STORE' })
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Corrupt pack was accepted');
    const expectedCodes = new Map([
      ['missing', 'BUNDLE_ENTRY_MISSING'],
      ['extra', 'BUNDLE_ENTRY_UNDECLARED'],
      ['digest', 'BUNDLE_ENTRY_HASH_MISMATCH'],
      ['identity', 'BUNDLE_DOCUMENT_INVALID'],
      ['version', 'BUNDLE_MANIFEST_INVALID'],
      ['preference', 'BUNDLE_MANIFEST_INVALID'],
    ]);
    expect(result.primaryCode).toBe(expectedCodes.get(mutation));
    expect('documents' in result).toBe(false);
  }
);

it(
  'passes checked package metadata through the actual Worker response ' +
    'boundary and refuses a forged identity',
  async () => {
    const exported = await exportEffectCatalog(await fixture());
    const result = await importAnimationArtifactBytes(
      new Uint8Array(await exported.blob.arrayBuffer())
    );
    if (!result.ok) throw new Error(JSON.stringify(result));
    const response = createAnimationImportWorkerResponse('request', result);
    const accepted = await parseAnimationImportWorkerResponse(
      response,
      'request',
      result.archiveSha256
    );
    expect(accepted).toEqual(result);
    expect(
      await parseAnimationImportWorkerResponse(
        {
          ...response,
          result: {
            ...response.result,
            package: { packId: 'builtin:forged', label: { en: 'Forged' } },
          },
        },
        'request',
        result.archiveSha256
      )
    ).toBeNull();
    expect(
      await parseAnimationImportWorkerResponse(
        {
          ...response,
          result: { ...response.result, package: { ...result.package, enabled: true } },
        },
        'request',
        result.archiveSha256
      )
    ).toBeNull();
  }
);

it('retains an explicitly empty package description independently from template descriptions', async () => {
  const catalog = await fixture(['callout']);
  catalog.description = { en: '', ru: '' };
  const exported = await exportEffectCatalog(catalog);
  const result = await importAnimationArtifactBytes(
    new Uint8Array(await exported.blob.arrayBuffer())
  );
  if (!result.ok) throw new Error(JSON.stringify(result));
  expect((await createAnimationCatalogEntry(result, 3)).description).toEqual({ en: '', ru: '' });
});
