import { readFileSync } from 'node:fs';

import { expect, it } from 'vitest';

import { createEffectCatalogEntry } from '../../../../composition/persistence/effect-bundles/catalog-builder';
import type { EffectBundleCatalogEntry } from '../effect-bundle/catalog';
import { importRawEffectDocument } from '../effect-bundle/import/zip';
import { createEmptyVideoProject, createVideoProjectTrack } from '../factories/creation';
import {
  createRecordingAudioClip,
  createRecordingBaseClip,
  createRecordingProjectAsset,
} from '../factories/recording';
import { createEffectHostClip } from '../factories/overlay-clip';
import {
  VideoTrackKind,
  VideoTransitionEasing,
  VideoTransitionKind,
  type VideoProject,
} from '../types';
import { applyEffectCatalogDocument } from './apply';

it('applies target effects only to an existing clip', async () => {
  const catalog = await createRawCatalog('neutral-target-effect.sniptale-effect.json');
  const project = createProjectWithTransition();
  const clipId = project.clips[0]!.id;

  const applied = await applyEffectCatalogDocument({
    ...createApplyArgs(catalog, catalog.documents[0]!.id, project),
    startTime: 2,
    target: { clipId, kind: 'clip' },
  });

  expect(applied.effectInstances![0]).toEqual(
    expect.objectContaining({ duration: 5, playbackRate: 0.6, startTime: 0, rangeMode: 'owner' })
  );
});

it('maps a transition document onto the exact overlap segment', async () => {
  const catalog = await createRawCatalog('neutral-transition.sniptale-effect.json');
  const project = createProjectWithTransition();
  const transitionId = project.transitions![0]!.id;

  const applied = await applyEffectCatalogDocument({
    ...createApplyArgs(catalog, catalog.documents[0]!.id, project),
    startTime: 99,
    target: { kind: 'transition', transitionId },
  });

  expect(applied.effectInstances![0]).toEqual(
    expect.objectContaining({ duration: 1, playbackRate: 3, startTime: 4 })
  );
});

it('fails when a declared transition has no renderable overlap segment', async () => {
  const catalog = await createRawCatalog('neutral-transition.sniptale-effect.json');
  const project = createProjectWithTransition();
  project.clips[1]!.startTime = 5;

  await expect(
    applyEffectCatalogDocument({
      ...createApplyArgs(catalog, catalog.documents[0]!.id, project),
      target: { kind: 'transition', transitionId: project.transitions![0]!.id },
    })
  ).rejects.toEqual(expect.objectContaining({ code: 'effectTargetMissing' }));
});

it('rejects audio and accepts generated annotation clips as target-effect inputs', async () => {
  const catalog = await createRawCatalog('neutral-target-effect.sniptale-effect.json');
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

  for (const clipId of [audio.id]) {
    await expect(
      applyEffectCatalogDocument({
        ...createApplyArgs(catalog, catalog.documents[0]!.id, project),
        target: { clipId, kind: 'clip' },
      })
    ).rejects.toEqual(expect.objectContaining({ code: 'effectKindTargetMismatch' }));
  }
});

it('applies track and video-group effects with owner duration and refuses camera/audio tracks', async () => {
  const catalog = await createRawCatalog('neutral-target-effect.sniptale-effect.json');
  const project = createProjectWithTransition();
  for (const target of [
    { kind: 'track' as const, trackId: project.tracks[0]!.id },
    { kind: 'video-group' as const },
  ]) {
    const next = await applyEffectCatalogDocument({
      ...createApplyArgs(catalog, catalog.documents[0]!.id, project),
      target,
    });
    expect(next.effectInstances![0]).toMatchObject({
      target,
      startTime: 0,
      duration: 9,
      rangeMode: 'owner',
    });
  }
  project.tracks[0]!.role = 'CAMERA';
  await expect(
    applyEffectCatalogDocument({
      ...createApplyArgs(catalog, catalog.documents[0]!.id, project),
      target: { kind: 'track', trackId: project.tracks[0]!.id },
    })
  ).rejects.toMatchObject({ code: 'effectKindTargetMismatch' });
});

it('replaces a junction template instead of stacking transition graphs', async () => {
  const catalog = await createRawCatalog('neutral-transition.sniptale-effect.json');
  const project = createProjectWithTransition();
  const target = { kind: 'transition' as const, transitionId: project.transitions![0]!.id };
  const first = await applyEffectCatalogDocument({
    ...createApplyArgs(catalog, catalog.documents[0]!.id, project),
    target,
  });
  const second = await applyEffectCatalogDocument({
    ...createApplyArgs(catalog, catalog.documents[0]!.id, first),
    instanceId: 'replacement',
    target,
  });
  expect(second.effectInstances).toHaveLength(1);
  expect(second.effectInstances![0]).toMatchObject({ id: 'replacement', target });
  expect(first.effectInstances![0]!.id).toBe('effect-instance');
});

it('refuses imported transitions on a locked track', async () => {
  const catalog = await createRawCatalog('neutral-transition.sniptale-effect.json');
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

async function createRawCatalog(filename: string): Promise<EffectBundleCatalogEntry> {
  const imported = await importRawEffectDocument(readFixture(filename));
  if (!imported.ok) throw new Error('Expected valid raw EffectV1 fixture');
  return createEffectCatalogEntry({ document: imported.artifact, kind: 'raw-json' }, 1);
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
        kind: VideoTransitionKind.CROSSFADE,
        leadingClipId: leading.id,
        trailingClipId: trailing.id,
      },
    ],
  };
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

it('inserts standalone annotations only into a free requested video track', async () => {
  const catalog = await createRawCatalog('neutral-standalone.sniptale-effect.json');
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
  const catalog = await createRawCatalog('neutral-standalone.sniptale-effect.json');
  await expect(
    applyEffectCatalogDocument({
      ...createApplyArgs(catalog, catalog.documents[0]!.id, createEmptyVideoProject('lane')),
      target: { kind: 'scene' },
      timelineLaneId: 'missing',
    })
  ).rejects.toEqual(expect.objectContaining({ code: 'effectTargetMissing' }));
});
