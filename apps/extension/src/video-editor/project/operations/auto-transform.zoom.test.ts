import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import {
  RecordingTelemetrySignalKind,
  VideoProjectActionEventKind,
} from '../../../features/video/project/types/interaction';

const {
  applyAutoTransformClipTimelineMock,
  getRecordingTelemetryMock,
  mapSourceTimeToProjectTimeMock,
  normalizeRecordingActionEventsToProjectSpaceMock,
  normalizeRecordingCursorTrackToProjectSpaceMock,
} = vi.hoisted(() => ({
  applyAutoTransformClipTimelineMock: vi.fn(),
  getRecordingTelemetryMock: vi.fn(),
  mapSourceTimeToProjectTimeMock: vi.fn(),
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
  applyAutoTransformClipTimeline: applyAutoTransformClipTimelineMock,
  mapSourceTimeToProjectTime: mapSourceTimeToProjectTimeMock,
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

function createMotionProject() {
  const project = createEmptyVideoProject('Auto transform');
  project.duration = 12;
  return project;
}

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

function resetZoomHeuristicsMocks() {
  vi.clearAllMocks();
  applyAutoTransformClipTimelineMock.mockImplementation((project) => project);
  mapSourceTimeToProjectTimeMock.mockImplementation(
    (_project: unknown, _recordingId: unknown, sourceTime: number) => sourceTime
  );
  normalizeRecordingActionEventsToProjectSpaceMock.mockReturnValue([createTelemetryActionEvent()]);
  normalizeRecordingCursorTrackToProjectSpaceMock.mockImplementation(
    (cursorTrack: unknown) => cursorTrack
  );
}

async function verifyTypingAwareZoomProfile() {
  const project = createMotionProject();
  const actionEvents = [createTelemetryActionEvent()];
  getRecordingTelemetryMock.mockResolvedValue({
    ...createTelemetryEntry(),
    actionEvents,
    signals: [
      {
        data: { eventCount: 5, eventType: 'input' },
        endTime: 1.4,
        id: 'typing-1',
        kind: RecordingTelemetrySignalKind.TYPING,
        point: null,
        startTime: 0.6,
      },
    ],
  });
  normalizeRecordingActionEventsToProjectSpaceMock.mockReturnValue(actionEvents);

  const result = await autoTransformRecordingProject(project, 'recording-1');

  expect(result).not.toBeNull();
  expect(result!.motionRegions).toEqual([
    expect.objectContaining({
      duration: 3,
      scale: 1.24,
      targetActionEventId: 'click-1',
      zoomInDuration: 0.45,
      zoomOutDuration: 0.45,
    }),
  ]);
}

async function verifyNearbyClickReuse() {
  const project = createMotionProject();
  const actionEvents = [
    createTelemetryActionEvent(),
    {
      ...createTelemetryActionEvent(),
      id: 'click-2',
      point: { x: 132, y: 250 },
      time: 2.2,
    } as const,
  ];
  getRecordingTelemetryMock.mockResolvedValue({
    ...createTelemetryEntry(),
    actionEvents,
  });
  normalizeRecordingActionEventsToProjectSpaceMock.mockReturnValue(actionEvents);

  const result = await autoTransformRecordingProject(project, 'recording-1');

  expect(result).not.toBeNull();
  const motionRegions = result!.motionRegions ?? [];
  expect(motionRegions).toHaveLength(1);
  expect(motionRegions[0]).toEqual(
    expect.objectContaining({
      id: 'auto-motion:click-1',
      duration: 4.2,
      targetActionEventId: 'click-1',
    })
  );
}

async function verifyTailZoomSkip() {
  const project = createMotionProject();
  project.duration = 10;
  const actionEvents = [
    {
      ...createTelemetryActionEvent(),
      id: 'click-tail',
      point: { x: 200, y: 220 },
      time: 8.4,
    } as const,
  ];
  getRecordingTelemetryMock.mockResolvedValue({
    ...createTelemetryEntry(),
    actionEvents,
  });
  normalizeRecordingActionEventsToProjectSpaceMock.mockReturnValue(actionEvents);

  const result = await autoTransformRecordingProject(project, 'recording-1');

  expect(result?.motionRegions ?? []).toEqual([]);
}

describe('auto transform recording project zoom heuristics', () => {
  beforeEach(resetZoomHeuristicsMocks);
  it(
    'uses a gentler zoom profile for clicks that land near typing telemetry',
    verifyTypingAwareZoomProfile
  );
  it(
    'extends an active nearby auto zoom instead of spawning a second short region',
    verifyNearbyClickReuse
  );
  it(
    'skips dense clicks near the project tail when a compliant zoom would be too short',
    verifyTailZoomSkip
  );
});
