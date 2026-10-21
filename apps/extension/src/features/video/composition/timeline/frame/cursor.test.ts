import { materializeVideoProjectCursorSourceObservations } from '../../../project/cursor-source-observations';
import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../../project/factories/creation';
import { normalizeVideoProjectCursorSkin } from '../../../project/cursor';
import { VideoCursorCaptureMode } from '../../../project/types';
import {
  resolveCursorSample,
  resolveVideoCompositionCursor,
  resolveObservedCursorPosition,
  resolveCursorSourcePointMapping,
  mapCursorFocusControlPoint,
} from './cursor';
import { createVideoProjectFromRecording } from '../../../project/factories/creation';
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';

it.each([VideoCursorCaptureMode.SEPARATE, VideoCursorCaptureMode.EMBEDDED_FALLBACK])(
  'switches cursor visibility at its key time in %s mode',
  (captureMode) => {
    const project = createEmptyVideoProject('Cursor keys');
    project.cursorTrack = {
      captureMode,
      skin: normalizeVideoProjectCursorSkin(undefined),
      samples: [
        { id: 'show', time: 1, x: 10, y: 20, visible: true },
        { id: 'hide', time: 3, x: 30, y: 40, visible: false },
        { id: 'restore', time: 5, x: 50, y: 60, visible: true },
      ],
    };
    expect(resolveCursorSample(project, 0.5)).toBeNull();
    for (const time of [1, 2, 2.999]) {
      expect(resolveVideoCompositionCursor(project, time, [])?.visible).toBe(true);
    }
    for (const time of [3, 4, 4.999]) {
      expect(resolveVideoCompositionCursor(project, time, [])).toBeNull();
    }
    expect(resolveVideoCompositionCursor(project, 5, [])?.visible).toBe(true);
    if (captureMode === VideoCursorCaptureMode.SEPARATE) {
      expect(resolveCursorSample(project, 2)).toMatchObject({ x: 20, y: 30 });
    }
  }
);

it('compresses a separate cursor only during click feedback and is stable on seek', () => {
  const project = createEmptyVideoProject('Click cursor');
  project.duration = 4;
  project.cursorTrack = {
    captureMode: VideoCursorCaptureMode.SEPARATE,
    skin: { ...normalizeVideoProjectCursorSkin(undefined), animationPreset: 'PRESS' },
    samples: [{ id: 'one', time: 0, x: 40, y: 50, visible: true }],
  };
  project.actionEvents = [
    {
      id: 'click',
      kind: 'CLICK',
      anchor: { kind: 'project', time: 1 },
      label: 'Click',
      data: {},
      point: null,
      presentation: { preset: 'NONE' },
    },
  ];
  expect(resolveVideoCompositionCursor(project, 0.5, [])?.scale).toBe(1);
  expect(resolveVideoCompositionCursor(project, 1.125, [])?.scale).toBeCloseTo(0.82);
  expect(resolveVideoCompositionCursor(project, 2, [])?.scale).toBe(1);
  expect(resolveVideoCompositionCursor(project, 1.125, [])?.scale).toBeCloseTo(0.82);
});

