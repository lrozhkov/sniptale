import { expect, it } from 'vitest';

import { hydrateVideoProject } from './index';
import {
  createImageClip,
  createProject,
  createVideoClip,
} from '../timeline/project-meta.test.helpers.ts';
import {
  VideoCursorCaptureMode,
  VideoMotionFocusMode,
  VideoProjectSourceKind,
  VideoTemporalEasing,
} from '../types/index';

function createCursorHydrationProject() {
  return createProject([
    createVideoClip({
      id: 'clip-1',
      startTime: 0,
      duration: 2,
    }),
    createImageClip({
      assetId: 'asset-video',
      id: 'clip-2',
      startTime: 2,
      duration: 2,
    }),
  ]);
}

function createMixedCursorTrack() {
  return {
    captureMode: VideoCursorCaptureMode.EMBEDDED_FALLBACK,
    samples: [
      { id: 'sample-1', interpolation: 'bad' as never, time: 0, visible: true, x: 1, y: 2 },
      { id: 1 as never, time: Number.NaN, visible: true, x: 1, y: 2 },
    ],
    skin: {
      animationPreset: 'NONE',
      color: '#fff',
      preset: 'ARROW',
      scale: 10,
      shadow: 1 as never,
    } as never,
  };
}

function createMixedActionEvents() {
  return [
    {
      data: null as never,
      duration: -1,
      id: 'action-1',
      kind: 'CLICK' as never,
      label: 1 as never,
      point: { x: Number.NaN, y: 20 },
      preset: 'CLICK_RIPPLE' as never,
      time: 2,
    },
  ];
}

function createMixedMotionRegions() {
  return [
    {
      duration: 1,
      easing: VideoTemporalEasing.LINEAR,
      focusMode: VideoMotionFocusMode.MANUAL,
      focusPoint: { x: 10, y: 20 },
      id: 'motion-1',
      motionBlurAmount: 0.25,
      scale: 1.2,
      startTime: 0.5,
      targetActionEventId: null,
      zoomInDuration: 0.1,
      zoomOutDuration: 0.1,
    },
    {
      duration: 1,
      easing: VideoTemporalEasing.LINEAR,
      focusMode: VideoMotionFocusMode.MANUAL,
      focusPoint: { x: 10, y: 20 },
      id: 2 as never,
      motionBlurAmount: 0.25,
      scale: 1.2,
      startTime: 0.5,
      targetActionEventId: null,
      zoomInDuration: 0.1,
      zoomOutDuration: 0.1,
    },
  ];
}

function createMixedRecordingHydrationProject() {
  const project = createCursorHydrationProject();

  project.source = {
    kind: VideoProjectSourceKind.RECORDING,
    recordingId: 'recording-source',
  };
  project.baseRecordingId = 'recording-base';
  project.assets[0] = {
    ...project.assets[0]!,
    metadata: {
      ...project.assets[0]!.metadata,
      audioPeaks: [2, 'bad' as never, -1],
    },
  };
  project.cursorTrack = createMixedCursorTrack();
  project.actionEvents = createMixedActionEvents();
  project.motionRegions = createMixedMotionRegions();

  return project;
}

function expectMixedRecordingHydrationShape(hydrated: ReturnType<typeof hydrateVideoProject>) {
  expect(hydrated.source).toEqual({
    kind: VideoProjectSourceKind.RECORDING,
    recordingId: 'recording-source',
  });
  expect(hydrated.assets[0]?.metadata.audioPeaks).toEqual([1, 0, 0]);
  expect(hydrated.cursorTrack).toEqual(
    expect.objectContaining({
      samples: [
        expect.objectContaining({
          id: 'sample-1',
          interpolation: VideoTemporalEasing.LINEAR,
        }),
      ],
      skin: expect.objectContaining({
        animationPreset: 'NONE',
        hidden: true,
        preset: 'ARROW',
        scale: 4,
        shadow: true,
      }),
    })
  );
  expect(hydrated.actionEvents).toEqual([
    expect.objectContaining({
      duration: 0,
      label: '',
      point: null,
    }),
  ]);
  expect(hydrated.motionRegions).toHaveLength(1);
}

