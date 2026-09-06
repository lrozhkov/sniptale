import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createVideoProjectMotionRegion } from '../../../features/video/project/motion';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import {
  createAudioClip,
  createProject,
  createTrack,
  createVideoClip,
} from '../../../features/video/project/timeline/project-meta.test.helpers.ts';
import {
  VideoMotionFocusMode,
  VideoProjectActionEventKind,
} from '../../../features/video/project/types/interaction';
import { isExportReadyVideoProject } from '../../../features/video/project/validation';
import type { VideoProject } from '../../../features/video/project/types';

const {
  applyAutoTransformClipTimelineMock,
  getRecordingTelemetryMock,
  mapSourceTimeToProjectTimeMock,
  normalizeRecordingActionEventsToProjectSpaceMock,
  normalizeRecordingCursorTrackToProjectSpaceMock,
  telemetryEligibilityMock,
} = vi.hoisted(() => ({
  applyAutoTransformClipTimelineMock: vi.fn(),
  getRecordingTelemetryMock: vi.fn(),
  mapSourceTimeToProjectTimeMock: vi.fn(),
  normalizeRecordingActionEventsToProjectSpaceMock: vi.fn(),
  normalizeRecordingCursorTrackToProjectSpaceMock: vi.fn(),
  telemetryEligibilityMock: vi.fn(),
}));

vi.mock('../../../composition/persistence/recordings/telemetry', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/recordings/telemetry')
  >()),
  getRecordingTelemetry: getRecordingTelemetryMock,
}));

vi.mock('./auto-transform.clip-timeline', () => ({
  applyAutoTransformClipTimeline: applyAutoTransformClipTimelineMock,
  mapSourceTimeToProjectTime: mapSourceTimeToProjectTimeMock,
}));

vi.mock('./telemetry-eligibility', () => ({
  isRecordingTelemetryEligibleForAutoProcessing: telemetryEligibilityMock,
}));

vi.mock('./telemetry', () => ({
  createRecordingTelemetryNormalizationParams: vi.fn((_telemetry, project) => ({
    captureMode: 'TAB',
    displaySurface: null,
    projectHeight: project.height,
    projectWidth: project.width,
    viewport: null,
  })),
  normalizeRecordingActionEventsToProjectSpace: normalizeRecordingActionEventsToProjectSpaceMock,
  normalizeRecordingCursorTrackToProjectSpace: normalizeRecordingCursorTrackToProjectSpaceMock,
}));

import { autoTransformRecordingProject } from './auto-transform';

function createTelemetryActionEvent() {
  return {
    data: {},
    duration: 0.2,
    id: 'click-1',
    kind: VideoProjectActionEventKind.CLICK,
    label: 'Click',
    point: { x: 120, y: 240 },
    preset: 'CLICK_RIPPLE',
    time: 1,
  } as const;
}

function createTelemetryEntry() {
  return {
    actionEvents: [createTelemetryActionEvent()],
    captureMode: 'TAB',
    createdAt: 1,
    cursorTrack: null,
    displaySurface: null,
    recordingId: 'recording-1',
    signals: [],
    updatedAt: 2,
    viewport: null,
  };
}

function createMotionProject(name: string) {
  const project = createEmptyVideoProject(name);
  project.duration = 12;
  return project;
}

function createRecordingMotionProject() {
  const project = createProject(
    [createVideoClip({ duration: 12, sourceDuration: 12 })],
    [createTrack('track-video', 0)]
  );
  project.baseRecordingId = 'rec-asset-video';
  project.duration = 12;
  project.source = { kind: 'recording', recordingId: 'rec-asset-video' };
  return project;
}

function registerFailureHandlingTests() {
  it('returns null when recording telemetry is unavailable', async () => {
    getRecordingTelemetryMock.mockResolvedValue(null);
    const project = createMotionProject('Auto transform');

    await expect(autoTransformRecordingProject(project, 'recording-1')).resolves.toBeNull();
    expect(applyAutoTransformClipTimelineMock).not.toHaveBeenCalled();
  });
}

