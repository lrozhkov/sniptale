import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  sha256EffectV1Bytes,
  validateEffectV1Document,
} from '@sniptale/runtime-contracts/effect-v1';

import { createEmptyVideoProject } from '../factories/creation';
import { createEffectHostClip } from '../factories/overlay-clip';
import { createRecordingBaseClip, createRecordingProjectAsset } from '../factories/recording';
import type {
  VideoProjectEffectInstance,
  VideoProjectEffectSnapshot,
} from '../effect-instance/types';
import { VideoTransitionEasing, VideoTransitionKind, type VideoProject } from '../types';
import {
  hasValidEffectProjectReferences,
  isEffectProjectBranches,
  isEffectProjectMetadataBranches,
} from './effect-instances';

describe('EffectV1 project branch boundary', () => {
  it('accepts absent or exact snapshot and instance branches', async () => {
    const snapshot = await createSnapshot('neutral-standalone.sniptale-effect.json');
    const instance = createInstance(snapshot, { kind: 'scene' });

    expect(isEffectProjectBranches(undefined, undefined)).toBe(true);
    expect(isEffectProjectBranches([snapshot], [instance])).toBe(true);
    expect(isEffectProjectMetadataBranches([snapshot], [instance])).toBe(true);
  });

  it('rejects non-arrays, limits, duplicate snapshots, and missing references', async () => {
    const snapshot = await createSnapshot('neutral-standalone.sniptale-effect.json');
    const instance = createInstance(snapshot, { kind: 'scene' });

    expect(isEffectProjectBranches({}, [])).toBe(false);
    expect(isEffectProjectBranches([], {})).toBe(false);
    expect(isEffectProjectBranches(Array.from({ length: 101 }), [])).toBe(false);
    expect(isEffectProjectBranches([], Array.from({ length: 1_001 }))).toBe(false);
    expect(isEffectProjectBranches([snapshot, snapshot], [instance])).toBe(false);
    expect(isEffectProjectBranches([], [instance])).toBe(false);
  });

  it('rejects malformed snapshot identity, source, retained bytes, and assets', async () => {
    const snapshot = await createSnapshot('neutral-standalone.sniptale-effect.json');

    expect(isEffectProjectBranches([{ ...snapshot, id: 'wrong' }], [])).toBe(false);
    expect(isEffectProjectBranches([{ ...snapshot, source: '{}' }], [])).toBe(false);
    expect(
      isEffectProjectBranches(
        [{ ...snapshot, retainedByteLength: snapshot.retainedByteLength + 1 }],
        []
      )
    ).toBe(false);
    expect(
      isEffectProjectBranches(
        [{ ...snapshot, assets: Array.from({ length: 201 }, () => ({})) }],
        []
      )
    ).toBe(false);
  });
});

describe('EffectV1 project quota and instance boundary', () => {
  it('enforces aggregate metadata quota without allocating retained blobs', async () => {
    const snapshot = await createSnapshot('neutral-standalone.sniptale-effect.json');
    const byteLength = 512 * 1024 * 1024;
    const oversized = {
      ...snapshot,
      assets: [
        {
          byteLength,
          id: 'asset',
          kind: 'image',
          mimeType: 'image/png',
          sha256: 'a'.repeat(64),
        },
      ],
      retainedByteLength: snapshot.retainedByteLength + byteLength,
    };

    expect(isEffectProjectMetadataBranches([oversized], [])).toBe(false);
  });

  it('rejects malformed instance timing, controls, and targets', async () => {
    const snapshot = await createSnapshot('neutral-standalone.sniptale-effect.json');
    const instance = createInstance(snapshot, { kind: 'scene' });

    expect(isEffectProjectBranches([snapshot], [{ ...instance, duration: 0 }])).toBe(false);
    expect(isEffectProjectBranches([snapshot], [{ ...instance, startTime: -1 }])).toBe(false);
    expect(
      isEffectProjectBranches([snapshot], [{ ...instance, controls: { accent: Infinity } }])
    ).toBe(false);
    expect(isEffectProjectBranches([snapshot], [{ ...instance, target: { kind: 'clip' } }])).toBe(
      false
    );
  });
});

