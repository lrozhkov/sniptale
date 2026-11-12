import { createGlTransitionSelection } from '../transition/gl-catalog';
import { readFileSync } from 'node:fs';

import { expect, it } from 'vitest';

import type { EffectBundleCatalogEntry } from '../effect-bundle/catalog';
import { importAnimationArtifactBytes } from '../effect-bundle/lottie-profile';
import { createEmptyVideoProject, createVideoProjectTrack } from '../factories/creation';
import {
  createRecordingAudioClip,
  createRecordingBaseClip,
  createRecordingProjectAsset,
} from '../factories/recording';
import { createEffectHostClip } from '../factories/overlay-clip';
import { VideoTrackKind, VideoTransitionEasing, type VideoProject } from '../types';
import { applyEffectCatalogDocument } from './apply';

it('refuses source clip annotation targets without changing the source or GL transition', async () => {
  const catalog = await createRawCatalog(readFixture());
  const project = createProjectWithTransition(),
    before = structuredClone(project);
  await expect(
    applyEffectCatalogDocument({
      ...createApplyArgs(catalog, catalog.documents[0]!.id, project),
      startTime: 2,
      target: { clipId: project.clips[0]!.id, kind: 'clip' },
    })
  ).rejects.toMatchObject({ code: 'effectKindTargetMismatch' });
  expect(project).toEqual(before);
});

it('refuses a retired EffectV1 transition without changing the accepted GL boundary', async () => {
  const catalog = await createRawCatalog(readFixture());
  const project = createProjectWithTransition(),
    original = structuredClone(project);
  await expect(
    applyEffectCatalogDocument({
      ...createApplyArgs(catalog, catalog.documents[0]!.id, project),
      startTime: 99,
      target: { kind: 'transition', transitionId: project.transitions![0]!.id },
    })
  ).rejects.toMatchObject({ code: 'effectKindTargetMismatch' });
  expect(project).toEqual(original);
});

it('refuses a retired transition target independently of its invalid overlap', async () => {
  const catalog = await createRawCatalog(readFixture());
  const project = createProjectWithTransition();
  project.clips[1]!.startTime = 5;

  await expect(
    applyEffectCatalogDocument({
      ...createApplyArgs(catalog, catalog.documents[0]!.id, project),
      target: { kind: 'transition', transitionId: project.transitions![0]!.id },
    })
  ).rejects.toEqual(expect.objectContaining({ code: 'effectKindTargetMismatch' }));
});

it('rejects audio and generated annotation clips as annotation targets', async () => {
  const catalog = await createRawCatalog(readFixture());
  const project = createProjectWithTransition();
  const audioTrack = createVideoProjectTrack('Audio', 2, VideoTrackKind.AUDIO);
  const overlayTrack = createVideoProjectTrack('Effects', 0, VideoTrackKind.PRIMARY);
  project.tracks.push(audioTrack, overlayTrack);
  const audio = createRecordingAudioClip(project.assets[0]!, audioTrack.id, 1, 'audio-group');
  const host = createEffectHostClip({
    duration: 1,
    effectInstanceId: 'standalone-host-owner',
    name: 'Standalone host',
    projectHeight: project.height,
    projectWidth: project.width,
    startTime: 0,
    trackId: overlayTrack.id,
  });
  project.clips.push(audio, host);

  for (const clipId of [audio.id, host.id]) {
    await expect(
      applyEffectCatalogDocument({
        ...createApplyArgs(catalog, catalog.documents[0]!.id, project),
        target: { clipId, kind: 'clip' },
      })
    ).rejects.toEqual(expect.objectContaining({ code: 'effectKindTargetMismatch' }));
  }
});

it('refuses track and video-group annotation targets without changing ordinary clips', async () => {
  const catalog = await createRawCatalog(readFixture());
  const project = createProjectWithTransition(),
    before = structuredClone(project);
  for (const target of [
    { kind: 'track' as const, trackId: project.tracks[0]!.id },
    { kind: 'video-group' as const },
  ]) {
    await expect(
      applyEffectCatalogDocument({
        ...createApplyArgs(catalog, catalog.documents[0]!.id, project),
        target,
      })
    ).rejects.toMatchObject({ code: 'effectKindTargetMismatch' });
  }
  expect(project).toEqual(before);
});

