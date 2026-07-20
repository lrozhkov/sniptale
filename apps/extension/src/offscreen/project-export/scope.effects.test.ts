import { expect, it } from 'vitest';

import {
  VideoProjectClipType,
  VideoTransitionEasing,
  VideoTransitionKind,
  type VideoProject,
} from '../../features/video/project/types';
import { createEffectHostClip } from '../../features/video/project/factories/overlay-clip';
import { resolveProjectRenderScope } from './scope';
import { createScopeClip, createScopeProject, createScopeSettings } from './scope.test-support';

it('projects transitions and EffectV1 references as a closed selected-clip graph', () => {
  const project = createScopeProject([
    createScopeClip('clip-1', VideoProjectClipType.VIDEO),
    createScopeClip('clip-2', VideoProjectClipType.VIDEO),
    createScopeClip('clip-3', VideoProjectClipType.VIDEO),
  ]);
  project.transitions = [
    createTransition('transition-kept', 'clip-1', 'clip-2'),
    createTransition('transition-dropped', 'clip-2', 'clip-3'),
  ];
  project.effectSnapshots = [
    createSnapshot('snapshot-target', 'targetEffect'),
    createSnapshot('snapshot-transition', 'transition'),
    createSnapshot('snapshot-dropped', 'targetEffect'),
  ];
  project.effectInstances = [
    createInstance('target-kept', 'snapshot-target', 'targetEffect', {
      clipId: 'clip-1',
      kind: 'clip',
    }),
    createInstance('transition-kept', 'snapshot-transition', 'transition', {
      kind: 'transition',
      transitionId: 'transition-kept',
    }),
    createInstance('target-dropped', 'snapshot-dropped', 'targetEffect', {
      clipId: 'clip-3',
      kind: 'clip',
    }),
  ];

  const scoped = resolveProjectRenderScope(
    project,
    createScopeSettings({
      scope: 'selected-clip',
      selectedClipIds: ['clip-1', 'clip-2'],
    })
  );

  expect(scoped.clips.map(({ id }) => id)).toEqual(['clip-1', 'clip-2']);
  expect(scoped.transitions?.map(({ id }) => id)).toEqual(['transition-kept']);
  expect(scoped.effectInstances?.map(({ id }) => id)).toEqual(['target-kept', 'transition-kept']);
  expect(scoped.effectSnapshots?.map(({ id }) => id)).toEqual([
    'snapshot-target',
    'snapshot-transition',
  ]);
});

it('retains a standalone EffectV1 instance only with its selected ordinary clip host', () => {
  const project = createScopeProject([createScopeClip('clip-1', VideoProjectClipType.VIDEO)]);
  const overlayTrack = project.tracks.find(({ kind }) => kind === 'OVERLAY')!;
  const host = createEffectHostClip({
    duration: 1,
    effectInstanceId: 'standalone',
    name: 'Standalone',
    projectHeight: project.height,
    projectWidth: project.width,
    startTime: 0,
    trackId: overlayTrack.id,
  });
  host.id = 'standalone-host';
  project.clips.push(host);
  project.effectSnapshots = [createSnapshot('snapshot-standalone', 'standalone')];
  project.effectInstances = [
    createInstance('standalone', 'snapshot-standalone', 'standalone', { kind: 'scene' }),
  ];

  const withoutHost = resolveProjectRenderScope(
    project,
    createScopeSettings({ scope: 'selected-clip', selectedClipIds: ['clip-1'] })
  );
  expect(withoutHost.effectInstances).toEqual([]);
  expect(withoutHost.effectSnapshots).toEqual([]);

  const withHost = resolveProjectRenderScope(
    project,
    createScopeSettings({ scope: 'selected-clip', selectedClipIds: ['standalone-host'] })
  );
  expect(withHost.effectInstances?.map(({ id }) => id)).toEqual(['standalone']);
  expect(withHost.effectSnapshots?.map(({ id }) => id)).toEqual(['snapshot-standalone']);
});

function createTransition(id: string, leadingClipId: string, trailingClipId: string) {
  return {
    duration: 1,
    easing: VideoTransitionEasing.LINEAR,
    id,
    kind: VideoTransitionKind.CROSSFADE,
    leadingClipId,
    trailingClipId,
  };
}

function createSnapshot(
  id: string,
  kind: 'standalone' | 'targetEffect' | 'transition'
): NonNullable<VideoProject['effectSnapshots']>[number] {
  return {
    assets: [],
    documentId: id,
    id,
    kind,
    retainedByteLength: 2,
    schemaVersion: 'sniptale.effect.v1',
    sha256: id.padEnd(64, '0'),
    source: '{}',
  };
}

function createInstance(
  id: string,
  snapshotId: string,
  kind: 'standalone' | 'targetEffect' | 'transition',
  target: NonNullable<VideoProject['effectInstances']>[number]['target']
): NonNullable<VideoProject['effectInstances']>[number] {
  return {
    controls: {},
    duration: 1,
    enabled: true,
    id,
    kind,
    playbackRate: 1,
    snapshotId,
    startTime: 0,
    target,
  };
}
