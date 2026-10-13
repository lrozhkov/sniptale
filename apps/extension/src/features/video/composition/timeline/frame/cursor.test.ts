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
import { DEFAULT_WINDOW_HEADER } from '../../../../browser-frame/header';

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