it('does not interpolate observed movement towards an observation-loss boundary', () => {
  const project = createEmptyVideoProject('Observation boundary');
  project.cursorTrack = {
    captureMode: VideoCursorCaptureMode.SEPARATE,
    skin: normalizeVideoProjectCursorSkin(undefined),
    samples: [
      { id: 'observed', time: 0, x: 10, y: 20, visible: true },
      {
        id: 'outside',
        time: 1,
        x: 90,
        y: 90,
        visible: false,
        observation: 'outside',
        captureSegment: 0,
      },
      { id: 'return', time: 3, x: 80, y: 40, visible: true },
    ],
  };
  expect(resolveCursorSample(project, 0.5)).toMatchObject({ x: 10, y: 20 });
  expect(resolveVideoCompositionCursor(project, 2, [])).toBeNull();
});
function observedProject() {
  return createVideoProjectFromRecording({
    recordingId: 'source',
    filename: 'source.webm',
    width: 100,
    height: 100,
    duration: 3,
    mimeType: 'video/webm',
    size: 10,
    cursorTrack: {
      captureMode: 'embedded-fallback',
      skin: normalizeVideoProjectCursorSkin(undefined),
      samples: [0, 1].map((time) => ({
        id: `sample-${time}`,
        time,
        x: 20 + time * 40,
        y: 30 + time * 40,
        visible: true,
        observation: 'observed' as const,
        captureSegment: 0,
        recordingPoint: { x: 0.2 + time * 0.4, y: 0.3 + time * 0.4 },
      })),
    },
  });
}
it('trusted cursor interpolation is linear and scoped to the retained source instance', () => {
  const project = observedProject();
  project.cursorTrack!.samples[0]!.interpolation = 'EASE_IN_OUT';
  const clip = project.clips.find((item) => item.type === 'VIDEO')!;
  expect(resolveObservedCursorPosition(project, 0.5, clip.id)).toMatchObject({
    x: 40,
    y: 50,
    recordingPoint: { x: 0.4, y: 0.5 },
  });
  expect(resolveObservedCursorPosition(project, 0.5, 'another-instance')).toBeNull();
  expect(resolveObservedCursorPosition(project, 2, clip.id)).toMatchObject({ x: 60, y: 70 });
});
it.each(['outside', 'missing-point', 'hidden', 'new-segment'] as const)(
  'observation gaps never pull the last trusted pointer toward unknown geometry (%s)',
  (reason) => {
    const project = observedProject();
    const next = project.cursorTrack!.samples[1]!;
    if (reason === 'outside') next.observation = 'outside';
    if (reason === 'missing-point')
      project.cursorTrack!.samples[1] = { ...next, recordingPoint: null };
    if (reason === 'hidden') next.visible = false;
    if (reason === 'new-segment') next.captureSegment = 1;
    expect(resolveObservedCursorPosition(project, 0.5)).toMatchObject({ x: 20, y: 30 });
    if (reason !== 'new-segment') expect(resolveObservedCursorPosition(project, 1)).toBeNull();
  }
);
it('cursor controls round-trip outside source bounds through rotation and transition scale', () => {
  const project = observedProject();
  const clip = project.clips.find((item) => item.type === 'VIDEO')!;
  clip.transform.rotation = 27;
  clip.windowHeader = { ...DEFAULT_WINDOW_HEADER, title: 'Window' };
  const mapping = resolveCursorSourcePointMapping(project, clip.id, 0.5)!;
  const point = { x: -0.4, y: 1.7 };
  const scene = mapCursorFocusControlPoint(mapping, point);
  const restored = mapCursorFocusControlPoint(mapping, scene, true);
  expect(restored.x).toBeCloseTo(point.x);
  expect(restored.y).toBeCloseTo(point.y);
  expect(mapping.windowHeader).toEqual(clip.windowHeader);
  expect(resolveCursorSourcePointMapping(project, undefined, 0)).toBeNull();
  expect(resolveCursorSourcePointMapping(project, 'missing', 0)).toBeNull();
  project.assets = [];
  expect(resolveCursorSourcePointMapping(project, clip.id, 0)).toBeNull();
});

