import { describe, expect, it } from 'vitest';
import {
  createProject,
  createTrack,
  createVideoClip,
} from '../../../features/video/project/timeline/project-meta.test.helpers';
import { RecordingTelemetrySignalKind } from '../../../features/video/project/types';
import type { RecordingTelemetryEntry } from '../../../composition/persistence/recordings/contracts';
import { isRecordingTelemetryEligibleForAutoProcessing } from './telemetry-eligibility';

function createProjectWithRecording() {
  const project = createProject(
    [createVideoClip({ assetId: 'asset-video', trackId: 'track-video' })],
    [createTrack('track-video', 0)]
  );
  project.baseRecordingId = 'rec-asset-video';
  return project;
}

function createTelemetry(
  overrides: Partial<RecordingTelemetryEntry> = {}
): RecordingTelemetryEntry {
  return {
    actionEvents: [],
    captureMode: 'TAB',
    createdAt: 1,
    cursorTrack: null,
    recordingId: 'rec-asset-video',
    signals: [],
    updatedAt: 2,
    viewport: null,
    ...overrides,
  };
}

describe('recording telemetry auto-processing eligibility', () => {
  it('rejects absent, mismatched, metadata-only, and detached telemetry', () => {
    const project = createProjectWithRecording();
    expect(isRecordingTelemetryEligibleForAutoProcessing(project, null)).toBe(false);
    expect(
      isRecordingTelemetryEligibleForAutoProcessing(
        project,
        createTelemetry({ recordingId: 'stale-recording' })
      )
    ).toBe(false);
    expect(isRecordingTelemetryEligibleForAutoProcessing(project, createTelemetry())).toBe(false);

    const detachedProject = createProjectWithRecording();
    detachedProject.clips = [];
    expect(
      isRecordingTelemetryEligibleForAutoProcessing(
        detachedProject,
        createTelemetry({ actionEvents: [createActionEvent()] })
      )
    ).toBe(false);
  });

  it('accepts matching action, cursor, or stable-segment telemetry', () => {
    const project = createProjectWithRecording();
    expect(
      isRecordingTelemetryEligibleForAutoProcessing(
        project,
        createTelemetry({ actionEvents: [createActionEvent()] })
      )
    ).toBe(true);
    expect(
      isRecordingTelemetryEligibleForAutoProcessing(
        project,
        createTelemetry({ cursorTrack: createCursorTrack() })
      )
    ).toBe(true);
    expect(
      isRecordingTelemetryEligibleForAutoProcessing(
        project,
        createTelemetry({ signals: createStableSignals() })
      )
    ).toBe(true);
  });
});

function createActionEvent() {
  return {
    data: {},
    duration: 0.1,
    id: 'click-1',
    kind: 'CLICK' as const,
    label: 'Click',
    point: { x: 10, y: 10 },
    preset: 'CLICK_RIPPLE' as const,
    time: 1,
  };
}

function createCursorTrack() {
  return {
    captureMode: 'separate' as const,
    samples: [{ id: 'sample-1', time: 1, visible: true, x: 10, y: 10 }],
    skin: {
      animationPreset: 'NONE' as const,
      color: '#fff',
      hidden: false,
      preset: 'ARROW' as const,
      scale: 1,
      shadow: false,
    },
  };
}

function createStableSignals() {
  return [
    {
      data: {},
      endTime: 4,
      id: 'idle-1',
      kind: RecordingTelemetrySignalKind.CURSOR_IDLE,
      point: null,
      startTime: 1,
    },
    {
      data: {},
      endTime: 3,
      id: 'static-1',
      kind: RecordingTelemetrySignalKind.STATIC_FRAME,
      point: null,
      startTime: 2,
    },
  ];
}
