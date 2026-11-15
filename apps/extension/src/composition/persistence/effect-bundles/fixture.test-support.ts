import { createHash } from 'node:crypto';
import { createGlTransitionSelection } from '../../../features/video/project/transition/gl-catalog';
import { parseGlPresetCatalogEntry } from './gl-presets';
import { importAnimationArtifactBytes } from '../../../features/video/project/effect-bundle/lottie-profile';
import { createAnimationCatalogEntry } from './catalog-builder';
import { execFileSync } from 'node:child_process';
import { parseBuiltinEffectIndex } from '../../../features/video/project/effect-bundle/catalog/builtin-index';
import { readFileSync } from 'node:fs';

import type { EffectBundleCatalogEntry } from '../../../features/video/project/effect-bundle/catalog';

/** Recreates an existing catalog row from unchanged source without new-import admission. */
export async function createRetainedTitleCatalogEntry(): Promise<unknown> {
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
  const sha256 = createHash('sha256').update(bytes).digest('hex');
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

/** Builds an imported historical fixture independently of the current shipped catalog. */
export async function readValidAnimationCatalog(): Promise<EffectBundleCatalogEntry> {
  const entry = await readValidAnimationSourceEntry();
  return {
    ...entry,
    version: String(entry.version),
    label: { en: entry.label.en, ru: entry.label.ru ?? entry.label.en },
    description: {
      en: entry.description?.en ?? '',
      ru: entry.description?.ru ?? entry.description?.en ?? '',
    },
    assets: [],
    enabled: true,
    documents: entry.documents.map((document) => ({
      ...document,
      schemaVersion: 'sniptale.animation.v1',
      kind: 'standalone',
      assets: [],
    })),
  };
}

export async function readValidAnimationSourceEntry() {
  const artifact = await importAnimationArtifactBytes(
    new Uint8Array(
      readFileSync(
        'apps/extension/src/features/video/project/effect-bundle/fixtures/retained/callout.sniptale-animation.json'
      )
    )
  );
  if (!artifact.ok) throw Error(JSON.stringify(artifact.diagnostics));
  return createAnimationCatalogEntry(artifact, 123);
}
export function createValidGlPresetSourceEntry(name = 'Saved transition', version = '3.2.0') {
  const source = JSON.stringify({
      format: 'sniptale-gl-preset',
      version: 1,
      name,
      transition: { ...createGlTransitionSelection('Fade'), version },
    }),
    sourceSha256 = createHash('sha256').update(source).digest('hex');
  const entry = parseGlPresetCatalogEntry({
    format: 'sniptale-gl-preset-catalog',
    version: 1,
    id: `gl.${sourceSha256}`,
    source,
    sourceSha256,
    retainedByteLength: new TextEncoder().encode(source).byteLength,
    createdAt: 123,
    updatedAt: 123,
  });
  if (!entry) throw Error('Invalid GL source fixture');
  return entry;
}

export async function readValidAnimationSnapshot() {
  const entry = await readValidAnimationSourceEntry(),
    document = entry.documents[0]!;
  return {
    id: `effect:${document.sha256}`,
    documentId: document.id,
    kind: 'standalone' as const,
    schemaVersion: 'sniptale.animation.v1' as const,
    source: document.source,
    sha256: document.sha256,
    retainedByteLength: new TextEncoder().encode(document.source).byteLength,
    assets: [],
  };
}

/** Execute the Node-owned build entry without importing its composite project into app test types. */
export async function buildVideoEffectIndex(root: string) {
  const output = execFileSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      "import { buildVideoEffectIndex } from './apps/extension/build/video-effects.ts'; console.log(JSON.stringify(await buildVideoEffectIndex(process.argv[1])));",
      root,
    ],
    { encoding: 'utf8' }
  );
  return parseBuiltinEffectIndex(JSON.parse(output));
}
