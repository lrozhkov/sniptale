import { readFileSync } from 'node:fs';

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