it('refuses repeated retired transition application without stacking graphs or rewriting GL data', async () => {
  const catalog = await createRawCatalog(readFixture());
  const project = createProjectWithTransition(),
    original = structuredClone(project);
  for (const instanceId of ['first', 'replacement']) {
    await expect(
      applyEffectCatalogDocument({
        ...createApplyArgs(catalog, catalog.documents[0]!.id, project),
        instanceId,
        target: { kind: 'transition', transitionId: project.transitions![0]!.id },
      })
    ).rejects.toMatchObject({ code: 'effectKindTargetMismatch' });
  }
  expect(project).toEqual(original);
});

it('refuses imported transitions on a locked track', async () => {
  const catalog = await createRawCatalog(readFixture());
  const project = createProjectWithTransition();
  project.tracks[0]!.locked = true;
  await expect(
    applyEffectCatalogDocument({
      ...createApplyArgs(catalog, catalog.documents[0]!.id, project),
      target: { kind: 'transition', transitionId: project.transitions![0]!.id },
    })
  ).rejects.toMatchObject({ code: 'effectKindTargetMismatch' });
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

function createProjectWithTransition(): VideoProject {
  const project = createEmptyVideoProject('targets');
  const asset = createRecordingProjectAsset({
    duration: 9,
    filename: 'recording.webm',
    height: 720,
    mimeType: 'video/webm',
    recordingId: 'recording',
    size: 1,
    width: 1280,
  });
  const trackId = project.tracks[0]!.id;
  const leading = createRecordingBaseClip(
    asset,
    { duration: 5, height: 720, width: 1280 },
    trackId,
    null
  );
  const trailing = createRecordingBaseClip(
    asset,
    { duration: 5, height: 720, width: 1280 },
    trackId,
    null
  );
  trailing.startTime = 4;
  return {
    ...project,
    assets: [asset],
    clips: [leading, trailing],
    duration: 9,
    transitions: [
      {
        duration: 1,
        easing: VideoTransitionEasing.LINEAR,
        id: 'transition',
        kind: 'gl' as const,
        selection: createGlTransitionSelection('Fade')!,
        leadingClipId: leading.id,
        trailingClipId: trailing.id,
      },
    ],
  };
}

it('inserts standalone annotations only into a free requested video track', async () => {
  const catalog = await createRawCatalog(readFixture());
  const project = createProjectWithTransition();
  const trackId = project.tracks[0]!.id;
  const args = {
    ...createApplyArgs(catalog, catalog.documents[0]!.id, project),
    target: { kind: 'scene' } as const,
    trackId,
  };
  const applied = await applyEffectCatalogDocument({ ...args, startTime: 12 });
  expect(applied.clips.at(-1)).toMatchObject({ trackId, startTime: 12, type: 'EFFECT' });
  await expect(applyEffectCatalogDocument({ ...args, startTime: 2 })).rejects.toEqual(
    expect.objectContaining({ code: 'effectTargetOccupied' })
  );
  await expect(
    applyEffectCatalogDocument({
      ...args,
      startTime: 12,
      project: { ...project, tracks: project.tracks.map((track) => ({ ...track, locked: true })) },
    })
  ).rejects.toEqual(expect.objectContaining({ code: 'effectTargetMissing' }));
});

it('rejects a logical lane without its owning track', async () => {
  const catalog = await createRawCatalog(readFixture());
  await expect(
    applyEffectCatalogDocument({
      ...createApplyArgs(catalog, catalog.documents[0]!.id, createEmptyVideoProject('lane')),
      target: { kind: 'scene' },
      timelineLaneId: 'missing',
    })
  ).rejects.toEqual(expect.objectContaining({ code: 'effectTargetMissing' }));
});
