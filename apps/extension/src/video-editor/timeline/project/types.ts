import type { VideoEditorProjectActions } from '../../contracts/commands/project';
import type { AutoProcessingActions } from '../../project/operations/auto-transform';
import type { RecordingTelemetryEntry } from '../../../composition/persistence/recordings/contracts';
import type {
  VideoBlockKind,
  VideoProject,
  VideoProjectActionPreset,
  VideoProjectClip,
  VideoProjectShapeType,
} from '../../../features/video/project/types';
import type { VideoProjectUtilityLaneKind } from '../../../features/video/project/utility-lanes';
import type { VideoEditorPlaybackRange } from '../../interaction/playback/range';
import type { VideoEditorSelection } from '../../contracts/selection';
import type {
  TimelineClipPreviewMap,
  TimelinePreviewViewport,
} from '../../contracts/timeline-preview';
import type { VideoEditorImportPlacement } from '../../contracts/insertion';
import type { VideoProjectEffectInstancePatch } from '../../contracts/commands/patches';
import type { VideoProjectEffectTarget } from '../../../features/video/project/effect-instance/types';
import type { VideoEditorEffectDocumentDragPayload } from '../../contracts/effect-document-drag';
import type { VideoEditorProjectHistoryTransactionActions } from '../../contracts/commands/history';
import type {
  VideoEditorMoveClipAction,
  VideoEditorTrimClipAction,
} from '../../contracts/commands/timeline';

export interface ProjectTimelineInsertionActions {
  onAddActionEvent: (preset: VideoProjectActionPreset) => void;
  onAddMotionRegion: (startTime?: number) => void;
  onAddVideoBlock?: (blockKind: VideoBlockKind) => void;
  onAddShapeOverlay: (shapeType: VideoProjectShapeType) => void;
  onAddSubtitleOverlay?: () => void;
  onAddTextOverlay: () => void;
  onAddTrack: VideoEditorProjectActions['addTrack'];
  onEnableCursorTrack: () => void;
  onImport: {
    audio: (file: File, placement?: VideoEditorImportPlacement) => void | Promise<void>;
    image: (file: File, placement?: VideoEditorImportPlacement) => void | Promise<void>;
    video: (file: File, placement?: VideoEditorImportPlacement) => void | Promise<void>;
  };
  onUnsupportedFileDrop: () => void;
}

export interface TimelineClipRevealRequest {
  clipId: string;
  serial: number;
}

export interface ProjectTimelineProps {
  revealClipRequest?: TimelineClipRevealRequest | undefined;
  canDeleteSelectedClip: boolean;
  canEditSelectedClip: boolean;
  canSplitSelectedClip: boolean;
  historyTransaction: VideoEditorProjectHistoryTransactionActions;
  project: VideoProject;
  currentTime: number;
  pixelsPerSecond: number;
  isPlaying: boolean;
  isPreparingPlayback?: boolean | undefined;
  insertion: ProjectTimelineInsertionActions;
  magnetEnabled: boolean;
  playbackRange: VideoEditorPlaybackRange | null;
  recordingTelemetry: readonly RecordingTelemetryEntry[];
  selection: VideoEditorSelection;
  selectedClipId: string | null;
  selectedTrackId: string | null;
  timelinePreviews: TimelineClipPreviewMap;
  onSeekToEnd: () => void;
  onSeekToStart: () => void;
  onTogglePlay: () => void;
  onClearPlaybackRange: () => void;
  onStepToNextFrame: () => void;
  onStepToPreviousFrame: () => void;
  onSeek: (time: number) => void;
  onZoomChange: (value: number) => void;
  onSetPlaybackRange: (range: VideoEditorPlaybackRange | null) => void;
  onSelectScene: () => void;
  onSelectClip: (clipId: string | null, intent?: 'replace' | 'toggle' | 'range') => void;
  onSelectTrack: (trackId: string | null) => void;
  onSelectTransition: (transitionId: string) => void;
  onDropEffectDocument?: (
    payload: VideoEditorEffectDocumentDragPayload,
    target: VideoProjectEffectTarget,
    startTime: number,
    trackId?: string,
    timelineLaneId?: string | null
  ) => void;
  onSelectCursorSegment: (sampleId: string) => void;
  onSelectHistorySpan?: (
    target: import('../../contracts/commands/timeline').VideoEditorTypingSpanTarget
  ) => void;
  onSelectActionOccurrence: (eventId: string, clipId: string | null) => void;
  onSelectHistoryLane?: (() => void) | undefined;
  onSelectMotionLane?: (() => void) | undefined;
  onSelectMotionRegion: (motionRegionId: string, part?: 'connection') => void;
  onConnectMotionRegions?: ((fromRegionId: string, toRegionId: string) => void) | undefined;
  onSelectObjectTrack: (objectTrackId: string) => void;
  onSwapClip: (clipId: string, direction: 'left' | 'right') => void;
  onMoveClip: VideoEditorMoveClipAction;
  onCloseTrackGap: (trackId: string, gapStart: number, gapEnd: number) => void;
  onAddTrackLogicalLane: (trackId: string) => void;
  onRenameTrack: (trackId: string, name: string) => void;
  onTrimClipStart: VideoEditorTrimClipAction;
  onTrimClipEnd: VideoEditorTrimClipAction;
  onSplitSelectedClip: () => void;
  onDuplicateSelectedClip: () => void;
  onDeleteSelectedClip: () => void;
  onUpdateSelectedClipPlaybackRate: (playbackRate: number) => void;
  autoProcessing: AutoProcessingActions;
  onAutoProcessingModalVisibilityChange: (open: boolean) => void;
  onDeleteSelectedTimelineObject: () => void;
  onToggleUtilityLaneVisibility: (lane: VideoProjectUtilityLaneKind) => void;
  onToggleUtilityLaneLock: (lane: VideoProjectUtilityLaneKind) => void;
  onClearUtilityLane: (lane: VideoProjectUtilityLaneKind) => void;
  onMoveCursorSegment: (
    sampleId: string,
    nextSampleId: string | null,
    startTime: number,
    endTime: number | null
  ) => void;
  onMoveTransitionSegment: (transitionId: string, startTime: number) => void;
  onMoveActionOccurrence?:
    | ((eventId: string, clipId: string | null, time: number) => void)
    | undefined;
  onMoveMotionRegion: (motionRegionId: string, startTime: number) => void;
  onResizeMotionRegion: (motionRegionId: string, startTime: number, duration: number) => void;
  onUpdateEffectInstance: (instanceId: string, patch: VideoProjectEffectInstancePatch) => void;
  onToggleTrackVisibility: (trackId: string) => void;
  onToggleTrackLock: (trackId: string) => void;
  onTimelinePreviewSuspendedChange: (suspended: boolean) => void;
  onTimelinePreviewViewportChange: (viewport: TimelinePreviewViewport) => void;
}

