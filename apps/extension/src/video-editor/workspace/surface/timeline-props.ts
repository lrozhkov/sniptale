import type { ProjectTimelineProps } from '../../timeline/project/types';
import type { VideoEditorTimelineController } from '../../runtime/controller/contracts/timeline';
import type { VideoEditorEffectDocumentDragPayload } from '../../contracts/effect-document-drag';
import type { VideoProjectEffectTarget } from '../../../features/video/project/effect-instance/types';

export function getProjectTimelineProps(
  controller: VideoEditorTimelineController,
  onDropEffectDocument: (
    payload: VideoEditorEffectDocumentDragPayload,
    target: VideoProjectEffectTarget,
    startTime: number
  ) => void
): ProjectTimelineProps {
  return {
    ...getProjectTimelineStateProps(controller),
    ...getProjectTimelineActionProps(controller),
    insertion: controller.actions.insertion,
    onDropEffectDocument,
  };
}

function getProjectTimelineStateProps(
  controller: VideoEditorTimelineController
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
    currentTime: controller.state.currentTime,
    isPlaying: controller.state.isPlaying,
    magnetEnabled: controller.state.magnetEnabled,
    pixelsPerSecond: controller.state.pixelsPerSecond,
    playbackRange: controller.state.playbackRange,
    project: controller.state.project,
    recordingTelemetry: controller.state.recordingTelemetry,
    selection: controller.state.selection,
    selectedClipId: controller.state.selectedClipId,
    selectedTrackId: controller.state.selectedTrackId,
    telemetryLaneVisible: controller.state.telemetryLaneVisible,
    timelinePreviews: controller.state.timelinePreviews,
  };
}

function getProjectTimelineActionProps(
  controller: VideoEditorTimelineController
): Omit<
  ProjectTimelineProps,
  keyof ReturnType<typeof getProjectTimelineStateProps> | 'insertion' | 'onDropEffectDocument'
> {
  return {
    ...getTimelineMutationActionProps(controller),
    ...getTimelineInteractionActionProps(controller),
  };
}

function getTimelineMutationActionProps(controller: VideoEditorTimelineController) {
  return {
    historyTransaction: controller.actions.historyTransaction,
    onAutoTransformRecording: controller.actions.onAutoTransformRecording,
    onAddTrackLogicalLane: controller.actions.onAddTrackLogicalLane,
    onClearPlaybackRange: controller.actions.onClearPlaybackRange,
    onCloseTrackGap: controller.actions.onCloseTrackGap,
    onDeleteSelectedClip: controller.actions.onDeleteSelectedClip,
    onDeleteSelectedTimelineObject: controller.actions.onDeleteSelectedTimelineObject,
    onDeleteTrack: controller.actions.onDeleteTrack,
    onClearUtilityLane: controller.actions.onClearUtilityLane,
    onDuplicateSelectedClip: controller.actions.onDuplicateSelectedClip,
    onMoveActionEvent: controller.actions.onMoveActionEvent,
    onMoveClip: controller.actions.onMoveClip,
    onMoveTrack: controller.actions.onMoveTrack,
    onRenameTrack: controller.actions.onRenameTrack,
    onSplitSelectedClip: controller.actions.onSplitSelectedClip,
    onToggleTrackLock: controller.actions.onToggleTrackLock,
    onToggleTrackVisibility: controller.actions.onToggleTrackVisibility,
    onToggleUtilityLaneLock: controller.actions.onToggleUtilityLaneLock,
    onToggleUtilityLaneVisibility: controller.actions.onToggleUtilityLaneVisibility,
    onTrimClipEnd: controller.actions.onTrimClipEnd,
    onTrimClipStart: controller.actions.onTrimClipStart,
    onUpdateEffectInstance: controller.actions.onUpdateEffectInstance,
    onUpdateSelectedClipPlaybackRate: controller.actions.onUpdateSelectedClipPlaybackRate,
  };
}

function getTimelineInteractionActionProps(controller: VideoEditorTimelineController) {
  return {
    onMoveCursorSegment: controller.actions.onMoveCursorSegment,
    onMoveMotionRegion: controller.actions.onMoveMotionRegion,
    onMoveTransitionSegment: controller.actions.onMoveTransitionSegment,
    onResizeActionEvent: controller.actions.onResizeActionEvent,
    onResizeMotionRegion: controller.actions.onResizeMotionRegion,
    onSeek: controller.actions.onSeek,
    onSeekToStart: controller.actions.onSeekToStart,
    onSelectActionSegment: controller.actions.onSelectActionSegment,
    onSelectClip: controller.actions.onSelectClip,
    onSelectCursorSegment: controller.actions.onSelectCursorSegment,
    onSelectMotionRegion: controller.actions.onSelectMotionRegion,
    onSelectObjectTrack: controller.actions.onSelectObjectTrack,
    onSelectScene: controller.actions.onSelectScene,
    onSelectTrack: controller.actions.onSelectTrack,
    onSelectTransition: controller.actions.onSelectTransition,
    onSetPlaybackRange: controller.actions.onSetPlaybackRange,
    onTimelinePreviewSuspendedChange: controller.actions.onTimelinePreviewSuspendedChange,
    onTimelinePreviewViewportChange: controller.actions.onTimelinePreviewViewportChange,
    onTogglePlay: controller.actions.onTogglePlay,
    onToggleTelemetryLaneVisibility: controller.actions.onToggleTelemetryLaneVisibility,
    onZoomChange: controller.actions.onZoomChange,
  };
}