it('retains source-owned closing observations without changing half-open playback or bridging a gap', () => {
  const project = observedProject();
  const clip = project.clips.find((item) => item.type === 'VIDEO')!;
  clip.duration = 1;
  expect(resolveObservedCursorPosition(project, 1, clip.id)).toBeNull();
  const closing = resolveObservedCursorPosition(project, 1, clip.id, { includeSourceEnd: true });
  expect(closing?.sourceAnchor?.sourceClipId).toBe(clip.id);
  expect(closing?.recordingPoint?.x).toBeCloseTo(0.6, 10);
  expect(closing?.recordingPoint?.y).toBeCloseTo(0.7, 10);
  expect(
    resolveObservedCursorPosition(project, 1.01, clip.id, { includeSourceEnd: true })
  ).toBeNull();
  expect(
    resolveObservedCursorPosition(project, 1, 'another-instance', { includeSourceEnd: true })
  ).toBeNull();
  const lost = {
    ...project,
    cursorTrack: {
      ...project.cursorTrack!,
      samples: project.cursorTrack!.samples.map((sample, index) =>
        index === 1 ? { ...sample, recordingPoint: null, observation: 'outside' as const } : sample
      ),
    },
  };
  expect(resolveObservedCursorPosition(lost, 1, clip.id, { includeSourceEnd: true })).toBeNull();
});

it('projects a separate recorded cursor through its source instance without changing capture facts', () => {
  const project = observedProject();
  project.cursorTrack!.captureMode = VideoCursorCaptureMode.SEPARATE;
  const clip = project.clips.find((item) => item.type === 'VIDEO')!;
  clip.transform = { x: 10, y: 20, width: 80, height: 40, rotation: 0, opacity: 1 };
  clip.fitMode = 'STRETCH';
  const before = structuredClone(project);
  // Original source point (.4,.5), projected into the authored clip rectangle.
  expect(resolveVideoCompositionCursor(project, 0.5, [])).toMatchObject({ x: 42, y: 40 });
  expect(project).toEqual(before);
  const manual = {
    ...project,
    cursorTrack: {
      ...project.cursorTrack!,
      samples: [{ id: 'manual', time: 0, x: 7, y: 9, visible: true }],
    },
  };
  expect(resolveVideoCompositionCursor(manual, 0.5, [])).toMatchObject({ x: 7, y: 9 });
});

it('hides a cropped-out source cursor without rewriting its raw samples or focus overrides', () => {
  const project = observedProject();
  project.cursorTrack!.captureMode = VideoCursorCaptureMode.SEPARATE;
  const clip = project.clips.find((item) => item.type === 'VIDEO')!;
  clip.sourceCrop = { x: 0.5, y: 0, width: 0.5, height: 1 };
  const before = structuredClone(project);
  expect(resolveVideoCompositionCursor(project, 0, [])).toBeNull();
  expect(resolveVideoCompositionCursor(project, 1, [])).not.toBeNull();
  expect(project).toEqual(before);
});

it('hides a rounded-corner source cursor while retaining capture facts and interior visibility', () => {
  const project = observedProject();
  project.cursorTrack!.captureMode = VideoCursorCaptureMode.SEPARATE;
  project.cursorTrack!.samples = project.cursorTrack!.samples.map((sample, index) => ({
    ...sample,
    recordingPoint: index === 0 ? { x: 0.01, y: 0.01 } : { x: 0.5, y: 0.5 },
  }));
  const clip = project.clips.find((clip) => clip.type === 'VIDEO')!;
  clip.windowCornerRadius = 50;
  clip.fitMode = 'STRETCH';
  const before = structuredClone(project);
  expect(resolveCursorSourcePointMapping(project, clip.id, 0)?.windowCornerRadius).toBe(50);
  expect(resolveVideoCompositionCursor(project, 0, [])).toBeNull();
  expect(resolveVideoCompositionCursor(project, 1, [])).not.toBeNull();
  expect(project).toEqual(before);
});

