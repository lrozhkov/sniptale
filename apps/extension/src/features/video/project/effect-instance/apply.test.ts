import { readFileSync } from 'node:fs';

import { expect, it } from 'vitest';

import { sha256EffectV1Bytes } from '@sniptale/runtime-contracts/effect-v1';

import type { EffectBundleCatalogEntry } from '../effect-bundle/catalog';
import { createEmptyVideoProject } from '../factories/creation';
import { importRawEffectDocument } from '../effect-bundle/import/zip';
import { applyEffectCatalogDocument } from './apply';
import { resolveEffectInstanceTime } from './timing';
import { buildClipLabel } from '../timeline/meta';
import { getCurrentLocale } from '../../../../platform/i18n';

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
  expect(original.tracks).toHaveLength(1);
  expect(first.tracks).toHaveLength(2);
  expect(second.tracks).toBe(first.tracks);
  expect(second.clips.every((clip) => clip.trackId === first.tracks[1]?.id)).toBe(true);
  expect(first.tracks[1]).toEqual(expect.objectContaining({ kind: 'PRIMARY', order: -1 }));
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

it('places overlapping standalone effects on separate video layers and reuses a free upper layer', async () => {
  const catalog = await createRawCatalog(readFixture());
  const apply = (
    project: Parameters<typeof applyEffectCatalogDocument>[0]['project'],
    startTime: number,
    instanceId: string
  ) =>
    applyEffectCatalogDocument({
      catalog,
      documentId: catalog.documents[0]!.id,
      instanceId,
      project,
      startTime,
      target: { kind: 'scene' },
    });
  const first = await apply(createEmptyVideoProject('Visual layers'), 0, 'first');
  const second = await apply(first, 1, 'overlap');
  const firstClip = second.clips.find(
    (clip) => clip.type === 'EFFECT' && clip.effectInstanceId === 'first'
  )!;
  const overlappingClip = second.clips.find(
    (clip) => clip.type === 'EFFECT' && clip.effectInstanceId === 'overlap'
  )!;
  expect(overlappingClip.trackId).not.toBe(firstClip.trackId);
  const firstTrack = second.tracks.find((track) => track.id === firstClip.trackId)!;
  const upperTrack = second.tracks.find((track) => track.id === overlappingClip.trackId)!;
  expect(upperTrack.kind).toBe('PRIMARY');
  expect(upperTrack.order).toBeLessThan(firstTrack.order);
  const third = await apply(second, 5, 'later');
  expect(third.tracks).toBe(second.tracks);
  expect(third.clips.at(-1)?.startTime).toBe(5);
});

it('presents authored names instead of effect IDs and preserves a user rename', async () => {
  const catalog = await createRawCatalog(readFixture());
  const project = await applyEffectCatalogDocument({
    catalog,
    documentId: catalog.documents[0]!.id,
    instanceId: 'named',
    project: createEmptyVideoProject('names'),
    startTime: 0,
    target: { kind: 'scene' },
  });
  const clip = project.clips[0]!;
  const labels = JSON.parse(readFixture()).label;
  expect(clip.name).toBe('');
  expect(buildClipLabel(project, clip)).toBe(labels[getCurrentLocale()] ?? labels.en);
  expect(buildClipLabel(project, { ...clip, name: catalog.documents[0]!.id })).toBe(
    catalog.documents[0]!.id
  );
  expect(buildClipLabel(project, { ...clip, name: labels.ru })).toBe(labels.ru);
  expect(buildClipLabel(project, { ...clip, name: 'My explanation' })).toBe('My explanation');
});