export type DragMode = 'move' | 'trim-start' | 'trim-end';
type EffectLaneKind = 'transition' | 'cursor' | 'motion' | 'effect-instance' | 'action';

export interface TimelineEffectSelection {
  kind: EffectLaneKind;
  segmentId: string;
}

/** Transient timeline geometry; the project changes only when the gesture commits. */
export interface TimelineEffectDragDraft {
  segmentId: string;
  cursorSampleTimes?: {
    sampleId: string;
    nextSampleId: string | null;
    startTime: number;
    endTime: number | null;
  };
  startTime?: number;
  duration?: number;
}

export type TimelineEffectDragTarget =
  | {
      kind: 'action';
      eventId: string;
      clipId: string | null;
      segmentId: string;
      originalStart: number;
      minimumTime: number;
      maximumTime: number;
    }
  | {
      kind: 'cursor';
      segmentId: string;
      sampleId: string;
      nextSampleId: string | null;
      originalStart: number;
      originalEnd: number;
      previousBoundary: number;
      nextBoundary: number;
    }
  | {
      kind: 'transition';
      mode: 'move' | 'resize-start';
      segmentId: string;
      /** @deprecated compatibility for older tests and helpers. */
      clipId?: string;
      transitionId?: string;
      originalStart: number;
    }
  | {
      kind: 'motion';
      motionRegionId: string;
      mode: 'move' | 'resize-start' | 'resize-end';
      originalDuration: number;
      originalStart: number;
      segmentId: string;
    }
  | {
      instanceId: string;
      kind: 'effect-instance';
      movable: boolean;
      originalStart: number;
      segmentId: string;
      target: VideoProjectEffectTarget;
    };

export interface TimelineInteraction {
  mode: DragMode;
  clip: VideoProjectClip;
  originalStart: number;
  originalEnd: number;
  originalTrackId: string;
  startClientX: number;
  startClientY: number;
}

export interface TimelineClipDragPlacement {
  clipId: string;
  duration: number;
  name: string;
  startTime: number;
  timelineLaneId: string | null;
  trackId: string;
}

export interface TimelineClipReorderSlot {
  direction: 'left' | 'right';
  startTime: number;
  neighborName: string;
}

export interface TimelineClipDragGhost extends TimelineClipDragPlacement {
  reorderSlots?: TimelineClipReorderSlot[];
  activeReorder?: 'left' | 'right';
  relatedClips?: TimelineClipDragPlacement[];
}

export interface AudioClipWaveformProps {
  envelopeEnd: number;
  envelopeStart: number;
  peaks: number[];
  muted: boolean;
}
