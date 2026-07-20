import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { sha256EffectV1Bytes } from '@sniptale/runtime-contracts/effect-v1';

import { createEffectCatalogEntry } from '../../../../composition/persistence/effect-bundles/catalog-builder';
import type { EffectBundleCatalogEntry } from '../effect-bundle/catalog';
import {
  EFFECT_BUNDLE_CORPUS,
  readEffectBundleCorpusArchive,
} from '../../../../../../../tooling/test/support/effect-v1-corpus.test-support';
import { importEffectBundleZip, importRawEffectDocument } from '../effect-bundle/import/zip';
import { createEmptyVideoProject } from '../factories/creation';
import type { VideoProject } from '../types';
import { applyEffectCatalogDocument } from './apply';

describe('EffectV1 catalog apply integrity', () => {
  it('rejects missing, changed, malformed, and identity-mismatched catalog documents', async () => {
    const catalog = await createRawCatalog('neutral-standalone.sniptale-effect.json');
    const project = createEmptyVideoProject('apply');

    await expectApplyFailure(catalog, 'missing', project, 'effectCatalogIntegrityFailure');
    await expectApplyFailure(
      {
        ...catalog,
        documents: [{ ...catalog.documents[0]!, sha256: '0'.repeat(64) }],
      },
      catalog.documents[0]!.id,
      project,
      'effectCatalogIntegrityFailure'
    );
    const malformedSource = '{}';
    await expectApplyFailure(
      {
        ...catalog,
        documents: [
          {
            ...catalog.documents[0]!,
            sha256: await hashText(malformedSource),
            source: malformedSource,
          },
        ],
      },
      catalog.documents[0]!.id,
      project,
      'effectCatalogIntegrityFailure'
    );
    const changedId = 'catalog-alias';
    await expectApplyFailure(
      {
        ...catalog,
        documents: [{ ...catalog.documents[0]!, id: changedId }],
      },
      changedId,
      project,
      'effectCatalogIntegrityFailure'
    );
  });
});

describe('EffectV1 catalog asset snapshot materialization', () => {
  it('copies verified catalog assets into the immutable project snapshot', async () => {
    const catalog = await createAssetCatalog();
    const project = createEmptyVideoProject('assets');
    const document = catalog.documents[0]!;

    await expect(
      applyEffectCatalogDocument(createApplyArgs(catalog, document.id, project))
    ).resolves.toEqual(
      expect.objectContaining({
        effectSnapshots: [
          expect.objectContaining({ assets: [expect.objectContaining({ id: 'neutral-mark' })] }),
        ],
      })
    );
  });
});

describe('EffectV1 catalog asset apply integrity', () => {
  it('rejects catalog asset closure and retained-byte changes', async () => {
    const catalog = await createAssetCatalog();
    const project = createEmptyVideoProject('assets');
    const document = catalog.documents[0]!;

    await expectApplyFailure(
      { ...catalog, assets: [] },
      document.id,
      project,
      'effectCatalogIntegrityFailure'
    );
    await expectApplyFailure(
      {
        ...catalog,
        documents: [
          {
            ...document,
            assets: document.assets.map((asset) => ({ ...asset, sha256: '0'.repeat(64) })),
          },
        ],
      },
      document.id,
      project,
      'effectCatalogIntegrityFailure'
    );
    const changedBytes = new Uint8Array(await catalog.assets[0]!.blob.arrayBuffer());
    changedBytes[changedBytes.length - 1] = changedBytes[changedBytes.length - 1] === 0 ? 1 : 0;
    await expectApplyFailure(
      {
        ...catalog,
        assets: [
          {
            ...catalog.assets[0]!,
            blob: new Blob([changedBytes], { type: catalog.assets[0]!.mimeType }),
          },
        ],
      },
      document.id,
      project,
      'effectCatalogIntegrityFailure'
    );
  });
});

