import { describe, expect, it, vi } from 'vitest';
import { buildProjectTransitionSegments } from './project';
import { createEmptyVideoProject, createVideoProjectAsset } from '../factories/creation';
import { createAnnotationClip } from '../factories/overlay-clip';
import { parseVideoProjectTransition } from './contract';
import { createGlTransitionSelection } from './gl-catalog';
import { resolveClipTransitionAudioMultiplier } from './visual-state';
import { createVideoClipFromAsset } from '../factories/clip';
import { getProjectTransitionById, syncProjectTransitions } from './project';
import { createVideoProjectClipLogicalLaneId } from '../timeline/logical-lanes';
import type { VideoProjectClip, VideoProjectTransition } from '../types/index';
import { VideoProjectAssetType, VideoTransitionEasing } from '../types/index';

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
      kind: 'gl',
      selection: createGlTransitionSelection('Fade')!,
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
    'creates explicit transition entities for overlapping montage clips regardless of old flags',
    verifyMontageOverlapCreation
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
  it('creates transitions between annotation and media clips on the same lane', () => {
    const project = createTransitionProject();
    const annotationClip = createAnnotationClip(project.tracks[0]!.id, 1280, 720, 4);
    annotationClip.id = 'annotation-1';
    annotationClip.duration = 2;
    annotationClip.timelineLaneId = project.clips[0]!.timelineLaneId ?? null;
    (project as { clips: VideoProjectClip[] }).clips = [project.clips[0]!, annotationClip];
    project.transitions = [
      admitTransition({
        duration: 1,
        easing: VideoTransitionEasing.LINEAR,
        id: 'transition-annotation',
        kind: 'gl',
        selection: createGlTransitionSelection('Fade')!,
        leadingClipId: 'clip-a',
        trailingClipId: 'annotation-1',
      }),
    ];

    expect(syncProjectTransitions(project).transitions).toHaveLength(1);
    expect(buildProjectTransitionSegments(project)).toHaveLength(1);
  });
}

function createLightSweepTransitionProject() {
  const project = createTransitionProject();
  project.transitions = [
    admitTransition({
      duration: 1,
      easing: VideoTransitionEasing.LINEAR,
      id: 'transition-1',
      kind: 'gl',
      selection: createGlTransitionSelection('CrossZoom')!,
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

function verifyMontageOverlapCreation() {
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
        kind: 'gl',
        selection: createGlTransitionSelection('Fade')!,
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
        selection: expect.objectContaining({ name: 'CrossZoom' }),
      }),
    }),
  ]);
}

it.each(['motion', 'background'])(
  'retains normalized transition and clip identities after a %s edit',
  (kind) => {
    const project = syncProjectTransitions(createTransitionProject());
    const edited =
      kind === 'motion'
        ? { ...project, motionRegions: [] }
        : { ...project, sceneBackground: { kind: 'solid' as const, color: '#123456' } };
    const next = syncProjectTransitions(edited);
    expect(next.clips).toBe(project.clips);
    expect(next.transitions).toBe(project.transitions);
    expect(next.transitions![0]).toBe(project.transitions![0]);
  }
);

it('updates changed flags and transition controls after preserving a normalized snapshot', () => {
  const project = syncProjectTransitions(createTransitionProject());
  const original = structuredClone(project);
  const edited = {
    ...project,
    clips: project.clips.map((clip) => ({
      ...clip,
      transitionIn: 'NONE' as const,
      transitionOut: 'NONE' as const,
    })),
    transitions: project.transitions!.map((transition) => ({
      ...transition,
      duration: 99,
    })),
  };
  const next = syncProjectTransitions(edited);
  expect(next.clips).not.toBe(edited.clips);
  expect(next.transitions).not.toBe(edited.transitions);
  expect(next.clips).toEqual(project.clips);
  expect(next.transitions).toEqual(project.transitions);
  expect(project).toEqual(original);
});

it.each([undefined, []])(
  'does not render implicit transitions from old clip flags with explicit inventory %j',
  (transitions) => {
    const { transitions: _stored, ...project } = createTransitionProject();
    const flagged = {
      ...project,
      ...(transitions ? { transitions } : {}),
      clips: project.clips.map((clip) =>
        clip.id === 'clip-a'
          ? { ...clip, transitionOut: 'CROSSFADE' as const }
          : { ...clip, transitionIn: 'CROSSFADE' as const }
      ),
    };
    expect(buildProjectTransitionSegments(flagged)).toEqual([]);
  }
);

it('does not synthesize a second rendering transition for a flagged pair outside the explicit inventory', () => {
  const project = createTransitionProject();
  const third = {
    ...project.clips[1]!,
    id: 'clip-c',
    startTime: 8,
    transitionIn: 'CROSSFADE' as const,
  };
  const flagged = {
    ...project,
    clips: [
      ...project.clips.map((clip) => ({ ...clip, transitionOut: 'CROSSFADE' as const })),
      third,
    ],
  };
  const before = structuredClone(flagged);
  const segments = buildProjectTransitionSegments(flagged);
  expect(segments.map((segment) => segment.id)).toEqual(['transition-1']);
  expect(flagged).toEqual(before);
});

function admitTransition(value: unknown): VideoProjectTransition {
  const accepted = parseVideoProjectTransition(value);
  if (!accepted) throw new Error('Expected valid explicit GL transition.');
  return accepted;
}

it('uses the directed visual fold for audio weights across an active A/B/C chain', () => {
  const project = createTransitionProject();
  const [a, b] = project.clips;
  if (!a || !b) throw new Error('Expected clips.');
  const c = { ...b, id: 'clip-c', startTime: 6, duration: 10 };
  project.clips = [{ ...a, duration: 10 }, { ...b, duration: 10 }, c];
  project.transitions = [
    admitTransition({
      id: 'AB',
      leadingClipId: a.id,
      trailingClipId: b.id,
      duration: 6,
      easing: 'LINEAR',
      kind: 'audio',
    }),
    admitTransition({
      id: 'BC',
      leadingClipId: b.id,
      trailingClipId: c.id,
      duration: 8,
      easing: 'LINEAR',
      kind: 'audio',
    }),
  ];
  const time = 8,
    ab = (time - 4) / 6,
    bc = (time - 6) / 8;
  expect(resolveClipTransitionAudioMultiplier(project, project.clips[0]!, time)).toBeCloseTo(
    (1 - ab) * (1 - bc)
  );
  expect(resolveClipTransitionAudioMultiplier(project, project.clips[1]!, time)).toBeCloseTo(
    ab * (1 - bc)
  );
  expect(resolveClipTransitionAudioMultiplier(project, c, time)).toBeCloseTo(bc);
});
