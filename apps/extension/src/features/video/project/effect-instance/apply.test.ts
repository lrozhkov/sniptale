import { readFileSync } from 'node:fs';

import { expect, it } from 'vitest';

import { sha256EffectV1Bytes } from '@sniptale/runtime-contracts/effect-v1';

import type { EffectBundleCatalogEntry } from '../effect-bundle/catalog';
import { createEmptyVideoProject } from '../factories/creation';
import { importRawEffectDocument } from '../effect-bundle/import/zip';
import { applyEffectCatalogDocument } from './apply';
import { resolveEffectInstanceTime } from './timing';

it('applies immutable content-addressed snapshots and reuses only byte-identical content', async () => {
  const catalog = await createRawCatalog(readFixture());
  const original = createEmptyVideoProject('effects');

  const first = await applyEffectCatalogDocument({
    catalog,
    documentId: catalog.documents[0]!.id,
    instanceId: 'effect-instance-1',
    project: original,
    startTime: 2,
    target: { kind: 'scene' },
  });
  const second = await applyEffectCatalogDocument({
    catalog,
    documentId: catalog.documents[0]!.id,
    instanceId: 'effect-instance-2',
    project: first,
    startTime: 5,
    target: { kind: 'scene' },
  });

  expect(original.effectSnapshots).toEqual([]);
  expect(second.effectSnapshots).toHaveLength(1);
  expect(second.effectInstances).toHaveLength(2);
  expect(second.clips).toEqual([
    expect.objectContaining({
      effectInstanceId: 'effect-instance-1',
      type: 'EFFECT',
    }),
    expect.objectContaining({
      effectInstanceId: 'effect-instance-2',
      type: 'EFFECT',
    }),
  ]);
  expect(second.effectInstances?.[0]).toEqual(
    expect.objectContaining({
      duration: 3,
      playbackRate: 1,
      snapshotId: second.effectSnapshots?.[0]?.id,
    })
  );
});

it('does not mutate an applied snapshot when a catalog document is reimported', async () => {
  const firstCatalog = await createRawCatalog(readFixture());
  const first = await applyEffectCatalogDocument({
    catalog: firstCatalog,
    documentId: firstCatalog.documents[0]!.id,
    instanceId: 'first',
    project: createEmptyVideoProject('effects'),
    startTime: 0,
    target: { kind: 'scene' },
  });
  const changedSource = readFixture().replace('Neutral Standalone', 'Changed Standalone');
  const changedCatalog = await createRawCatalog(changedSource);
  const second = await applyEffectCatalogDocument({
    catalog: changedCatalog,
    documentId: changedCatalog.documents[0]!.id,
    instanceId: 'second',
    project: first,
    startTime: 4,
    target: { kind: 'scene' },
  });

  expect(second.effectSnapshots).toHaveLength(2);
  expect(second.effectSnapshots?.[0]?.source).toBe(first.effectSnapshots?.[0]?.source);
  expect(second.effectSnapshots?.[0]?.source).not.toContain('Changed Standalone');
});

it('fails closed when effect kind and target semantics disagree', async () => {
  const catalog = await createRawCatalog(readFixture());

  await expect(
    applyEffectCatalogDocument({
      catalog,
      documentId: catalog.documents[0]!.id,
      instanceId: 'wrong-target',
      project: createEmptyVideoProject('effects'),
      startTime: 0,
      target: { clipId: 'missing', kind: 'clip' },
    })
  ).rejects.toEqual(expect.objectContaining({ code: 'effectKindTargetMismatch' }));
});
it('uses one shared timing equation for preview, export and audio', () => {
  expect(resolveEffectInstanceTime({ duration: 2, playbackRate: 1.5, startTime: 4 }, 3, 5)).toEqual(
    { effectTime: 1.5, progress: 0.5 }
  );
  expect(
    resolveEffectInstanceTime({ duration: 2, playbackRate: 1.5, startTime: 4 }, 3, 7)
  ).toBeNull();
  expect(
    resolveEffectInstanceTime({ duration: 2, playbackRate: 1.5, startTime: 4 }, 3, 6)
  ).toBeNull();
});

async function createRawCatalog(source: string): Promise<EffectBundleCatalogEntry> {
  const bytes = new TextEncoder().encode(source);
  const imported = await importRawEffectDocument(bytes);
  if (!imported.ok) throw new Error('Expected EffectV1 fixture to import');
  const document = imported.artifact.document;
  return {
    assets: [],
    createdAt: 1,
    description: {
      en: document.document.description?.en ?? '',
      ru: document.document.description?.ru ?? '',
    },
    documents: [
      {
        assets: [],
        id: document.document.id,
        kind: document.document.kind,
        schemaVersion: 'sniptale.effect.v1',
        sha256: await sha256EffectV1Bytes(bytes),
        source,
      },
    ],
    enabled: true,
    label: { en: document.document.label.en ?? '', ru: document.document.label.ru ?? '' },
    packId: `raw.${document.document.id}`,
    retainedByteLength: bytes.byteLength,
    source: 'raw-json',
    sourceSha256: await sha256EffectV1Bytes(bytes),
    updatedAt: 1,
    version: '0.0.0',
  };
}

function readFixture(): string {
  return readFileSync(
    new URL(
      '../../../../../../../packages/runtime-contracts/src/effect-v1/fixtures/valid/' +
        'neutral-standalone.sniptale-effect.json',
      import.meta.url
    ),
    'utf8'
  );
}
