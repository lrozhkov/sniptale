import { readFileSync } from 'node:fs';
import { sha256EffectV1Bytes } from '@sniptale/runtime-contracts/effect-v1';

import type { EffectBundleCatalogEntry } from '../../../features/video/project/effect-bundle/catalog';

import type { ImportedEffectArtifact } from '../../../features/video/project/effect-bundle/import/artifact';
import { importEffectBundleZip } from '../../../features/video/project/effect-bundle/import/zip';

export async function readValidBundleArtifact(): Promise<
  Extract<ImportedEffectArtifact, { kind: 'bundle-zip' }>
> {
  const bytes = new Uint8Array(
    readFileSync(
      new URL(
        '../../../features/video/project/effect-bundle/fixtures/corpus/valid/' +
          'asset-bearing-conformance.sniptale-bundle.zip',
        import.meta.url
      )
    )
  );
  const imported = await importEffectBundleZip(bytes);
  if (!imported.ok) throw new Error('Expected asset-bearing EffectV1 fixture to import');
  return { bundle: imported.bundle, kind: 'bundle-zip' };
}

/** Recreates an existing catalog row from unchanged source without new-import admission. */
export async function readRetainedTitleCatalogEntry(): Promise<EffectBundleCatalogEntry> {
  const bytes = new Uint8Array(
    readFileSync(
      new URL(
        '../../../features/video/project/effect-bundle/fixtures/retained/' +
          'title.sniptale-effect.json',
        import.meta.url
      )
    )
  );
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const sha256 = await sha256EffectV1Bytes(bytes);
  return {
    assets: [],
    createdAt: 123,
    description: { en: '', ru: '' },
    documents: [
      {
        assets: [],
        id: 'sniptale-title',
        kind: 'standalone',
        schemaVersion: 'sniptale.effect.v1',
        sha256,
        source,
      },
    ],
    enabled: true,
    label: { en: 'Main idea', ru: 'Главная мысль' },
    packId: 'retained-title',
    retainedByteLength: bytes.byteLength,
    source: 'raw-json',
    sourceSha256: sha256,
    updatedAt: 123,
    version: '1',
  };
}
