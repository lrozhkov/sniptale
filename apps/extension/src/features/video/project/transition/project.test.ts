import { describe, expect, it, vi } from 'vitest';
import { buildProjectTransitionSegments } from './project';
import { createEmptyVideoProject, createVideoProjectAsset } from '../factories/creation';
import { createAnnotationClip } from '../factories/overlay-clip';
import { normalizeVideoProjectTransition } from './template';
import { createVideoClipFromAsset } from '../factories/clip';
import { getProjectTransitionById, syncProjectTransitions } from './project';
import { createVideoProjectClipLogicalLaneId } from '../timeline/logical-lanes';
import type { VideoProjectClip, VideoProjectTransition } from '../types/index';
import { VideoProjectAssetType, VideoTransitionEasing, VideoTransitionKind } from '../types/index';

function createImageAsset(id: string) {
  return createVideoProjectAsset(
    `Asset ${id}`,
    VideoProjectAssetType.IMAGE,
    { kind: 'project-asset', projectAssetId: id },
    {
      audioPeaks: null,
      duration: null,
      hasAudio: false,
      height: 720,
      mimeType: 'image/png',
      size: 1,
      width: 1280,
    }
  );
}

function createTransitionProject() {
  const project = createEmptyVideoProject('Transitions', 1280, 720);
  const trackId = project.tracks[0]?.id ?? '';
  const firstAsset = createImageAsset('asset-1');
  const secondAsset = createImageAsset('asset-2');
  const firstClip = createVideoClipFromAsset(trackId, firstAsset, 1280, 720, 0);
  const secondClip = createVideoClipFromAsset(trackId, secondAsset, 1280, 720, 4);

  firstClip.id = 'clip-a';
  firstClip.duration = 5;
  firstClip.timelineLaneId = createVideoProjectClipLogicalLaneId(0);
  secondClip.id = 'clip-b';
  secondClip.duration = 5;
  secondClip.timelineLaneId = createVideoProjectClipLogicalLaneId(0);
  const transitions: VideoProjectTransition[] = [
    {
      duration: 1,
      easing: VideoTransitionEasing.EASE_IN_OUT,
      id: 'transition-1',
      kind: VideoTransitionKind.CROSSFADE,
      leadingClipId: 'clip-a',
      trailingClipId: 'clip-b',
    },
  ];

  return {
    ...project,
    assets: [firstAsset, secondAsset],
    clips: [firstClip, secondClip],
    transitions,
  };
}

describe('shared video project transitions', () => {
  it(
    'keeps valid overlap transitions and removes stale junctions automatically',
    verifyOverlapSync
  );
  it(
    'creates transition entities from legacy clip flags when a junction overlaps',
    verifyLegacyClipFlags
  );
  it('treats missing clip logical lane ids as the default transition lane', () => {
    const project = createTransitionProject();
    project.clips = project.clips.map((clip) => ({ ...clip, timelineLaneId: null }));

    expect(syncProjectTransitions(project).transitions).toEqual([
      expect.objectContaining({
        leadingClipId: 'clip-a',
        trailingClipId: 'clip-b',
      }),
    ]);
  });
  it('does not create transitions for parallel clips on different logical lines', () => {
    const project = createTransitionProject();
    project.clips = project.clips.map((clip, index) => ({
      ...clip,
      timelineLaneId: createVideoProjectClipLogicalLaneId(index),
    }));

    expect(syncProjectTransitions(project).transitions).toEqual([]);
  });
  registerTransitionBoundaryGuardTests();
  it(
    'builds transition segments with normalized metadata for valid clip junctions',
    verifyLightSweepSegments
  );
});

function registerTransitionBoundaryGuardTests() {
  it('does not create transitions when one clip fully contains another clip', () => {
    const project = createTransitionProject();
    project.clips = project.clips.map((clip) =>
      clip.id === 'clip-b' ? { ...clip, duration: 2, startTime: 1 } : clip
    );

    expect(syncProjectTransitions(project).transitions).toEqual([]);
    expect(buildProjectTransitionSegments(project)).toEqual([]);
  });
  it('does not create transitions between annotation and media clips on the same lane', () => {
    const project = createTransitionProject();
    const annotationClip = createAnnotationClip(project.tracks[0]!.id, 1280, 720, 4);
    annotationClip.id = 'annotation-1';
    annotationClip.duration = 2;
    annotationClip.timelineLaneId = project.clips[0]!.timelineLaneId ?? null;
    (project as { clips: VideoProjectClip[] }).clips = [project.clips[0]!, annotationClip];
    project.transitions = [
      normalizeVideoProjectTransition({
        duration: 1,
        easing: VideoTransitionEasing.LINEAR,
        id: 'transition-annotation',
        kind: VideoTransitionKind.CROSSFADE,
        leadingClipId: 'clip-a',
        trailingClipId: 'annotation-1',
      }),
    ];

    expect(syncProjectTransitions(project).transitions).toEqual([]);
    expect(buildProjectTransitionSegments(project)).toEqual([]);
  });
}

function createLightSweepTransitionProject() {
  const project = createTransitionProject();
  project.transitions = [
    normalizeVideoProjectTransition({
      direction: 'RIGHT',
      duration: 1,
      easing: VideoTransitionEasing.LINEAR,
      highlightColor: '#22ccff',
      id: 'transition-1',
      intensity: 'BOLD',
      kind: VideoTransitionKind.LIGHT_SWEEP,
      renderKind: 'CSS_LIKE',
      templateKind: 'LIGHT_SWEEP',
      leadingClipId: 'clip-a',
      trailingClipId: 'clip-b',
    }),
  ];

  return project;
}

function verifyOverlapSync() {
  const project = createTransitionProject();

  const synced = syncProjectTransitions(project);
  expect(getProjectTransitionById(synced, 'transition-1')).toEqual(
    expect.objectContaining({
      easing: VideoTransitionEasing.EASE_IN_OUT,
      leadingClipId: 'clip-a',
      renderKind: 'COMPOSITE',
      templateKind: 'CROSSFADE',
      trailingClipId: 'clip-b',
    })
  );

  const separated = syncProjectTransitions({
    ...project,
    clips: project.clips.map((clip) => (clip.id === 'clip-b' ? { ...clip, startTime: 5 } : clip)),
  });
  expect(separated.transitions).toEqual([]);
  expect(getProjectTransitionById(separated, 'transition-1')).toBeNull();
}

function verifyLegacyClipFlags() {
  const project = createTransitionProject();
  project.transitions = [];
  project.clips = project.clips.map((clip) =>
    clip.id === 'clip-a'
      ? { ...clip, transitionOut: 'CROSSFADE' }
      : { ...clip, transitionIn: 'CROSSFADE' }
  );
  vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001');

  const synced = syncProjectTransitions(project);
  expect(synced.transitions).toHaveLength(1);
  expect(synced.transitions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: '00000000-0000-4000-8000-000000000001',
        kind: VideoTransitionKind.CROSSFADE,
        renderKind: 'COMPOSITE',
        templateKind: 'CROSSFADE',
      }),
    ])
  );
}

function verifyLightSweepSegments() {
  expect(buildProjectTransitionSegments(createLightSweepTransitionProject())).toEqual([
    expect.objectContaining({
      leadingClipId: 'clip-a',
      trailingClipId: 'clip-b',
      transition: expect.objectContaining({
        direction: 'RIGHT',
        highlightColor: '#22ccff',
        intensity: 'BOLD',
        renderKind: 'CSS_LIKE',
        templateKind: 'LIGHT_SWEEP',
      }),
    }),
  ]);
}
