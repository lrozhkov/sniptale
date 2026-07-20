import { expect, it } from 'vitest';
import { applyVideoProjectMutationPatch } from '../../project/mutation';
import { createEmptyVideoProject } from '../../project/factories/creation';
import { VideoTransitionEasing, VideoTransitionKind } from '../../project/types/index';
import {
  buildVideoCompositionActionSegments,
  buildVideoCompositionActionSegmentsFromEvents,
  buildVideoCompositionCursorSegments,
  buildVideoCompositionMotionSegments,
  buildVideoCompositionMotionSegmentsFromRegions,
  buildVideoCompositionTransitionSegments,
} from './lanes';
import { createLaneProject, createMergedCursorProject } from './lanes.test-support.ts';

function expectCrossfadeTransitionSegments(project: ReturnType<typeof createLaneProject>) {
  expect(buildVideoCompositionTransitionSegments(project)).toEqual([
    expect.objectContaining({
      end: 5,
      id: 'transition-1',
      leadingClipId: 'clip-a',
      start: 4,
      trailingClipId: 'clip-b',
      transition: expect.objectContaining({
        id: 'transition-1',
        kind: VideoTransitionKind.CROSSFADE,
        renderKind: 'COMPOSITE',
        templateKind: 'CROSSFADE',
      }),
    }),
  ]);
}

it('derives transition segments from crossfade overlaps', () => {
  expectCrossfadeTransitionSegments(createLaneProject());
});

it('keeps transition segment ownership aligned with shared project transitions', () => {
  const project = createLaneProject();

  if (!project.transitions) {
    throw new Error('Expected transitions');
  }

  project.transitions = project.transitions.map((transition) => ({
    ...transition,
    direction: 'LEFT',
    highlightColor: '#22ccff',
    intensity: 'BOLD',
  }));

  expect(buildVideoCompositionTransitionSegments(project)).toEqual([
    expect.objectContaining({
      transition: expect.objectContaining({
        direction: 'LEFT',
        highlightColor: '#22ccff',
        intensity: 'BOLD',
      }),
    }),
  ]);
});

it('derives cursor visibility and action spans from shared temporal data', () => {
  const project = createLaneProject();

  expect(buildVideoCompositionCursorSegments(project)).toEqual([
    { end: 5, id: 'cursor-1', sampleIds: ['cursor-1'], start: 4, visible: true },
    {
      end: project.duration,
      id: 'cursor-2',
      sampleIds: ['cursor-2'],
      start: 5,
      visible: false,
    },
  ]);
  expect(buildVideoCompositionActionSegments(project)).toEqual([
    expect.objectContaining({
      end: 3.7,
      id: 'action-1',
      point: { x: 110, y: 160 },
      start: 3,
    }),
  ]);
  expect(buildVideoCompositionMotionSegments(project)).toEqual([
    expect.objectContaining({
      end: 4.3,
      id: 'motion-1',
      start: 2.5,
    }),
  ]);
  expect(buildVideoCompositionActionSegmentsFromEvents(project.actionEvents)).toEqual(
    buildVideoCompositionActionSegments(project)
  );
  expect(buildVideoCompositionMotionSegmentsFromRegions(project.motionRegions ?? [])).toEqual(
    buildVideoCompositionMotionSegments(project)
  );
});

it('returns empty lanes when a project has no transition, cursor, or action data', () => {
  const project = createEmptyVideoProject('Empty lanes');

  expect(buildVideoCompositionTransitionSegments(project)).toEqual([]);
  expect(buildVideoCompositionCursorSegments(project)).toEqual([]);
  expect(buildVideoCompositionActionSegments(project)).toEqual([]);
  expect(buildVideoCompositionMotionSegments(project)).toEqual([]);
});

it('honors hidden utility lanes for action and camera segments', () => {
  const project = applyVideoProjectMutationPatch(createLaneProject(), {
    utilityLanes: {
      actions: { visible: false, locked: false },
      camera: { visible: false, locked: false },
    },
  });

  expect(buildVideoCompositionActionSegments(project)).toEqual([]);
  expect(buildVideoCompositionMotionSegments(project)).toEqual([]);
  expect(buildVideoCompositionTransitionSegments(project)).toHaveLength(1);
});

it('skips non-overlapping transitions and drops zero-length cursor spans', () => {
  const project = createLaneProject();
  const firstClip = project.clips[0];
  const secondClip = project.clips[1];

  if (!firstClip || !secondClip || !project.cursorTrack) {
    throw new Error('Expected lane project fixtures');
  }

  secondClip.startTime = 5;
  project.transitions = [
    {
      duration: 1,
      easing: VideoTransitionEasing.LINEAR,
      id: 'missing-clips',
      kind: VideoTransitionKind.CROSSFADE,
      leadingClipId: 'missing-a',
      trailingClipId: 'missing-b',
    },
  ];
  project.cursorTrack.samples = [
    { id: 'cursor-1', time: 2, visible: true, x: 0, y: 0 },
    { id: 'cursor-2', time: 2, visible: true, x: 10, y: 10 },
  ];

  expect(buildVideoCompositionTransitionSegments(project)).toEqual([]);
  expect(buildVideoCompositionCursorSegments(project)).toEqual([
    {
      end: project.duration,
      id: 'cursor-2',
      sampleIds: ['cursor-2'],
      start: 2,
      visible: true,
    },
  ]);
});

it('merges contiguous cursor samples into one visible lane span', () => {
  expectMergedVisibleCursorSpans(createMergedCursorProject());
});

function expectMergedVisibleCursorSpans(project: ReturnType<typeof createMergedCursorProject>) {
  expect(buildVideoCompositionCursorSegments(project)).toEqual([
    {
      end: 4,
      id: 'cursor-1',
      sampleIds: ['cursor-1', 'cursor-2', 'cursor-3'],
      start: 1,
      visible: true,
    },
    { end: project.duration, id: 'cursor-4', sampleIds: ['cursor-4'], start: 4, visible: false },
  ]);
}
