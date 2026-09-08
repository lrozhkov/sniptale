import type { StateCreator } from 'zustand';
import { hydrateVideoProject } from '../../features/video/project/hydration';
import { getDefaultExportSettings } from '../../features/video/project/timeline';
import { resolveInitialVideoEditorSelection } from '../project/selection/model';
import { VideoEditorSelectionKind } from '../contracts/selection';
import type { VideoEditorState } from './types';
import { createInitialExportState } from './export-state';
import { applyProjectUpdate } from '../project/state/actions';
import { isVideoEditorPresentedTrack } from '../project/operations/presented-tracks';
import { resetVideoEditorProjectHistory } from '../project/history';
import { collectProjectRecordingIds } from '../project/operations/source-timed-clips';
import { planTypingCompression } from '../project/state/clip-timeline/source-range';
import { applyProjectSnapshot } from '../project/state/helpers';
import { recordVideoEditorProjectHistory } from '../project/history';

type VideoEditorStoreSet = Parameters<StateCreator<VideoEditorState>>[0];
type RecordingTelemetryState = Parameters<VideoEditorState['setRecordingTelemetry']>[0];

export function createProjectStateActions(set: VideoEditorStoreSet) {
  return {
    applyTypingCompression: ((request, expectedProject) => {
      let result: ReturnType<VideoEditorState['applyTypingCompression']> = { status: 'stale' };
      set((state) => {
        if (!state.project || state.project !== expectedProject) return state;
        const plan = planTypingCompression(state.project, state.recordingTelemetry, request);
        if (plan.status !== 'ready') {
          result = { status: plan.status };
          return state;
        }
        result = { status: 'applied', clipId: plan.clipId };
        const clip = plan.project.clips.find((item) => item.id === plan.clipId);
        return {
          ...applyProjectSnapshot(state, plan.project),
          projectHistory: recordVideoEditorProjectHistory(
            state.projectHistory,
            state.project,
            plan.project
          ),
          selection: {
            kind: VideoEditorSelectionKind.HISTORY_SPAN,
            recordingId: request.recordingId,
            sourceInstanceId: request.sourceInstanceId,
            signalId: request.signalId,
            clipId: plan.clipId,
          },
          selectedTrackId: clip?.trackId ?? null,
          currentTime: clip?.startTime ?? state.currentTime,
          placementMode: null,
        };
      });
      return result;
    }) satisfies VideoEditorState['applyTypingCompression'],
    setProject: (
      project: Parameters<VideoEditorState['setProject']>[0],
      recordingId: Parameters<VideoEditorState['setProject']>[1] = null
    ) => {
      const hydratedProject = hydrateVideoProject(project);
      const selection = resolveInitialVideoEditorSelection(hydratedProject);
      const selectedClip =
        selection.kind === VideoEditorSelectionKind.CLIP
          ? (hydratedProject.clips.find((clip) => clip.id === selection.clipId) ?? null)
          : null;
      set({
        project: hydratedProject,
        projectHistory: resetVideoEditorProjectHistory(hydratedProject.id),
        recordingId,
        saveState: 'saved',
        isReady: true,
        error: null,
        currentTime: 0,
        isPlaying: false,
        placementMode: null,
        recordingTelemetry: [],
        selection,
        selectedTrackId:
          selectedClip?.trackId ??
          hydratedProject.tracks.find(isVideoEditorPresentedTrack)?.id ??
          null,
        exportState: {
          ...createInitialExportState(),
          settings: getDefaultExportSettings(hydratedProject),
        },
      });
    },
    updateProject: (updater: Parameters<VideoEditorState['updateProject']>[0]) =>
      set((state): Partial<VideoEditorState> => {
        if (!state.project) return {};
        const updatedProject = updater(state.project);
        if (updatedProject === state.project) return {};
        return applyProjectUpdate(state, () => hydrateVideoProject(updatedProject));
      }),
    syncProjectRevision: (
      expectedProject: Parameters<VideoEditorState['syncProjectRevision']>[0],
      persistedUpdatedAt: Parameters<VideoEditorState['syncProjectRevision']>[1]
    ) =>
      set((state) => {
        if (state.project !== expectedProject) {
          return {};
        }
        return { project: { ...expectedProject, updatedAt: persistedUpdatedAt } };
      }),
    setReady: (isReady: boolean) => set({ isReady }),
    setError: (error: string | null) => set({ error }),
    setSaveState: (saveState: VideoEditorState['saveState']) => set({ saveState }),
    setRecordingTelemetry: (recordingTelemetry: RecordingTelemetryState) =>
      set((state) => {
        const allowedIds = new Set(collectProjectRecordingIds(state.project));
        const seen = new Set<string>();
        const matchingTelemetry = recordingTelemetry.filter((entry) => {
          if (!allowedIds.has(entry.recordingId) || seen.has(entry.recordingId)) return false;
          seen.add(entry.recordingId);
          return true;
        });
        return {
          recordingTelemetry: matchingTelemetry,
        };
      }),
  };
}