it('defaults embedded fallback cursor tracks to hidden when legacy data lacks an explicit flag', () => {
  const project = createCursorHydrationProject();

  project.cursorTrack = {
    captureMode: VideoCursorCaptureMode.EMBEDDED_FALLBACK,
    samples: [{ id: 'sample-1', time: 0, visible: true, x: 1, y: 2 }],
    skin: {
      animationPreset: 'NONE',
      color: '#fff',
      preset: 'ARROW',
      scale: 1,
      shadow: false,
    } as never,
  };

  expect(hydrateVideoProject(project).cursorTrack).toEqual(
    expect.objectContaining({
      skin: expect.objectContaining({
        hidden: true,
      }),
    })
  );
});

it('preserves explicit cursor visibility flags during hydration', () => {
  const project = createCursorHydrationProject();

  project.cursorTrack = {
    captureMode: VideoCursorCaptureMode.EMBEDDED_FALLBACK,
    samples: [{ id: 'sample-1', time: 0, visible: true, x: 1, y: 2 }],
    skin: {
      animationPreset: 'NONE',
      color: '#fff',
      hidden: false,
      preset: 'ARROW',
      scale: 1,
      shadow: false,
    },
  };

  expect(hydrateVideoProject(project).cursorTrack).toEqual(
    expect.objectContaining({
      skin: expect.objectContaining({
        hidden: false,
      }),
    })
  );
});

it('preserves explicit hidden cursor flags and valid action points', () => {
  const project = createCursorHydrationProject();

  project.cursorTrack = {
    captureMode: VideoCursorCaptureMode.SEPARATE,
    samples: [{ id: 'sample-1', time: 0, visible: true, x: 1, y: 2 }],
    skin: {
      animationPreset: 'NONE',
      color: '#fff',
      hidden: true,
      preset: 'ARROW',
      scale: 1,
      shadow: false,
    },
  };
  project.actionEvents = [
    {
      data: { button: 0 },
      duration: 0.4,
      id: 'action-1',
      kind: 'CLICK' as never,
      label: 'Click',
      point: { x: 10, y: 20 },
      preset: 'CLICK_RIPPLE' as never,
      time: 2,
    },
  ];

  const hydrated = hydrateVideoProject(project);

  expect(hydrated.cursorTrack).toEqual(
    expect.objectContaining({
      skin: expect.objectContaining({
        hidden: true,
      }),
    })
  );
  expect(hydrated.actionEvents).toEqual([
    expect.objectContaining({
      data: { button: 0 },
      duration: 0.4,
      label: 'Click',
      point: { x: 10, y: 20 },
    }),
  ]);
});

it('preserves explicit recording sources and defaults missing editor-only collections', () => {
  const project = createCursorHydrationProject();

  project.source = {
    kind: VideoProjectSourceKind.RECORDING,
    recordingId: 'recording-source',
  };
  project.baseRecordingId = 'recording-base';
  project.cursorTrack = null;
  project.actionEvents = 'invalid' as never;
  project.motionRegions = 'invalid' as never;

  const hydrated = hydrateVideoProject(project);

  expect(hydrated.source).toEqual({
    kind: VideoProjectSourceKind.RECORDING,
    recordingId: 'recording-source',
  });
  expect(hydrated.baseRecordingId).toBe('recording-source');
  expect(hydrated.cursorTrack).toBeNull();
  expect(hydrated.actionEvents).toEqual([]);
  expect(hydrated.motionRegions).toEqual([]);
});

it('normalizes mixed recording hydration payloads across cursor, actions, motion, and asset metadata', () => {
  expectMixedRecordingHydrationShape(hydrateVideoProject(createMixedRecordingHydrationProject()));
});
