import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createVideoProjectMotionRegion } from '../../../features/video/project/motion';
import {
  createProject,
  createTrack,
  createVideoClip,
} from '../../../features/video/project/timeline/project-meta.test.helpers';
import {
  VideoMotionFocusMode,
  VideoProjectActionEventKind,
  VideoProjectInteractionTimeBasis,
} from '../../../features/video/project/types/interaction';
import type { VideoProject } from '../../../features/video/project/types';
import { isExportReadyVideoProject } from '../../../features/video/project/validation';

const {
  getRecordingTelemetryMock,
  normalizeRecordingActionEventsToProjectSpaceMock,
  normalizeRecordingCursorTrackToProjectSpaceMock,
} = vi.hoisted(() => ({
  getRecordingTelemetryMock: vi.fn(),
  normalizeRecordingActionEventsToProjectSpaceMock: vi.fn(),
  normalizeRecordingCursorTrackToProjectSpaceMock: vi.fn(),
}));

vi.mock('../../../composition/persistence/recordings/telemetry', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/recordings/telemetry')
  >()),
  getRecordingTelemetry: getRecordingTelemetryMock,
}));

vi.mock('./auto-transform.clip-timeline', () => ({
  applyAutoTransformClipTimeline: (project: VideoProject) => project,
}));

vi.mock('./telemetry-eligibility', () => ({
  isRecordingTelemetryEligibleForAutoProcessing: () => true,
}));

vi.mock('./telemetry', () => ({
  createRecordingTelemetryNormalizationParams: vi.fn(() => ({})),
  normalizeRecordingActionEventsToProjectSpace: normalizeRecordingActionEventsToProjectSpaceMock,
  normalizeRecordingCursorTrackToProjectSpace: normalizeRecordingCursorTrackToProjectSpaceMock,
}));

import { autoTransformRecordingProject } from './auto-transform';

const telemetryAction = {
  data: {},
  duration: 0.2,
  id: 'click-1',
  kind: VideoProjectActionEventKind.CLICK,
  label: 'Click',
  point: { x: 120, y: 240 },
  preset: 'CLICK_RIPPLE',
  time: 1,
} as const;

function createRecordingProject() {
  const project = createProject(
    [createVideoClip({ duration: 12, sourceDuration: 12 })],
    [createTrack('track-video', 0)]
  );
  project.baseRecordingId = 'rec-asset-video';
  project.duration = 12;
  project.source = { kind: 'recording', recordingId: 'rec-asset-video' };
  return project;
}

describe('auto-transform project-time interaction ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    normalizeRecordingActionEventsToProjectSpaceMock.mockReturnValue([telemetryAction]);
    normalizeRecordingCursorTrackToProjectSpaceMock.mockImplementation(
      (cursorTrack: unknown) => cursorTrack
    );
  });

  it('preserves reloaded manual action and cursor edits without recreating telemetry IDs', async () => {
    const project = createRecordingProject();
    project.actionEvents = [
      {
        ...telemetryAction,
        time: 7,
        timeBasis: VideoProjectInteractionTimeBasis.PROJECT,
      },
    ];
    project.cursorTrack = {
      captureMode: 'separate',
      samples: [
        {
          id: 'cursor-1',
          time: 8,
          timeBasis: VideoProjectInteractionTimeBasis.PROJECT,
          visible: true,
          x: 40,
          y: 50,
        },
      ],
      skin: {
        animationPreset: 'NONE',
        color: '#fff',
        hidden: false,
        preset: 'ARROW',
        scale: 1,
        shadow: true,
      },
    };
    project.motionRegions = [
      {
        ...createVideoProjectMotionRegion(project, 7),
        id: 'auto-motion:click-1',
        focusMode: VideoMotionFocusMode.ACTION,
        focusPoint: { x: 120, y: 240 },
        targetActionEventId: 'click-1',
      },
    ];
    getRecordingTelemetryMock.mockResolvedValue({
      actionEvents: [telemetryAction],
      captureMode: 'TAB',
      createdAt: 1,
      cursorTrack: {
        ...project.cursorTrack,
        samples: [{ id: 'cursor-1', time: 1, visible: true, x: 10, y: 20 }],
      },
      displaySurface: null,
      recordingId: 'rec-asset-video',
      signals: [],
      updatedAt: 2,
      viewport: null,
    });
    const reloaded = JSON.parse(JSON.stringify(project));

    const result = await autoTransformRecordingProject(reloaded, 'rec-asset-video');

    expect(result?.actionEvents).toEqual([
      expect.objectContaining({ id: 'click-1', time: 7, timeBasis: 'project' }),
    ]);
    expect(result?.cursorTrack?.samples).toEqual([
      expect.objectContaining({ id: 'cursor-1', time: 8, timeBasis: 'project' }),
    ]);
    expect(result?.motionRegions).toEqual([
      expect.objectContaining({ id: 'auto-motion:click-1', targetActionEventId: 'click-1' }),
    ]);
    expect(isExportReadyVideoProject(result)).toBe(true);
  });
});