describe('EffectV1 catalog asset identity integrity', () => {
  it('rejects reordered identity edges, extra assets, duplicates, and metadata tampering', async () => {
    const catalog = await createAssetCatalog();
    const project = createEmptyVideoProject('assets');
    const documentIndex = catalog.documents.findIndex(({ assets }) => assets.length > 0);
    const document = catalog.documents[documentIndex]!;
    const reference = document.assets[0]!;
    const applyTampered = async (tampered: EffectBundleCatalogEntry) =>
      expectApplyFailure(tampered, document.id, project, 'effectCatalogIntegrityFailure');

    await applyTampered({
      ...catalog,
      documents: catalog.documents.map((value, index) =>
        index === documentIndex ? { ...value, assets: [{ ...reference, id: 'swapped-id' }] } : value
      ),
    });
    await applyTampered({
      ...catalog,
      documents: catalog.documents.map((value, index) =>
        index === documentIndex
          ? { ...value, assets: [reference, { ...reference, id: 'extra-id' }] }
          : value
      ),
    });
    await applyTampered({ ...catalog, assets: [...catalog.assets, catalog.assets[0]!] });
    await applyTampered({
      ...catalog,
      assets: catalog.assets.map((asset, index) =>
        index === 0 ? { ...asset, mimeType: 'image/png' } : asset
      ),
    });
  });
});

describe('EffectV1 project snapshot apply integrity', () => {
  it('rejects snapshot id collisions and project retained-byte amplification', async () => {
    const catalog = await createRawCatalog('neutral-standalone.sniptale-effect.json');
    const original = createEmptyVideoProject('snapshot');
    const applied = await applyEffectCatalogDocument(
      createApplyArgs(catalog, catalog.documents[0]!.id, original)
    );
    const snapshot = applied.effectSnapshots![0]!;

    await expectApplyFailure(
      catalog,
      catalog.documents[0]!.id,
      {
        ...applied,
        effectSnapshots: [{ ...snapshot, source: `${snapshot.source}\n` }],
      },
      'effectCatalogIntegrityFailure'
    );
    await expectApplyFailure(
      catalog,
      catalog.documents[0]!.id,
      {
        ...original,
        effectSnapshots: [
          {
            ...snapshot,
            id: `effect:${'f'.repeat(64)}`,
            retainedByteLength: 512 * 1024 * 1024,
            sha256: 'f'.repeat(64),
          },
        ],
      },
      'effectProjectQuotaExceeded'
    );
  });
});

function createApplyArgs(
  catalog: EffectBundleCatalogEntry,
  documentId: string,
  project: VideoProject
): Parameters<typeof applyEffectCatalogDocument>[0] {
  return {
    catalog,
    documentId,
    instanceId: 'effect-instance',
    project,
    startTime: 0,
    target: { kind: 'scene' },
  };
}

async function expectApplyFailure(
  catalog: EffectBundleCatalogEntry,
  documentId: string,
  project: VideoProject,
  code: string,
  target: Parameters<typeof applyEffectCatalogDocument>[0]['target'] = { kind: 'scene' }
): Promise<void> {
  await expect(
    applyEffectCatalogDocument({ ...createApplyArgs(catalog, documentId, project), target })
  ).rejects.toEqual(expect.objectContaining({ code }));
}

async function createRawCatalog(filename: string): Promise<EffectBundleCatalogEntry> {
  const imported = await importRawEffectDocument(readFixture(filename));
  if (!imported.ok) throw new Error('Expected valid raw EffectV1 fixture');
  return createEffectCatalogEntry({ document: imported.artifact, kind: 'raw-json' }, 1);
}

async function createAssetCatalog(): Promise<EffectBundleCatalogEntry> {
  const corpusCase = EFFECT_BUNDLE_CORPUS.find(
    ({ accepted, artifact }) => accepted && artifact.includes('asset-bearing-conformance')
  )!;
  const imported = await importEffectBundleZip(readEffectBundleCorpusArchive(corpusCase));
  if (!imported.ok) throw new Error('Expected valid EffectV1 bundle fixture');
  return createEffectCatalogEntry({ bundle: imported.bundle, kind: 'bundle-zip' }, 1);
}

function readFixture(filename: string): Uint8Array {
  return new Uint8Array(
    readFileSync(
      new URL(
        `../../../../../../../packages/runtime-contracts/src/effect-v1/fixtures/valid/${filename}`,
        import.meta.url
      )
    )
  );
}

async function hashText(value: string): Promise<string> {
  return sha256EffectV1Bytes(new TextEncoder().encode(value));
}
