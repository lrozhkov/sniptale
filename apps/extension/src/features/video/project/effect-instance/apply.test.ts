import { readFileSync } from 'node:fs';

import { expect, it } from 'vitest';

import type { EffectBundleCatalogEntry } from '../effect-bundle/catalog';
import { createEmptyVideoProject } from '../factories/creation';
import { importAnimationArtifactBytes } from '../effect-bundle/lottie-profile';
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
  const changedSource = readFixture().replace('Callout', 'Changed Callout');
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
  expect(second.effectSnapshots?.[0]?.source).not.toContain('Changed Callout');
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
  const imported = await importAnimationArtifactBytes(new TextEncoder().encode(source));
  if (!imported.ok) throw new Error('Expected valid animation fixture.');
  const entry = imported.documents[0]!,
    document = entry.template;
  return {
    assets: [],
    createdAt: 1,
    updatedAt: 1,
    enabled: true,
    description: { en: '', ru: '' },
    label: { en: document.label.en, ru: document.label.ru ?? document.label.en },
    documents: [
      {
        assets: [],
        id: document.id,
        kind: 'standalone',
        schemaVersion: 'sniptale.animation.v1',
        sha256: entry.sha256,
        source: entry.source,
      },
    ],
    packId: `animation.${document.id}`,
    retainedByteLength: new TextEncoder().encode(entry.source).byteLength,
    source: 'raw-json',
    sourceSha256: imported.archiveSha256,
    version: '1',
  };
}
function readFixture(): string {
  return readFileSync(
    'apps/extension/public/video-effects/animations/callout.sniptale-animation.json',
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