function createManualMotionRegion(project: ReturnType<typeof createEmptyVideoProject>) {
  return {
    ...createVideoProjectMotionRegion(project, 6),
    id: 'manual-motion:click-3',
    focusMode: VideoMotionFocusMode.ACTION,
    focusPoint: { x: 220, y: 180 },
    targetActionEventId: 'click-3',
  };
}

function createThrottledTelemetryActionEvents() {
  const click1 = createTelemetryActionEvent();
  const click2 = {
    ...createTelemetryActionEvent(),
    id: 'click-2',
    point: null,
    time: 3,
  } as const;
  const click3 = {
    ...createTelemetryActionEvent(),
    id: 'click-3',
    point: { x: 220, y: 180 },
    time: 6,
  } as const;
  const click4 = {
    ...createTelemetryActionEvent(),
    id: 'click-4',
    point: { x: 420, y: 120 },
    time: 7.5,
  } as const;
  const click5 = {
    ...createTelemetryActionEvent(),
    id: 'click-5',
    point: { x: 460, y: 140 },
    time: 10.2,
  } as const;

  return [click1, click2, click3, click4, click5];
}

function registerAutoMotionRebuildTest() {
  it('rebuilds auto-motion zooms instead of dropping existing auto-generated targets', async () => {
    const project = createRecordingMotionProject();
    project.motionRegions = [
      {
        ...createVideoProjectMotionRegion(project, 1),
        id: 'auto-motion:click-1',
        focusMode: VideoMotionFocusMode.ACTION,
        focusPoint: { x: 120, y: 240 },
        targetActionEventId: 'click-1',
      },
    ];
    getRecordingTelemetryMock.mockResolvedValue(createTelemetryEntry());

    const result = await autoTransformRecordingProject(project, 'rec-asset-video');

    expect(result?.motionRegions).toEqual([
      expect.objectContaining({
        id: 'auto-motion:click-1',
        targetActionEventId: 'click-1',
      }),
    ]);
  });

  it('uses the detached video projection for actions and their auto-motion regions', async () => {
    const project = createProject(
      [
        createAudioClip({ startTime: 0 }),
        createVideoClip({ duration: 7, sourceDuration: 7, startTime: 5 }),
      ],
      [createTrack('track-video', 0), createTrack('track-audio', 1)]
    );
    project.baseRecordingId = 'rec-asset-video';
    project.duration = 12;
    project.source = { kind: 'recording', recordingId: 'rec-asset-video' };
    getRecordingTelemetryMock.mockResolvedValue(createTelemetryEntry());

    const result = await autoTransformRecordingProject(project, 'rec-asset-video');

    expect(result?.actionEvents[0]).toEqual(expect.objectContaining({ id: 'click-1', time: 6 }));
    expect(result?.motionRegions).toEqual([
      expect.objectContaining({ id: 'auto-motion:click-1', startTime: 6 }),
    ]);
  });
}

function registerZoomThrottleTests() {
  it('throttles auto zooms, skips click events without points, and preserves manual targets', async () => {
    const project = createRecordingMotionProject();
    project.motionRegions = [createManualMotionRegion(project)];
    const actionEvents = createThrottledTelemetryActionEvents();
    getRecordingTelemetryMock.mockResolvedValue({
      ...createTelemetryEntry(),
      actionEvents,
    });
    normalizeRecordingActionEventsToProjectSpaceMock.mockReturnValue(actionEvents);

    const result = await autoTransformRecordingProject(project, 'rec-asset-video');
    expect(result).not.toBeNull();
    const motionRegions = result!.motionRegions ?? [];

    expect(motionRegions).toEqual([
      expect.objectContaining({
        id: 'manual-motion:click-3',
        targetActionEventId: 'click-3',
      }),
      expect.objectContaining({
        duration: expect.any(Number),
        id: 'auto-motion:click-1',
        targetActionEventId: 'click-1',
        zoomInDuration: expect.any(Number),
        zoomOutDuration: expect.any(Number),
      }),
      expect.objectContaining({
        duration: expect.any(Number),
        id: 'auto-motion:click-4',
        targetActionEventId: 'click-4',
        zoomInDuration: expect.any(Number),
        zoomOutDuration: expect.any(Number),
      }),
    ]);
    expect(motionRegions.slice(1).every((region) => region.duration >= 3)).toBe(true);
    expect(motionRegions.slice(1).every((region) => region.zoomInDuration >= 0.45)).toBe(true);
    expect(motionRegions.slice(1).every((region) => region.zoomOutDuration >= 0.45)).toBe(true);
  });
}

