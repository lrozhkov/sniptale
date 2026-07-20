import type { RecordingTelemetryEntry } from '../../../composition/persistence/recordings/contracts';
import type {
  VideoBlockKind,
  VideoProject,
  VideoProjectActionPreset,
  VideoProjectClip,
  VideoProjectShapeType,
  VideoTrackKind,
} from '../../../features/video/project/types';
import type { VideoAutoProcessingSettings } from '@sniptale/runtime-contracts/video/types/types';
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

export interface ProjectTimelineInsertionActions {
  onAddActionEvent: (preset: VideoProjectActionPreset) => void;
  onAddMotionRegion: (startTime?: number) => void;
  onAddVideoBlock?: (blockKind: VideoBlockKind) => void;
  onAddShapeOverlay: (shapeType: VideoProjectShapeType) => void;
  onAddSubtitleOverlay?: () => void;
  onAddTextOverlay: () => void;
  onAddTrack: (kind?: VideoTrackKind) => void;
  onEnableCursorTrack: () => void;
  onImport: {
    audio: (file: File, placement?: VideoEditorImportPlacement) => void | Promise<void>;
    image: (file: File, placement?: VideoEditorImportPlacement) => void | Promise<void>;
    video: (file: File, placement?: VideoEditorImportPlacement) => void | Promise<void>;
  };
  onUnsupportedFileDrop: () => void;
}

export interface ProjectTimelineProps {
  project: VideoProject;
  currentTime: number;
  pixelsPerSecond: number;
  isPlaying: boolean;
  insertion: ProjectTimelineInsertionActions;
  magnetEnabled: boolean;
  playbackRange: VideoEditorPlaybackRange | null;
  recordingTelemetry: RecordingTelemetryEntry | null;
  selection: VideoEditorSelection;
  selectedClipId: string | null;
  selectedTrackId: string | null;
  telemetryLaneVisible: boolean;
  timelinePreviews: TimelineClipPreviewMap;
  onSeek: (time: number) => void;
  onSeekToStart: () => void;
  onZoomChange: (value: number) => void;
  onTogglePlay: () => void;
  onSetPlaybackRange: (range: VideoEditorPlaybackRange | null) => void;
  onClearPlaybackRange: () => void;
  onToggleTelemetryLaneVisibility: () => void;
  onSelectScene: () => void;
  onSelectClip: (clipId: string | null) => void;
  onSelectTrack: (trackId: string | null) => void;
  onSelectTransition: (transitionId: string) => void;
  onDropEffectDocument?: (
    payload: VideoEditorEffectDocumentDragPayload,
    target: VideoProjectEffectTarget,
    startTime: number
  ) => void;
  onSelectCursorSegment: (sampleId: string) => void;
  onSelectActionSegment: (actionEventId: string) => void;
  onSelectMotionRegion: (motionRegionId: string) => void;
  onSelectObjectTrack: (objectTrackId: string) => void;
  onMoveClip: (
    clipId: string,
    startTime: number,
    trackId?: string,
    timelineLaneId?: string | null
  ) => void;
  onCloseTrackGap: (trackId: string, gapStart: number, gapEnd: number) => void;
  onAddTrackLogicalLane: (trackId: string) => void;
  onRenameTrack: (trackId: string, name: string) => void;
  onTrimClipStart: (clipId: string, nextStartTime: number) => void;
  onTrimClipEnd: (clipId: string, nextEndTime: number) => void;
  onSplitSelectedClip: () => void;
  onDuplicateSelectedClip: () => void;
  onDeleteSelectedClip: () => void;
  onUpdateSelectedClipPlaybackRate: (playbackRate: number) => void;
  onAutoTransformRecording: (settings: VideoAutoProcessingSettings) => void;
  onDeleteSelectedTimelineObject: () => void;
  onDeleteTrack: (trackId: string) => void;
  onMoveTrack: (trackId: string, direction: 'up' | 'down') => void;
  onToggleUtilityLaneVisibility: (lane: VideoProjectUtilityLaneKind) => void;
  onToggleUtilityLaneLock: (lane: VideoProjectUtilityLaneKind) => void;
  onClearUtilityLane: (lane: VideoProjectUtilityLaneKind) => void;
  onMoveActionEvent: (actionEventId: string, time: number) => void;
  onResizeActionEvent: (actionEventId: string, duration: number) => void;
  onMoveCursorSegment: (
    sampleId: string,
    nextSampleId: string | null,
    startTime: number,
    endTime: number | null
  ) => void;
  onMoveTransitionSegment: (transitionId: string, startTime: number) => void;
  onMoveMotionRegion: (motionRegionId: string, startTime: number) => void;
  onResizeMotionRegion: (motionRegionId: string, startTime: number, duration: number) => void;
  onUpdateEffectInstance: (instanceId: string, patch: VideoProjectEffectInstancePatch) => void;
  onToggleTrackVisibility: (trackId: string) => void;
  onToggleTrackLock: (trackId: string) => void;
  onTimelinePreviewSuspendedChange: (suspended: boolean) => void;
  onTimelinePreviewViewportChange: (viewport: TimelinePreviewViewport) => void;
}

export type DragMode = 'move' | 'trim-start' | 'trim-end';
type EffectLaneKind = 'transition' | 'cursor' | 'action' | 'motion' | 'effect-instance';

export interface TimelineEffectSelection {
  kind: EffectLaneKind;
  segmentId: string;
}

export type TimelineEffectDragTarget =
  | {
      kind: 'action';
      mode: 'move' | 'resize-end';
      segmentId: string;
      actionEventId: string;
      originalDuration: number;
      originalTime: number;
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

export interface TimelineClipDragGhost {
  clipId: string;
  duration: number;
  name: string;
  startTime: number;
  timelineLaneId: string | null;
  trackId: string;
}

export interface AudioClipWaveformProps {
  envelopeEnd: number;
  envelopeStart: number;
  peaks: number[];
  muted: boolean;
}
