import { describe, expect, it } from 'vitest';
import type { RecordingTelemetryEntry } from '../../composition/persistence/recordings/contracts';
import { createEmptyVideoProject } from '../../features/video/project/factories/creation';
import { createProjectStateActions } from './project-actions';
import { createSelectionStateActions } from './selection-actions';
import type { VideoEditorState } from './types';

function createTimelineStore() {
  let state = {} as VideoEditorState;
  const set = (
    partial: Partial<VideoEditorState> | ((state: VideoEditorState) => Partial<VideoEditorState>)
  ) => {
    const nextState = typeof partial === 'function' ? partial(state) : partial;
    state = { ...state, ...nextState };
  };

  state = {
    project: null,
    recordingId: null,
    isReady: false,
    error: null,
    saveState: 'idle',
    currentTime: 0,
    isPlaying: false,
    pixelsPerSecond: 90,
    placementMode: null,
    recordingTelemetry: null,
    selection: { kind: 'scene' },
    selectedTrackId: null,
    selectedClipId: null,
    telemetryLaneVisible: false,
    diagnosticsOpen: false,
    exportState: {
      dialogOpen: false,
      isRunning: false,
      jobId: null,
      status: null,
      settings: null,
      error: null,
      lastResult: null,
    },
    ...createProjectStateActions(set as never),
    ...createSelectionStateActions(set as never),
  } as VideoEditorState;

  return { getState: () => state };
}

describe('video editor timeline project state', () => {
  it('hydrates loaded projects and keeps project updates on the canonical path', () => {
    const store = createTimelineStore();
    const project = createEmptyVideoProject('Timeline');

    store.getState().setProject(project, 'recording-1');
    store.getState().updateProject((currentProject) => ({
      ...currentProject,
      name: 'Renamed',
    }));
    store.getState().setReady(true);
    store.getState().setError('timeline-error');
    store.getState().setSaveState('saved');

    expect(store.getState()).toMatchObject({
      error: 'timeline-error',
      isReady: true,
      project: expect.objectContaining({ name: 'Renamed' }),
      recordingId: 'recording-1',
      saveState: 'saved',
    });
  });

  it('resets and reopens telemetry lane visibility from recording telemetry lifecycle', () => {
    const store = createTimelineStore();
    const project = createEmptyVideoProject('Timeline');
    const telemetry = createRecordingTelemetryEntry('rec-1');

    store.getState().setProject(project, 'recording-1');
    store.getState().setRecordingTelemetry(telemetry);
    expect(store.getState().telemetryLaneVisible).toBe(true);

    store.getState().toggleTelemetryLaneVisibility();
    expect(store.getState().telemetryLaneVisible).toBe(false);

    store.getState().setRecordingTelemetry({ ...telemetry });
    expect(store.getState().telemetryLaneVisible).toBe(false);

    store.getState().setRecordingTelemetry(createRecordingTelemetryEntry('rec-2'));
    expect(store.getState().telemetryLaneVisible).toBe(true);

    store.getState().setRecordingTelemetry(null);
    expect(store.getState().telemetryLaneVisible).toBe(false);
  });
});

function createRecordingTelemetryEntry(recordingId: string): RecordingTelemetryEntry {
  return {
    recordingId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    viewport: null,
    captureMode: null,
    displaySurface: null,
    cursorTrack: null,
    actionEvents: [],
    signals: [],
  };
}
