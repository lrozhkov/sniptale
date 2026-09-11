import type { AutoProcessingActions } from '../../../project/operations/auto-transform';
import type { RecordingTelemetryEntry } from '../../../../composition/persistence/recordings/contracts';
import type { TimelinePreviewViewport } from '../../../contracts/timeline-preview';
import type { VideoEditorPlaybackRange } from '../../../interaction/playback/range';
import type { VideoEditorSelection } from '../../../contracts/selection';
import type { VideoEditorProjectActions } from '../../../contracts/commands/project';
import type { VideoEditorProjectHistoryTransactionActions } from '../../../contracts/commands/history';
import type { VideoEditorSessionActions } from '../../../contracts/commands/session';
import type { VideoProject } from '../../../../features/video/project/types';
import type { VideoEditorRuntimeController } from '../../session';
import type { VideoEditorWorkspaceState } from '../workspace-state';
import type { VideoEditorInsertionActions } from './insertion';

interface VideoEditorTimelineState {
  canDeleteSelectedClip: boolean;
  canEditSelectedClip: boolean;
  canSplitSelectedClip: boolean;
  currentTime: number;
  isPlaying: boolean;
  isPreparingPlayback?: boolean | undefined;
  magnetEnabled: boolean;
  pixelsPerSecond: number;
  playbackRange: VideoEditorPlaybackRange | null;
  project: VideoProject;
  recordingTelemetry: readonly RecordingTelemetryEntry[];
  selectedClipId: string | null;
  selectedTrackId: string | null;
  selection: VideoEditorSelection;
  timelinePreviews: VideoEditorRuntimeController['timelinePreviews'];
}

interface VideoEditorTimelineActions {
  historyTransaction: VideoEditorProjectHistoryTransactionActions;
  insertion: VideoEditorInsertionActions & {
    onUnsupportedFileDrop: () => void;
  };
  onAddTrackLogicalLane: VideoEditorProjectActions['addTrackLogicalLane'];
  onDeleteSelectedClip: () => void;
  onDeleteSelectedTimelineObject: () => void;
  onDeleteTrack: (trackId: string) => void;
  onToggleUtilityLaneVisibility: VideoEditorProjectActions['toggleUtilityLaneVisibility'];
  onToggleUtilityLaneLock: VideoEditorProjectActions['toggleUtilityLaneLock'];
  onClearUtilityLane: VideoEditorProjectActions['clearUtilityLane'];
  onDuplicateSelectedClip: () => void;
  onUpdateSelectedClipPlaybackRate: (playbackRate: number) => void;
  autoProcessing: AutoProcessingActions;
  onAutoProcessingModalVisibilityChange: (open: boolean) => void;
  onCloseTrackGap: VideoEditorProjectActions['closeTrackGap'];
  onSwapClip: VideoEditorProjectActions['swapClip'];
  onMoveClip: VideoEditorProjectActions['moveClip'];
  onRenameTrack: VideoEditorProjectActions['renameTrack'];
  onMoveCursorSegment: (
    sampleId: string,
    nextSampleId: string | null,
    startTime: number,
    endTime: number | null
  ) => void;
  onMoveActionOccurrence?:
    | ((eventId: string, clipId: string | null, time: number) => void)
    | undefined;
  onMoveMotionRegion: (motionRegionId: string, startTime: number) => void;
  onMoveTrack: VideoEditorProjectActions['moveTrack'];
  onMoveTransitionSegment: (transitionId: string, startTime: number) => void;
  onResizeMotionRegion: (motionRegionId: string, startTime: number, duration: number) => void;
  onUpdateEffectInstance: VideoEditorProjectActions['updateEffectInstance'];
  onSeek: VideoEditorRuntimeController['seekTo'];
  onSeekToEnd: () => void;
  onSeekToStart: () => void;
  onClearPlaybackRange: () => void;
  onStepToNextFrame: () => void;
  onStepToPreviousFrame: () => void;
  onSelectHistorySpan?: VideoEditorSessionActions['selectHistorySpan'];
  onSelectActionOccurrence: VideoEditorSessionActions['selectActionOccurrence'];
  onSelectClip: VideoEditorSessionActions['selectClip'];
  onSelectCursorSegment: VideoEditorSessionActions['selectCursorSegment'];
  onSelectMotionRegion: VideoEditorSessionActions['selectMotionRegion'];
  onConnectMotionRegions: (fromRegionId: string, toRegionId: string) => void;
  onSelectHistoryLane: VideoEditorSessionActions['selectHistoryLane'];
  onSelectMotionLane: VideoEditorSessionActions['selectMotionLane'];
  onSelectObjectTrack: VideoEditorSessionActions['selectObjectTrack'];
  onSelectScene: VideoEditorSessionActions['selectScene'];
  onSelectTrack: VideoEditorSessionActions['selectTrack'];
  onSelectTransition: VideoEditorSessionActions['selectTransition'];
  onSetPlaybackRange: VideoEditorWorkspaceState['setPlaybackRange'];
  onSplitSelectedClip: () => void;
  onTogglePlay: () => void;
  onToggleTrackLock: VideoEditorProjectActions['toggleTrackLock'];
  onToggleTrackVisibility: VideoEditorProjectActions['toggleTrackVisibility'];
  onTrimClipEnd: VideoEditorProjectActions['trimClipEnd'];
  onTrimClipStart: VideoEditorProjectActions['trimClipStart'];
  onZoomChange: VideoEditorSessionActions['setPixelsPerSecond'];
  onTimelinePreviewSuspendedChange: (suspended: boolean) => void;
  onTimelinePreviewViewportChange: (viewport: TimelinePreviewViewport) => void;
}

export interface VideoEditorTimelineController {
  actions: VideoEditorTimelineActions;
  state: VideoEditorTimelineState;
}
