import { createHash } from 'node:crypto';
import { parseAnimationTemplateSource } from '@sniptale/runtime-contracts/animation-template';
import { createGlTransitionSelection } from '../transition/gl-catalog';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  isHydratableVideoProject,
  isHydratableVideoProjectMetadata,
  type VideoProjectMetadata,
} from './index';
import { createEmptyVideoProject, createVideoProjectTrack } from '../factories/creation';
import { createEffectHostClip } from '../factories/overlay-clip';
import { createRecordingBaseClip, createRecordingProjectAsset } from '../factories/recording';
import type {
  VideoProjectEffectInstance,
  VideoProjectEffectSnapshot,
} from '../effect-instance/types';
import { VideoTrackKind, VideoTransitionEasing, type VideoProject } from '../types';
import {
  hasValidEffectProjectReferences,
  isEffectProjectBranches,
  isEffectProjectMetadataBranches,
} from './effect-instances';

describe('animation project branch boundary', () => {
  it('admits source offsets and refuses malformed offset fields in persisted instances', async () => {
    const snapshot = await createSnapshot();
    const instance = createInstance(snapshot, { kind: 'scene' });
    expect(isEffectProjectBranches([snapshot], [{ ...instance, sourceStart: 1 }])).toBe(true);
    for (const sourceStart of [-1, NaN, Infinity, '1', null]) {
      expect(isEffectProjectBranches([snapshot], [{ ...instance, sourceStart }])).toBe(false);
    }
  });
  it('accepts absent or exact snapshot and instance branches', async () => {
    const snapshot = await createSnapshot();
    const instance = createInstance(snapshot, { kind: 'scene' });

    expect(isEffectProjectBranches(undefined, undefined)).toBe(true);
    expect(isEffectProjectBranches([snapshot], [instance])).toBe(true);
    expect(isEffectProjectMetadataBranches([snapshot], [instance])).toBe(true);
  });

  it('rejects non-arrays, limits, duplicate snapshots, and missing references', async () => {
    const snapshot = await createSnapshot();
    const instance = createInstance(snapshot, { kind: 'scene' });

    expect(isEffectProjectBranches({}, [])).toBe(false);
    expect(isEffectProjectBranches([], {})).toBe(false);
    expect(isEffectProjectBranches(Array.from({ length: 101 }), [])).toBe(false);
    expect(isEffectProjectBranches([], Array.from({ length: 1_001 }))).toBe(false);
    expect(isEffectProjectBranches([snapshot, snapshot], [instance])).toBe(false);
    expect(isEffectProjectBranches([], [instance])).toBe(false);
  });

  it('rejects malformed snapshot identity, source, retained bytes, and assets', async () => {
    const snapshot = await createSnapshot();

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

describe('animation project quota and instance boundary', () => {
  it('enforces aggregate metadata quota without allocating retained blobs', async () => {
    const snapshot = await createSnapshot();
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
    const snapshot = await createSnapshot();
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

describe('animation project semantic references', () => {
  it('accepts a scene annotation independently of the ordinary GL source transition', async () => {
    const standalone = await createSnapshot();
    const project = createProjectWithTargets(),
      instance = createInstance(standalone, { kind: 'scene' }, 'standalone');
    project.effectSnapshots = [standalone];
    project.effectInstances = [instance];
    project.clips.push(createHost(project, instance));
    expect(isEffectProjectBranches(project.effectSnapshots, project.effectInstances)).toBe(true);
    expect(hasValidEffectProjectReferences(project)).toBe(true);
    for (const target of [
      { kind: 'clip', clipId: project.clips[0]!.id },
      { kind: 'track', trackId: project.tracks[0]!.id },
      { kind: 'video-group' },
      { kind: 'transition', transitionId: project.transitions![0]!.id },
    ]) {
      expect(isEffectProjectBranches([standalone], [{ ...instance, target }])).toBe(false);
    }
  });

  it('rejects duplicate ids, kind drift, missing targets, and transition reuse', async () => {
    const standalone = await createSnapshot();
    const transition = standalone;
    const project = createProjectWithTargets();
    const scene = createInstance(standalone, { kind: 'scene' }, 'shared');
    project.clips.push(createHost(project, scene));
    project.effectSnapshots = [standalone];

    project.effectInstances = [scene, { ...scene }];
    expect(hasValidEffectProjectReferences(project)).toBe(false);
    const retired = { ...scene };
    Reflect.set(retired, 'kind', 'transition');
    project.effectInstances = [retired];
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

async function createSnapshot(): Promise<VideoProjectEffectSnapshot> {
  const source = readFileSync(
    'apps/extension/public/video-effects/animations/title.sniptale-animation.json',
    'utf8'
  );
  const parsed = parseAnimationTemplateSource(source);
  if (!parsed.ok) throw new Error('Expected valid animation fixture.');
  const sha256 = createHash('sha256').update(source).digest('hex');
  return {
    assets: [],
    documentId: parsed.template.id,
    id: `effect:${sha256}`,
    kind: 'standalone',
    retainedByteLength: Buffer.byteLength(source),
    schemaVersion: 'sniptale.animation.v1',
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
    trackId: project.tracks.find(({ name }) => name === 'Overlay')!.id,
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
  project.tracks.push(createVideoProjectTrack('Overlay', 0, VideoTrackKind.PRIMARY));
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
        kind: 'gl' as const,
        selection: createGlTransitionSelection('Fade')!,
        leadingClipId: leading.id,
        trailingClipId: trailing.id,
      },
    ],
  };
}

it('admits self-contained animation metadata and refuses detached resource metadata in both phases', async () => {
  const snapshot = await createSnapshot();
  const metadata: VideoProjectMetadata = {
    ...createEmptyVideoProject('Self-contained resources'),
    effectSnapshots: [snapshot],
  };
  const before = structuredClone(metadata);
  expect(isHydratableVideoProjectMetadata(metadata)).toBe(true);
  expect(isHydratableVideoProject(metadata)).toBe(true);
  const detached = {
    ...metadata,
    effectSnapshots: [
      {
        ...snapshot,
        retainedByteLength: snapshot.retainedByteLength + 3,
        assets: [
          {
            id: 'image',
            kind: 'image',
            mimeType: 'image/png',
            byteLength: 3,
            sha256: 'a'.repeat(64),
          },
        ],
      },
    ],
  };
  expect(isHydratableVideoProjectMetadata(detached)).toBe(false);
  expect(isHydratableVideoProject(detached)).toBe(false);
  const withBlob = {
    ...detached,
    effectSnapshots: detached.effectSnapshots.map((entry) => ({
      ...entry,
      assets: entry.assets.map((asset) => ({ ...asset, blob: new Blob(['png']) })),
    })),
  };
  expect(isHydratableVideoProjectMetadata(withBlob)).toBe(false);
  expect(isHydratableVideoProject(withBlob)).toBe(false);
  expect(metadata).toEqual(before);
});

it('uses the same shape rules for project metadata and native projects', () => {
  const project = createEmptyVideoProject('Metadata');
  const metadata: VideoProjectMetadata = project;
  expect(isHydratableVideoProjectMetadata(metadata)).toBe(true);
  for (const version of [49, 50, 51, 52, 53, 54, 55]) {
    const candidate = { ...project, version };
    expect(isHydratableVideoProject(candidate)).toBe(true);
    expect(isHydratableVideoProjectMetadata(candidate)).toBe(true);
  }
  for (const patch of [
    { id: 7 },
    { width: NaN },
    { duration: -1 },
    { version: 56 },
    { source: { kind: 'unsupported' } },
    { templateInstances: [] },
    { actionPresentation: { enabled: 'yes' } },
  ]) {
    const candidate = { ...project, ...patch };
    expect(isHydratableVideoProject(candidate)).toBe(false);
    expect(isHydratableVideoProjectMetadata(candidate)).toBe(false);
  }
});

it('preserves recording and scenario source shape admission in the metadata phase', () => {
  const project = createEmptyVideoProject('Source families');
  for (const source of [
    { kind: 'manual' },
    { kind: 'recording', recordingId: 'retained-recording' },
    { kind: 'scenario', scenarioProjectId: 'retained-scenario' },
  ]) {
    const candidate = { ...project, source };
    expect(isHydratableVideoProjectMetadata(candidate)).toBe(isHydratableVideoProject(candidate));
    expect(isHydratableVideoProjectMetadata(candidate)).toBe(true);
  }
});

it('admits canonical catalogue provenance through192 characters without widening builtin identity', async () => {
  const snapshot = await createSnapshot();
  const instance = createInstance(snapshot, { kind: 'scene' });
  for (const catalogPackId of ['animation.' + 'a'.repeat(128), 'a'.repeat(192)]) {
    expect(isEffectProjectBranches([snapshot], [{ ...instance, catalogPackId }])).toBe(true);
  }
  for (const catalogPackId of ['a'.repeat(193), 'builtin:' + 'a'.repeat(129), '../package', '']) {
    expect(isEffectProjectBranches([snapshot], [{ ...instance, catalogPackId }])).toBe(false);
  }
});
