import type { ProjectTimelineProps } from '../../timeline/project/types';
import type { VideoEditorWorkspaceController } from '../../runtime/controller/contracts/workspace';
import type { VideoEditorEffectDocumentDragPayload } from '../../contracts/effect-document-drag';
import type { VideoProjectEffectTarget } from '../../../features/video/project/effect-instance/types';

export function getProjectTimelineProps(
  controller: VideoEditorWorkspaceController,
  onDropEffectDocument: (
    payload: VideoEditorEffectDocumentDragPayload,
    target: VideoProjectEffectTarget,
    startTime: number
  ) => void
): ProjectTimelineProps {
  return {
    ...getProjectTimelineStateProps(controller),
    ...getProjectTimelineActionProps(controller),
    insertion: controller.timeline.actions.insertion,
    onDropEffectDocument,
  };
}

function getProjectTimelineStateProps(
  controller: VideoEditorWorkspaceController
): Pick<
  ProjectTimelineProps,
  | 'currentTime'
  | 'isPlaying'
  | 'magnetEnabled'
  | 'pixelsPerSecond'
  | 'playbackRange'
  | 'project'
  | 'recordingTelemetry'
  | 'selection'
  | 'selectedClipId'
  | 'selectedTrackId'
  | 'telemetryLaneVisible'
  | 'timelinePreviews'
> {
  return {
    currentTime: controller.timeline.state.currentTime,
    isPlaying: controller.timeline.state.isPlaying,
    magnetEnabled: controller.timeline.state.magnetEnabled,
    pixelsPerSecond: controller.timeline.state.pixelsPerSecond,
    playbackRange: controller.timeline.state.playbackRange,
    project: controller.timeline.state.project,
    recordingTelemetry: controller.timeline.state
      .recordingTelemetry as ProjectTimelineProps['recordingTelemetry'],
    selection: controller.timeline.state.selection,
    selectedClipId: controller.timeline.state.selectedClipId,
    selectedTrackId: controller.timeline.state.selectedTrackId,
    telemetryLaneVisible: controller.timeline.state.telemetryLaneVisible,
    timelinePreviews: controller.timeline.state.timelinePreviews,
  };
}

function getProjectTimelineActionProps(
  controller: VideoEditorWorkspaceController
): Omit<
  ProjectTimelineProps,
  keyof ReturnType<typeof getProjectTimelineStateProps> | 'insertion' | 'onDropEffectDocument'
> {
  return {
    ...getTimelineMutationActionProps(controller),
    ...getTimelineInteractionActionProps(controller),
  };
}

function getTimelineMutationActionProps(controller: VideoEditorWorkspaceController) {
  return {
    onAutoTransformRecording: controller.timeline.actions.onAutoTransformRecording,
    onAddTrackLogicalLane: controller.timeline.actions.onAddTrackLogicalLane,
    onClearPlaybackRange: controller.timeline.actions.onClearPlaybackRange,
    onCloseTrackGap: controller.timeline.actions.onCloseTrackGap,
    onDeleteSelectedClip: controller.timeline.actions.onDeleteSelectedClip,
    onDeleteSelectedTimelineObject: controller.timeline.actions.onDeleteSelectedTimelineObject,
    onDeleteTrack: controller.timeline.actions.onDeleteTrack,
    onClearUtilityLane: controller.timeline.actions.onClearUtilityLane,
    onDuplicateSelectedClip: controller.timeline.actions.onDuplicateSelectedClip,
    onMoveActionEvent: controller.timeline.actions.onMoveActionEvent,
    onMoveClip: controller.timeline.actions.onMoveClip,
    onMoveTrack: controller.timeline.actions.onMoveTrack,
    onRenameTrack: controller.timeline.actions.onRenameTrack,
    onSplitSelectedClip: controller.timeline.actions.onSplitSelectedClip,
    onToggleTrackLock: controller.timeline.actions.onToggleTrackLock,
    onToggleTrackVisibility: controller.timeline.actions.onToggleTrackVisibility,
    onToggleUtilityLaneLock: controller.timeline.actions.onToggleUtilityLaneLock,
    onToggleUtilityLaneVisibility: controller.timeline.actions.onToggleUtilityLaneVisibility,
    onTrimClipEnd: controller.timeline.actions.onTrimClipEnd,
    onTrimClipStart: controller.timeline.actions.onTrimClipStart,
    onUpdateEffectInstance: controller.timeline.actions.onUpdateEffectInstance,
    onUpdateSelectedClipPlaybackRate: controller.timeline.actions.onUpdateSelectedClipPlaybackRate,
  };
}

function getTimelineInteractionActionProps(controller: VideoEditorWorkspaceController) {
  return {
    onMoveCursorSegment: controller.timeline.actions.onMoveCursorSegment,
    onMoveMotionRegion: controller.timeline.actions.onMoveMotionRegion,
    onMoveTransitionSegment: controller.timeline.actions.onMoveTransitionSegment,
    onResizeActionEvent: controller.timeline.actions.onResizeActionEvent,
    onResizeMotionRegion: controller.timeline.actions.onResizeMotionRegion,
    onSeek: controller.timeline.actions.onSeek,
    onSeekToStart: controller.timeline.actions.onSeekToStart,
    onSelectActionSegment: controller.timeline.actions.onSelectActionSegment,
    onSelectClip: controller.timeline.actions.onSelectClip,
    onSelectCursorSegment: controller.timeline.actions.onSelectCursorSegment,
    onSelectMotionRegion: controller.timeline.actions.onSelectMotionRegion,
    onSelectObjectTrack: controller.timeline.actions.onSelectObjectTrack,
    onSelectScene: controller.timeline.actions.onSelectScene,
    onSelectTrack: controller.timeline.actions.onSelectTrack,
    onSelectTransition: controller.timeline.actions.onSelectTransition,
    onSetPlaybackRange: controller.timeline.actions.onSetPlaybackRange,
    onTimelinePreviewSuspendedChange: controller.timeline.actions.onTimelinePreviewSuspendedChange,
    onTimelinePreviewViewportChange: controller.timeline.actions.onTimelinePreviewViewportChange,
    onTogglePlay: controller.timeline.actions.onTogglePlay,
    onToggleTelemetryLaneVisibility: controller.timeline.actions.onToggleTelemetryLaneVisibility,
    onZoomChange: controller.timeline.actions.onZoomChange,
  };
}
