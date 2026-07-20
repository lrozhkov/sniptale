import type { VideoEditorActionHandlers } from '../../commands';
import type { VideoEditorRuntimeController } from '../../session';
import type { VideoEditorControllerStorePort } from '../../../contracts/controller-store';
import type { VideoEditorWorkspaceState } from '../workspace-state';
import {
  createWorkspaceTimelineEditingActions,
  createWorkspaceTimelineSelectionActions,
} from './timeline-actions';
import { createWorkspaceTimelineInsertionActions } from './timeline-insertion';

type TimelineImportHandlers = Pick<
  VideoEditorActionHandlers,
  'handleImportAudio' | 'handleImportImage' | 'handleImportVideo'
>;
type TimelineActionWorkspace = Pick<
  VideoEditorWorkspaceState,
  'clearPlaybackRange' | 'confirm' | 'inspector' | 'setPlaybackRange'
>;
type TimelineStateWorkspace = Pick<VideoEditorWorkspaceState, 'grid' | 'playbackRange'>;
type TimelineControllerWorkspace = TimelineActionWorkspace & TimelineStateWorkspace;
type TimelineProjectUpdaters = {
  addActionEvent: (
    preset: NonNullable<
      NonNullable<VideoEditorControllerStorePort['project']>['actionEvents'][number]['preset']
    >
  ) => void;
  addMotionRegion: () => void;
  enableCursorTrack: () => void;
  updateEffectInstance: VideoEditorControllerStorePort['updateEffectInstance'];
};
type TimelineSelectedClipActions = {
  deleteSelectedClip: () => void;
  duplicateSelectedClip: () => void;
  splitSelectedClip: () => void;
};

function createWorkspaceTimelineActions(
  store: VideoEditorControllerStorePort,
  runtime: VideoEditorRuntimeController,
  actions: TimelineImportHandlers,
  workspace: TimelineActionWorkspace,
  projectUpdaters: TimelineProjectUpdaters,
  selectedClipActions: TimelineSelectedClipActions
) {
  return {
    insertion: createWorkspaceTimelineInsertionActions(store, actions, projectUpdaters),
    ...createWorkspaceTimelineEditingActions(store, workspace, selectedClipActions),
    onUpdateEffectInstance: projectUpdaters.updateEffectInstance,
    ...createWorkspaceTimelineSelectionActions(store, runtime, workspace),
    onTimelinePreviewSuspendedChange: runtime.setTimelinePreviewSuspended,
    onTimelinePreviewViewportChange: runtime.setTimelinePreviewViewport,
  };
}

function createWorkspaceTimelineState(
  store: VideoEditorControllerStorePort,
  runtime: VideoEditorRuntimeController,
  project: NonNullable<VideoEditorControllerStorePort['project']>,
  workspace: TimelineStateWorkspace
) {
  return {
    currentTime: store.currentTime,
    isPlaying: store.isPlaying,
    magnetEnabled: workspace.grid.magnetEnabled,
    pixelsPerSecond: store.pixelsPerSecond,
    playbackRange: workspace.playbackRange,
    project,
    recordingTelemetry: store.recordingTelemetry,
    selection: store.selection,
    selectedClipId: store.selectedClipId,
    selectedTrackId: store.selectedTrackId,
    telemetryLaneVisible: store.telemetryLaneVisible,
    timelinePreviews: runtime.timelinePreviews,
  };
}

export function createWorkspaceTimelineController(
  store: VideoEditorControllerStorePort,
  runtime: VideoEditorRuntimeController,
  project: NonNullable<VideoEditorControllerStorePort['project']>,
  actions: TimelineImportHandlers,
  workspace: TimelineControllerWorkspace,
  projectUpdaters: TimelineProjectUpdaters,
  selectedClipActions: TimelineSelectedClipActions
) {
  return {
    actions: createWorkspaceTimelineActions(
      store,
      runtime,
      actions,
      workspace,
      projectUpdaters,
      selectedClipActions
    ),
    state: createWorkspaceTimelineState(store, runtime, project, workspace),
  };
}
