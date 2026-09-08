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
  | 'canDeleteSelectedClip'
  | 'canEditSelectedClip'
  | 'canSplitSelectedClip'
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
  | 'timelinePreviews'
> {
  return {
    canDeleteSelectedClip: controller.state.canDeleteSelectedClip,
    canEditSelectedClip: controller.state.canEditSelectedClip,
    canSplitSelectedClip: controller.state.canSplitSelectedClip,
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
    autoProcessing: controller.actions.autoProcessing,
    onAutoProcessingModalVisibilityChange: controller.actions.onAutoProcessingModalVisibilityChange,
    onAddTrackLogicalLane: controller.actions.onAddTrackLogicalLane,
    onCloseTrackGap: controller.actions.onCloseTrackGap,
    onDeleteSelectedClip: controller.actions.onDeleteSelectedClip,
    onDeleteSelectedTimelineObject: controller.actions.onDeleteSelectedTimelineObject,
    onClearUtilityLane: controller.actions.onClearUtilityLane,
    onDuplicateSelectedClip: controller.actions.onDuplicateSelectedClip,
    onSwapClip: controller.actions.onSwapClip,
    onMoveClip: controller.actions.onMoveClip,
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
    onMoveActionOccurrence: controller.actions.onMoveActionOccurrence,
    onMoveMotionRegion: controller.actions.onMoveMotionRegion,
    onMoveTransitionSegment: controller.actions.onMoveTransitionSegment,
    onResizeMotionRegion: controller.actions.onResizeMotionRegion,
    onSeekToEnd: controller.actions.onSeekToEnd,
    onSeekToStart: controller.actions.onSeekToStart,
    onTogglePlay: controller.actions.onTogglePlay,
    onSeek: controller.actions.onSeek,
    onClearPlaybackRange: controller.actions.onClearPlaybackRange,
    onStepToNextFrame: controller.actions.onStepToNextFrame,
    onStepToPreviousFrame: controller.actions.onStepToPreviousFrame,
    ...(controller.actions.onSelectHistorySpan
      ? { onSelectHistorySpan: controller.actions.onSelectHistorySpan }
      : {}),
    onSelectActionOccurrence: controller.actions.onSelectActionOccurrence,
    onSelectClip: controller.actions.onSelectClip,
    onSelectCursorSegment: controller.actions.onSelectCursorSegment,
    onSelectHistoryLane: controller.actions.onSelectHistoryLane,
    onSelectMotionLane: controller.actions.onSelectMotionLane,
    onSelectMotionRegion: controller.actions.onSelectMotionRegion,
    onConnectMotionRegions: controller.actions.onConnectMotionRegions,
    onSelectObjectTrack: controller.actions.onSelectObjectTrack,
    onSelectScene: controller.actions.onSelectScene,
    onSelectTrack: controller.actions.onSelectTrack,
    onSelectTransition: controller.actions.onSelectTransition,
    onSetPlaybackRange: controller.actions.onSetPlaybackRange,
    onTimelinePreviewSuspendedChange: controller.actions.onTimelinePreviewSuspendedChange,
    onTimelinePreviewViewportChange: controller.actions.onTimelinePreviewViewportChange,
    onZoomChange: controller.actions.onZoomChange,
  };
}
