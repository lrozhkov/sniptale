import type { VideoEditorActionHandlers } from '../../commands';
import type { VideoEditorRuntimeController } from '../../session';
import type {
  AnnotationEditingPort,
  ClipSelectionPort,
  DiagnosticsTelemetryPort,
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
    Pick<DiagnosticsTelemetryPort, 'toggleTelemetryLaneVisibility'> &
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
    Pick<DiagnosticsTelemetryPort, 'recordingTelemetry' | 'telemetryLaneVisible'> &
    Pick<ProjectLifecyclePort, 'project'>,
  runtime: VideoEditorRuntimeController,
  project: NonNullable<ProjectLifecyclePort['project']>,
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
  store: TimelineEditingPort &
    AnnotationEditingPort &
    ClipSelectionPort &
    HistoryPort &
    PlaybackPort &
    EffectEditingPort &
    Pick<
      DiagnosticsTelemetryPort,
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
