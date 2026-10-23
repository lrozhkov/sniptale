import { createVideoProjectFromRecording } from '../../project/factories/creation';
import { projectMotionSourceBinding } from '../../project/motion/source-binding';
import { projectReviewFocus } from '../../review/focus-edits';
import { buildReviewTimeMap } from '../../review/timeline';
import { planReviewProjectTimeline } from '../../review/project-timeline';
import type { ReviewEdit } from '../../review/types';
import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../project/factories/creation';
import { createVideoProjectMotionRegion } from '../../project/motion';
import { applyVideoProjectMutationPatch } from '../../project/mutation';
import { evaluateQuickEditCameraAtTime } from '../../review/advanced/scene';
import type { QuickEditZoomRegion, QuickEditZoomTransition } from '../../review/advanced/types';
import { resolveVideoCompositionCamera } from './index';

function fixture(
  enter: QuickEditZoomTransition['type'],
  exit: QuickEditZoomTransition['type'],
  duration = 2,
  inOut = 0.5
) {
  const gallery: QuickEditZoomRegion = {
    id: 'camera',
    start: 1,
    end: 1 + duration,
    transform: { scale: 3, centerX: 0.35, centerY: 0.65 },
    enter: { type: enter, duration: inOut },
    exit: { type: exit, duration: inOut },
  };
  const base = createEmptyVideoProject('Camera phases', 1280, 720);
  const region = {
    ...createVideoProjectMotionRegion(base, 1, { enter, exit }),
    id: 'camera',
    duration,
    scale: 3,
    focusMode: 'MANUAL' as const,
    focusPoint: { x: 448, y: 468 },
    zoomInDuration: inOut,
    zoomOutDuration: inOut,
  };
  const project = applyVideoProjectMutationPatch(base, { duration: 8, motionRegions: [region] });
  return {
    project,
    gallery: (time: number) => evaluateQuickEditCameraAtTime([gallery], time),
    montage: (time: number) =>
      resolveVideoCompositionCamera({
        project,
        currentTime: time,
        actions: [],
        cursorSample: null,
      }),
  };
}

it.each([
  ['linear', 'linear'],
  ['ease-in-out', 'linear'],
  ['linear', 'ease-in-out'],
  ['none', 'none'],
] as const)('matches Gallery %s entrance and %s exit', (enter, exit) => {
  const f = fixture(enter, exit);
  for (const time of [1, 1.125, 1.25, 1.499, 2, 2.501, 2.75, 2.875, 2.999]) {
    const actual = f.montage(time);
    const expected = f.gallery(time);
    expect(actual.scale, `at ${time}`).toBeCloseTo(expected.scale, 9);
    const offset = (center: number) =>
      Math.max(0, Math.min(expected.scale - 1, center * expected.scale - 0.5));
    expect((actual.viewportX * actual.scale) / f.project.width).toBeCloseTo(
      offset(expected.centerX),
      9
    );
    expect((actual.viewportY * actual.scale) / f.project.height).toBeCloseTo(
      offset(expected.centerY),
      9
    );
  }
});

it('fits the active pair against the retained animation duration', () => {
  const f = fixture('linear', 'linear', 4, 3);
  for (const time of [1, 2, 3, 3.5, 4, 4.75])
    expect(f.montage(time).scale).toBeCloseTo(f.gallery(time).scale, 9);
});

it('keeps legacy curves when independent phase settings are absent', () => {
  const project = createEmptyVideoProject('Legacy camera', 1280, 720);
  project.duration = 6;
  const region = {
    ...createVideoProjectMotionRegion(project, 1),
    duration: 2,
    scale: 3,
    zoomInDuration: 0.5,
    zoomOutDuration: 0.5,
  };
  project.motionRegions = [region];
  const sample = (time: number) =>
    resolveVideoCompositionCamera({ project, currentTime: time, actions: [], cursorSample: null });
  expect(sample(1.125).scale).toBe(1.125);
  region.easing = 'INSTANT';
  expect(sample(1).scale).toBe(1);
  expect(sample(2.5).scale).toBe(3);
  expect(sample(2.501).scale).toBe(1);
});

it('preserves Gallery phases through mixed speeds and restores source framing on untrim', () => {
  const source = { width: 1280, height: 720, duration: 8, mimeType: 'video/webm', size: 100 };
  const seed = createVideoProjectFromRecording({
    ...source,
    recordingId: 'recording',
    filename: 'Source.webm',
    hasAudio: false,
  });
  const video = seed.clips[0]!;
  if (video.type !== 'VIDEO') throw new Error('Expected video');
  const edits: ReviewEdit[] = [
    {
      id: 'speed',
      kind: 'speed',
      start: 1,
      end: 3,
      requestedStart: 1,
      requestedEnd: 3,
      rate: 2,
      audio: 'speed',
    },
    { id: 'cut', kind: 'cut', start: 3, end: 4, requestedStart: 3, requestedEnd: 4 },
  ];
  const gallery: QuickEditZoomRegion = {
    id: 'focus',
    start: 0,
    end: 6,
    sourceAnchor: { start: 0, end: 6 },
    transform: { scale: 3, centerX: 0.35, centerY: 0.65 },
    enter: { type: 'linear', duration: 2 },
    exit: { type: 'linear', duration: 2 },
  };
  const map = buildReviewTimeMap(source.duration, edits);
  const timeline = planReviewProjectTimeline({ operationId: 'probe', source, edits, video });
  const project = { ...seed, clips: timeline.videoClips, duration: timeline.duration };
  project.motionRegions = timeline.videoClips.map((clip) =>
    projectMotionSourceBinding(project, {
      ...createVideoProjectMotionRegion(project, 0, { enter: 'linear', exit: 'linear' }),
      id: `focus:${clip.id}`,
      scale: 3,
      focusMode: 'MANUAL',
      focusPoint: { x: source.width * 0.35, y: source.height * 0.65 },
      zoomInDuration: 2,
      zoomOutDuration: 2,
      sourceBinding: {
        clipId: clip.id,
        sourceStart: 0,
        sourceEnd: 6,
        phaseProjection: 'retained-result',
        animationGroupId: 'focus',
        animation: { start: 0, end: 6, duration: 6 },
      },
    })
  );
  const projected = projectReviewFocus([gallery], map);
  for (const time of [0.5, 1.25, 1.75, 2.5, 3.5]) {
    const expected = evaluateQuickEditCameraAtTime(projected, time);
    const actual = resolveVideoCompositionCamera({
      project,
      currentTime: time,
      actions: [],
      cursorSample: null,
    });
    expect(actual.scale, `result time ${time}`).toBeCloseTo(expected.scale, 9);
  }
  const expandedClip = {
    ...timeline.videoClips[0]!,
    sourceStart: 0,
    sourceDuration: 6,
    startTime: 0,
    duration: 6,
    playbackRate: 1,
  };
  const expanded = { ...project, clips: [expandedClip], duration: 6 };
  expanded.motionRegions = [projectMotionSourceBinding(expanded, project.motionRegions[0]!)];
  const original = evaluateQuickEditCameraAtTime([gallery], 0.5);
  const restored = resolveVideoCompositionCamera({
    project: expanded,
    currentTime: 0.5,
    actions: [],
    cursorSample: null,
  });
  expect(restored.scale, 'original authored source frame after untrim').toBeCloseTo(
    original.scale,
    9
  );
});
