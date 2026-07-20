import type { StateCreator } from 'zustand';
import { hydrateVideoProject } from '../../features/video/project/hydration';
import { getDefaultExportSettings } from '../../features/video/project/timeline';
import { resolveInitialVideoEditorSelection } from '../project/selection/model';
import type { VideoEditorState } from './types';
import { createInitialExportState } from './export-state';
import { applyProjectUpdate } from '../project/state/actions';
import { resolveInitialSelectedClipId, resolveInitialSelectedTrackId } from './selection-actions';

type VideoEditorStoreSet = Parameters<StateCreator<VideoEditorState>>[0];
type RecordingTelemetryState = Parameters<VideoEditorState['setRecordingTelemetry']>[0];

function resolveTelemetryLaneVisibility(
  currentTelemetry: RecordingTelemetryState,
  nextTelemetry: RecordingTelemetryState,
  telemetryLaneVisible: boolean
) {
  if (nextTelemetry === null) {
    return false;
  }

  return currentTelemetry?.recordingId === nextTelemetry.recordingId ? telemetryLaneVisible : true;
}

export function createProjectStateActions(set: VideoEditorStoreSet) {
  return {
    setProject: (
      project: Parameters<VideoEditorState['setProject']>[0],
      recordingId: Parameters<VideoEditorState['setProject']>[1] = null
    ) => {
      const hydratedProject = hydrateVideoProject(project);
      set({
        project: hydratedProject,
        recordingId,
        isReady: true,
        error: null,
        currentTime: 0,
        isPlaying: false,
        placementMode: null,
        recordingTelemetry: null,
        selection: resolveInitialVideoEditorSelection(hydratedProject),
        selectedTrackId: resolveInitialSelectedTrackId(hydratedProject),
        selectedClipId: resolveInitialSelectedClipId(hydratedProject),
        telemetryLaneVisible: false,
        exportState: {
          ...createInitialExportState(),
          settings: getDefaultExportSettings(hydratedProject),
        },
      });
    },
    updateProject: (updater: Parameters<VideoEditorState['updateProject']>[0]) =>
      set(
        (state): Partial<VideoEditorState> =>
          applyProjectUpdate(state, (project) => hydrateVideoProject(updater(project)))
      ),
    setReady: (isReady: boolean) => set({ isReady }),
    setError: (error: string | null) => set({ error }),
    setSaveState: (saveState: VideoEditorState['saveState']) => set({ saveState }),
    setRecordingTelemetry: (recordingTelemetry: RecordingTelemetryState) =>
      set((state) => ({
        recordingTelemetry,
        telemetryLaneVisible: resolveTelemetryLaneVisibility(
          state.recordingTelemetry,
          recordingTelemetry,
          state.telemetryLaneVisible
        ),
      })),
    toggleTelemetryLaneVisibility: () =>
      set((state) => ({
        telemetryLaneVisible:
          state.recordingTelemetry === null ? false : !state.telemetryLaneVisible,
      })),
  };
}