function sourceObservationProject() {
  const project = createVideoProjectFromRecording({
    recordingId: 'captured',
    filename: 'Captured.webm',
    duration: 3,
    width: 100,
    height: 100,
    mimeType: 'video/webm',
    size: 100,
  });
  const clip = project.clips.find((item) => item.type === 'VIDEO')!;
  clip.startTime = 4;
  clip.sourceStart = 0.25;
  clip.sourceDuration = 2.75;
  clip.playbackRate = 2;
  clip.duration = 2.75 / 2;
  project.duration = clip.startTime + clip.duration;
  project.version = 33;
  project.cursorTrack = {
    captureMode: 'embedded-fallback',
    skin: { ...normalizeVideoProjectCursorSkin(undefined), hidden: true },
    samples: [],
    sourceObservations: [
      {
        recordingId: 'captured',
        sourceInstanceId: clip.sourceInstanceId!,
        samples: [
          {
            id: 'first',
            time: 0,
            x: 10,
            y: 50,
            visible: true,
            captureSegment: 0,
            recordingPoint: { x: 0.1, y: 0.5 },
            observation: 'observed',
          },
          {
            id: 'last-before-gap',
            time: 1,
            x: 50,
            y: 50,
            visible: true,
            captureSegment: 0,
            recordingPoint: { x: 0.5, y: 0.5 },
            observation: 'observed',
          },
          {
            id: 'outside',
            time: 1.5,
            x: 50,
            y: 50,
            visible: false,
            captureSegment: 0,
            recordingPoint: null,
            observation: 'outside',
          },
          {
            id: 'return',
            time: 2,
            x: 80,
            y: 50,
            visible: true,
            captureSegment: 1,
            recordingPoint: { x: 0.8, y: 0.5 },
            observation: 'observed',
          },
          {
            id: 'end',
            time: 3,
            x: 90,
            y: 50,
            visible: true,
            captureSegment: 1,
            recordingPoint: { x: 0.9, y: 0.5 },
            observation: 'observed',
          },
        ],
      },
    ],
  };
  project.actionEvents = [
    {
      id: 'click',
      kind: 'CLICK',
      label: '',
      data: {},
      point: { x: 0.9, y: 0.5 },
      anchor: {
        kind: 'recording-source',
        recordingId: 'captured',
        sourceInstanceId: clip.sourceInstanceId!,
        sourceEventId: 'capture-click',
        sourceTime: 0.5,
      },
    },
  ];
  project.actionFeedback = [
    {
      recordingId: 'captured',
      sourceInstanceId: clip.sourceInstanceId!,
      settings: [],
      signals: [
        {
          id: 'dwell',
          kind: 'cursor-idle',
          startTime: 0.6,
          endTime: 0.8,
          point: { x: 70, y: 50 },
          recordingPoint: { x: 0.7, y: 0.5 },
          data: {},
        },
      ],
    },
  ];
  project.cursorTrack = materializeVideoProjectCursorSourceObservations(project);
  return {
    project,
    clip,
    at: (sourceTime: number) => clip.startTime + (sourceTime - clip.sourceStart) / 2,
  };
}

it('uses complete captured click and dwell geometry for source observations after cut and rate', () => {
  const { project, clip, at } = sourceObservationProject();
  expect(resolveObservedCursorPosition(project, at(0.5), clip.id)?.recordingPoint?.x).toBeCloseTo(
    0.9,
    9
  );
  expect(resolveObservedCursorPosition(project, at(0.7), clip.id)?.recordingPoint?.x).toBeCloseTo(
    0.7,
    9
  );
  expect(resolveVideoCompositionCursor(project, at(0.5), [])).toBeNull();
});

it('closes captured observation at the last observed sample before an outside marker', () => {
  const { project, clip, at } = sourceObservationProject();
  expect(resolveObservedCursorPosition(project, at(1.25), clip.id)).toBeNull();
  expect(resolveObservedCursorPosition(project, at(2.5), clip.id)?.recordingPoint?.x).toBeCloseTo(
    0.85,
    9
  );
  expect(
    resolveObservedCursorPosition(project, clip.startTime + clip.duration, clip.id)
  ).toBeNull();
  expect(
    resolveObservedCursorPosition(project, clip.startTime + clip.duration, clip.id, {
      includeSourceEnd: true,
    })?.recordingPoint?.x
  ).toBeCloseTo(0.9, 9);
});