describe('EffectV1 project semantic references', () => {
  it('accepts scene, clip, and unique transition targets with matching snapshots', async () => {
    const standalone = await createSnapshot('neutral-standalone.sniptale-effect.json');
    const targetEffect = await createSnapshot('neutral-target-effect.sniptale-effect.json');
    const transition = await createSnapshot('neutral-transition.sniptale-effect.json');
    const project = createProjectWithTargets();
    project.effectSnapshots = [standalone, targetEffect, transition];
    const standaloneInstance = createInstance(standalone, { kind: 'scene' }, 'standalone');
    project.effectInstances = [
      standaloneInstance,
      createInstance(targetEffect, { clipId: project.clips[0]!.id, kind: 'clip' }, 'target'),
      createInstance(
        transition,
        { kind: 'transition', transitionId: project.transitions![0]!.id },
        'transition'
      ),
    ];
    project.clips.push(createHost(project, standaloneInstance));

    expect(hasValidEffectProjectReferences(project)).toBe(true);
  });

  it('rejects duplicate ids, kind drift, missing targets, and transition reuse', async () => {
    const standalone = await createSnapshot('neutral-standalone.sniptale-effect.json');
    const transition = await createSnapshot('neutral-transition.sniptale-effect.json');
    const project = createProjectWithTargets();
    const scene = createInstance(standalone, { kind: 'scene' }, 'shared');
    project.clips.push(createHost(project, scene));
    project.effectSnapshots = [standalone, transition];

    project.effectInstances = [scene, { ...scene }];
    expect(hasValidEffectProjectReferences(project)).toBe(false);
    project.effectInstances = [{ ...scene, kind: 'transition' }];
    expect(hasValidEffectProjectReferences(project)).toBe(false);
    project.effectInstances = [
      createInstance(standalone, { clipId: 'missing', kind: 'clip' }, 'missing'),
    ];
    expect(hasValidEffectProjectReferences(project)).toBe(false);
    const transitionTarget: VideoProjectEffectInstance['target'] = {
      kind: 'transition',
      transitionId: project.transitions![0]!.id,
    };
    project.effectInstances = [
      createInstance(transition, transitionTarget, 'first'),
      createInstance(transition, transitionTarget, 'second'),
    ];
    expect(hasValidEffectProjectReferences(project)).toBe(false);
  });
});

async function createSnapshot(filename: string): Promise<VideoProjectEffectSnapshot> {
  const source = readFileSync(fixtureUrl(filename), 'utf8');
  const validation = validateEffectV1Document(JSON.parse(source));
  if (!validation.document) throw new Error('Expected valid EffectV1 fixture');
  const sha256 = await sha256EffectV1Bytes(new TextEncoder().encode(source));
  return {
    assets: [],
    documentId: validation.document.id,
    id: `effect:${sha256}`,
    kind: validation.document.kind,
    retainedByteLength: new TextEncoder().encode(source).byteLength,
    schemaVersion: 'sniptale.effect.v1',
    sha256,
    source,
  };
}

function createHost(project: VideoProject, instance: VideoProjectEffectInstance) {
  return createEffectHostClip({
    duration: instance.duration,
    effectInstanceId: instance.id,
    name: instance.id,
    projectHeight: project.height,
    projectWidth: project.width,
    startTime: instance.startTime,
    trackId: project.tracks.find(({ kind }) => kind === 'OVERLAY')!.id,
  });
}

function createInstance(
  snapshot: VideoProjectEffectSnapshot,
  target: VideoProjectEffectInstance['target'],
  id = 'instance'
): VideoProjectEffectInstance {
  return {
    controls: {},
    duration: 1,
    enabled: true,
    id,
    kind: snapshot.kind,
    playbackRate: 1,
    snapshotId: snapshot.id,
    startTime: 0,
    target,
  };
}

function createProjectWithTargets(): VideoProject {
  const project = createEmptyVideoProject('references');
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

function fixtureUrl(filename: string): URL {
  return new URL(
    `../../../../../../../packages/runtime-contracts/src/effect-v1/fixtures/valid/${filename}`,
    import.meta.url
  );
}
