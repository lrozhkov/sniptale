import type { EffectBundleCatalogEntry } from '../../../features/video/project/effect-bundle/catalog';
import type {
  VideoProjectEffectInstance,
  VideoProjectEffectSnapshot,
} from '../../../features/video/project/effect-instance/types';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import {
  createEffectHostClip,
  createTextClip,
} from '../../../features/video/project/factories/overlay-clip';
import {
  VideoTransitionEasing,
  VideoTransitionKind,
  type VideoProject,
} from '../../../features/video/project/types';
import { createVideoEditorProjectTestStore } from './test-store.test-support';

export function createStoreWithEffects() {
  const store = createVideoEditorProjectTestStore();
  store.getState().setProject(createProjectWithEffects());
  return store;
}

export function createProjectWithEffects(): VideoProject {
  const project = createEmptyVideoProject('effect-actions');
  const primaryTrackId = project.tracks[0]!.id;
  const overlayTrackId = project.tracks.find(({ kind }) => kind === 'OVERLAY')!.id;
  const leading = createTextClip(primaryTrackId, project.width, project.height, 3);
  leading.id = 'clip-a';
  leading.duration = 2;
  const trailing = createTextClip(primaryTrackId, project.width, project.height, 4);
  trailing.id = 'clip-b';
  trailing.duration = 2;
  const sceneA = createInstance('scene-a', 'snapshot-a', 'standalone', { kind: 'scene' }, 1);
  const sceneB = createInstance('scene-b', 'snapshot-a', 'standalone', { kind: 'scene' }, 5);
  return {
    ...project,
    clips: [leading, trailing, ...createSceneEffectHosts(project, overlayTrackId, sceneA, sceneB)],
    effectInstances: [
      sceneA,
      createInstance('clip', 'snapshot-b', 'targetEffect', { clipId: 'clip-a', kind: 'clip' }, 2),
      sceneB,
      createInstance(
        'transition',
        'snapshot-c',
        'transition',
        { kind: 'transition', transitionId: 'transition-a' },
        4
      ),
    ],
    effectSnapshots: [
      createSnapshot('snapshot-a', 'standalone'),
      createSnapshot('snapshot-b', 'targetEffect'),
      createSnapshot('snapshot-c', 'transition'),
    ],
    transitions: [
      {
        duration: 1,
        easing: VideoTransitionEasing.LINEAR,
        id: 'transition-a',
        kind: VideoTransitionKind.CROSSFADE,
        leadingClipId: leading.id,
        trailingClipId: trailing.id,
      },
    ],
  };
}

type EditorTestState = ReturnType<ReturnType<typeof createVideoEditorProjectTestStore>['getState']>;

export function createApplyArgs(): Parameters<EditorTestState['applyEffectDocument']>[0] {
  return {
    catalog: {
      assets: [],
      createdAt: 1,
      description: { en: '', ru: '' },
      documents: [],
      enabled: true,
      label: { en: 'Effect', ru: 'Эффект' },
      packId: 'effect.test',
      retainedByteLength: 1,
      source: 'raw-json',
      sourceSha256: 'a'.repeat(64),
      updatedAt: 1,
      version: '0.0.0',
    } satisfies EffectBundleCatalogEntry,
    documentId: 'document',
    startTime: 0,
    target: { kind: 'scene' },
  };
}

function createSceneEffectHosts(
  project: VideoProject,
  trackId: string,
  ...instances: VideoProjectEffectInstance[]
) {
  return instances.map((instance) =>
    createEffectHostClip({
      duration: instance.duration,
      effectInstanceId: instance.id,
      name: instance.id,
      projectHeight: project.height,
      projectWidth: project.width,
      startTime: instance.startTime,
      trackId,
    })
  );
}

function createInstance(
  id: string,
  snapshotId: string,
  kind: VideoProjectEffectInstance['kind'],
  target: VideoProjectEffectInstance['target'],
  startTime: number
): VideoProjectEffectInstance {
  return {
    controls: { accent: 1 },
    duration: 2,
    enabled: true,
    id,
    kind,
    playbackRate: 1,
    snapshotId,
    startTime,
    target,
  };
}

function createSnapshot(
  id: string,
  kind: VideoProjectEffectSnapshot['kind']
): VideoProjectEffectSnapshot {
  return {
    assets: [],
    documentId: id,
    id,
    kind,
    retainedByteLength: 1,
    schemaVersion: 'sniptale.effect.v1',
    sha256: 'a'.repeat(64),
    source: '{}',
  };
}
