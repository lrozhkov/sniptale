import type { StateCreator } from 'zustand';
import { createSceneSelection } from '../project/selection/model';
import { createInitialExportState } from './export-state';
import { createProjectStateActions } from './project-actions';
import { createSelectionStateActions as createTimelineSelectionStateActions } from './selection-actions';
import type { VideoEditorState } from './types';
import { createEmptyVideoEditorProjectHistory } from '../project/history';

type VideoEditorStoreSet = Parameters<StateCreator<VideoEditorState>>[0];

export function createVideoEditorTimelineState(set: VideoEditorStoreSet) {
  const recordingTelemetry: VideoEditorState['recordingTelemetry'] = [];
  return {
    project: null,
    projectHistory: createEmptyVideoEditorProjectHistory(),
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
    exportState: createInitialExportState(),
    recordingTelemetry,
    ...createProjectStateActions(set),
    ...createTimelineSelectionStateActions(set),
  };
}

export { resolveInitialSelectedClipId, resolveSelectedTrackId } from './selection-actions';