function registerMotionRegionTests() {
  registerAutoMotionRebuildTest();
  registerZoomThrottleTests();
}

function registerCursorRemapTests() {
  it('remaps cursor samples into compacted project time and drops samples from removed ranges', async () => {
    const project = createRecordingMotionProject();
    applyAutoTransformClipTimelineMock.mockImplementationOnce((currentProject: VideoProject) => ({
      ...currentProject,
      clips: currentProject.clips.map((clip) => ({
        ...clip,
        duration: 2,
        sourceDuration: 2,
      })),
    }));
    getRecordingTelemetryMock.mockResolvedValue({
      ...createTelemetryEntry(),
      cursorTrack: {
        captureMode: 'separate',
        samples: [
          { id: 'cursor-1', time: 1, x: 10, y: 20, visible: true },
          { id: 'cursor-2', time: 3, x: 30, y: 40, visible: true },
        ],
        skin: {
          animationPreset: 'NONE',
          color: '#fff',
          hidden: false,
          preset: 'ARROW',
          scale: 1,
          shadow: true,
        },
      },
    });
    const result = await autoTransformRecordingProject(project, 'rec-asset-video');

    expect(result?.cursorTrack?.samples).toEqual([
      {
        id: 'cursor-1',
        sourceAnchor: {
          kind: 'recording-source',
          recordingId: 'rec-asset-video',
          sourceClipId: 'clip-video',
          sourceTime: 1,
        },
        time: 1,
        visible: true,
        x: 10,
        y: 20,
      },
    ]);
  });

  it('emits stable action and cursor anchors when auto-transform is applied again', async () => {
    const project = createRecordingMotionProject();
    getRecordingTelemetryMock.mockResolvedValue({
      ...createTelemetryEntry(),
      recordingId: 'rec-asset-video',
      cursorTrack: {
        captureMode: 'separate',
        samples: [{ id: 'cursor-1', time: 1, x: 10, y: 20, visible: true }],
        skin: {
          animationPreset: 'NONE',
          color: '#fff',
          hidden: false,
          preset: 'ARROW',
          scale: 1,
          shadow: true,
        },
      },
    });

    const first = await autoTransformRecordingProject(project, 'rec-asset-video');
    const second = await autoTransformRecordingProject(first!, 'rec-asset-video');

    expect(first?.actionEvents[0]?.sourceAnchor).toEqual({
      kind: 'recording-source',
      recordingId: 'rec-asset-video',
      sourceClipId: 'clip-video',
      sourceTime: 1,
    });
    expect(first?.cursorTrack?.samples[0]?.sourceAnchor).toEqual({
      kind: 'recording-source',
      recordingId: 'rec-asset-video',
      sourceClipId: 'clip-video',
      sourceTime: 1,
    });
    expect(second?.actionEvents).toEqual(first?.actionEvents);
    expect(second?.cursorTrack).toEqual(first?.cursorTrack);
    expect(isExportReadyVideoProject(first)).toBe(true);
  });
}

describe('auto transform recording project', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    applyAutoTransformClipTimelineMock.mockImplementation((project) => project);
    mapSourceTimeToProjectTimeMock.mockImplementation(
      (_project: unknown, _recordingId: unknown, sourceTime: number) => sourceTime
    );
    normalizeRecordingActionEventsToProjectSpaceMock.mockReturnValue([
      createTelemetryActionEvent(),
    ]);
    normalizeRecordingCursorTrackToProjectSpaceMock.mockImplementation(
      (cursorTrack: unknown) => cursorTrack
    );
    telemetryEligibilityMock.mockImplementation(
      (_project: unknown, telemetry: unknown) => telemetry !== null && telemetry !== undefined
    );
  });

  registerFailureHandlingTests();
  registerMotionRegionTests();
  registerCursorRemapTests();
});
