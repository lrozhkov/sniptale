import type { VideoEditorActionHandlers } from '../../commands';
import type { VideoEditorRuntimeController } from '../../session';
import type {
  AnnotationEditingPort,
  ClipSelectionPort,
  RecordingTelemetryPort,
  EffectEditingPort,
  HistoryPort,
  PlaybackPort,
  ProjectLifecyclePort,
  TimelineEditingPort,
} from '../../../contracts/controller-store';
import type { VideoEditorWorkspaceState } from '../workspace-state';
import {
  createWorkspaceTimelineEditingActions,
  createWorkspaceTimelineSelectionActions,
} from './timeline-actions';
import { createWorkspaceTimelineInsertionActions } from './timeline-insertion';
import {
  canEditProjectClip,
  canSplitProjectClipAtTime,
} from '../../../../features/video/project/timeline';

type TimelineImportHandlers = Pick<
  VideoEditorActionHandlers,
  'handleImportAudio' | 'handleImportImage' | 'handleImportVideo'
>;
type TimelineActionWorkspace = Pick<
  VideoEditorWorkspaceState,
  'clearPlaybackRange' | 'confirm' | 'inspector' | 'playbackRange' | 'setPlaybackRange'
>;
type TimelineStateWorkspace = Pick<VideoEditorWorkspaceState, 'grid' | 'playbackRange'>;
type TimelineControllerWorkspace = TimelineActionWorkspace & TimelineStateWorkspace;
type TimelineProjectUpdaters = {
  addActionEvent: (
    preset: NonNullable<
      NonNullable<ProjectLifecyclePort['project']>['actionEvents'][number]['preset']
    >
  ) => void;
  addMotionRegion: () => void;
  enableCursorTrack: () => void;
  updateEffectInstance: EffectEditingPort['updateEffectInstance'];
};
type TimelineSelectedClipActions = {
  deleteSelectedClip: () => void;
  duplicateSelectedClip: () => void;
  splitSelectedClip: () => void;
};

function createWorkspaceTimelineActions(
  store: TimelineEditingPort &
    AnnotationEditingPort &
    ClipSelectionPort &
    Pick<RecordingTelemetryPort, 'toggleTelemetryLaneVisibility'> &
    HistoryPort &
    Pick<ProjectLifecyclePort, 'project' | 'setError'>,
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
  store: TimelineEditingPort &
    ClipSelectionPort &
    PlaybackPort &
    Pick<RecordingTelemetryPort, 'recordingTelemetry' | 'telemetryLaneVisible'> &
    Pick<ProjectLifecyclePort, 'project'>,
  runtime: VideoEditorRuntimeController,
  project: NonNullable<ProjectLifecyclePort['project']>,
  workspace: TimelineStateWorkspace
) {
  return {
    canEditSelectedClip:
      store.selectedClipId !== null && canEditProjectClip(project, store.selectedClipId),
    canSplitSelectedClip:
      store.selectedClipId !== null &&
      canSplitProjectClipAtTime(project, store.selectedClipId, store.currentTime),
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
  store: TimelineEditingPort &
    AnnotationEditingPort &
    ClipSelectionPort &
    HistoryPort &
    PlaybackPort &
    EffectEditingPort &
    Pick<
      RecordingTelemetryPort,
      'recordingTelemetry' | 'telemetryLaneVisible' | 'toggleTelemetryLaneVisibility'
    > &
    Pick<ProjectLifecyclePort, 'project' | 'setError'>,
  runtime: VideoEditorRuntimeController,
  project: NonNullable<ProjectLifecyclePort['project']>,
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
