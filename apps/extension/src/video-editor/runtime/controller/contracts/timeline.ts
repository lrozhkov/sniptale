import type { RecordingTelemetryEntry } from '../../../../composition/persistence/recordings/contracts';
import type { VideoAutoProcessingSettings } from '@sniptale/runtime-contracts/video/types/types';
import type { TimelinePreviewViewport } from '../../../contracts/timeline-preview';
import type { VideoEditorPlaybackRange } from '../../../interaction/playback/range';
import type { VideoEditorSelection } from '../../../contracts/selection';
import type { VideoEditorProjectActions } from '../../../contracts/commands/project';
import type { VideoEditorSessionActions } from '../../../contracts/commands/session';
import type { VideoProject } from '../../../../features/video/project/types';
import type { VideoEditorRuntimeController } from '../../session';
import type { VideoEditorWorkspaceState } from '../workspace-state';
import type { VideoEditorInsertionActions } from './insertion';

interface VideoEditorTimelineState {
  currentTime: number;
  isPlaying: boolean;
  magnetEnabled: boolean;
  pixelsPerSecond: number;
  playbackRange: VideoEditorPlaybackRange | null;
  project: VideoProject;
  recordingTelemetry: RecordingTelemetryEntry | null;
  selectedClipId: string | null;
  selectedTrackId: string | null;
  selection: VideoEditorSelection;
  telemetryLaneVisible: boolean;
  timelinePreviews: VideoEditorRuntimeController['timelinePreviews'];
}

interface VideoEditorTimelineActions {
  insertion: VideoEditorInsertionActions & {
    onUnsupportedFileDrop: () => void;
  };
  onClearPlaybackRange: VideoEditorWorkspaceState['clearPlaybackRange'];
  onAddTrackLogicalLane: VideoEditorProjectActions['addTrackLogicalLane'];
  onDeleteSelectedClip: () => void;
  onDeleteSelectedTimelineObject: () => void;
  onDeleteTrack: (trackId: string) => void;
  onToggleUtilityLaneVisibility: VideoEditorProjectActions['toggleUtilityLaneVisibility'];
  onToggleUtilityLaneLock: VideoEditorProjectActions['toggleUtilityLaneLock'];
  onClearUtilityLane: VideoEditorProjectActions['clearUtilityLane'];
  onDuplicateSelectedClip: () => void;
  onUpdateSelectedClipPlaybackRate: (playbackRate: number) => void;
  onAutoTransformRecording: (settings: VideoAutoProcessingSettings) => void;
  onMoveActionEvent: (actionEventId: string, time: number) => void;
  onCloseTrackGap: VideoEditorProjectActions['closeTrackGap'];
  onMoveClip: VideoEditorProjectActions['moveClip'];
  onRenameTrack: VideoEditorProjectActions['renameTrack'];
  onMoveCursorSegment: (
    sampleId: string,
    nextSampleId: string | null,
    startTime: number,
    endTime: number | null
  ) => void;
  onMoveMotionRegion: (motionRegionId: string, startTime: number) => void;
  onMoveTrack: VideoEditorProjectActions['moveTrack'];
  onMoveTransitionSegment: (transitionId: string, startTime: number) => void;
  onResizeActionEvent: (actionEventId: string, duration: number) => void;
  onResizeMotionRegion: (motionRegionId: string, startTime: number, duration: number) => void;
  onUpdateEffectInstance: VideoEditorProjectActions['updateEffectInstance'];
  onSeek: VideoEditorRuntimeController['seekTo'];
  onSeekToStart: () => void;
  onSelectActionSegment: VideoEditorSessionActions['selectActionSegment'];
  onSelectClip: VideoEditorSessionActions['selectClip'];
  onSelectCursorSegment: VideoEditorSessionActions['selectCursorSegment'];
  onSelectMotionRegion: VideoEditorSessionActions['selectMotionRegion'];
  onSelectObjectTrack: VideoEditorSessionActions['selectObjectTrack'];
  onSelectScene: VideoEditorSessionActions['selectScene'];
  onSelectTrack: VideoEditorSessionActions['selectTrack'];
  onSelectTransition: VideoEditorSessionActions['selectTransition'];
  onSetPlaybackRange: VideoEditorWorkspaceState['setPlaybackRange'];
  onSplitSelectedClip: () => void;
  onToggleTelemetryLaneVisibility: () => void;
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
