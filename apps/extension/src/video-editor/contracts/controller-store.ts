import type { RecordingTelemetryEntry } from '../../composition/persistence/recordings/contracts';
import type { VideoProject } from '../../features/video/project/types/index';
import type { VideoEditorAnnotationActions } from './commands/annotation';
import type { VideoEditorEffectInstanceActions } from './commands/effect-instance';
import type {
  VideoEditorProjectHistoryActions,
  VideoEditorProjectHistoryStatus,
} from './commands/history';
import type { VideoEditorObjectTrackActions } from './commands/object-tracks';
import type { VideoEditorProjectActions } from './commands/project';
import type { VideoEditorSessionActions } from './commands/session';
import type { VideoEditorTemporalActions } from './commands/temporal';
import type { VideoEditorExportActions } from './commands/export';
import type { VideoEditorExportRuntimeState } from './export-state';
import type { VideoEditorPlacementMode } from './placement';
import type { VideoEditorSaveState } from './session-state';
import type { VideoEditorSelection } from './selection';

/** Playback state and transport mutations exposed by the Zustand adapter. */
export interface PlaybackPort extends Pick<
  VideoEditorSessionActions,
  'setCurrentTime' | 'setPlaying' | 'togglePlaying'
> {
  currentTime: number;
  isPlaying: boolean;
}

type TimelineTrackAction =
  | 'addTrackLogicalLane'
  | 'addTrack'
  | 'deleteTrack'
  | 'moveTrack'
  | 'renameTrack'
  | 'toggleTrackVisibility'
  | 'toggleTrackLock'
  | 'toggleUtilityLaneVisibility'
  | 'toggleUtilityLaneLock'
  | 'clearUtilityLane';

type TimelineClipAction =
  | 'upsertAsset'
  | 'addAssetClip'
  | 'addVideoBlock'
  | 'moveClip'
  | 'trimClipStart'
  | 'trimClipEnd'
  | 'splitClipAt'
  | 'deleteClip'
  | 'duplicateClip'
  | 'detachClipGroup'
  | 'closeTrackGap'
  | 'updateClipTransform'
  | 'updateClipMuted'
  | 'updateClipVolume'
  | 'updateClipAudioEnvelope'
  | 'updateClipFades'
  | 'updateClipTransitions'
  | 'updateClipPlaybackRate'
  | 'updateMediaClipFitMode'
  | 'updateMediaClipFitScalePercent'
  | 'updateMediaClipShadowIntensity'
  | 'updateMediaClipShadowMode'
  | 'applyMediaClipVisualsToTrack';

type TimelineObjectTrackAction = Exclude<
  keyof VideoEditorObjectTrackActions,
  'startObjectTrackAnchorPlacement'
>;

/** Timeline, track, clip, temporal, and object-track editing capability. */
export interface TimelineEditingPort
  extends
    Pick<VideoEditorProjectActions, TimelineTrackAction | TimelineClipAction>,
    VideoEditorTemporalActions,
    Pick<VideoEditorObjectTrackActions, TimelineObjectTrackAction>,
    Pick<VideoEditorSessionActions, 'setPixelsPerSecond' | 'updateProject'> {
  pixelsPerSecond: number;
}

type SelectionAction =
  | 'selectScene'
  | 'selectTrack'
  | 'selectClip'
  | 'selectTransition'
  | 'selectCursorSegment'
  | 'selectObjectTrack'
  | 'selectActionSegment'
  | 'selectMotionRegion';

/** Selection state and selection mutations. */
export interface ClipSelectionPort extends Pick<VideoEditorSessionActions, SelectionAction> {
  selectedClipId: string | null;
  selectedTrackId: string | null;
  selection: VideoEditorSelection;
}

/** Declarative effect-document and effect-instance editing capability. */
export interface EffectEditingPort extends VideoEditorEffectInstanceActions {}

type AnnotationPresentationAction =
  | 'addTextOverlay'
  | 'addSubtitleOverlay'
  | 'addShapeOverlay'
  | 'updateTextClipContent'
  | 'updateTextClipStyle'
  | 'updateSubtitleTrackStyle'
  | 'updateShapeClipStyle';

/** Annotation, text, subtitle, and shape editing capability. */
export interface AnnotationEditingPort
  extends
    VideoEditorAnnotationActions,
    Pick<VideoEditorProjectActions, AnnotationPresentationAction> {}

/** Project history status, transaction, undo, and redo capability. */
export interface HistoryPort extends VideoEditorProjectHistoryActions {
  projectHistoryStatus: VideoEditorProjectHistoryStatus;
  projectHistoryTransactionActive: boolean;
}

/** Export dialog and active export-job capability. */
export interface ExportPort extends VideoEditorExportActions {
  exportState: VideoEditorExportRuntimeState;
}

type ProjectLifecycleAction =
  | 'setProject'
  | 'syncProjectRevision'
  | 'setReady'
  | 'setError'
  | 'setSaveState';

/** Active project identity, readiness, save state, and lifecycle mutations. */
export interface ProjectLifecyclePort
  extends
    Pick<VideoEditorSessionActions, ProjectLifecycleAction>,
    Pick<VideoEditorProjectActions, 'renameProject'> {
  error: string | null;
  isReady: boolean;
  project: VideoProject | null;
  recordingId: string | null;
  saveState: VideoEditorSaveState;
}

type PlacementAction =
  | 'clearPlacementMode'
  | 'startActionPointPlacement'
  | 'startMotionFocusPlacement'
  | 'startMotionAreaPlacement'
  | 'startMotionPathStopAreaPlacement'
  | 'startMotionPathStopPointPlacement';

/** Point-authoring and placement-mode capability. */
export interface RuntimeSessionPort
  extends
    Pick<VideoEditorSessionActions, PlacementAction>,
    Pick<VideoEditorObjectTrackActions, 'startObjectTrackAnchorPlacement'> {
  placementMode: VideoEditorPlacementMode | null;
}

/** Diagnostics visibility and recording telemetry capability. */
export interface DiagnosticsTelemetryPort extends Pick<
  VideoEditorSessionActions,
  'setDiagnosticsOpen' | 'setRecordingTelemetry' | 'toggleTelemetryLaneVisibility'
> {
  diagnosticsOpen: boolean;
  recordingTelemetry: RecordingTelemetryEntry | null;
  telemetryLaneVisible: boolean;
}

export interface VideoEditorProjectStorageStatus {
  projectUpdatedAt: number | null;
  saveState: VideoEditorSaveState;
}
