import type { StateCreator } from 'zustand';
import { createSceneSelection } from '../project/selection/model';
import { createInitialExportState } from './export-state';
import { createProjectStateActions } from './project-actions';
import { createSelectionStateActions as createTimelineSelectionStateActions } from './selection-actions';
import type { VideoEditorState } from './types';

type VideoEditorStoreSet = Parameters<StateCreator<VideoEditorState>>[0];

export function createVideoEditorTimelineState(set: VideoEditorStoreSet) {
  return {
    project: null,
    recordingId: null,
    isReady: false,
    error: null,
    saveState: 'idle' as const,
    currentTime: 0,
    isPlaying: false,
    pixelsPerSecond: 90,
    placementMode: null,
    selection: createSceneSelection(),
    selectedTrackId: null,
    selectedClipId: null,
    diagnosticsOpen: false,
    exportState: createInitialExportState(),
    recordingTelemetry: null,
    telemetryLaneVisible: false,
    ...createProjectStateActions(set),
    ...createTimelineSelectionStateActions(set),
  };
}

export { resolveInitialSelectedClipId, resolveSelectedTrackId } from './selection-actions';
