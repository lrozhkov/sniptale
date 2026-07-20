import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { resolveEffectRuntimeFramePlans } from '../../composition/effect-runtime/frame/plan';
import { createEmptyVideoProject } from '../factories/creation';
import { createRecordingBaseClip, createRecordingProjectAsset } from '../factories/recording';
import { createEffectHostClip } from '../factories/overlay-clip';
import { syncProjectDuration } from '../timeline/basics';
import { VideoTransitionEasing, VideoTransitionKind, type VideoProject } from '../types';
import { isHydratableVideoProject } from '../validation';
import type { VideoProjectEffectInstance, VideoProjectEffectSnapshot } from './types';

describe('EffectV1 project mutation reconciliation', () => {
  it('recomputes transition timing before render and persistence validation', () => {
    const project = createProjectWithEffects();
    const trailingClipId = project.transitions![0]!.trailingClipId;
    const reconciled = syncProjectDuration({
      ...project,
      clips: project.clips.map((clip) =>
        clip.id === trailingClipId ? { ...clip, startTime: 4.3 } : clip
      ),
    });

    const transition = reconciled.effectInstances?.find(({ id }) => id === 'transition');
    expect(transition?.duration).toBeCloseTo(0.7);
    expect(transition?.playbackRate).toBeCloseTo(3 / 0.7);
    expect(transition?.startTime).toBeCloseTo(4.3);
    expect(isHydratableVideoProject(reconciled)).toBe(true);
    const [plan] = resolveEffectRuntimeFramePlans(reconciled, 4.65);
    expect(plan?.effectInstanceId).toBe('transition');
    expect(plan?.progress).toBeCloseTo(0.5);
  });

  it('prunes instances with deleted targets and their unreferenced snapshots atomically', () => {
    const project = createProjectWithEffects();
    const leadingClipId = project.transitions![0]!.leadingClipId;
    const reconciled = syncProjectDuration({
      ...project,
      clips: project.clips.filter(({ id }) => id !== leadingClipId),
    });

    expect(reconciled.transitions).toEqual([]);
    expect(reconciled.effectInstances?.map(({ id }) => id)).toEqual(['scene']);
    expect(reconciled.effectSnapshots?.map(({ id }) => id)).toEqual([
      reconciled.effectInstances![0]!.snapshotId,
    ]);
    expect(isHydratableVideoProject(reconciled)).toBe(true);
    expect(resolveEffectRuntimeFramePlans(reconciled, 1)).toEqual([
      expect.objectContaining({ effectInstanceId: 'scene' }),
    ]);
  });
});

function createProjectWithEffects(): VideoProject {
  const project = createEmptyVideoProject('effect-reconciliation');
  const { asset, leading, trailing } = createRecordingFixture(project);
  const snapshots = [
    createSnapshot('standalone', 'neutral-standalone.sniptale-effect.json', 'a'),
    createSnapshot('targetEffect', 'neutral-target-effect.sniptale-effect.json', 'b'),
    createSnapshot('transition', 'neutral-transition.sniptale-effect.json', 'c'),
  ] as const;
  const transitionId = 'transition-id';
  return {
    ...project,
    assets: [asset],
    clips: [leading, trailing, createStandaloneHost(project, snapshots[0].duration)],
    duration: 9,
    effectInstances: [
      createInstance('scene', snapshots[0], { kind: 'scene' }, 0, snapshots[0].duration, 1),
      createInstance(
        'clip',
        snapshots[1],
        { clipId: leading.id, kind: 'clip' },
        0,
        snapshots[1].duration,
        1
      ),
      createInstance(
        'transition',
        snapshots[2],
        { kind: 'transition', transitionId },
        4,
        1,
        snapshots[2].duration
      ),
    ],
    effectSnapshots: snapshots.map(({ snapshot }) => snapshot),
    transitions: [
      {
        duration: 1,
        easing: VideoTransitionEasing.LINEAR,
        id: transitionId,
        kind: VideoTransitionKind.CROSSFADE,
        leadingClipId: leading.id,
        trailingClipId: trailing.id,
      },
    ],
  };
}

function createRecordingFixture(project: VideoProject) {
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
  const geometry = { duration: 5, height: 720, width: 1280 };
  const leading = createRecordingBaseClip(asset, geometry, trackId, null);
  const trailing = createRecordingBaseClip(asset, geometry, trackId, null);
  trailing.startTime = 4;
  return { asset, leading, trailing };
}

function createStandaloneHost(project: VideoProject, duration: number) {
  const trackId = project.tracks.find(({ kind }) => kind === 'OVERLAY')?.id;
  if (!trackId) throw new Error('Expected overlay track');
  return createEffectHostClip({
    duration,
    effectInstanceId: 'scene',
    name: 'scene',
    projectHeight: project.height,
    projectWidth: project.width,
    startTime: 0,
    trackId,
  });
}

function createSnapshot(
  kind: VideoProjectEffectSnapshot['kind'],
  filename: string,
  digestCharacter: string
): { duration: number; snapshot: VideoProjectEffectSnapshot } {
  const source = readFileSync(
    new URL(
      `../../../../../../../packages/runtime-contracts/src/effect-v1/fixtures/valid/${filename}`,
      import.meta.url
    ),
    'utf8'
  );
  const document = JSON.parse(source) as { duration: number; id: string };
  const sha256 = digestCharacter.repeat(64);
  return {
    duration: document.duration,
    snapshot: {
      assets: [],
      documentId: document.id,
      id: `effect:${sha256}`,
      kind,
      retainedByteLength: new TextEncoder().encode(source).byteLength,
      schemaVersion: 'sniptale.effect.v1',
      sha256,
      source,
    },
  };
}

function createInstance(
  id: string,
  source: ReturnType<typeof createSnapshot>,
  target: VideoProjectEffectInstance['target'],
  startTime: number,
  duration: number,
  playbackRate: number
): VideoProjectEffectInstance {
  return {
    controls: {},
    duration,
    enabled: true,
    id,
    kind: source.snapshot.kind,
    playbackRate,
    snapshotId: source.snapshot.id,
    startTime,
    target,
  };
}
