import type { StateCreator } from 'zustand';
import type { VideoProject } from '../../features/video/project/types';
import { hydrateVideoProject } from '../../features/video/project/hydration';
import { getDefaultExportSettings } from '../../features/video/project/timeline';
import { resolveInitialVideoEditorSelection } from '../project/selection/model';
import { VideoEditorSelectionKind } from '../contracts/selection';
import type { VideoEditorState } from './types';
import { createInitialExportState } from './export-state';
import { applyProjectUpdate } from '../project/state/actions';
import { isVideoEditorPresentedTrack } from '../project/operations/presented-tracks';
import {
  resetVideoEditorProjectHistory,
  restoreVideoEditorProjectHistory,
} from '../project/history';
import { collectProjectRecordingIds } from '../project/operations/source-timed-clips';
import { planTypingCompression } from '../project/state/clip-timeline/source-range';
import { applyProjectSnapshot } from '../project/state/helpers';
import { recordVideoEditorProjectHistory } from '../project/history';

type VideoEditorStoreSet = Parameters<StateCreator<VideoEditorState>>[0];
type RecordingTelemetryState = Parameters<VideoEditorState['setRecordingTelemetry']>[0];

function hydrateProjectUpdate(current: VideoProject, proposed: VideoProject): VideoProject {
  if (
    !current.cursorTrack ||
    current.id !== proposed.id ||
    current.cursorTrack !== proposed.cursorTrack ||
    current.clips !== proposed.clips ||
    current.assets !== proposed.assets ||
    current.source !== proposed.source ||
    current.baseRecordingId !== proposed.baseRecordingId
  )
    return hydrateVideoProject(proposed);

  // Materialization can introduce samples without the optional override. Their next
  // hydration must still admit the explicit null before this branch can be reused.
  if (current.cursorTrack.samples.some((sample) => sample.skinOverride === undefined))
    return hydrateVideoProject(proposed);

  // Captured cursor facts depend on the admitted source graph, not scene settings.
  const hydrated = hydrateVideoProject({ ...proposed, cursorTrack: null });
  if (
    JSON.stringify(hydrated.clips) !== JSON.stringify(current.clips) ||
    JSON.stringify(hydrated.assets) !== JSON.stringify(current.assets) ||
    JSON.stringify(hydrated.source) !== JSON.stringify(current.source)
  )
    return hydrateVideoProject(proposed);

  return {
    ...hydrated,
    clips: current.clips,
    assets: current.assets,
    source: current.source,
    cursorTrack: current.cursorTrack,
  };
}

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
            plan.project,
            state.selection
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
      recordingId: Parameters<VideoEditorState['setProject']>[1] = null,
      workspace?: Parameters<VideoEditorState['setProject']>[2]
    ) => {
      if (
        workspace &&
        (workspace.project.id !== project.id ||
          (workspace.history.status === 'ready' &&
            workspace.history.value.projectId !== project.id))
      )
        throw new Error('Video project opening snapshot belongs to another project');
      const hydratedProject = hydrateVideoProject(project);
      const selection = resolveInitialVideoEditorSelection(hydratedProject);
      const selectedClip =
        selection.kind === VideoEditorSelectionKind.CLIP
          ? (hydratedProject.clips.find((clip) => clip.id === selection.clipId) ?? null)
          : null;
      set({
        project: hydratedProject,
        projectHistory:
          workspace?.history.status === 'ready'
            ? restoreVideoEditorProjectHistory(hydratedProject.id, workspace.history.value)
            : {
                ...resetVideoEditorProjectHistory(hydratedProject.id),
                error: workspace?.history.status === 'unavailable' ? 'snapshotFailed' : null,
              },
        nativeWorkspace: workspace
          ? {
              project: workspace.project,
              workspaceRevision: workspace.workspaceRevision,
              savedRuntimeProject: hydratedProject,
              historyStatus: workspace.history.status,
              historyAssetsByValue:
                workspace.history.status === 'ready'
                  ? workspace.history.value.assetsByValue
                  : new Map(),
            }
          : null,
        projectSessionId: Symbol('video-editor-project-session'),
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
        const current = state.project;
        const updatedProject = updater(current);
        if (updatedProject === state.project) return {};
        return applyProjectUpdate(state, () => hydrateProjectUpdate(current, updatedProject));
      }),
    syncNativeWorkspace: (
      expectedSessionId: Parameters<VideoEditorState['syncNativeWorkspace']>[0],
      workspace: Parameters<VideoEditorState['syncNativeWorkspace']>[1]
    ) =>
      set((state) => {
        if (
          state.projectSessionId !== expectedSessionId ||
          state.project?.id !== workspace.project.id
        )
          return state;
        return { nativeWorkspace: workspace };
      }),
    syncProjectRevision: (
      expectedProject: Parameters<VideoEditorState['syncProjectRevision']>[0],
      persistedUpdatedAt: Parameters<VideoEditorState['syncProjectRevision']>[1]
    ) =>
      set((state) => {
        if (state.project !== expectedProject) {
          return {};
        }
        const project = { ...expectedProject, updatedAt: persistedUpdatedAt };
        return {
          project,
          ...(state.nativeWorkspace?.savedRuntimeProject === expectedProject &&
          state.nativeWorkspace.project.updatedAt === persistedUpdatedAt
            ? { nativeWorkspace: { ...state.nativeWorkspace, savedRuntimeProject: project } }
            : {}),
        };
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
