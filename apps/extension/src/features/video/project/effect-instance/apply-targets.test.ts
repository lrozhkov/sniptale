import { readFileSync } from 'node:fs';

import { expect, it } from 'vitest';

import { createEffectCatalogEntry } from '../../../../composition/persistence/effect-bundles/catalog-builder';
import type { EffectBundleCatalogEntry } from '../effect-bundle/catalog';
import { importRawEffectDocument } from '../effect-bundle/import/zip';
import { createEmptyVideoProject } from '../factories/creation';
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
    expect.objectContaining({ duration: 3, playbackRate: 1, startTime: 2 })
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

it('rejects audio and standalone-host clips as target-effect inputs', async () => {
  const catalog = await createRawCatalog('neutral-target-effect.sniptale-effect.json');
  const project = createProjectWithTransition();
  const audioTrack = project.tracks.find(({ kind }) => kind === VideoTrackKind.AUDIO)!;
  const audio = createRecordingAudioClip(project.assets[0]!, audioTrack.id, 1, 'audio-group');
  const overlayTrack = project.tracks.find(({ kind }) => kind === VideoTrackKind.OVERLAY)!;
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

it('rejects a second EffectV1 document for the same transition target', async () => {
  const catalog = await createRawCatalog('neutral-transition.sniptale-effect.json');
  const project = createProjectWithTransition();
  const transitionId = project.transitions![0]!.id;
  const first = await applyEffectCatalogDocument({
    ...createApplyArgs(catalog, catalog.documents[0]!.id, project),
    target: { kind: 'transition', transitionId },
  });

  await expect(
    applyEffectCatalogDocument({
      ...createApplyArgs(catalog, catalog.documents[0]!.id, first),
      instanceId: 'second-transition-effect',
      target: { kind: 'transition', transitionId },
    })
  ).rejects.toEqual(expect.objectContaining({ code: 'effectKindTargetMismatch' }));
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
